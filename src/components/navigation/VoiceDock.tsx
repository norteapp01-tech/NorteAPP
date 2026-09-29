import { Keyboard, Mic, Plus } from "lucide-react";

export function VoiceDock({
  onVoice,
  onKeyboard,
  onCreate,
}: {
  onVoice: () => void;
  onKeyboard: () => void;
  onCreate: () => void;
}) {
  return (
    <div
      className="norte-voice-dock norte-pulse-dock"
      role="group"
      aria-label="Conversa com o Norte"
    >
      <button
        type="button"
        onClick={onCreate}
        className="pulse-side interactive-press"
        aria-label="Adicionar no Norte"
      >
        <Plus size={26} />
      </button>

      <button
        type="button"
        onClick={onVoice}
        className="pulse-microphone interactive-press"
        aria-label="Conversar por voz com o Norte"
      >
        <Mic className="h-7 w-7" strokeWidth={2} />
      </button>

      <button
        type="button"
        onClick={onKeyboard}
        className="pulse-side interactive-press"
        aria-label="Abrir teclado da conversa"
      >
        <Keyboard className="h-5 w-5" strokeWidth={1.8} />
      </button>
    </div>
  );
}
