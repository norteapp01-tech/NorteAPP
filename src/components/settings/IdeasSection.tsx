import { useState, type FormEvent } from "react";
import { Lightbulb, Send } from "lucide-react";
import { ensureSession, supabase } from "@/lib/supabase/client";

type IdeaKind = "melhoria" | "novidade";

export function IdeasSection() {
  const [kind, setKind] = useState<IdeaKind>("melhoria");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const trimmedMessage = message.trim();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || trimmedMessage.length < 10 || trimmedMessage.length > 2000) return;
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      await ensureSession();
      const { error: insertError } = await supabase.from("app_ideas").insert({
        kind,
        message: trimmedMessage,
      });
      if (insertError) throw insertError;
      setMessage("");
      setSuccess(true);
    } catch {
      setError("Não conseguimos enviar sua ideia agora. Tente novamente; seu texto foi mantido.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
        <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">Ajude a melhorar o Norte</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sentiu falta de algo ou pensou em uma forma de tornar o app melhor? Conte pra gente.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Sua ideia é sobre</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["melhoria", "novidade"] as const).map((option) => (
              <label
                key={option}
                className={`interactive-press flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-medium transition-colors ${
                  kind === option
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface text-muted-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="idea-kind"
                  value={option}
                  checked={kind === option}
                  onChange={() => setKind(option)}
                  className="sr-only"
                />
                {option === "melhoria" ? "Melhoria" : "Novidade"}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="idea-message" className="mb-2 block text-sm font-medium">
            Descreva sua ideia
          </label>
          <textarea
            id="idea-message"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setSuccess(false);
            }}
            placeholder="O que você gostaria de mudar ou ver no Norte?"
            minLength={10}
            maxLength={2000}
            rows={6}
            required
            className="w-full resize-y rounded-2xl border border-border bg-surface p-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {trimmedMessage.length}/2000 caracteres · mínimo 10
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="text-sm text-primary">
            Ideia enviada. Obrigado por ajudar a construir o Norte!
          </p>
        )}
        <button
          type="submit"
          disabled={busy || trimmedMessage.length < 10 || trimmedMessage.length > 2000}
          className="interactive-press flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          <Send size={16} aria-hidden="true" />
          {busy ? "Enviando…" : "Enviar ideia"}
        </button>
      </form>
    </section>
  );
}
