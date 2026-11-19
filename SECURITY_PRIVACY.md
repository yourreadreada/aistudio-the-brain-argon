# Local Security & Privacy Posture — The Brain (Argon)

This document describes the **verified, actual** local security and privacy behaviour of the Argon reference implementation. Every claim below can be checked live via `GET /api/security/posture` or **Settings → Local Security & Privacy Posture**.

---

## 1. Operating Mode: Local-First (Not Air-Gapped)

Argon distinguishes three operating modes:

- **Local-First (Current Argon Mode):** All Brain workspaces, memories, provenance metadata, activity logs, settings, and SQLite backups are stored and processed locally on your device. However, optional external features and web font stylesheets may still make outbound network calls when online.
- **Offline-Capable:** Core workflows (reading, searching, importing local files/ZIPs, inspecting nodes, creating/restoring SQLite backups, and running Desktop stdio MCP) work without an internet connection, falling back to system fonts and deterministic local logic.
- **Air-Gapped (Not Yet Certified):** Requires zero outbound network traffic at runtime (locally bundled fonts, hard-disabled external APIs, and verified network isolation). **Argon is NOT currently certified as air-gapped.**

---

## 2. Encryption at Rest (Verified Honestly)

- **Status:** **Unencrypted standard SQLite (`node:sqlite` / `DatabaseSync`)**.
- On disk, `data/brain.db`, its WAL/SHM sidecars (`brain.db-wal`, `brain.db-shm`), and `.db` backup snapshots use standard plaintext `SQLite format 3\0` files.
- Application-level database encryption (such as SQLCipher) is **not** enabled.
- **Recommended protection:** Enable OS full-disk encryption (**macOS FileVault**, **Windows BitLocker**, or **Linux LUKS**) and keep database/backup files restricted to owner-only permissions (`0600` for files, `0700` for the backup directory). Argon automatically enforces `0600`/`0700` on POSIX systems during database initialization and backup creation, and exposes a one-click **Enforce 0600 Permissions** action in Settings (`POST /api/security/harden-permissions`).

---

## 3. What Stays On-Device vs. What Leaves the Device

| Surface | Stays On-Device | Leaves Device |
| --- | --- | --- |
| **SQLite Database, Backups & Local Search** | All Brains, facts, provenance, tags, settings, audit logs, and `.db` backups stay on local disk (`data/brain.db`). | Nothing. |
| **Local HTTP API (`127.0.0.1:3000`) & Desktop stdio MCP** | Server binds strictly to loopback (`127.0.0.1`). Desktop stdio MCP communicates over local stdin/stdout pipes. | Nothing from Argon itself. If you connect a cloud-backed desktop AI client (e.g., Claude Desktop or Cursor) to stdio MCP, any recalled memories returned to that client are sent by that client to its model provider. |
| **Local AI / Ollama Exports (`07_local_ai_ollama`)** | Parsed and persisted locally in SQLite without calling any remote LLM. | Nothing during import or recall. Using `07_local_ai_ollama` does not automatically disable Google Fonts or an optional `GEMINI_API_KEY` elsewhere in the app. |
| **Browser Companion Extension** | Captures are sent directly from your browser to `http://127.0.0.1:3000/api/companion/capture` using a SHA-256-verified device token. | Clicking **Inject Memory** on `chatgpt.com`, `claude.ai`, or `gemini.google.com` submits the injected prompt text to that web AI provider. |
| **Optional `/api/chat` (`GEMINI_API_KEY`)** | When `GEMINI_API_KEY` is unset, `/api/chat` runs a deterministic local-only recall response with zero external calls. | When `GEMINI_API_KEY` is configured in the server environment, calling `/api/chat` sends the prompt and up to 5 recalled facts from the active Brain to Google Gemini API. |
| **UI Web Fonts (`index.html`)** | No personal facts or memory content are sent. | Loading the web UI while online requests `Plus Jakarta Sans` and `JetBrains Mono` from `fonts.googleapis.com` / `fonts.gstatic.com`. |

---

## 4. Credentials, Tokens & Log Redaction

- **Browser Companion Device Tokens (`brn_live_*`):** Generated cryptographically (`crypto.randomBytes`), displayed once at pairing, and stored in SQLite **only as SHA-256 hashes** (`token_hash`). Plaintext token columns are cleared and verified (`plaintextTokenRowsDetected === 0`). Revoking a device immediately invalidates its Bearer token.
- **API Keys (`GEMINI_API_KEY`):** Read exclusively from server process environment variables (`.env`), never stored in SQLite or browser `localStorage`, and never returned by API endpoints.
- **Log Redaction:** `redactSecrets()` scrubs Bearer tokens, `brn_live_*`, API keys (`sk-*`, `AIza*`, `ghp_*`), passwords, and secret fields before writing to `activity_logs` or exporting JSON/CSV audit logs.

---

## 5. Deletion, Retention & Export Semantics

- **Deletion:** Deleting a fact or Brain deletes the active SQLite rows immediately. Historical snapshots in `data/backups/*.db` retain prior copies until pruned or explicitly deleted, and WAL frames remain until SQLite checkpoints (`PRAGMA wal_checkpoint(TRUNCATE)`).
- **Backup Retention:** Retention pruning preserves at least one verified known-good backup at all times and refuses to delete the last valid snapshot.
- **Portable Exports vs. SQLite Backups:**
  - Portable exports (`.brain.json`, `.brain.md`, `.brainpack.zip`) redact detected API keys/tokens and exclude `private`/`secret`-tagged memories by default.
  - SQLite `.db` backups are exact binary copies intended solely for disaster recovery.
