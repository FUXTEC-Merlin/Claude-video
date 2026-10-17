import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { v4 as uuid } from "uuid";
import { ensureJobDir, writeJobMeta } from "@/lib/jobStore";
import { getDurationSeconds, normalizeRecording } from "@/lib/ffmpeg";
import type { JobMeta } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("recording");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Kein 'recording'-Feld im Upload." }, { status: 400 });
    }

    const id = uuid();
    const dir = await ensureJobDir(id);
    const ext = file.type.includes("mp4") ? "mp4" : "webm";
    const sourceFile = `source.${ext}`;
    const sourcePath = path.join(dir, sourceFile);

    const arrayBuffer = await file.arrayBuffer();
    await writeFile(sourcePath, Buffer.from(arrayBuffer));

    const recordingFile = "recording.mp4";
    const recordingPath = path.join(dir, recordingFile);
    await normalizeRecording(sourcePath, recordingPath);

    const durationSeconds = await getDurationSeconds(recordingPath);
    if (!durationSeconds) {
      throw new Error("Die Aufnahme ist leer oder konnte nicht gelesen werden.");
    }

    const meta: JobMeta = {
      id,
      createdAt: new Date().toISOString(),
      stage: "uploaded",
      recordingFile,
      sourceFile,
      durationSeconds
    };
    await writeJobMeta(meta);

    return NextResponse.json({ job: meta });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
