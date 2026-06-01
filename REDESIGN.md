# Journey: Redesign Plan (May 2026)

A second pass on Journey after some time away. Goals: get drafts out of the database, sharpen retrieval so questions actually return useful answers, modernize the dev environment around `nix develop`, and clean up the UI. This is a working doc — pain points first, then a proposal we can argue with before doing anything.

---

## Pain points (from you)

1. **Drafts are trapped in Postgres.** Notes and chapters live in TEXT columns. There is no on-disk plain-text copy. You can't open them in another editor, can't grep them, can't sync them with iCloud/Dropbox/git, can't easily back them up off the dev box.
2. **Recall and sourcing are weak.** Ask the archive a question and the answer is rarely useful. Sources surface that aren't really relevant; relevant ones get missed.
3. **UI needs an overhaul.** The stages metaphor is fine, but the implementation feels cramped/dated.
4. **Dev environment should work with `nix develop`.** Right now everything assumes Docker + a system-level Python/Node.
5. **You want my opinions on what else to fix.** Section at the bottom.

---

## What's actually in the code today (so we're arguing about the same thing)

- **Frontend**: Expo / React Native Web with `expo-router`, Tiptap (already a dep), Lucide icons. Three "stages" — Vault (sources), Forge (notes/drafts), Manuscript (chapters) — plus floating Chat and Source-Explorer popups.
- **Backend**: FastAPI + SQLAlchemy + Postgres (`ankane/pgvector`). Sources live on disk in `./uploads/`. Notes and chapters live **only** in DB columns.
- **Retrieval**: One hybrid query in `services/search.py` — 60% `pg_trgm` `word_similarity` + 40% cosine over a single 1536-d embedding **per whole source**. Chat / kickstart / feedback all share a two-tier pattern: top-10 sources go into the prompt in full, the rest are listed by title+summary with a `get_source_text` tool call.
- **Models**: `gpt-5` for transcription, `gpt-4o` for source-metadata extraction, `gpt-4.1-mini` for chat/feedback/kickstart, `whisper-1` for audio, `text-embedding-3-small` for the vector column.

The bones are good. The way text is stored, the retrieval pipeline, and the frontend chassis are the parts that hurt.

---

## Pain point 1 — Mountable project folders, filesystem as truth

**Proposal: you point the app at a root directory. Each subdirectory of that root is a "project" (a book / archive). The filesystem is the source of truth for everything — sources, drafts, chapters, AI output. The DB is a derivable index.**

Single-project layout:

```
~/MyBook/                       ← mount point
  sources/                      ← drop raw inputs here (images, PDFs, audio, txt, docx)
  drafts/                       ← your own working notes (markdown)
  chapters/                     ← finished chapters (markdown)
  ai/                           ← anything the AI produces (kickstarts, feedback dumps)
  .journey/
    index.sqlite                ← vectors + extracted metadata
    state.json                  ← project settings, voice prompt, etc.
```

Multi-project layout (v1):

```
~/Journey/                      ← root the app remembers
  the-grandmother-book/         ← project 1
    sources/  drafts/  chapters/  ai/  .journey/
  trip-archive/                 ← project 2
    sources/  drafts/  chapters/  ai/  .journey/
```

A dropdown in the top-left of the app lists every subdirectory of the root that contains a `.journey/` folder — that's how a directory becomes a "project." Switching projects swaps the active index. There's a "New project" item that creates the skeleton folders and an "Open existing folder…" for one-off mounts.

What this gets us:
- `git init` inside any project folder and you have full version history and async backup for free.
- You can open any chapter / draft / source in vim / Obsidian / iA Writer while the app is closed.
- iCloud / Dropbox / Syncthing on the root works trivially.
- The DB is fully derivable from the filesystem — if `.journey/index.sqlite` gets corrupted, delete it and re-index from disk.
- Multiple parallel books / archives without conflating their indexes.

Reconciliation on mount (the "just works" behavior you described):
1. Walk `sources/`, `drafts/`, `chapters/`, `ai/`.
2. For each file, compute a content hash. If `(path, hash)` is already in the index → reuse. If new or changed → queue for processing (transcribe + index for sources; embed for text).
3. If an index entry's file no longer exists → mark orphaned (don't immediately delete vectors, in case of rename).
4. A `watchdog` watcher keeps it live while the app is open.

Mechanics:
- Drafts and chapters are markdown with YAML frontmatter (`id`, `order_index`, `created_at`, `updated_at`, `source_ids`, `ai_feedback`).
- AI output goes to `ai/` with a clear filename like `kickstart-2026-06-01-grandmas-letter.md`. You promote it by moving/copying it into `drafts/` yourself — no special "promote" button needed, the watcher just notices.
- Sources stay in their original binary form; transcriptions live alongside as `sources/<name>.transcript.md` (also editable by hand). Embeddings + extracted metadata live in `.journey/index.sqlite`.
- Settings + voice prompt live in `.journey/state.json` so they travel with the project.

This is the single biggest quality-of-life win and unlocks everything in pain point 5 (export, diffing, daily digest, etc.).

---

## Pain point 2 — Make recall actually work

Today's retrieval has four real problems:

| Problem | What's happening |
|---|---|
| **Source-level embeddings** | A whole letter gets one 1536-d vector. The signal of a single relevant paragraph drowns. |
| **`word_similarity` ≠ lexical search** | `pg_trgm` is fuzzy substring matching, not BM25. Verbatim quotes don't dominate; rare terms aren't weighted. |
| **No reranking** | Top-K by cosine + trigram is a coarse first cut. There's no second pass with a stronger model. |
| **Facets are extracted but ignored** | We pull out `people`, `locations`, `timeline` per source, then never query against them. |

### Proposed retrieval v2

1. **Chunking.** Split each transcription into ~400–600 token chunks with ~75-token overlap, on paragraph boundaries where possible. New `source_chunks` table with `(source_id, idx, text, embedding)`. Source-level metadata stays where it is.
2. **Real lexical search.** Add a Postgres `tsvector` column on chunks with a GIN index. Use `ts_rank_cd` (BM25-ish) instead of `word_similarity`. Keep trigram as a fallback for near-misspellings.
3. **Hybrid + RRF.** Run vector and lexical independently, fuse with reciprocal rank fusion. Configurable weights, but RRF removes the need to tune the 0.4/0.6 magic numbers.
4. **Rerank top-50 → top-10.** Use a cross-encoder rerank pass. Cheapest path: Cohere Rerank or Voyage rerank-2 (API). Local-only path: `BAAI/bge-reranker-v2-m3` via `sentence-transformers`. This is the single biggest jump in answer quality once chunking exists.
5. **Facet filters.** Parse simple intents from the question ("what did X say about Y in 1973") and pre-filter chunks where the parent source matches `people @> ['X']` and timeline overlaps 1973. Falls through to no-filter if extraction is uncertain.
6. **Query rewriting / HyDE.** Have the model rewrite the question into 2–3 alternative phrasings (and a hypothetical answer) before embedding. Cheap and gives a measurable boost on noisy archival text.
7. **Citation grounding.** Make the model emit `[[source_id#chunk_idx]]` markers inline so the UI can highlight the exact passage instead of "see this source." This also lets us measure citation accuracy.

### Model question (worth deciding now)

- Keep `gpt-4.1-mini` for chat/feedback or move to `claude-sonnet-4-6` / `gpt-5-mini`? Anthropic prompt caching would meaningfully cut cost since the system + sources block is mostly stable across a conversation. I'd lean toward `claude-sonnet-4-6` with caching for the long-running chat surface, keep `gpt-5-mini` for the one-shot kickstart/feedback.
- `text-embedding-3-small` is fine for v2 once we chunk. Voyage-3 is better but adds an API key — not worth it yet.

---

## Pain point 3 — UI overhaul

Two real choices to make, in order of impact:

### a) Drop React Native Web

Expo + RN Web for a desktop writing tool buys nothing and costs everything: the Tiptap integration in this repo is already `.web.tsx`-specific, RN's `TextInput` is fighting markdown editing, `StyleSheet` is repeating Tailwind badly. We don't ship a mobile app and we won't. Move to **plain React + Vite + Tailwind**. Keep the existing Lucide icons (drop `lucide-react-native`, swap to `lucide-react`). Keep Tiptap.

Optional: wrap it in **Tauri** later for a real desktop app with native menus, autosave on quit, etc. Not needed for v1 of the rewrite.

### b) Editor-first layout

The Vault is the current strongest screen. The Forge needs to become the daily driver:

- Full-bleed Tiptap editor in the center.
- Right rail: contextual evidence — sources cited by this draft, with quotable snippets and "jump to source."
- Left rail: chapter/note tree (matches the filesystem).
- Inline citations render as superscript chips; click to scroll the right rail.
- "Ask the archive" is a slide-up panel from the bottom of the editor, not a floating popup — conversation stays in context.
- Vault becomes a route, not a popup; keep the grid + sidebar combo.

Distraction-free toggle that hides both rails. Light/dark + the existing color tokens.

### c) Manuscript view = filesystem + drag-to-reorder

If chapters are markdown files with `order_index` in frontmatter, the Manuscript view is just a sortable list backed by file moves. Drag-to-reorder rewrites frontmatter and that's it.

---

## Pain point 4 — `nix develop`

Add a `flake.nix` providing:
- `python313`, `uv` (replace pip / `requirements.txt` with `uv` + `pyproject.toml`)
- `nodejs_22`, `pnpm`
- `ffmpeg` (already needed for video → audio)
- `postgresql_16` with `pgvector` extension (nixpkgs has it)
- `direnv` integration via `.envrc`

Two real options for the DB inside the flake:

1. **Keep docker-compose for Postgres**, flake just provides the language toolchains. Simplest; pgvector image stays curated.
2. **Drop Docker entirely**, run Postgres as a nix-managed service via `services.postgresql` or a per-shell `pg_ctl` script. Means a single `nix develop` boots the whole stack.

Worth a real decision: **switch to SQLite + `sqlite-vec`?** Pros: single file, trivial backup, no service to run, fits the local-first model perfectly. Cons: lose pgvector's HNSW (still fast at our scale — thousands of chunks, not millions), some SQL rewrites. For a personal archive of hundreds-to-low-thousands of sources, SQLite is the right choice. I'd flip.

Either way: `nix develop` lands us in a shell with `journey-up`, `journey-down`, `journey-reset` scripts and direnv that loads `.env`.

---

## Pain point 5 — My additional suggestions

In rough order of bang-for-buck:

1. **Pandoc export.** Once chapters are markdown on disk: `pandoc manuscript/chapters/*.md -o book.epub` (or docx, or pdf via LaTeX). One command, real book artifact.
2. **Author voice prompt.** A `manuscript/voice.md` file (samples of your real writing) gets stuffed into every kickstart/feedback system prompt so generated drafts sound like you, not like ChatGPT.
3. **Contradiction / discrepancy detector.** A periodic pass that asks "do any two sources disagree about a fact (date, name, place)?" and surfaces results in a Discrepancies panel. Memoir-from-archives is exactly the place this matters.
4. **Timeline view, for real.** You have a `TimelineView.tsx` already — auto-build a master timeline from extracted dates across all sources, click an entry to jump to source. Helps you find structural gaps.
5. **Auto-link notes ↔ sources.** When a note is saved, run feedback in the background and persist `source_ids`. The Forge already does this on demand; just make it automatic and incremental.
6. **Transcription diff on re-run.** If you re-transcribe a source, show a diff against the prior transcription before overwriting. Catches OCR regressions on handwriting.
7. **Daily digest.** A small `journey digest` command that prints: new sources today, drafts touched, open `[EXPAND: ...]` markers across all notes, contradictions found. Pipe to a markdown file or skip — fine either way.
8. **Source health check.** Flag indexed sources whose transcription looks suspicious (very short, all-caps, ends mid-sentence) so you can re-OCR them.

---

## Proposed execution order

Working from "biggest unlock per unit of work" outward. Each step is small enough to do in one sitting:

1. **Nix flake** providing the dev shell (1–2 hours). Cheapest win, unblocks everything.
2. **Filesystem-as-source-of-truth for notes + chapters** (~half a day). Includes migration script that exports existing DB rows to markdown.
3. **SQLite + sqlite-vec migration**, replacing Postgres + Docker for DB (~half a day). Or skip and keep Postgres if we want to defer.
4. **Frontend rewrite to React + Vite + Tailwind** (~2 days, depending on how much we keep). Forge gets the editor-first treatment first; Vault second; Manuscript last.
5. **Retrieval v2** — chunking, BM25, RRF, reranker (~1 day). This is what makes the chat actually useful.
6. **Citation grounding + inline citation UI** (~half a day, dependent on 4 and 5).
7. Suggestions from §5 picked à la carte.

---

## Open questions for you

Before I touch anything, four decisions matter most:

- **Storage**: SQLite + `sqlite-vec` (recommended) or stay on Postgres + pgvector?
- **Frontend chassis**: React + Vite + Tailwind (recommended) or stay on Expo + RN Web?
- **Desktop wrapper**: Tauri later, or just a web app served locally?
- **Chat model**: switch to `claude-sonnet-4-6` with prompt caching, or stay on `gpt-4.1-mini`?

Tell me which of these you want to push back on, then we'll pick item #1 from the execution order and go.
