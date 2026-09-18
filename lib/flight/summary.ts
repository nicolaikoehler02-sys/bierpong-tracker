import type { FlightAnalysis } from "./types.ts";

/**
 * Die Aufnahme in einer Handvoll Zahlen.
 *
 * Sie gehören zum Kern und nicht zum Skript, weil Skript und Browser-Seite
 * dieselbe Aufnahme mit denselben Zahlen beschreiben sollen. Ständen sie an
 * zwei Stellen, würde irgendwann an einer davon anders gezählt — und die Frage
 * „warum sagt die Seite etwas anderes als das Skript?" wäre nicht mehr in
 * Sekunden zu beantworten.
 *
 * Alles hier ist gezählt, nichts gerechnet: Es sind die Rohzahlen, an denen
 * sich eine Auswertung auf einen Blick einordnen lässt — vor allem die Bilder
 * der Lernphase und die Szenenwechsel, in denen der Kern bewusst nichts meldet.
 */
export interface Summary {
  frames: number;
  /** Bilder mit mindestens einem Ball-Kandidaten */
  framesWithCandidates: number;
  /** Ball-Kandidaten über die ganze Aufnahme */
  candidates: number;
  sceneChanges: number;
  /** Bilder, in denen der Hintergrund gelernt wurde */
  learningFrames: number;
  /** Erkannte Würfe */
  throws: number;
  /** Erkannte Würfe des linken Werfers */
  throwsLeft: number;
  /** Erkannte Würfe des rechten Werfers */
  throwsRight: number;
  /** Erkannte Aufsetzer */
  bounces: number;
}

export function summarize(analysis: FlightAnalysis): Summary {
  const results = analysis.frames;
  return {
    frames: results.length,
    framesWithCandidates: results.filter((result) => result.candidates.length > 0).length,
    candidates: results.reduce((sum, result) => sum + result.candidates.length, 0),
    sceneChanges: results.filter((result) => result.sceneChanged).length,
    learningFrames: results.filter((result) => result.learning).length,
    throws: analysis.throws.length,
    throwsLeft: analysis.throws.filter((found) => found.side === "links").length,
    throwsRight: analysis.throws.filter((found) => found.side === "rechts").length,
    bounces: analysis.throws.filter((found) => found.bounce).length,
  };
}
