import type { Metadata } from "next";
import { AutomationBadge } from "@/components/automation-badge";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type DrillType, drillTypes, drills, targets } from "@/lib/drills";

export const metadata: Metadata = {
  title: "Drills",
};

const typeOrder: DrillType[] = ["A", "B", "C", "D", "E"];

export default function DrillsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6">
      <PageHeader title="Drills" subtitle="14 Drills · 5 Drill-Typen" />

      {typeOrder.map((type) => {
        const ofType = drills.filter((drill) => drill.type === type);
        return (
          <section key={type} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">
                Typ {type} · {drillTypes[type].name}
              </h2>
              <p className="text-sm text-muted-foreground">{drillTypes[type].description}</p>
            </div>

            <div className="grid gap-3">
              {ofType.map((drill) => (
                <Card key={drill.id} size="sm">
                  <CardHeader>
                    <CardTitle className="flex items-start justify-between gap-2">
                      <span>
                        <span className="text-muted-foreground">D{drill.id}</span> {drill.name}
                      </span>
                      <AutomationBadge automation={drill.automation} />
                    </CardTitle>
                    <CardDescription>{drill.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">Umfang:</span>{" "}
                      {drill.defaultVolume !== null && drill.unit
                        ? `${drill.defaultVolume} ${drill.unit}`
                        : "im Spiel"}
                      {drill.sections && ` (${drill.sections.map((s) => `${s.volume} ${s.label}`).join(", ")})`}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Misst:</span> {drill.metric}
                    </p>
                    {drill.trackerNote && (
                      <p>
                        <span className="text-muted-foreground">Tracker:</span> {drill.trackerNote}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      <section className="space-y-3 pb-4">
        <h2 className="text-lg font-semibold">Zielwerte</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Kennzahl</th>
                <th className="py-1.5 pr-3 font-medium">Start</th>
                <th className="py-1.5 pr-3 font-medium">Ende W3</th>
                <th className="py-1.5 font-medium">Turnierreif</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => (
                <tr key={target.metric} className="border-t">
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {target.metric} <span className="text-muted-foreground">(D{target.drillId})</span>
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{target.start}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{target.week3}</td>
                  <td className="py-1.5 font-medium whitespace-nowrap">{target.ready}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
