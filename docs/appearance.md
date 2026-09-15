# Aparência do Norte

Configurações → Preferências → Aparência permite escolher Escuro ou Claro.
A escolha é local ao aparelho e persiste no navegador, inclusive no cadastro e na introdução. Não exige migração SQL. O padrão é Escuro.

## Referências aprovadas

- Escuro: fundo preto puro, cards grafite `#191e20`, borda `#353d40`, texto secundário `#adb3bf`, verde `#87ed85`. Sem vidro brilhante ou halo.
- Claro: fundo `#f8faf9`, superfícies leitosas com brilho interno discreto, sombra suave e texto `#101412`. Verde escuro `#14572a` para contraste; o botão central mantém o verde vivo.
- Barra inferior flutuante com cinco destinos e botão circular central levemente elevado, com contorno acompanhando a parte saliente. A mesma geometria vale para ambos os temas.

## Componentes

Usar tokens semânticos de `styles.css`, `card-surface`, `bg-surface` e `bg-popover`. Evitar cores claras/escuras fixas em conteúdo da interface. Identidades de provedores, capas, fotos e cores de rotas no mapa mantêm suas cores próprias.
Formulários usam superfícies estáveis para leitura. Títulos, ordem do conteúdo, recursos e tipografia existentes são preservados.
O script no cabeçalho restaura o tema antes da primeira pintura. A raiz controla variantes dark, controles nativos e a cor da interface do navegador.
O efeito de translucidez do tema claro tem fallback sólido e respeita redução de transparência; animações continuam respeitando redução de movimento.

## Verificação

Testes da preferência cobrem persistência, restauração, valor inválido e armazenamento indisponível. Revisão em navegador usa sessão e dados simulados, sem escrever em contas reais.
