import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { JobMeta } from "./types";

const DATA_ROOT = path.join(process.cwd(), "data", "jobs");

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function jobDir(id: string): string {
  // The id comes from the URL; anything but a UUID could escape DATA_ROOT.
  if (!JOB_ID_PATTERN.test(id)) {
    throw new Error(`Job ${id} wurde nicht gefunden.`);
  }
  return path.join(DATA_ROOT, id);
}

export async function ensureJobDir(id: string): Promise<string> {
  const dir = jobDir(id);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function readJobMeta(id: string): Promise<JobMeta> {
  const file = path.join(jobDir(id), "meta.json");
  if (!existsSync(file)) {
    throw new Error(`Job ${id} wurde nicht gefunden.`);
  }
  const raw = await readFile(file, "utf-8");
  return JSON.parse(raw) as JobMeta;
}

export async function writeJobMeta(meta: JobMeta): Promise<void> {
  await ensureJobDir(meta.id);
  const file = path.join(jobDir(meta.id), "meta.json");
  await writeFile(file, JSON.stringify(meta, null, 2), "utf-8");
}

export async function updateJobMeta(
  id: string,
  patch: Partial<JobMeta>
): Promise<JobMeta> {
  const current = await readJobMeta(id);
  const next = { ...current, ...patch };
  await writeJobMeta(next);
  return next;
}
