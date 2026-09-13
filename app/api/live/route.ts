import { getLiveState } from "@/lib/server/blocks";

/** Zustand für das Dashboard: offene Einheit, ihre Blöcke und die Ereignisse des aktiven Blocks. */
export async function GET() {
  return Response.json(await getLiveState(), { headers: { "Cache-Control": "no-store" } });
}
