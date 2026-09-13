/** Heutiges Datum in Europe/Berlin als YYYY-MM-DD. */
export function berlinToday(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const toUtc = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / 86_400_000);
}

/** "2026-09-14" → "14.09." */
export function formatDay(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}.${month}.`;
}

export function formatRange(startIso: string, endIso: string): string {
  return `${formatDay(startIso)}–${formatDay(endIso)}`;
}
