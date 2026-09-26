import { useMemo, useState } from "react";
import { useProfile, updateProfile } from "@/lib/profile-store";
import { isValidTimeZone } from "@/lib/app-time-zone";

const featured: Record<string, string> = {
  "America/Sao_Paulo": "Brasil · São Paulo, Rio de Janeiro, Brasília",
  "America/Manaus": "Brasil · Manaus",
  "America/Cuiaba": "Brasil · Cuiabá",
  "America/Porto_Velho": "Brasil · Porto Velho",
  "America/Rio_Branco": "Brasil · Rio Branco",
  "America/Belem": "Brasil · Belém",
  "America/Recife": "Brasil · Recife",
  "America/Fortaleza": "Brasil · Fortaleza",
  "America/Noronha": "Brasil · Fernando de Noronha",
  "Europe/Lisbon": "Portugal · Lisboa, Porto",
  "Europe/London": "Reino Unido · Londres",
  "Europe/Madrid": "Espanha · Madri",
  "America/New_York": "Estados Unidos · Nova York",
  "America/Los_Angeles": "Estados Unidos · Los Angeles",
  "America/Mexico_City": "México · Cidade do México",
  "America/Buenos_Aires": "Argentina · Buenos Aires",
  "America/Santiago": "Chile · Santiago",
  "America/Bogota": "Colômbia · Bogotá",
  "Asia/Tokyo": "Japão · Tóquio",
};

export function TimeZonePicker() {
  const profile = useProfile();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const current = selected ?? profile.timeZone ?? "";
  const zones = useMemo(() => {
    const all =
      typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return Array.from(new Set([...Object.keys(featured), ...all])).filter(isValidTimeZone);
  }, []);
  const visible = zones.filter((zone) =>
    `${featured[zone] ?? ""} ${zone.replaceAll("_", " ")}`
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await updateProfile({ timeZone: current || null });
      setSelected(null);
      setMessage("Fuso horário salvo na sua conta.");
    } catch {
      setMessage("Não foi possível salvar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 card-surface space-y-3 p-3.5">
      <div>
        <label htmlFor="time-zone-search" className="text-sm font-medium">
          Fuso horário
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Busque seu país ou cidade. Usamos o fuso escolhido para definir o dia e o horário atual no
          Norte.
        </p>
      </div>
      <input
        id="time-zone-search"
        type="search"
        placeholder="Ex.: Brasil, São Paulo, Lisboa"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <select
        aria-label="Cidade e fuso horário"
        value={current}
        onChange={(event) => setSelected(event.target.value)}
        className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-primary"
      >
        <option value="">Automático · dispositivo ({browserZone})</option>
        {current && !visible.includes(current) && (
          <option value={current}>{featured[current] ?? current.replaceAll("_", " ")}</option>
        )}
        {visible.map((zone) => (
          <option key={zone} value={zone}>
            {featured[zone] ?? zone.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <button
        disabled={busy || current === (profile.timeZone ?? "")}
        onClick={() => void save()}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {busy ? "Salvando…" : "Salvar fuso"}
      </button>
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Compromissos e notificações agendados seguem o horário do dispositivo em que foram criados.
      </p>
    </div>
  );
}
