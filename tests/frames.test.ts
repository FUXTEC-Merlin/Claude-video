import { execFileSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { afterAll, describe, expect, it } from "vitest";
import { extractFrames } from "@/lib/ffmpeg";

const dir = mkdtempSync(path.join(os.tmpdir(), "claude-video-frames-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function imageSize(file: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) =>
    ffmpeg.ffprobe(file, (err, data) => {
      if (err) return reject(err);
      const stream = data.streams[0];
      resolve({ width: stream.width ?? 0, height: stream.height ?? 0 });
    })
  );
}

describe("extractFrames", () => {
  it("downscales large screen recordings to fit Claude's image limits", async () => {
    const video = path.join(dir, "big.mp4");
    execFileSync(ffmpegPath as string, [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc=size=2560x1440:rate=10:duration=3",
      "-pix_fmt", "yuv420p", video
    ]);

    const result = await extractFrames(video, path.join(dir, "frames"));
    expect(result.files.length).toBeGreaterThan(0);
    const size = await imageSize(path.join(result.dir, result.files[0]));
    expect(size).toEqual({ width: 1920, height: 1080 });
  });
});
