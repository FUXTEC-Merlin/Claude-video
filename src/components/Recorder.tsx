"use client";

import { useEffect, useRef, useState } from "react";

interface RecorderProps {
  onRecorded: (blob: Blob) => void;
}

type RecorderState = "idle" | "recording" | "reviewing";

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "video/webm";
}

export default function Recorder({ onRecorded }: RecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [captureSystemAudio, setCaptureSystemAudio] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const reviewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blobRef = useRef<Blob | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: captureSystemAudio
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setState("reviewing");
        stream.getTracks().forEach((t) => t.stop());
      };

      // Stop automatically if the user ends sharing from the browser's own UI.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
        if (timerRef.current) clearInterval(timerRef.current);
      });

      recorderRef.current = recorder;
      recorder.start();
      setState("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      setError(
        (err as Error).message ||
          "Bildschirmfreigabe wurde nicht erteilt oder wird vom Browser nicht unterstützt."
      );
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    blobRef.current = null;
    setState("idle");
    setSeconds(0);
  }

  function confirm() {
    if (blobRef.current) onRecorded(blobRef.current);
  }

  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");

  return (
    <div className="card p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">1. Bildschirm aufnehmen</h2>
        <p className="text-sm text-white/60 mt-1">
          Nimm dein Tool oder deine App stumm auf — ohne Mikrofon. Die Stimme kommt später von der KI.
        </p>
      </div>

      {state === "idle" && (
        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={captureSystemAudio}
              onChange={(e) => setCaptureSystemAudio(e.target.checked)}
              className="h-4 w-4"
            />
            System-/Tab-Ton mit aufnehmen (optional, z.B. Sound-Effekte im Tool)
          </label>
          <button className="btn btn-primary w-fit" onClick={startRecording}>
            Bildschirmfreigabe starten
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}

      {state === "recording" && (
        <div className="flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-xl border border-border">
            <video ref={videoRef} autoPlay muted className="w-full bg-black" />
            <div className="absolute top-3 left-3 pill bg-red-500/90 text-white">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
              REC {minutes}:{secs}
            </div>
          </div>
          <button className="btn btn-danger w-fit" onClick={stopRecording}>
            Aufnahme beenden
          </button>
        </div>
      )}

      {state === "reviewing" && previewUrl && (
        <div className="flex flex-col gap-4">
          <video ref={reviewRef} src={previewUrl} controls className="w-full rounded-xl border border-border bg-black" />
          <div className="flex gap-3">
            <button className="btn btn-secondary" onClick={retake}>
              Erneut aufnehmen
            </button>
            <button className="btn btn-primary" onClick={confirm}>
              Weiter zur KI-Analyse
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
