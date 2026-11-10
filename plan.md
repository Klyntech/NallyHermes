# Academic Companion Milestones 1–5

## Implementation approach

Add a token-protected `/ingestion` web surface to the existing Node HTTP server. No web framework and no orchestration framework will be introduced. The route will serve a dark, minimal single-page console and accept JSON ingestion commands for profile data, documents/PDFs, timetable entries, and assessments. Uploaded documents will be saved into the existing per-user workspace and, when `pdftotext` is available, extracted text will be persisted for future grounded retrieval. Neon will persist academic metadata and extracted text.

The first vertical slice is intentionally single-owner: `ACADEMIC_TELEGRAM_ID` identifies the existing Nally user record and `INGESTION_TOKEN` protects the route and write operations. The same academic identity will later feed daily briefings, document Q&A, timetable-aware planning, and study workflows.

## Milestones included

1. Academic profile: programme, institution, semester, jurisdiction, courses, study preferences, availability.
2. Document library: PDF upload, metadata, local source file, extracted text, course association, page-aware extraction when available.
3. Grounded law-study foundation: document records and extracted text are stored with source metadata for later retrieval and citations.
4. Timetable and academic planner: recurring class entries and assessments/deadlines with dashboard summaries.
5. Companion dashboard foundation: today/next class, upcoming assessment, counts, and concise ingestion status.

## Project structure

- `src/academic/store.ts`: academic profile, document, timetable, and assessment persistence.
- `src/academic/ingestion.ts`: upload validation, workspace storage, and PDF text extraction.
- `src/ingestion/web.ts`: `/ingestion` HTML shell, request parsing, token checks, and endpoint actions.
- `src/db/schema.ts` and `src/db/client.ts`: durable academic tables and startup migrations.
- `src/index.ts`: route `/ingestion` alongside health and Telegram webhook handling.
- `public/manus-routes.json`: declared page routes for the web surface.

## Design

Three candidate styles:

- **Night-studio index** (0.06): near-black canvas, thin teal rules, dense editorial data cards.
- **Obsidian academic desk** (0.04): graphite panels, warm paper highlights, and structured study metadata.
- **Terminal library** (0.03): black background, monospace-heavy controls, fluorescent status accents.

Chosen: **Night-studio index**.

### Design movement
Editorial research console meets quiet night-study desk.

### Core principles
- Calm density: show useful academic state without dashboard noise.
- Strong hierarchy: one “today” signal, then next actions and library intake.
- Trust through provenance: source names, dates, and statuses are always visible.
- Minimal motion: only subtle focus and upload progress feedback.

### Color philosophy
Use deep ink and blue-black surfaces to reduce glare during study. Teal is the signature action color for trusted system state; pale mint is reserved for confirmed metadata. Amber marks attention or uncertainty, not decoration.

### Layout paradigm
A left editorial rail for identity and scope; a main vertical desk for today, intake, and academic records. Avoid a generic centered SaaS grid.

### Signature elements
- A thin teal “study line” running through section headers.
- Compact uppercase metadata labels above human-readable values.
- Source chips showing document type, course, and ingestion state.

### Interaction philosophy
Every form should feel like adding one durable fact to Nally’s understanding. Save actions are explicit, responses are short, and the UI never hides what was stored.

### Animation
No decorative animation. Use a 150ms color transition on controls, an indeterminate thin progress line during ingestion, and a single success pulse on saved records.

### Typography
Use system sans for readable academic content with a restrained monospace face for metadata, file names, dates, and status labels.

### Brand essence
Nally is the quiet academic companion that turns a law student’s scattered material into a usable daily system. Personality: grounded, attentive, practical.

### Brand voice
Headlines: direct and calm — “Your academic desk.”
CTAs: specific and human — “Add this timetable block” and “Ingest document”.

### Wordmark & logo
Use a compact `N/` monogram in a teal square beside the NallyHermes wordmark; no generated image is needed for this internal console.

### Signature brand color
`#58D6C0` — a muted mint-teal that reads as trusted state against ink surfaces.
