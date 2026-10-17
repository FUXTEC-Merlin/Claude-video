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

export interface SegmentAudio {
  /** File name in the job's audio directory (content-addressed, see voiceCache). */
  file: string;
  /** Text the clip was generated from; lets the editor tell which segments changed. */
  text: string;
  /** Measured length in seconds. */
  duration: number;
}

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
  /** Generated voiceover per segment id, from the last voiceover run. */
  segmentAudio?: Record<string, SegmentAudio>;
  /** How the clips were fitted in the last render (speed-ups, freezes). */
  timeline?: Timeline;
  renderedFile?: string;
  /** Set on every render; used to bust the browser cache of the download URL. */
  renderedAt?: string;
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
