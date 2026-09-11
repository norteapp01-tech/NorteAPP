# Conversa integrada Norte

## Atualização — cards visuais e agilidade

Finanças agora retorna valor, categoria, data e distribuição real dos gastos do mês. A rosca troca de categoria por toque. Ajustar registro edita a transação específica e persiste no histórico local. Agenda cria e reagenda pedidos claros diretamente, inferindo título/categoria; dados ambíguos continuam sendo esclarecidos. Card de horário permite edição. Planos apresentam etapas, datas sugeridas e ações em uma proposta; a confirmação salva etapas e ações. Alimentação usa macros cadastrados em card 2×2 (não estima fotos).

Testes reais em sessões anônimas isoladas: gasto de R$23, edição para R$24, dentista hoje às 19h, reagendamento para amanhã às 14h, proposta de loja com três etapas e duas ações por etapa seguida de confirmação. Corrigida afirmação de agendamento sem ferramenta: o orquestrador pede a execução em vez de anunciar sucesso. Build e 132 testes passaram antes do último refinamento de datas.

Os registros criados nos testes pertencem exclusivamente às sessões anônimas de teste. Nenhum SQL adicional necessário. Fotos/WhatsApp continuam fora desta entrega; não apresentar mocks como análise real de imagens.

Acesso: arrastar Hoje para a esquerda ou tocar na bússola do cabeçalho. Voltar pelo botão Hoje ou gesto inverso. A navegação de cinco itens é preservada.

O chat chama o agente existente e as mesmas stores autenticadas das telas. Mensagens persistem neste navegador, separadas pelo usuário do Supabase (últimas 100). Áudios são transcritos e apresentados no campo para revisão antes do envio. Anexos de texto (.txt/.md) de até 50 KB são aceitos.

Cards de proposta usam argumentos reais das ferramentas; só a última proposta pode ser confirmada. Resultados de ações têm cards e atalhos para a área relacionada. Consultas continuam como texto. Reagendamento e refeições cadastradas ganharam ferramentas com confirmação. Consultas de alimentação, leitura, fé e planos recuperam dados reais.

Correções: conclusão de execução agora é idempotente; confirmação em lote informa os resultados individuais, inclusive falhas; contexto de ferramentas anteriores é preservado para o modelo.

Verificação: TypeScript, build de produção, 128 testes automatizados. Teste no Chromium mobile com backend e modelo reais: abrir chat, consultar dia, treino e alimentação/leitura/fé, pedir plano e cancelar. Sessão de teste vazia: não confundir ausência de cadastros com cobertura de todos os casos de produção. Microfone físico não testado.

Limitações explícitas: não há sincronização WhatsApp/multidispositivo, upload de imagem/PDF nem estimativa de prato por foto nesta entrega. Histórico local não exige SQL. Cards não implementam todo editor de cada domínio: fluxos sem ferramenta continuam disponíveis na tela da área. Agente não deve anunciar ações inexistentes. Credenciais permanecem exclusivamente em ambiente; nenhuma chave incluída no commit.
