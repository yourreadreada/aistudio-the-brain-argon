# brain

A local, multi-source memory that follows you across AI tools — so you stop
re-explaining the same project, the same topic, the same coding style to
Claude, GPT, Gemini, and whatever else, every time you switch.

This is **V1**: the smallest version of the idea that actually works end to
end. It does one thing — store facts, search them, correct them, and hand
them to any MCP-compatible AI tool — and does it locally, with nothing to
host and nothing to maintain.

## What's in V1

- **One local SQLite file** (`data/brain.db`) holds everything. No server to
  run, no account to create.
- **Brains are just a tag.** Call `remember(brain="coding", ...)` and a
  "coding" brain exists. Call it with `brain="college"` elsewhere and now
  there are two. Nothing to configure up front.
- **Full-text search** (SQLite FTS5) so `recall()` can actually find the
  relevant fact instead of returning everything.
- **Every fact remembers its source** (`claude`, `gpt`, `github`, `moodle`,
  whatever you tag it with), so you can always trace where something came
  from — the "receipts" idea.
- **Correction built in.** Any fact can be fixed with `correct(id, new text)`
  — either by telling the AI in conversation ("no, that's wrong, it's
  actually X" — the AI calls the tool for you) or by querying `recall()` /
  `list_facts()` yourself to see the ids and editing directly.
- **An ingest script** for bulk-loading files: drop markdown chat exports,
  PDFs, DOCX, XLSX or PPTX into `exports/<source-name>/` and run one command.

## What's deliberately NOT in V1

- **No acting.** Every tool here is read/write to *your own memory*, not to
  Gmail, Slack, GitHub, etc. The "read-first, act-second" idea means acting
  comes later, opt-in, per tool — not in the foundation.
- **No Moodle/Drive/GitHub live connectors.** Those are real integrations
  (OAuth, APIs) that deserve their own pass. V1 proves the core loop with
  manually-fed data first.
- ~~No color-coded UI~~ — added: `brain.web` now serves a live viewer with
  per-source clusters and click-to-correct.
- **No smart extraction.** Ingest just chunks raw text — it doesn't ask an
  LLM to pull out "the facts that matter." That's a good next upgrade, not a
  V1 requirement.

## Setup

```bash
cd brain
python3 -m venv .venv
./.venv/bin/pip install -e .
```

## Running it

As an MCP server (stdio transport — this is what Claude Desktop / Claude
Code will launch):

```bash
./.venv/bin/python -m brain.server
```

To connect it to **Claude Desktop** or **Claude Code**, add it to your MCP
config (usually `claude_desktop_config.json` or the equivalent for Claude
Code):

```json
{
  "mcpServers": {
    "brain": {
      "command": "/absolute/path/to/brain/.venv/bin/python",
      "args": ["-m", "brain.server"]
    }
  }
}
```

Restart the client, and it'll have four tools available: `remember`,
`recall`, `correct`, `forget`, and `list_brains`.

## Viewing and correcting it

Two viewers now exist, both reading/writing the same `brain.db` through the
same backend:

**Simple built-in viewer** — the per-source network visualization, no
install beyond the backend itself:

```bash
./.venv/bin/python -m brain.web
```

Open `http://localhost:8787`. Each AI source gets its own cluster around a
central hub, every fact is a node, click one to edit (`correct()`) or delete
(`forget()`) it.

**Full frontend** — a much more complete React app living in this same
repo (`src/components/`, `src/services/`, alongside `src/brain/`): pan/zoom
graph view, list view, global search, tags, a recent-activity log, an
"Add fact" / "Ingest" flow (now with its own client-side file extraction
for PDF/XLSX — see `src/services/fileExtractor.ts`), and an MCP-bridge
panel that generates the exact Claude Desktop config for `brain.server`.
This one started life as an AI Studio prototype that was explicitly built
to replicate another product's look — it's been cleaned of that branding
and copy, and its storage layer (`src/services/brainStorage.ts`) talks to
this same Python backend (`brain.web`'s API) instead of the browser's
local storage, so this view, the simple viewer above, and the MCP server
all see identical data. Tags and the recent-activity log are still a
local-only convenience layer for now (not yet in the Python schema) — see
"Where this goes next."

To run it:

```bash
# terminal 1 — the backend, serves the API everything else talks to
./.venv/bin/python -m brain.web

# terminal 2 — the frontend (run from the repo root)
npm install --legacy-peer-deps   # the pinned vite version needs this flag
npm run dev
```

Open the Vite dev server URL it prints (usually `http://localhost:3000`).
If the backend runs on a different host/port, copy `.env.local.example` to
`.env.local` and set `VITE_BRAIN_API_URL` accordingly.

## Bulk-importing your actual chat history

Claude.ai and ChatGPT both let you export your entire account's conversation
history in one shot — Claude: Settings → Privacy → Export data; ChatGPT:
Settings → Data controls → Export data. Both email you a zip. Point this at
it and it goes straight into the brain, no manual per-chat copying:

```bash
./.venv/bin/python -m brain.import_export --platform claude --zip export.zip --brain coding
./.venv/bin/python -m brain.import_export --platform chatgpt --zip export.zip --brain coding
```

Each conversation becomes one fact, source tagged `claude`/`gpt`, and
re-running it after a fresh export only adds what's new or changed — same
dedup/merge behavior as the file ingest path. Built against each platform's
current export shape (Claude: a flat list of conversations; ChatGPT: a
branching tree of message nodes, since regenerated replies create
branches — this follows the main branch only). These formats aren't
guaranteed stable across platform updates; if a run errors out, it's most
likely a changed field name, not a logic bug.

## Capturing new chats as you go

The bulk import above handles catching up on history. For every
conversation *after* that, there's `extension/` — a browser extension with
one button: save the chat you're currently looking at (Claude, ChatGPT, or
Gemini) straight into the brain. No export, no file. See
`extension/README.md` for loading it and — importantly — for the one part
of it that's an unverified best guess (the per-site selectors that find
each message on the page).

## Loading files in — chats, and now college material

Supported file types: `.md`, `.txt`, `.pdf`, `.docx`, `.xlsx`, `.pptx`.
Anything else in a source folder is skipped with a note, not an error.
Each format's text layer gets extracted, and any embedded images (a
scanned page, a diagram, a photo of a whiteboard) get OCR'd too — so text
*inside* an image isn't invisible to the brain. OCR only reads text that's
actually in the image; it won't describe a chart's shape or what's in a
photo, and handwriting recognition is hit-or-miss. Tables come through as
pipe-separated rows, each PDF page / sheet / slide becomes its own chunk
boundary. See `extract.py` for exactly what each format does.

OCR needs the Tesseract binary installed on your system (not just the pip
package) — `sudo apt install tesseract-ocr` on Debian/Ubuntu, `brew install
tesseract` on macOS. Without it, everything else still works; image text
just won't get picked up.

1. Sort files into one folder per source — same idea whether it's an AI
   chat export or a Moodle download:

   ```
   exports/
     claude/
       project-x-planning.md
     gpt/
       project-x-debugging.md
     moodle/
       syllabus.pdf
       assignment-3.docx
       marks.xlsx
       lecture-12.pptx
   ```

2. Run:

   ```bash
   ./.venv/bin/python -m brain.ingest --source-dir ./exports --brain coding
   ```

   Everything gets extracted, chunked into facts, tagged with the folder
   name as its source (`claude`, `gpt`, `moodle`, ...), and stored in the
   brain you named. Run it again with `--brain college` for a different
   export set — e.g. point it at a `moodle/` folder full of downloaded
   course material.

## Project layout

This is one repo — Python backend and React frontend sit side by side
under `src/`, not split into separate projects:

```
src/
  brain/              # Python backend
    db.py             # SQLite storage, full-text search, file dedup/merge
    server.py         # MCP server — the tools an AI can call
    ingest.py         # bulk-load files (md/txt/pdf/docx/xlsx/pptx)
    extract.py        # per-format text + OCR extraction used by ingest.py
    import_export.py  # parse official Claude/ChatGPT export zips directly in
    web.py             # local API + the simple built-in viewer below
    static/
      index.html      # the simple viewer, wired to real data
  components/         # the full React app's UI
  services/
    brainStorage.ts   # talks to brain.web's API (not localStorage)
    fileExtractor.ts  # client-side PDF/XLSX/etc. extraction for the Ingest modal
    semanticChunker.ts
extension/            # "Save to Brain" browser extension (see its own README)
data/
  brain.db            # created on first run, gitignore this
requirements.txt       # Python deps
pyproject.toml
package.json            # frontend deps
```

## Where this goes next

Roughly in order of what'd matter most:

1. **Try it for real** — connect the MCP server to Claude, bulk-import a
   real export, see where `recall()` actually falls short (probably: still
   some awkward fragments on the file-ingest path even with semantic
   sectioning; worth an LLM pass to extract cleaner facts before storing).
2. **Fix the extension's selectors against the real, live sites** — see
   `extension/README.md`. This is the one piece that couldn't be verified
   end to end while building it.
3. **More live connectors** (GitHub, Moodle, Drive) using
   read-first/act-second, same pattern as the chat-export parsers.
4. **Give tags and recent-activity a real backend home** — right now
   `src/services/brainStorage.ts` keeps those local-only (localStorage)
   since the Python schema has no columns for them yet. If they turn out
   to matter day to day, add a `tags` column and an `activity` table to
   `db.py` and move them over.
5. **Real image understanding, not just OCR** — a vision model call per
   embedded image (what's actually in a chart, a photo, a diagram) would
   go beyond reading text-in-images, at the cost of an API call per image.
   Worth it once OCR's limits actually start showing up, not before.
