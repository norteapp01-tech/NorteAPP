# dispatch-reminders

Despacha Web Push de lembretes vencidos nas últimas 24 horas e ainda não
avisados. Não é chamada pelo app — só pelo agendador da plataforma.
Exige a migração **0069_push_delivery_receipts.sql** antes do deploy.

Cada lembrete recebe uma reserva temporária de 5 minutos. Recibos por
dispositivo evitam reenviar a aparelhos que já aceitaram o push enquanto outro
aparelho está falhando. Sem aparelho, não marca entrega e tenta novamente em
uma hora; erros transitórios tentam novamente em um minuto. Um push aceito pelo
provedor não comprova que a pessoa o leu. Há uma janela inevitável entre enviar
o push e salvar o recibo; a tag estável permite ao navegador agrupar repetições.

## Deploy (precisa do Supabase CLI autenticado — não roda daqui)

```bash
supabase login
supabase link --project-ref yorlxyoixeeqlcjrwasf
# Confira o histórico do banco e aplique as migrações pendentes revisadas.
# Não execute db push indiscriminadamente: 0062 também precisa de revisão.
supabase functions deploy dispatch-reminders
```

## Secrets da function

```bash
supabase secrets set VAPID_PUBLIC_KEY=BEEy03ZpT62BTxCDWurB1F4HaHU0W1Oz0E97c0O9dFomXoeigNViYTp5ApaHRTLw3M97azpkY-N_E4wcGl78mT4
supabase secrets set VAPID_PRIVATE_KEY=<a chave privada gerada junto — nunca commitada, só entregue diretamente>
supabase secrets set VAPID_SUBJECT=mailto:contato@norteapp.com.br
supabase secrets set CRON_SECRET=<qualquer string aleatória — usada só pra header Authorization do próprio agendamento>
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem automaticamente em
toda function do projeto — não precisam ser setadas.

## Agendamento — dois caminhos, use o que estiver disponível no projeto

**Caminho A — Cron nativo do Dashboard** (Edge Functions → dispatch-reminders
→ aba Cron): agende `* * * * *` (a cada minuto), com o header
`Authorization: Bearer <CRON_SECRET>`.

**Caminho B — `pg_cron` + `pg_net`** (se o Caminho A não estiver disponível
no plano do projeto), rodando no SQL Editor:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'dispatch-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://yorlxyoixeeqlcjrwasf.functions.supabase.co/dispatch-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
```

## Teste manual (depois do deploy)

```bash
curl -i -X POST \
  -H "Authorization: Bearer <CRON_SECRET>" \
  https://yorlxyoixeeqlcjrwasf.functions.supabase.co/dispatch-reminders
```

Resposta esperada: `{"sent":0,"failed":0,"noDevice":0}`. Falha parcial retorna
207 e deixa o lembrete pendente. 401 indica credencial incorreta; 503 indica
configuração ausente ou inválida. A função exige POST e nunca abre o acesso
quando CRON_SECRET não está configurado.

Esta função entrega a tabela `reminders`. Não renova, sozinha, a janela de
ocorrências de hábitos nem executa briefing/fechamento diário; esses trabalhos
ainda precisam de um agendador de hábitos no servidor. Não considerar o push
validado até executar um teste real em um aparelho inscrito.
