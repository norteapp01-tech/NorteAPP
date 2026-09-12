import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, Compass, Mic, Paperclip, Square } from "lucide-react";
import { runAgentTurn, type ChatTurn } from "@/lib/agent/run-agent";
import { transcribeAudio } from "@/lib/agent/chat.functions";
import { useSupabaseUserId } from "@/lib/supabase/client";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { AppMenuButton } from "@/components/ui/app-design-system";
import { AgentCard, parseCard, type CardData } from "./AgentCard";

const labels: Record<string, [string, string]> = {
  criar_plano: ["Planejamento", "/planejamento"],
  criar_execucao: ["Novo compromisso", "/agenda"],
  reagendar_execucao: ["Reagendar compromisso", "/agenda"],
  consultar_dia: ["Seu dia", "/agenda"],
  registrar_transacao: ["Movimentação", "/sub-agenda/financas"],
  consultar_financas: ["Finanças", "/sub-agenda/financas"],
  registrar_refeicao: ["Confirmar refeição", "/sub-agenda/alimentacao"],
};
function domain(name: string, area?: unknown): [string, string] {
  if (labels[name]) return labels[name];
  const category = String(
    area ||
      (name.includes("treino") || name.includes("serie") || name.includes("peso")
        ? "academia"
        : name.includes("leitura")
          ? "leitura"
          : name.includes("fe")
            ? "fe"
            : ""),
  );
  return [
    category ? category.charAt(0).toUpperCase() + category.slice(1) : "Registro Norte",
    category ? `/sub-agenda/${category}` : "/",
  ];
}
const fieldLabels: Record<string, string> = {
  title: "Título",
  why: "Objetivo",
  deadlineLabel: "Prazo",
  deadlineISO: "Até",
  date: "Data",
  dueDate: "Prazo",
  agendaDate: "Dia",
  startTime: "Início",
  endTime: "Fim",
  amount: "Valor",
  description: "Descrição",
  category: "Categoria",
  amountMl: "Água (ml)",
  weight: "Peso (kg)",
  reps: "Repetições",
  content: "Anotação",
  bookTitle: "Livro",
};

export function NorteChat({
  onBack,
  demo = false,
  onDemoComplete,
}: {
  onBack: () => void;
  demo?: boolean;
  onDemoComplete?: () => void;
}) {
  const userId = useSupabaseUserId();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [recording, setRecording] = useState(false);
  const lock = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const bottom = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const successfulReplies = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current) recorder.current.onstop = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!userId) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`norte-chat:${userId}`) || "[]");
      setTurns(
        Array.isArray(saved)
          ? saved
              .filter((t) => ["user", "assistant"].includes(t.role) && typeof t.text === "string")
              .slice(-100)
          : [],
      );
    } catch {
      setTurns([]);
    }
    setReady(true);
  }, [userId]);
  useEffect(() => {
    if (ready && userId) {
      try {
        localStorage.setItem(`norte-chat:${userId}`, JSON.stringify(turns.slice(-100)));
      } catch {
        /* Conversation remains available in this session. */
      }
    }
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, ready, userId]);

  async function send(text: string) {
    if (!text.trim() || lock.current || !ready) return;
    if (demo && Number(sessionStorage.getItem(`norte-demo-replies:${userId}`) || 0) >= 3) {
      onDemoComplete?.();
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setDraft("");
    setTurns((old) => [...old, { role: "user", text: text.trim() }]);
    try {
      const reply = await runAgentTurn(turns.slice(-30), text.trim());
      if (mounted.current) {
        setTurns((old) => [...old, reply]);
        if (demo) {
          successfulReplies.current =
            Number(sessionStorage.getItem(`norte-demo-replies:${userId}`) || 0) + 1;
          sessionStorage.setItem(`norte-demo-replies:${userId}`, String(successfulReplies.current));
          if (successfulReplies.current >= 3) onDemoComplete?.();
        }
      }
    } catch {
      if (mounted.current) {
        setError("A conexão foi interrompida. Confira os registros antes de repetir uma ação.");
        setTurns((old) => [
          ...old,
          {
            role: "assistant",
            text: "Não consegui terminar a resposta. Confira os registros antes de repetir uma ação.",
          },
        ]);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function startAudio() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      recorder.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setBusy(true);
        try {
          const blob = new Blob(chunks, { type: rec.mimeType });
          if (blob.size > 10 * 1024 * 1024)
            throw new Error("Áudio muito longo. Grave uma mensagem menor.");
          const audioBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.readAsDataURL(blob);
          });
          const result = await transcribeAudio({ data: { audioBase64, mimeType: rec.mimeType } });
          if (mounted.current) setDraft(result.text);
        } catch {
          if (mounted.current) setError("Não foi possível transcrever. Tente novamente ou digite.");
        } finally {
          if (mounted.current) setBusy(false);
        }
      };
      rec.start();
      setRecording(true);
    } catch {
      setError("Permita o microfone para gravar uma mensagem.");
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }
  }
  return (
    <section
      className="flex min-h-[calc(100dvh-112px)] flex-col px-5 pt-5"
      aria-label="Conversa com Norte"
    >
      <header className="flex items-start justify-between pb-8">
        <button
          onClick={onBack}
          className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft size={18} /> {demo ? "Voltar" : "Hoje"}
        </button>
        <div className="text-center">
          <Compass className="mx-auto mb-1 text-primary" size={27} />
          <h1 className="font-semibold">Norte</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {demo ? "Experimente com uma conversa curta" : "Sua conversa, seu ritmo"}
          </p>
        </div>
        {demo ? (
          <button className="min-h-11 text-xs text-primary" onClick={onDemoComplete}>
            Criar conta
          </button>
        ) : (
          <AppMenuButton aria-label="Configurações" onClick={() => setSettings(true)} />
        )}
      </header>
      <div className="flex-1 space-y-6 pb-6" role="log" aria-live="polite">
        {!turns.length && (
          <div className="pt-10">
            <Compass className="mb-4 text-primary" />
            <p className="text-xl font-semibold">O que vamos organizar?</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Conte o que aconteceu ou o que quer fazer.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {(demo
                ? [
                    "Me ajude com minha rotina",
                    "Quero começar um plano",
                    "Me ajude com minha alimentação",
                    "Me ajude a organizar meus treinos",
                  ]
                : ["Ver meu dia", "Planejar comigo", "Qual é meu treino?"]
              ).map((text) => (
                <button
                  key={text}
                  disabled={busy || !ready}
                  onClick={() => send(text)}
                  className="rounded-full border border-border px-3 py-2 text-sm"
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, index) => (
          <div
            key={index}
            className={
              turn.role === "user" ? "ml-10 rounded-2xl bg-surface-2 px-4 py-3" : "space-y-3"
            }
          >
            {turn.role === "assistant" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Compass size={17} className="text-primary" /> Norte
              </div>
            )}
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{turn.text}</p>
            {turn.toolTrace
              ?.filter(
                (t) =>
                  !(
                    parseCard(t.result)?.card === "agenda" &&
                    turn.toolTrace?.some((other) => parseCard(other.result)?.card === "appointment")
                  ) &&
                  (parseCard(t.result) || !t.name.startsWith("consultar")) &&
                  !/^Erro|^Não /i.test(t.result),
              )
              .map((t, i) =>
                parseCard(t.result) ? (
                  <AgentCard
                    key={`result-${i}`}
                    data={parseCard(t.result)!}
                    onChange={(updated) =>
                      setTurns((old) =>
                        old.map((entry, entryIndex) =>
                          entryIndex === index
                            ? {
                                ...entry,
                                toolTrace: entry.toolTrace?.map((trace) =>
                                  trace === t
                                    ? {
                                        ...trace,
                                        args: {
                                          ...trace.args,
                                          amount: updated.amount,
                                          description: updated.description,
                                        },
                                        result: JSON.stringify(updated),
                                      }
                                    : trace,
                                ),
                              }
                            : entry,
                        ),
                      )
                    }
                    onPrompt={setDraft}
                    disabled={busy}
                  />
                ) : (
                  <div key={`result-${i}`} className="rounded-2xl border border-border p-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-primary">
                      {domain(t.name, t.args.area)[0]}
                    </p>
                    <p className="text-sm">{t.result.replace(/\(id [^)]+\)/g, "")}</p>
                  </div>
                ),
              )}
            {turn.pendingActions?.map((action, i) =>
              action.name === "criar_plano" ? (
                <AgentCard
                  key={i}
                  data={{ ...action.args, card: "plan" } as CardData}
                  proposed
                  onPrompt={setDraft}
                  disabled={busy}
                />
              ) : (
                <div key={i} className="rounded-2xl border border-border p-4">
                  <p className="mb-3 font-medium">{domain(action.name, action.args.area)[0]}</p>
                  <dl className="space-y-2">
                    {Object.entries(action.args)
                      .filter(([key]) => fieldLabels[key])
                      .map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-3 text-sm">
                          <dt className="text-muted-foreground">{fieldLabels[key]}</dt>
                          <dd className="max-w-[70%] whitespace-pre-wrap break-words text-right">
                            {String(value)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  <p className="mt-3 text-xs text-muted-foreground">Ainda não aplicado.</p>
                </div>
              ),
            )}
            {!!turn.pendingActions?.length && index === turns.length - 1 && (
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => send("Confirmo")}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  Confirmar{turn.pendingActions.length > 1 ? " alterações" : ""}
                </button>
                <button
                  disabled={busy}
                  onClick={() => send("Cancelar")}
                  className="rounded-xl border border-border px-4 py-2 text-sm"
                >
                  Cancelar
                </button>
              </div>
            )}
            {!!turn.toolTrace?.length && (
              <div className="flex flex-wrap gap-2">
                {[
                  ...new Map(
                    turn.toolTrace
                      .filter((t) => !parseCard(t.result))
                      .map((t) => {
                        const d = domain(t.name, t.args.area);
                        return [d[1], d];
                      }),
                  ).values(),
                ].map(([label, href]) => (
                  <a
                    key={href}
                    href={href}
                    className="rounded-xl border border-border px-3 py-2 text-xs text-primary"
                  >
                    Abrir {label} →
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <p className="text-sm text-muted-foreground" role="status">
            Norte está trabalhando…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div ref={bottom} />
      </div>
      <div className={`sticky ${demo ? "bottom-0" : "bottom-24"} bg-background py-3`}>
        {recording && (
          <p className="mb-2 text-sm text-primary">
            Gravando… Toque em parar para revisar o texto.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
          className="flex items-end gap-1 rounded-3xl border border-border bg-surface p-2"
        >
          <input
            ref={file}
            type="file"
            accept="text/plain,.txt,.md"
            className="hidden"
            onChange={async (e) => {
              const attachment = e.target.files?.[0];
              if (!attachment) return;
              e.target.value = "";
              if (attachment.size > 50_000) setError("Escolha um texto de até 50 KB.");
              else {
                const text = await attachment.text();
                setDraft((old) => `${old}\nDocumento: ${attachment.name}\n${text}`.trim());
              }
            }}
          />
          <button
            type="button"
            disabled={busy || recording}
            aria-label="Anexar texto"
            onClick={() => file.current?.click()}
            className="p-2.5"
          >
            <Paperclip size={19} />
          </button>
          <textarea
            aria-label="Mensagem para o Norte"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy || recording}
            placeholder="Fale com o Norte…"
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-3 text-sm outline-none"
          />
          <button
            type="button"
            aria-label={recording ? "Parar gravação" : "Gravar áudio"}
            disabled={busy}
            onClick={() => (recording ? recorder.current?.stop() : void startAudio())}
            className="p-2.5"
          >
            {recording ? <Square size={19} /> : <Mic size={19} />}
          </button>
          <button
            type="submit"
            aria-label="Enviar mensagem"
            disabled={busy || recording || !draft.trim() || !ready}
            className="rounded-full bg-primary p-2.5 text-primary-foreground disabled:opacity-40"
          >
            <ArrowUp size={20} />
          </button>
        </form>
      </div>
      {settings && <SettingsPanel onClose={() => setSettings(false)} />}
    </section>
  );
}
