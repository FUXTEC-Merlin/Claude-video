"use client";

import { useEffect, useState } from "react";
import type { ElevenLabsVoice } from "@/lib/types";

interface VoiceSelectorProps {
  value: string;
  onChange: (voiceId: string) => void;
}

export default function VoiceSelector({ value, onChange }: VoiceSelectorProps) {
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/voices")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Stimmen konnten nicht geladen werden.");
        return data.voices as ElevenLabsVoice[];
      })
      .then((v) => {
        if (cancelled) return;
        setVoices(v);
        if (!value && v.length > 0) onChange(v[0].voiceId);
      })
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-sm text-white/50">Lade ElevenLabs-Stimmen…</p>;
  if (error)
    return (
      <p className="text-sm text-red-400">
        {error} — prüfe deinen ELEVENLABS_API_KEY in .env.local.
      </p>
    );

  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      {voices.map((voice) => (
        <option key={voice.voiceId} value={voice.voiceId}>
          {voice.name}
          {voice.labels?.accent ? ` — ${voice.labels.accent}` : ""}
        </option>
      ))}
    </select>
  );
}
