import "server-only";

import { and, desc, eq, getTableColumns, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { drillBlocks, events, players, trainingSessions } from "@/db/schema";

const countKind = (kind: "hit" | "miss" | "catch") =>
  sql<number>`count(*) filter (where ${events.kind} = ${kind} and ${events.voidedAt} is null)`.mapWith(Number);

/** Drill-Blöcke mit gezählten (nicht verworfenen) Ereignissen. */
function blocksWithCounts() {
  return getDb()
    .select({
      ...getTableColumns(drillBlocks),
      hits: countKind("hit"),
      misses: countKind("miss"),
      catches: countKind("catch"),
    })
    .from(drillBlocks)
    .leftJoin(events, eq(events.blockId, drillBlocks.id))
    .groupBy(drillBlocks.id)
    .$dynamic();
}

export async function getOpenSession() {
  const [session] = await getDb()
    .select()
    .from(trainingSessions)
    .where(isNull(trainingSessions.endedAt))
    .orderBy(desc(trainingSessions.startedAt))
    .limit(1);
  return session ?? null;
}

export async function getPlayers() {
  return getDb().select({ id: players.id, name: players.name }).from(players).orderBy(players.name);
}

export async function getLiveState() {
  const db = getDb();
  const [playerRows, session] = await Promise.all([getPlayers(), getOpenSession()]);
  // Serverzeit mitschicken, damit das Dashboard „Kamera verbunden“ ohne Uhrenabweichung prüfen kann.
  const serverTime = new Date();
  if (!session) {
    return { serverTime, players: playerRows, session: null, blocks: [], activeBlock: null, events: [] };
  }

  const blocks = await blocksWithCounts()
    .where(eq(drillBlocks.sessionId, session.id))
    .orderBy(drillBlocks.startedAt);
  const activeBlock = blocks.find((block) => !block.endedAt) ?? null;
  const blockEvents = activeBlock
    ? await db
        .select({
          id: events.id,
          kind: events.kind,
          source: events.source,
          cup: events.cup,
          ballColor: events.ballColor,
          confidence: events.confidence,
          voidedAt: events.voidedAt,
          createdAt: events.createdAt,
        })
        .from(events)
        .where(eq(events.blockId, activeBlock.id))
        .orderBy(events.createdAt)
    : [];

  return {
    serverTime,
    players: playerRows,
    session: { id: session.id, planSessionId: session.planSessionId, startedAt: session.startedAt },
    blocks,
    activeBlock,
    events: blockEvents,
  };
}

export async function getActiveBlock() {
  const [block] = await getDb()
    .select({
      id: drillBlocks.id,
      drillId: drillBlocks.drillId,
      playerName: players.name,
      plannedVolume: drillBlocks.plannedVolume,
      formation: drillBlocks.formation,
      cameraSeenAt: drillBlocks.cameraSeenAt,
    })
    .from(drillBlocks)
    .innerJoin(trainingSessions, eq(trainingSessions.id, drillBlocks.sessionId))
    .leftJoin(players, eq(players.id, drillBlocks.playerId))
    .where(sql`${drillBlocks.endedAt} is null and ${trainingSessions.endedAt} is null`)
    .orderBy(desc(drillBlocks.startedAt))
    .limit(1);
  return block ?? null;
}

/** Merkt sich, dass die Kamera-Seite verbunden ist — höchstens alle 10 Sekunden ein Schreibzugriff. */
export async function touchCamera(blockId: string) {
  await getDb()
    .update(drillBlocks)
    .set({ cameraSeenAt: sql`now()` })
    .where(
      sql`${drillBlocks.id} = ${blockId} and (${drillBlocks.cameraSeenAt} is null or ${drillBlocks.cameraSeenAt} < now() - interval '10 seconds')`,
    );
}

export async function getFinishedBlocks() {
  return blocksWithCounts().where(isNotNull(drillBlocks.endedAt)).orderBy(drillBlocks.startedAt);
}

/** Zeitlich sortierte Ereignisarten je Block, für Serien-Auswertungen. */
export async function getEventKindsByBlock(blockIds: string[]) {
  const result = new Map<string, string[]>();
  if (!blockIds.length) return result;
  const rows = await getDb()
    .select({ blockId: events.blockId, kind: events.kind })
    .from(events)
    .where(and(inArray(events.blockId, blockIds), isNull(events.voidedAt)))
    .orderBy(events.createdAt);
  for (const row of rows) {
    const list = result.get(row.blockId) ?? [];
    list.push(row.kind);
    result.set(row.blockId, list);
  }
  return result;
}
