import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { jobDir, readJobMeta, updateJobMeta } from "@/lib/jobStore";
import { synthesizeSpeech } from "@/lib/elevenlabs";
import type { VoiceoverRequestBody } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  try {
    const body = (await req.json()) as VoiceoverRequestBody;
    if (!body.voiceId || !Array.isArray(body.segments) || body.segments.length === 0) {
      return NextResponse.json({ error: "voiceId und segments sind erforderlich." }, { status: 400 });
    }

    await updateJobMeta(id, { stage: "voicing", voiceId: body.voiceId, modelId: body.modelId });

    const dir = jobDir(id);
    const audioDir = path.join(dir, "audio");
    await mkdir(audioDir, { recursive: true });

    const segmentAudioFiles: Record<string, string> = {};

    // Sequential to stay within ElevenLabs rate limits and keep errors attributable.
    for (const segment of body.segments) {
      const audioBuffer = await synthesizeSpeech({
        voiceId: body.voiceId,
        text: segment.text,
        modelId: body.modelId,
        stability: body.stability,
        similarityBoost: body.similarityBoost,
        style: body.style
      });
      const fileName = `${segment.id}.mp3`;
      await writeFile(path.join(audioDir, fileName), audioBuffer);
      segmentAudioFiles[segment.id] = fileName;
    }

    // Keep the (possibly edited) segments the client sent as the source of truth.
    const current = await readJobMeta(id);
    const updated = await updateJobMeta(id, {
      stage: "voiced",
      segmentAudioFiles,
      analysis: current.analysis
        ? { ...current.analysis, segments: body.segments }
        : {
            topic: "",
            title: "",
            description: "",
            chapters: [],
            durationSeconds: current.durationSeconds ?? 0,
            segments: body.segments
          }
    });

    return NextResponse.json({ job: updated });
  } catch (err) {
    await updateJobMeta(id, { stage: "error", error: (err as Error).message }).catch(() => {});
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
