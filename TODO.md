# Academic Companion TODO

## Add a durable academic profile through `/ingestion`

- The web console must let the owner store programme, institution, semester, jurisdiction, courses, study preferences, and availability.
- The academic identity must attach to the existing Nally user record identified by `ACADEMIC_TELEGRAM_ID`.
- The route must be token-protected by `INGESTION_TOKEN`.

## Ingest PDFs and academic documents through `/ingestion`

- The web console must accept PDF/document metadata and file content from the browser.
- Uploaded files must be size-limited, stored in the owner workspace, and recorded with title, course, source type, and ingestion status.
- PDF text extraction should run when the host `pdftotext` utility is available; extraction failure must be recorded honestly without losing the source file.
- Extracted text must be persisted for future grounded retrieval and source citations.

## Store timetable and assessment context

- The web console must accept recurring timetable entries with day, start/end time, course, room, and lecturer.
- The web console must accept assessment/deadline entries with course, title, due date, type, and status.
- The dashboard must show the next timetable item and upcoming assessment.

## Provide a dark minimal companion dashboard

- `GET /ingestion` must render a dark, minimal academic console with profile, today/next context, ingestion, timetable, and assessment areas.
- The UI must show counts and recent ingestion status without pretending that retrieval or analysis is complete.
- The route must be declared in `public/manus-routes.json`.

## Preserve the hand-built architecture

- Do not add LangChain, AutoGen, CrewAI, Mastra, or another orchestration/web framework.
- Existing typecheck, tests, build, Python validation, audit, and diff checks must continue to pass.
