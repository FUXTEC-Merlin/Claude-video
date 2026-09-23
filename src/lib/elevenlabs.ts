import type { ElevenLabsVoice } from "./types";

const BASE_URL = "https://api.elevenlabs.io/v1";

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY ist nicht gesetzt. Bitte in .env.local eintragen."
    );
  }
  return key;
}

export async function listVoices(): Promise<ElevenLabsVoice[]> {
  const res = await fetch(`${BASE_URL}/voices`, {
    headers: { "xi-api-key": getApiKey() },
    cache: "no-store"
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs Voice-Liste fehlgeschlagen (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    voices: Array<{
      voice_id: string;
      name: string;
      preview_url?: string | null;
      labels?: Record<string, string>;
    }>;
  };
  return data.voices.map((v) => ({
    voiceId: v.voice_id,
    name: v.name,
    previewUrl: v.preview_url ?? null,
    labels: v.labels ?? {}
  }));
}

export interface SynthesizeOptions {
  voiceId: string;
  text: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
}

export async function synthesizeSpeech(options: SynthesizeOptions): Promise<Buffer> {
  const {
    voiceId,
    text,
    modelId = "eleven_multilingual_v2",
    stability = 0.45,
    similarityBoost = 0.8,
    style = 0.25
  } = options;

  const res = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": getApiKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
        style,
        use_speaker_boost: true
      }
    })
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs TTS fehlgeschlagen (${res.status}): ${await res.text()}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
