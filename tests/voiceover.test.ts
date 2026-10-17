import { execFileSync } from "child_process";
import { rmSync } from "fs";
import { readFile } from "fs/promises";
import os from "os";
import path from "path";
import { v4 as uuid } from "uuid";
import ffmpegPath from "ffmpeg-static";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { jobDir, writeJobMeta } from "@/lib/jobStore";
import { audioCacheFileName } from "@/lib/voiceCache";

const synthesizeSpeech = vi.fn(async () => {
  const file = path.join(os.tmpdir(), `claude-video-tts-${uuid()}.mp3`);
  execFileSync(ffmpegPath as string, [
    "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=duration=1", file
  ]);
  const buffer = await readFile(file);
  rmSync(file);
  return buffer;
});
vi.mock("@/lib/elevenlabs", () => ({ synthesizeSpeech }));

const { POST } = await import("@/app/api/jobs/[id]/voiceover/route");

const id = uuid();
afterAll(() => rmSync(jobDir(id), { recursive: true, force: true }));

async function voice(segments: Array<{ id: string; text: string }>, voiceId = "voice-a") {
  const req = new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({
      voiceId,
      segments: segments.map((s, i) => ({ ...s, start: i * 2, end: i * 2 + 2 }))
    })
  });
  const res = await POST(req as never, { params: { id } });
  return res.json();
}

describe("audioCacheFileName", () => {
  it("depends on text and voice but not on surrounding whitespace", () => {
    const a = audioCacheFileName({ voiceId: "v" }, "Hallo Welt");
    expect(audioCacheFileName({ voiceId: "v" }, " Hallo Welt ")).toBe(a);
    expect(audioCacheFileName({ voiceId: "v" }, "Hallo Welt!")).not.toBe(a);
    expect(audioCacheFileName({ voiceId: "w" }, "Hallo Welt")).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{24}\.mp3$/);
  });
});

describe("voiceover route", () => {
  beforeEach(() => synthesizeSpeech.mockClear());

  it("only synthesizes segments whose text or voice changed", async () => {
    await writeJobMeta({
      id,
      createdAt: new Date().toISOString(),
      stage: "analyzed",
      recordingFile: "recording.mp4",
      durationSeconds: 10
    });

    const first = await voice([
      { id: "seg-1", text: "Erster Satz." },
      { id: "seg-2", text: "Zweiter Satz." }
    ]);
    expect(first.generated).toBe(2);
    expect(synthesizeSpeech).toHaveBeenCalledTimes(2);
    expect(first.job.segmentAudio["seg-1"].duration).toBeGreaterThan(0.9);

    synthesizeSpeech.mockClear();
    const second = await voice([
      { id: "seg-1", text: "Erster Satz." },
      { id: "seg-2", text: "Zweiter Satz, geändert." }
    ]);
    expect(second).toMatchObject({ generated: 1, reused: 1 });
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);

    synthesizeSpeech.mockClear();
    const otherVoice = await voice([{ id: "seg-1", text: "Erster Satz." }], "voice-b");
    expect(otherVoice.generated).toBe(1);
  });
});
