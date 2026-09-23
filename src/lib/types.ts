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
  recordingFile: string;
  durationSeconds?: number;
  analysis?: AnalysisResult;
  voiceId?: string;
  modelId?: string;
  segmentAudioFiles?: Record<string, string>;
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
