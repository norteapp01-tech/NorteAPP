# Conversa Norte — vidro e digitação

- A entrada por voz começa na tela atual: em 520 ms, a barra recolhe as laterais até o círculo. A coluna central e a posição vertical permanecem estáveis, com a mesma geometria de recorte durante a interpolação.
- O chat continua diretamente desse círculo e o abre em 720 ms, sem recriar uma barra larga. A repetição de áudio dentro do chat usa uma sanfona de 1120 ms. Transcrição e processamento mantêm a cápsula até a resposta, evitando um retorno prematuro à barra.
- O vidro começa 80 ms após o início da expansão e cresce em 1100 ms com aceleração e desaceleração suaves. O desfoque tem uma única camada e acompanha essa entrada. Cabeçalho e mensagens aparecem gradualmente na segunda metade.
- Uma pulsação discreta de 2800 ms acompanha o início da escuta. As duas bolhas têm ciclos lentos de 8 e 10 segundos em sentidos diferentes. A pulsação de um novo áudio só começa depois da compressão.
- O vidro permanece atrás da conversa; durante a gravação o desfoque aumenta suavemente. Mensagens anteriores continuam visíveis, sem trocar para outra página a cada áudio.
- Mensagens em superfícies pretas, cards com recorte superior direito e iluminação âmbar discreta. Horário, calendário e microfone usam o menta #91f5da.
- A digitação expande a barra lateralmente e para cima em 450 ms. O campo recebe foco no toque; o teclado utilizado é o nativo do aparelho. O navegador controla a aparência e a animação do teclado do sistema.
- O tamanho da conversa acompanha o visualViewport, mantendo o campo acima do teclado. Recolher a digitação preserva o rascunho.
- Menu, anexos de texto, gravação com parada manual/por silêncio, confirmações e edição de cards continuam disponíveis. Sair da conversa encerra a captura de áudio.
- Com redução de movimento ativa, a interface troca de estado sem animações.

Validação: `npm test -- src/components/NorteChat.voice.test.tsx` cobre envio por voz, permissão negada, envio digitado, rascunho e encerramento da captura. Com o servidor em 127.0.0.1:4173, `node scripts/check-norte-conversation.mjs` confere larguras de 320, 390 e 430 pixels, foco, navegação e redução de movimento, com dados fictícios e acesso externo bloqueado. Capturas são salvas em /tmp/norte-conversation.

O teste visual também amostra os quadros da entrada para detectar saltos verticais/laterais e a reaparição indevida de uma barra larga. `AUDIT_VIDEO=1 AUDIT_WIDTHS=390 node scripts/check-norte-conversation.mjs` grava a demonstração local em /tmp/norte-conversation/motion-preview.webm. O teste visual em Chromium não substitui o teste de teclado e microfone em iPhone/Android físicos.
