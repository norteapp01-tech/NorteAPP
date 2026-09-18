# Academia — treino em andamento

Como funciona o controle de treino, o que ele garante e onde estão os limites
reais. Escrito pra evitar que a próxima pessoa (ou eu daqui a três meses)
presuma capacidades que o app não tem.

## O ciclo de uma sessão

A sessão **só nasce por um toque explícito em "Iniciar treino"**. Antes, ela
nascia sozinha ao abrir um exercício: quem só queria conferir a carga planejada
acabava com um treino aberto no banco, e o histórico enchia de sessões
fantasma.

1. **Iniciar treino** grava a sessão com `started_at`, o retrato do planejado e
   um `workout_exercise_logs` por exercício.
2. Séries são registradas pelo painel rápido ou pelo modal completo — os dois
   escrevem pelas **mesmas** funções (`logSet`, `updateSet`,
   `completeExerciseLog`), então não existe estado paralelo pra divergir.
3. **Finalizar treino** fecha a sessão. Não promove nada: exercício com 2 de 4
   séries fica `parcial`, exercício sem série nenhuma fica `nao_realizado`. A
   confirmação mostra essa lista antes de fechar.

Uma sessão aberta e esquecida **não é descartada nem escondida**. `openSession`
procura por status, não por data, então um treino de ontem aparece com um aviso
e as opções de retomar ou finalizar. Antes, `sessionForToday` só olhava hoje e
a sessão ficava aberta pra sempre, invisível.

## Os dois relógios

São dois, separados e rotulados: **duração da sessão** e **descanso**.

Ambos são **derivados de horários**, nunca de contagem de ticks:

| Coluna                                | Papel                                  |
| ------------------------------------- | -------------------------------------- |
| `started_at`, `finished_at`           | extremos da sessão                     |
| `paused_at`                           | desde quando está pausado (null = correndo) |
| `paused_seconds`                      | pausas já encerradas, acumuladas       |
| `rest_started_at`, `rest_total_seconds` | descanso atual                       |
| `rest_paused_at`, `rest_paused_seconds` | o mesmo, pro descanso                |

`sessionElapsedSeconds` e `restRemainingSeconds` calculam por diferença. É o
que faz trocar de aba, bloquear a tela ou recarregar a página não causar
desvio — o contador anterior vivia em `useState` e perdia todo segundo em que
a aba não estava visível, além de morrer ao navegar.

O descanso é independente da pausa do treino: dá pra pausar um sem pausar o
outro. Reiniciar mexe **só** no descanso; nenhuma série registrada é tocada.

### Um bloco, duas faces

Os dois relógios ocupam o **mesmo** espaço, alternados por um arrasto vertical
(ou pelo seletor ao lado do título, ou pelas setas do teclado). É apresentação:
virar a face nunca pausa, reinicia nem altera tempo nenhum.

A altura do bloco é fixa e as faces são absolutas dentro dela — trocar de face
não empurra nem encolhe o resto do painel. `backface-visibility: hidden` impede
o verso e o texto espelhado; `inert` mantém a face escondida fora do alcance do
foco e do toque, inclusive durante o giro.

O gesto tem limiar de 14px, provoca **uma** troca por arrasto, ignora toques que
começam sobre botões e campos, e o `touch-action: none` vale só dentro do bloco
— a rolagem do resto do painel continua livre. Com `prefers-reduced-motion`, a
regra global reduz a duração e a troca vira instantânea.

### Os quatro estados do descanso

Duração-base, tempo restante e estado de execução são três coisas distintas.
Confundi-las era o que fazia o cronômetro "sumir" e virar "Iniciar descanso":

| Estado | O que mostra | O que o Play faz |
| --- | --- | --- |
| `pronto` | a duração-base | começa a contagem |
| `correndo` | o restante | pausa |
| `pausado` | o restante congelado | continua de onde parou |
| `fim` | `00:00`, nunca negativo | recarrega a base e começa |

Reiniciar volta para a base e fica **parado**, pronto para o Play. No banco isso
é só marcar início e pausa no mesmo instante — o cálculo de sempre lê como
"cheio e parado", sem um estado paralelo só para "reiniciado".

A duração-base vem do descanso cadastrado para aquela série. Tocar nos números
abre um editor (1/2/3/5 min ou minutos e segundos à mão) cuja escolha vira a
base **daquele exercício, só nesta sessão** — `workout_sessions.rest_overrides`,
um mapa por exercício. A ficha permanente do treino não é tocada, e trocar de
exercício volta a usar a configuração dele, salvo se houver escolha temporária
também para ele.

Abrir o editor ou tocar numa opção não altera nada: só "Iniciar" mexe no
cronômetro.

Não há aviso sonoro garantido no fim do descanso com o app em segundo plano —
o navegador não garante nem execução nem áudio nessa situação, e a tela diz
isso em vez de prometer.

## O retrato do planejado (`planned_snapshot`)

Cada sessão guarda, em JSON, o que cada exercício planejava **no instante em
que o treino começou**: nome, alvos e `set_targets`.

Sem ele, a sessão lia o exercício vivo. Consequência: aumentar a carga hoje
reescrevia retroativamente a meta de todo treino passado, e excluir um
exercício apagava o histórico dele junto. Agora:

- O resumo e o modal leem `sessionPlanned(session, exercises)` — retrato
  primeiro, treino vivo só como fallback pras sessões gravadas antes disso.
- `workout_exercise_logs.exercise_id` é anulável com `on delete set null`: o
  exercício sai do treino, as séries continuam no histórico, e o nome vem do
  retrato.

## A bolha flutuante — escopo real

A bolha é um elemento **dentro do Norte**. Ela sobrevive a navegar entre telas
porque está montada em `__root.tsx` fora do `<div key={pathname}>`, do mesmo
jeito que a barra de gravação do Esportes.

**O que ela não faz, e por quê:**

- **Não sobrepõe outros aplicativos.** Isso exige a permissão
  `SYSTEM_ALERT_WINDOW` num app Android nativo (ou um Bubble/Chat Head) — não
  existe API web equivalente.
- **Não aparece na tela bloqueada.** Isso exige Live Activity (iOS) ou
  notificação persistente com foreground service (Android).
- **Não roda com o app fechado.** O JavaScript da aba é suspenso.

O Norte hoje é um app web, sem wrapper nativo. Enquanto isso for verdade, os
três itens acima são impossíveis, não pendentes. O que **não** foi feito é
fingir qualquer um deles com um substituto que pareça funcionar.

Os relógios serem derivados de horários é o que limita o estrago: mesmo que a
aba seja suspensa por vinte minutos, ao voltar o tempo mostrado está correto.

### Posição

A bolha fica exatamente onde foi solta, presa dentro da faixa de 428px que a
`.norte-bottom-nav` já usa, com as áreas seguras descontadas pelo container.
A posição é por aparelho, em `norte:academia:bubblePosition`. Arrastar e tocar
se distinguem por um limiar de 6px (mesmo padrão do `GanttBar`): abaixo dele é
toque e abre o painel; acima, move.

## Painel rápido

Mostra **uma série por vez** — a atual dá lugar à próxima no mesmo espaço, em
vez de empilhar a lista inteira.

- As setas navegam por **todos** os exercícios, inclusive os concluídos.
  Navegar nunca conclui, cancela nem apaga nada.
- Ao confirmar a última série planejada, o exercício é concluído e o painel
  **avança para o próximo pendente dando a volta na lista**. É o caso de
  academia de verdade: a máquina do próximo está ocupada, você pula, e ao
  terminar o painel volta pro que ficou pra trás.
- Uma falha de gravação preserva os valores digitados e **não avança**.
- A seta pra cima abre as séries já feitas, editáveis. A edição usa
  `updateSet`: corrige a série existente, não cria outra nem redispara
  avanço/descanso.
- Série extra só por "Adicionar série" explícito.

## Preferências

| Chave                          | O que guarda                        |
| ------------------------------ | ----------------------------------- |
| `norte:academia:bubblePosition` | posição da bolha neste aparelho     |
| `norte:academia:autoRest`       | iniciar descanso sozinho após a série |

## Integridade no banco (`0039`)

Duas constraints que o código já assumia mas o banco não impunha:

- `workout_sessions (user_id, plan_id, date)` — o `.maybeSingle()` do
  `startSession` depende disso pra desduplicar.
- `workout_set_logs (exercise_log_id, set_index)` — o `updateSet` endereça uma
  série por esse par com `.single()`.

A falta da segunda já tinha causado estrago real: `logSet` numerava a série
nova com `count(*)`, e dois toques rápidos liam a mesma contagem e gravavam as
duas no mesmo índice. A migration **renumera em sequência** em vez de apagar —
descartar uma das duas afirmaria que a série não aconteceu. A trava por ref
(`useAsyncAction`) impede novos casos no cliente; a constraint impede no banco.

---

# Ciclo de treino

## O ciclo é o planejamento, não uma cópia dele

Criar um ciclo cria **uma** linha em `goals` (categoria `academia`) e uma `steps`
por bloco. `workout_cycles.goal_id` e `workout_cycle_blocks.step_id` apontam
para elas.

Consequência prática: abrir por Academia ou por Planos mostra a mesma coisa, e
mudar a duração de um bloco move a data-alvo da etapa correspondente. Há link
nos dois sentidos — "Ver em Planos" no card do ciclo, e um atalho para o ciclo
no topo da tela do planejamento.

O que **não** virou tarefa da Agenda: série, carga, repetição e registro. Isso é
domínio de treino e continua em `workout_*`. Só o horário do treino vira
compromisso, e pelo fluxo de rotinas que já existia — a tela mostra o que vai
ser criado antes de criar, e um dia que já tem rotina de academia é mantido
como está, nunca duplicado nem sobrescrito.

## Blocos

`Ciclo → blocos com datas → treinos do bloco → exercícios → alvos por série.`

Os intervalos são **calculados a partir das durações**, não digitados um a um:

```
blockRangesFrom("2026-09-01", [10, 15, 20])
  → 01–10 set · 11–25 set · 26 set–15 out
```

Cada bloco começa no dia seguinte ao fim do anterior, por construção. Não existe
sobreposição nem buraco para validar depois.

Mudar a duração de um bloco empurra **só os seguintes**. Faltar um treino não
empurra nada sozinho: adiar é uma ação explícita ("adiar 3/7 dias"), e ela
também só mexe daquele bloco em diante.

O **foco** do bloco é texto livre do usuário ("resistência"). Não é meta, não
tem número e não entra em nenhum cálculo. O Norte não prescreve carga nem volume.

## Por que os treinos do bloco são cópias

Um treino dentro de um bloco tem `block_id` preenchido e não aparece em "Treinos
cadastrados". Selecionar um treino da biblioteca para um bloco **copia** o
treino e seus exercícios.

Sem a cópia, ajustar a fase 3 mudaria a fase 1, o treino de hoje e o histórico —
exatamente o que o ciclo não pode fazer.

Com a cópia vem o problema oposto: "Supino" do bloco 2 seria outro exercício
qualquer e a curva de evolução recomeçaria do zero a cada fase. Por isso existe
`lineage_id` em `workout_exercises` e em `workout_plans`, preservado na cópia:

- `exerciseSeriesByLineage` e `maxWeightAtReps` seguem a linhagem, não o id.
- `previousFinishedSession` compara pela linhagem do plano — a sessão de hoje
  acha "a anterior deste mesmo treino" mesmo depois da troca de bloco.
- `workout_sessions.plan_lineage_id` e `plan_label` guardam essa identidade na
  própria sessão, então ela sobrevive à exclusão do plano.

**Excluir nunca apaga histórico.** Remover um bloco ou tirar um treino dele
**arquiva** (`archived_at`) em vez de apagar, e `workout_sessions.plan_id`
passou de `cascade` para `set null` — antes, apagar um treino apagava todas as
sessões registradas dele, apesar de o código afirmar o contrário.

## Um exercício em vários treinos

"Duas séries de abdominal nos treinos A até E" é uma ação só. Os destinos ficam
à vista antes de gravar; um treino que já tem exercício com aquele nome é
deixado como está e reportado depois. Cada treino recebe a sua própria linha
(editável separadamente) e todas compartilham a mesma linhagem — a evolução do
abdominal é uma curva só.

## Qual programação está valendo

`todayProgramming` resolve, nesta ordem:

| Situação | Resultado |
| --- | --- |
| Ciclo ativo, hoje num bloco, dia com treino | `ciclo` |
| Ciclo ativo, hoje num bloco, dia marcado como descanso | `descanso` |
| Ciclo ativo, hoje num bloco, dia sem linha | `nenhum` |
| Ciclo ativo, hoje fora de todos os blocos | `nenhum` + aviso |
| Sem ciclo ativo | `semana` (atribuição solta) |

Um ciclo ativo por vez, garantido por índice único parcial no banco. A origem é
sempre dita em voz alta no card de hoje, e o "Plano da semana" passa a mostrar a
semana **do bloco vigente** — deixar os dois lados mostrando programações
diferentes seria a combinação silenciosa que não pode acontecer.

Um dia sem linha no bloco **não** cai no plano da semana por baixo dos panos.

## Metas e evolução

Quatro tipos, todos com ponto de partida, alvo, unidade e prazo:

| Tipo | Medido a partir de |
| --- | --- |
| Peso corporal | último registro em `workout_body_weights` |
| Carga em um exercício | maior peso com **pelo menos** N repetições |
| Séries e repetições | volume acumulado da linhagem no período |
| Frequência de treinos | sessões concluídas no período |

**Repetições de referência** existem porque 80kg×3 e 80kg×10 não são o mesmo
resultado. Uma meta de carga a 8 repetições ignora a série pesada de 3 — comparar
só o quilo mentiria sobre a evolução.

O sentido da meta vem da diferença entre início e alvo, não de suposição: uma
meta de peso corporal que desce é atingida ao chegar **abaixo** do alvo.

O ponto de partida é pré-preenchido com o dado real quando ele existe. Quando
não existe, a tela diz isso e a meta fica marcada como "sem registro ainda" em
vez de exibir um zero que parece medição.

## Três números que não viram um

O resumo do ciclo mostra **tempo transcorrido**, **treinos realizados versus
programados** e **metas atingidas**, separados:

- Tempo é dia corrido. Passar o prazo não é ter cumprido nada.
- O denominador de treinos conta **dias com treino marcado** dentro do período,
  não dias de calendário.
- Metas vêm da avaliação real de cada meta, não da contagem de blocos.

Uma barra única escondendo os três esconderia justamente a diferença entre "o
prazo andou" e "eu treinei".

## Limitações conhecidas

- O ciclo não gera execuções na Agenda por conta própria: os horários viram
  rotinas quando o usuário manda, uma vez, pelo painel do bloco. Mudar o horário
  no bloco depois disso não reescreve as rotinas já criadas.
- Não há importação de ciclo pronto nem sugestão de programação. O usuário monta.

---

# Ciclo como planejamento completo

## A especialização mora no planejamento

`goals.plan_type` é um enum (`comum` | `ciclo_treino`). Criar um ciclo grava
`ciclo_treino` no planejamento correspondente, e `/objetivo/$id` renderiza a
**mesma** `CyclePage` que `/ciclo/$id` quando encontra esse tipo.

Deduzir a especialização da tela de origem faria a mesma linha do banco se
comportar de dois jeitos. Planos comuns seguem exatamente como antes — nenhum
recurso de academia aparece neles.

## Estrutura

```
Ciclo → Etapas (datas) → Treinos (A/B/C…) → Exercícios → Séries planejadas
```

As "etapas" são as linhas de `workout_cycle_blocks` que já existiam — mudou o
nome na interface, não o dado, então ciclos antigos continuam inteiros.

Uma etapa é **rascunho** quando não tem treino montado. Isso é derivado, não
uma coluna: uma etapa futura vazia é incompleta por definição, e guardar o
estado numa coluna só criaria a chance de os dois discordarem.

## Criar curto, editar completo

"Criar ciclo" pede nome, início e duração, cria uma etapa cobrindo o período e
**abre a página do ciclo**. A montagem acontece lá, em quatro abas —
Planejamento, Cronograma, Evolução e Metas — com o mesmo vocabulário visual das
abas de Planos.

Mudar a duração de uma etapa **mostra quais etapas seguintes serão deslocadas
antes de aplicar**. As anteriores e o histórico nunca se movem.

## Por que os treinos da etapa são cópias

A letra (A, B, C) é rótulo **dentro da etapa**, não identificador global: o "A"
da etapa 1 e o "A" da etapa 2 são treinos diferentes e podem ter conteúdos
diferentes.

Copiar a etapa 1 para a 2 gera configuração independente. Remover a puxada,
trocar a carga da remada e acrescentar outro exercício na etapa 2 não toca na
etapa 1 nem nas sessões já registradas — verificado no teste de aceitação.

`lineage_id` em exercícios e planos é preservado na cópia, então a evolução
histórica continua sendo uma curva só quando é realmente o mesmo exercício.

## Programação e treino do dia

Ativar mostra **a prévia do que passa a valer**: etapa vigente, a semana dela
dia a dia, quantas etapas ainda estão sem treino, e a data da próxima mudança.

O plano da semana que existia antes fica guardado em
`workout_cycles.previous_weekly`. Encerrar oferece três saídas explícitas:
voltar, encerrar mantendo a semana atual, ou encerrar restaurando a anterior.
Nada disso é automático — quem montou uma semana nova durante o ciclo não quer
vê-la sobrescrita.

Se a próxima etapa estiver incompleta, a página avisa. O Norte não inventa
treino para preencher o vazio.

## Metas

Seis tipos. Os quatro primeiros são atualizados por registro real; os dois
últimos são marcados como **manual** na interface:

| Tipo | De onde vem o valor |
| --- | --- |
| Carga em um exercício | maior peso sustentado por N séries de M repetições |
| Séries e repetições | volume acumulado da linhagem |
| Peso corporal | último registro de peso |
| Frequência | sessões concluídas no período |
| Medida corporal | medição registrada com método e data |
| Acompanhamento manual | marcada pela pessoa; sem número |

**Séries de referência** existem porque "3×10 com 30kg" não é a mesma conquista
que uma única série de 10 com 30kg. `maxWeightForSetsReps` pega a N-ésima maior
carga **dentro de uma sessão** — somar séries de dias diferentes fingiria um
3×10 que não aconteceu.

`workout_body_measurements` guarda label, valor, unidade, **método** e data. O
Norte não calcula percentual de gordura a partir do peso, e uma intenção como
"reduzir gordura nas costas" vira meta descritiva, não uma porcentagem
inventada.

## Limitações conhecidas

- O cronograma do ciclo é próprio (nível etapa), não o `GanttChart` de Planos:
  aquele desenha barras por execução, e o ciclo precisa de barras por etapa.
  Compartilham `ganttBuckets`, a escala e a linguagem visual, não o componente.
- Reordenar etapas não existe: a ordem vem das datas. Para trocar, ajuste as
  durações.
- Os horários do ciclo viram rotinas da Agenda quando a pessoa manda, uma vez.
  Mudar o horário na etapa depois disso não reescreve as rotinas já criadas.

---

# Evolução

## O que a tela responde

Quatro perguntas, nesta ordem: mantive a frequência, em quais exercícios
progredi, como distribuí o treino, e o que mudou. Funciona **sem planejamento
nenhum** — escolher um é filtro, nunca requisito.

Tudo parte de `applyFilters`, um conjunto filtrado único. Indicadores, gráficos
e listas leem dele, então não há como o número do topo discordar do ponto do
gráfico. E cada número abre os registros que o compõem.

## Os três indicadores

| Indicador | O que conta |
| --- | --- |
| Treinos realizados | sessões concluídas (em andamento não entra) |
| Dias treinados | datas distintas com sessão concluída |
| Séries registradas | séries efetivamente gravadas; metas da ficha não contam |

A variação é em **quantidade**, não em porcentagem: sair de 0 para 3 não é
"+300%", e sair de 3 para 0 não é "queda de 100%". A comparação usa o intervalo
imediatamente anterior de mesma duração, com as datas à vista. Quando ele não
cabe no escopo da etapa, a tela diz "Sem comparação disponível" em vez de
inventar uma.

Frequência **não** é chamada de aderência: mostrar realizado/programado exigiria
saber o que estava previsto naquela época, e a ficha semanal de hoje não pode
reescrever o passado.

## Progressão de carga — critério estreito de propósito

Para entrar em "Maiores progressões de carga":

- mesmo exercício **e** mesmo equipamento (trocar de aparelho começa outra série
  histórica — 40kg na barra e 40kg por halter não são a mesma carga);
- séries com o **mesmo número de repetições**;
- pelo menos 3 sessões com registro comparável no período;
- melhor carga daquela referência em cada sessão, comparando a primeira com a
  última elegível;
- exercícios assistidos ou sem carga externa ficam fora: reduzir assistência é
  progresso, mas não é aumento de kg.

O percentual é variação relativa da carga registrada. Não compara força entre
exercícios, não mede crescimento muscular, esforço nem preferência. O critério
está acessível por toque, ao lado do título.

## O gráfico

Um só, com busca de exercício e até três fixados. Dois modos: carga para N
repetições, ou repetições com X kg. **30 kg × 5 e 30 kg × 12 nunca entram na
mesma curva**, e não há estimativa de 1RM nesta versão.

Cada ponto é uma sessão elegível — duas sessões no mesmo dia continuam sendo
dois pontos. Referência sem registro não desenha nada, em vez de interpolar. Com
um ponto só, a tela diz "Primeiro registro".

Tocar num ponto abre todas as séries daquela sessão. A mesma série aparece em
lista logo abaixo do gráfico: nada importante depende de passar o mouse.

## Distribuição

**Grupos musculares**: séries por grupo *principal*, uma série em um grupo só —
a soma das barras é o total de séries registradas. Distribuir "Peito e tríceps"
entre os dois seria suposição, e o total deixaria de bater. Exercício sem
classificação aparece como "Não classificado".

**Treinos**: sessões por identidade estável (`plan_lineage_id`). Duas fichas
chamadas "A" em etapas diferentes não são o mesmo treino. O rótulo é "Mais
realizados", nunca "favoritos" nem "mais pesados".

Tocar numa barra filtra o painel e abre os registros daquele total.

## Classificação (migration 0043)

`workout_exercises.muscle_group` e `.equipment` são enums escolhidos pela
pessoa no editor de exercícios. Nada é adivinhado: sem escolha, o exercício fica
"Não classificado".

A classificação entra no **retrato da sessão** (`planned_snapshot`), então
reclassificar a ficha hoje não reescreve a distribuição de meses atrás. Sessões
gravadas antes de a classificação existir não têm esse dado em lugar nenhum;
só para elas a ficha atual é usada como melhor evidência disponível.

## Conquistas

Recorde é mais carga com as mesmas repetições, ou mais repetições com a mesma
carga, comparado com **todo** o histórico anterior à sessão — inclusive fora do
período visível, senão encurtar a janela fabricaria recordes.

O primeiro registro estabelece referência e não é anunciado como recorde. Empate
não é recorde. Cada sessão rende no máximo um recorde por exercício. Cada
conquista abre os registros que comprovam a comparação. Não há confete.

Ao finalizar um treino, a confirmação mostra a evidência quando existe —
"Remada: 2 repetições a mais com 25 kg" — com atalho para a Evolução. Sem
conquista, o treino é só confirmado: o app não inventa elogio.

## Limitações conhecidas

- **Duas sessões do mesmo treino no mesmo dia não são possíveis**: a constraint
  `workout_sessions (user_id, plan_id, date)` da migration 0039 impede. Duas
  sessões no mesmo dia precisam ser de treinos diferentes. Os cálculos tratam
  sessões do mesmo dia como distintas; é o banco que limita a criação.
- Cardio, calorias e gordura corporal não são inferidos da duração da sessão.
  Esses números só existirão quando houver registros adequados.
- Sessões anteriores à migration 0043 usam a classificação atual da ficha, por
  não haver outra evidência. As novas guardam a própria.
- Não há classificação retroativa em massa: mudar a ficha vale daqui pra frente.

---

# Evolução — mapa de estímulo, sobrecarga e distribuição

A Academia tem três abas: **Treino | Evolução | Programa**. "Programa" é o nome
visível do que era "Ciclo de treino" — identificadores internos, rotas e dados
seguem os mesmos.

A Evolução é **uma página contínua**, nesta ordem: filtros, indicadores, mapa de
estímulo, sobrecarga progressiva, distribuição, pontos de atenção e medidas
corporais. Funciona para quem nunca criou um programa.

## Dois níveis de filtro

**Globais** (período, programa, etapa) afetam tudo. **Seleção de músculo**
(mapa ou radar) detalha só a lista de exercícios — o mapa e o radar continuam
mostrando o corpo inteiro, destacando o grupo, para preservar o contexto da
comparação.

Período padrão: 30 dias, com 7 dias, 3 meses, 1 ano e personalizar. A comparação
usa o intervalo imediatamente anterior de mesma duração, informado nos detalhes.
Período vazio mantém o filtro escolhido e explica a ausência.

## Regras das três métricas

**Frequência.** Só há percentual quando existe programação **histórica**: os
dias marcados nas etapas, cujas datas são fixas. A atribuição semanal solta é
estado atual e não pode dizer o que estava previsto há dois meses — sem ela, o
card mostra "N treinos realizados" e diz por quê. Treinos extras aparecem
separados e não empurram o cumprimento acima de 100%.

**Volume registrado.** Soma de carga × repetições das séries elegíveis. Peso
corporal, assistido e séries sem carga ficam de fora, e a quantidade excluída é
reportada — forçar modalidades incompatíveis numa conta só produziria um número
sem significado. O detalhe avisa que volume maior não prova ganho de força:
ele também sobe com mais sessões ou exercícios diferentes.

**Grupo em destaque.** Grupo com mais séries **diretas**, com a quantidade
explícita. Não é "músculo mais forte" nem "favorito".

## Mapa de estímulo

Figura anatômica por regiões, frente e costas. Cada região é **um elemento**:
o que se vê e o que se toca são o mesmo path/ellipse, então as áreas clicáveis
não saem do lugar em telas diferentes. Há também um seletor textual — o desenho
nunca é a única forma de escolher.

A escala representa **quantidade de séries diretas**, em quatro níveis
declarados. A legenda vai de "Menos séries" a "Mais séries". As cores não
afirmam recuperação, risco de lesão, overtraining nem faixa ideal, e região sem
registro aparece em cinza como "sem registros" — descrição do que foi
registrado, não acusação de não ter treinado.

Não implementamos "séries próximas à falha × frequência": ela conta frequência
duas vezes e depende de dados de esforço que este modelo não guarda.

## Séries diretas versus participação

`workout_exercises.muscle_group` é o grupo que **recebe** a série;
`secondary_muscles` (migration 0044) são os que participam. Somar a série
inteira em cada músculo inflaria o total — cinco séries de supino virariam
quinze. Por isso o radar e o mapa somam apenas as diretas, e a participação é
mostrada à parte ao selecionar o grupo. A soma das barras bate com o total de
séries registradas.

Exercício sem classificação aparece como "Não classificado", nunca distribuído
por suposição.

## Sobrecarga progressiva

Uma linha por exercício com registros no período: nome, grupo, minigráfico das
sessões comparáveis, resultado objetivo e acesso ao detalhe.

A comparação exige mesma identidade de exercício e **mesmo equipamento**.
Prioriza mais repetições com a mesma carga; depois mais carga numa referência de
repetições. Sem comparação defensável: "Sem comparação". Sem mudança
observável: "Estável nas últimas sessões".

Nunca concluímos platô por tempo decorrido, nem atribuímos queda a fadiga ou
falta de foco — uma carga menor pode ser deload, técnica, amplitude ou mudança
de objetivo.

O detalhe abre no eixo com mais sessões comparáveis, permite alternar entre
carga e repetições (um eixo por vez, nunca dois incompatíveis no mesmo gráfico),
e cada ponto abre as séries que o originaram.

## Pontos de atenção

No máximo três, calculadas por regras transparentes sobre os registros —
nenhuma chamada de IA. Cada uma leva à sua origem. Músculo que nunca foi
treinado não vira problema: só entra quando já houve registro e ficou parado.
Nada é alterado no programa automaticamente.

## Limitações reais

- **As imagens de referência não chegaram na conversa.** A identidade visual
  seguiu a descrição escrita (fundo preto, cards grafite, verde da marca, ícones
  outline) e os componentes reais do app. A figura anatômica é uma ilustração
  vetorial estilizada por regiões; ela cumpre os requisitos funcionais
  (regiões = áreas clicáveis, escala declarada, seletor textual), mas não pôde
  ser comparada com a referência aprovada.
- RPE/RIR não existem no modelo de dados: nenhum indicador de esforço é exibido,
  e nada é presumido das séries sem registro.
- Cardio, calorias e gordura corporal continuam fora — não são inferidos da
  duração da sessão nem das cargas.
- Sessões anteriores à classificação usam a ficha atual como melhor evidência
  disponível; as novas guardam a própria no retrato da sessão.

---

# Evolução como explorador: corpo → músculo → exercício → sessões

Esta rodada substitui a divisão entre as subabas **Corpo** e **Desempenho** por
uma página contínua. Nada do que existia sumiu: o que era Desempenho passou a
viver dentro da análise do músculo e do exercício, que é onde a pergunta
nasce, e o que é menos usado ficou em **Mais análises**.

A página abre curta de propósito — filtros, três indicadores e o corpo. O resto
aparece conforme a pessoa escolhe.

## Onde cada função foi parar

| Antes | Agora |
| --- | --- |
| Aba "Desempenho" → gráfico de força | Análise do exercício, aberta na própria linha |
| Modal de detalhe do exercício | Painel inline (`ExerciseAnalysis`), um por vez |
| "Comparar carga com X reps" na visão principal | Gaveta **Comparar séries equivalentes** |
| Lista "Sobrecarga progressiva" | **Exercícios · N**, dentro do músculo |
| Radar de distribuição | **Mais análises → Distribuição de séries** |
| Recordes, medidas, peso | **Mais análises** |
| Indicador "peso total acumulado" | Removido (ver abaixo) |

O único indicador que deixou de existir é o **peso total acumulado**: somar
carga × repetições de exercícios diferentes produz um número grande que não
responde a nenhuma pergunta e cresce só por treinar mais exercícios pesados.

## Trapézio e lombar (migration 0045)

O catálogo ganhou dois grupos. A migration **não reclassifica nada**: um
exercício gravado como "costas" continua "costas", porque adivinhar qual deles
era lombar reescreveria o histórico de quem nunca fez essa escolha. Quem quiser
separar reclassifica na ficha, e o retrato da sessão (`planned_snapshot`)
protege o que cada sessão antiga afirmava.

## O atlas anatômico

`anatomy.ts` gera o corpo por geometria, não por path escrito à mão.

- O corpo **é** o conjunto das regiões. Não há imagem por baixo com formas
  pintadas em cima — que era exatamente o que produzia mancha borrada e
  contorno fora de lugar.
- Regiões vizinhas compartilham a fronteira **por construção**: as duas usam a
  mesma função de costura (`seamTrapPec`, `seamPecAbs`, …) ou o mesmo `t` do
  membro. Não existe vão nem invasão para acertar na mão.
- As costuras não são cortes horizontais: a linha do peitoral sobe em direção à
  axila, o trapézio desce no meio das costas, o dorsal afunila na cintura.
- Esquerda e direita são dois subpaths do **mesmo** `<path>`. Um elemento é ao
  mesmo tempo preenchimento, contorno, alvo de toque, alvo de foco e rótulo de
  leitor de tela — e tocar um lado destaca os dois.
- Desenho próprio e geométrico: não há obra de terceiros nem licença de imagem
  envolvida. **É uma figura esquemática legível, não uma prancha de anatomia
  médica** — e a interface não promete ser uma.
- `corpo_inteiro` e `cardio` não são regiões do corpo. Aparecem só no seletor
  textual, sob "Sem região no mapa".

## Os dois modos do mapa

**Estímulo** = quantidade de séries diretas, comparada entre os músculos do
próprio usuário no período. Não é frequência, não é faixa ideal, não é
recuperação.

**Evolução** = progressão registrada nos exercícios associados ao músculo. As
regras, todas em `workout-explorer.ts` e todas testadas:

1. Uma série histórica é identificada por **linhagem + equipamento**. Barra,
   halteres, máquina e cabo nunca entram na mesma curva.
2. Só carga externa positiva entra na leitura do músculo.
3. Força estimada (Epley) aceita séries de 1 a 10 repetições, e nunca se aplica
   a peso corporal, assistido, elástico ou carga zerada.
4. A **série representativa** da sessão é a elegível com maior força estimada.
5. O estado do músculo é a **mediana** da evolução percentual dos exercícios
   elegíveis — cada exercício vota uma vez, senão o que tem mais séries
   decidiria sozinho a cor da região.
6. Margem mínima de **2,5 %** (`EVOLUTION_MARGIN_PCT`): abaixo disso o
   resultado é "estável". 2,5 % é aproximadamente o menor degrau real de carga
   (2,5 kg em 100 kg), então uma diferença menor diz mais sobre qual anilha
   estava disponível do que sobre o treino.
7. Com um único exercício comparável a região recebe cor, mas a tela diz
   **"dados limitados · 1 exercício"**.

Cobertura sempre visível: "3 de 5 exercícios comparáveis".

## O que as frases nunca afirmam

Redução registrada **não** é atribuída a fadiga, falta de motivação, lesão nem
erro de treino. Estabilidade prolongada (mesma referência em 4 sessões ou mais,
`PROLONGED_STABILITY_SESSIONS`) é priorização de leitura, **não** diagnóstico de
platô. Carga e repetições não sustentam conclusão sobre qualidade técnica,
recuperação, dor, overtraining, hipertrofia, gordura localizada ou força
isolada de um músculo.

## Consistência sem porcentagem inventada

O denominador só existe quando há programação **histórica** confiável — os dias
das etapas do ciclo, cujas datas são fixas. Sem isso o indicador mostra
`14 treinos realizados`, sem percentual. A escala semanal solta é estado ATUAL
e não pode dizer o que estava previsto há dois meses.

A mesma escala semanal **pode** ser usada para o "Próximo passo", porque ali
ela descreve o futuro, que é o que ela é.

## Séries por semana

Agrupamento por duração do período: até 10 dias vira **dia**, acima de 180 dias
vira **mês**, no meio é **semana**. Intervalos vazios continuam na tela — é a
diferença entre treinar toda semana e concentrar tudo em duas sessões. Semana
parcial tem o rótulo recortado pelo período, para não anunciar dias que não
foram olhados.

## Limitações reais desta entrega

- O atlas é **esquemático**. Ele separa e destaca as regiões com precisão, mas
  não tem o detalhe de uma ilustração anatômica profissional.
- Força estimada continua sendo **estimativa**, e a interface sempre a rotula
  assim.
- A migration 0045 depende de `ALTER TYPE … ADD VALUE`, que não roda dentro de
  bloco de transação explícito — por isso o arquivo não abre `begin/commit`.
- `0038_account_billing.sql` continua sem aplicar (falha com
  `relation "account_subscriptions" already exists`); veio de outra frente e
  não faz parte desta.
