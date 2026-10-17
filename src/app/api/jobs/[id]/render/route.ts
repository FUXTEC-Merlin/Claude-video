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
    const segmentAudio = meta.segmentAudio;
    if (!meta.analysis || !segmentAudio) {
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

    const inputs = meta.analysis.segments
      .filter((seg) => segmentAudio[seg.id])
      .map((seg) => ({
        id: seg.id,
        start: seg.start,
        audioDuration: segmentAudio[seg.id].duration,
        filePath: path.join(audioDir, segmentAudio[seg.id].file)
      }));

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
      renderedAt: new Date().toISOString(),
      timeline
    });
    return NextResponse.json({ job: updated });
  } catch (err) {
    await updateJobMeta(id, { stage: "error", error: (err as Error).message }).catch(() => {});
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
