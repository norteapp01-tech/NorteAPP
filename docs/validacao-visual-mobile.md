# Revisão visual e mobile — 29/09/2026

## Alterações

- Identidade compartilhada em `src/mobile-identity.css`: verde-menta, iluminação âmbar, espaçamentos, títulos, proporções e controles para celular.
- Recorte superior direito nos cards da Home e destaque dinâmico do próximo passo, conectado à ação existente.
- Proporções dos módulos de Academia, Esportes, Leitura e Alimentação ajustadas sem comprimir todo o conteúdo em uma única tela. Conteúdo longo continua rolável.
- Fundo luminoso único no shell substitui efeitos independentes que provocavam inconsistência e transbordamento horizontal.
- Botão de programa separado da barra de progresso; modalidades e ações de Esportes legíveis em telas estreitas.
- Área inferior reserva espaço para o controle de voz e a área segura do telefone. Mantida a navegação por voz aprovada posteriormente às imagens com a barra antiga.
- Referências de Finanças (Visão/Registros) e Fé (Registros/Orações) estavam com os nomes invertidos; os arquivos foram corrigidos sem alterar as imagens.

## Validação reproduzível

Com o servidor local em execução, executar `node scripts/check-design-system.mjs`.
O teste usa dados fictícios isolados, intercepta o backend e bloqueia requisições externas; não modifica dados reais.

- 12 rotas principais, incluindo o detalhe de plano.
- Abas internas em 320, 375, 390 e 430 pixels de largura.
- Temas claro e escuro; ausência de transbordamento horizontal e erros de execução.
- Interações existentes de gráficos, filtros, abas por teclado e seções expansíveis.
- Capturas completas em `/tmp/norte-harmony` por padrão, configurável por `AUDIT_OUTPUT`.
- 387 testes unitários aprovados; TypeScript e build de produção aprovados.

## Limites da conferência

Esta revisão não é uma certificação de igualdade pixel a pixel: as referências são imagens raster com dimensões e dados diferentes, e as fotografias disponíveis no aplicativo não são todas idênticas às composições das referências. Os dados reais continuam determinando títulos, contagens e estados vazios.

As larguras foram simuladas no Chromium. Ainda é necessário conferir em aparelhos físicos (Safari/iOS e Chrome/Android), incluindo teclado, permissões de microfone e áreas seguras. As capturas de rolagem mostram o controle de voz na posição fixa do viewport; ele não se repete ao longo da página.
