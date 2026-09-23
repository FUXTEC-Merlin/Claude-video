import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { jobDir, readJobMeta, updateJobMeta } from "@/lib/jobStore";
import { renderFinalVideo, type MuxSegmentAudio } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  try {
    const meta = await readJobMeta(id);
    if (!meta.analysis || !meta.segmentAudioFiles) {
      return NextResponse.json(
        { error: "Voiceover wurde noch nicht generiert. Bitte zuerst /voiceover ausführen." },
        { status: 400 }
      );
    }

    await updateJobMeta(id, { stage: "rendering" });

    const dir = jobDir(id);
    const videoPath = path.join(dir, meta.recordingFile);
    const audioDir = path.join(dir, "audio");

    const segments: MuxSegmentAudio[] = meta.analysis.segments
      .filter((seg) => meta.segmentAudioFiles?.[seg.id])
      .map((seg) => ({
        filePath: path.join(audioDir, meta.segmentAudioFiles![seg.id]),
        startSeconds: seg.start
      }));

    const lastSegmentEnd = meta.analysis.segments.reduce(
      (max, seg) => Math.max(max, seg.end),
      0
    );
    const totalDuration = Math.max(meta.durationSeconds ?? 0, lastSegmentEnd);

    const outFile = "final.mp4";
    const outPath = path.join(dir, outFile);

    await renderFinalVideo(videoPath, segments, outPath, totalDuration);

    const updated = await updateJobMeta(id, { stage: "rendered", renderedFile: outFile });
    return NextResponse.json({ job: updated });
  } catch (err) {
    await updateJobMeta(id, { stage: "error", error: (err as Error).message }).catch(() => {});
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
