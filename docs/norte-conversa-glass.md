# Conversa Norte — vidro e digitação

- A entrada por voz começa na tela atual: em 360 ms, a barra com menu e teclado recolhe as laterais e vira o círculo do microfone. O chat só entra depois desse fechamento.
- Ao entrar e a cada novo áudio, o círculo se abre como uma sanfona até a cápsula única “Ouvindo…” em 660 ms. Os controles laterais desaparecem durante a compressão, portanto não existe uma segunda barra atrás da cápsula.
- O vidro cresce do mesmo ponto do microfone em 680 ms. Duas superfícies elípticas se movem em sentidos e ritmos diferentes para manter o aspecto líquido sem acelerar a leitura da tela.
- O vidro permanece atrás da conversa; durante a gravação o desfoque aumenta suavemente. Mensagens anteriores continuam visíveis, sem trocar para outra página a cada áudio.
- Mensagens em superfícies pretas, cards com recorte superior direito e iluminação âmbar discreta. Horário, calendário e microfone usam o menta #91f5da.
- A digitação expande a barra lateralmente e para cima em 450 ms. O campo recebe foco no toque; o teclado utilizado é o nativo do aparelho. O navegador controla a aparência e a animação do teclado do sistema.
- O tamanho da conversa acompanha o visualViewport, mantendo o campo acima do teclado. Recolher a digitação preserva o rascunho.
- Menu, anexos de texto, gravação com parada manual/por silêncio, confirmações e edição de cards continuam disponíveis. Sair da conversa encerra a captura de áudio.
- Com redução de movimento ativa, a interface troca de estado sem animações.

Validação: `npm test -- src/components/NorteChat.voice.test.tsx` cobre envio por voz, permissão negada, envio digitado, rascunho e encerramento da captura. Com o servidor em 127.0.0.1:4173, `node scripts/check-norte-conversation.mjs` confere larguras de 320, 390 e 430 pixels, foco, navegação e redução de movimento, com dados fictícios e acesso externo bloqueado. Capturas são salvas em /tmp/norte-conversation.

O teste visual em Chromium não substitui o teste de teclado e microfone em iPhone/Android físicos.
