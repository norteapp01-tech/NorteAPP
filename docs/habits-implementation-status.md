# Rotinas, comunidade e automações — estado verificável

Atualizado em 12/11/2026. Este relatório substitui o estado anterior, que ainda
marcava configurações, exportação, comunidade e API como não implementadas.
**Não representa paridade completa com o Habitify nem aprovação para lançamento público.**

## Entregue nesta revisão

### 1. Rotinas individuais

- Preferências com horário silencioso, carregamento, erros e confirmação de gravação.
- Exportação JSON paginada por usuário: hábitos, versões, registros, pausas,
  encadeamentos, lembretes, reflexões e preferências. Inclui registros excluídos
  logicamente; não é um importador/restaurador de backup.
- Pomodoro configurável: foco, pausas curta/final e número de sessões.
- Fila persistente também para registros manuais. Conserva chave de idempotência,
  data, horário original e fuso; informa “aguardando envio”, mostra pendências e
  permite tentar novamente. Erros de armazenamento não são tratados como sucesso.
- Métricas só incluem registros confirmados no servidor. Desfazer um registro
  pendente exige sincronização antes; não promete desfazer algo cuja gravação
  remota ainda é incerta. O retry reutiliza a mesma chave.
- Reset limpa a fila da própria conta e invalida operações em voo para que elas
  não restaurem dados locais apagados.

**Limite offline:** funciona com a tela já carregada e conserva os pedidos após
recarregar. Não há cache completo de páginas/dados para iniciar o app sem internet.
O teste de navegador simula falha da API, não uma PWA totalmente desconectada.

### 2. Comunidade — página Juntos

- Grupos privados, nome e descrição; convite por link/código.
- Aprovação manual ou automática, remoção de participante, transferência da
  administração, substituição do convite, arquivo, silêncio e saída.
- Feed paginado, publicação, comentário, reação, menção explícita, denúncia e
  remoção pelo autor ou administrador. Texto preservado quando o envio falha.
- Avisos dentro do aplicativo para solicitação, aprovação, menção e apoio.
- Compartilhamento explícito de rotinas. Resumo de quantidade dos últimos sete
  dias em UTC, somente desde a autorização. Notas e humor permanecem privados.
- Descompartilhar, sair ou ser removido revoga o acesso ao progresso.
- Reset da conta exige transferir grupos com outros participantes ativos. Não
  apaga silenciosamente um grupo que outras pessoas continuam utilizando.

Não há ainda fotos/capas, amizades fora de grupos, mapa social de 90 dias,
sequência social, notificações push sociais ou moderação central de denúncias.
O administrador do grupo vê as denúncias e pode remover a publicação.

### 3. Desafios

- Desafios privados em grupos, com datas, unidade e meta.
- Meta cooperativa ou comparação individual de quantidades.
- Adesão voluntária vinculada a uma rotina própria compatível.
- Contabilização somente após adesão; repetir adesão não altera sua data inicial.
- Sair do desafio retira os dados da comparação.

**Não confundir com os desafios diários completos do Habitify:** ainda faltam
meta mínima diária, compromisso pessoal acima dessa meta, dificuldade com
pontuação, tolerância a dias pulados, escolha das origens permitidas,
estatísticas diárias/heatmap e encerramento com resultado histórico consolidado.
O ranking atual mede quantidade; não mede uma pontuação de constância.

### 4. Automações e notificações

- API HTTP por chave, limitada a uma única rotina, com consulta ou consulta+registro.
- Chave exibida uma vez; somente hash no banco; validade de 90 dias, revogação e
  limite de requisições. Um usuário não cria/revoga chaves de outro.
- `request_id` obrigatório para registrar; repetir devolve o mesmo registro.
- Instruções e exemplo copiável para requisições HTTP no Atalhos do iPhone.
  Isso não é integração nativa com Siri/App Intents ou um aplicativo Apple Watch.
- Dispatcher Web Push corrigido: configuração ausente bloqueia acesso; reserva
  temporária evita dois despachantes simultâneos; recibos por dispositivo evitam
  repetir aparelhos já atendidos; falhas e falta de aparelho não marcam entrega.
- Tag estável agrupa repetições no navegador. Não existe garantia de exatamente
  uma entrega entre envio externo e gravação do recibo.

**Pendente:** publicar a função `dispatch-reminders` e testar em aparelho real.
A senha do PostgreSQL não concede acesso à publicação de Edge Functions.
Também falta o agendador servidor que renova ocorrências de hábitos e processa
encadeamentos para registros recebidos via API. Atualmente a renovação de
lembretes e os efeitos dos registros do app dependem do cliente.

## Banco de produção

Todas as verificações usaram contas temporárias dentro de transações revertidas.
As migrações foram aplicadas somente depois dos testes correspondentes.

| Migração | Estado nesta revisão |
|---|---|
| 0062_plan_flow | Aplicada e registrada após 7 verificações. A pendência anterior foi resolvida. |
| 0063–0066 | Já presentes no catálogo antes desta revisão. |
| 0067_circles | Aplicada após 13 verificações reais de permissões, privacidade e idempotência. |
| 0068_habit_automation | Aplicada após 11 verificações reais de escopo, revogação e registros idempotentes. |
| 0069_push_delivery_receipts | Aplicada após 6 verificações reais de reserva, recuperação, recibos e isolamento. |
| 0070_reset_community_content | Aplicada após 5 verificações reais de reset e preservação dos dados de outras pessoas. |

A migração 0062 altera `executions`; a informação antiga de que dependia de
tabelas `plans/plan_phases/plan_steps` estava incorreta. O primeiro teste de
0062 usou o antigo campo `date` e falhou; foi corrigido para o esquema real
(`due_date`, `agenda_date`, `start_time`) antes da aplicação.

## Evidências

- Suíte completa de testes, verificação de tipos e build executados nesta revisão.
- 42 verificações no banco real: 13 comunidade + 11 automações + 6 push +
  7 planejamento + 5 reset. Todas passaram; dados temporários revertidos.
- 14 verificações PostgreSQL isoladas de comunidade e 15 de automações.
- 40 verificações de navegador para Juntos: 360, 390, 430 e 1280 px, temas
  claro/escuro, quatro abas, erro de comentário sem perda de texto.
- Navegador: registro pela interface com API indisponível, aviso de pendência,
  recarregamento, retorno da conexão e confirmação única com horário preservado.
- Testes do handler de push com banco e transporte controlados: segredo ausente,
  autorização inválida, sem aparelho, reserva já ocupada, falha parcial, recibo
  indisponível e inscrição expirada. Não são testes de entrega externa real.
- Scripts reproduzíveis em `scripts/check-community.mjs`, `check-habit-offline.mjs`
  e `verify-*-production.mjs`. Scripts administrativos recebem URL por stdin;
  não gravam nem imprimem credenciais.
- `npm run lint` também percorre a pasta externa não rastreada `referencia de saas/`.
  O lint do app, excluindo essa referência, deve ser usado para esta revisão.
  A referência não foi alterada nem adicionada ao commit.

Não executados: testes de todos os módulos do aplicativo em aparelhos reais,
conversa completa com o agente, Apple Watch, HealthKit, OAuth Strava/Fitbit,
conflitos de edição entre duas abas/dispositivos e ensaio de carga em produção.

## Comparação e trabalho que ainda falta

As referências oficiais confirmam que o Habitify possui grupos com gestão de
entrada e compartilhamento seletivo, incluindo mapa de progresso, meta e
sequência. O Norte passou a ter a base de grupos, mas seu resumo compartilhado
ainda é mais simples. [Habitify Circle](https://intercom.help/habitify-app/en/articles/11531803-start-a-habitify-circle-and-share-your-progress)

O Habitify também documenta desafios com metas diárias, fontes de registro,
dificuldade, pontos e tolerância a dias pulados. Esses itens não estão no ranking
de quantidade implementado no Norte. [Habitify Challenge](https://intercom.help/habitify-app/en/articles/13156044-create-your-own-habitify-challenge)

| Bloco | Próximo trabalho concreto | Dependência |
|---|---|---|
| Hábitos | Agendador servidor; briefing/fechamento; períodos do dia configuráveis; cache offline completo | Implementação adicional e publicação do servidor |
| Comunidade | Mapas e sequências, capas/fotos protegidas, filtros/moderação, push social | Implementação adicional |
| Desafios | Regras diárias, pontuação, tolerância, origens, estatísticas e histórico final | Implementação adicional |
| API | Efeitos servidor por registro; webhooks assinados com retry; conectores específicos | Implementação adicional; contas para homologação externa |
| Saúde | Apple Health/Health Connect, Watch, widgets e Live Activities | Aplicativos nativos, entitlements, dispositivos e contas de desenvolvedor |
| Serviços | Strava, Fitbit e outros OAuth | Aplicativos registrados, credenciais e homologação |
| Qualidade | Entrega push real, agente real, testes entre dispositivos e carga | Ambiente conectado e aparelhos |

Não atribuir “100%”, “melhor em todos os requisitos” ou “pronto para público”
com base apenas nesta revisão. Há ganhos concretos e testados; a lista acima
contém trabalho real ainda necessário, inclusive itens que não dependem de
credenciais externas.
