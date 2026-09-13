import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { CameraRemote } from "@/components/training/camera-remote";
import { TrainingDashboard } from "@/components/training/training-dashboard";

export const metadata: Metadata = {
  title: "Training",
};

export default function TrainingPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
      <PageHeader title="Training" subtitle="Dashboard für den Laptop am Spielfeldrand" />
      <TrainingDashboard />
      <CameraRemote />
    </main>
  );
}
