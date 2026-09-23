# Claude Video

Ein lokales Web-Tool, um **stumme Screen-Recordings** aufzunehmen, sie von **Claude** analysieren
zu lassen und automatisch mit einer **ElevenLabs**-KI-Stimme zu vertonen — ideal, um schnell
YouTube-Videos zu produzieren, in denen Tools oder Software vorgestellt werden, ohne selbst live
sprechen zu müssen.

## Ablauf

1. **Aufnehmen** — Im Browser wird per `getDisplayMedia` der Bildschirm aufgenommen (kein
   Mikrofon, du musst nichts sagen).
2. **Analysieren** — Aus der Aufnahme werden gleichmäßig verteilte Screenshots extrahiert und an
   Claude (Vision) geschickt. Claude erkennt, welches Tool gezeigt wird und was passiert, und
   schreibt daraus ein zeitlich synchronisiertes Voiceover-Skript (in Segmenten mit
   Start-/Endzeit), plus einen YouTube-Titel, eine Beschreibung und Kapitelmarken.
3. **Prüfen & anpassen** — Das Skript ist direkt im Browser editierbar (Text, Timing, Segmente
   hinzufügen/löschen), bevor die Stimme generiert wird.
4. **Vertonen** — Jedes Segment wird per ElevenLabs Text-to-Speech synthetisiert.
5. **Rendern** — `ffmpeg` legt die generierten Sprachsegmente zeitlich passend über das stumm
   geschaltete Original-Video und erzeugt ein fertiges MP4 zum Download.

## Setup

Voraussetzung: Node.js 20+.

```bash
npm install
cp .env.example .env.local
```

Trage in `.env.local` deine API-Keys ein:

- `ANTHROPIC_API_KEY` — für die Video-Analyse ([console.anthropic.com](https://console.anthropic.com/settings/keys))
- `ELEVENLABS_API_KEY` — für die KI-Stimme ([elevenlabs.io](https://elevenlabs.io/app/settings/api-keys))

`ffmpeg` muss nicht separat installiert werden — das Paket `ffmpeg-static` bringt beim
`npm install` ein passendes Binary mit.

```bash
npm run dev
```

Öffne danach [http://localhost:3000](http://localhost:3000). Der Browser fragt beim Start der
Aufnahme nach der Bildschirmfreigabe (Chrome/Edge empfohlen).

> **Hinweis:** Screen-Recording per `getDisplayMedia` funktioniert nur über `https://` oder
> `localhost`. Für lokale Entwicklung ist `localhost:3000` also ohne weitere Konfiguration nutzbar.

## Architektur

```
src/
  app/
    page.tsx                     UI-Wizard: Aufnehmen → Analysieren → Skript → Rendern
    api/
      jobs/route.ts               POST: Aufnahme hochladen, Job anlegen
      jobs/[id]/route.ts          GET: Job-Status abfragen
      jobs/[id]/analyze/route.ts  POST: Frames extrahieren + Claude-Analyse
      jobs/[id]/voiceover/route.ts POST: ElevenLabs TTS pro Segment
      jobs/[id]/render/route.ts   POST: ffmpeg-Mux (Video + Voiceover)
      jobs/[id]/download/route.ts GET: fertiges MP4 ausliefern
      voices/route.ts             GET: verfügbare ElevenLabs-Stimmen
  components/
    Recorder.tsx        Screen-Recording (MediaRecorder, kein Mikrofon)
    ScriptEditor.tsx     Editierbare Voiceover-Segmente
    VoiceSelector.tsx    Auswahl der ElevenLabs-Stimme
  lib/
    anthropic.ts   Claude-Vision-Prompt & JSON-Parsing
    elevenlabs.ts  ElevenLabs REST-Client (Voices, TTS)
    ffmpeg.ts      Frame-Extraktion & finales Video-Rendering
    jobStore.ts    Dateibasierte Job-Verwaltung (data/jobs/<id>/)
    types.ts       Gemeinsame Typen
```

Jeder Durchlauf legt unter `data/jobs/<job-id>/` die Rohaufnahme, extrahierte Frames, generierte
Audio-Segmente und das fertige Video ab (per `.gitignore` ausgeschlossen).

## Bekannte Grenzen

- Die Video-/Audio-Synchronisation basiert auf den von Claude vorgeschlagenen Zeitstempeln —
  bei Bedarf im Skript-Editor manuell nachjustieren.
- Sehr lange Aufnahmen werden auf ~36 Screenshots verdichtet, damit die Analyse performant und
  kosteneffizient bleibt.
- Es wird kein Mikrofon aufgenommen; optional kann Tab-/System-Ton mit aufgezeichnet werden.
