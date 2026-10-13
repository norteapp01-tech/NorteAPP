# Google Agenda — sincronização bidirecional (Fase 2)

O Norte sincroniza com o Google Agenda nos dois sentidos: o que está no Google
aparece no Norte, e o que é criado, editado, reagendado, cancelado ou excluído no
Norte vai para o Google. Este documento descreve a arquitetura, como publicar e
os limites conhecidos.

## Como funciona

```
Navegador ──(sessão do Norte)──► google-calendar (Edge Function) ──► Google Calendar API
Google ──(webhook)──► google-calendar-webhook ─┐
banco (pg_cron, 5 min) ──► google-calendar-cron ┴─► motor de sincronização ──► banco (service role)
Google ──(redirect OAuth)──► google-calendar-oauth/callback
```

- **Navegador** só LÊ (conexão, agendas, vínculos, conflitos — RLS) e só AGE chamando
  `google-calendar`. Tokens e segredos nunca chegam a ele.
- **Fila de saída:** gatilhos do banco registram em `agenda_sync_outbox` o que mudou
  (criar/editar/apagar compromissos e séries) — só para quem tem o Google conectado.
  A Edge Function envia ao Google. Falhas usam espera progressiva e continuam sendo
  tentadas; depois de repetirem, ficam visíveis nas configurações com a ação
  **Tentar novamente agora** — nunca desaparecem silenciosamente.
- **Sem ciclos nem duplicação:** cada evento tem um vínculo em `agenda_external_links`
  com o id do Google, o `etag` e o `synced_hash` (hash do último conteúdo em que os dois
  lados concordaram). Conteúdo igual ao hash = não mudou (inclusive o "eco" do que o
  próprio Norte enviou). Eventos criados pelo Norte levam `norteId` no Google, o que
  permite religar em vez de duplicar. Na primeira conexão, compromissos iguais (título,
  dia e hora) nos dois lados são ligados, não duplicados.
- **Conflito:** se os dois lados mudaram e divergem, nada é sobrescrito: o vínculo vira
  `conflict`, os dois conteúdos ficam guardados e a pessoa escolhe (Norte ou Google).
  Também vale para "apagado no Google, editado no Norte". O envio usa `If-Match` (etag).
- **Incremental:** `events.list` com `nextSyncToken` (token vencido → recomeça do zero e
  confere o que sumiu), webhooks (`events.watch`) e o cron a cada 5 min como segurança.

## OAuth e segurança

1. O app pede `oauth-start` (logado). A função grava um `state` assinado (HMAC), de uso
   único e com validade de 10 min, e devolve a URL do Google.
2. O Google chama `google-calendar-oauth/callback`. O `state` é verificado (assinatura,
   validade, consumo atômico do nonce, origem permitida). Os tokens são criptografados
   (AES-256-GCM) e ficam sob um **bilhete** — ainda não valem como conexão.
3. O navegador volta para `/agenda?google_ticket=…` e chama `oauth-complete` **com a sessão
   do Norte**. O bilhete só é aceito para a MESMA pessoa que iniciou. Isso impede ligar a
   conta Google de alguém à conta Norte de outra (login CSRF).
4. Tokens vivem em `google_calendar_tokens`, sem nenhuma policy (só a service role). Escopos
   pedidos: `openid`, `email`, `calendar.events`, `calendar.calendarlist.readonly`.
5. Webhooks: o canal é validado por id + recurso + token (guardado só como SHA-256).
6. Agenda somente leitura: espelhada no Norte e protegida também no banco (gatilho
   `agenda_guard_read_only`).

## O que é sincronizado

Título, início/fim, dia inteiro, fuso horário, local, observação (descrição), status
(cancelado/excluído), recorrência (RRULE: diária, semanal com dias e intervalo, mensal por
dia do mês, anual, fim por data ou quantidade), exceções (EXDATE e ocorrências alteradas ou
canceladas) e o link do Google Meet (Google → Norte).

Eventos criados no Norte vão para a agenda marcada como destino. Rotinas do Norte
(academia, leitura…) só vão ao Google se a pessoa ligar essa opção.

## Publicar

Pré-requisitos já feitos: projeto Google Cloud, OAuth, segredos das Edge Functions
(`GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`,
`GOOGLE_CALENDAR_STATE_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `APP_URL`).
Opcional: `GOOGLE_ALLOWED_APP_ORIGINS` (origens extras, separadas por vírgula; padrão
`http://localhost:8080`).

```bash
supabase login            # ou: export SUPABASE_ACCESS_TOKEN=...
supabase functions deploy google-calendar google-calendar-oauth google-calendar-webhook google-calendar-cron \
  --project-ref yorlxyoixeeqlcjrwasf
node scripts/check-google-calendar-deploy.mjs   # confere que tudo está no ar
```

As migrações `0056` (tabelas, gatilhos, RLS), `0057` (cron de 5 minutos) e `0058`
(fila resiliente, trava e rodízio do cron) já fazem parte de `supabase/migrations`.
`verify_jwt = false` está em `supabase/config.toml` para as três funções
que não recebem a sessão de uma pessoa (callback, webhook e cron).

## Checklist antes de abrir para o público

- Publicar as migrações, as quatro Edge Functions e o frontend a partir do mesmo commit.
- Rodar `node scripts/check-google-calendar-deploy.mjs` depois da publicação.
- No Google Auth Platform, confirmar o app como **In production**, os domínios autorizados,
  a política de privacidade, os termos e a verificação dos escopos sensíveis. Em modo Testing,
  o refresh token de um app externo com escopos de Agenda pode expirar em sete dias.
- Usar uma conta Google exclusiva de homologação para validar o ciclo completo: conectar,
  criar/editar/mover/excluir nos dois lados, recorrência, conflito, desconexão e reconexão.
- Conferir no Supabase que o job `google-calendar-sync` está ativo e executando a cada 5 minutos.

## Limites conhecidos

- **Webhook em `supabase.co`:** o Google costuma exigir que o domínio do endereço de webhook
  esteja verificado no Google Cloud. Se recusar, a agenda mostra "atualização em tempo real
  indisponível" e a sincronização segue pela verificação periódica (a cada 5 min) e quando o
  app abre ou volta ao primeiro plano.
- **Repetições que o Norte não representa** (ex.: "segunda semana do mês", BYSETPOS, RDATE)
  entram como evento único, somente leitura.
- **Eventos de vários dias** (mais de 24 h) entram como uma sessão por dia, somente leitura.
- **Link:** só o Meet/origem vem do Google. Um link digitado no Norte vai ao Google apenas
  na criação do evento (não é comparado, para não gerar conflito por eco).
- **Concluir** um compromisso é um conceito do Norte: não é enviado ao Google.
- Ocorrência recorrente em fuso diferente do Norte: o dia da semana acompanha a mudança de
  dia, mas diferenças de horário de verão entre fusos não são recalculadas.
