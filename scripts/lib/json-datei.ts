import { readFile } from "node:fs/promises";

/**
 * Liest eine JSON-Datei, die von Hand entstanden sein darf.
 *
 * Editoren unter Windows (Notepad, PowerShell) schreiben UTF-8 gern mit einem
 * unsichtbaren Byte-Order-Mark voran. `JSON.parse` stolpert darüber mit einer
 * Meldung, die niemandem weiterhilft — deshalb wird es hier entfernt.
 */
export async function readJsonFile(file: string): Promise<unknown> {
  const text = await readFile(file, "utf8");
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}
