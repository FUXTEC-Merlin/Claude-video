import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { WORDS_PER_SECOND } from "./timeline";
import type { AnalysisResult, AnalyzeRequestBody } from "./types";

const DEFAULT_MODEL = "claude-opus-5-5";

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

const AnalysisSchema = z.object({
  topic: z.string().describe("Kurzer erkannter Titel/Thema, z.B. Software- oder Toolname"),
  title: z.string().describe("Knackiger YouTube-Videotitel (max. 70 Zeichen)"),
  description: z
    .string()
    .describe("2-4 Sätze YouTube-Videobeschreibung inkl. relevanter Keywords"),
  chapters: z.array(
    z.object({
      time: z.number().describe("Startzeit des Kapitels in Sekunden"),
      label: z.string()
    })
  ),
  segments: z.array(
    z.object({
      start: z.number().describe("Startzeit in Sekunden"),
      end: z.number().describe("Endzeit in Sekunden"),
      text: z.string().describe("Gesprochener Voiceover-Text für dieses Zeitfenster")
    })
  )
});

type RawAnalysis = z.infer<typeof AnalysisSchema>;

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
  const duration = durationSeconds.toFixed(1);

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

  const system = `Du bist ein erfahrener YouTube-Skriptautor, der aus stummen Screen-Recordings (Tool-Demos, Software-Vorstellungen, Tutorials) ein synchrones Voiceover-Skript schreibt. Du bekommst eine zeitlich geordnete Reihe von Screenshots mit Zeitstempeln aus einem ${duration} Sekunden langen Video.

Analysiere genau, welche Anwendung/Website/Software gezeigt wird und was der Nutzer Schritt für Schritt tut (Klicks, Eingaben, Navigation, Ergebnisse). Schreibe daraus ein natürliches Voiceover-Skript auf ${language} im Stil: ${toneDescription}.

Regeln für die Segmente:
- Jedes Segment beschreibt, was in seinem Zeitfenster zu sehen ist; orientiere dich an den Frame-Zeitstempeln.
- Segmente überlappen sich nicht und enden spätestens bei ${duration}s.
- Die spätere KI-Stimme spricht etwa ${WORDS_PER_SECOND} Wörter pro Sekunde. Schreibe pro Segment höchstens so viel Text, wie in seiner Dauer natürlich sprechbar ist. Wird es zu lang, muss das Video an dieser Stelle angehalten werden — das wirkt unruhig, also lieber knapper formulieren.
- Kurze Pausen zwischen Segmenten sind gut, wenn auf dem Bildschirm gerade nichts Erklärenswertes passiert.`;

  const response = await anthropic.beta.messages.parse({
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: betaZodOutputFormat(AnalysisSchema) },
    // Server-side fallback: if the model declines for policy reasons, the API retries
    // on its default fallback model within the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${contextHint}\n\nHier sind die Screenshots in zeitlicher Reihenfolge:`
          },
          ...imageBlocks,
          { type: "text", text: "Erstelle jetzt das Voiceover-Skript." }
        ]
      }
    ]
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude hat die Analyse dieser Aufnahme abgelehnt.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Die Claude-Antwort wurde abgeschnitten (max_tokens erreicht).");
  }
  if (!response.parsed_output) {
    throw new Error("Claude hat kein gültiges Skript geliefert.");
  }

  return normalizeAnalysis(response.parsed_output, durationSeconds);
}

/**
 * Sorts segments, clamps them into the video and removes overlaps, since the
 * schema guarantees shape but not sensible timing.
 */
export function normalizeAnalysis(data: RawAnalysis, durationSeconds: number): AnalysisResult {
  const sorted = data.segments
    .map((s) => ({ start: Math.max(0, s.start), end: s.end, text: s.text.trim() }))
    .filter((s) => s.text.length > 0 && s.start < durationSeconds)
    .sort((a, b) => a.start - b.start);

  const segments = sorted.map((s, index) => {
    const nextStart = sorted[index + 1]?.start ?? durationSeconds;
    const end = Math.min(Math.max(s.end, s.start + 0.5), nextStart, durationSeconds);
    return { id: `seg-${index + 1}`, start: s.start, end: Math.max(end, s.start), text: s.text };
  });

  return {
    topic: data.topic || "Unbekanntes Tool",
    title: data.title || "Tool-Demo",
    description: data.description,
    chapters: data.chapters
      .map((c) => ({ time: Math.max(0, c.time), label: c.label }))
      .sort((a, b) => a.time - b.time),
    segments,
    durationSeconds
  };
}
