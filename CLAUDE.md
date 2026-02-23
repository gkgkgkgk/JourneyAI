# Journey: Legacy Writing Tool

A local-first, AI-powered writing suite to transform archival notes into a finished book.

## Tech Stack
- **Frontend:** Expo (React Native Web) + Lucide icons — NOT Next.js. Runs via `npx expo start`.
- **Backend:** Python (FastAPI) + OpenAI (`gpt-4o`) for transcription
- **Database:** PostgreSQL with pgvector (Local Docker, `ankane/pgvector`)
- **Blob Storage:** Local filesystem (`./uploads/` on host, `/app/uploads/` in container)
- **Workflow:** Source Ingestion -> Transcription -> Human Correction -> Verified Snippets -> Manuscript Assembly

## Project Rules
- **Privacy:** Never suggest cloud-hosted alternatives for the database.
- **Tone:** Empathetic but technically precise.
- **Verification:** Every snippet must track its `source_ids` back to the original notes.
- **Code Style:** Use type hints in Python; use functional components and TypeScript in React.
- **Simplicity:** Don't over-engineer. Gavri prefers lean, focused changes — no extra abstractions.

## Environment Variables (.env)
- `DATABASE_URL` — PostgreSQL connection string (uses service name `db` inside Docker)
- `OPENAI_KEY` — OpenAI API key (note: not the default `OPENAI_API_KEY` name)

## Deployment
- Run `docker-compose up --build` from root to start DB, backend, and pgAdmin.
- Backend hot-reloads via `--reload` (volume-mounted). DB changes require restart.
- pgAdmin available at `http://localhost:5050` — connect using host `db` (not `localhost`).
- Clear Metro cache with `npx expo start --clear` if frontend crashes with STATUS_ILLEGAL_INSTRUCTION.

Below this are Contributions from Claude
======

## How Gavri Works
- Prefers a quick sanity-check question ("does this make sense?") before diving into implementation.
- Communicates casually and directly — match that energy.
- Is an engineer, not an author. Technical precision matters; don't be precious about prose suggestions.
- Enjoys a bit of humor in the workflow. Keep it light where appropriate — this is serious work, but we don't have to be serious every second.

## Last Session Summary
Built out the core backend pipeline: FastAPI with a `sources` table in Postgres, file upload to local storage, gpt-4o transcription (vision for images/PDFs, typo-fix for text), and a full indexing pipeline that extracts title/summary/keywords/people/locations/timeline via gpt-4o and stores a `text-embedding-3-small` vector in a pgvector column. Frontend VaultView has upload, transcribe, and index buttons with a metadata chip display in the sidebar.
