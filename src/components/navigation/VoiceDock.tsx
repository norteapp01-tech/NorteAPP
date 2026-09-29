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
        onClick={onVoice}
        className="norte-voice-mic interactive-press"
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
