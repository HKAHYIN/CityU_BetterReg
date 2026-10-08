<script setup lang="ts">
import { computed, ref } from "vue";
import { componentLabel, formatTime, getComponentType, getSectionGroup, overlaps, sectionBlocks, sectionGroupMatches, sectionMatchesRange, sectionWithinRange } from "./logic";
import { parseDetailScheduleHtml, parseGEJson } from "./parsers";
import type { ComponentFocus, GECatalog, GESection, MeetingBlock, ParseWarning, SearchRange } from "./types";

const scheduleText = ref("");
const scheduleBlocks = ref<MeetingBlock[]>([]);
const busyBlocks = ref<MeetingBlock[]>(JSON.parse(localStorage.getItem("betterreg.busy") ?? "[]") as MeetingBlock[]);
const catalog = ref<GECatalog>();
const warnings = ref<ParseWarning[]>([]);
const error = ref("");
const mode = ref<"search" | "busy">("search");
const searchRange = ref<SearchRange>();
const hoveredKey = ref("");
const selectedKeys = ref<string[]>([]);
const fileInput = ref<HTMLInputElement>();
const scheduleImportOpen = ref(false);
const geImportOpen = ref(false);
const scraperCopied = ref(false);
const scraperSleepMs = ref(100);
const selectedFileName = ref("");
const componentFocus = ref<ComponentFocus>();
const relatedSectionKey = ref("");
const courseFilter = ref("");
const groupFilter = ref("all");
const rangeMode = ref<"within" | "overlap" | "all">("within");
const selectedTypes = ref(["lecture", "tutorial", "laboratory", "seminar", "fieldwork", "dissertation", "online", "other"]);
const componentTypes = ["lecture", "tutorial", "laboratory", "seminar", "fieldwork", "dissertation", "online", "other"] as const;
const hiddenCourseCodes = ref<string[]>([]);
const dragStart = ref<{ day: SearchRange["day"]; start: number }>();
const dragCurrent = ref<{ day: SearchRange["day"]; start: number }>();
const isDragging = ref(false);
const ignoreNextClick = ref(false);

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const timeStart = 8 * 60;
const timeEnd = 22 * 60;
const cellHeight = 48;

const allFixedBlocks = computed(() => [...scheduleBlocks.value, ...busyBlocks.value]);
const results = computed(() => {
  if (!catalog.value || (!searchRange.value && (!courseFilter.value.trim() || rangeMode.value !== "all"))) return [];
  const query = courseFilter.value.trim().toLowerCase().replace(/\s+/g, "");
  return catalog.value.courses.flatMap((course) => course.sections
    .filter(() => !hiddenCourseCodes.value.includes(course.code))
    .filter((section) => rangeMode.value === "all" && Boolean(query)
      || (searchRange.value && (rangeMode.value === "within"
        ? sectionWithinRange(section, searchRange.value)
        : sectionMatchesRange(section, searchRange.value))))
    .filter((section) => selectedTypes.value.includes(getComponentType(section.section)))
    .filter((section) => sectionGroupMatches(section.section, groupFilter.value))
    .filter((section) => !query || `${course.code}${course.title}${section.section}${section.crn}`.toLowerCase().replace(/\s+/g, "").includes(query))
    .map((section) => ({ course, section })));
});
const hasTextFilter = computed(() => courseFilter.value.trim().length > 0);
const allTypesSelected = computed(() => selectedTypes.value.length === componentTypes.length);
const unfilteredResultsCount = computed(() => {
  if (!catalog.value || (!searchRange.value && (!hasTextFilter.value || rangeMode.value !== "all"))) return 0;
  return catalog.value.courses.reduce((count, course) => count + course.sections.filter((section) => rangeMode.value === "all" && hasTextFilter.value || (searchRange.value ? sectionMatchesRange(section, searchRange.value) : false)).length, 0);
});
const selectedBlocks = computed(() => selectedKeys.value.flatMap((key) => {
  const result = catalog.value?.courses.flatMap((course) => course.sections.map((section) => ({ course, section }))).find(({ course, section }) => `${course.code}-${section.crn}` === key);
  return result ? sectionBlocks(result.course.code, result.course.title, result.section) : [];
}));
const selectedCourses = computed(() => selectedKeys.value.flatMap((key) => {
  const result = catalog.value?.courses.flatMap((course) => course.sections.map((section) => ({ course, section }))).find(({ course, section }) => `${course.code}-${section.crn}` === key);
  return result ? [result] : [];
}));
const previewBlocks = computed(() => {
  const key = hoveredKey.value;
  const result = catalog.value?.courses.flatMap((course) => course.sections.map((section) => ({ course, section }))).find(({ course, section }) => `${course.code}-${section.crn}` === key);
  return result ? sectionBlocks(result.course.code, result.course.title, result.section) : [];
});
const relatedReference = computed(() => {
  const key = relatedSectionKey.value;
  if (!key || !catalog.value) return undefined;
  return catalog.value.courses
    .flatMap((course) => course.sections.map((section) => ({ course, section })))
    .find(({ course, section }) => `${course.code}-${section.crn}` === key);
});
const relatedReferenceSections = computed(() => {
  if (!relatedReference.value) return [];
  return relatedReference.value.course.sections.filter(
    (section) => section.crn !== relatedReference.value?.section.crn,
  );
});
const dragRange = computed(() => {
  if (!isDragging.value || !dragStart.value || !dragCurrent.value) return undefined;
  return {
    day: dragStart.value.day,
    start: Math.min(dragStart.value.start, dragCurrent.value.start),
    end: Math.max(dragStart.value.start, dragCurrent.value.start) + 30,
  };
});
const conflicts = computed(() => selectedBlocks.value.filter((block) => allFixedBlocks.value.some((existing) => overlaps(block, existing) || selectedBlocks.value.some((other) => other.id !== block.id && overlaps(block, other)))));

function importSchedule() {
  scheduleImportOpen.value = true;
}

function parseSchedule() {
  error.value = "";
  const parsed = parseDetailScheduleHtml(scheduleText.value);
  scheduleBlocks.value = parsed.value;
  warnings.value = parsed.warnings;
  if (!parsed.value.length && !parsed.warnings.length) error.value = "No schedule tables were found. Paste the copied Student Detail Schedule HTML, including its table markup.";
  if (parsed.value.length || parsed.warnings.length) scheduleImportOpen.value = false;
}

function selectFile() {
  geImportOpen.value = true;
}

function chooseGEFile() {
  fileInput.value?.click();
}

async function importGE(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  selectedFileName.value = file.name;
  try {
    catalog.value = parseGEJson(await file.text()).value;
    error.value = "";
    searchRange.value = undefined;
    selectedKeys.value = [];
    geImportOpen.value = false;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Unable to read this GE JSON file.";
  } finally {
    input.value = "";
  }
}

async function copyScraper() {
  try {
    if (!Number.isInteger(scraperSleepMs.value) || scraperSleepMs.value < 0 || scraperSleepMs.value > 60000) {
      throw new Error("Sleep delay must be a whole number from 0 to 60000 milliseconds.");
    }
    const response = await fetch("/gescraper.txt");
    if (!response.ok) throw new Error("The scraper file could not be loaded.");
    const source = await response.text();
    const customized = source.replace(
      /const SLEEP_MS = \d+;/,
      `const SLEEP_MS = ${scraperSleepMs.value};`,
    );
    await navigator.clipboard.writeText(customized);
    scraperCopied.value = true;
    window.setTimeout(() => { scraperCopied.value = false; }, 1800);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Clipboard access was denied.";
  }
}

function toggleBusy(block: SearchRange) {
  const id = `busy-${block.day}-${block.start}-${block.end}`;
  if (busyBlocks.value.some((item) => item.id === id)) return;
  busyBlocks.value.push({ ...block, id, source: "manual", courseCode: "Busy", section: "Busy" });
  localStorage.setItem("betterreg.busy", JSON.stringify(busyBlocks.value));
}

function chooseRange(day: number, start: number, end: number) {
  const range = { day: day as SearchRange["day"], start, end };
  if (mode.value === "busy") toggleBusy(range);
  else searchRange.value = range;
}

function isCellOccupied(day: number, start: number): boolean {
  return allFixedBlocks.value.some((block) => block.day === day && block.start < start + 30 && start < block.end);
}

function beginDrag(day: number, start: number) {
  if (isCellOccupied(day, start)) return;
  dragStart.value = { day: day as SearchRange["day"], start };
  dragCurrent.value = dragStart.value;
  isDragging.value = true;
}

function updateDrag(day: number, start: number) {
  if (!isDragging.value || !dragStart.value || day !== dragStart.value.day || isCellOccupied(day, start)) return;
  dragCurrent.value = { day: day as SearchRange["day"], start };
}

function finishDrag() {
  if (!isDragging.value || !dragStart.value || !dragCurrent.value) return;
  const start = Math.min(dragStart.value.start, dragCurrent.value.start);
  const end = Math.max(dragStart.value.start, dragCurrent.value.start) + 30;
  chooseRange(dragStart.value.day, start, end);
  ignoreNextClick.value = start !== end - 30;
  isDragging.value = false;
  dragStart.value = undefined;
  dragCurrent.value = undefined;
}

function selectCell(day: number, start: number) {
  if (ignoreNextClick.value) {
    ignoreNextClick.value = false;
    return;
  }
  chooseRange(day, start, start + 30);
}

function cancelDrag() {
  if (isDragging.value) {
    isDragging.value = false;
    dragStart.value = undefined;
    dragCurrent.value = undefined;
  }
}

function removeBlock(id: string) {
  busyBlocks.value = busyBlocks.value.filter((block) => block.id !== id);
  scheduleBlocks.value = scheduleBlocks.value.filter((block) => block.id !== id);
  localStorage.setItem("betterreg.busy", JSON.stringify(busyBlocks.value));
}

function toggleSelection(courseCode: string, section: GESection) {
  const key = `${courseCode}-${section.crn}`;
  selectedKeys.value = selectedKeys.value.includes(key) ? selectedKeys.value.filter((item) => item !== key) : [...selectedKeys.value, key];
}

function removeGESelection(key: string) {
  selectedKeys.value = selectedKeys.value.filter((item) => item !== key);
}

function removeSelectedBlock(block: MeetingBlock) {
  const match = selectedCourses.value.find(({ course, section }) =>
    sectionBlocks(course.code, course.title, section).some((candidate) => candidate.id === block.id),
  );
  if (match) removeGESelection(`${match.course.code}-${match.section.crn}`);
}

function focusComponent(courseCode: string, component: "lecture" | "tutorial") {
  componentFocus.value = { courseCode, component };
}

function focusRelated(courseCode: string, component: "lecture" | "tutorial") {
  focusComponent(courseCode, component);
}

function focusRelatedCourse(courseCode: string, section: GESection) {
  relatedSectionKey.value = `${courseCode}-${section.crn}`;
}

function toggleAllTypes() {
  selectedTypes.value = allTypesSelected.value ? [] : [...componentTypes];
}

function clearCourseFilter() {
  courseFilter.value = "";
}

function hideCourse(courseCode: string) {
  if (!hiddenCourseCodes.value.includes(courseCode)) hiddenCourseCodes.value.push(courseCode);
  selectedKeys.value = selectedKeys.value.filter((key) => !key.startsWith(`${courseCode}-`));
}

function unhideCourse(courseCode: string) {
  hiddenCourseCodes.value = hiddenCourseCodes.value.filter((code) => code !== courseCode);
}

function isFocusedBlock(block: MeetingBlock): boolean {
  if (!componentFocus.value || block.courseCode !== componentFocus.value.courseCode) return false;
  return getComponentType(block.section) === componentFocus.value.component;
}

function styleBlock(block: MeetingBlock) {
  return { top: `${((block.start - timeStart) / 30) * cellHeight}px`, height: `${((block.end - block.start) / 30) * cellHeight}px` };
}
</script>

<template>
  <main class="app-shell">
    <header class="hero">
      <div>
        <p class="eyebrow">CITYU / GATEWAY EDUCATION</p>
        <h1>BetterReg</h1>
        <p class="subtitle">Find GE sections that fit around your existing timetable.</p>
      </div>
      <div class="privacy-note">Local-only planning<br /><span>Your data stays in this browser.</span></div>
    </header>

    <section class="toolbar panel">
      <div class="toolbar-step"><strong>01</strong><div><b>Schedule</b><small>Paste your AIMS detail schedule</small></div></div>
      <button class="button secondary" @click="importSchedule">Import schedule</button>
      <div class="toolbar-step"><strong>02</strong><div><b>GE data</b><small>Upload ge_courses.json</small></div></div>
      <button class="button secondary" @click="selectFile">Upload GE JSON</button>
      <span v-if="catalog" class="status-pill">{{ catalog.courses.length }} courses · {{ catalog.term }}</span>
    </section>

    <section v-if="error" class="alert error">{{ error }}</section>
    <section v-if="warnings.length" class="alert warning">
      <b>Schedule notes</b>
      <ul><li v-for="warning in warnings" :key="warning.message">{{ warning.message }}</li></ul>
      <p>Clash results use known meeting times only. Confirm your final schedule before registering.</p>
    </section>

    <div class="workspace">
      <section class="timetable-panel panel">
        <div class="section-heading">
          <div><p class="eyebrow">WEEKLY VIEW</p><h2>Drag an empty period to search</h2></div>
          <div class="mode-toggle"><button :class="{ active: mode === 'search' }" @click="mode = 'search'">Find GE</button><button :class="{ active: mode === 'busy' }" @click="mode = 'busy'">Mark busy</button></div>
        </div>
        <p class="hint">{{ mode === "busy" ? "Drag across a clear period to add a fixed busy block." : "Drag across an empty period to find compatible GE sections." }}</p>
        <div class="timetable" @pointerup="finishDrag" @pointerleave="cancelDrag">
          <div class="time-axis"><span v-for="time in [8,10,12,14,16,18,20,22]" :key="time" :style="{ top: `${((time * 60 - timeStart) / 30) * cellHeight}px` }">{{ String(time).padStart(2, "0") }}:00</span></div>
          <div v-for="(day, index) in days" :key="day" class="day-column">
            <div class="day-label">{{ day }}</div>
            <div class="grid-column">
              <i v-for="half in 28" :key="half" class="grid-cell" :class="{ occupied: isCellOccupied(index + 1, timeStart + (half - 1) * 30) }" @pointerdown.prevent="beginDrag(index + 1, timeStart + (half - 1) * 30)" @pointerenter="updateDrag(index + 1, timeStart + (half - 1) * 30)" @click.stop="selectCell(index + 1, timeStart + (half - 1) * 30)"></i>
              <div v-if="dragRange?.day === index + 1" class="drag-range" :style="styleBlock({ ...dragRange, id: 'drag', source: 'manual', courseCode: '', section: '' })"><span>{{ formatTime(dragRange.start) }}–{{ formatTime(dragRange.end) }}</span></div>
              <div v-for="block in allFixedBlocks.filter((item) => item.day === index + 1)" :key="block.id" class="schedule-block fixed" :class="[block.source, { 'component-focus': isFocusedBlock(block) }]" :style="styleBlock(block)" @click.stop>
                <b>{{ block.courseCode }}</b><span>{{ block.section }} · {{ formatTime(block.start) }}–{{ formatTime(block.end) }}</span><button aria-label="Remove block" @click.stop="removeBlock(block.id)">×</button>
              </div>
              <div v-for="block in selectedBlocks.filter((item) => item.day === index + 1)" :key="`selected-${block.id}`" class="schedule-block preview selected-preview" :class="[getComponentType(block.section), { 'component-focus': isFocusedBlock(block) }]" :style="styleBlock(block)"><b>{{ block.courseCode }}</b><span>{{ block.section }}</span><button :aria-label="`Remove selected ${block.courseCode} ${block.section}`" @click.stop="removeSelectedBlock(block)">×</button></div>
              <div v-for="block in previewBlocks.filter((item) => item.day === index + 1)" :key="`preview-${block.id}`" class="schedule-block preview" :class="getComponentType(block.section)" :style="styleBlock(block)"><b>{{ block.courseCode }}</b><span>{{ block.section }}</span></div>
            </div>
          </div>
        </div>
      </section>

      <aside class="results-panel panel">
        <div class="section-heading"><div><p class="eyebrow">MATCHING SECTIONS</p><h2>{{ searchRange || hasTextFilter ? `${results.length} results` : "Choose a period" }}</h2></div></div>
        <div class="filters">
          <div class="text-filter-row">
            <input v-model="courseFilter" class="filter-input" type="search" placeholder="Filter course code or title" />
            <button v-if="hasTextFilter" class="clear-filter" aria-label="Clear course filter" @click="clearCourseFilter">Clear</button>
          </div>
          <select v-model="groupFilter" class="filter-input" aria-label="Filter section group">
            <option value="all">All section groups</option>
            <option v-for="group in ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']" :key="group" :value="group">Group {{ group }}</option>
          </select>
          <select v-model="rangeMode" class="filter-input" aria-label="Filter timetable range">
            <option value="within">Only inside selected range</option>
            <option value="overlap">Include sections overlapping range</option>
            <option value="all">All sections (requires text filter)</option>
          </select>
          <div class="filter-types">
            <label class="all-types"><input type="checkbox" :checked="allTypesSelected" @change="toggleAllTypes" /> All types</label>
            <label v-for="type in componentTypes" :key="type"><input v-model="selectedTypes" type="checkbox" :value="type" /> {{ componentLabel(type) }}</label>
          </div>
        </div>
        <p v-if="hasTextFilter && rangeMode === 'all'" class="filter-mode-note">All-sections name lookup is active.</p>
        <p v-if="!catalog" class="empty-state">Upload your GE JSON export to begin. The app never connects to AIMS.</p>
        <p v-else-if="!searchRange && !hasTextFilter" class="empty-state">Drag across an empty timetable period, or enter a course name/code above.</p>
        <p v-else-if="!results.length && unfilteredResultsCount" class="empty-state">No sections match the current filters. Try clearing the text, choosing another group, or enabling more section types.</p>
        <p v-else-if="!results.length" class="empty-state">No sections overlap the selected range.</p>
        <div v-else class="result-list">
          <article v-for="{ course, section } in results" :key="`${course.code}-${section.crn}`" class="result-card" :class="{ selected: selectedKeys.includes(`${course.code}-${section.crn}`) }" tabindex="0" @mouseenter="hoveredKey = `${course.code}-${section.crn}`; focusRelatedCourse(course.code, section)" @mouseleave="hoveredKey = ''" @focus="hoveredKey = `${course.code}-${section.crn}`; focusRelatedCourse(course.code, section)" @blur="hoveredKey = ''">
            <div class="result-title"><div><b>{{ course.code }}</b><h3>{{ course.title }}</h3></div><div class="result-actions"><span class="type-badge" :class="getComponentType(section.section)">{{ componentLabel(getComponentType(section.section)) }}</span><button class="hide-course" :aria-label="`Hide ${course.code}`" @click.stop="hideCourse(course.code)">Hide this GE</button></div></div>
            <div class="result-meta"><span><b>{{ section.section }}</b> · Group {{ getSectionGroup(section.section) }} · CRN {{ section.crn }}</span><span v-for="slot in section.slots" :key="`${slot.day}-${slot.start}`">{{ days[slot.day - 1] }} {{ formatTime(slot.start) }}–{{ formatTime(slot.end) }} {{ [slot.bldg, slot.room].filter(Boolean).join(" ") }}</span><span v-if="section.instructor">Instructor: {{ section.instructor }}</span><span>WEB {{ section.web ?? "—" }} · Available {{ section.avail ?? "—" }}/{{ section.cap ?? "—" }}</span></div>
            <button class="button full" @click="toggleSelection(course.code, section)">{{ selectedKeys.includes(`${course.code}-${section.crn}`) ? "Remove selection" : "Select section" }}</button>
          </article>
        </div>
        <div v-if="conflicts.length" class="alert conflict"><b>{{ conflicts.length }} conflict{{ conflicts.length === 1 ? "" : "s" }} detected</b><p>Selections remain visible so you can compare alternatives.</p></div>
        <div v-if="hiddenCourseCodes.length" class="hidden-courses">
          <div class="hidden-heading"><b>Hidden GE courses</b><button class="clear-filter" @click="hiddenCourseCodes = []">Unhide all</button></div>
          <button v-for="courseCode in hiddenCourseCodes" :key="courseCode" class="hidden-course" @click="unhideCourse(courseCode)">Show {{ courseCode }}</button>
        </div>
      </aside>
      <aside class="related-sidebar panel">
        <div class="section-heading"><div><p class="eyebrow">RELATED SECTIONS</p><h2>{{ relatedReference ? relatedReference.course.code : "References" }}</h2></div><button v-if="relatedReference" class="remove-button" aria-label="Close related sections" @click="relatedSectionKey = ''; hoveredKey = ''">×</button></div>
        <p v-if="!relatedReference" class="empty-state">Hover or focus a matching section to show every other section from the same course here.</p>
        <template v-else-if="relatedReference">
          <p class="related-subtitle">Other sections for {{ relatedReference.course.code }}. The selected section is {{ relatedReference.section.section }}.</p>
          <p v-if="!relatedReferenceSections.length" class="empty-state">No other sections were found for this course.</p>
          <div v-else class="related-section-list">
            <button v-for="section in relatedReferenceSections" :key="section.crn" class="related-section" @mouseenter="hoveredKey = `${relatedReference.course.code}-${section.crn}`" @mouseleave="hoveredKey = ''" @focus="hoveredKey = `${relatedReference.course.code}-${section.crn}`" @blur="hoveredKey = ''"><b>{{ section.section }}</b><span>Group {{ getSectionGroup(section.section) }} · CRN {{ section.crn }}</span><span v-for="slot in section.slots" :key="`${slot.day}-${slot.start}`">{{ days[slot.day - 1] }} {{ formatTime(slot.start) }}–{{ formatTime(slot.end) }}</span></button>
          </div>
        </template>
      </aside>
    </div>
    <section class="lists-grid">
      <section class="class-list panel"><div class="section-heading"><div><p class="eyebrow">CURRENT SCHEDULE</p><h2>My current classes</h2></div></div><p v-if="!allFixedBlocks.length" class="empty-state">Import your Student Detail Schedule or mark a busy period.</p><article v-for="block in allFixedBlocks" :key="`class-${block.id}`" class="list-card"><div><b>{{ block.courseCode }}</b><h3>{{ block.title || block.section }}</h3><span>{{ block.section }} · {{ days[block.day - 1] }} {{ formatTime(block.start) }}–{{ formatTime(block.end) }}<template v-if="block.room"> · {{ block.room }}</template></span></div><button class="remove-button" :aria-label="`Remove ${block.courseCode} ${block.section}`" @click="removeBlock(block.id)">×</button></article></section>
      <section class="class-list panel"><div class="section-heading"><div><p class="eyebrow">GE PICKS</p><h2>Selected GE sections</h2></div></div><p v-if="!selectedCourses.length" class="empty-state">Select a matching GE section to add it here.</p><article v-for="{ course, section } in selectedCourses" :key="`picked-${course.code}-${section.crn}`" class="list-card"><div><b>{{ course.code }} · {{ section.section }}</b><h3>{{ course.title }}</h3><span>{{ componentLabel(getComponentType(section.section)) }} · CRN {{ section.crn }}</span></div><button class="remove-button" :aria-label="`Remove ${course.code} ${section.section}`" @click="removeGESelection(`${course.code}-${section.crn}`)">×</button></article></section>
    </section>

    <div v-if="scheduleImportOpen" class="modal-backdrop" @click.self="scheduleImportOpen = false"><section class="modal panel"><button class="modal-close" aria-label="Close" @click="scheduleImportOpen = false">×</button><p class="eyebrow">SCHEDULE IMPORT</p><h2>Copy your Student Detail Schedule</h2><ol><li>Open AIMS → Student Detail Schedule.</li><li>Press F12 or choose Inspect.</li><li>In Elements, right-click the <code>&lt;body&gt;</code> element.</li><li>Choose Copy → Copy outerHTML, then paste it below.</li></ol><textarea v-model="scheduleText" class="modal-textarea" placeholder="Paste copied &lt;body&gt; HTML here…"></textarea><div class="modal-actions"><button class="button secondary" @click="scheduleImportOpen = false">Cancel</button><button class="button" @click="parseSchedule">Parse schedule</button></div></section></div>
    <div v-if="geImportOpen" class="modal-backdrop" @click.self="geImportOpen = false"><section class="modal panel"><button class="modal-close" aria-label="Close" @click="geImportOpen = false">×</button><p class="eyebrow">GE DATA IMPORT</p><h2>Prepare your GE course data</h2><ol><li>Open AIMS → Master Class Schedule.</li><li>Choose Lookup and enable <b>Show GE only</b>.</li><li>Press F12 and open the Console tab.</li><li>Choose a delay below, copy the customized scraper code, paste it into the Console, and press Enter.</li><li>Wait for <code>ge_courses.json</code> to download, then upload it here.</li></ol><label class="sleep-control">Delay between AIMS requests (milliseconds)<input v-model.number="scraperSleepMs" type="number" min="0" max="60000" step="100" /></label><p class="sleep-help">Use a larger delay if AIMS responds slowly or rate-limits requests. The copied code uses this value.</p><button class="button secondary copy-button" @click="copyScraper">{{ scraperCopied ? "Copied customized code" : "Copy customized scraper code" }}</button><input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importGE" /><button class="button upload-button" @click="chooseGEFile">Choose ge_courses.json</button><p v-if="selectedFileName" class="file-name">{{ selectedFileName }}</p><p class="privacy-copy">This app only reads the file you select. It does not log in, scrape AIMS, or register courses.</p></section></div>
  </main>
</template>

<style scoped>
.grid-cell {
  touch-action: none;
}

.grid-cell.occupied {
  cursor: not-allowed;
  background: #f8fafb;
}

.drag-range {
  position: absolute;
  left: 1px;
  right: 1px;
  z-index: 3;
  border: 2px solid #e36b39;
  border-radius: 5px;
  background: #e36b3933;
  pointer-events: none;
}

.drag-range span {
  display: block;
  padding: 4px;
  color: #9c4526;
  font-size: 10px;
  font-weight: 800;
}

.tutorial-note {
  margin: 12px 0 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: #fff8e8;
  color: #76551c;
  font-size: 11px;
}

.related-tutorials {
  margin-top: 5px;
  color: #6d7881;
  font-size: 11px;
}

.instructions {
  display: grid;
  grid-template-columns: 1.1fr 1fr auto;
  gap: 28px;
  margin-top: 18px;
  padding: 22px 24px;
}

.instructions h2 {
  margin: 0 0 8px;
  font-size: 18px;
}

.instructions p {
  margin: 0;
  color: #6d7b84;
  font-size: 13px;
}

.instructions ol {
  margin: 0;
  padding-left: 20px;
  color: #596c78;
  font-size: 12px;
}

.instructions li + li {
  margin-top: 5px;
}

.instructions code {
  padding: 2px 4px;
  border-radius: 4px;
  background: #edf2f4;
  font-size: 11px;
}

.privacy-copy {
  align-self: end;
  max-width: 220px;
}

.lists-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin-top: 18px;
}

.class-list {
  padding: 22px 24px;
}

.list-card {
  position: relative;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 38px 12px 0;
  border-top: 1px solid #edf0f2;
  color: #74828b;
  font-size: 11px;
}

.list-card b {
  color: #193d5b;
  font-size: 13px;
}

.list-card h3 {
  margin: 3px 0;
  color: #334b5a;
  font-size: 12px;
}

.remove-button,.modal-close {
  border: 0;
  background: transparent;
  color: #a94c42;
  cursor: pointer;
  font-size: 21px;
  line-height: 1;
}

.remove-button {
  position: absolute;
  top: 12px;
  right: 0;
}

.component-warning {
  cursor: pointer;
  color: #b03f35;
  font-weight: 800;
}

.component-focus {
  outline: 3px solid #e85b4b;
  outline-offset: 2px;
  z-index: 5;
}

.filters {
  display: grid;
  gap: 8px;
  margin: 16px 0;
  padding: 12px;
  border: 1px solid #e3e9ec;
  border-radius: 10px;
  background: #f8fafb;
}

.filter-input {
  width: 100%;
  min-height: 34px;
  border: 1px solid #d7e0e5;
  border-radius: 6px;
  padding: 7px 9px;
  background: white;
  color: #314955;
  font: inherit;
  font-size: 12px;
}

.text-filter-row {
  display: flex;
  gap: 6px;
}

.text-filter-row .filter-input {
  flex: 1;
}

.clear-filter {
  border: 1px solid #d7e0e5;
  border-radius: 6px;
  padding: 0 10px;
  background: white;
  color: #61737d;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}

.filter-mode-note {
  margin: -6px 0 12px;
  color: #496c7a;
  font-size: 11px;
}

.filter-types {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 9px;
}

.filter-types .all-types {
  color: #234d4b;
  font-weight: 800;
}

.filter-types label {
  color: #647680;
  font-size: 10px;
}

.related-sidebar {
  min-width: 0;
  padding: 22px;
}

.related-panel {
  margin-top: 16px;
  padding: 13px;
  border: 1px solid #efb4aa;
  border-radius: 10px;
  background: #fff8f6;
}

.related-panel-heading {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.related-panel-heading h3 {
  margin: 0;
  color: #7e3029;
  font-size: 13px;
}

.related-sidebar > .section-heading h2 {
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.related-subtitle {
  margin: 14px 0;
  color: #7e3029;
  font-size: 12px;
}

.related-section-list {
  display: grid;
  gap: 6px;
}

.related-section {
  display: grid;
  width: 100%;
  gap: 2px;
  border: 1px solid #f0d1cb;
  border-radius: 6px;
  padding: 8px;
  background: white;
  color: #65757e;
  cursor: pointer;
  text-align: left;
  font-size: 10px;
}

.related-section:hover {
  border-color: #d9685a;
  box-shadow: 0 3px 10px #b84b3a1c;
}

.related-section b {
  color: #8f352d;
  font-size: 12px;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #17212bcc;
}

.modal {
  position: relative;
  width: min(620px, 100%);
  padding: 28px;
}

.modal h2 {
  margin: 0 0 14px;
  font-size: 24px;
}

.modal ol {
  margin: 0 0 18px;
  padding-left: 22px;
  color: #5b6d78;
  font-size: 13px;
}

.modal li + li {
  margin-top: 7px;
}

.modal code {
  padding: 2px 4px;
  border-radius: 4px;
  background: #edf2f4;
}

.modal-close {
  position: absolute;
  top: 18px;
  right: 20px;
}

.modal-textarea {
  width: 100%;
  min-height: 190px;
  resize: vertical;
  border: 1px solid #dbe2e7;
  border-radius: 8px;
  padding: 12px;
  font: inherit;
  font-size: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}

.copy-button,.upload-button {
  margin-right: 8px;
}

.file-name {
  display: inline-block;
  color: #287158;
  font-size: 12px;
}

.sleep-control {
  display: grid;
  gap: 6px;
  margin: 14px 0 4px;
  color: #405864;
  font-size: 12px;
  font-weight: 700;
}

.sleep-control input {
  width: 180px;
  border: 1px solid #d7e0e5;
  border-radius: 6px;
  padding: 8px;
  font: inherit;
}

.sleep-help {
  margin: 0 0 14px;
  color: #788892;
  font-size: 11px;
}

@media (max-width: 1050px) {
  .instructions,.lists-grid {
    grid-template-columns: 1fr;
  }
}
</style>
