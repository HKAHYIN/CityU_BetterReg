import type {
  DayNumber,
  GECatalog,
  GESection,
  MeetingBlock,
  ParseResult,
  ParseWarning,
} from "./types";

const DAY_MAP: Record<string, DayNumber> = { M: 1, T: 2, W: 3, R: 4, F: 5, S: 6, U: 7 };

function clean(value: unknown): string {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseClock(hourText: string, minuteText: string, meridiem?: string): number | undefined {
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (minute > 59 || (meridiem && (hour < 1 || hour > 12)) || (!meridiem && hour > 23)) return;
  const normalizedHour = meridiem ? hour % 12 + (meridiem.toLowerCase() === "pm" ? 12 : 0) : hour;
  return normalizedHour * 60 + minute;
}

function parseTimeRange(value: string): { start: number; end: number } | undefined {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})\s*(am|pm)?\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) return;
  const start = parseClock(match[1], match[2], match[3]);
  const end = parseClock(match[4], match[5], match[6] ?? match[3]);
  return start !== undefined && end !== undefined && end > start ? { start, end } : undefined;
}

export function parseDetailScheduleHtml(html: string): ParseResult<MeetingBlock[]> {
  const document = new DOMParser().parseFromString(html, "text/html");
  const blocks: MeetingBlock[] = [];
  const warnings: ParseWarning[] = [];
  const tables = [...document.querySelectorAll("table")].filter((table) =>
    (table.getAttribute("summary") ?? "").toLowerCase().includes("schedule course detail"),
  );

  for (const courseTable of tables) {
    const caption = clean(courseTable.querySelector("caption")?.textContent);
    const match = caption.match(/^(.*?)\s*-\s*([A-Z]{2,8})\s*(\d{3,5}[A-Z]?)\s*-\s*([A-Z0-9]{2,8})$/i);
    if (!match) continue;
    const courseCode = `${match[2].toUpperCase()}${match[3].toUpperCase()}`;
    const section = match[4].toUpperCase();
    let node = courseTable.nextElementSibling;
    let meetingTable: HTMLTableElement | undefined;
    while (node) {
      if (node.tagName === "TABLE" && clean(node.querySelector("caption")?.textContent) === "Scheduled Meeting Times") {
        meetingTable = node as HTMLTableElement;
        break;
      }
      if (node.tagName === "TABLE" && node !== courseTable && node.getAttribute("summary")?.toLowerCase().includes("schedule course detail")) break;
      node = node.nextElementSibling;
    }
    if (!meetingTable) {
      warnings.push({ severity: "warning", message: `${courseCode} ${section} has no meeting table.`, source: caption });
      continue;
    }
    const rows = [...meetingTable.querySelectorAll("tr")];
    const header = rows.find((row) => row.querySelectorAll(":scope > th").length > 0);
    const headers = header ? [...header.querySelectorAll(":scope > th")].map((cell) => clean(cell.textContent).toLowerCase()) : [];
    const timeIndex = headers.indexOf("time");
    const daysIndex = headers.indexOf("days");
    const whereIndex = headers.indexOf("where");
    const dateIndex = headers.findIndex((item) => item.includes("date range"));
    if (timeIndex < 0 || daysIndex < 0) continue;
    for (const row of rows) {
      const values = [...row.querySelectorAll(":scope > td")].map((cell) => clean(cell.textContent));
      if (!values.length) continue;
      const timeText = values[timeIndex] ?? "";
      const daysText = values[daysIndex] ?? "";
      if (!timeText || !daysText || /^TBA$/i.test(timeText) || /^TBA$/i.test(daysText)) {
        warnings.push({ severity: "warning", message: `${courseCode} ${section} has TBA or missing time.`, source: caption });
        continue;
      }
      const range = parseTimeRange(timeText);
      const days = [...daysText.toUpperCase()].map((day) => DAY_MAP[day]).filter((day): day is DayNumber => day !== undefined);
      if (!range || !days.length) {
        warnings.push({ severity: "warning", message: `${courseCode} ${section} has an invalid meeting time.`, source: timeText });
        continue;
      }
      for (const day of days) {
        blocks.push({
          id: `${courseCode}-${section}-${day}-${range.start}-${range.end}`,
          source: "detail-schedule",
          courseCode,
          title: clean(match[1]),
          section,
          day,
          start: range.start,
          end: range.end,
          room: whereIndex >= 0 ? values[whereIndex] : undefined,
          dateRange: dateIndex >= 0 ? values[dateIndex] : undefined,
        });
      }
    }
  }
  return { value: blocks, warnings };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSlot(value: unknown): GESection["slots"][number] | undefined {
  if (!isObject(value) || typeof value.day !== "number" || typeof value.start !== "number" || typeof value.end !== "number") return;
  if (![1, 2, 3, 4, 5, 6, 7].includes(value.day) || value.end <= value.start) return;
  return { day: value.day as DayNumber, start: value.start, end: value.end, bldg: typeof value.bldg === "string" ? value.bldg : undefined, room: typeof value.room === "string" ? value.room : undefined, dates: typeof value.dates === "string" ? value.dates : undefined };
}

export function parseGEJson(text: string): ParseResult<GECatalog> {
  const parsed: unknown = JSON.parse(text);
  if (!isObject(parsed) || typeof parsed.scrapedAt !== "string" || typeof parsed.term !== "string" || !Array.isArray(parsed.courses)) {
    throw new Error("The file must contain scrapedAt, term, and a courses array.");
  }
  const courses = parsed.courses.map((course, index) => {
    if (!isObject(course) || typeof course.code !== "string" || typeof course.title !== "string" || !Array.isArray(course.sections)) {
      throw new Error(`Course ${index + 1} is missing code, title, or sections.`);
    }
    const sections = course.sections.map((section, sectionIndex): GESection => {
      if (!isObject(section) || typeof section.crn !== "string" || typeof section.section !== "string" || !Array.isArray(section.slots)) {
        throw new Error(`${course.code} section ${sectionIndex + 1} is malformed.`);
      }
      const slots = section.slots.map(parseSlot).filter((slot): slot is GESection["slots"][number] => Boolean(slot));
      return { crn: section.crn, section: section.section, slots, credit: typeof section.credit === "number" ? section.credit : undefined, web: typeof section.web === "string" ? section.web : undefined, avail: typeof section.avail === "number" ? section.avail : null, cap: typeof section.cap === "number" ? section.cap : undefined, waitlist: typeof section.waitlist === "string" ? section.waitlist : undefined, instructor: typeof section.instructor === "string" ? section.instructor : undefined, lang: typeof section.lang === "string" ? section.lang : undefined };
    });
    return { code: course.code, title: course.title, sections, area: typeof course.area === "string" ? course.area : undefined, unit: typeof course.unit === "string" ? course.unit : undefined, credit: typeof course.credit === "number" ? course.credit : undefined, web: typeof course.web === "string" ? course.web : undefined, avail: typeof course.avail === "number" ? course.avail : null, cap: typeof course.cap === "number" ? course.cap : undefined, waitlist: typeof course.waitlist === "string" ? course.waitlist : undefined, lang: typeof course.lang === "string" ? course.lang : undefined, url: typeof course.url === "string" ? course.url : undefined };
  });
  return { value: { scrapedAt: parsed.scrapedAt, term: parsed.term, courses }, warnings: [] };
}
