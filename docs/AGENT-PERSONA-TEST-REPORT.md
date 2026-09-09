# Agente Norte — teste de campo com três personas

Data: 9 de setembro de 2026

## Perfis simulados

1. **Informal e com baixa precisão textual** — abrevia, omite palavras e mistura ações: “bebi mei litro e gastei vintao no busao”.
2. **Perdido e indeciso** — pede mudanças vagas e volta atrás: “joga esse negócio pra amanhã sei lá”; depois cancela.
3. **Detalhista** — fornece objetivo, motivo, área e prazo completos e espera que o agente preserve todos os dados.

## Jornadas exercitadas

- múltiplos registros numa mensagem;
- água e transação financeira;
- alteração de agenda que exige confirmação;
- cancelamento de proposta;
- criação de plano com confirmação;
- argumentos negativos ou fora do formato;
- ferramenta proibida/inexistente;
- chamada duplicada no mesmo turno;
- resposta não relacionada enquanto existe proposta;
- tentativa de confirmar uma proposta antiga;
- falha da ferramenta depois da confirmação.

## Falhas encontradas na implementação recebida

1. As regras de autonomia existiam somente no prompt. O modelo podia chamar `criar_execucao` e o sistema executava imediatamente.
2. Não havia validação de argumentos antes de gravar. Valores negativos, datas inválidas e IDs malformados podiam alcançar as stores.
3. Duas chamadas idênticas produzidas pelo modelo no mesmo turno seriam executadas duas vezes.
4. Uma ferramenta não autorizada não era bloqueada por uma lista fechada no orquestrador.
5. A interface dizia oferecer correção/desfazer, mas não possuía confirmação visual para ações de nível 3.
6. Uma proposta cancelada poderia permanecer recuperável se a busca percorresse todo o histórico.
7. A resposta livre do modelo poderia afirmar “criado” mesmo quando a política tivesse interrompido a operação.
8. Uma falha após confirmação escapava do fluxo e aparecia apenas como erro genérico da tela.
9. Os testes do repositório dependiam de variáveis locais do Supabase mesmo quando não acessavam o serviço.

## Correções aplicadas

- política de autonomia separada do prompt;
- schemas de validação por ferramenta;
- confirmação obrigatória para criação de execução e plano;
- botões Confirmar e Cancelar no laboratório;
- deduplicação de tool calls idênticas dentro de um turno;
- allowlist fechada de ferramentas;
- proposta válida somente na resposta imediatamente anterior;
- texto de confirmação controlado pelo orquestrador;
- tratamento de falha após a confirmação;
- orquestrador desacoplado para testes sem banco ou modelo;
- ambiente inerte para testes unitários do client Supabase.
- correção real do último registro de água, sem somar um segundo consumo;
- correção da última transação financeira sem duplicar o lançamento;
- confirmação conversacional reconhecida sem pedir uma segunda confirmação.

## Resultado do teste real com modelo e Supabase

- A fala informal “bebi mei litro e gastei vintao no busao” foi dividida corretamente em 500 ml de água e R$ 20 em Transporte.
- O pedido vago para “jogar tudo para amanhã” não produziu ação automática.
- O plano detalhado preservou título, área, motivo e data e só gerou a ferramenta depois de confirmação.
- No primeiro ensaio, “errei, foram 300 ml” gerou um novo consumo: falha encontrada e corrigida.
- No segundo ensaio, a mesma frase chamou `corrigir_ultima_agua`, sem criar outro consumo.
- Foram criadas três sessões anônimas temporárias no Supabase. Cada uma enxergou somente seu próprio item da Caixa Norte; os itens temporários foram removidos ao final.

## Limites ainda existentes

- Não houve teste conversacional ao vivo com o modelo porque `OPENAI_API_KEY` não está configurada localmente.
- Não houve escrita real no Supabase porque as credenciais locais não estão configuradas.
- “Desfazer” ainda é uma promessa textual para a maioria dos domínios; falta um log persistente de operações e compensações.
- A deduplicação atual protege duplicatas no mesmo turno, mas ainda falta idempotência persistente para reenvios de rede.
- O histórico do chat não é persistido e desaparece ao recarregar a página.
- A primeira fase ainda não cobre refeições, progresso parcial, bloqueios, reagendamento real nem criação completa de etapas e execuções de um plano.

Esses limites impedem classificar a versão como pronta para usuários externos, mas não impedem o laboratório local de validar com segurança o fluxo básico.
