# Esportes — Visão geral, histórico e rotas salvas

Reformulação da página de Esportes com foco na Corrida. O que mudou, por quê, e
o que deliberadamente não foi feito.

## Arquitetura da página

As abas do topo passaram de três para duas: **Visão geral** e **Planejamento**.

O histórico não sumiu — ele deixou de ser aba e virou uma **tela cheia** aberta
por "Ver todas", em Atividade recente. Histórico é consulta pontual; ocupar um
terço da navegação principal com ele empurrava para o fundo as duas coisas que
realmente competem pela atenção.

Ordem da Visão geral:

1. Bloco de início (solto no fundo preto, sem card)
2. Sua semana — dois cards do mesmo tamanho
3. Evolução — carrossel de três faces
4. Atividade recente + "Ver todas"
5. "Planejar próxima atividade"

## Cálculos (`src/lib/sport-analytics.ts`)

Funções puras, sem I/O, todas testadas. Três regras atravessam o arquivo:

1. **Ritmo semanal é ponderado**: tempo ativo total ÷ distância total. A média
   das médias faria uma corrida de 1 km pesar igual a uma de 15 km.
2. **Atividade sem distância não entra no ritmo.** Um registro manual de
   "30 min" sem km não torna a semana mais lenta; ele só não responde à
   pergunta "qual foi meu ritmo". Ele continua contando na frequência.
3. **Semana vazia continua na série.** Esconder a semana sem treino
   transformaria uma pausa em constância.

As três faces do carrossel leem a **mesma** série (`weeklyMetricsSeries`), então
não há como discordarem entre si.

### Consistência

Conta apenas atividades **concluídas** na semana. Planejada nunca conta como
feita. Sem meta configurada não existe denominador: o card mostra o realizado e
oferece definir a meta, em vez de inventar um "de 3".

### Próxima corrida

Primeira execução de esportes ainda **não concluída**, de hoje em diante,
desempatando por horário. Exclui concluída, perdida, cancelada e reagendada —
uma execução reagendada foi substituída por outra, e anunciá-la apontaria para
uma data que não vale mais.

## Carrossel de análise

Um prisma retangular de três faces: ritmo (velocidade, no ciclismo),
frequência e volume.

O gesto vertical compete com a rolagem da página, então ele **não** é capturado
no gráfico inteiro. Só na faixa lateral — visível, com `touch-action: none`, e
que também traz as setas e os três indicadores. Fora dela a página rola normal.

Além do gesto: setas, clique no indicador, clique no título, teclado (`Enter`/
espaço) e um `role="status"` anunciando a face atual. O gesto é atalho, nunca o
único caminho.

`prefers-reduced-motion` desliga a perspectiva e a rotação inteiras e troca por
opacidade — não é uma animação mais curta, é ausência de rotação.

No ritmo o eixo é **invertido** (mais rápido em cima) com o rótulo
"mais rápido ↑", porque um gráfico de ritmo se lê ao contrário de todos os
outros e nada no desenho avisa isso sozinho.

### Estados

`faceDataState` distingue três situações que não podem virar a mesma tela:
sem atividades, uma única semana com registro (mostra o número e diz que falta
histórico, sem traçar uma reta que sugeriria tendência) e dados suficientes.

## Histórico em tela cheia

`FullScreenSheet` (novo, em `components/ui/modal.tsx`) reaproveita a base Radix
do Modal, então Escape, trava de rolagem do fundo, foco inicial e trap de Tab
vêm de graça e se comportam igual ao resto do app.

Estado padrão é a **semana inteira**. Tocar num dia filtra; tocar de novo no
mesmo dia — ou em "Ver a semana inteira" — volta ao padrão. Sem essa volta,
escolher um dia viraria um beco sem saída.

O seletor usa o `WeekdaySelector` do design system, com as datas reais e um
ponto discreto nos dias que têm atividade.

## Rotas salvas

### Modelo

`sport_routes` (0035) guardava só **desenho** no mapa. Agora a mesma tabela
também recebe o percurso de uma gravação real: é a mesma coisa para quem usa
("minha rota do parque"), e uma segunda tabela paralela faria o app ter dois
conceitos de rota que o usuário nunca distinguiu. O que separa as origens é
`source_activity_id` — nulo = desenhada, preenchido = salva de uma corrida.

Duas colunas de ponta (`start_lat/lng`, `end_lat/lng`) existem porque a
comparação de rotas precisa delas em toda consulta, e varrer o jsonb de pontos
para achar as pontas ficaria caro conforme o histórico cresce.

`sport_route_attempts` é tabela nova, com `unique (activity_id)`: uma atividade
é tentativa de no máximo uma rota. Sem isso, uma confirmação duplicada faria a
rota contar a mesma corrida duas vezes nos recordes.

**A distinção que importa**: `sport_activities.route_id` é a *intenção* (de qual
rota a gravação partiu); a tentativa é o *fato*. Manter os dois separados é o
que permite dizer "esta corrida parece a rota X" sem já tê-la vinculado.

### Correspondência (`sport-route-match.ts`)

Critérios obrigatórios para sequer pontuar: mesma modalidade, pontas a menos de
120 m e distância dentro de 12%. O formato do traço só refina a pontuação.

**Na dúvida, não vincula.** Toda correspondência — inclusive as de alta
confiança — volta como proposta que precisa de confirmação, com três saídas:
confirmar, escolher outra rota ou salvar como nova. Uma sugestão errada
contamina os recordes de uma rota inteira e a pessoa não tem como perceber.

A única exceção é a atividade **iniciada** por uma rota salva: ali o vínculo é
explícito desde o começo, então ela nasce vinculada.

Sem PostGIS: o projeto inteiro trabalha com lat/lng em jsonb, e puxar uma
extensão geoespacial por uma heurística seria uma dependência de infraestrutura
desproporcional.

### Gráfico de evolução da rota

Um gráfico só, alternado entre tempo e ritmo. Numa distância fixa os dois são
praticamente a mesma curva — mostrá-los lado a lado sugeriria duas informações
onde há uma. Com uma execução só, os números aparecem sem tendência desenhada.

## Limitações reais

- A correspondência de rota é **heurística**, não geometria exata. Ela erra para
  o lado de não sugerir: percursos parecidos mas com pontas distantes não
  aparecem, e nenhuma sugestão vincula sozinha.
- Comparar o traço amostra 12 pontos por índice, não por distância percorrida.
  Funciona bem para percursos gravados com cadência regular de GPS; um percurso
  com longos trechos sem sinal pode pontuar mais baixo do que deveria.
- A rotação do prisma é CSS 3D. Em navegadores sem `preserve-3d` confiável o
  resultado degrada para a troca de opacidade — o mesmo caminho do
  `prefers-reduced-motion`.
- A privacidade existente (ocultar rota, ocultar início/fim) é respeitada nas
  miniaturas, mas a **rota salva** guarda o percurso real. Quem oculta a rota de
  uma atividade e depois a salva como rota está salvando o traço — a interface
  não esconde isso, mas também não avisa. Fica anotado como ponto a melhorar.
