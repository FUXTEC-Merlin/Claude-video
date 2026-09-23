import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
// ffprobe-static ships no type declarations.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobeStatic = require("ffprobe-static") as { path: string };
import { mkdir, readdir, readFile } from "fs/promises";
import path from "path";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffprobeStatic?.path) {
  ffmpeg.setFfprobePath(ffprobeStatic.path);
}

export interface FramesResult {
  dir: string;
  files: string[];
  intervalSeconds: number;
  durationSeconds: number;
}

export function getDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      resolve(data.format.duration ?? 0);
    });
  });
}

/**
 * Samples evenly spaced JPEG frames from a video, capped at maxFrames so a
 * long recording still produces a Claude-vision-friendly prompt size.
 */
export async function extractFrames(
  videoPath: string,
  outDir: string,
  maxFrames = 36
): Promise<FramesResult> {
  await mkdir(outDir, { recursive: true });
  const durationSeconds = await getDurationSeconds(videoPath);
  const safeDuration = durationSeconds > 0 ? durationSeconds : 60;
  const intervalSeconds = Math.max(1, safeDuration / maxFrames);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([`-vf fps=1/${intervalSeconds}`, "-q:v 3"])
      .output(path.join(outDir, "frame-%04d.jpg"))
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });

  const files = (await readdir(outDir))
    .filter((f) => f.endsWith(".jpg"))
    .sort();

  return { dir: outDir, files, intervalSeconds, durationSeconds: safeDuration };
}

export async function frameToBase64(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return buf.toString("base64");
}

export interface MuxSegmentAudio {
  filePath: string;
  startSeconds: number;
}

/**
 * Mutes the original recording's audio track and mixes in the generated
 * voiceover segments, each delayed to its scripted start time.
 */
export function renderFinalVideo(
  videoPath: string,
  segments: MuxSegmentAudio[],
  outPath: string,
  totalDurationSeconds: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(videoPath);
    segments.forEach((seg) => command.input(seg.filePath));

    const delayFilters = segments
      .map((seg, i) => {
        const delayMs = Math.max(0, Math.round(seg.startSeconds * 1000));
        return `[${i + 1}:a]adelay=${delayMs}|${delayMs}[a${i}]`;
      })
      .join(";");

    const mixInputs = segments.map((_, i) => `[a${i}]`).join("");
    const mixFilter =
      segments.length > 0
        ? `${delayFilters};${mixInputs}amix=inputs=${segments.length}:duration=longest:normalize=0[aout]`
        : null;

    const videoEncodeOptions = [
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p"
    ];

    if (mixFilter) {
      command.complexFilter(mixFilter);
      command.outputOptions([
        "-map 0:v:0",
        "-map [aout]",
        ...videoEncodeOptions,
        "-c:a",
        "aac",
        "-t",
        String(totalDurationSeconds)
      ]);
    } else {
      command.outputOptions(["-map 0:v:0", "-an", ...videoEncodeOptions]);
    }

    command
      .output(outPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}
