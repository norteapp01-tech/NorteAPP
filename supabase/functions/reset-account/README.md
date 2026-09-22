# Ativação dos controles de conta

O código da interface sozinho não ativa as ações destrutivas em produção. No projeto
Supabase conectado ao Norte, aplique as migrações e publique as duas funções:

```sh
supabase db push
supabase functions deploy reset-account
supabase functions deploy delete-account
```

Configure as variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
`SUPABASE_SERVICE_ROLE_KEY` como segredos das funções. Nunca exponha a
`SUPABASE_SERVICE_ROLE_KEY` no frontend.

Teste com uma conta descartável contendo treino, rota, foto, capa de livro,
imagem de meta financeira, registros de fé e assinatura. Confirme que:

- Reset remove conteúdo e arquivos, mas preserva login e cobrança.
- Exclusão remove identidade, conteúdo e arquivos; depois o aparelho volta à
  tela de boas-vindas.
- Falhas de rede ou permissões são mostradas sem declarar conclusão.

A página pública `/excluir-conta` deve ser usada como URL de solicitação externa
na ficha da Google Play. Antes da publicação, revise as páginas legais com
assessoria jurídica e confirme as práticas reais de retenção dos provedores.
