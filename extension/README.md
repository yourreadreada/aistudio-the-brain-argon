# The Brain Web AI Companion (Chrome / Edge / Brave Extension)

**100% Free Plan Compatible** — Connects your local Brain memory directly to web-based AI chats and project workspaces without requiring paid API tiers or cloud dependencies.

Works seamlessly on:
- **ChatGPT Web & Projects** (`https://chatgpt.com`)
- **Claude Web, Projects & Artifacts** (`https://claude.ai`)
- **Gemini Web** (`https://gemini.google.com`)
- **GitHub Repositories & Docs** (`https://github.com`)

---

## What It Does

1. **Inject Brain Memory into Chat**: Fetches durable facts from your chosen brain (e.g., `coding`, `college`, `personal`) and injects them directly into the chat prompt box with proper grounding instructions before you send your message.
2. **Stage Project & Resources to Review Queue**: Scans the active browser tab for **project instructions**, **Claude Artifacts / ChatGPT Canvas blocks**, **open project documents**, **code blocks**, and **conversation turns**, and stages them with full provenance into the Capture Hub **Import Review Queue** (`/api/companion/captures`) so you can review duplicates and choose Create, Merge, Replace, or Skip.
3. **Quick-Save Current Web Chat**: Scrapes the conversation dialogue from the active tab and saves/merges it directly into your brain database.
4. **Copy Context Snapshot**: Copies a formatted context snapshot to your clipboard for quick manual pasting anytime.

### Browser Security & Attachment Boundaries
- Readable text rendered in the active page DOM (project instructions, open document panels, artifacts, code snippets, and chat messages) is captured automatically with its source and provenance URL.
- Closed or binary-only attachment chips (e.g., unexpanded `.pdf`, `.docx`, `.xlsx`, or `.zip` cards that only render a filename badge in the DOM) are explicitly reported in the extension popup so you can download and drop them into **Capture Hub → Import & Review**.

---

## 3-Step Setup (Takes 30 seconds)

1. **Start The Brain Server**:
   ```bash
   npm run dev
   ```
   (Runs locally on `http://localhost:3000` with zero cloud dependencies).

2. **Load the Extension into Chrome / Edge / Brave**:
   - In your browser, open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
   - Enable **Developer mode** toggle in the top right corner.
   - Click the **Load unpacked** button (top left).
   - Select this `extension/` folder.

3. **Start Using It**:
   - Pin "The Brain" icon to your browser toolbar.
   - Open any project or conversation on **chatgpt.com**, **claude.ai**, **gemini.google.com**, or **github.com**.
   - Click the extension icon:
     - Click **Inject Brain Memory into Chat** to prime your chat with past context.
     - Click **Stage Project & Resources to Review Queue** to send project docs, artifacts, code blocks, and conversation context into the Capture Hub Review Queue.
