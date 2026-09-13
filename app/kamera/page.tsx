import type { Metadata } from "next";
import { CameraTestLoader } from "@/components/camera/camera-test-loader";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Kamera-Test",
};

export default function KameraPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
      <PageHeader title="Kamera-Test" subtitle="Becher antippen · Leer-Referenz aufnehmen · Treffer erkennen" />
      <CameraTestLoader />
    </main>
  );
}
