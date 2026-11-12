import { useEffect, useState } from "react";
import {
  Users,
  Plus,
  ArrowLeft,
  Bell,
  Heart,
  MessageCircle,
  Settings,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/ui/inline-error";
import { UnderlineTabs } from "@/components/ui/app-design-system";
import { useSupabaseUserId } from "@/lib/supabase/client";
import { useHabitsCore } from "@/lib/habits/store";
import {
  communityAction,
  useCommunity,
  useComments,
  useChallengeProgress,
  type Circle,
  type Member,
  type Post,
  type Challenge,
} from "@/lib/community";
import { todayISO } from "@/lib/goals-store";

type Sheet = "create" | "join" | "settings" | "share" | "challenge" | "notices" | null;
const inputClass = "w-full rounded-xl border border-border bg-background p-3 text-sm";
export function CommunityScreen() {
  const uid = useSupabaseUserId();
  const [selected, setSelected] = useState<string>();
  const [page, setPage] = useState(0);
  const q = useCommunity(selected, page);
  const data = q.data;
  const circle = data?.circles.find((c) => c.id === selected);
  const [tab, setTab] = useState("feed");
  const [sheet, setSheet] = useState<Sheet>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("convite")) setSheet("join");
  }, []);
  const [body, setBody] = useState("");
  const [mention, setMention] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState<Post | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [confirm, setConfirm] = useState<{ text: string; action: () => Promise<void> } | null>(
    null,
  );
  const owner = circle?.owner_id === uid;
  const alias = (id: string) =>
    data?.members.find((m) => m.user_id === id)?.alias ?? "Participante";
  async function act(fn: () => Promise<void>) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function action(name: string, payload: Record<string, unknown> = {}) {
    await communityAction(name, selected ?? null, payload);
  }
  function enter(id: string) {
    setSelected(id);
    setPage(0);
    setTab("feed");
    setError("");
  }
  const ask = (text: string, fn: () => Promise<void>) => setConfirm({ text, action: fn });
  return (
    <main className="norte-page space-y-5 pb-32">
      <header className="flex items-start justify-between gap-3">
        <div>
          {selected && (
            <Button
              variant="ghost"
              onClick={() => {
                setSelected(undefined);
                setPage(0);
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Grupos
            </Button>
          )}
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Juntos</p>
          <h1 className="norte-page-title mt-2">{circle?.name ?? "Um pouco de apoio."}</h1>
          {circle?.description && (
            <p className="mt-2 text-sm text-muted-foreground">{circle.description}</p>
          )}
        </div>
        <Button variant="ghost" aria-label="Avisos" onClick={() => setSheet("notices")}>
          <Bell className="h-5 w-5" />
          {data?.notices.filter((n) => !n.read_at).length || ""}
        </Button>
      </header>
      {(error || q.isError) && (
        <InlineError message={error || "Não foi possível carregar os grupos."} />
      )}
      {q.isError && (
        <Button variant="outline" onClick={() => q.refetch()}>
          Tentar novamente
        </Button>
      )}
      <p role="status" className="text-sm text-primary">
        {message}
      </p>
      {q.isLoading && <p role="status">Carregando…</p>}
      {!selected && (
        <>
          <div className="flex gap-2">
            <Button onClick={() => setSheet("create")}>
              <Plus className="mr-2 h-4 w-4" />
              Criar grupo
            </Button>
            <Button variant="outline" onClick={() => setSheet("join")}>
              Tenho um convite
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {data?.circles.map((c) => (
              <button
                key={c.id}
                onClick={() => enter(c.id)}
                className="card-surface p-5 text-left min-h-24"
              >
                <Users className="mb-3 h-5 w-5 text-primary" />
                <strong>{c.name}</strong>
                <p className="mt-1 text-sm text-muted-foreground">
                  {c.archived ? "Arquivado" : c.description || "Ver grupo"}
                </p>
              </button>
            ))}
          </div>
          {data && !data.circles.length && (
            <p className="text-muted-foreground">Convide quem compartilha seus objetivos.</p>
          )}
          {data?.members.some((m) => m.status === "pending") && (
            <p className="text-sm text-muted-foreground">
              Você tem uma solicitação aguardando aprovação.
            </p>
          )}
        </>
      )}
      {circle && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                act(async () => {
                  await navigator.clipboard.writeText(
                    `${window.location.origin}/juntos?convite=${circle.invite_token}`,
                  );
                  setMessage("Convite copiado.");
                })
              }
            >
              <LinkIcon className="mr-2 h-4 w-4" />
              Convidar
            </Button>
            <Button variant="ghost" onClick={() => setSheet("settings")}>
              <Settings className="mr-2 h-4 w-4" />
              Grupo
            </Button>
            {circle.archived && (
              <span className="py-2 text-sm text-muted-foreground">Arquivado</span>
            )}
          </div>
          <UnderlineTabs
            items={[
              { key: "feed", label: "Atividades" },
              { key: "progress", label: "Rotinas" },
              { key: "challenges", label: "Desafios" },
              { key: "members", label: "Pessoas" },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === "feed" && (
            <>
              {!circle.archived && (
                <form
                  className="card-surface p-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () => {
                      await action("post", { body, mentions: mention ? [mention] : [] });
                      setBody("");
                      setMention("");
                    });
                  }}
                >
                  <label className="sr-only" htmlFor="community-post">
                    Compartilhar com o grupo
                  </label>
                  <textarea
                    id="community-post"
                    className={inputClass}
                    maxLength={2000}
                    required
                    placeholder="Compartilhe algo com o grupo…"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <select
                      aria-label="Mencionar alguém"
                      className={inputClass}
                      value={mention}
                      onChange={(e) => setMention(e.target.value)}
                    >
                      <option value="">Mencionar alguém</option>
                      {data?.members
                        .filter((m) => m.status === "active" && m.user_id !== uid)
                        .map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.alias}
                          </option>
                        ))}
                    </select>
                    <Button disabled={busy || !body.trim()}>Publicar</Button>
                  </div>
                </form>
              )}
              {data?.posts.map((p) => (
                <article key={p.id} className="card-surface p-4 space-y-3">
                  <div className="flex justify-between gap-2">
                    <strong className="text-sm">{alias(p.user_id)}</strong>
                    <time className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString("pt-BR")}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm">{p.body}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy || circle.archived}
                      variant="ghost"
                      aria-label="Apoiar publicação"
                      aria-pressed={data.reactions.some(
                        (r) => r.post_id === p.id && r.user_id === uid,
                      )}
                      onClick={() => act(() => action("react", { id: p.id }))}
                    >
                      <Heart className="mr-1 h-4 w-4" />
                      {data.reactions.filter((r) => r.post_id === p.id).length}
                    </Button>
                    <Button variant="ghost" onClick={() => setComments(p)}>
                      <MessageCircle className="mr-1 h-4 w-4" />
                      Comentários
                    </Button>
                    {(owner || p.user_id === uid) && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          ask("Excluir esta publicação e os comentários?", () =>
                            action("delete_post", { id: p.id }),
                          )
                        }
                      >
                        Excluir
                      </Button>
                    )}
                    {p.user_id !== uid && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          act(async () => {
                            await action("report", {
                              id: p.id,
                              reason: "Solicito revisão desta publicação pelo administrador.",
                            });
                            setMessage("Publicação sinalizada ao administrador.");
                          })
                        }
                      >
                        Sinalizar
                      </Button>
                    )}
                  </div>
                  {owner && data.reports.some((r) => r.post_id === p.id) && (
                    <p className="text-xs text-muted-foreground">
                      Publicação sinalizada para revisão.
                    </p>
                  )}
                </article>
              ))}
              <div className="flex justify-between">
                <Button variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Anteriores
                </Button>
                <Button variant="ghost" disabled={!data?.hasMore} onClick={() => setPage(page + 1)}>
                  Mais atividades
                </Button>
              </div>
            </>
          )}
          {tab === "progress" && (
            <>
              <Button disabled={circle.archived} onClick={() => setSheet("share")}>
                Escolher minhas rotinas
              </Button>
              <p className="text-xs text-muted-foreground">
                Últimos 7 dias (UTC), desde o compartilhamento. Notas e humor são privados.
              </p>
              {data?.shares.map((s) => (
                <div key={s.habit_id} className="card-surface p-4 flex justify-between gap-3">
                  <div>
                    <strong>{s.name}</strong>
                    <p className="text-sm text-muted-foreground">{alias(s.user_id)}</p>
                  </div>
                  <span className="text-primary">
                    {s.value} {s.unit}
                  </span>
                </div>
              ))}
              {!data?.shares.length && (
                <p className="text-muted-foreground">
                  As rotinas escolhidas pelo grupo aparecerão aqui.
                </p>
              )}
            </>
          )}
          {tab === "challenges" && (
            <>
              {owner && (
                <Button disabled={circle.archived} onClick={() => setSheet("challenge")}>
                  Criar desafio
                </Button>
              )}
              {data?.challenges.map((c) => (
                <button
                  key={c.id}
                  className="card-surface p-5 text-left block w-full"
                  onClick={() => setChallenge(c)}
                >
                  <strong>{c.title}</strong>
                  <p className="text-sm text-muted-foreground">
                    {c.mode === "cooperative" ? "Meta conjunta" : "Comparação individual"} ·{" "}
                    {c.target} {c.unit}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {c.start_date} → {c.end_date}
                  </p>
                </button>
              ))}
              {!data?.challenges.length && (
                <p className="text-muted-foreground">Nenhum desafio por enquanto.</p>
              )}
            </>
          )}
          {tab === "members" &&
            data?.members
              .filter((m) => m.status !== "removed")
              .map((m) => (
                <div key={m.user_id} className="card-surface p-4">
                  <strong>{m.alias}</strong>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {m.user_id === circle.owner_id
                      ? "Administrador"
                      : m.status === "pending"
                        ? "Aguardando entrada"
                        : "Participante"}
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {owner && m.status === "pending" && (
                      <Button
                        disabled={busy}
                        onClick={() => act(() => action("approve", { user_id: m.user_id }))}
                      >
                        Aprovar
                      </Button>
                    )}
                    {m.user_id !== uid && m.status === "active" && (
                      <Button
                        variant="outline"
                        disabled={busy || circle.archived}
                        onClick={() =>
                          act(async () => {
                            await action("support", { user_id: m.user_id });
                            setMessage("Apoio registrado. No máximo um aviso por pessoa ao dia.");
                          })
                        }
                      >
                        Dar uma força
                      </Button>
                    )}
                    {owner && m.user_id !== uid && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          ask(`Remover ${m.alias} do grupo?`, () =>
                            action("remove", { user_id: m.user_id }),
                          )
                        }
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                </div>
              ))}
        </>
      )}
      {(sheet === "create" || sheet === "join") && (
        <CreateJoin
          kind={sheet}
          busy={busy}
          onClose={() => setSheet(null)}
          onSave={(fields) =>
            act(async () => {
              const r = await communityAction(sheet === "create" ? "create" : "join", null, fields);
              setSheet(null);
              if (r.id && r.status !== "pending") enter(r.id);
              else setMessage("Solicitação enviada. Aguarde aprovação.");
            })
          }
        />
      )}
      {sheet === "settings" && circle && (
        <GroupSettings
          circle={circle}
          me={data?.members.find((m) => m.user_id === uid)}
          members={data?.members ?? []}
          owner={!!owner}
          busy={busy}
          onClose={() => setSheet(null)}
          onSave={(name, payload) =>
            act(async () => {
              await action(name, payload);
              setSheet(null);
              if (name === "leave") setSelected(undefined);
              setMessage("Grupo atualizado.");
            })
          }
        />
      )}
      {sheet === "share" && circle && (
        <ShareChooser
          shares={data?.shares.filter((s) => s.user_id === uid).map((s) => s.habit_id) ?? []}
          busy={busy}
          onClose={() => setSheet(null)}
          onToggle={(id, on) => act(() => action(on ? "share" : "unshare", { habit_id: id }))}
        />
      )}
      {sheet === "challenge" && (
        <ChallengeForm
          busy={busy}
          onClose={() => setSheet(null)}
          onSave={(fields) =>
            act(async () => {
              await action("challenge", fields);
              setSheet(null);
            })
          }
        />
      )}
      {sheet === "notices" && (
        <Modal title="Avisos" onClose={() => setSheet(null)}>
          <div className="space-y-3">
            {data?.notices.map((n) => (
              <button
                key={n.id}
                className="card-surface p-4 text-left w-full"
                onClick={() =>
                  act(async () => {
                    await communityAction("read_notification", null, { id: n.id });
                    setSheet(null);
                    if (data.circles.some((c) => c.id === n.circle_id)) enter(n.circle_id);
                  })
                }
              >
                <span className={n.read_at ? "text-muted-foreground" : "font-semibold"}>
                  {n.body}
                </span>
              </button>
            ))}
            {!data?.notices.length && <p>Nenhum aviso.</p>}
          </div>
        </Modal>
      )}
      {comments && circle && (
        <Comments
          post={comments}
          members={data?.members ?? []}
          disabled={busy || circle.archived}
          onClose={() => setComments(null)}
          onSend={(text) => act(() => action("post", { body: text, parent_id: comments.id }))}
        />
      )}
      {challenge && (
        <ChallengeDetail
          challenge={challenge}
          busy={busy}
          uid={uid ?? ""}
          onClose={() => setChallenge(null)}
          onJoin={(id) => act(() => action("enroll", { id: challenge.id, habit_id: id }))}
          onLeave={() => act(() => action("leave_challenge", { id: challenge.id }))}
        />
      )}
      {confirm && (
        <Modal title="Confirmar" onClose={() => setConfirm(null)}>
          <p>{confirm.text}</p>
          <div className="mt-4 flex gap-3">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await confirm.action();
                  setConfirm(null);
                })
              }
            >
              Confirmar
            </Button>
          </div>
        </Modal>
      )}
      {((error && sheet) || (error && challenge) || (error && comments)) && (
        <div
          role="alert"
          className="fixed bottom-6 left-4 right-4 z-[100] rounded-xl border bg-background p-4 text-sm"
        >
          {error}
        </div>
      )}
    </main>
  );
}

function CreateJoin({
  kind,
  busy,
  onClose,
  onSave,
}: {
  kind: "create" | "join";
  busy: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [description, setDescription] = useState("");
  const [token, setToken] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("convite") ?? ""),
  );
  return (
    <Modal title={kind === "create" ? "Novo grupo" : "Entrar no grupo"} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          let clean = token.trim();
          try {
            clean = new URL(clean).searchParams.get("convite") ?? clean;
          } catch {
            /* raw token */
          }
          onSave(kind === "create" ? { name, description, alias } : { token: clean, alias });
        }}
      >
        <label className="block text-sm">
          Seu nome no grupo
          <Input required maxLength={60} value={alias} onChange={(e) => setAlias(e.target.value)} />
        </label>
        {kind === "create" ? (
          <>
            <label className="block text-sm">
              Nome do grupo
              <Input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Descrição · opcional
              <Input
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </>
        ) : (
          <label className="block text-sm">
            Link ou código do convite
            <Input required value={token} onChange={(e) => setToken(e.target.value)} />
          </label>
        )}
        <Button disabled={busy} className="w-full">
          {kind === "create" ? "Criar grupo" : "Solicitar entrada"}
        </Button>
      </form>
    </Modal>
  );
}
function GroupSettings({
  circle,
  me,
  members,
  owner,
  busy,
  onClose,
  onSave,
}: {
  circle: Circle;
  me?: Member;
  members: Member[];
  owner: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (name: string, data: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(circle.name);
  const [description, setDescription] = useState(circle.description);
  const [auto, setAuto] = useState(circle.auto_approve);
  const [successor, setSuccessor] = useState("");
  return (
    <Modal title="Configurações do grupo" onClose={onClose}>
      <div className="space-y-4">
        {owner && (
          <>
            <label className="block text-sm">
              Nome
              <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block text-sm">
              Descrição
              <Input
                value={description}
                maxLength={500}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="flex gap-2 text-sm">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              Aprovar automaticamente quem tiver o convite
            </label>
            <Button
              disabled={busy || !name.trim()}
              onClick={() => onSave("update", { name, description, auto_approve: auto })}
            >
              Salvar
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => onSave("rotate_invite", {})}>
              Substituir convite
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => onSave("update", { archived: !circle.archived })}
            >
              {circle.archived ? "Restaurar grupo" : "Arquivar grupo"}
            </Button>
            <details>
              <summary className="py-2">Transferir administração</summary>
              <select
                aria-label="Novo administrador"
                className={inputClass}
                value={successor}
                onChange={(e) => setSuccessor(e.target.value)}
              >
                <option value="">Escolha uma pessoa</option>
                {members
                  .filter((m) => m.status === "active" && m.user_id !== circle.owner_id)
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.alias}
                    </option>
                  ))}
              </select>
              <Button
                disabled={busy || !successor}
                onClick={() => onSave("transfer", { user_id: successor })}
              >
                Transferir administração
              </Button>
            </details>
          </>
        )}
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onSave("mute", { muted: !me?.muted })}
        >
          {me?.muted ? "Receber avisos" : "Silenciar avisos"}
        </Button>
        {!owner && (
          <details>
            <summary className="py-2">Sair do grupo</summary>
            <p className="text-sm text-muted-foreground">
              Suas rotinas deixam de ser compartilhadas; publicações anteriores permanecem.
            </p>
            <Button variant="outline" disabled={busy} onClick={() => onSave("leave", {})}>
              Confirmar saída
            </Button>
          </details>
        )}
      </div>
    </Modal>
  );
}
function ShareChooser({
  shares,
  busy,
  onClose,
  onToggle,
}: {
  shares: string[];
  busy: boolean;
  onClose: () => void;
  onToggle: (id: string, on: boolean) => void;
}) {
  const data = useHabitsCore();
  return (
    <Modal title="Rotinas compartilhadas" onClose={onClose}>
      <p className="mb-4 text-sm text-muted-foreground">
        Compartilhe nome e quantidade registrada a partir de agora. Notas e humor continuam
        privados.
      </p>
      <div className="space-y-2">
        {data.habits
          .filter((h) => !h.archivedAt)
          .map((h) => (
            <label key={h.id} className="flex items-center gap-3 min-h-12">
              <input
                disabled={busy}
                type="checkbox"
                checked={shares.includes(h.id)}
                onChange={(e) => onToggle(h.id, e.target.checked)}
              />
              {h.name}
            </label>
          ))}
      </div>
    </Modal>
  );
}
function ChallengeForm({
  busy,
  onClose,
  onSave,
}: {
  busy: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("cooperative");
  const [unit, setUnit] = useState("min");
  const [target, setTarget] = useState(100);
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  return (
    <Modal title="Novo desafio" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ title, mode, unit, target, start_date: start, end_date: end });
        }}
      >
        <label className="block">
          Nome
          <Input
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block">
          Formato
          <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="cooperative">Meta conjunta</option>
            <option value="competitive">Comparação individual</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            Meta
            <Input
              type="number"
              required
              min="0.01"
              max="999999999"
              step="any"
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            />
          </label>
          <label>
            Unidade
            <Input required maxLength={24} value={unit} onChange={(e) => setUnit(e.target.value)} />
          </label>
          <label>
            Início
            <Input type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            Fim
            <Input
              type="date"
              required
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Conta a quantidade registrada após cada pessoa entrar, dentro das datas do desafio.
        </p>
        <Button disabled={busy}>Criar desafio</Button>
      </form>
    </Modal>
  );
}
function ChallengeDetail({
  challenge: c,
  busy,
  uid,
  onClose,
  onJoin,
  onLeave,
}: {
  challenge: Challenge;
  busy: boolean;
  uid: string;
  onClose: () => void;
  onJoin: (habit: string) => void;
  onLeave: () => void;
}) {
  const q = useChallengeProgress(c.id);
  const habits = useHabitsCore();
  const [habit, setHabit] = useState("");
  const joined = q.data?.some((r) => r.user_id === uid);
  const total = q.data?.reduce((s, r) => s + Number(r.value), 0) ?? 0;
  const rows = [...(q.data ?? [])].sort((a, b) =>
    c.mode === "competitive" ? b.value - a.value : a.alias.localeCompare(b.alias),
  );
  return (
    <Modal title={c.title} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {c.start_date} → {c.end_date} ·{" "}
          {c.mode === "cooperative" ? "Meta conjunta" : "Comparação individual"}
        </p>
        {q.isError && <InlineError message="Não foi possível carregar o progresso." />}
        {c.mode === "cooperative" && (
          <div className="card-surface p-5">
            <strong className="text-2xl text-primary">
              {total} / {c.target} {c.unit}
            </strong>
            <progress
              aria-label="Progresso conjunto"
              className="mt-3 w-full accent-primary"
              value={Math.min(total, c.target)}
              max={c.target}
            />
          </div>
        )}
        {rows.map((r, i) => (
          <div key={r.user_id} className="flex justify-between border-b py-3">
            <span>
              {c.mode === "competitive" ? `${i + 1}. ` : ""}
              {r.alias}
            </span>
            <strong>
              {r.value} {c.unit}
            </strong>
          </div>
        ))}
        {!joined ? (
          <>
            <label className="block text-sm">
              Rotina que você quer compartilhar
              <select
                className={inputClass}
                value={habit}
                onChange={(e) => setHabit(e.target.value)}
              >
                <option value="">Escolher rotina</option>
                {habits.habits
                  .filter(
                    (h) =>
                      !h.archivedAt &&
                      h.intent === "build" &&
                      (h.measure === "duration" ? "min" : (h.unit ?? "vezes"))
                        .trim()
                        .toLowerCase() === c.unit.trim().toLowerCase(),
                  )
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
              </select>
            </label>
            <p className="text-xs text-muted-foreground">
              Ao participar, o grupo verá seu nome e a quantidade registrada nesta rotina durante o
              desafio.
            </p>
            <Button disabled={busy || !habit} onClick={() => onJoin(habit)}>
              Aceitar e participar
            </Button>
          </>
        ) : (
          <details>
            <summary className="py-2">Minha participação</summary>
            <Button disabled={busy} variant="outline" onClick={onLeave}>
              Sair do desafio e retirar meus dados
            </Button>
          </details>
        )}
      </div>
    </Modal>
  );
}
function Comments({
  post,
  members,
  disabled,
  onClose,
  onSend,
}: {
  post: Post;
  members: Member[];
  disabled: boolean;
  onClose: () => void;
  onSend: (body: string) => Promise<boolean>;
}) {
  const q = useComments(post.id);
  const [body, setBody] = useState("");
  return (
    <Modal title="Comentários" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{post.body}</p>
        {q.isError && <InlineError message="Não foi possível carregar os comentários." />}
        {q.data?.map((p) => (
          <div key={p.id} className="border-t py-3">
            <strong className="text-sm">
              {members.find((m) => m.user_id === p.user_id)?.alias ?? "Participante"}
            </strong>
            <p className="text-sm whitespace-pre-wrap break-words">{p.body}</p>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onSend(body)) setBody("");
          }}
        >
          <Input
            aria-label="Seu comentário"
            required
            maxLength={2000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Seu comentário…"
          />
          <Button disabled={disabled || !body.trim()}>Enviar</Button>
        </form>
      </div>
    </Modal>
  );
}
