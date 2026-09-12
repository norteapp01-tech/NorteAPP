import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ChevronLeft, Mic, Send, Square, Wrench } from "lucide-react";
import { runAgentTurn, type ChatTurn } from "@/lib/agent/run-agent";
import { transcribeAudio } from "@/lib/agent/chat.functions";
import { getAccessToken } from "@/lib/supabase/client";

export const Route = createFileRoute("/agente-teste")({
  head: () => ({ meta: [{ title: "Agente Norte — teste" }] }),
  component: AgentTestPage,
});

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function AgentTestPage() {
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      role: "assistant",
      text: "Oi. Sou o Agente Norte, em modo de teste — sem WhatsApp ainda, só essa página. Pode mandar texto ou áudio, do jeito que falaria de verdade.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError("");
    const userTurn: ChatTurn = { role: "user", text: trimmed };
    setTurns((t) => [...t, userTurn]);
    setDraft("");
    try {
      const reply = await runAgentTurn([...turns], trimmed);
      setTurns((t) => [...t, reply]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao falar com o agente.");
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setTranscribing(true);
        try {
          const base64 = await blobToBase64(blob);
          const accessToken = await getAccessToken();
          const { text } = await transcribeAudio({
            data: { audioBase64: base64, mimeType, accessToken },
          });
          if (text.trim()) await send(text);
          else setError("Não entendi o áudio — pode repetir ou digitar?");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Falha ao transcrever o áudio.");
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Não consegui acessar o microfone — verifique a permissão do navegador.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <a
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface"
        >
          <ChevronLeft className="h-5 w-5" />
        </a>
        <div>
          <p className="text-sm font-bold">Agente Norte</p>
          <p className="text-[11px] text-muted-foreground">
            ambiente de teste · sem WhatsApp ainda
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {turns.map((turn, i) => (
          <div key={i} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%]">
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm ${
                  turn.role === "user" ? "bg-primary text-primary-foreground" : "card-surface"
                }`}
              >
                {turn.text}
              </div>
              {turn.toolTrace && turn.toolTrace.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {turn.toolTrace.map((tc, j) => (
                    <div
                      key={j}
                      className="flex items-start gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[10px] text-muted-foreground"
                    >
                      <Wrench className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>
                        <code className="font-semibold text-foreground">{tc.name}</code>
                        {" · "}
                        {tc.result}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {turn.pendingActions && turn.pendingActions.length > 0 && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => send("Confirmo")}
                    disabled={sending}
                    className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                  >
                    Confirmar
                  </button>
                  <button
                    onClick={() => send("Cancelar")}
                    disabled={sending}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {(sending || transcribing) && (
          <div className="flex justify-start">
            <div className="card-surface px-4 py-2.5 text-sm text-muted-foreground">
              {transcribing ? "transcrevendo…" : "…"}
            </div>
          </div>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send(draft);
            }}
            placeholder="Manda uma mensagem…"
            disabled={sending || recording || transcribing}
            className="flex-1 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={sending || transcribing}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40 ${
              recording ? "bg-danger text-white" : "bg-surface-2 text-foreground"
            }`}
          >
            {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button
            onClick={() => send(draft)}
            disabled={!draft.trim() || sending || recording || transcribing}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
