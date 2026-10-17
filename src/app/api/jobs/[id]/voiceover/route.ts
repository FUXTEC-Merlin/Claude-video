import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "fs";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { jobDir, readJobMeta, updateJobMeta } from "@/lib/jobStore";
import { synthesizeSpeech } from "@/lib/elevenlabs";
import { getDurationSeconds } from "@/lib/ffmpeg";
import { audioCacheFileName } from "@/lib/voiceCache";
import type { SegmentAudio, VoiceoverRequestBody } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  try {
    const body = (await req.json()) as VoiceoverRequestBody;
    if (!body.voiceId || !Array.isArray(body.segments) || body.segments.length === 0) {
      return NextResponse.json({ error: "voiceId und segments sind erforderlich." }, { status: 400 });
    }
    const segments = body.segments.filter((segment) => segment.text.trim());

    await updateJobMeta(id, { stage: "voicing", voiceId: body.voiceId, modelId: body.modelId });

    const dir = jobDir(id);
    const audioDir = path.join(dir, "audio");
    await mkdir(audioDir, { recursive: true });

    const segmentAudio: Record<string, SegmentAudio> = {};
    let generated = 0;

    // Sequential to stay within ElevenLabs rate limits and keep errors attributable.
    for (const segment of segments) {
      const file = audioCacheFileName(body, segment.text);
      const filePath = path.join(audioDir, file);
      if (!existsSync(filePath)) {
        const audioBuffer = await synthesizeSpeech({
          voiceId: body.voiceId,
          text: segment.text,
          modelId: body.modelId,
          stability: body.stability,
          similarityBoost: body.similarityBoost,
          style: body.style
        });
        await writeFile(filePath, audioBuffer);
        generated += 1;
      }
      segmentAudio[segment.id] = {
        file,
        text: segment.text,
        duration: await getDurationSeconds(filePath)
      };
    }

    // Keep the (possibly edited) segments the client sent as the source of truth.
    const current = await readJobMeta(id);
    const updated = await updateJobMeta(id, {
      stage: "voiced",
      segmentAudio,
      analysis: current.analysis
        ? { ...current.analysis, segments }
        : {
            topic: "",
            title: "",
            description: "",
            chapters: [],
            durationSeconds: current.durationSeconds ?? 0,
            segments
          }
    });

    return NextResponse.json({ job: updated, generated, reused: segments.length - generated });
  } catch (err) {
    await updateJobMeta(id, { stage: "error", error: (err as Error).message }).catch(() => {});
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
