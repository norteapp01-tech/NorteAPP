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
outro. "Zerar" mexe **só** no descanso; nenhuma série registrada é tocada.

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
