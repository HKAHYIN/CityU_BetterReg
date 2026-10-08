export type DayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type BlockSource = "detail-schedule" | "manual" | "ge";

export type MeetingBlock = {
  id: string;
  source: BlockSource;
  courseCode: string;
  title?: string;
  section: string;
  day: DayNumber;
  start: number;
  end: number;
  room?: string;
  dateRange?: string;
};

export type ParseWarning = {
  severity: "warning" | "error";
  message: string;
  source?: string;
};

export type ParseResult<T> = {
  value: T;
  warnings: ParseWarning[];
};

export type GESlot = {
  day: DayNumber;
  start: number;
  end: number;
  bldg?: string;
  room?: string;
  dates?: string;
};

export type GESection = {
  crn: string;
  section: string;
  credit?: number;
  web?: string;
  avail?: number | null;
  cap?: number;
  waitlist?: string;
  instructor?: string;
  lang?: string;
  slots: GESlot[];
};

export type GECourse = {
  area?: string;
  unit?: string;
  code: string;
  title: string;
  credit?: number;
  web?: string;
  avail?: number | null;
  cap?: number;
  waitlist?: string;
  lang?: string;
  url?: string;
  sections: GESection[];
};

export type GECatalog = {
  scrapedAt: string;
  term: string;
  courses: GECourse[];
};

export type SearchRange = {
  day: DayNumber;
  start: number;
  end: number;
};

export type ComponentFocus = {
  courseCode: string;
  component: "lecture" | "tutorial";
};
