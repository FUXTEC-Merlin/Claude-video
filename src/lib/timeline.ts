/**
 * Fits generated voiceover clips onto the recording's timeline.
 *
 * Each clip may use the time until the next segment starts (or the end of the
 * video). If it is longer, it is first sped up slightly; whatever still does not
 * fit is absorbed by freezing the video on its last frame before the next
 * segment, so speech never overlaps and the picture never runs ahead of it.
 */

/** Speaking rate the script is planned for; also used to estimate clip lengths before voicing. */
export const WORDS_PER_SECOND = 2.3;

export function estimateSpeechSeconds(text: string): number {
  return text.split(/\s+/).filter(Boolean).length / WORDS_PER_SECOND;
}

export interface TimelineInput {
  id: string;
  /** Scripted start in the source video, in seconds. */
  start: number;
  /** Measured length of the generated audio, in seconds. */
  audioDuration: number;
}

export interface TimelineOptions {
  /** Highest playback speed applied to a clip before freezing the video. */
  maxSpeedup: number;
  /** Breathing room kept after a clip whenever the video has to be frozen. */
  gapSeconds: number;
}

export interface AudioPlacement {
  id: string;
  /** Start in the rendered output, in seconds. */
  outputStart: number;
  /** atempo factor (1 = unchanged). */
  speed: number;
  /** Length of the clip after speed adjustment. */
  playedDuration: number;
  /** Seconds the video is held after this clip's slot so it can finish. */
  freezeAfter: number;
}

export interface Freeze {
  /** Point in the source video where the last frame is held. */
  at: number;
  duration: number;
}

export interface Timeline {
  placements: AudioPlacement[];
  freezes: Freeze[];
  sourceDuration: number;
  outputDuration: number;
}

export const DEFAULT_TIMELINE_OPTIONS: TimelineOptions = {
  maxSpeedup: 1.15,
  gapSeconds: 0.2
};

const EPSILON = 0.01;

export function buildTimeline(
  inputs: TimelineInput[],
  sourceDuration: number,
  options: TimelineOptions = DEFAULT_TIMELINE_OPTIONS
): Timeline {
  const sorted = inputs
    .map((input) => ({
      ...input,
      start: Math.min(Math.max(0, input.start), sourceDuration)
    }))
    .sort((a, b) => a.start - b.start);

  const placements: AudioPlacement[] = [];
  const freezes: Freeze[] = [];
  let shift = 0;

  sorted.forEach((seg, index) => {
    const slotEnd = index + 1 < sorted.length ? sorted[index + 1].start : sourceDuration;
    const slot = Math.max(0, slotEnd - seg.start);

    let speed = 1;
    if (seg.audioDuration > slot + EPSILON && slot > 0) {
      speed = Math.min(options.maxSpeedup, seg.audioDuration / slot);
    } else if (slot === 0) {
      speed = options.maxSpeedup;
    }
    const playedDuration = seg.audioDuration / speed;

    let freezeAfter = 0;
    if (playedDuration > slot + EPSILON) {
      freezeAfter = playedDuration - slot + options.gapSeconds;
      const previous = freezes[freezes.length - 1];
      if (previous && Math.abs(previous.at - slotEnd) < EPSILON) {
        previous.duration += freezeAfter;
      } else {
        freezes.push({ at: slotEnd, duration: freezeAfter });
      }
    }

    placements.push({
      id: seg.id,
      outputStart: seg.start + shift,
      speed,
      playedDuration,
      freezeAfter
    });
    shift += freezeAfter;
  });

  return { placements, freezes, sourceDuration, outputDuration: sourceDuration + shift };
}

/** Maps a time in the source video to the rendered output (e.g. for chapter marks). */
export function mapSourceTime(timeline: Timeline, sourceTime: number): number {
  // A freeze at exactly sourceTime holds the preceding frame, so it still counts.
  const shift = timeline.freezes
    .filter((f) => f.at <= sourceTime + EPSILON)
    .reduce((sum, f) => sum + f.duration, 0);
  return sourceTime + shift;
}
