import { NextResponse } from "next/server";
import { listVoices } from "@/lib/elevenlabs";

export const runtime = "nodejs";

export async function GET() {
  try {
    const voices = await listVoices();
    return NextResponse.json({ voices });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
