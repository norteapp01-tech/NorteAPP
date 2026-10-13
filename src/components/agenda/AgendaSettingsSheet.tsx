import { Modal } from "@/components/ui/modal";
import { GoogleCalendarSection } from "./GoogleCalendarSection";
import "./agenda-ui.css";

/** Atalho do Google Agenda: conectar, escolher agendas e sincronizar.
 * As demais preferências da Agenda ficam em Configurações → Preferências. */
export function AgendaSettingsSheet({
  onClose,
  connectingGoogle = false,
}: {
  onClose: () => void;
  /** O app está concluindo a conexão com o Google (voltou do consentimento). */
  connectingGoogle?: boolean;
}) {
  return (
    <Modal onClose={onClose} title="Google Agenda">
      <GoogleCalendarSection connectingExternally={connectingGoogle} />
    </Modal>
  );
}
