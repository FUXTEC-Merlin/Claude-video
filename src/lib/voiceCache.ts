import { createHash } from "crypto";
import type { VoiceoverRequestBody } from "./types";

type VoiceSettings = Omit<VoiceoverRequestBody, "segments">;

/**
 * File name for a generated clip, derived from everything that affects the audio.
 * Identical text with identical voice settings maps to the same file, so a
 * re-run only synthesizes segments whose text (or voice) changed.
 */
export function audioCacheFileName(settings: VoiceSettings, text: string): string {
  const key = JSON.stringify([
    settings.voiceId,
    settings.modelId ?? null,
    settings.stability ?? null,
    settings.similarityBoost ?? null,
    settings.style ?? null,
    text.trim()
  ]);
  return `${createHash("sha256").update(key).digest("hex").slice(0, 24)}.mp3`;
}
