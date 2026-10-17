"use client";

import { useMemo } from "react";
import { buildTimeline, estimateSpeechSeconds, type AudioPlacement } from "@/lib/timeline";
import type { ScriptSegment } from "@/lib/types";

interface ScriptEditorProps {
  segments: ScriptSegment[];
  durationSeconds: number;
  onChange: (segments: ScriptSegment[]) => void;
}

function FitBadge({ placement }: { placement?: AudioPlacement }) {
  if (!placement) return null;
  if (placement.freezeAfter > 0) {
    return (
      <span
        className="pill bg-amber-500/10 text-amber-300"
        title="Der Text ist länger als die Zeit bis zum nächsten Segment. Das Video wird hier kurz angehalten — Text kürzen, um das zu vermeiden."
      >
        zu lang · ~{placement.freezeAfter.toFixed(1)}s Standbild
      </span>
    );
  }
  if (placement.speed > 1.001) {
    return (
      <span className="pill bg-sky-500/10 text-sky-300" title="Wird leicht schneller gesprochen.">
        knapp · {Math.round((placement.speed - 1) * 100)}% schneller
      </span>
    );
  }
  return <span className="pill bg-emerald-500/10 text-emerald-300">passt</span>;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ScriptEditor({ segments, durationSeconds, onChange }: ScriptEditorProps) {
  const totalWords = useMemo(
    () => segments.reduce((sum, s) => sum + s.text.split(/\s+/).filter(Boolean).length, 0),
    [segments]
  );

  // Same fitting logic as the renderer, fed with estimated speech lengths.
  const estimate = useMemo(() => {
    const timeline = buildTimeline(
      segments
        .filter((s) => s.text.trim())
        .map((s) => ({ id: s.id, start: s.start, audioDuration: estimateSpeechSeconds(s.text) })),
      durationSeconds
    );
    return {
      byId: new Map(timeline.placements.map((p) => [p.id, p])),
      extraSeconds: timeline.outputDuration - durationSeconds
    };
  }, [segments, durationSeconds]);

  function updateSegment(id: string, patch: Partial<ScriptSegment>) {
    onChange(segments.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeSegment(id: string) {
    onChange(segments.filter((s) => s.id !== id));
  }

  function addSegment() {
    const last = segments[segments.length - 1];
    const start = last ? last.end : 0;
    const newSegment: ScriptSegment = {
      id: `seg-${Date.now()}`,
      start,
      end: start + 3,
      text: ""
    };
    onChange([...segments, newSegment]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/60">
          {segments.length} Segmente · ca. {totalWords} Wörter
          {estimate.extraSeconds > 0.05 && (
            <span className="text-amber-300">
              {" "}
              · Video wird geschätzt {estimate.extraSeconds.toFixed(1)}s länger
            </span>
          )}
        </p>
        <button className="btn btn-secondary text-xs" onClick={addSegment}>
          + Segment
        </button>
      </div>
      <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
        {segments.map((segment) => (
          <div key={segment.id} className="card p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-white/50">
              <span>Start</span>
              <input
                type="number"
                step="0.1"
                className="input !w-20 !py-1"
                value={segment.start}
                onChange={(e) => updateSegment(segment.id, { start: Number(e.target.value) })}
              />
              <span>Ende</span>
              <input
                type="number"
                step="0.1"
                className="input !w-20 !py-1"
                value={segment.end}
                onChange={(e) => updateSegment(segment.id, { end: Number(e.target.value) })}
              />
              <span className="ml-auto flex items-center gap-2">
                <FitBadge placement={estimate.byId.get(segment.id)} />
                {formatTime(segment.start)} – {formatTime(segment.end)}
              </span>
              <button
                className="text-red-400 hover:text-red-300"
                onClick={() => removeSegment(segment.id)}
                title="Segment löschen"
              >
                ✕
              </button>
            </div>
            <textarea
              className="textarea"
              rows={2}
              value={segment.text}
              onChange={(e) => updateSegment(segment.id, { text: e.target.value })}
            />
          </div>
        ))}
        {segments.length === 0 && (
          <p className="text-sm text-white/40 italic">Noch keine Segmente vorhanden.</p>
        )}
      </div>
    </div>
  );
}
