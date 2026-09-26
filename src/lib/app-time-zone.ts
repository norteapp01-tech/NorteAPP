const STORAGE_KEY = "norte-app-time-zone";

/** The profile is the source of truth; this cache lets date helpers work before it loads. */
export function getAppTimeZone(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAppTimeZone(zone: string | null) {
  try {
    if (zone) localStorage.setItem(STORAGE_KEY, zone);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing can make localStorage unavailable.
  }
}

export function isValidTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function dateAndTimeInZone(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

/** Inverso de dateAndTimeInZone: que instante UTC lê como "date time" quando
 * visto em `zone`? Sem isso, montar um lembrete a partir de data+hora usaria
 * o fuso do NAVEGADOR — errado sempre que a pessoa configurou um fuso do app
 * diferente do dispositivo. "Chuta, mede o erro, corrige" (um passo, sem
 * iterar) é suficiente aqui: nenhum fuso muda de offset dentro do minuto de
 * correção que este cálculo faz. */
export function zonedTimeToUtcISO(dateStr: string, timeStr: string, zone: string): string {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`);
  const readAsZoned = dateAndTimeInZone(guess, zone);
  const guessedAsUtc = new Date(`${readAsZoned.date}T${readAsZoned.time}:00Z`);
  const wantedAsUtc = new Date(`${dateStr}T${timeStr}:00Z`);
  const correction = wantedAsUtc.getTime() - guessedAsUtc.getTime();
  return new Date(guess.getTime() + correction).toISOString();
}
