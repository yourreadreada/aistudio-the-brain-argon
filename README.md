# The Brain (Argon — Local & Experimental Memory Layer)

**The Brain** is a source-aware, persistent personal context and memory layer designed to sit between you and the AI tools you work with.

The core premise is simple:

> **Connect the Brain once → work across different AI tools → carry context and memory between them.**

The Brain itself is **not** primarily another AI chatbot. It is the durable context and memory layer that captures conversations, documents, and technical decisions from multiple tools, lets you review and organise them without losing provenance, stores them with full source and document metadata, and exports or injects that context back into your workflows.

---

## Current Status (Argon Edition)

This repository is the **Argon** implementation of The Brain — the **Local / Experimental Brain** environment used to build, test, and validate local-first persistence, multi-format file extraction, duplicate-safe import review workflows, graph visualization, and browser companion tooling.

### What Currently Exists in This Repository

- **Logical Brain Workspaces**: Separate context namespaces (defaults: `coding`, `college`, `personal`, plus inline creation and deletion of custom Brains).
- **Source-Aware Constellation & Graph Workspace**: Interactive force-directed neural graph (`InteractiveBrainGraph.tsx`), source cluster view, list/table inspector, global search bar, and slide-over node inspector (`NodeInspector.tsx`).
- **Capture Hub (`CaptureHubModal.tsx`)**: Unified modal orchestrating four capture and portability workflows:
  1. **Browser Companion**: Gateway status check, per-browser device token issuance/revocation (`/api/companion/devices`), and extension pairing instructions.
  2. **Import & Review**: Client-side file/archive extraction feeding directly into `ImportReviewQueue`.
  3. **Paste Conversation**: Manual transcript or Markdown capture with live duplicate detection, source assignment, and option to stage in the Review Queue or store directly.
  4. **Portable Export**: Exports any Brain (optionally filtered by AI source) into a portable Markdown (`.md`) snapshot with YAML frontmatter.
- **Multi-Format Client-Side Extraction (`src/services/fileExtractor.ts`)**:
  - `.zip` archives (unpacked client-side via `JSZip`, extracting supported inner files and official `conversations.json` exports)
  - `.json` (ChatGPT `mapping` trees and Claude `chat_messages` arrays)
  - `.pdf` (page-by-page text extraction via `pdfjs-dist`)
  - `.docx` (Word raw text extraction via `mammoth`)
  - `.xlsx` / `.xls` (spreadsheet sheet-to-pipe-table extraction via `xlsx`)
  - `.pptx` (PowerPoint slide XML `<a:t>` parsing via `JSZip` + `DOMParser`)
  - `.md`, `.markdown`, `.txt`, `.csv`
  - `.png`, `.jpg`, `.jpeg`, `.webp` (image metadata & reference node creation)
- **`ImportReviewQueue` v1 (`src/components/ImportReviewQueue.tsx`)**:
  - Staged review layer between file extraction and permanent persistence.
  - Per-item and bulk actions (**Create**, **Merge**, **Replace**, **Skip**, **Retry**).
  - 5-state duplicate detection (**New**, **Possible duplicate**, **Exact duplicate**, **Related content**, **Unable to determine**) with strict overwrite protection.
  - Bounded concurrency (`runWithControlledConcurrency`) for bulk operations.
  - Real determinate progress (`current / total` pages, archive entries, slides, sheets, records, or chunks) when measurable, and honest indeterminate progress (`Processing…`) when single-request HTTP operations do not expose streaming progress.
  - Responsive layout: structured table on desktop (`lg+`) and adaptive review cards on mobile, tablet, and foldable screens.
- **Durable Backend-Confirmed Persistence (`src/services/brainStorage.ts` + `server.ts`)**:
  - Embedded SQLite database (`data/brain.db` via Node `node:sqlite` in `server.ts` and Python `sqlite3` in `src/brain/db.py`).
  - Queue items transition to `Imported` **only** after the backend confirms persistence (`POST /api/remember` or `POST /api/correct`).
- **Semantic Chunking & Incremental Diff Merge (`src/services/semanticChunker.ts`)**:
  - Splits documents and chat transcripts into structured `SemanticSection` blocks (chat turns, headings, slides, sheets, code blocks, paragraphs).
  - Computes incremental diffs (`detectIncrementalDiff`) and records an auditable `mergeHistory` on each node.
- **Python MCP Server & CLI Scripts (`src/brain/`)**:
  - Local Model Context Protocol (MCP) stdio server (`src/brain/server.py`) exposing `remember`, `recall`, `correct`, `forget`, and `list_brains` to Claude Desktop / Claude Code.
  - CLI bulk-ingestion scripts (`src/brain/ingest.py`, `src/brain/import_export.py`, `src/brain/extract.py`).

---

## Current Workflow

The Brain is built around a six-stage lifecycle:

```text
CAPTURE → REVIEW → ORGANISE → STORE → RECALL → EXPORT
```

1. **CAPTURE**: Collect raw knowledge from files, `.zip` account exports, pasted transcripts, or the Browser Companion extension.
2. **REVIEW**: Inspect staged items in `ImportReviewQueue` before anything is written to permanent storage. Inspect detected source, item/turn counts, content preview, and duplicate analysis.
3. **ORGANISE**: Assign or edit the item title, filename, file path, source origin (`claude`, `gpt`, `gemini`, `github`, `moodle`, `cursor`, `local-ai`), destination Brain, tags, and node structure strategy (`Unified`, `Branching`, or `Sliced`).
4. **STORE**: Execute user-confirmed persistence (`Create`, `Merge`, or `Replace`) against the backend SQLite store (or local cache fallback when running offline). Items are marked `imported` **only** after persistence actually succeeds.
5. **RECALL**: Search, filter by source or file type, inspect semantic sections and merge history in the graph or list view, or query via the MCP server / REST API.
6. **EXPORT**: Generate a portable Markdown (`.md`) file or context primer to carry your Brain into another AI tool or workspace.

### Detailed Import & Review Flow

Every imported file or pasted conversation follows this end-to-end flow:

```text
File
→ Extract
→ Detect source/type
→ Check duplicates
→ Review
→ User resolution
→ Persist
→ Confirm
→ Imported
```

### Explicit Queue States & Duplicate Safety Rules

`ImportReviewQueue` tracks each item through seven explicit lifecycle states:
- `extracting` — Client-side parser is unpacking/reading the file or archive.
- `ready` — Extracted and evaluated against the destination Brain; awaiting or ready for user resolution.
- `importing` — Creating new node(s) in durable storage.
- `processing` — Merging or replacing an existing node in durable storage.
- `imported` — Durable persistence succeeded and was confirmed.
- `skipped` — Explicitly skipped by the user; destination Brain untouched.
- `error` — Extraction or persistence failed; error message preserved with per-item and batch `Retry`.

Duplicate and conflict state is automatically re-checked whenever relevant fields change (`destinationBrain`, `fileName`, `filePath`, `title`, `text` content, or when new nodes are persisted into the destination Brain):

| Duplicate State | Meaning | Default Resolution | Safety Rule |
| :--- | :--- | :--- | :--- |
| **New** (`new`) | No matching file path, title, or overlapping content in destination Brain. | `Create` | Safe to create as a new node. |
| **Exact duplicate** (`exact_duplicate`) | Identical content already exists in destination Brain. | `Skip` | Defaults to `Skip` to prevent redundant nodes; user can still explicitly override. |
| **Possible duplicate** (`possible_duplicate`) | Matches an existing node's file path, filename, or title with updated/different content. | `Ask user` (`undecided`) | Never auto-overwrites; user chooses `Merge`, `Replace`, `Create`, or `Skip`. |
| **Related content** (`related_content`) | Different filename/title, but shares partial content or semantic section overlap with an existing node. | `Ask user` (`undecided`) | User chooses whether to `Merge` into the related node, `Create` a separate node, or `Skip`. |
| **Unable to determine** (`unable_to_determine`) | Empty/unreadable content or unverified state. | `Ask user` (`undecided`) | **Never silently allows Merge or Replace.** Merge and Replace are blocked; user must choose a safe resolution (`Create` or `Skip`) or provide readable content. |

---

## Architecture

The repository combines a TypeScript/React + Express full-stack web application (`server.ts` + `src/`) with a Python MCP & CLI package (`src/brain/`) and a Manifest V3 browser extension (`extension/`):

```text
/
├── server.ts                         # Express API gateway + Vite middleware + Node SQLite (data/brain.db)
├── index.html                        # Web app entry point
├── package.json                      # Node/React/Vite dependencies and scripts
├── pyproject.toml / requirements.txt # Python MCP server & CLI extraction dependencies
├── data/
│   └── brain.db                      # Local SQLite database file
├── extension/                        # Manifest V3 Browser Companion extension (Chrome/Edge/Brave)
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   └── README.md
└── src/
    ├── App.tsx                       # Root application layout, collapsible sidebar, view switching
    ├── types/
    │   └── brain.ts                  # Shared TypeScript interfaces (Fact, AISource, DuplicateDetectionState, etc.)
    ├── services/
    │   ├── brainStorage.ts           # State store, duplicate detection, durable persistence, Markdown export
    │   ├── fileExtractor.ts          # Client-side parsers (.zip, .pdf, .docx, .xlsx, .pptx, .json, .md, .txt, .csv)
    │   └── semanticChunker.ts        # Semantic section parser and incremental diff engine
    ├── components/
    │   ├── CaptureHubModal.tsx       # 4-tab Capture Hub workflow orchestrator
    │   ├── ImportReviewQueue.tsx     # Reusable review/decision queue (single & bulk actions, progress, responsive UI)
    │   ├── InteractiveBrainGraph.tsx # Force-directed neural graph canvas
    │   ├── NodeInspector.tsx         # Slide-over fact/document inspector with semantic sections & merge history
    │   ├── FactPanel.tsx             # List/table memory browser
    │   ├── McpBridgeModal.tsx        # Claude Desktop MCP configuration generator
    │   └── ...                       # Header, search, modals, and supporting UI components
    └── brain/                        # Python MCP server & CLI tools
        ├── db.py                     # Python SQLite + FTS5 storage layer
        ├── server.py                 # MCP stdio server (remember, recall, correct, forget, list_brains)
        ├── extract.py                # Python document & OCR extractor
        ├── ingest.py                 # CLI directory ingestion tool
        ├── import_export.py          # CLI ChatGPT/Claude ZIP importer
        └── web.py                    # Standalone lightweight Python HTTP viewer
```

---

## Brain Data Model

The data model in `src/types/brain.ts` and `server.ts` is built around traceable, source-aware knowledge nodes:

### 1. Brain
A logical workspace/namespace string (e.g., `coding`, `college`, `personal`). Facts belong to a specific Brain so unrelated contexts do not pollute each other.

### 2. Fact / Knowledge Node (`Fact`)
A stored unit of knowledge or unified document context persisted in the `facts` SQLite table:
- `id`: Numeric primary key assigned by the backend database.
- `brain`: Target Brain workspace name.
- `content`: Markdown or structured text content.
- `source`: Origin `AISource` identifier.
- `tags`: Optional array of lowercase topic tags.
- `created_at` / `updated_at`: ISO-8601 timestamps.

### 3. Supported Sources (`AISource`)
Only the following seven sources are defined and color-coded in `SOURCE_PALETTE`:
- `claude` — **Claude** (Anthropic Claude conversations & reasoning exports)
- `gpt` — **ChatGPT** (OpenAI ChatGPT conversations & exports)
- `gemini` — **Gemini** (Google Gemini analysis & research chats)
- `github` — **GitHub** (Commits, pull requests, issues, code diffs)
- `moodle` — **Moodle** (Academic syllabi, assignments, lecture slides, grade sheets)
- `cursor` — **Cursor / Antigravity** (IDE composer sessions & agent logs)
- `local-ai` — **Local AI / Ollama** (Local LLM runs, Llama/Qwen/Mistral outputs)

### 4. Document Metadata, Semantic Sections & Merge History
To keep imported files traceable and maintainable rather than fragmenting them into anonymous text snippets, each `Fact` node also supports:
- `fileType`: `'pdf' | 'docx' | 'xlsx' | 'pptx' | 'code' | 'md' | 'img' | 'chat'`
- `fileName` & `filePath`: Original file name and relative path (used for deterministic duplicate detection).
- `documentTitle`: Human-readable document or conversation title.
- `isDocumentRoot` & `isUnifiedContextNode`: Flags indicating whether the node represents a unified document root.
- `parentId`: Optional parent `Fact.id` when using the `Branching` ingestion strategy (where a root hub node links to child turn/section nodes).
- `semanticSectionCount`: Number of structured `SemanticSection` blocks (`chat-turn`, `heading`, `slide`, `sheet`, `code-block`, `paragraph`) parsed from the content.
- `mergeHistory`: Array of `FactMergeRecord` entries (`timestamp`, `action: 'created' | 'merged' | 'appended' | 'updated'`, `summary`, `previousContentLength`, `newContentLength`) providing an audit trail of how a node evolved over time.

---

## Project Architecture Direction: Local (Argon) vs. Production (GPT)

Development of The Brain is intentionally split across two complementary environments:

- **Argon = Local / Experimental Brain**
- **GPT = Cloud / Production Brain**

| Aspect | Argon Repository (This Repo) | GPT Repository (Cloud Production) |
| :--- | :--- | :--- |
| **Role** | **Local / Experimental Brain** | **Cloud / Production Brain** |
| **Storage & Auth** | Local SQLite (`data/brain.db`) + local/offline cache fallback + local device tokens | Supabase Auth + Supabase Postgres + Vercel authenticated API gateway |
| **Primary Focus** | Complete behavioral reference for Capture Hub & `ImportReviewQueue`, local/offline experimentation, multi-format extraction, MCP server, browser companion | Multi-tenant cloud security, production authentication, hosted cloud persistence |

### Shared Concepts, Compatible Behavior
The implementation between Argon and GPT can differ (local SQLite/offline store vs. cloud Supabase), but the domain concepts, state machine, duplicate safety rules, and user-facing behavior remain compatible. Argon's Capture Hub and `ImportReviewQueue` serve as the complete behavioral reference implementation.

```text
Argon experiment
  → Validate behavior, data model & UX locally
  → Adapt proven contracts to production cloud architecture
  → Test & deploy
```

Long-term, this shared contract foundation enables potential **Local Brain ↔ Cloud Brain synchronization** and hybrid offline/online modes.

---

## Browser Companion (`extension/`)

The repository includes an unpacked Chromium Manifest V3 extension in `extension/` ("Save to Brain"):

### How It Works
1. **Device Token Authentication**:
   - In the web app, open **Capture Hub → 1. Browser Companion** to issue a per-browser device token (`brn_live_...`) stored in the `companion_devices` SQLite table via `POST /api/companion/devices`.
   - Paste the Gateway URL (e.g., `http://localhost:3000`) and Device Token into the extension popup (`extension/popup.html`).
   - All extension API calls attach `Authorization: Bearer <token>`, updating `last_used_at` telemetry on the backend, and tokens can be revoked at any time.
2. **Active-Tab Conversation Capture**:
   - Clicking **Save Current Chat to Brain** executes a DOM extraction script (`extractConversation` in `extension/popup.js`) on the active browser tab and sends the formatted Markdown dialogue to `POST /api/ingest`.
3. **Cross-AI Context Injection**:
   - Clicking **Inject Brain into Prompt** fetches stored facts for the selected Brain (`GET /api/facts?brain=...`), formats a grounding context block, and injects it into the active chat input box (or copies it to the clipboard as a fallback).

### Current Browser Companion Limitations
- **Supported Web Hosts**: Host permissions and DOM selectors in `extension/manifest.json` and `extension/popup.js` currently target only **ChatGPT Web** (`https://chatgpt.com/*`), **Claude Web** (`https://claude.ai/*`), and **Google Gemini Web** (`https://gemini.google.com/*`).
- **DOM Selector Fragility**: Because ChatGPT, Claude, and Gemini web interfaces update their DOM structure frequently, CSS selectors in `extension/popup.js` are best-effort and may require maintenance when providers change their markup.
- **User-Initiated Only**: Capture and injection only run when the user clicks the extension popup buttons on the active tab; there is no background scraping of closed tabs or unauthorized third-party sites.

---

## Development Principles

All contributions to The Brain follow ten core engineering principles:

1. **Do not create duplicate persistence systems.** Reuse the existing durable storage and backend API pipeline (`persistReviewedItem` / `/api/remember` / `/api/correct`).
2. **Do not silently overwrite user knowledge.** Duplicate detection must surface conflicts clearly and require explicit user confirmation before replacing or merging ambiguous items.
3. **Every import should be traceable.** Preserve source (`AISource`), original file name/path, document title, semantic section counts, and merge history.
4. **Failures should be retryable.** Never optimistically mark an import, merge, or replace operation as `Imported` before backend confirmation. Keep failed items in the queue with their error message and a `Retry` action.
5. **Bulk operations must remain item-independent.** If 9 items succeed and 1 fails during a bulk action, 9 items must remain `Imported` and 1 item must show `Error + Retry`. Never mark the entire batch as failed or lose user decisions on other items.
6. **Progress must be real, never fabricated.** Display a determinate percentage (`current / total`) only when the underlying operation reports measurable units (e.g., pages, archive entries, chunks, records). Use an indeterminate indicator (`Processing…`) otherwise.
7. **Local Argon and cloud GPT should share concepts, not necessarily implementation.** Keep data models and component contracts compatible while respecting Argon's local/experimental architecture.
8. **Experimental features should be validated before production adoption.** Prove workflows end-to-end in Argon before porting them to the cloud production repository.
9. **Privacy and user control are first-class requirements.** Users decide what enters their Brain, which destination workspace it belongs to, and when device tokens are revoked or memories are deleted.
10. **Automatic memory should eventually be intelligent rather than blindly storing everything.** Future automated capture must filter for high-signal, durable context rather than dumping raw noise.

---

## Roadmap / Planned

> **Note:** The items below represent the **planned roadmap** and are **not** yet implemented in the current repository.

### 1. Foundation (Completed / Refining in v1)
- [x] `ImportReviewQueue` v1 with individual and bulk actions
- [x] 5-state duplicate and conflict handling with overwrite safeguards
- [x] Bulk imports with bounded concurrency and real per-item progress
- [x] Portable Brain Markdown export format
- [x] Responsive desktop, tablet, mobile, and foldable review UI

### 2. Connectivity (Planned)
- [ ] Unified AI Connection Framework for provider-specific integrations
- [ ] Hardened browser extension selectors and live DOM change resilience
- [ ] Direct read-first connectors for GitHub and Moodle APIs
- [ ] Streamlined cross-AI context injection templates
- [ ] Optional automatic sync where provider APIs and terms technically permit

### 3. Memory Intelligence (Planned)
- [ ] LLM-assisted automatic memory extraction (distilling durable facts from raw chat transcripts)
- [ ] Configurable memory modes: **Manual** / **Assisted** / **Automatic**
- [ ] Relevance scoring, confidence indicators, and semantic deduplication
- [ ] Memory audit log with granular forget, edit, and disable controls

### 4. Privacy & Access Control (Planned)
- [ ] Explicit per-provider read/write permission scopes
- [ ] One-click pause for automatic memory capture
- [ ] Provider disconnect and selective memory purge controls

### 5. Long-Term Direction (Planned)
- [ ] Bidirectional **Local ↔ Cloud Brain synchronization**
- [ ] Seamless hybrid/offline mode with conflict-free replication
- [ ] Persistent context handoff across AI providers

*Important Constraint:* Provider capabilities, browser sandboxing, and platform API policies strictly govern what can be synchronized automatically. The Brain does not promise unrestricted background access to third-party AI conversations.

---

## Known Limitations

- **Single-Request Backend Progress**: Standard JSON `POST /api/remember` and `POST /api/correct` calls do not stream byte-level upload progress; single-node persistence therefore displays an honest indeterminate state (`Processing…`), whereas multi-page extraction (`.pdf`, `.zip`, `.pptx`, `.xlsx`) and multi-chunk/branching persistence display determinate progress (`current / total`).
- **Scanned Image PDFs in Client-Side Extractor**: The browser-side PDF parser (`pdfjs-dist` in `src/services/fileExtractor.ts`) extracts embedded PDF text layers. Scanned image-only PDFs without a text layer require the Python OCR pipeline (`src/brain/extract.py` with system `tesseract-ocr`).
- **Recent Activity Log**: The recent activity feed is currently maintained client-side alongside the SQLite-backed `facts` and `companion_devices` tables.

---

## Development & Setup Instructions

### 1. Full-Stack Web Application (Node.js + React + Vite + SQLite)

**Prerequisites**: Node.js v22.5+ (uses the built-in `node:sqlite` module in `server.ts`).

```bash
# Install dependencies
npm install

# Start the Express + Vite development server on http://localhost:3000
npm run dev
```

Additional scripts from `package.json`:

```bash
# Type-check the TypeScript codebase
npm run lint

# Build the production frontend bundle into dist/
npm run build

# Start the server
npm start
```

The server automatically creates `data/brain.db` on first launch and seeds initial sample nodes if the database is empty.

### 2. Browser Companion Extension (`extension/`)

1. Open Chrome, Brave, or Edge and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `extension/` directory in this repository.
4. Open the web app at `http://localhost:3000`, open **Capture Hub → 1. Browser Companion**, issue a Device Token, and paste the Gateway URL and token into the extension popup.

### 3. Optional Python MCP Server & CLI Tools (`src/brain/`)

If you want to connect the local `data/brain.db` to Claude Desktop / Claude Code via MCP or run the Python CLI ingestion scripts:

```bash
python3 -m venv .venv
./.venv/bin/pip install -e .

# Run the MCP stdio server
./.venv/bin/python -m brain.server

# Or run the standalone Python web viewer on http://localhost:8787
./.venv/bin/python -m brain.web
```
