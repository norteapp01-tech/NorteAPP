# Rotinas (hábitos) — estado da implementação

Atualizado em 2026-11-11. Branch `main`. Fonte do escopo: `PLANO-NORTE-HABITIFY-CLAUDE-CODE.md`.

## Commits

| Commit | Conteúdo | GitHub |
|---|---|---|
| `b3f3ac8` | Modelo de dados (migração 0063) e motor de regras puro | **não enviado** |
| `0b23b69` | Tela Rotinas, camada de dados, vínculo com módulos, Espelho, ferramentas do agente | **não enviado** |
| `80d4553` | Lembretes encadeados, toast em portal, ajustes de layout (migração 0064) | **não enviado** |
| `cd88b40` | Motor de efeitos (cadeia por transição de estado, silêncio, ocorrências de lembrete), fila persistente de módulos, timer/lembretes atômicos (migração 0065) | **não enviado** |
| `13fe8c9` | Home abre registro rápido/timer no lugar; Espelho separa cumprimento, cobertura e adesão | **não enviado** |

O push falhou por falta de autenticação nesta sessão. Comando: `git push origin main` (histórico não foi reescrito; `origin/main` não andou).

## Migrações

| Migração | Estado verificado |
|---|---|
| 0062_plan_flow | **Não aplicada** no banco de produção (tabelas `plans/plan_phases/plan_steps` ausentes via API; pertence a outra sessão). Não publicar `main` (contém `de290de`) sem aplicá-la. |
| 0063_habits_core | Aplicada (tabelas e RPCs respondem). |
| 0064_reminders_habit_origin | Aplicada (inserção com `origin='habit_reminder'` aceita). |
| **0065_habit_effects** | **Escrita, NÃO aplicada.** Sem credencial de banco nesta sessão (`PGPASSWORD`/token ausentes). O código dos commits `cd88b40`+ depende dela (`finish_habit_timer`, `sync_module_habits`, `set_habit_reminders`, `cancel_habit_effects`, colunas em `reminders`, `habit_settings`). **Não publicar o site antes de aplicá-la.** |

Como aplicar: `node ~/.cache/norte-db/apply.mjs supabase/migrations/0065_habit_effects.sql --dry` e depois sem `--dry` (com `PGPASSWORD` definido). É aditiva; não remove dados.

## Decisões

- Evento de log + versões de meta datadas; o passado nunca é reescrito.
- Ausência de registro ≠ falha. Espelho agora separa: **cumprimento registrado** (cumpridos ÷ dias com resultado informado), **cobertura** (dias informados ÷ dias avaliáveis) e **adesão ao planejado** (ausência conta como não cumprido; só nomeada assim).
- Encadeamento "feito" só dispara na **transição** de estado da meta (100 ml de 2 L não dispara; o registro que atinge a meta dispara uma vez). Redução só "conclui" ao fechar o dia. Registro retroativo não cria aviso. Alvo arquivado/pausado/não programado/já resolvido não recebe aviso. Dedupe por (encadeamento, registro de origem, data do alvo).
- Desfazer/editar cancela avisos **pendentes** gerados pelo registro; avisos já entregues não podem ser recolhidos e a interface informa isso.
- Lembretes por horário: o app materializa 14 dias à frente em `reminders` (origem `habit_reminder`), recalcula ao abrir e após qualquer mudança; pausa, arquivo, dia não programado, rotina já resolvida hoje e horário silencioso são respeitados. Entrega fica a cargo da Edge Function `dispatch-reminders` (Web Push).
- Módulos → rotinas: fila persistente por usuário (localStorage), reenvio ao abrir, ao voltar a rede e a cada minuto; edição na origem atualiza o registro derivado; exclusão o remove.
- Timer: encerrar = gravar registro + remover timer em uma transação com compare-and-set da revisão. A sessão conta no **dia em que foi criada**; a duração é a medida (não o intervalo entre horas).

## Testes — o que foi realmente executado

- Unitários: 963 testes verdes (motor, efeitos, fila, espelho, timer, agente, parser).
- `tsc` e eslint limpos (3 avisos preexistentes de hook/fast-refresh).
- Verificação de esquema em produção via API (0063/0064 presentes; 0062/0065 ausentes).
- Rodadas anteriores (antes da 0065): 26 verificações no banco real e 15/15 de navegador (criar, registrar, desfazer, pausar, encadear, timer com recarga).

**Não executado nesta rodada** (dependem da 0065 aplicada e de credenciais): E2E das RPCs novas, entrega real de push, dois dispositivos, falha de rede na fila, meia-noite/fuso em navegador, conversa real com o agente, duas contas via UI, acessibilidade por teclado, desempenho com muitos hábitos, regressão de módulos. Nenhum desses está marcado como passado.

## Matriz Habitify × Norte

Fontes: ficha do app na App Store (id1111447047) e central de ajuda do Habitify (intercom.help/habitify-app), consultadas em 2026-11-11; pesquisa não esgota todas as páginas. Marcação: **C** confirmado em fonte, **I** inferido, **N** não verificado.

| Funcionalidade (fonte) | Norte | Evidência | Estado | Próximo passo |
|---|---|---|---|---|
| Hábitos com metas diária/semanal/mensal/anual, unidades (C) | Versões de meta datadas, famílias de unidade | engine.test | Validado (unit + DB) | — |
| Registro rápido, vários registros/dia, desfazer (C) | `log_habit`, toast com Desfazer, Home abre sheet no lugar | testes; browser (rodada anterior) | Validado (browser parcial) | Rever Home no browser |
| Timer / foco (C) | Timer por timestamps, cronômetro/contagem/Pomodoro | timer.test; browser | Parcial: encerramento atômico exige 0065 | Aplicar 0065, testar 2 aparelhos |
| Pausa individual/área/global (I) | Pausas excluídas das métricas | engine.test; browser | Validado | — |
| Lembretes por horário (C) | Materialização em `reminders` + dispatch Web Push | effects.test | **Implementado sem validação externa** | Aplicar 0065, deploy da função, teste em aparelho |
| Encadeamento (hábito "depois de") (I) | Cadeias por transição, dedupe, silêncio | effects.test | Implementado; E2E pendente (0065) | idem |
| Estatísticas, calendário, histórico (C) | Detalhe + Espelho (cumprimento/cobertura/adesão) | mirror/engine.test | Validado (unit) | Teste visual |
| Checklist por hábito (I) | Checklist de itens por versão | unit | Implementado | — |
| Áreas/categorias, ordenação (C) | Áreas, reorder | browser (parcial) | Implementado | Configurações dedicadas |
| Horário silencioso, períodos do dia, briefing/fechamento | `habit_settings` (0065) | — | **Pendente** (tabela escrita; sem UI) | UI de preferências |
| Reflexões/humor (I) | Reflexões com busca | browser | Implementado (sem imagens) | Storage protegido p/ imagens |
| Exportação de dados (I) | — | — | **Pendente** | CSV/JSON por usuário |
| Offline com fila de registros (I) | Fila só para módulos; registros manuais exigem rede | outbox.test | **Parcial** | Fila genérica de `log_habit` |
| Agente (Norte-específico) | Ferramentas criar/registrar/pausar/consultar | agent.test | Implementado; conversa real pendente | Teste com OpenAI |
| Apple Health / Health Connect (C: Apple Health, Google Health/Fit) | — | — | **Bloqueado**: exige app nativo (HealthKit/Health Connect), entitlements e dispositivo | App nativo |
| Strava, Fitbit (C na ficha; conflito entre fontes sobre Fitbit) | — | — | **Bloqueado**: OAuth com client id/secret e app aprovado | Credenciais dos provedores |
| Screen Time / RescueTime (C) | — | — | **Bloqueado**: Screen Time é nativo iOS; RescueTime precisa API key | — |
| Google Calendar (C) | Integração existente da Agenda (não alterada) | regressão não reexecutada | Existente; rotinas não criam eventos | Reexecutar regressão |
| Apple Calendar / Outlook (C) | — | — | **Pendente/bloqueado** (OAuth Microsoft; CalDAV) | Credenciais |
| Widgets, Apple Watch, Live Activities, Siri/Atalhos (C widgets/Watch) | — | — | **Bloqueado**: o Norte é web/PWA; exige app nativo | App iOS |
| NFC, IFTTT, Zapier, API (C) | — | — | **Pendente** (API/webhooks não construídos) | Edge Function + chave por usuário |
| Compartilhamento/desafios privados (escopo do plano) | — | — | **Pendente** | Tabelas de convite + RLS |

## Pendências externas exatas

1. Credencial de banco (ou token do Supabase CLI) para aplicar 0065 — e 0062 pelo outro trabalho.
2. Autenticação do GitHub para `git push origin main`.
3. Deploy da Edge Function `dispatch-reminders` atualizada (URL por origem) e confirmação de cron + chaves VAPID.
4. Integrações nativas e OAuth: contas de desenvolvedor Apple/Google, client id/secret de Strava, Fitbit, Microsoft.

Rotacione os tokens que foram colados em conversas anteriores.
