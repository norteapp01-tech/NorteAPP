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
