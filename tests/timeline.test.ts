import { describe, expect, it } from "vitest";
import { buildTimeline, mapSourceTime } from "@/lib/timeline";

const opts = { maxSpeedup: 1.15, gapSeconds: 0.2 };

describe("buildTimeline", () => {
  it("leaves clips that fit untouched", () => {
    const t = buildTimeline(
      [
        { id: "a", start: 0, audioDuration: 3 },
        { id: "b", start: 5, audioDuration: 4 }
      ],
      10,
      opts
    );
    expect(t.freezes).toEqual([]);
    expect(t.outputDuration).toBe(10);
    expect(t.placements.map((p) => [p.outputStart, p.speed])).toEqual([
      [0, 1],
      [5, 1]
    ]);
  });

  it("speeds up slightly overlong clips without freezing", () => {
    const t = buildTimeline(
      [
        { id: "a", start: 0, audioDuration: 5.5 },
        { id: "b", start: 5, audioDuration: 2 }
      ],
      10,
      opts
    );
    expect(t.placements[0].speed).toBeCloseTo(1.1);
    expect(t.placements[0].freezeAfter).toBe(0);
    expect(t.freezes).toEqual([]);
    expect(t.placements[1].outputStart).toBe(5);
  });

  it("freezes the video when speeding up is not enough and shifts later clips", () => {
    const t = buildTimeline(
      [
        { id: "a", start: 0, audioDuration: 8 },
        { id: "b", start: 5, audioDuration: 2 }
      ],
      10,
      opts
    );
    const a = t.placements[0];
    expect(a.speed).toBe(1.15);
    const expectedFreeze = 8 / 1.15 - 5 + 0.2;
    expect(a.freezeAfter).toBeCloseTo(expectedFreeze);
    expect(t.freezes).toHaveLength(1);
    expect(t.freezes[0].at).toBe(5);
    expect(t.placements[1].outputStart).toBeCloseTo(5 + expectedFreeze);
    expect(t.outputDuration).toBeCloseTo(10 + expectedFreeze);
  });

  it("extends the end of the video for an overlong last clip", () => {
    const t = buildTimeline([{ id: "a", start: 8, audioDuration: 5 }], 10, opts);
    expect(t.freezes[0].at).toBe(10);
    expect(t.outputDuration).toBeCloseTo(8 + 5 / 1.15 + 0.2);
  });

  it("sorts unordered segments and clamps starts into the video", () => {
    const t = buildTimeline(
      [
        { id: "late", start: 12, audioDuration: 1 },
        { id: "early", start: 1, audioDuration: 1 }
      ],
      10,
      opts
    );
    expect(t.placements.map((p) => p.id)).toEqual(["early", "late"]);
    expect(t.placements[1].outputStart).toBe(10);
  });
});

describe("mapSourceTime", () => {
  it("shifts times at or after a freeze", () => {
    const t = buildTimeline(
      [
        { id: "a", start: 0, audioDuration: 8 },
        { id: "b", start: 5, audioDuration: 2 }
      ],
      10,
      opts
    );
    const freeze = t.freezes[0].duration;
    expect(mapSourceTime(t, 2)).toBe(2);
    expect(mapSourceTime(t, 5)).toBeCloseTo(5 + freeze);
    expect(mapSourceTime(t, 7)).toBeCloseTo(7 + freeze);
  });
});
