# Web AI Connector & Memory Bridge (100% Free Plan Architecture)

A zero-cost, web-native memory integration designed specifically for free-tier users across **ChatGPT Web**, **Gemini Web**, and **Claude Web**—requiring zero paid subscriptions (no ChatGPT Plus, no Claude Pro) and zero desktop applications.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Free-Tier Constraint Honored**: Features requiring paid subscriptions (such as creating Custom GPT Actions on ChatGPT Plus or Claude Projects on Claude Pro) are explicitly avoided or marked as optional paid alternatives. Everything in this plan works **100% free** on standard free-tier web accounts:

- **Confirmed Decision 1 (Zero-Cost Browser Extension Companion)**: The included browser extension (`extension/`) is the primary real-time connector. It runs directly inside `chatgpt.com`, `claude.ai`, and `gemini.google.com` on any Chromium browser (Chrome, Edge, Brave). With one click:
  - **"Inject Brain Memory"**: Automatically inserts your relevant Brain facts into the chat prompt box before sending.
  - **"Save to Brain"**: Scrapes the current chat dialogue and merges it into your local Brain database using deduplication and semantic chunking.
- **Confirmed Decision 2 (ChatGPT Free "Custom Instructions" Primer)**: ChatGPT Free includes a built-in "Custom Instructions" feature (`Settings → Personalization → Custom Instructions`). The Brain will generate an optimized, copy-ready prompt block that permanently grounds ChatGPT Free with your core context without requiring ChatGPT Plus.
- **Confirmed Decision 3 (Claude & Gemini Free Chat Primers)**: 1-click tailored context priming blocks for new chats in Claude Free and Gemini Free that instruct the AI how to recall your durable facts and format new decisions for easy saving.
- **Confirmed Decision 4 (In-App Interactive Memory Simulator)**: An embedded testing ground in The Brain where you can simulate two-way memory conversations (testing ChatGPT, Gemini, and Claude personas) and see facts retrieved and stored in real time.
- **Confirmed Decision 5 (Optional OpenAPI Action for Plus Users)**: We still retain the OpenAPI specification endpoint for users who might upgrade to ChatGPT Plus in the future, but it is placed in an "Advanced / Plus" tab so free users are never blocked or confused.

---

### 1. Overview & Core Concept

- **What It Does**: Enables free-tier web AI users to seamlessly connect their personal memory store to web chats without paying for Plus/Pro subscriptions or running desktop terminal tools.
- **Target Audience**: Users on free plans of ChatGPT (`chatgpt.com`), Gemini (`gemini.google.com`), and Claude (`claude.ai`) who want durable memory continuity across tools.
- **Key Value**: 100% free two-way context flow: push Brain memories into your web chats with one click, and capture valuable chat turns back into your Brain without manual file exporting.

---

### 2. User Experience & Visual Design

#### The Web Connection Hub (Modal & Workflow)
The bridge modal is re-engineered into an intuitive, free-tier focused hub:

1. **Tab 1: Chrome Extension Companion (Recommended & 100% Free)**:
   - Clear, friendly 3-step setup guide with visuals:
     1. Open `chrome://extensions` and enable *Developer mode*.
     2. Click *Load unpacked* and select the `extension` folder.
     3. Open any ChatGPT, Claude, or Gemini tab to use the 1-click **Inject** and **Save** buttons.
   - Live status badge indicating if the Brain web server is active and reachable by the extension (`http://localhost:8787` or dev server).

2. **Tab 2: ChatGPT Free Integration**:
   - **Method A: Custom Instructions (Permanent)**: 1-click copyable system instructions tailored for ChatGPT Free's `Settings → Personalization`.
   - **Method B: Dynamic Context Snapshot**: 1-click copy of current active brain facts with smart grounding prompt.
   - **Method C (Optional)**: Custom GPT OpenAPI schema if ever upgrading to ChatGPT Plus.

3. **Tab 3: Claude Free Integration**:
   - Step-by-step free-tier chat priming: copy formatted memory snapshot formatted for Claude's long-context window.
   - Extension shortcut to capture Claude answers directly into your brain nodes.

4. **Tab 4: Gemini Free Integration**:
   - Quick instructions for Gemini web chats and free System Prompts / Gems.
   - 1-click prompt primer.

5. **Tab 5: Live Free Simulator & Test Bench**:
   - Interactive chat simulator right inside The Brain interface.
   - Choose your target AI: `ChatGPT (Free)`, `Claude (Free)`, or `Gemini (Free)`.
   - Type queries to watch The Brain retrieve facts from SQLite (`/api/recall`), generate contextual answers, and automatically store new facts (`/api/remember`).
   - Gives the user complete confidence and clarity on how the entire system works before even opening external tabs.

#### Visual Design & Theme
- High-contrast celestial console theme (`#03040a` deep void, frosted glass cards `bg-white/[0.03]`, clean hairline borders `border-white/10`).
- Model-specific visual indicators:
  - ChatGPT: Subtle emerald accent (`#10a37f`).
  - Claude: Subtle warm terracotta accent (`#d97706`).
  - Gemini: Subtle celestial sky accent (`#38bdf8`).
- 100% Free Badges (`100% Free · No Subscription Required`) providing immediate peace of mind.
- Monospace tabular figures (`tabular-nums`) for technical paths and stats.

---

### 3. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Web AI Connector (Free Tier Focus)                   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           ▼                        ▼                        ▼
┌───────────────────────┐┌───────────────────────┐┌──────────────────────┐
│ Chrome Extension      ││ ChatGPT Free          ││ Claude & Gemini Free │
│ (100% Free Web Companion)││ Custom Instructions  ││ Prompt Context       │
│ • chatgpt.com Inject  ││ • Permanent Memory    ││ • Free Chat Primer   │
│ • claude.ai Inject    ││ • Context Priming     ││ • 1-Click Snapshot   │
│ • gemini.google Inject││ • 1-Click Sync        ││ • Direct Capture     │
└──────────┬────────────┘└──────────┬────────────┘└──────────┬───────────┘
           │                        │                        │
           └────────────────────────┼────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Brain Local Server & Storage                      │
│  • GET  /api/facts            (Retrieve current brain facts)           │
│  • GET  /api/recall           (FTS5 Keyword Search / Memory recall)    │
│  • POST /api/remember         (Deduplicated Unified Node Storage)      │
│  • POST /api/check_file       (Incremental Diff & Existing Node Check) │
│  • In-Memory / SQLite Sync    (brainStorage.ts + brain.db)             │
└────────────────────────────────────────────────────────────────────────┘
```

#### Key Technical Deliverables
1. **Enhanced Browser Extension (`extension/`)**:
   - Update `manifest.json` and `popup.js` to add an **"Inject Memory into Chat"** button that works on `chatgpt.com`, `claude.ai`, and `gemini.google.com`.
   - It targets the active chat input field (e.g. `#prompt-textarea` on ChatGPT, `div[contenteditable="true"]` on Claude/Gemini) and inserts the brain's context snapshot directly into the user's prompt.
   - Refine the **"Save to Brain"** conversation extractor to guarantee clean chat turn capture across all three web tools.

2. **Re-Architected Web Bridge Modal (`src/components/McpBridgeModal.tsx`)**:
   - Redesigned for web-only & free-tier users.
   - Clean tabbed interface: Extension Guide, ChatGPT Free, Claude Free, Gemini Free, Live Simulator, and Legacy Desktop MCP.
   - 1-click copy with instant feedback.
   - Live server connectivity indicator showing whether `localhost:8787` / local API is listening.

3. **Built-In Interactive Memory Simulator Component**:
   - Allows immediate testing within the web app without leaving the browser tab.
   - Shows step-by-step two-way memory recall and automatic saving.

4. **Free-Tier Documentation & Quick-Start Guides**:
   - Clear markdown instructions inside the modal and in `extension/README.md`.
