import { getDrill } from "@/lib/drills";
import { longestStreak } from "@/lib/stats";

export interface BlockCounts {
  id: string;
  drillId: number;
  playerId: number | null;
  plannedVolume: number | null;
  confirmedVolume: number | null;
  formation: string | null;
  hits: number;
  misses: number;
  catches: number;
}

export interface StatRow {
  drillId: number;
  playerId: number | null;
  /** Nur bei Drills mit Abschnitten (Restbild) getrennt ausgewertet */
  formation: string | null;
  blocks: number;
  successes: number;
  trials: number;
  bestStreak: number | null;
}

/** Fasst abgeschlossene Blöcke je Drill, Spieler (und ggf. Formation) zusammen. */
export function aggregateBlocks(blocks: BlockCounts[], kindsByBlock: Map<string, string[]>): StatRow[] {
  const rows = new Map<string, StatRow>();

  for (const block of blocks) {
    const drill = getDrill(block.drillId);
    if (drill.type === "E") continue;
    const formation = drill.sections ? block.formation : null;
    const key = [block.drillId, block.playerId ?? "team", formation ?? ""].join("|");
    const row = rows.get(key) ?? {
      drillId: block.drillId,
      playerId: block.playerId,
      formation,
      blocks: 0,
      successes: 0,
      trials: 0,
      bestStreak: null,
    };
    row.blocks++;

    if (drill.type === "C") {
      row.successes += block.hits;
      row.trials += block.hits + block.misses;
      row.bestStreak = Math.max(row.bestStreak ?? 0, longestStreak(kindsByBlock.get(block.id) ?? []));
    } else if (drill.type === "D") {
      row.successes += block.catches;
      row.trials += block.catches + block.misses;
    } else {
      // Treffer über die bestätigte Wurfzahl hinaus (verzählt) werden gekappt.
      const volume = block.confirmedVolume ?? block.plannedVolume ?? 0;
      row.successes += volume > 0 ? Math.min(block.hits, volume) : block.hits;
      row.trials += volume > 0 ? volume : block.hits;
    }

    rows.set(key, row);
  }

  return [...rows.values()].sort(
    (a, b) =>
      a.drillId - b.drillId ||
      (a.formation ?? "").localeCompare(b.formation ?? "") ||
      (a.playerId ?? 0) - (b.playerId ?? 0),
  );
}
