import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL fehlt (.env.local oder Vercel-ENV)");
  return drizzle(neon(url), { schema });
}

let db: ReturnType<typeof createDb> | undefined;

/** Lazy, damit Build und statische Seiten ohne DATABASE_URL funktionieren. */
export function getDb() {
  db ??= createDb();
  return db;
}
