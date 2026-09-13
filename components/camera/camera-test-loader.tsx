"use client";

import dynamic from "next/dynamic";

// Nur im Browser rendern: Kamera, Canvas und localStorage gibt es auf dem Server nicht.
const CameraTest = dynamic(() => import("./camera-test").then((module) => module.CameraTest), {
  ssr: false,
  loading: () => <p className="text-sm text-muted-foreground">Lade Kamera-Test …</p>,
});

export function CameraTestLoader() {
  return <CameraTest />;
}
