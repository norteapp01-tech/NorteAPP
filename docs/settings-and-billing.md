# Configurações e assinatura

## Entregue
- Página e painel usam a mesma navegação de configurações.
- Perfil usa nome/foto do perfil, com fallback para identidade autenticada; permite salvar nome, nascimento opcional e foto.
- E-mail, verificação e provedores vêm do Supabase Auth.
- Assinatura e cobranças consultam apenas os registros do usuário autenticado.
- Logout local encerra sessão, cancela queries, limpa cache e conversa local; impede saída com gravação esportiva pendente.
- Exclusão fica em Dados e privacidade e reutiliza a função existente delete-account.

## Banco
Aplicar `supabase/migrations/0038_account_billing.sql` no SQL Editor do Supabase antes de usar a área de assinatura. Não foi aplicada remotamente nesta entrega.
A ausência da migração gera erro de consulta com possibilidade de tentar novamente, não uma assinatura fictícia.
Clientes autenticados somente leem suas linhas; gravações exigem backend confiável. Valores em unidades menores da moeda (centavos para BRL).
Não inserir dados ilustrativos em produção.

## Dependências externas
Este repositório não contém gateway. Nenhuma cobrança, upgrade, downgrade, cancelamento web, restauração de compra ou franquia de IA é simulada.
A comparação de planos é consultiva; contratar permanece indisponível.
Para concluir monetização: configurar provedor; criar checkout/portal no servidor vinculado ao auth.uid; validar webhooks assinados; deduplicar e ordenar eventos; sincronizar as duas tabelas; aplicar permissões e franquias no backend; integrar mudanças, cancelamentos, recibos e restauração conforme o canal.
Links oficiais de gestão aparecem apenas para assinaturas identificadas como Apple/Google.
O histórico não é nota fiscal e não cria despesas nas finanças pessoais.
CPF e cartão não são coletados: não há finalidade/provedor configurado para esses dados.
URLs de termos/privacidade e canal de suporte precisam ser fornecidos; não foram inventados.
Gestão de sessões remotas e vinculação/desvinculação de provedores não foram adicionadas sem os fluxos necessários.
Não houve teste de cobrança real nem alteração de planos de usuários.
