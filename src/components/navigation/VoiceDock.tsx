import { Keyboard, Menu, Mic } from "lucide-react";

export function VoiceDock({
  onVoice,
  onKeyboard,
  onMenu,
  launching = false,
}: {
  onVoice: () => void;
  onKeyboard: () => void;
  onMenu: () => void;
  launching?: boolean;
}) {
  return (
    <div
      className={`norte-voice-dock norte-pulse-dock ${launching ? "is-launching" : ""}`}
      role="group"
      aria-label="Conversa com o Norte"
      aria-busy={launching}
    >
      <button
        type="button"
        onClick={onMenu}
        disabled={launching}
        className="pulse-side interactive-press"
        aria-label="Abrir mais funções"
      >
        <Menu size={24} />
      </button>

      <button
        type="button"
        onClick={onVoice}
        disabled={launching}
        className="pulse-microphone interactive-press"
        aria-label="Conversar por voz com o Norte"
      >
        <Mic className="h-7 w-7" strokeWidth={2} />
      </button>

      <button
        type="button"
        onClick={onKeyboard}
        disabled={launching}
        className="pulse-side interactive-press"
        aria-label="Abrir teclado da conversa"
      >
        <Keyboard className="h-5 w-5" strokeWidth={1.8} />
      </button>
    </div>
  );
}
