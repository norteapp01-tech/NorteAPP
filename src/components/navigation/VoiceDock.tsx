import { Keyboard, Menu, Mic } from "lucide-react";

export function VoiceDock({
  onVoice,
  onKeyboard,
  onMenu,
}: {
  onVoice: () => void;
  onKeyboard: () => void;
  onMenu: () => void;
}) {
  return (
    <div
      className="norte-voice-dock norte-pulse-dock"
      role="group"
      aria-label="Conversa com o Norte"
    >
      <button
        type="button"
        onClick={onMenu}
        className="pulse-side interactive-press"
        aria-label="Abrir mais funções"
      >
        <Menu size={24} />
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
