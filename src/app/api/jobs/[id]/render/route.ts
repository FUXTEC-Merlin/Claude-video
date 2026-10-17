import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { jobDir, readJobMeta, updateJobMeta } from "@/lib/jobStore";
import { getDurationSeconds, renderFinalVideo, type RenderClip } from "@/lib/ffmpeg";
import { buildTimeline } from "@/lib/timeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  try {
    const meta = await readJobMeta(id);
    const audioFiles = meta.segmentAudioFiles;
    if (!meta.analysis || !audioFiles) {
      return NextResponse.json(
        { error: "Voiceover wurde noch nicht generiert. Bitte zuerst /voiceover ausführen." },
        { status: 400 }
      );
    }

    await updateJobMeta(id, { stage: "rendering" });

    const dir = jobDir(id);
    const videoPath = path.join(dir, meta.recordingFile);
    const audioDir = path.join(dir, "audio");
    const sourceDuration = meta.durationSeconds || (await getDurationSeconds(videoPath));

    const voiced = meta.analysis.segments.filter((seg) => audioFiles[seg.id]);
    const inputs = await Promise.all(
      voiced.map(async (seg) => {
        const filePath = path.join(audioDir, audioFiles[seg.id]);
        const audioDuration =
          meta.segmentAudioDurations?.[seg.id] ?? (await getDurationSeconds(filePath));
        return { id: seg.id, start: seg.start, audioDuration, filePath };
      })
    );

    const timeline = buildTimeline(inputs, sourceDuration);
    const fileById = new Map(inputs.map((input) => [input.id, input.filePath]));
    const clips: RenderClip[] = timeline.placements.map((placement) => ({
      filePath: fileById.get(placement.id)!,
      placement
    }));

    const outFile = "final.mp4";
    await renderFinalVideo(videoPath, clips, timeline, path.join(dir, outFile));

    const updated = await updateJobMeta(id, {
      stage: "rendered",
      renderedFile: outFile,
      timeline
    });
    return NextResponse.json({ job: updated });
  } catch (err) {
    await updateJobMeta(id, { stage: "error", error: (err as Error).message }).catch(() => {});
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
