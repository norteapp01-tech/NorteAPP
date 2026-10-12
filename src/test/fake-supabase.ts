// ---------------------------------------------------------------------------
// Supabase falso, em memória, para testar as stores sem rede.
//
// Reproduz o que importa para a Agenda:
//  * isolamento por usuário (RLS): cada pessoa só lê/altera linhas com o seu
//    `user_id`, e não consegue gravar uma linha em nome de outra;
//  * valores padrão (id, created_at, status…);
//  * restrições únicas relevantes (ocorrência de série duplicada).
//
// Não tenta ser um banco completo: só o subconjunto de operações que o código
// do app realmente usa.
// ---------------------------------------------------------------------------

export type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
type Result = { data: unknown; error: { message: string } | null; count?: number | null };

const TABLE_DEFAULTS: Record<string, () => Row> = {
  executions: () => ({
    status: "planejada",
    rigid: false,
    weight: "leve",
    all_day: false,
    series_overridden: false,
    source: "norte",
    agenda_sessions: null,
  }),
  agenda_series: () => ({
    category: "generico",
    rigid: false,
    weight: "leve",
    all_day: false,
    alerts: [],
    source: "norte",
    archived_at: null,
  }),
  agenda_labels: () => ({ color: "#91f5da", order_index: 0, archived_at: null }),
  reminders: () => ({ done: false, origin: "user", notified_at: null }),
};

const UNIQUE: Record<string, string[][]> = {
  executions: [["series_id", "series_occurrence_date"]],
  agenda_series_exceptions: [["series_id", "occurrence_date"]],
};

let counter = 0;
const newId = () => `id-${++counter}`;

export function createFakeSupabase(initialUser = "user-a") {
  const db: Record<string, Row[]> = {};
  const state = { userId: initialUser };
  const table = (name: string) => (db[name] ??= []);

  class Query {
    private filters: Filter[] = [];
    private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    private payload: Row | Row[] | null = null;
    private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    private wantReturn = false;
    private orderBy: { col: string; asc: boolean }[] = [];
    private max: number | null = null;
    private mode: "many" | "single" | "maybe" = "many";
    private headOnly = false;
    private countExact = false;

    constructor(private name: string) {}

    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (this.op === "select") {
        this.headOnly = Boolean(opts?.head);
        this.countExact = opts?.count === "exact";
      }
      this.wantReturn = true;
      return this;
    }
    insert(payload: Row | Row[]) {
      this.op = "insert";
      this.payload = payload;
      return this;
    }
    update(payload: Row) {
      this.op = "update";
      this.payload = payload;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    upsert(payload: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
      this.op = "upsert";
      this.payload = payload;
      this.upsertOpts = opts;
      return this;
    }
    eq(col: string, value: unknown) {
      this.filters.push((r) => r[col] === value);
      return this;
    }
    neq(col: string, value: unknown) {
      this.filters.push((r) => r[col] !== value);
      return this;
    }
    is(col: string, value: unknown) {
      this.filters.push((r) => (r[col] ?? null) === value);
      return this;
    }
    in(col: string, values: unknown[]) {
      this.filters.push((r) => values.includes(r[col]));
      return this;
    }
    gte(col: string, value: string) {
      this.filters.push((r) => r[col] != null && (r[col] as string) >= value);
      return this;
    }
    lte(col: string, value: string) {
      this.filters.push((r) => r[col] != null && (r[col] as string) <= value);
      return this;
    }
    gt(col: string, value: string) {
      this.filters.push((r) => r[col] != null && (r[col] as string) > value);
      return this;
    }
    lt(col: string, value: string) {
      this.filters.push((r) => r[col] != null && (r[col] as string) < value);
      return this;
    }
    order(col: string, opts?: { ascending?: boolean }) {
      this.orderBy.push({ col, asc: opts?.ascending !== false });
      return this;
    }
    limit(n: number) {
      this.max = n;
      return this;
    }
    single() {
      this.mode = "single";
      return this;
    }
    maybeSingle() {
      this.mode = "maybe";
      return this;
    }

    private visible(): Row[] {
      // RLS: só as linhas da pessoa logada.
      return table(this.name).filter((r) => !("user_id" in r) || r.user_id === state.userId);
    }

    private matches(): Row[] {
      return this.visible().filter((r) => this.filters.every((f) => f(r)));
    }

    private violatesUnique(row: Row, ignore?: Row): string | null {
      for (const cols of UNIQUE[this.name] ?? []) {
        if (cols.some((c) => row[c] == null)) continue;
        const clash = table(this.name).some(
          (other) => other !== ignore && cols.every((c) => other[c] === row[c]),
        );
        if (clash)
          return `duplicate key value violates unique constraint "${this.name}_${cols.join("_")}_key"`;
      }
      return null;
    }

    private build(row: Row): Row {
      return {
        id: newId(),
        created_at: new Date().toISOString(),
        ...(TABLE_DEFAULTS[this.name]?.() ?? {}),
        ...row,
      };
    }

    private run(): Result {
      if (this.op === "insert" || this.op === "upsert") {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
        const out: Row[] = [];
        for (const raw of rows) {
          const row = this.build({
            ...(this.name === "profiles" ? {} : { user_id: state.userId }),
            ...raw,
          });
          // WITH CHECK: ninguém grava em nome de outra pessoa.
          if ("user_id" in row && row.user_id !== state.userId)
            return {
              data: null,
              error: { message: `new row violates row-level security policy for "${this.name}"` },
            };
          if (this.op === "upsert") {
            const keys = (this.upsertOpts.onConflict ?? "id").split(",");
            const existing = this.visible().find((r) => keys.every((k) => r[k] === row[k]));
            if (existing) {
              if (!this.upsertOpts.ignoreDuplicates) Object.assign(existing, raw);
              out.push(existing);
              continue;
            }
          }
          const problem = this.violatesUnique(row);
          if (problem) return { data: null, error: { message: problem } };
          table(this.name).push(row);
          out.push(row);
        }
        return this.finish(out);
      }
      if (this.op === "update") {
        const rows = this.matches();
        for (const row of rows) {
          const next = { ...row, ...(this.payload as Row) };
          const problem = this.violatesUnique(next, row);
          if (problem) return { data: null, error: { message: problem } };
          Object.assign(row, this.payload);
        }
        return this.finish(rows);
      }
      if (this.op === "delete") {
        const rows = this.matches();
        db[this.name] = table(this.name).filter((r) => !rows.includes(r));
        // ON DELETE CASCADE / SET NULL das relações que o app usa.
        if (this.name === "executions")
          for (const r of rows)
            db.reminders = (db.reminders ?? []).filter((rem) => rem.related_execution_id !== r.id);
        if (this.name === "agenda_series")
          for (const r of rows) {
            db.agenda_series_exceptions = (db.agenda_series_exceptions ?? []).filter(
              (x) => x.series_id !== r.id,
            );
            for (const e of db.executions ?? []) if (e.series_id === r.id) e.series_id = null;
          }
        return this.finish(rows);
      }
      let rows = this.matches();
      for (const { col, asc } of [...this.orderBy].reverse())
        rows = [...rows].sort((a, b) => {
          const av = String(a[col] ?? "");
          const bv = String(b[col] ?? "");
          return asc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      if (this.max !== null) rows = rows.slice(0, this.max);
      const result = this.finish(rows);
      if (this.countExact) result.count = rows.length;
      if (this.headOnly) result.data = null;
      return result;
    }

    private finish(rows: Row[]): Result {
      const mutation = this.op !== "select";
      if (mutation && !this.wantReturn) return { data: null, error: null };
      if (this.mode === "single") {
        if (rows.length !== 1)
          return {
            data: null,
            error: { message: "JSON object requested, multiple (or no) rows returned" },
          };
        return { data: { ...rows[0] }, error: null };
      }
      if (this.mode === "maybe") return { data: rows[0] ? { ...rows[0] } : null, error: null };
      return { data: rows.map((r) => ({ ...r })), error: null };
    }

    then<T>(resolve: (value: Result) => T, reject?: (reason: unknown) => T) {
      try {
        return Promise.resolve(this.run()).then(resolve, reject);
      } catch (e) {
        return Promise.reject(e).then(resolve, reject);
      }
    }
  }

  const client = { from: (name: string) => new Query(name) };

  return {
    client,
    db,
    get userId() {
      return state.userId;
    },
    setUser(id: string) {
      state.userId = id;
    },
    /** Insere direto, sem passar pelo usuário atual (para montar cenários). */
    seed(name: string, row: Row) {
      const built = {
        id: newId(),
        created_at: new Date().toISOString(),
        ...(TABLE_DEFAULTS[name]?.() ?? {}),
        ...row,
      };
      table(name).push(built);
      return built as Row;
    },
    rows(name: string) {
      return table(name);
    },
    reset() {
      for (const k of Object.keys(db)) delete db[k];
    },
  };
}
