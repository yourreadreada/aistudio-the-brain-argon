# The Brain (Argon — Local-First Reference Implementation)

**The Brain** is a source-aware, persistent personal context and memory layer designed to sit between you and the AI tools and codebases you work with.

> **Connect the Brain once → work across different AI tools → carry context and memory between them.**

This repository (`yourreadreada/aistudio-the-brain-argon`) is the **Argon** local-first reference implementation of The Brain. Its purpose is to validate behavior, data contracts, local SQLite storage, consistent backup/restore workflows, multi-format capture workflows, duplicate-safe review queues, and Browser Companion tooling before proven patterns are adapted to the cloud-based GPT production build.

---

## 1. Current Argon Architecture

Argon combines a React 19 + TypeScript + Vite frontend with a local Express + Node SQLite (`node:sqlite`) backend and a Manifest V3 Browser Companion extension:

```text
/
├── server.ts                              # Express entry point (binds strictly to 127.0.0.1) + Vite middleware
├── package.json                           # Dependencies, build, test, DB, and extension packaging scripts
├── .env.example                           # Environment variable template (BRAIN_DB_PATH, BRAIN_SEED_DEMO, etc.)
├── extension/                             # Chromium Manifest V3 Browser Companion ("Save to Brain" v0.3.0)
│   ├── manifest.json                      # MV3 manifest (activeTab, scripting, storage)
│   ├── popup.html                         # Extension popup UI with scan metrics & token configuration
│   ├── popup.js                           # Active-tab DOM & GitHub repository scanner + context injector
│   ├── icons/                             # 16x16, 48x48, 128x128 extension icons
│   └── README.md                          # Companion setup, security, GitHub scanning & packaging guide
├── scripts/
│   ├── db-cli.ts                          # CLI for consistent backup, listing, restore & non-destructive demo seed
│   └── package-extension.mjs              # Reproducible MV3 extension validator and ZIP packager (`package:extension`)
├── src/
│   ├── App.tsx                            # Root workspace layout, collapsible sidebar, view switching
│   ├── server/
│   │   └── brainBackend.ts                # SQLite init/migrations, VACUUM INTO backups, staged restore, token auth & API
│   ├── types/
│   │   └── brain.ts                       # Shared domain types (Fact, AISource, DuplicateDetectionState, etc.)
│   ├── services/
│   │   ├── brainStorage.ts                # Local-first state store, duplicate detection, durable persistence, DB API client
│   │   ├── fileExtractor.ts               # Client-side parsers (.zip, .pdf, .docx, .xlsx, .pptx, .json, .md, .txt, .csv)
│   │   ├── semanticChunker.ts             # Semantic section parser, content normalizer & incremental diff engine
│   │   └── extensionScanner.ts            # Shared active-page & GitHub repository scanner with deduplication & metrics
│   └── components/
│       ├── DatabaseSettingsView.tsx       # Database & Backup Settings view (status, snapshot, retention, export, restore)
│       ├── CaptureHubModal.tsx            # 4-tab Capture Hub orchestrator (Companion, Import, Paste, Export)
│       ├── ImportReviewQueue.tsx          # Reusable review queue (per-item & bulk resolutions, progress, retry)
│       ├── InteractiveBrainGraph.tsx      # Force-directed neural graph canvas
│       ├── NodeInspector.tsx              # Slide-over node inspector with semantic sections & merge history
│       └── ...                            # Sidebar, search bar, activity log, and modals
└── tests/
    ├── captureHubImprovements.test.ts     # Duplicate detection, PDF extraction, title formatting & bulk review tests
    ├── foundationAndCompanion.test.ts     # SQLite migrations, data preservation, token security, staging & scanner tests
    └── databaseBackupRestore.test.ts      # Init, migration rollback, VACUUM INTO backups, retention, restore & Settings API tests
```

---

## 2. SQLite Storage, Initialization, Consistent Backup & Staged Restore

### Database Location & Git Hygiene
- Runtime SQLite data is stored at `data/brain.db` (configured with `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, and `PRAGMA foreign_keys = ON`).
- Runtime database files (`data/*.db`, `data/*.db-wal`, `data/*.db-shm`, `data/*.bak`, `data/backups/`) are excluded in `.gitignore` so real user data and device token hashes are never committed.

### Safe Initialization & Atomic Versioned Migrations
On startup (`initializeDatabase` in `src/server/brainBackend.ts`):
1. **Header & Integrity Check**: If `data/brain.db` already exists and is non-empty, Argon verifies its 16-byte SQLite header (`SQLite format 3\0`) and runs `PRAGMA integrity_check` before executing any migrations. Malformed or corrupted files are immediately rejected without overwriting or truncating user data.
2. **Pre-Migration Consistent Backup**: When an existing database has user tables and pending schema migrations, Argon creates a verified SQLite-consistent backup (`kind: 'pre-migration'`) in `data/backups/` before applying migrations.
3. **Ordered Transactional Migrations**: Pending migrations (`001_initial_schema` through `004_companion_captures_hardening`) run in version order inside individual `BEGIN IMMEDIATE ... COMMIT` transactions. If a migration fails, `ROLLBACK` is executed immediately so the database is never left in a partially migrated state.

### Non-Destructive Seeding Rules
- Argon **never** deletes, resets, or overwrites existing user facts during startup.
- Demo seed facts are inserted **only** when initializing a genuinely brand-new database file (where no prior tables, metadata, or records exist) and `BRAIN_SEED_DEMO` is not `'false'`.
- Explicit non-destructive demo seeding is opt-in via `npm run db:seed-demo` or `BRAIN_SEED_DEMO=true`.

### SQLite-Consistent Backup (`VACUUM INTO`) & Verification
Rather than performing a raw `fs.copyFileSync` of a live WAL database file, Argon creates backups (`createConsistentBackup`) using SQLite's native snapshot mechanism:
1. **Temporary Staging Snapshot**: Executes `VACUUM INTO '<backupDir>/.staging_brain_backup_<id>.db.tmp'` on the SQLite connection, producing a self-contained, transactionally consistent single-file snapshot even while the database is open and in use.
2. **Integrity Verification**: Opens the staged `.tmp` file and verifies:
   - Valid 16-byte SQLite header (`SQLite format 3\0`)
   - `PRAGMA integrity_check` returns `'ok'`
   - `PRAGMA foreign_key_check` returns zero violations
   - Core Argon tables (`app_metadata`, `schema_migrations`, `facts`, `companion_devices`, `companion_captures`) exist.
3. **Unique Naming & Atomic Promotion**: Allocates a unique timestamped filename (`brain_backup_<ISO>_<rand>.db`) that never overwrites an existing backup, atomically renames the verified `.tmp` file to the final `.db` filename, and writes a `.meta.json` sidecar recording creation time, byte size, verification status, schema version, facts count, and backup kind (`manual`, `pre-migration`, or `pre-restore-safety`).
4. **Incomplete Backup Cleanup**: If a backup fails or is interrupted at any point, the `.tmp` staging file is removed in `finally` and never listed as a valid backup.
5. **Retention Policy**: Configurable maximum verified backups to retain (`maxBackups`, default `10`, range `1–100`). Pruning removes the oldest backups beyond `maxBackups` while **never** deleting the last known-good (`verified: true`) backup.

### Safe Staged Restore & Automatic Rollback
Restoring from a backup (`restoreDatabaseFromBackup` / `POST /api/database/restore`) follows a multi-step safety protocol:
1. **Candidate Validation**: Validates the selected backup file using `verifyDatabaseFileIntegrity`. Corrupted or non-Argon files are rejected before touching the live database.
2. **Automatic Pre-Restore Safety Backup**: Creates and verifies a `pre-restore-safety` snapshot of the current live database in `data/backups/`. If the safety backup cannot be verified, the restore aborts immediately.
3. **Staging & Schema Upgrade**: Stages the selected backup into a temporary file via `VACUUM INTO`, applies any pending schema migrations so older backups remain forward-compatible, and runs `PRAGMA integrity_check` on the staged database.
4. **Transactional Apply & Post-Restore Verification**: Transfers the verified staged state inside an atomic `BEGIN IMMEDIATE ... COMMIT` transaction, runs `PRAGMA wal_checkpoint(TRUNCATE)`, and verifies `PRAGMA integrity_check` on the live database.
5. **Automatic Rollback on Failure**: If any error occurs during apply or post-restore verification, Argon rolls back the transaction and restores the live database from the `pre-restore-safety` backup so user data is never lost or left corrupted.

### CLI Database Commands
```bash
# Create a verified SQLite-consistent backup in data/backups/
npm run db:backup

# List all backups in data/backups/ with verification metadata
npm run db:backup -- list-backups

# Restore from a specific verified backup (creates automatic pre-restore safety backup first)
npm run db:backup -- restore <backupFileName.db>

# Non-destructively add missing demo facts without modifying existing user records
npm run db:seed-demo
```

---

## 3. Settings Page — Database & Backup Controls

Accessed from the left sidebar under **Workspace View → Settings** (using the gear icon, with tooltip support when collapsed and no duplicate Settings button in the top application header), `src/components/DatabaseSettingsView.tsx` provides functional database and backup controls backed by `/api/database/*`:
- **Live SQLite Database Status**: Displays health status, database location (`data/brain.db`), SQLite engine & WAL journal mode, schema version, `PRAGMA integrity_check` status, total facts, workspaces count, and file size.
- **Backup Storage & Retention Controls**: Displays backup directory (`data/backups/`), verified backup count, latest backup timestamp, and an interactive retention limit (`1–100` verified backups) with **Apply Retention** (never deleting the last known-good backup).
- **Create Backup**: Captures a new verified SQLite snapshot (`POST /api/database/backups`) and refreshes the backup list.
- **Available Backups List**: Shows each backup's filename, kind badge (`Manual Snapshot`, `Pre-Migration`, `Pre-Restore Safety`), verification badge (`Verified (ok)` / `Invalid`), creation timestamp, byte size, schema version, and facts count.
- **Export Backup**: Downloads any verified `.db` backup file directly to the user's machine (`GET /api/database/backups/:fileName/download`).
- **Restore with Confirmation**: Opens an explicit confirmation step detailing the target backup and automatic `pre-restore-safety` backup before executing `POST /api/database/restore`.

---

## 4. Capture Hub & `ImportReviewQueue` Workflow

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

## 5. Browser Companion & Deliberate GitHub Scanning

### Device Token Security (`brn_live_...`)
1. Open **Capture Hub → 1. Browser Companion** and issue a device token.
2. The server generates a cryptographic secret prefixed with `brn_live_`, stores **only** the SHA-256 `token_hash` and masked `token_prefix` in `companion_devices`, and returns the full token **once**.
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

## 6. Extension Packaging & Browser Compatibility

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

## 7. Local Development, Testing & Deferred LAN Scope

**Prerequisites**: Node.js `>=22.5.0 <25.0.0` (uses built-in `node:sqlite`) and npm `>=10.0.0`.

```bash
# Install dependencies cleanly from lockfile
npm ci

# Start local Express + Vite server (binds strictly to 127.0.0.1:3000)
npm run dev

# Run all unit and integration tests
npm test

# Type-check the TypeScript codebase
npm run lint

# Build production frontend bundle into dist/
npm run build

# Package the Browser Companion extension into dist/extensions/
npm run package:extension

# Create a verified SQLite-consistent backup in data/backups/
npm run db:backup
```

### Network Binding & Deferred LAN / Remote Access
Argon is strictly local-only in this phase: `server.ts` binds exclusively to `127.0.0.1`. LAN and remote network exposure (`0.0.0.0` binding and LAN Settings controls) are intentionally deferred and not exposed in the server or Settings UI.

