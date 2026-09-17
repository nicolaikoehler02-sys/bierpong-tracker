import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import type { FlightFrame } from "../../lib/flight/index.ts";

/**
 * ffmpeg und ffprobe holen die Bilder aus der Aufnahme und bauen das
 * Overlay-Video wieder zusammen. Ausgetauscht wird rohes RGBA — dasselbe
 * Bildformat, das der Erkennungskern erwartet, ohne Umweg über PNG.
 */
const TOOL_DIR = process.env.FFMPEG_DIR ?? "C:\\ProgramData\\chocolatey\\bin";

export function toolPath(name: "ffmpeg" | "ffprobe"): string {
  const local = path.join(TOOL_DIR, `${name}.exe`);
  return existsSync(local) ? local : name;
}

export interface VideoInfo {
  width: number;
  height: number;
  /** Bilder pro Sekunde der Aufnahme */
  fps: number;
}

/** Liest Bildgröße und Bildrate aus der Aufnahme. */
export async function probeVideo(file: string): Promise<VideoInfo> {
  const output = await run(toolPath("ffprobe"), [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,avg_frame_rate",
    "-of",
    "json",
    file,
  ]);

  const parsed = JSON.parse(output) as {
    streams?: Array<{ width?: number; height?: number; avg_frame_rate?: string }>;
  };
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream?.height) {
    throw new Error(`Die Aufnahme enthält keine lesbare Bildspur: ${file}`);
  }
  return { width: stream.width, height: stream.height, fps: parseRate(stream.avg_frame_rate) };
}

/** ffprobe liefert die Bildrate als Bruch, zum Beispiel "30000/1001". */
function parseRate(rate: string | undefined): number {
  if (!rate) return 0;
  const [numerator, denominator] = rate.split("/").map(Number);
  if (!numerator || !denominator) return 0;
  return numerator / denominator;
}

export interface DecodeOptions {
  width: number;
  height: number;
  fps: number;
  /** Höchstzahl der Bilder — danach wird ffmpeg abgebrochen */
  maxFrames: number;
}

/** Zerlegt die Aufnahme in eine Bilderfolge im Format des Erkennungskerns. */
export async function decodeFrames(file: string, options: DecodeOptions): Promise<FlightFrame[]> {
  const { width, height, fps, maxFrames } = options;
  const child = spawn(
    toolPath("ffmpeg"),
    [
      "-v",
      "error",
      "-i",
      file,
      "-vf",
      `fps=${fps},scale=${width}:${height}`,
      "-pix_fmt",
      "rgba",
      "-f",
      "rawvideo",
      "-",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  const errors = collectErrors(child);
  const frameSize = width * height * 4;
  const frames: FlightFrame[] = [];
  let pending: Uint8Array = new Uint8Array(0);
  let stopped = false;

  for await (const chunk of child.stdout) {
    const incoming = chunk as Uint8Array;
    pending = pending.length === 0 ? incoming : Buffer.concat([pending, incoming]);
    let offset = 0;
    while (pending.length - offset >= frameSize && frames.length < maxFrames) {
      const data = new Uint8ClampedArray(frameSize);
      data.set(pending.subarray(offset, offset + frameSize));
      frames.push({ width, height, data });
      offset += frameSize;
    }
    pending = pending.subarray(offset);
    if (frames.length >= maxFrames) {
      stopped = true;
      child.kill();
      break;
    }
  }

  const code = await exitCode(child);
  if (!stopped && code !== 0) {
    throw new Error(`ffmpeg konnte die Aufnahme nicht zerlegen (Code ${code}).\n${errors()}`);
  }
  return frames;
}

export interface EncodeOptions {
  width: number;
  height: number;
  fps: number;
}

/** Setzt die Bilder — samt Markierungen — wieder zu einem Video zusammen. */
export async function encodeVideo(
  file: string,
  frames: readonly FlightFrame[],
  options: EncodeOptions,
): Promise<void> {
  const child = spawn(
    toolPath("ffmpeg"),
    [
      "-v",
      "error",
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${options.width}x${options.height}`,
      "-r",
      String(options.fps),
      "-i",
      "-",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      file,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );

  const errors = collectErrors(child);
  for (const frame of frames) {
    const buffer = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
    if (!child.stdin.write(buffer)) {
      await new Promise<void>((resolve) => child.stdin.once("drain", resolve));
    }
  }
  child.stdin.end();

  const code = await exitCode(child);
  if (code !== 0) {
    throw new Error(`ffmpeg konnte das Overlay-Video nicht schreiben (Code ${code}).\n${errors()}`);
  }
}

function collectErrors(child: { stderr: Readable | null }): () => string {
  let text = "";
  const stderr = child.stderr;
  if (!stderr) return () => text;
  stderr.setEncoding("utf8");
  stderr.on("data", (chunk: string) => {
    text += chunk;
  });
  return () => text.trim();
}

function exitCode(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 0));
  });
}

/** Startet ein Werkzeug und gibt seine Ausgabe zurück. */
export function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      errors += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error(`Werkzeug nicht gefunden: ${command}. Pfad über FFMPEG_DIR setzen.`));
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} endete mit Code ${code}.\n${errors.trim()}`));
    });
  });
}
