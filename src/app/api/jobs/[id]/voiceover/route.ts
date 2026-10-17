import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { jobDir, readJobMeta, updateJobMeta } from "@/lib/jobStore";
import { synthesizeSpeech } from "@/lib/elevenlabs";
import { getDurationSeconds } from "@/lib/ffmpeg";
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
    const segmentAudioDurations: Record<string, number> = {};

    // Sequential to stay within ElevenLabs rate limits and keep errors attributable.
    for (const [index, segment] of body.segments.entries()) {
      const audioBuffer = await synthesizeSpeech({
        voiceId: body.voiceId,
        text: segment.text,
        modelId: body.modelId,
        stability: body.stability,
        similarityBoost: body.similarityBoost,
        style: body.style
      });
      // Index-based name: segment ids come from the client and must not reach the filesystem.
      const fileName = `segment-${String(index + 1).padStart(3, "0")}.mp3`;
      const filePath = path.join(audioDir, fileName);
      await writeFile(filePath, audioBuffer);
      segmentAudioFiles[segment.id] = fileName;
      segmentAudioDurations[segment.id] = await getDurationSeconds(filePath);
    }

    // Keep the (possibly edited) segments the client sent as the source of truth.
    const current = await readJobMeta(id);
    const updated = await updateJobMeta(id, {
      stage: "voiced",
      segmentAudioFiles,
      segmentAudioDurations,
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
