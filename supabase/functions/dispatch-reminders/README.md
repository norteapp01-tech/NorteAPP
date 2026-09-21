# dispatch-reminders

Despacha como Web Push todo lembrete com `remind_at` vencido e ainda não
avisado. Não precisa ser chamada pelo app — só pelo agendador da plataforma.

## Deploy (precisa do Supabase CLI autenticado — não roda daqui)

```bash
supabase login
supabase link --project-ref yorlxyoixeeqlcjrwasf
supabase db push                      # aplica 0047_reminders_push.sql
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

Resposta esperada: `{"sent":0,"errors":[]}` (ou `sent` > 0 se havia lembrete
vencido). Um 401 indica `CRON_SECRET` errado ou ausente.
