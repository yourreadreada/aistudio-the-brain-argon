# The Brain (Argon — Local-First Reference Implementation)

**The Brain** is a source-aware, persistent personal context and memory layer designed to sit between you and the AI tools and codebases you work with.

> **Connect the Brain once → work across different AI tools → carry context and memory between them.**

This repository (`yourreadreada/aistudio-the-brain-argon`) is the **Argon** local-first reference implementation of The Brain. Its purpose is to validate behavior, data contracts, local SQLite storage, multi-format capture workflows, duplicate-safe review queues, and Browser Companion tooling before proven patterns are adapted to the cloud-based GPT production build.

---

## 1. Current Argon Architecture

Argon combines a React 19 + TypeScript + Vite frontend with a local Express + Node SQLite (`node:sqlite`) backend and a Manifest V3 Browser Companion extension:

```text
/
├── server.ts                              # Express entry point (binds 127.0.0.1 by default) + Vite middleware
├── package.json                           # Dependencies, build, test, DB, and extension packaging scripts
├── .env.example                           # Environment variable template (BRAIN_HOST, BRAIN_ALLOW_LAN, etc.)
├── extension/                             # Chromium Manifest V3 Browser Companion ("Save to Brain" v0.3.0)
│   ├── manifest.json                      # MV3 manifest (activeTab, scripting, storage)
│   ├── popup.html                         # Extension popup UI with scan metrics & token configuration
│   ├── popup.js                           # Active-tab DOM & GitHub repository scanner + context injector
│   ├── icons/                             # 16x16, 48x48, 128x128 extension icons
│   └── README.md                          # Companion setup, security, GitHub scanning & packaging guide
├── scripts/
│   ├── db-cli.ts                          # CLI for database backup (`db:backup`) and safe demo seeding (`db:seed-demo`)
│   └── package-extension.mjs              # Reproducible MV3 extension validator and ZIP packager (`package:extension`)
├── src/
│   ├── App.tsx                            # Root workspace layout, collapsible sidebar, view switching
│   ├── server/
│   │   └── brainBackend.ts                # SQLite migrations, backups, SHA-256 token auth, validation & API routes
│   ├── types/
│   │   └── brain.ts                       # Shared domain types (Fact, AISource, DuplicateDetectionState, etc.)
│   ├── services/
│   │   ├── brainStorage.ts                # Local-first state store, duplicate detection, durable persistence, export
│   │   ├── fileExtractor.ts               # Client-side parsers (.zip, .pdf, .docx, .xlsx, .pptx, .json, .md, .txt, .csv)
│   │   ├── semanticChunker.ts             # Semantic section parser, content normalizer & incremental diff engine
│   │   └── extensionScanner.ts            # Shared active-page & GitHub repository scanner with deduplication & metrics
│   └── components/
│       ├── CaptureHubModal.tsx            # 4-tab Capture Hub orchestrator (Companion, Import, Paste, Export)
│       ├── ImportReviewQueue.tsx          # Reusable review queue (per-item & bulk resolutions, progress, retry)
│       ├── InteractiveBrainGraph.tsx      # Force-directed neural graph canvas
│       ├── NodeInspector.tsx              # Slide-over node inspector with semantic sections & merge history
│       └── ...                            # Sidebar, search bar, activity log, and modals
└── tests/
    ├── captureHubImprovements.test.ts     # Duplicate detection, PDF extraction, title formatting & bulk review tests
    └── foundationAndCompanion.test.ts     # SQLite migrations, data preservation, token security, staging & scanner tests
```

---

## 2. SQLite Storage, Migrations & Backup Safety

### Database Location & Git Hygiene
- Runtime SQLite data is stored at `data/brain.db` (configured with `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, and `PRAGMA foreign_keys = ON`).
- Runtime database files (`data/*.db`, `data/*.db-wal`, `data/*.db-shm`, `data/*.bak`, `data/backups/`) are excluded in `.gitignore` so real user data and device token hashes are never committed.

### Schema & Repeatable Migrations
On startup (`initializeDatabase` in `src/server/brainBackend.ts`), Argon inspects the `schema_migrations` table and applies any pending versioned migrations inside transactions. If an existing database file requires migration, Argon automatically creates a timestamped backup in `data/backups/` before running migrations:
1. `001_initial_core_tables`: Creates `facts`, `companion_devices`, and `companion_captures`, plus indexes on `facts(brain, updated_at)` and `companion_captures(brain, created_at)`.
2. `002_facts_document_columns`: Ensures document-level columns (`file_type`, `tags_json`, `parent_id`, `is_document_root`, `is_unified_context_node`, `document_title`, `semantic_section_count`, `merge_history_json`) exist on older databases.
3. `003_companion_device_security`: Adds `token_hash` and `revoked_at` to `companion_devices`, migrates any legacy plaintext `token_value` into a SHA-256 `token_hash`, and scrubs `token_value = ''`.
4. `004_companion_captures_metadata`: Adds `device_id` and `scan_metrics_json` to `companion_captures`.

### Non-Destructive Seeding Rules
- Argon **never** deletes, resets, or overwrites existing user facts during startup.
- Demo seed facts are inserted **only** when initializing a genuinely brand-new database file (where no prior tables or records exist) and `BRAIN_SEED_DEMO` is not `'false'`.
- If a user deletes facts so that only 0, 1, or 2 records remain, restarting the server preserves that exact state without wiping or reseeding.
- To explicitly add missing demo facts into an existing database without touching user records, run:
  ```bash
  npm run db:seed-demo
  ```

### Backup & Restore Workflow
- **Create an on-demand backup**:
  ```bash
  npm run db:backup
  ```
  This flushes any active WAL frames into a clean snapshot at `data/backups/brain_backup_<timestamp>.db`.
- **Restore from a backup**:
  1. Stop the Argon server.
  2. Copy the desired backup file from `data/backups/brain_backup_<timestamp>.db` to `data/brain.db` (and remove any stale `data/brain.db-wal` / `data/brain.db-shm` files).
  3. Restart the server with `npm run dev`.

---

## 3. Capture Hub & `ImportReviewQueue` Workflow

The Capture Hub (`src/components/CaptureHubModal.tsx`) and `ImportReviewQueue` (`src/components/ImportReviewQueue.tsx`) implement the end-to-end pipeline:

```text
CAPTURE → EXTRACT → DETECT SOURCE / TYPE → DUPLICATE CHECK → REVIEW QUEUE → USER RESOLUTION → PERSIST → CONFIRM → IMPORTED
```

### Queue States
Each item transitions through explicit states:
- `extracting` → `ready` → `importing` / `processing` → `imported` | `skipped` | `error`
- **Persistence Guarantee**: An item is never marked `imported` until the backend (`POST /api/remember` or `POST /api/correct`) confirms durable persistence. If persistence fails, the item transitions to `error`, preserves its error message, leaves destination content untouched, and remains retryable.

### 5-State Duplicate Detection & Safeguards
| Duplicate State | Default Resolution | Safeguard |
| :--- | :--- | :--- |
| **New** (`new`) | `Create` | Creates a new node in the destination Brain. |
| **Exact duplicate** (`exact_duplicate`) | `Skip` | Normalized document body matches an existing node or earlier queued item (even across different filenames or ZIP paths). |
| **Possible duplicate** (`possible_duplicate`) | `Ask user` (`undecided`) | Matches file path, filename, or title with updated content; user chooses `Merge`, `Replace`, `Create`, or `Skip`. |
| **Related content** (`related_content`) | `Ask user` (`undecided`) | Shares substantial section overlap without full document equality; never misclassified as an exact duplicate. |
| **Unable to determine** (`unable_to_determine`) | `Ask user` (`undecided`) | **Merge and Replace are strictly blocked.** Never silently imported during batch operations. |

### Supported Client-Side Formats
- `.zip` archives (via `jszip`), `.pdf` (via local package worker in `pdfjs-dist`, with explicit diagnostics for malformed or scanned image-only PDFs), `.docx` (via `mammoth`), `.xlsx` (via `read-excel-file`), `.pptx` (slide XML extraction), `.json` (ChatGPT & Claude export schemas), `.md`, `.txt`, `.csv`, and images (`.png`, `.jpg`, `.webp`).

---

## 4. Browser Companion & Deliberate GitHub Scanning

### Device Token Security (`brn_live_...`)
1. Open **Capture Hub → 1. Browser Companion** and issue a device token.
2. The server generates a 24-byte cryptographic secret (`crypto.randomBytes(24)`) prefixed with `brn_live_`, stores **only** the SHA-256 `token_hash` and masked `token_prefix` in `companion_devices`, and returns the full token **once**.
3. The Browser Companion sends `Authorization: Bearer brn_live_...` on API requests. The server verifies the hash using `crypto.timingSafeEqual`, rejects revoked tokens immediately (`401 Unauthorized`), and updates `last_used_at` only after valid authentication.
4. All `/api/companion/*` endpoints require either a valid active Bearer device token or explicit local Capture Hub headers (`X-Brain-Local-Client: argon-capture-hub`), and device creation requires explicit enrollment intent (`X-Brain-UI-Intent: enroll-device`).

### Active-Page & GitHub Repository Scanning
Clicking **Stage Project / GitHub Repo to Review Queue** in the extension popup runs the scanner (`extension/popup.js` / `src/services/extensionScanner.ts`):
- **AI Workspaces (ChatGPT, Claude, Gemini)**: Captures visible project instructions, Claude Artifacts / ChatGPT Canvas blocks, expanded project knowledge documents, code blocks, and conversation turns.
- **Deliberate GitHub Repository Scanning (`https://github.com/<owner>/<repo>`)**:
  - Captures repository metadata (owner/repo, description, active branch, topics) and the visible repository file tree into `REPOSITORY_OVERVIEW.md`.
  - Captures visible `README.md` content.
  - Captures the currently open file when viewing a GitHub blob page (`/blob/<branch>/<path>`).
  - Fetches up to 6 readable text/code files listed in the visible repository tree using the user's existing browser session (`/raw/<branch>/<path>`).
  - Reports binary files (`.pdf`, `.png`, `.docx`, `.zip`, etc.), unrecognized extensions, or files beyond the per-pass scan budget in `unreachableResources` so nothing is silently dropped.
- **Deduplication & Scan Metrics**: Normalizes content signatures within each scan pass to prevent duplicate items, avoids silent content truncation, and displays scan counts (`discovered`, `captured`, `skipped`, `failed`) in the popup.

---

## 5. Extension Packaging & Browser Compatibility

Build a reproducible Chromium Manifest V3 extension archive with:

```bash
npm run package:extension
```

This validates `extension/manifest.json` and required assets, verifies that no `.db` or `.env` files are present, and outputs:
- `dist/extensions/the-brain-companion-chromium-v0.3.0.zip`
- `dist/extensions/the-brain-companion-chromium.zip`

| Browser Family | Status | Installation |
| :--- | :--- | :--- |
| **Chromium** (Chrome, Edge, Brave, Arc) | **Supported (Manifest V3)** | Load unpacked from `extension/` or unpack `dist/extensions/the-brain-companion-chromium-v0.3.0.zip` at `chrome://extensions` with Developer Mode enabled. |
| **Firefox** | **Manual Adaptation Required** | Uses Chromium `chrome.scripting` / MV3 action defaults; requires `browser_specific_settings.gecko` in `manifest.json` before Firefox add-on signing. |

---

## 6. Local Development, Testing & Verification

**Prerequisites**: Node.js `>=22.5.0 <25.0.0` (uses built-in `node:sqlite`) and npm `>=10.0.0`.

```bash
# Install dependencies cleanly from lockfile
npm ci

# Start local Express + Vite server (binds to 127.0.0.1:3000 by default)
npm run dev

# Run all unit and integration tests
npm test

# Type-check the TypeScript codebase
npm run lint

# Build production frontend bundle into dist/
npm run build

# Package the Browser Companion extension into dist/extensions/
npm run package:extension

# Create a safe SQLite backup in data/backups/
npm run db:backup
```

### Network Binding Configuration
By default, `server.ts` binds to `127.0.0.1` so the local API is not exposed on shared networks. To bind to all interfaces (`0.0.0.0`) for LAN or container preview access, set `BRAIN_ALLOW_LAN=true` or `BRAIN_HOST=0.0.0.0`.
