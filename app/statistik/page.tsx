import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { AufsetzerDecision, type DecisionPlayer } from "@/components/statistik/aufsetzer-decision";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formationLabel, getDrill, targets } from "@/lib/drills";
import { getEventKindsByBlock, getFinishedBlocks, getPlayers } from "@/lib/server/blocks";
import { aggregateBlocks } from "@/lib/stats-aggregate";
import { formatPercent, wilson } from "@/lib/stats";

export const metadata: Metadata = {
  title: "Statistik",
};

/** Unter so vielen Würfen ist der 95-%-Bereich breiter als ±15 Prozentpunkte. */
const FEW_TRIALS = 40;

export default async function StatistikPage() {
  await connection();

  const [blocks, players] = await Promise.all([getFinishedBlocks(), getPlayers()]);
  const streakBlockIds = blocks.filter((block) => getDrill(block.drillId).type === "C").map((block) => block.id);
  const kindsByBlock = await getEventKindsByBlock(streakBlockIds);
  const rows = aggregateBlocks(blocks, kindsByBlock);
  const drillIds = [...new Set(rows.map((row) => row.drillId))];
  const decisionPlayers: DecisionPlayer[] = players.map((player) => {
    const counts = (drillId: number) => {
      const row = rows.find((entry) => entry.drillId === drillId && entry.playerId === player.id);
      return row && row.trials > 0 ? { successes: row.successes, trials: row.trials } : null;
    };
    return { name: player.name, bounce: counts(7), normal: counts(2) };
  });
  const playerName = (playerId: number | null) =>
    playerId === null
      ? players.map((player) => player.name).join(" & ")
      : (players.find((player) => player.id === playerId)?.name ?? "Unbekannt");

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
      <PageHeader title="Statistik" subtitle="Quoten aus abgeschlossenen Blöcken · mit 95-%-Bereich" />

      <AufsetzerDecision players={decisionPlayers} />

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine abgeschlossenen Blöcke.</p>
      ) : (
        drillIds.map((drillId) => {
          const drill = getDrill(drillId);
          const target = targets.find((entry) => entry.drillId === drillId);
          return (
            <Card key={drillId} size="sm">
              <CardHeader>
                <CardTitle>
                  <span className="text-muted-foreground">D{drill.id}</span> {drill.name}
                </CardTitle>
                <CardDescription>
                  {drill.metric}
                  {target && ` · Ziel Ende W3: ${target.week3} · turnierreif: ${target.ready}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {rows
                    .filter((row) => row.drillId === drillId)
                    .map((row) => {
                      const estimate = wilson(row.successes, row.trials);
                      const formation = formationLabel(row.formation);
                      return (
                        <li
                          key={`${row.playerId}-${row.formation}`}
                          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                        >
                          <span className="font-medium">
                            {playerName(row.playerId)}
                            {formation && <span className="font-normal text-muted-foreground"> · {formation}</span>}
                          </span>
                          <span className="flex flex-wrap items-baseline gap-x-3 tabular-nums">
                            <span className="text-2xl font-semibold">
                              {estimate ? formatPercent(estimate.p) : "–"}
                            </span>
                            {estimate && (
                              <span className="text-sm text-muted-foreground">
                                {formatPercent(estimate.low)}–{formatPercent(estimate.high)}
                              </span>
                            )}
                            <span className="text-sm text-muted-foreground">
                              {row.successes}/{row.trials} · {row.blocks} {row.blocks === 1 ? "Block" : "Blöcke"}
                            </span>
                            {row.bestStreak !== null && (
                              <span className="text-sm text-muted-foreground">beste Serie {row.bestStreak}</span>
                            )}
                            {row.trials < FEW_TRIALS && <span className="text-xs text-amber-400">wenig Daten</span>}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </CardContent>
            </Card>
          );
        })
      )}
    </main>
  );
}
