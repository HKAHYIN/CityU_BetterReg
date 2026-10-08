import { describe, expect, it } from "vitest";
import { componentSummary, getComponentType, getSectionGroup, overlaps, relatedSections, sectionMatchesRange, sectionWithinRange } from "./logic";

describe("GE section helpers", () => {
  it("classifies section prefixes", () => {
    expect(getComponentType("C01")).toBe("lecture");
    expect(getComponentType("TA1")).toBe("tutorial");
    expect(getComponentType("L01")).toBe("laboratory");
  });

  it("detects exact-minute overlaps", () => {
    expect(overlaps({ day: 1, start: 600, end: 660 }, { day: 1, start: 660, end: 720 })).toBe(false);
    expect(overlaps({ day: 1, start: 600, end: 660 }, { day: 1, start: 650, end: 720 })).toBe(true);
  });

  it("matches a section against a selected range", () => {
    expect(sectionMatchesRange({ crn: "1", section: "C01", slots: [{ day: 2, start: 600, end: 660 }] }, { day: 2, start: 630, end: 690 })).toBe(true);
  });

  it("reports a missing related component", () => {
    expect(componentSummary({ code: "GE1001", title: "Example", sections: [{ crn: "1", section: "C01", slots: [] }] }).missing).toBe("tutorial");
    expect(componentSummary({ code: "GE1001", title: "Example", sections: [{ crn: "1", section: "T01", slots: [] }] }).missing).toBe("lecture");
    expect(componentSummary({ code: "GE1001", title: "Example", sections: [{ crn: "1", section: "C01", slots: [] }, { crn: "2", section: "T01", slots: [] }] }).missing).toBeUndefined();
  });

  it("reads the section group from the second character", () => {
    expect(getSectionGroup("CA1")).toBe("A");
    expect(getSectionGroup("TB1")).toBe("B");
  });

  it("only relates lecture and tutorial sections in the same group", () => {
    const course = {
      code: "GE1001",
      title: "Example",
      sections: [
        { crn: "1", section: "CA1", slots: [] },
        { crn: "2", section: "TA1", slots: [] },
        { crn: "3", section: "TB1", slots: [] },
      ],
    };
    expect(relatedSections(course, course.sections[0]).map((section) => section.section)).toEqual(["TA1"]);
  });

  it("distinguishes sections fully inside a range from sections that only overlap", () => {
    const section = { crn: "1", section: "C01", slots: [{ day: 1 as const, start: 600, end: 660 }] };
    expect(sectionWithinRange(section, { day: 1, start: 570, end: 690 })).toBe(true);
    expect(sectionWithinRange(section, { day: 1, start: 630, end: 690 })).toBe(false);
    expect(sectionMatchesRange(section, { day: 1, start: 630, end: 690 })).toBe(true);
  });
});
