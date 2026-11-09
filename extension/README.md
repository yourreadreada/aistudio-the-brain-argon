# The Brain Browser Companion (`extension/` · v0.3.0)

Local-first Chromium Manifest V3 extension that connects **ChatGPT**, **Claude**, **Gemini**, and **GitHub Repositories** to your local **The Brain (Argon)** instance.

---

## Supported Hosts & Capabilities

- **ChatGPT Web & Projects** (`https://chatgpt.com/*`) — Inject Brain memory into prompt, quick-save chat transcripts, or stage project instructions, Canvas blocks, code snippets, and conversations into the Review Queue.
- **Claude Web, Projects & Artifacts** (`https://claude.ai/*`) — Inject Brain memory into prompt, quick-save chat transcripts, or stage project instructions, Claude Artifacts, expanded project documents, code blocks, and conversations.
- **Google Gemini Web** (`https://gemini.google.com/*`) — Inject Brain memory into prompt, quick-save chat transcripts, or stage conversation turns and code snippets.
- **GitHub Repositories** (`https://github.com/*`) — Deliberate repository scanning:
  - Captures repository overview (`REPOSITORY_OVERVIEW.md`) with description, branch, topics, and visible file tree listing.
  - Captures visible `README.md` documentation.
  - Captures open source file content on `/blob/<branch>/<path>` views.
  - Fetches up to 6 readable source/documentation files from the visible repository file tree via the active browser session.
  - Explicitly reports binary files (`.pdf`, `.png`, `.zip`, `.docx`, etc.) and unscanned files in the popup notice rather than silently dropping them.

---

## Security & Device Token Pairing (`brn_live_...`)

1. Start the local Argon server:
   ```bash
   npm run dev
   ```
2. In the Argon web UI (`http://localhost:3000`), open **Capture Hub → 1. Browser Companion**.
3. Under **Device Token Management**, enter a label (e.g., `MacBook Chrome`) and click **Issue Device Token**.
4. Copy the generated `brn_live_...` token immediately (it is shown only once; the server stores only its SHA-256 hash).
5. Open the Browser Companion extension popup, set **The Brain Local Server URL** to `http://localhost:3000`, and paste your `brn_live_...` token into **Device Token**.
6. You can revoke or delete any device token at any time from **Capture Hub → 1. Browser Companion**; revoked tokens are rejected immediately (`401 Unauthorized`).

---

## Installation & Packaging

### Option A: Load Unpacked (Development)
1. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this `extension/` directory.

### Option B: Build Distributable ZIP Archive
Run the packaging script from the repository root:
```bash
npm run package:extension
```
This validates `extension/manifest.json` (Manifest V3) and all required assets, and writes:
- `dist/extensions/the-brain-companion-chromium-v0.3.0.zip`
- `dist/extensions/the-brain-companion-chromium.zip`

### Browser Compatibility
- **Chromium Browsers (Chrome, Edge, Brave, Arc)**: Fully supported via Manifest V3 (`activeTab`, `scripting`, `storage`).
- **Firefox**: Requires adding `browser_specific_settings.gecko` to `manifest.json` if packaging for Firefox Add-ons (`about:debugging`).
