import type { DayNumber, GESection, MeetingBlock } from "./types";
import type { GECourse } from "./types";

export type GEComponentType =
  | "lecture"
  | "tutorial"
  | "laboratory"
  | "seminar"
  | "fieldwork"
  | "dissertation"
  | "online"
  | "other";

export function getComponentType(sectionCode: string): GEComponentType {
  const prefix = sectionCode.trim().charAt(0).toUpperCase();
  if (prefix === "C") return "lecture";
  if (prefix === "T") return "tutorial";
  if (prefix === "L") return "laboratory";
  if (prefix === "S") return "seminar";
  if (prefix === "F") return "fieldwork";
  if (prefix === "D") return "dissertation";
  if (prefix === "W") return "online";
  return "other";
}

export function getSectionGroup(sectionCode: string): string {
  return sectionCode.trim().toUpperCase().charAt(1) || "—";
}

export function sectionGroupMatches(sectionCode: string, group: string): boolean {
  return group === "all" || getSectionGroup(sectionCode) === group.toUpperCase();
}

export function relatedSections(course: GECourse, section: GESection): GESection[] {
  const type = getComponentType(section.section);
  const relatedType = type === "lecture" ? "tutorial" : type === "tutorial" ? "lecture" : undefined;
  if (!relatedType) return [];
  return course.sections.filter(
    (candidate) => getComponentType(candidate.section) === relatedType
      && getSectionGroup(candidate.section) === getSectionGroup(section.section),
  );
}

export function componentLabel(type: GEComponentType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function componentSummary(course: GECourse): {
  lectures: GESection[];
  tutorials: GESection[];
  missing: "lecture" | "tutorial" | undefined;
} {
  const lectures = course.sections.filter((section) => getComponentType(section.section) === "lecture");
  const tutorials = course.sections.filter((section) => getComponentType(section.section) === "tutorial");
  return {
    lectures,
    tutorials,
    missing: lectures.length > 0 && tutorials.length === 0
      ? "tutorial"
      : tutorials.length > 0 && lectures.length === 0
        ? "lecture"
        : undefined,
  };
}

export function overlaps(
  first: Pick<MeetingBlock, "day" | "start" | "end">,
  second: Pick<MeetingBlock, "day" | "start" | "end">,
): boolean {
  return first.day === second.day && first.start < second.end && second.start < first.end;
}

export function sectionMatchesRange(
  section: GESection,
  range: { day: DayNumber; start: number; end: number },
): boolean {
  return section.slots.some(
    (slot) => slot.day === range.day && slot.start < range.end && range.start < slot.end,
  );
}

export function sectionWithinRange(
  section: GESection,
  range: { day: DayNumber; start: number; end: number },
): boolean {
  return section.slots.some(
    (slot) => slot.day === range.day && slot.start >= range.start && slot.end <= range.end,
  );
}

export function sectionBlocks(
  courseCode: string,
  title: string,
  section: GESection,
): MeetingBlock[] {
  return section.slots.map((slot, index) => ({
    id: `ge-${section.crn}-${index}`,
    source: "ge",
    courseCode,
    title,
    section: section.section,
    day: slot.day,
    start: slot.start,
    end: slot.end,
    room: [slot.bldg, slot.room].filter(Boolean).join(" ") || undefined,
    dateRange: slot.dates,
  }));
}

export function formatTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
