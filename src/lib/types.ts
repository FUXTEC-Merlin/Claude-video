import type { Timeline } from "./timeline";

export interface ScriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface Chapter {
  time: number;
  label: string;
}

export interface AnalysisResult {
  topic: string;
  title: string;
  description: string;
  chapters: Chapter[];
  segments: ScriptSegment[];
  durationSeconds: number;
}

export interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  previewUrl: string | null;
  labels: Record<string, string>;
}

export type JobStage =
  | "uploaded"
  | "analyzing"
  | "analyzed"
  | "voicing"
  | "voiced"
  | "rendering"
  | "rendered"
  | "error";

export interface JobMeta {
  id: string;
  createdAt: string;
  stage: JobStage;
  /** Normalized constant-frame-rate MP4 used for analysis and rendering. */
  recordingFile: string;
  /** The file as uploaded by the browser. */
  sourceFile?: string;
  durationSeconds?: number;
  analysis?: AnalysisResult;
  voiceId?: string;
  modelId?: string;
  segmentAudioFiles?: Record<string, string>;
  /** Measured length of each generated clip in seconds, keyed by segment id. */
  segmentAudioDurations?: Record<string, number>;
  /** How the clips were fitted in the last render (speed-ups, freezes). */
  timeline?: Timeline;
  renderedFile?: string;
  error?: string;
}

export interface AnalyzeRequestBody {
  language: "de" | "en";
  tone: "enthusiastic" | "calm" | "concise" | "professional";
  context?: string;
}

export interface VoiceoverRequestBody {
  segments: ScriptSegment[];
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
}
