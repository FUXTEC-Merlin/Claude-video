import { execFileSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDurationSeconds, normalizeRecording, renderFinalVideo } from "@/lib/ffmpeg";
import { buildTimeline } from "@/lib/timeline";

let dir: string;

function ffmpeg(args: string[]) {
  execFileSync(ffmpegPath as string, ["-y", "-loglevel", "error", ...args]);
}

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "claude-video-test-"));
  // 6 s VP8 WebM without audio, like a browser screen recording.
  ffmpeg([
    "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=6",
    "-c:v", "libvpx", "-b:v", "500k", path.join(dir, "source.webm")
  ]);
  ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=4", path.join(dir, "a.mp3")]);
  ffmpeg(["-f", "lavfi", "-i", "sine=frequency=660:duration=1.5", path.join(dir, "b.mp3")]);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("render pipeline", () => {
  it("normalizes a recording and renders with speed-up and freeze", async () => {
    const recording = path.join(dir, "recording.mp4");
    await normalizeRecording(path.join(dir, "source.webm"), recording);
    const sourceDuration = await getDurationSeconds(recording);
    expect(sourceDuration).toBeCloseTo(6, 0);

    const aPath = path.join(dir, "a.mp3");
    const bPath = path.join(dir, "b.mp3");
    const inputs = [
      { id: "a", start: 0, audioDuration: await getDurationSeconds(aPath) },
      { id: "b", start: 2.5, audioDuration: await getDurationSeconds(bPath) }
    ];
    const timeline = buildTimeline(inputs, sourceDuration);
    expect(timeline.freezes).toHaveLength(1);

    const out = path.join(dir, "final.mp4");
    const files: Record<string, string> = { a: aPath, b: bPath };
    await renderFinalVideo(
      recording,
      timeline.placements.map((placement) => ({ filePath: files[placement.id], placement })),
      timeline,
      out
    );

    const outDuration = await getDurationSeconds(out);
    expect(Math.abs(outDuration - timeline.outputDuration)).toBeLessThan(0.15);
  });

  it("extends the video when the last clip runs past the end", async () => {
    const recording = path.join(dir, "recording.mp4");
    const sourceDuration = await getDurationSeconds(recording);
    const aPath = path.join(dir, "a.mp3");
    const timeline = buildTimeline(
      [{ id: "a", start: sourceDuration - 1, audioDuration: await getDurationSeconds(aPath) }],
      sourceDuration
    );
    expect(timeline.freezes[0].at).toBe(sourceDuration);

    const out = path.join(dir, "final-end.mp4");
    await renderFinalVideo(
      recording,
      timeline.placements.map((placement) => ({ filePath: aPath, placement })),
      timeline,
      out
    );
    const outDuration = await getDurationSeconds(out);
    expect(Math.abs(outDuration - timeline.outputDuration)).toBeLessThan(0.15);
  });
});
