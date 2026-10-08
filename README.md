# CityU BetterReg

CityU BetterReg is a client-side timetable helper for finding Gateway Education sections around an existing schedule.

The application is built with Vue, Vite, and TypeScript. It does not provide course registration and does not send schedule data to a backend.

This is experiment AI slop, u can use it for better visualization or maybe u can just scrap the data & send to generative ai to help u for reg科.
I’m still figuring out how to organise the messy data excluding the GE courses, into a clean and easy-to-understand format.

Try it here:
[Open CityU BetterReg](https://hkahyin.github.io/CityU_BetterReg/)

## Features

- Import an AIMS Student Detail Schedule by pasting copied `<body>` HTML.
- Add manual busy periods by dragging on the timetable.
- Import a locally generated `ge_courses.json` file.
- Search GE sections by timetable range, course code, title, section, or CRN.
- Filter by component type and section group.
- Match lecture and tutorial sections using the second section character.
- Preview and select GE sections.
- Detect timetable conflicts without automatically blocking selections.
- Hide and restore entire GE courses.
- Remove imported classes, busy periods, and selected GE sections.
- Persist manual busy periods in browser `localStorage`.

## Requirements

- Node.js 18 or newer
- npm

## Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Run type-checking:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Build the production bundle:

```bash
npm run build
```

## Preparing GE data

The application does not log in to AIMS and does not scrape AIMS from the frontend. To prepare a GE catalog:

1. Open AIMS.
2. Go to Master Class Schedule.
3. Choose Lookup.
4. Enable Show GE only.
5. Open Developer Tools with F12.
6. Open the Console tab.
7. Copy the contents of [`public/gescraper.txt`](./public/gescraper.txt) into the console.
8. Press Enter and wait for `ge_courses.json` to download.
9. Upload the downloaded JSON file in BetterReg.

The scraper runs manually in the user's AIMS browser session. BetterReg only reads the JSON file selected by the user.

The GE import dialog also lets you choose a delay between AIMS requests in milliseconds. The default is `100` ms. The Copy customized scraper code button inserts the selected value into the code before copying it. Use a larger delay if AIMS responds slowly or rate-limits requests.

## Preparing an existing schedule

1. Open AIMS Student Detail Schedule.
2. Press F12 or choose Inspect.
3. In the Elements panel, right-click the `<body>` element.
4. Choose Copy, then Copy outerHTML.
5. Paste the copied HTML into the schedule import dialog.
6. Parse the schedule.

The schedule parser reads the pasted HTML locally in the browser. It does not perform a network request.

## Data and privacy

The parser is data-driven. Course names, course codes, CRNs, sections, meeting times, rooms, and availability come from the user's uploaded JSON or pasted schedule HTML. The application does not use a bundled course-data fallback.

The following are intentionally defined in source code because they are public parsing rules:

- AIMS day-letter mappings
- GE section-prefix mappings
- Three-character section-group handling
- AIMS table and JSON field names

Manual busy periods are stored in browser `localStorage` under the key `betterreg.busy`. They are not uploaded by the application.

## Limitations

The parsers depend on the AIMS HTML and GE JSON structures represented by the supplied references. If AIMS changes those structures, the parser or scraper may need to be updated.

The tool is for timetable planning and reference only. Users must confirm final course requirements, section-group compatibility, availability, and registration details in AIMS before registering.

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).