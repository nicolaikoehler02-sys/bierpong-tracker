import type { Metadata } from "next";
import { AufnahmeAuswertungLoader } from "@/components/auswertung/aufnahme-auswertung-loader";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Aufnahme auswerten",
};

export default function AuswertungPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
      <PageHeader
        title="Aufnahme auswerten"
        subtitle="Videodatei wählen · Würfe erkennen · Overlay ansehen — alles im Browser, nichts wird hochgeladen"
      />
      <AufnahmeAuswertungLoader />
    </main>
  );
}
