# The Brain — Argon Roadmap

**Last consolidated:** 19 November 2026  
**Document type:** Living implementation roadmap — not a sprint commitment

**Repository:** `yourreadreada/aistudio-the-brain-argon`  
**Ownership:** Local-first reference implementation; SQLite persistence, local runtime, local backup/recovery and offline/air-gapped capabilities.

## How to use this roadmap
- This file tracks work owned by this implementation only.
- Shared capabilities may appear in both roadmaps, but implementation and completion status must be verified independently.
- A feature being complete in the other implementation does not make it complete here.
- Keep completed work and decisions in the history; update status only after code, tests and the target environment are verified.

## Shared product principles
1. Cross-platform memory, not a single-AI feature.
2. Provenance by default: retain source, source path, original date where available, import date and evidence trail.
3. User control over automation, consolidation, replacement, conflict resolution and sharing.
4. No silent data loss; imports and recovery must be inspectable and reversible.
5. Explain honestly what stays local, what is sent to a provider and what is stored remotely.
6. Derived entities and summaries must link back to their source facts.

## Architecture boundary
| Area | Argon | GPT Build |
|---|---|---|
| Role | Local-first reference/experimental implementation | Cloud-connected production implementation |
| Storage | Local SQLite | Supabase/PostgreSQL |
| Runtime | Local runtime | React + Vercel + Browser Companion |
| Backup | SQLite snapshots and local restore | Cloud-native database and Storage recovery |
| Rule | Do not assume cloud services | Do not copy SQLite-specific mechanisms into cloud code |

---

## 1. Verified Argon checkpoint — 12 November 2026
- Argon is the local SQLite/reference implementation. Latest reviewed work included database auditing, backup-path configuration and session-only import overrides.
- Settings/Database includes local backup scheduling, verified snapshots, retention, restore, external backup inspection and integrity audit workflows; continue testing failure cases.
- Source-folder convention includes numbered provider folders, including `07_local_ai_ollama`.
- A recursive scan of Argon `main` found zero `.py` files, while `McpBridgeModal.tsx` still generated `python3 -m brain.server` and instructed users to run `python -m brain.web`. This is a confirmed runtime/setup mismatch.

## 2. P0 — Argon correctness and trust
### 2.1 Repair MCP Bridge setup
**Status:** Confirmed broken in reviewed Argon `main`. **Priority:** P0.
- Replace stale Python commands with the actual supported MCP runtime, or implement/package the intended server.
- Distinguish Browser Companion, local HTTP API and desktop stdio MCP; they are separate paths.
- Validate executable, endpoint and protocol rather than merely displaying config JSON.
- Provide tested Claude Desktop/Cursor examples with correct paths and environment variables.
- Add a smoke test proving a client can list/search Brain memories.
- If a server is unavailable in a build, label it unavailable instead of advertising unusable commands.

### 2.2 Local security and privacy posture
**Status:** Pending. **Priority:** P0 before public launch.
- Document what stays on-device and what leaves during model calls, integrations, sync or user-triggered actions.
- Verify encryption at rest for SQLite DB, WAL files, backups and exports; do not claim it unless verified.
- Document file permissions, token/secret storage, log redaction, backup retention, export and deletion.
- Explain local-model/Ollama behaviour and any remaining network access. Local storage does not automatically mean air-gapped.

## 3. Argon UI and device validation
- Verify Graph, Memory Table, Node/Source Inspector, Activity Log, Capture Hub and Settings at narrow widths.
- Check keyboard/touch navigation, safe areas, zoom, dynamic viewport, loading/error states and accessibility.
- Preserve compact/icon-led sidebar direction where appropriate.
- Keep local workflows functional without assuming Vercel or Supabase services.

## 4. Import, ingestion and settings

## 5. SQLite backup, recovery and portable formats
## 6. Memory model and intelligence

**Argon implementation:** use SQLite schema/migrations and local-model/provider adapters appropriate to the local runtime. Preserve provenance and ensure background work survives app restarts.

This is the core evolution from a searchable fact store into a useful memory system.

### 7.1 Structured entities beneath raw facts

**Status:** Major gap identified in Claude's review; implementation needs a code-level design and verification pass.  
**Priority:** High.

Extract structured entities and relationships from existing stored facts, not only from new chat-simulator interactions.

Candidate entity types:

- People, teams and organisations.
- Projects and products.
- Tasks, deadlines and milestones.
- Technologies, tools and platforms.
- Decisions, preferences and constraints.
- Courses, subjects, topics and assessments.
- Events and dated activities.

Requirements:

- Entity records link back to the original fact(s) and source document(s).
- Store confidence, extraction time, source and evidence span where available.
- Support review/correction and duplicate entity resolution.
- Distinguish a confirmed fact from an inferred entity or relationship.
- Preserve multiple names/aliases without merging unrelated entities.
- Make entity extraction useful to search, graph navigation, Study Mode and retrospectives.

### 7.2 AI-assisted memory modes

**Status:** Product direction established; full mode system pending.

Design three understandable modes:

- **Manual:** user chooses exactly what becomes memory.
- **Assisted:** Brain proposes durable facts, metadata and updates for review.
- **Automatic:** approved rules automatically capture eligible facts, with an audit trail and undo path.

The user must be able to see why a memory was saved, what was changed and which source supported it. Automatic mode must not silently save sensitive content or make irreversible edits.

### 7.3 Decay and reinforcement — a living memory

**Status:** New idea; research/design pending.  
**Potential:** High, but requires safeguards.

- Facts recalled or explicitly confirmed can gain salience/reinforcement.
- Facts not used for a long time can become less prominent in graph views and retrieval ranking.
- Show a "things you might have forgotten" or "stale memory" view.
- Keep the original fact permanently unless the user deletes it or a separate retention policy applies.
- Decay must change ranking/visual emphasis, **not silently delete or rewrite memory**.
- Let users pin important facts and exempt them from decay.
- Explain why salience changed and allow reset/correction.

### 7.4 "Let it sleep on it" — explainable consolidation

**Status:** New idea; research/design pending.  
**Potential:** High; depends on provenance and structured entities.

- Run an explicit user-triggered or scheduled consolidation pass over recent facts.
- Cluster related information and create higher-level summaries/insights.
- Preserve links from each consolidated insight back to its source facts and source documents.
- Show proposed changes before applying them, at least in the initial release.
- Keep previous versions and support unpacking/reverting a consolidated result.
- Avoid presenting an LLM-generated inference as a directly observed fact.
- Make scheduling, model choice, privacy mode and cost limits visible.

### 7.5 Contradiction detection

**Status:** New idea; research/design pending.  
**Potential:** High; can share infrastructure with consolidation.

- Detect semantic conflicts, not just identical content.
- Consider time, project, source reliability and context before declaring a conflict.
- Example: a project used PyTorch in August but migrated to TensorFlow in October; this may be a timeline, not a contradiction.
- Show the competing facts, their dates and provenance.
- Ask the user which statement is current, or whether both are contextually valid.
- Keep superseded facts in history rather than deleting them.
- Never let an LLM silently choose the winner for important user memory.

### 7.6 Cross-AI second opinions

**Status:** New differentiator; depends on real provider connections and context routing.  
**Potential:** Very high.

- Compare what Claude, GPT, Gemini or other connected models previously said about the same topic.
- Display model/source/date and the original evidence for each perspective.
- Optionally send the same prepared question/context to two or more connected models side by side.
- Compare agreements, disagreements and assumptions without pretending one model is automatically correct.
- Let the user choose which response or synthesis becomes durable memory.
- Respect provider quotas, user consent, privacy settings and cost controls.

### 7.7 Neural Graph and relationships

**Status:** Relationship foundations and graph visualisation exist; richer memory semantics pending.

- Explicit parent/child and semantic relationship filters.
- Entity-centric graph navigation.
- Provenance-aware links and source clusters.
- Timeline and project views.
- Visual salience/decay/reinforcement only after the underlying model is stable.
- Graph accessibility and usable table/list alternatives.
- Ensure graph edges have explainable reasons and are not decorative guesses.

---

## 7. Cross-AI connections and the automatic Brain handshake

**Argon implementation:** MCP/local runtime and supported local integrations are primary routes; do not assume cloud auth or Browser Companion exists.

### 8.1 Provider and tool integrations

**Status:** Partial; adapter registry, guided setup and Browser Companion foundations exist.

Long-term sources include:

- ChatGPT, Claude and Gemini conversations.
- GitHub repositories, commits, issues, pull requests and project files.
- Local AI tools such as Ollama and supported local models.
- Moodle/course material and learning platforms.
- Drive and document repositories.
- Browser-captured pages, tabs and project resources.
- Other coding assistants and developer tools as adapters are added.

Use export/import or user-authorised connectors where a provider does not expose a supported API. Do not imply that every provider can be continuously synchronised if it cannot.

### 8.2 The Brain introduces itself — context handshake

**Status:** New idea built on the existing context snapshot and MCP direction.  
**Potential:** Very high; a foundational cross-AI capability.

- Generate a concise, current introduction to the user/project: relevant preferences, active projects, working style and selected context.
- Send this handshake automatically when a newly connected AI requests context, instead of asking the user to copy-paste a raw snapshot.
- Keep the handshake short and tailored to the current Brain/project, with links or retrieval handles for deeper facts.
- Let users preview, edit and exclude sensitive sections.
- Version the generated handshake and track which facts produced it.
- Refresh it as memory changes; do not send the entire memory database by default.
- Implement only after the relevant MCP/connector path actually works and has explicit user consent.

### 8.3 Browser Companion and extension roadmap

**Status:** Core foundation exists; production end-to-end testing and parity remain.

- Reliable authentication and token registration/revocation.
- Capture current chat/page with source URL, provider, title and timestamps.
- Inject context into supported AI interfaces with user control.
- Save selected conversation content back into the correct Brain/project.
- Project/resource scanning and clear reporting of skipped/unreachable sources.
- Avoid overbroad browser permissions; request only what each feature needs.
- Test Chrome/Edge/Brave and relevant browser versions.
- Preserve the earlier compatibility goal: support existing extension v2 behaviour while moving toward v3. Document migration and keep older supported workflows working until a deliberate deprecation.

---

## 8. Study Mode — The Brain for a student

**Status:** New idea; strong fit for the College Brain and existing lecture/PDF/slide/Moodle imports.  
**Potential:** Very high for the personal use case; can become a reusable education module.

- Generate flashcards from the user's own notes and imported documents.
- Generate quizzes and MCQs with answers and explanations.
- Create viva questions and oral-practice prompts.
- Build unit/topic-wise revision sets mapped to the user's syllabus.
- Cite the originating note/document/page/slide for every answer where possible.
- Track weak topics and schedule spaced revision.
- Support exam modes (timed practice, mixed questions, topic-specific practice).
- Keep teacher-provided material and AI-generated explanations distinguishable.
- Let the student correct a question or answer and feed that correction back into memory.

Start with one Brain/workspace and a limited set of file types; validate question quality and source citations before expanding.

---

## 9. Voice capture

**Argon implementation:** prioritise local recording/transcription where feasible; disclose clearly when cloud transcription is used.

**Status:** New idea; design pending.  
**Potential:** High as an additional input method.

- One-tap recording for thoughts, project ideas, reminders and meeting notes.
- Record → transcribe → review → ingest pipeline.
- Preserve recording time, transcript time, source and optional project/Brain selection.
- Offer local transcription where feasible and make cloud transcription an explicit choice.
- Allow editing the transcript before it becomes durable memory.
- Handle recording permissions, cancellation, upload failure and deletion clearly.
- Treat audio as sensitive; establish retention and consent rules before storing recordings by default.

---

## 10. Brain-to-brain handoff — git-style sharing

**Status:** New idea; depends on versioned portable Brain packages.  
**Potential:** Very high for real project collaboration; distinct from centralised multi-user sync.

- Export a selected project/Brain slice as a versioned package.
- Include required context, source metadata, entities and relevant relationships.
- Import into another Brain instance with preview, diff and conflict resolution.
- Support incremental updates or patch-like handoffs in later versions.
- Keep provenance of who/source instance contributed each item.
- Make sharing scope explicit: selected project only, not the user's whole personal memory.
- Exclude personal facts, credentials, private chats and attachments unless selected.
- Consider package signing/checksums and trust warnings for externally received packages.
- Avoid building real-time collaborative sync until there is a clear need; the initial concept is deliberate, distributed handoff.

---

## 11. Generated retrospective — the story of your work

**Status:** New idea; depends on timeline metadata, entities and provenance.  
**Potential:** Medium-high; strong product delight and useful reflection.

- Generate monthly, semester-wise or project-wise retrospectives.
- Show project evolution, decisions, milestones, pivots and unresolved questions.
- Example: a narrative of how one project moved from an early idea to a later technical direction.
- Link every narrative point to supporting facts and dates.
- Let users correct or omit events before sharing.
- Avoid inventing motives or psychological interpretations; describe documented changes, not guessed intent.
- Offer an exportable summary for personal review or project handoff.

---

## 12. Definition of done — shared quality bar

A feature is not "done" merely because its UI exists. For each milestone, require:

- **Behaviour:** the user can complete the end-to-end workflow.
- **Persistence:** state survives refresh/restart where promised.
- **Failure handling:** network errors, invalid input, cancellation and partial failure are recoverable.
- **Security:** permissions, user ownership, token scope and data exposure are checked.
- **Provenance:** source and derived-data relationships are retained where relevant.
- **Accessibility:** keyboard, focus, screen size, zoom and touch behaviour are considered.
- **Tests:** unit/integration tests cover core behaviour and regression cases.
- **Deployment:** the feature is verified in the environment it is intended to serve.
- **Documentation:** setup instructions, limitations and user-facing consequences are accurate.

---

## 13. Local-first and air-gapped mode
**Status:** Strategic architecture work; not a simple offline toggle.
- Use `07_local_ai_ollama` as a starting convention, then verify the actual adapter/runtime.
- Define a no-network mode that disables telemetry, remote APIs, cloud sync and external asset dependencies.
- Support a local model for extraction, retrieval and consolidation where feasible.
- Add a visible network-state indicator and tests proving no outbound calls occur in air-gapped mode.
- Treat it as a distinct operating mode/edition with explicit import/export boundaries to cloud instances.

## 14. Argon execution order
1. Fix MCP Bridge/runtime mismatch and test with a real client.
2. Publish local security/privacy posture and verify encryption claims.
3. Re-test SQLite backup/restore/integrity, including corruption and interrupted restores.
4. Finish import/settings and device QA; validate large folders and ZIPs.
5. Finalise portable format round trips.
6. Build structured entities, contradiction detection and explainable consolidation.
7. Add local-first differentiators: air-gapped mode, voice, selective handoff and retrospectives.

*Cloud-only implementation tasks belong in the GPT Build roadmap.*
