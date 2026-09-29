import { useState } from "react";
import { Keyboard, Mic } from "lucide-react";

function Waveform({ reverse = false }: { reverse?: boolean }) {
  const bars = [8, 14, 25, 38, 22, 32, 18, 11, 6];
  return (
    <span className={`norte-voice-wave ${reverse ? "is-reversed" : ""}`} aria-hidden="true">
      {bars.map((height, index) => (
        <i key={index} style={{ height, animationDelay: `${index * -85}ms` }} />
      ))}
    </span>
  );
}

export function VoiceDock({
  onVoice,
  onKeyboard,
}: {
  onVoice: () => void;
  onKeyboard: () => void;
}) {
  // Pulso de disparo único no toque do microfone — o "morph" da referência,
  // sem um passo de pill-de-status que não existe aqui. Limpo pelo próprio
  // fim da animação (mesmo padrão de check-enter/page-enter em styles.css),
  // nunca preso em "true" se o clique disparar mais rápido que o CSS carrega.
  const [pulsing, setPulsing] = useState(false);

  return (
    <div className="norte-voice-dock" role="group" aria-label="Conversa com o Norte">
      <button
        type="button"
        onClick={onKeyboard}
        className="norte-voice-copy interactive-press"
        aria-label="Abrir conversa com o Norte"
      >
        Fale com o Norte
      </button>

      <Waveform />

      <button
        type="button"
        onClick={() => {
          setPulsing(true);
          onVoice();
        }}
        onAnimationEnd={() => setPulsing(false)}
        className={`norte-voice-mic interactive-press ${pulsing ? "is-pulsing" : ""}`}
        aria-label="Conversar por voz com o Norte"
      >
        <Mic className="h-7 w-7" strokeWidth={2} />
      </button>

      <Waveform reverse />

      <button
        type="button"
        onClick={onKeyboard}
        className="norte-voice-keyboard interactive-press"
        aria-label="Abrir teclado da conversa"
      >
        <Keyboard className="h-5 w-5" strokeWidth={1.8} />
      </button>
    </div>
  );
}
