# Conversa Norte — vidro e digitação

- A entrada por voz revela o vidro a partir do centro do microfone em 680 ms. A barra com canto recortado se arredonda em 580 ms.
- O vidro permanece atrás da conversa; durante a gravação o desfoque aumenta suavemente. Mensagens anteriores continuam visíveis, sem trocar para outra página a cada áudio.
- Mensagens em superfícies pretas, cards com recorte superior direito e iluminação âmbar discreta. Horário, calendário e microfone usam o menta #91f5da.
- A digitação expande a barra lateralmente e para cima em 450 ms. O campo recebe foco no toque; o teclado utilizado é o nativo do aparelho. O navegador controla a aparência e a animação do teclado do sistema.
- O tamanho da conversa acompanha o visualViewport, mantendo o campo acima do teclado. Recolher a digitação preserva o rascunho.
- Menu, anexos de texto, gravação com parada manual/por silêncio, confirmações e edição de cards continuam disponíveis. Sair da conversa encerra a captura de áudio.
- Com redução de movimento ativa, a interface troca de estado sem animações.

Validação: `npm test -- src/components/NorteChat.voice.test.tsx` cobre envio por voz, permissão negada, envio digitado, rascunho e encerramento da captura. Com o servidor em 127.0.0.1:4173, `node scripts/check-norte-conversation.mjs` confere larguras de 320, 390 e 430 pixels, foco, navegação e redução de movimento, com dados fictícios e acesso externo bloqueado. Capturas são salvas em /tmp/norte-conversation.

O teste visual em Chromium não substitui o teste de teclado e microfone em iPhone/Android físicos.
