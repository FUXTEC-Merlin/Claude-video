"use client";

import { useState } from "react";
import Recorder from "@/components/Recorder";
import ScriptEditor from "@/components/ScriptEditor";
import VoiceSelector from "@/components/VoiceSelector";
import { mapSourceTime } from "@/lib/timeline";
import type { AnalyzeRequestBody, JobMeta, ScriptSegment } from "@/lib/types";

type Step = "record" | "uploading" | "analyze" | "script" | "voicing" | "rendering" | "done";

export default function Home() {
  const [step, setStep] = useState<Step>("record");
  const [job, setJob] = useState<JobMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [language, setLanguage] = useState<AnalyzeRequestBody["language"]>("de");
  const [tone, setTone] = useState<AnalyzeRequestBody["tone"]>("enthusiastic");
  const [context, setContext] = useState("");

  const [voiceId, setVoiceId] = useState("");
  const [segments, setSegments] = useState<ScriptSegment[]>([]);

  async function handleRecorded(blob: Blob) {
    setError(null);
    setStep("uploading");
    try {
      const formData = new FormData();
      formData.append("recording", blob, "recording.webm");
      const res = await fetch("/api/jobs", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJob(data.job);
      setStep("analyze");
    } catch (err) {
      setError((err as Error).message);
      setStep("record");
    }
  }

  async function runAnalysis() {
    if (!job) return;
    setError(null);
    setStep("uploading");
    try {
      const res = await fetch(`/api/jobs/${job.id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, tone, context })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJob(data.job);
      setSegments(data.job.analysis?.segments ?? []);
      setStep("script");
    } catch (err) {
      setError((err as Error).message);
      setStep("analyze");
    }
  }

  async function generateVoiceover() {
    if (!job) return;
    setError(null);
    setStep("voicing");
    try {
      const res = await fetch(`/api/jobs/${job.id}/voiceover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments, voiceId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJob(data.job);
      await renderVideo(job.id);
    } catch (err) {
      setError((err as Error).message);
      setStep("script");
    }
  }

  async function renderVideo(jobId: string) {
    setStep("rendering");
    try {
      const res = await fetch(`/api/jobs/${jobId}/render`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJob(data.job);
      setStep("done");
    } catch (err) {
      setError((err as Error).message);
      setStep("script");
    }
  }

  function reset() {
    setJob(null);
    setSegments([]);
    setContext("");
    setError(null);
    setStep("record");
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Claude Video</h1>
        <p className="text-white/60">
          Screen-Recording aufnehmen → KI versteht das Video und schreibt ein Skript → ElevenLabs
          vertont es. Ideal für YouTube-Tool-Vorstellungen und Tutorials.
        </p>
      </header>

      {error && (
        <div className="card border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
      )}

      {step === "record" && <Recorder onRecorded={handleRecorded} />}

      {step === "uploading" && <StatusCard text="Video wird hochgeladen und Frames extrahiert…" />}

      {step === "analyze" && job && (
        <div className="card p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">2. KI-Analyse konfigurieren</h2>
          <p className="text-sm text-white/60">
            Aufnahme: {Math.round(job.durationSeconds ?? 0)}s. Claude schaut sich die Screenshots an
            und schreibt daraus ein Voiceover-Skript.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/50">Sprache</label>
              <select
                className="select mt-1"
                value={language}
                onChange={(e) => setLanguage(e.target.value as AnalyzeRequestBody["language"])}
              >
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-white/50">Ton</label>
              <select
                className="select mt-1"
                value={tone}
                onChange={(e) => setTone(e.target.value as AnalyzeRequestBody["tone"])}
              >
                <option value="enthusiastic">Enthusiastisch (YouTuber)</option>
                <option value="calm">Ruhig / Tutorial</option>
                <option value="concise">Knapp & präzise</option>
                <option value="professional">Professionell / Business</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-white/50">
              Zusätzlicher Kontext (optional) — z.B. Name des Tools, worauf besonders eingegangen werden soll
            </label>
            <textarea
              className="textarea mt-1"
              rows={2}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="z.B. „Das ist mein neues SaaS-Tool XY, Fokus auf das Dashboard-Feature.“"
            />
          </div>
          <button className="btn btn-primary w-fit" onClick={runAnalysis}>
            Video analysieren
          </button>
        </div>
      )}

      {step === "script" && job?.analysis && (
        <div className="flex flex-col gap-6">
          <div className="card p-6 flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{job.analysis.title}</h2>
            <p className="text-sm text-white/60">{job.analysis.description}</p>
            {job.analysis.chapters.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {job.analysis.chapters.map((c, i) => (
                  <span key={i} className="pill bg-white/5 text-white/70">
                    {Math.round(c.time)}s · {c.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="card p-6 flex flex-col gap-4">
            <h2 className="text-lg font-semibold">3. Skript prüfen & anpassen</h2>
            <p className="text-sm text-white/50">
              Die Stimme darf jeweils bis zum Start des nächsten Segments sprechen. Ist ein Text zu
              lang, wird er leicht beschleunigt und notfalls das Video kurz angehalten.
            </p>
            <ScriptEditor
              segments={segments}
              durationSeconds={job.durationSeconds ?? job.analysis.durationSeconds}
              onChange={setSegments}
            />
          </div>

          <div className="card p-6 flex flex-col gap-4">
            <h2 className="text-lg font-semibold">4. ElevenLabs-Stimme wählen</h2>
            <VoiceSelector value={voiceId} onChange={setVoiceId} />
            <button
              className="btn btn-primary w-fit"
              disabled={!voiceId || segments.length === 0}
              onClick={generateVoiceover}
            >
              Stimme generieren & Video rendern
            </button>
          </div>
        </div>
      )}

      {step === "voicing" && <StatusCard text="ElevenLabs erzeugt die Stimme für jedes Segment…" />}
      {step === "rendering" && <StatusCard text="Video wird mit der Stimme zusammengeschnitten…" />}

      {step === "done" && job?.renderedFile && (
        <div className="card p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Fertig 🎬</h2>
          <video
            src={`/api/jobs/${job.id}/download`}
            controls
            className="w-full rounded-xl border border-border bg-black"
          />
          {job.timeline && <TimelineSummary job={job} />}
          <div className="flex gap-3">
            <a className="btn btn-primary" href={`/api/jobs/${job.id}/download`} download>
              Video herunterladen
            </a>
            <button className="btn btn-secondary" onClick={reset}>
              Neues Video aufnehmen
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function StatusCard({ text }: { text: string }) {
  return (
    <div className="card p-8 flex items-center gap-3 justify-center">
      <span className="h-4 w-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      <p className="text-white/70">{text}</p>
    </div>
  );
}

function formatChapterTime(sec: number): string {
  const total = Math.floor(sec);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

function TimelineSummary({ job }: { job: JobMeta }) {
  const timeline = job.timeline!;
  const spedUp = timeline.placements.filter((p) => p.speed > 1.001).length;
  const frozen = timeline.freezes.reduce((sum, f) => sum + f.duration, 0);
  // Chapter marks move with the freezes, so YouTube timestamps stay correct.
  const chapters = (job.analysis?.chapters ?? []).map((c) => ({
    ...c,
    time: mapSourceTime(timeline, c.time)
  }));

  return (
    <div className="flex flex-col gap-3 text-sm text-white/60">
      <p>
        Länge {formatChapterTime(timeline.outputDuration)}
        {spedUp > 0 && ` · ${spedUp} Segment(e) leicht beschleunigt`}
        {frozen > 0 && ` · Video an ${timeline.freezes.length} Stelle(n) insgesamt ${frozen.toFixed(1)}s angehalten`}
      </p>
      {chapters.length > 0 && (
        <div>
          <label className="text-xs text-white/50">Kapitel für die YouTube-Beschreibung</label>
          <textarea
            className="textarea mt-1 font-mono text-xs"
            rows={Math.min(chapters.length, 8)}
            readOnly
            value={chapters.map((c) => `${formatChapterTime(c.time)} ${c.label}`).join("\n")}
          />
        </div>
      )}
    </div>
  );
}
