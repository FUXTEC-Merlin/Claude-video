import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { jobDir, readJobMeta, updateJobMeta } from "@/lib/jobStore";
import { extractFrames, frameToBase64 } from "@/lib/ffmpeg";
import { analyzeFramesWithClaude, type FrameInput } from "@/lib/anthropic";
import type { AnalyzeRequestBody } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<AnalyzeRequestBody>;
    const options: AnalyzeRequestBody = {
      language: body.language === "en" ? "en" : "de",
      tone: body.tone ?? "enthusiastic",
      context: body.context
    };

    const meta = await readJobMeta(id);
    await updateJobMeta(id, { stage: "analyzing" });

    const dir = jobDir(id);
    const videoPath = path.join(dir, meta.recordingFile);
    const framesDir = path.join(dir, "frames");

    const { files, intervalSeconds, durationSeconds } = await extractFrames(videoPath, framesDir);
    if (files.length === 0) {
      throw new Error("Es konnten keine Frames aus der Aufnahme extrahiert werden.");
    }

    const frames: FrameInput[] = await Promise.all(
      files.map(async (file, index) => ({
        base64: await frameToBase64(path.join(framesDir, file)),
        timestampSeconds: index * intervalSeconds
      }))
    );

    const analysis = await analyzeFramesWithClaude(frames, durationSeconds, options);

    const updated = await updateJobMeta(id, {
      stage: "analyzed",
      analysis,
      durationSeconds
    });

    return NextResponse.json({ job: updated });
  } catch (err) {
    await updateJobMeta(id, { stage: "error", error: (err as Error).message }).catch(() => {});
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
