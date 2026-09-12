# Entrada: promessa, conversa, conta e prévia da assinatura

O botão da promessa abre `OnboardingFlow` com o `NorteChat` existente em modo demonstração. São três respostas bem-sucedidas; falhas de conexão não consomem a demonstração. Depois, abre a criação de conta. Fechar a janela permite reler a conversa; uma nova mensagem reabre o cadastro. O contador fica na sessão do navegador, por usuário. Isso é uma limitação de experiência, não um controle de cobrança ou de abuso no servidor.

O agente, suas ferramentas e o prompt não foram alterados. Registros feitos na demonstração usam a sessão anônima real existente. A conversa continua armazenada pela mesma chave por usuário do chat normal.

## Supabase Auth

Não há migração SQL: os dados básicos de nome e conclusão do cadastro usam metadados do Supabase Auth. A senha é gerenciada pelo Supabase e não é persistida no armazenamento do app.

- Manter Anonymous Sign-ins habilitado, como já exigido pelo app.
- Para Google e Apple, habilitar os provedores e suas credenciais no painel Auth. Habilitar manual identity linking para `linkIdentity`; o objetivo é manter o mesmo usuário anônimo e preservar seus registros.
- Autorizar a URL de retorno do ambiente, incluindo `/?onboarding=account`, na lista de redirect URLs. Configurar Site URL e os redirects dos provedores para o domínio publicado.
- Cadastro manual: nome e e-mail → confirmação do e-mail → definição da senha (mínimo oito caracteres) → prévia de assinatura. O retorno com `onboarding=account` também recupera a etapa se o link abrir em outra aba do mesmo navegador.
- Google/Apple só avançam quando há um usuário confirmado. Falhas do provedor aparecem no formulário e não simulam uma conta criada.
- O fluxo de vincular uma identidade que já pertence a outra conta não faz fusão automática de dados; a API pode recusar a vinculação. Login para contas existentes continua sendo uma etapa futura.

## Assinatura

A tela final é uma prévia: sem preço definido, checkout, coleta de cartão ou processamento de pagamento. O botão fica desabilitado e informa “Pagamento em breve”. Não representa um paywall nem concede uma assinatura. Antes de lançamento comercial, definir preço, termos, checkout e validação de acesso no servidor.

## Verificação

Compilar o projeto e validar no celular: promessa → opções de conversa → três respostas → cadastro; voltar e reler; cadastro manual; retorno de autenticação; prévia sem cobrança. Google, Apple e confirmação de e-mail exigem configuração dos provedores e uma conta de teste controlada; não declarar esses provedores como validados apenas por testar a interface.
