# The Brain — Central Memory System (Argon Architecture)

**One memory. Every AI you use.**

The Brain is a local-first, SQLite-backed personal and engineering memory system that unifies context across **Claude**, **ChatGPT**, **Google Gemini**, **GitHub**, **Cursor / Antigravity**, **Local AI / Ollama**, and **Moodle**.

---

## Core Capabilities

### 1. Deterministic Provenance & Multi-Format Ingestion (`src/services/fileExtractor.ts`)
- **Strict Source Attribution Precedence**:
  1. **Folder Path Provenance** (`01_claude` → `claude`, `02_chatgpt` → `gpt`, `03_gemini` → `gemini`, `04_github` → `github`, `05_moodle` → `moodle`, `06_cursor_antigravity` → `cursor`, `07_local_ai_ollama` → `local-ai`)
  2. **Explicit Document Metadata Header** (`Primary Source: ...`)
  3. **Explicit User Selection**
  4. **Filename Token Match**
  5. **Whole-Word Body Keyword Fallback** (never overrides folder path or explicit header)
- **Supported Formats**:
  - `.pdf` (page-by-page extraction via `pdfjs-dist` with scanned/low-text detection)
  - `.docx` (structured paragraphs and headings via `mammoth`)
  - `.xlsx`, `.xls`, `.csv` (multi-sheet tabular grid extraction + Markdown table conversion)
  - `.pptx` (slide-by-slide XML text and speaker notes extraction)
  - `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg` (image dimensions, SVG text, and honest metadata without fabricated OCR)
  - `.html`, `.htm`, `.json`, `.yaml`, `.yml`, `.md`, `.txt`, and source code (`.ts`, `.tsx`, `.py`, `.sql`, `.rs`, `.go`, `.sh`, etc.)
  - `.zip` and nested `.zip` archives (recursive unpacking up to 3 levels with file-count and byte-budget safety guards)

### 2. Neural Graph (`src/components/BrainViewerCanvas.tsx`)
- **Unified Relationship Model (`computeWorkspaceRelationships`)**:
  - **Source Relationships**: Connects Workspace Root → AI Source Hub → Primary Memories.
  - **Semantic Relationships**: Connects memories sharing normalized tags or `topicKey` with transparent similarity scores and explanations.
  - **Explicit Relationships**: Connects memories via `relatedSources`, `Fixture ID` cross-references, and document parent/child hierarchy.
- **Identical Relationships Across Layouts**: Switching between **Radial**, **Force**, and **Timeline** preserves the exact same underlying relationship graph.
- **Navigation & Filtering**: Fit-to-View (`Recenter`), `Root` focus, `Focus #ID`, edge-type filter pills (`All Edges`, `Source`, `Semantic`, `Explicit`), automatic cluster enclosures, and D3 knowledge density heat-map.

### 3. Full Workspace Search & 10-Mode Memory Ledger (`src/components/GlobalSearchBar.tsx`, `src/components/BrainView.tsx`)
- **Full Search**: Searches all workspace records across titles, content, `fileName`, `filePath`, `source`, `tags`, `fixtureId` (e.g., `BRAIN-GRAPH-ADD-091`), and `topicKey` with relevance ranking and zero artificial result truncation.
- **Memory Table**: Supports sorting by **Node ID**, **Recently Created**, **Recently Updated**, **Oldest First**, **Title / Filename**, **AI Source**, **Document Type**, **File Size**, **Content Length**, and **Search Relevance**, with **ASC / DESC** toggle, clickable column headers, and pagination (`25`, `50`, `100`, `Show All`).

### 4. Format-Aware Inspector & Document Viewers (`src/components/FactPanel.tsx`)
- **Provenance vs Relationships**: Clearly separates primary source provenance (`sourceFolder`, `filePath`, `checksum`, `importBatchId`, `originalCreatedAt` shown as `"Unknown"` when absent) from semantic and explicit graph relationships.
- **Format-Aware Viewers**: Interactive **Spreadsheet / CSV Table Grid**, **PDF Page Navigator**, **PPTX Slide Deck Viewer**, **Image Preview & Metadata Card**, **Syntax-Highlighted Code Viewer**, and **Markdown / DOCX Section Outline**.

### 5. SQLite Database, Client-Verified Binary Backup Export & External Restore (`src/server/brainBackend.ts`, `src/components/DatabaseSettingsView.tsx`)
- **Client-Verified `.db` Export**: Reads the binary backup stream in the browser, verifies the 16-byte `SQLite format 3\0` magic header and byte length before saving, and rejects HTML proxy/cookie-check pages with an explicit error.
- **External Backup Import & Restore (`Restore from External Backup`)**: Allows selecting any `.db` file from disk, inspects its SQLite header, schema tables, `PRAGMA integrity_check`, and record counts, creates an automatic pre-restore safety backup, and restores atomically with automatic rollback on failure.
- **Backup Retention & Cleanup**: Displays **Verified**, **Invalid**, and **Total** backup counts, supports deleting individual backups (while protecting the last known-good verified backup), and one-click cleanup of invalid backups.

### 6. Full-Page Activity Log & Provider-Neutral Spinal Cord Architecture
- **Activity Log**: Durable SQLite `activity_logs` table with search, category/status/source filters, expandable JSON diagnostics, automatic secret redaction, and **JSON / CSV export**.
- **AI Entities, Wormholes & Spinal Cord**: Provider-neutral entity registry (`AI_ENTITIES_REGISTRY`) and local-only Spinal Cord boundary (`127.0.0.1:3000`, LAN/remote exposure disabled).

---

## Running & Testing Locally

```bash
# Start full-stack server (bound to 127.0.0.1:3000)
npm run dev

# Run automated test suites
npm test

# Production build & typecheck
npm run build
npm run lint
```
