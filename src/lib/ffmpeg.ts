import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
// ffprobe-static ships no type declarations.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobeStatic = require("ffprobe-static") as { path: string };
import { mkdir, readdir, readFile } from "fs/promises";
import path from "path";
import type { AudioPlacement, Timeline } from "./timeline";

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

const VIDEO_ENCODE_OPTIONS = ["-c:v libx264", "-preset veryfast", "-crf 20", "-pix_fmt yuv420p"];

/**
 * Re-encodes a browser recording into a constant-frame-rate MP4. MediaRecorder
 * WebM files often lack a duration and have variable timestamps, which breaks
 * frame extraction and precise cutting later on.
 */
export function normalizeRecording(inputPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-map 0:v:0",
        "-map 0:a:0?",
        "-vf fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2",
        ...VIDEO_ENCODE_OPTIONS,
        "-c:a aac",
        "-movflags +faststart"
      ])
      .output(outPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

export interface RenderClip {
  filePath: string;
  placement: AudioPlacement;
}

const OUTPUT_FPS = 30;
const FRAME_FORMAT = `format=yuv420p,setsar=1`;

/** Saves the frame shown just before `atSeconds` as a PNG (used as freeze frame). */
export function extractStill(videoPath: string, atSeconds: number, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .inputOptions([`-ss ${Math.max(0, atSeconds - 0.05).toFixed(3)}`])
      .outputOptions(["-frames:v 1", "-update 1"])
      .output(outPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * Builds the video filter: cuts the source at every freeze point and inserts the
 * corresponding still image (inputs firstStillInput.. in freeze order) for the
 * freeze duration. Returns null when the video can be used unchanged.
 *
 * Stills are separate looped inputs because tpad does not pad after trim in the
 * bundled ffmpeg build.
 */
export function buildVideoFilter(timeline: Timeline, firstStillInput: number): string | null {
  if (timeline.freezes.length === 0) return null;

  const cuts: Array<{ from: number; to: number }> = [];
  let from = 0;
  for (const freeze of timeline.freezes) {
    cuts.push({ from, to: freeze.at });
    from = freeze.at;
  }
  cuts.push({ from, to: timeline.sourceDuration });

  const filters = [`[0:v]split=${cuts.length}${cuts.map((_, i) => `[p${i}]`).join("")}`];
  const sequence: string[] = [];
  cuts.forEach((cut, i) => {
    if (cut.to - cut.from > 0.01) {
      filters.push(
        `[p${i}]trim=start=${cut.from.toFixed(3)}:end=${cut.to.toFixed(3)},setpts=PTS-STARTPTS,${FRAME_FORMAT}[c${i}]`
      );
      sequence.push(`[c${i}]`);
    } else {
      filters.push(`[p${i}]nullsink`);
    }
    if (i < timeline.freezes.length) {
      filters.push(`[${firstStillInput + i}:v]${FRAME_FORMAT},setpts=PTS-STARTPTS[f${i}]`);
      sequence.push(`[f${i}]`);
    }
  });
  filters.push(
    `${sequence.join("")}concat=n=${sequence.length}:v=1:a=0,fps=${OUTPUT_FPS}[vout]`
  );
  return filters.join(";");
}

export function buildAudioFilter(clips: RenderClip[], firstAudioInput: number): string | null {
  if (clips.length === 0) return null;
  const filters = clips.map(({ placement }, i) => {
    const delayMs = Math.max(0, Math.round(placement.outputStart * 1000));
    const tempo = Math.abs(placement.speed - 1) > 0.001 ? `atempo=${placement.speed.toFixed(4)},` : "";
    return `[${firstAudioInput + i}:a]${tempo}adelay=${delayMs}:all=1[a${i}]`;
  });
  const inputs = clips.map((_, i) => `[a${i}]`).join("");
  filters.push(`${inputs}amix=inputs=${clips.length}:duration=longest:normalize=0[aout]`);
  return filters.join(";");
}

/**
 * Renders the final video: the original audio is dropped, the video is frozen
 * where the timeline needs extra time, and each voiceover clip is placed (and
 * sped up if needed) at its output position. Freeze frames are written next to
 * outPath.
 */
export async function renderFinalVideo(
  videoPath: string,
  clips: RenderClip[],
  timeline: Timeline,
  outPath: string
): Promise<void> {
  const stills = await Promise.all(
    timeline.freezes.map(async (freeze, i) => {
      const stillPath = path.join(path.dirname(outPath), `freeze-${i + 1}.png`);
      await extractStill(videoPath, freeze.at, stillPath);
      return stillPath;
    })
  );

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg(videoPath);
    stills.forEach((stillPath, i) => {
      command
        .input(stillPath)
        .inputOptions([
          "-loop 1",
          `-framerate ${OUTPUT_FPS}`,
          `-t ${timeline.freezes[i].duration.toFixed(3)}`
        ]);
    });
    clips.forEach((clip) => command.input(clip.filePath));

    const videoFilter = buildVideoFilter(timeline, 1);
    const audioFilter = buildAudioFilter(clips, 1 + stills.length);
    const graph = [videoFilter, audioFilter].filter(Boolean).join(";");
    if (graph) command.complexFilter(graph);

    command.outputOptions([
      videoFilter ? "-map [vout]" : "-map 0:v:0",
      ...(audioFilter ? ["-map [aout]", "-c:a aac"] : ["-an"]),
      ...VIDEO_ENCODE_OPTIONS,
      "-movflags +faststart",
      `-t ${timeline.outputDuration.toFixed(3)}`
    ]);

    command
      .output(outPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}
