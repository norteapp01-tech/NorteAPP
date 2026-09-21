# Norte — contrato visual

## Intenção

Uma experiência contínua entre Hoje, Agenda, Plano, Espelho e rotinas. Harmonizar apresentação sem apagar diferenças funcionais, modificar cálculos ou remover históricos.

## Fonte de verdade

- `src/styles.css`: paleta semântica e materiais dos temas.
- `src/brand.css`: escala tipográfica, geometria, espaços e apresentação dos gráficos.
- `components/ui/app-design-system.tsx`: menu, abas sublinhadas e seletor semanal.
- `components/ui/progress-ring.tsx`: progresso/consistência circular.
- `components/ui/norte-chart-theme.ts`: linhas, pontos, eixos e tooltip.

## Material e hierarquia

- Fundo preto; cards padrão em grafite neutro `#191a1c`, apoio em `#131416`, controles em `#26282b`; bordas neutras `#333639`/`#2b2d30`. Superfícies escuras planas, sem brilho decorativo.
- `card-surface-featured` (`#151e1a`) é opt-in: no máximo um card principal por visão. A maioria deve continuar neutra, incluindo lembretes, hidratação e humor.
- Verde `#87ed85` para ação principal, seleção e progresso com dados. Ícones decorativos, navegação secundária e estados vazios ficam cinza. Bordas verdes indicam seleção/etapa atual, não decoram todos os cards. Rotinas na Hoje preservam os ícones de marca em verde.
- No tema claro, usar o verde escuro semântico, nunca o verde claro como texto sobre branco.
- Branco para conteúdo principal; cinza para contexto. Avisos e perdas mantêm cores semânticas e rótulos; não dependem só da cor.
- Cards principais com raio de 20px; controles e itens internos com 12px. Espaçamento interno regular de 18px, compacto de 12–16px; separação de seções em 24px.
- Seções secundárias e gráficos podem ficar diretamente no fundo, com divisórias discretas. Não colocar uma caixa em volta de cada informação.

## Tipografia

- Inter/sistema, números tabulares. Título de página 28/700; cabeçalho compacto de rotina 20/700; introdução de análise 24/700; título de seção 18/600.
- Conteúdo 14px; controles/metadados 12–13px; notas/eixos 11px. Caixa alta apenas para rótulos pequenos, nunca como padrão de título de card.
- Títulos de rotina centralizados na mesma grade; páginas principais têm título à esquerda. Essa diferença indica nível de navegação, não marca diferente.

## Gráficos

- Linhas de 2px, cantos arredondados, pontos de 3px e destaque de 5px. Usar segmentos lineares para registros discretos, sem curvas que sugiram medições extras.
- Eixos 11px em cinza; grade discreta; tooltip com mesmo material, raio de 12px e valores/unidades preservados.
- Progresso circular: viewBox 100, raio 42, espessura 8, início às 12h. Valor desconhecido é neutro, não zero; o arco é limitado a 100%, mas contagens reais não são truncadas.
- Distribuição financeira mantém segmentos e legenda clicáveis: distribuição e cumprimento não são a mesma métrica. Usa a mesma proporção visual do anel.
- Mapas anatômicos, rotas geográficas e Gantt não recebem estilos genéricos de gráficos de linha.

## Interação e responsividade

- Abas principais sublinhadas; filtros locais em controle segmentado de grafite. Abas suportam setas, Home/End e foco visível.
- Botão padrão com 44px; componentes compactos respeitam contexto. Cor nunca é a única indicação de seleção.
- No mobile estreito, preservar rótulos legíveis: Finanças usa “Registros” e “Planejar”; legenda financeira empilha abaixo do anel.
- Respeitar tema claro/escuro e redução de movimento. Dados, filtros e estados vazios continuam funcionais.
- Detalhes secundários podem usar `norte-disclosure`: resumo visível, seta, teclado nativo e conteúdo recolhido fora da navegação por Tab. Gastos recentes abre ao selecionar uma categoria; trocar de mês limpa esse filtro. Extras de hoje usa a mesma gaveta. Não esconder a ação do dia nem o gráfico principal.

## Verificação

`node scripts/check-design-system.mjs` percorre telas principais e rotinas com fixtures isoladas em 320/390px e ambos os temas. Capturas em `/tmp/norte-harmony`. Testes específicos de evolução, círculos e compilação complementam a auditoria. Não confundir screenshots com deploy de produção confirmado.
