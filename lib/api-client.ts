import type { NewEventBody } from "@/lib/live-types";

/** Schickt ein Ereignis an den Server. Gibt false zurück, wenn es nicht angekommen ist. */
export async function postEvent(body: NewEventBody): Promise<boolean> {
  try {
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}
