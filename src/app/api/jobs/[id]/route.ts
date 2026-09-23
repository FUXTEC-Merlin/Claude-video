import { NextRequest, NextResponse } from "next/server";
import { readJobMeta } from "@/lib/jobStore";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const meta = await readJobMeta(params.id);
    return NextResponse.json({ job: meta });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
