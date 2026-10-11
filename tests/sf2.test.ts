import { describe, expect, it } from "vitest";
import { dayMark, schoolDays } from "@/modules/attendance/sf2";

describe("SF2", () => {
  it("lists Monday to Friday of the month", () => {
    const d = schoolDays("2026-10");
    expect(d[0]).toBe("2026-10-01"); // a Thursday
    expect(d).not.toContain("2026-10-03"); // Saturday
    expect(d).toHaveLength(22);
  });

  it("reads a day from that day's class marks", () => {
    expect(dayMark([])).toBe("");
    expect(dayMark(["absent", "absent"])).toBe("A");
    expect(dayMark(["present", "absent"])).toBe("P");
    expect(dayMark(["late", "present"])).toBe("L");
    expect(dayMark(["excused", "excused"])).toBe("E");
    expect(dayMark(["excused", "absent"])).toBe("E");
  });
});
