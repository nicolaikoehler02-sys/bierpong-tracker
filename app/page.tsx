import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { PlanItemList } from "@/components/plan-item-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { berlinToday, daysBetween, formatRange } from "@/lib/dates";
import { TOURNAMENT_DATE, nextWeekAfter, weekForDate } from "@/lib/plan";

const phases = [
  { name: "Phase 0 · Setup", status: "erledigt", detail: "Drills, Plan, Datenbank, Deploy" },
  { name: "Phase 1 · Kamera-Test", status: "läuft", detail: "Becher antippen, Ball-im-Becher-Erkennung" },
  { name: "Phase 2 · Verbinden", status: "geplant", detail: "Live-Dashboard, Drill-Modi, Korrektur-Knopf" },
  { name: "Phase 3 · Partner & Analyse", status: "geplant", detail: "Ballfarben, Heatmap, Rollen" },
];

export default async function Home() {
  // Datum muss pro Request berechnet werden, nicht zur Build-Zeit.
  await connection();

  const today = berlinToday();
  const currentWeek = weekForDate(today);
  const shownWeek = currentWeek ?? nextWeekAfter(today);
  const daysLeft = daysBetween(today, TOURNAMENT_DATE);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
      <PageHeader title="Bierpong-Tracker" subtitle="Turniervorbereitung · Samstag, 17. Oktober" />

      <Card>
        <CardContent className="flex items-baseline gap-3">
          <span className="text-5xl font-semibold tabular-nums">{Math.max(daysLeft, 0)}</span>
          <span className="text-muted-foreground">
            {daysLeft === 1 ? "Tag" : "Tage"} bis zum Turnier
          </span>
        </CardContent>
      </Card>

      {shownWeek && (
        <Card>
          <CardHeader>
            <CardTitle>
              {currentWeek ? "Diese Woche" : "Nächste Woche"} · Woche {shownWeek.week}
            </CardTitle>
            <CardDescription>
              {formatRange(shownWeek.start, shownWeek.end)} · {shownWeek.title}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {shownWeek.sessions.map((session) => (
              <div key={session.id} className="space-y-1.5">
                <div className="text-sm font-medium">
                  {session.label}
                  {session.partner && <span className="text-muted-foreground"> · Partner</span>}
                </div>
                <PlanItemList items={session.items} />
              </div>
            ))}
          </CardContent>
          <CardContent>
            <Link href={`/plan#w${shownWeek.week}`} className="text-sm underline underline-offset-4">
              Ganzer Plan
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tracker-Ausbau</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {phases.map((phase) => (
              <li key={phase.name} className="flex items-start justify-between gap-3">
                <span>
                  {phase.name}
                  <span className="block text-xs text-muted-foreground">{phase.detail}</span>
                </span>
                <span className="text-xs whitespace-nowrap text-muted-foreground">{phase.status}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
