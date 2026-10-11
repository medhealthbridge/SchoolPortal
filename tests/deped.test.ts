import { describe, expect, it } from "vitest";
import { computeLine, descriptor, GROUPS, guessGroup, transmute } from "@/modules/grades/deped";

describe("the DepEd transmutation table", () => {
  it.each([
    [100, 100],
    [99.99, 99],
    [98.4, 99],
    [98.39, 98],
    [61.6, 76],
    [61.59, 75],
    [60, 75],
    [59.99, 74],
    [56, 74],
    [4, 61],
    [3.99, 60],
    [0, 60],
    [80, 87],
  ])("%s becomes %s", (initial, quarterly) => {
    expect(transmute(initial)).toBe(quarterly);
  });

  it("names the SF9 descriptors", () => {
    expect(descriptor(90)).toBe("Outstanding");
    expect(descriptor(85)).toBe("Very Satisfactory");
    expect(descriptor(80)).toBe("Satisfactory");
    expect(descriptor(75)).toBe("Fairly Satisfactory");
    expect(descriptor(74)).toBe("Did Not Meet Expectations");
  });
});

describe("a learner's quarter", () => {
  const items = [
    { id: "q1", component: "ww" as const, highestScore: 20 },
    { id: "q2", component: "ww" as const, highestScore: 30 },
    { id: "pt1", component: "pt" as const, highestScore: 50 },
    { id: "qa", component: "qa" as const, highestScore: 40 },
  ];

  it("weights, sums and transmutes like the class record", () => {
    // WW 40/50 = 80% ×30 = 24; PT 45/50 = 90% ×50 = 45; QA 30/40 = 75% ×20 = 15 → 84 → 90
    const line = computeLine(
      GROUPS.languages.weights,
      items,
      new Map([
        ["q1", 18],
        ["q2", 22],
        ["pt1", 45],
        ["qa", 30],
      ]),
    );
    expect(line.components.ww.ps).toBe(80);
    expect(line.components.pt.ws).toBe(45);
    expect(line.initial).toBe(84);
    expect(line.quarterly).toBe(transmute(84));
    expect(line.quarterly).toBe(90);
  });

  it("counts a missing score as zero", () => {
    const line = computeLine(GROUPS.languages.weights, items, new Map([["pt1", 50], ["qa", 40]]));
    expect(line.components.ww.ps).toBe(0);
    expect(line.initial).toBe(70);
  });

  it("gives no quarterly grade while a component has nothing in it", () => {
    const line = computeLine(GROUPS.math_science.weights, items.slice(0, 2), new Map([["q1", 20]]));
    expect(line.initial).not.toBeNull();
    expect(line.quarterly).toBeNull();
  });

  it("guesses a subject's group from its name", () => {
    expect(guessGroup("Mathematics 7")).toBe("math_science");
    expect(guessGroup("MAPEH 8")).toBe("mapeh_tle");
    expect(guessGroup("Filipino")).toBe("languages");
  });
});
