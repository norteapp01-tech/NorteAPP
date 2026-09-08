# Norte — guia rápido de componentes

Este documento registra o padrão visual oficial do beta. Ele não redefine telas: evita que componentes equivalentes ganhem linguagens diferentes.

## Navegação e menus

- **Menu de contexto do cabeçalho:** `AppMenuButton`; ícone `Ellipsis` de 20 px, área de toque de 44 px, sem círculo, borda ou fundo permanente.
- **Abas internas:** `UnderlineTabs`; altura de 52 px, texto semibold de 13 px, divisor neutro e sublinhado verde de 2 px somente no item ativo.
- **Filtros:** podem continuar como pills/segmented controls. Pills indicam seleção de dados; nunca devem substituir abas de navegação.
- **Voltar:** ícone outline de 20 px em alvo mínimo de 44 px.

## Seletores

- **Semana:** `WeekdaySelector`, cuja referência oficial é Academia. Ordem Seg–Dom, grid de sete colunas, gap de 6 px, cards com mesmo padding e destaque verde discreto para hoje/seleção.
- **Escalas e períodos:** mantêm controle segmentado quando alteram a granularidade do mesmo conteúdo, como Dia/Semana/Mês em cronogramas.

## Superfícies

- **Card de conteúdo:** classe `card-surface`; borda neutra, fundo `surface`, raio do Design System. Verde na borda apenas para foco/estado atual.
- **Linha de lista:** separadores internos em vez de um card novo para cada item da mesma coleção.
- **Modal/gaveta:** componente `Modal`; título à esquerda, fechar à direita, overlay e transições padronizados.

## Ações e estados

- **Ação primária:** fundo verde, texto `primary-foreground`; uma ação dominante por contexto.
- **Ação secundária:** contorno neutro ou texto; verde apenas no ícone/texto quando necessário.
- **Badge:** reservado para estado curto (`Atual`, `Próxima`, `Atrasada`). Filtros e botões não usam badge.
- **Conclusão:** círculo/check outline consistente; entrada do check usa `check-enter` e respeita `prefers-reduced-motion`.

## Ícones e movimento

- **Ícones de interface e categoria:** Lucide outline, `strokeWidth` entre 1.8 e 2; emojis ficam restritos a conteúdo expressivo escolhido pelo usuário, como humor.
- **Troca de página:** fade com deslocamento de 4 px em 180 ms.
- **Toque:** escala entre 0.98 e 0.99 em botões/cards interativos, sem animação quando o sistema solicita movimento reduzido.
- Movimento deve explicar transição ou confirmar ação; nunca ser decorativo.

## Acessibilidade

- Alvo de toque mínimo: 44×44 px em ações isoladas.
- Estado ativo não depende apenas de cor: abas usam também sublinhado; seletores usam borda e fundo.
- Todos os controles iconográficos precisam de `aria-label`.
- Contraste mínimo AA para textos funcionais.
