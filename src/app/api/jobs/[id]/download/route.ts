import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { jobDir, readJobMeta } from "@/lib/jobStore";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const meta = await readJobMeta(params.id);
    if (!meta.renderedFile) {
      return NextResponse.json({ error: "Video wurde noch nicht gerendert." }, { status: 400 });
    }
    const filePath = path.join(jobDir(params.id), meta.renderedFile);
    const buffer = await readFile(filePath);
    const safeTitle = (meta.analysis?.title || "claude-video")
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .trim()
      .slice(0, 80) || "claude-video";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${safeTitle}.mp4"`
      }
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
