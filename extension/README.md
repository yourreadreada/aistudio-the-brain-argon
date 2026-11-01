# The Brain Web AI Companion (Chrome / Edge / Brave Extension)

**100% Free Plan Compatible** — Connects your local Brain memory directly to web-based AI chats without requiring ChatGPT Plus, Claude Pro, or desktop software.

Works seamlessly on:
- **ChatGPT Web** (`https://chatgpt.com`)
- **Claude Web** (`https://claude.ai`)
- **Gemini Web** (`https://gemini.google.com`)

---

## What It Does

1. **Inject Brain Memory into Chat**: Fetches durable facts from your chosen brain (e.g., `coding`, `college`, `personal`) and injects them directly into the chat prompt box with proper grounding instructions before you send your message.
2. **Save Current Web Chat to Brain**: Scrapes the conversation dialogue from the active tab and automatically saves/merges it into your brain database using intelligent incremental deduplication.
3. **Copy Context Snapshot**: Copies a formatted context snapshot to your clipboard for quick manual pasting anytime.

---

## 3-Step Setup (Takes 30 seconds)

1. **Start the Brain Web API**:
   ```bash
   python -m brain.web
   ```
   (Runs locally on `http://localhost:8787` with zero cloud dependencies).

2. **Load the Extension into Chrome / Edge / Brave**:
   - In your browser, open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
   - Enable **Developer mode** toggle in the top right corner.
   - Click the **Load unpacked** button (top left).
   - Select this `extension/` folder.

3. **Start Using It**:
   - Pin "The Brain" icon to your browser toolbar.
   - Open any conversation on **chatgpt.com**, **claude.ai**, or **gemini.google.com**.
   - Click the extension icon:
     - Click **Inject Brain Memory into Chat** to prime your chat with past context.
     - Click **Save Current Web Chat to Brain** to store key insights into your brain.
