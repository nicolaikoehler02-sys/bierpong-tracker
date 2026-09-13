import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PlanItemList } from "@/components/plan-item-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDay, formatRange } from "@/lib/dates";
import { weeks } from "@/lib/plan";

export const metadata: Metadata = {
  title: "Trainingsplan",
};

export default function PlanPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6">
      <PageHeader title="Trainingsplan" subtitle="5 Wochen · 14. September bis 16. Oktober" />

      {weeks.map((week) => (
        <section key={week.week} id={`w${week.week}`} className="scroll-mt-4 space-y-3">
          <div>
            <h2 className="text-lg font-semibold">
              Woche {week.week} · {formatRange(week.start, week.end)}
            </h2>
            <p className="text-sm text-muted-foreground">{week.title}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {week.sessions.map((session) => (
              <Card key={session.id} size="sm">
                <CardHeader>
                  <CardTitle>
                    {session.label}
                    {session.date && <span className="text-muted-foreground"> · {formatDay(session.date)}</span>}
                    {session.partner && <span className="text-muted-foreground"> · Partner</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <PlanItemList items={session.items} />
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-sm">
            <span className="font-medium">Ziel:</span> {week.goal}
          </p>
        </section>
      ))}

      <section className="space-y-1 pb-4">
        <h2 className="text-lg font-semibold">Samstag, 17. Oktober · Turniertag</h2>
        <p className="text-sm text-muted-foreground">Aufwärmen, Probewürfe am echten Tisch, Aufsetzpunkt testen.</p>
      </section>
    </main>
  );
}
