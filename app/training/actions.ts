"use server";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { drillBlocks, events, trainingSessions } from "@/db/schema";
import { getDrill } from "@/lib/drills";
import type { ActionResult, TapEventKind } from "@/lib/live-types";
import { weeks } from "@/lib/plan";
import { getOpenSession } from "@/lib/server/blocks";

const ok: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

const planSessionIds = new Set(weeks.flatMap((week) => week.sessions.map((session) => session.id)));

export async function startSession(planSessionId: string | null): Promise<ActionResult> {
  if (planSessionId !== null && !planSessionIds.has(planSessionId)) return fail("Unbekannte Einheit.");
  if (await getOpenSession()) return fail("Es läuft schon eine Einheit.");
  await getDb().insert(trainingSessions).values({ planSessionId });
  return ok;
}

export async function endSession(sessionId: string): Promise<ActionResult> {
  const db = getDb();
  // Offenen Block mit Soll-Umfang abschließen, falls er nicht beendet wurde.
  await db
    .update(drillBlocks)
    .set({ endedAt: sql`now()`, confirmedVolume: sql`coalesce(${drillBlocks.confirmedVolume}, ${drillBlocks.plannedVolume})` })
    .where(and(eq(drillBlocks.sessionId, sessionId), isNull(drillBlocks.endedAt)));
  await db.update(trainingSessions).set({ endedAt: sql`now()` }).where(eq(trainingSessions.id, sessionId));
  return ok;
}

export async function startBlock(input: {
  sessionId: string;
  drillId: number;
  playerId: number | null;
  plannedVolume: number | null;
  formation: string | null;
}): Promise<ActionResult> {
  let drill;
  try {
    drill = getDrill(input.drillId);
  } catch {
    return fail("Unbekannter Drill.");
  }
  if (drill.type === "E") return fail("Dieser Drill wird nicht gemessen.");
  if (!drill.partner && input.playerId === null) return fail("Bitte einen Werfer auswählen.");
  if (input.plannedVolume !== null && (!Number.isInteger(input.plannedVolume) || input.plannedVolume < 1)) {
    return fail("Ungültiger Umfang.");
  }

  const db = getDb();
  const [active] = await db
    .select({ id: drillBlocks.id })
    .from(drillBlocks)
    .where(and(eq(drillBlocks.sessionId, input.sessionId), isNull(drillBlocks.endedAt)))
    .limit(1);
  if (active) return fail("Erst den laufenden Block beenden.");

  await db.insert(drillBlocks).values({
    sessionId: input.sessionId,
    drillId: drill.id,
    playerId: drill.partner ? null : input.playerId,
    plannedVolume: input.plannedVolume,
    formation: input.formation ?? drill.formation,
  });
  return ok;
}

export async function endBlock(blockId: string, confirmedVolume: number | null): Promise<ActionResult> {
  if (confirmedVolume !== null && (!Number.isInteger(confirmedVolume) || confirmedVolume < 0)) {
    return fail("Ungültige Anzahl.");
  }
  await getDb()
    .update(drillBlocks)
    .set({ endedAt: sql`now()`, confirmedVolume })
    .where(and(eq(drillBlocks.id, blockId), isNull(drillBlocks.endedAt)));
  return ok;
}

/** Markiert einen Block als Test (zählt nicht in der Statistik) oder hebt das auf. */
export async function setBlockTest(blockId: string, isTest: boolean): Promise<ActionResult> {
  if (typeof isTest !== "boolean") return fail("Ungültiger Wert.");
  await getDb().update(drillBlocks).set({ isTest }).where(eq(drillBlocks.id, blockId));
  return ok;
}

export async function addTapEvent(blockId: string, kind: TapEventKind): Promise<ActionResult> {
  const db = getDb();
  const [block] = await db
    .select({ id: drillBlocks.id })
    .from(drillBlocks)
    .where(and(eq(drillBlocks.id, blockId), isNull(drillBlocks.endedAt)))
    .limit(1);
  if (!block) return fail("Kein aktiver Block.");
  await db.insert(events).values({ blockId, kind, source: "tap" });
  return ok;
}

/** Korrektur-Knopf: verwirft den letzten gültigen Treffer des Blocks. */
export async function voidLastHit(blockId: string): Promise<ActionResult> {
  const db = getDb();
  const [last] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.blockId, blockId), eq(events.kind, "hit"), isNull(events.voidedAt)))
    .orderBy(desc(events.createdAt))
    .limit(1);
  if (!last) return fail("Kein Treffer zum Löschen.");
  await db.update(events).set({ voidedAt: sql`now()` }).where(eq(events.id, last.id));
  return ok;
}

/** Letzten Tap (Fehlwurf/Gefangen) rückgängig machen. */
export async function voidLastTap(blockId: string): Promise<ActionResult> {
  const db = getDb();
  const [last] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.blockId, blockId), eq(events.source, "tap"), isNull(events.voidedAt)))
    .orderBy(desc(events.createdAt))
    .limit(1);
  if (!last) return fail("Nichts zum Rückgängigmachen.");
  await db.update(events).set({ voidedAt: sql`now()` }).where(eq(events.id, last.id));
  return ok;
}
