import type { AnalysisResult, Cup } from "./detector";

const COLOR_IDLE = "rgba(255, 255, 255, 0.85)";
const COLOR_PENDING = "#facc15";
const COLOR_PRESENT = "#22c55e";
const COLOR_BLOCKED = "#60a5fa";

/** Zeichnet Becherkreise, Nummern und Füllstand über das Videobild. */
export function drawOverlay(
  canvas: HTMLCanvasElement | null,
  cups: Cup[],
  radius: number,
  result: AnalysisResult | null,
): void {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);
  const r = radius * width;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  cups.forEach((cup, index) => {
    const state = result?.cups[index];
    const x = cup.x * width;
    const y = cup.y * height;
    const color = state?.blocked
      ? COLOR_BLOCKED
      : state?.present
        ? COLOR_PRESENT
        : state?.pending
          ? COLOR_PENDING
          : COLOR_IDLE;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (state?.present) {
      ctx.fillStyle = "rgba(34, 197, 94, 0.25)";
      ctx.fill();
    }
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = `600 ${14 * dpr}px system-ui, sans-serif`;
    ctx.fillText(String(index + 1), x, y);

    if (state) {
      ctx.font = `${11 * dpr}px system-ui, sans-serif`;
      ctx.fillText(state.blocked ? "Hand" : `${Math.round(state.level * 100)} %`, x, y + r + 10 * dpr);
    }
  });
}
