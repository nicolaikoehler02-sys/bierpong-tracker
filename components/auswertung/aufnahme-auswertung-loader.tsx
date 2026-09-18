"use client";

import dynamic from "next/dynamic";

// Nur im Browser rendern: Video, Canvas und die ausgewählte Datei gibt es auf
// dem Server nicht — und dorthin soll die Aufnahme auch gar nicht.
const AufnahmeAuswertung = dynamic(
  () => import("./aufnahme-auswertung").then((module) => module.AufnahmeAuswertung),
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted-foreground">Lade Auswertung …</p>,
  },
);

export function AufnahmeAuswertungLoader() {
  return <AufnahmeAuswertung />;
}
