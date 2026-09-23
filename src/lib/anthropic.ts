import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResult, AnalyzeRequestBody } from "./types";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY ist nicht gesetzt. Bitte in .env.local eintragen."
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

const TONE_LABELS: Record<AnalyzeRequestBody["tone"], string> = {
  enthusiastic: "energiegeladen, begeistert, wie ein YouTuber, der ein cooles Tool zeigt",
  calm: "ruhig, geduldig, erklärend, wie ein Tutorial",
  concise: "kurz, prägnant, auf den Punkt, wenig Füllwörter",
  professional: "sachlich, professionell, wie eine Produktdemo für Business-Kunden"
};

export interface FrameInput {
  base64: string;
  timestampSeconds: number;
}

export async function analyzeFramesWithClaude(
  frames: FrameInput[],
  durationSeconds: number,
  options: AnalyzeRequestBody
): Promise<AnalysisResult> {
  const anthropic = getClient();
  const language = options.language === "en" ? "English" : "Deutsch";
  const toneDescription = TONE_LABELS[options.tone] ?? TONE_LABELS.enthusiastic;

  const imageBlocks = frames.flatMap((frame) => [
    {
      type: "text" as const,
      text: `Zeitstempel: ${frame.timestampSeconds.toFixed(1)}s`
    },
    {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: "image/jpeg" as const,
        data: frame.base64
      }
    }
  ]);

  const contextHint = options.context
    ? `Zusätzlicher Kontext vom Nutzer: "${options.context}"`
    : "Kein zusätzlicher Kontext gegeben — erkenne Tool und Thema ausschließlich aus den Screenshots.";

  const jsonSchemaHint = `{
  "topic": "kurzer erkannter Titel/Thema, z.B. Software- oder Toolname",
  "title": "knackiger YouTube-Videotitel (max. 70 Zeichen)",
  "description": "2-4 Sätze YouTube-Videobeschreibung inkl. relevanter Keywords",
  "chapters": [ { "time": 0, "label": "Intro" }, ... ],
  "segments": [ { "start": 0.0, "end": 4.5, "text": "gesprochener Voiceover-Text für dieses Zeitfenster" } ]
}`;

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 4096,
    system: `Du bist ein erfahrener YouTube-Skriptautor, der aus stummen Screen-Recordings (Tool-Demos, Software-Vorstellungen, Tutorials) ein synchrones Voiceover-Skript schreibt. Du bekommst eine zeitlich geordnete Reihe von Screenshots mit Zeitstempeln aus einem ${durationSeconds.toFixed(
      1
    )} Sekunden langen Video. Analysiere genau, welche Anwendung/Website/Software gezeigt wird und was der Nutzer Schritt für Schritt tut (Klicks, Eingaben, Navigation, Ergebnisse). Schreibe daraus ein natürliches, ${toneDescription} Voiceover-Skript auf ${language}, das in kurze Segmente unterteilt ist. Jedes Segment muss zeitlich zu dem passen, was auf dem Screenshot in diesem Zeitraum zu sehen ist — die Zeitstempel der Segmente müssen sich an den gegebenen Frame-Zeitstempeln orientieren und dürfen die Gesamtlänge ${durationSeconds.toFixed(
      1
    )}s nicht überschreiten. Segmente dürfen sich nicht überlappen. Plane pro Segment realistische Sprechzeit (ca. 2.3 Wörter pro Sekunde bei normaler Sprechgeschwindigkeit), damit die spätere KI-Stimme zeitlich passt — schreibe also nicht mehr Text hinein, als in der Segmentdauer natürlich sprechbar ist. Antworte AUSSCHLIESSLICH mit validem JSON exakt in diesem Format, ohne Markdown-Codeblock, ohne Erklärtext:\n${jsonSchemaHint}`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${contextHint}\n\nHier sind die Screenshots in zeitlicher Reihenfolge:`
          },
          ...imageBlocks,
          {
            type: "text",
            text: "Erstelle jetzt das JSON-Skript wie im System-Prompt beschrieben."
          }
        ]
      }
    ]
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude hat keine Textantwort geliefert.");
  }

  const parsed = extractJson(textBlock.text);
  return normalizeAnalysis(parsed, durationSeconds);
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch (err) {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }
    throw new Error(`Konnte Claude-Antwort nicht als JSON parsen: ${(err as Error).message}`);
  }
}

function normalizeAnalysis(raw: unknown, durationSeconds: number): AnalysisResult {
  const data = raw as Partial<AnalysisResult> & { segments?: unknown[] };
  const segments = Array.isArray(data.segments) ? data.segments : [];

  const normalizedSegments = segments
    .map((seg, index) => {
      const s = seg as { start?: number; end?: number; text?: string };
      const start = Math.max(0, Number(s.start) || 0);
      const end = Math.max(start + 0.5, Number(s.end) || start + 3);
      return {
        id: `seg-${index + 1}`,
        start,
        end: Math.min(end, durationSeconds + 5),
        text: String(s.text ?? "").trim()
      };
    })
    .filter((seg) => seg.text.length > 0)
    .sort((a, b) => a.start - b.start);

  return {
    topic: String(data.topic ?? "Unbekanntes Tool"),
    title: String(data.title ?? "Tool-Demo"),
    description: String(data.description ?? ""),
    chapters: Array.isArray(data.chapters)
      ? data.chapters.map((c) => {
          const ch = c as { time?: number; label?: string };
          return { time: Number(ch.time) || 0, label: String(ch.label ?? "") };
        })
      : [],
    segments: normalizedSegments,
    durationSeconds
  };
}
