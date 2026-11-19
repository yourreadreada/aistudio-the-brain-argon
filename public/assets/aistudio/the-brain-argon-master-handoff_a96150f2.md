# THE BRAIN --- ARGON MASTER HANDOFF

## Complete product direction, implementation scope, priorities and long-term plan

**Prepared:** 19 November 2026\
**Target:** Google AI Studio / Gemini Argon\
**Repository:**
`https://github.com/yourreadreada/aistudio-the-brain-argon`\
**Implementation:** Argon --- local-first, SQLite-backed reference
implementation\
**Companion production implementation:**
`https://github.com/yourreadreada/the-brain-gpt-build`

> **Purpose:** This is the complete handoff for continuing Argon
> development. It combines the current Argon roadmap, previously agreed
> product direction, Claude's future-scope review, and the shared
> capabilities planned for The Brain. It includes immediate fixes,
> medium-term product work and future ideas. It is a living scope
> document, not a demand to implement every feature in one giant change.

------------------------------------------------------------------------

# 0. Instructions for the AI working in Google AI Studio

You are working on **Argon**, not the GPT Build repository. Treat this
document as the product and implementation brief for Argon.

## 0.1 First, inspect; then implement

Before changing code:

1.  Inspect the current repository, branches, recent commits, existing
    UI, data model, services, local runtime, import pipeline, settings,
    backup system and tests.
2.  Compare the actual code with this document. Do not assume that a
    feature is missing just because this handoff calls it pending; the
    repository may have changed since the last review.
3.  Produce a concise **Current State / Gap Analysis** with:
    -   Already implemented and verified.
    -   Implemented but not end-to-end verified.
    -   Partially implemented.
    -   Missing.
    -   Broken or misleading.
    -   Architectural decisions still needed.
4.  Identify the smallest safe next implementation step and its
    dependencies.
5.  Preserve existing user data and existing working behaviour. Do not
    reset, reseed, replace or migrate the user's database destructively.

## 0.2 Work style and change discipline

-   Prefer small, reviewable, complete changes over a large rewrite.
-   Finish a coherent feature end-to-end: UI, persistence, error
    handling, tests and documentation.
-   Do not stop after creating a UI mock or placeholder.
-   Do not claim something works until it has been exercised in the
    actual supported runtime.
-   Run the available tests, type checks, lint/build checks and relevant
    manual smoke tests after changes.
-   Keep a concise changelog: files changed, behaviour added/fixed,
    tests run, known limitations and next step.
-   If an operation could delete, overwrite, migrate or irreversibly
    transform data, stop and design a backup/rollback path first.
-   Do not silently resolve conflicts, overwrite memories or discard
    source metadata.
-   Do not invent integrations, APIs, commands, executables or setup
    instructions. Verify them against the code and actual runtime.
-   Do not add fake buttons, dead controls, decorative settings or
    placeholder connection states.
-   Do not copy cloud-specific Supabase/Vercel code into Argon.
-   Keep the UI coherent with the existing Argon design rather than
    redesigning everything without need.

## 0.3 Product boundary: Argon vs GPT Build

Argon is the **local-first reference implementation**: - Local SQLite
database and local persistence. - Local runtime and local model/provider
adapters where feasible. - Local backup, restore, integrity checking and
portable exports. - Offline-first workflows and the future genuinely
air-gapped mode.

GPT Build is the separate cloud-connected production implementation: -
React + Supabase/PostgreSQL + Vercel + Browser Companion. - Cloud-native
account security, database recovery and deployment.

Share product concepts, data semantics, provenance rules and portable
formats where practical. Do **not** assume storage, auth, backup or
runtime code is interchangeable. Argon must work without depending on
Supabase or Vercel.

------------------------------------------------------------------------

# 1. Product vision

**The Brain is one persistent, explainable memory system that carries
useful context across AI providers, projects, devices and workflows.**

The product promise:

> **Connect once, work anywhere; The Brain remembers the useful context,
> where it came from, and how it changed.**

The Brain should evolve from a searchable collection of imported facts
into a personal knowledge and context layer that can: - Capture
information from AI conversations, files, browser activity,
code/projects and learning materials. - Preserve source, date, folder,
project and evidence. - Retrieve the right context when another AI or
workflow needs it. - Understand people, projects, tasks, decisions,
technologies and relationships. - Help users detect stale or conflicting
information. - Consolidate knowledge without losing its source trail. -
Work locally and, eventually, in a genuinely network-isolated
environment. - Let users deliberately export/share selected project
knowledge with another Brain.

It is not meant to be just another chatbot, notes app, vector database
UI or single-provider memory feature.

## 1.1 Non-negotiable principles

1.  **Cross-AI:** memory must not belong to only ChatGPT, Claude, Gemini
    or one model.
2.  **Provenance by default:** preserve source, source path, original
    date when available, import date, related sources and evidence.
3.  **User control:** capture, automation, consolidation, replacement,
    conflict resolution and sharing must be inspectable and
    controllable.
4.  **No silent data loss:** imports, restores, merges and
    transformations must be recoverable and reversible wherever
    possible.
5.  **Honest privacy:** explain what stays on-device and what is sent to
    a model or external service.
6.  **Useful before clever:** reliability, search, import quality,
    attribution, persistence and device usability come before
    speculative AI features.
7.  **Explainable intelligence:** entities, summaries, inferred
    relationships and consolidated insights must link back to source
    facts.
8.  **Local-first by design:** core memory operations should not require
    a cloud account or cloud backend.
9.  **No fake completion:** a feature is complete only after end-to-end
    behaviour and persistence are verified.

------------------------------------------------------------------------

# 2. Current known Argon checkpoint and urgent correctness issue

The last detailed Argon review was around **12 November 2026**. Re-check
the current repository before relying on this snapshot.

Known foundations from that review: - Argon uses local SQLite and a
local runtime. - Settings / Database included local backup scheduling,
verified snapshots, retention, restore, external backup inspection and
integrity audit workflows. - Recent work included database auditing,
backup-path configuration and session-only import overrides. - The
source-folder convention included numbered provider folders, including
`07_local_ai_ollama`.

## 2.1 P0 --- MCP Bridge runtime/setup mismatch

**This was confirmed broken in the reviewed Argon `main` branch. Verify
whether it has since been fixed.**

The reviewed `src/components/McpBridgeModal.tsx`: - Generated a desktop
MCP configuration using `python3 -m brain.server`. - Told users to run
`python -m brain.web` when the local server check failed. - Probed
`http://localhost:8787/api/brains`.

A recursive repository-tree scan at that time found **zero `.py` files**
in the repository. Therefore, the advertised Python runtime did not
match the shipped code.

### Required resolution

1.  Determine what runtime Argon actually supports today.
2.  Choose one truthful implementation path:
    -   Implement/package the intended MCP server and its dependencies;
        or
    -   Replace the Python instructions with the real supported
        executable/runtime; or
    -   Clearly mark desktop MCP as unavailable until implemented.
3.  Distinguish these three concepts in code and UI:
    -   **Browser Companion** --- browser extension integration.
    -   **Local HTTP API** --- local app/server endpoint.
    -   **Desktop stdio MCP** --- process launched by an MCP client such
        as Claude Desktop or Cursor. They are not interchangeable.
4.  Verify actual executable path, command arguments, working directory,
    environment variables, endpoint and protocol.
5.  Provide configuration examples only for clients that have been
    tested.
6.  Add an end-to-end smoke test: start the supported server, connect a
    real MCP client/test harness, list available Brain resources/tools,
    search memories and return grounded results.
7.  Make connection status reflect a real health check, not merely the
    presence of copied configuration text.
8.  If a path is not implemented, label it clearly as unavailable or
    experimental.

**Acceptance:** a user can follow the displayed instructions from a
clean setup and successfully connect; otherwise the UI clearly says the
capability is not available.

## 2.2 P0 --- Local security and privacy posture

Before public release, document and verify: - What stays on the
device. - What leaves the device when a user invokes a cloud model,
provider adapter, integration, browser workflow or other remote
service. - Whether the SQLite database, WAL files, temporary files,
backups and exports are encrypted at rest. Verify this; do not assume
it. - File permissions and database location. - How API keys/tokens are
stored, accessed, rotated and deleted. - Whether logs can contain
prompts, personal facts, file paths or secrets; redact sensitive
values. - Backup retention, deletion and restore consequences. - Whether
Ollama/local-model requests truly remain local. - Which app features
still make network calls. - The difference between **local-first**,
**offline-capable** and **air-gapped**. They are not synonyms.

Do not claim Argon is fully private, encrypted or air-gapped until the
relevant behaviour has been tested.

------------------------------------------------------------------------

# 3. Argon UI, usability and device quality

The UI should feel like a complete, usable application, not a
desktop-only prototype.

## 3.1 Core screens to validate

-   Neural Graph.
-   Memory Table.
-   Node Inspector.
-   Source Inspector.
-   Activity Log.
-   Capture Hub / import review.
-   Settings Centre, including Database & Backup.
-   MCP / integrations setup.
-   Any project or Brain switching/navigation surfaces.

For each screen, test: - Desktop and narrow browser widths. - Phone
portrait/landscape and tablet portrait/landscape where applicable. -
Split-screen and resizing. - Browser zoom and pinch zoom. - Dynamic
viewport/address-bar changes. - Safe-area insets and rounded corners. -
On-screen keyboard behaviour. - Long names, large documents, long
metadata and empty states. - Loading, success, partial failure and retry
states. - Keyboard navigation, visible focus, touch targets and
screen-reader labels.

## 3.2 Visual direction

-   Preserve a compact, icon-led sidebar/navigation direction where
    appropriate.
-   Do not add unnecessary expand-to-text UI just for decoration.
-   Provide accessible labels/tooltips even when navigation is
    icon-only.
-   Keep desktop density efficient; do not merely shrink desktop panels
    on mobile.
-   No destructive action should depend on hover-only interaction.
-   Keep table/list alternatives usable when a graph is difficult to
    navigate.
-   Support reduced motion and visible focus states.

## 3.3 Definition of done for UI

A screen is not done because it renders. It must have real data, working
controls, loading/empty/error states, keyboard/touch usability,
responsive behaviour and persistence where expected.

------------------------------------------------------------------------

# 4. Capture Hub, import pipeline and ingestion

The Brain must be able to accept/import useful context from many sources
without losing provenance or making the user repeat work.

## 4.1 Sources and formats to support

Build and maintain a truthful support matrix for: - Markdown and plain
text. - PDF. - DOCX. - PPTX. - Spreadsheets. - JSON and structured
exports. - ZIP archives, nested folders and folder uploads. - Code and
project files. - Chat exports from supported AI platforms. -
Browser-captured pages, tabs and selected web content. - Moodle/course
materials and learning resources. - Local AI exports and Ollama-related
workflows. - Images and scanned documents, with explicit OCR/vision
requirements and limitations. - GitHub repositories, project files and
selected development context, through supported workflows.

Do not imply every source supports automatic continuous sync. Where a
provider has no supported API, use user-authorised export/import or
browser capture and explain the limitation.

## 4.2 Import reliability

Inspect current implementation and complete the following where
missing: - Large folder and ZIP imports. - Configurable maximum files
per batch and worker concurrency. - Conservative defaults that avoid
exhausting memory/CPU. - Per-file progress and status. - Persistent
review queue where feasible. - Pause, resume and cancel without losing
completed work. - Checkpointing so successful files are not re-imported
after interruption. - Bounded retry for transient failures. - Clear
permanent failure reporting. - Malformed/unsupported file handling. -
Duplicate detection: exact, likely and related duplicates. - Explicit
Create / Merge / Replace / Skip decisions. - Confirmation for
destructive replacement. - Never treat an unknown duplicate state as
permission to overwrite. - Post-import verification and recoverable
error reporting. - A clear summary of imported, skipped, failed, merged
and replaced items.

Test large batches, interrupted imports, corrupted files, Unicode, long
paths, duplicate ZIP entries, nested folders and partial failures.

## 4.3 Provenance and folder-first attribution

Preserve the complete source trail: - Original relative folder path. -
Provider/source folder. - Source filename and original URL where
applicable. - Original creation date when available. - Import
date/time. - Explicit source/primary source. - Related sources. - Topic
key, fixture ID and tags where available. - Attribution basis: explicit
folder, explicit document header, user selection or heuristic. -
Evidence span or original source segment where possible.

Attribution priority: 1. Explicit source folder / folder structure. 2.
Explicit `Primary Source` metadata/header in the document. 3.
User-confirmed source selection. 4. Filename/content heuristics as
suggestions only.

A manually confirmed source must not be overridden by incidental
keywords in document content. Do not fabricate original creation dates
from import timestamps or filesystem modification dates. If one document
becomes multiple facts/chunks, preserve the provenance link for every
derived item.

## 4.4 Ingestion controls and Settings Centre

Audit the existing settings first. Make useful controls durable global
defaults rather than only temporary session overrides.

Potential settings: - Maximum files per batch. - Worker concurrency. -
Default ingestion strategy: semantic, branching, chunking or single-node
where supported. - Chunk size and extraction limits. - Default
Brain/project destination. - Duplicate detection toggle and default
duplicate policy. - Retry count and retry behaviour. - Post-import
verification. - Progress and notification preferences. - Destructive
replace confirmation. - Optional pre/post-import backup policy and
large-import threshold. - Model/provider selection for extraction, with
privacy and cost disclosure. - Per-session overrides that clearly show
they do not change saved defaults.

The previously discussed target was a **1,000-file default batch**, with
larger configurable limits where safe (up to 5,000 had been discussed)
and configurable worker concurrency. Verify actual resource use before
enabling large values. Do not blindly copy a number if the local
implementation cannot safely handle it.

## 4.5 Capture Hub user experience

-   Clear source selection and destination Brain/project.
-   File/folder/ZIP selection.
-   Preview and source attribution before committing.
-   Review queue with Create/Merge/Replace/Skip decisions.
-   Per-file progress, retry and failure details.
-   Pause/cancel/resume where supported.
-   Duplicate review.
-   Final import report.
-   Ability to inspect where an imported memory came from.

------------------------------------------------------------------------

# 5. SQLite database, backup, restore and portable formats

This is an Argon-owned strength. Preserve it and make it dependable.

## 5.1 Existing backup foundations to audit

The previous review reported: - Verified SQLite snapshots. - Scheduled
backups (hourly/daily/weekly options where configured). - Retention and
pruning. - Pre-restore safety backup. - Internal and external backup
inspection/restore. - Integrity checks. - Configurable backup
directory/path.

Verify all of these against current code and actual files. Do not mark
them complete solely because a Settings control exists.

## 5.2 Backup and recovery requirements

-   A snapshot must be consistent while the database is in use.
-   Verify backup integrity before reporting success.
-   Preserve at least one known-good backup during retention pruning.
-   Never prune the only valid backup.
-   Create a safety backup before restore.
-   Inspect external backups before applying them.
-   Validate schema/version compatibility.
-   Make restore consequences clear.
-   Report the exact result of integrity checks.
-   Recover cleanly from interrupted backup/restore operations.
-   Handle locked, missing, corrupted, permission-denied and full-disk
    conditions.
-   Keep database, WAL/SHM and backup handling correct.
-   Make backup path changes safe and test moving between paths.
-   Do not overwrite the active database until the replacement has
    passed validation and a rollback path exists.

## 5.3 Backup test matrix

Test at minimum: - Normal snapshot. - Snapshot while writes are
occurring. - Corrupt database. - Corrupt backup. - Interrupted
snapshot. - Interrupted restore. - Insufficient disk space. - Permission
denied. - External backup from an older supported version. - Retention
cleanup with multiple backups. - Retention cleanup when only one valid
backup exists. - Restore followed by app restart and data verification.

## 5.4 Portable Brain format family

Build a documented, versioned family of formats:

### `.brain.md`

Human-readable export for reading, sharing and archiving. Include
Brain/project identity and source/provenance metadata.

### `.brain.json`

Structured machine-readable export with stable IDs, schema version,
facts, sources, relationships, timestamps, tags and relevant metadata.

### `.brainpack.zip`

Portable package containing a manifest, structured data, optional
attachments, source metadata and checksums.

Requirements: - Round-trip export/import tests. - Stable schema
versioning and migrations. - Integrity/checksum validation. - Selective
export by Brain, project, source or date range. - Preview before
import. - Conflict resolution on import. - Preserve IDs and provenance
where safe. - Exclude secrets and private data by default. - Make
attachment inclusion explicit. - Support future incremental/diff-style
handoff without breaking older packages.

The existing Markdown export, if any, must not be described as a full
database backup. Portable content export and disaster-recovery backup
are different functions.

------------------------------------------------------------------------

# 6. Memory model and intelligence

This is the long-term evolution from a searchable fact store into a
useful, living memory system. Implement in dependency order; do not
build advanced AI features on top of unstable provenance or persistence.

## 6.1 Structured entities beneath raw facts

**High priority.** A major gap identified in the prior review was that
the chat simulator could append facts, but did not adequately extract
structured people/things/tasks/dates from facts already stored.

Extract structured entities from **existing facts as well as newly
ingested content**.

Candidate entity types: - People, teams and organisations. - Projects
and products. - Tasks, deadlines and milestones. - Technologies, tools
and platforms. - Decisions, preferences and constraints. - Courses,
subjects, topics and assessments. - Events and dated activities.

Requirements: - Entity records link to source fact(s) and source
document(s). - Store confidence, extraction time, model/source and
evidence span where possible. - Distinguish directly stated facts from
inferred entities/relationships. - Allow user review, correction and
merge/split. - Support aliases without merging unrelated entities. -
Make entity extraction useful in search, graph navigation, Study Mode
and retrospectives. - Provide batch/backfill processing for existing
facts, with progress, pause/resume and error handling. - Do not
mutate/delete raw facts during extraction.

## 6.2 Three memory modes

Design three understandable user-facing modes:

**Manual** - User chooses exactly what becomes durable memory. - No
silent background capture.

**Assisted** - Brain proposes facts, metadata, entity links and
updates. - User reviews and approves/rejects.

**Automatic** - Only user-approved rules automatically capture eligible
information. - Maintain audit history and undo. - Sensitive content must
not be silently captured. - User can inspect what was saved, why and
from which source.

Mode changes should be clear and reversible.

## 6.3 Decay and reinforcement --- living memory

A new idea for later implementation: - Facts explicitly confirmed or
frequently recalled may gain salience. - Unused facts may become less
prominent in retrieval ranking and graph emphasis. - Provide a "Things
you might have forgotten" / stale-memory view. - Allow pinning important
memories and excluding them from decay. - Explain why a fact's salience
changed. - Allow correction/reset.

**Critical guardrail:** decay changes ranking or visual emphasis. It
must not silently delete, rewrite or erase the original fact. Deletion
remains an explicit user action or a separately disclosed retention
policy.

## 6.4 "Let it sleep on it" --- explainable consolidation

A named consolidation pass: - User-triggered first; scheduled automation
can come later. - Cluster related recent facts and propose higher-level
summaries/insights. - Preserve links to every supporting source fact and
document. - Show proposed changes for review before applying, at least
initially. - Keep versions and allow unpacking/reverting. - Distinguish
observed facts from model-generated inference. - Expose model choice,
privacy mode, scheduling and cost/resource limits. - Must not rewrite
raw facts.

The goal is explainable synthesis, not a black box that silently changes
the user's memory.

## 6.5 Contradiction detection

Detect semantic conflicts, not just identical duplicates.

Example: one fact says a project used PyTorch in August and another says
it moved to TensorFlow in October. This may be a valid timeline rather
than a contradiction.

Requirements: - Consider time, project, source reliability and
context. - Show both statements, their dates and provenance. - Ask the
user whether one supersedes the other or both remain valid in different
contexts. - Preserve superseded facts and history. - Never let an LLM
silently decide which important memory is correct. - Allow "not a
contradiction" feedback to improve future detection.

## 6.6 Cross-AI second opinions

A future differentiator: - Compare what Claude, GPT, Gemini and other
connected models previously said about the same topic. - Show
model/provider, date, source and evidence for each response. -
Optionally send the same prepared question and scoped context to two or
more connected models side by side. - Present agreements, disagreements
and assumptions. - Do not assume one model is automatically correct. -
Let the user choose what response or synthesis becomes durable memory. -
Respect provider quotas, privacy, explicit consent and cost/resource
controls.

## 6.7 Neural Graph and relationships

Build on existing graph foundations: - Entity-centric navigation. -
Explicit parent/child and semantic relationship filters. -
Provenance-aware edges and source clusters. - Timeline and project
views. - Explain why an edge exists and which facts support it. -
Visualise salience only after the memory model is stable. - Provide a
table/list alternative for accessibility and precision. - Avoid
decorative or unsupported AI-generated edges.

------------------------------------------------------------------------

# 7. Cross-AI connections and automatic context handshake

Argon's primary path is local runtime/MCP and supported adapters. Do not
assume cloud auth or the GPT Build Browser Companion is available here.

## 7.1 Provider and tool integrations

Long-term sources: - ChatGPT, Claude and Gemini conversation exports. -
GitHub repositories, commits, issues, pull requests and project files. -
Local AI tools such as Ollama and supported local models. -
Moodle/course material and learning platforms. - Drive and document
repositories where a supported user-authorised route exists. -
Browser-captured pages, tabs and project resources. - Other coding
assistants and developer tools through adapters.

Rules: - Prefer supported APIs/connectors when available. - Otherwise
use user-authorised export/import or browser capture. - Do not promise
continuous sync when a provider does not expose a supported API. - Show
source, provider, timestamps and limitations. - Make credentials and
scopes explicit; never ask users to paste secrets into logs or source
code.

## 7.2 "The Brain introduces itself" --- context handshake

The existing `exportContextSnapshot` is a manual copy/paste foundation.
The future goal is an automatic, concise context handshake when a
connected AI requests context.

Requirements: - Generate a short introduction relevant to the active
Brain/project: selected preferences, active projects, working style and
useful current context. - Send it only through a working, explicitly
authorised MCP/connector route. - Keep it short; do not send a raw dump
of the entire memory database. - Include retrieval handles/links or
tools for deeper context where supported. - Allow preview, editing and
exclusion of sensitive sections. - Version the handshake and track which
facts generated it. - Refresh it as memory changes. - Respect project
boundaries and consent. - If the connection does not work, keep manual
export available as a fallback.

## 7.3 MCP and context tools

Once the MCP path is real and tested, useful tools/resources may
include: - List available Brains/projects. - Search memories with
filters. - Retrieve a fact with source/provenance. - Retrieve a
project-scoped context snapshot. - Inspect related facts/entities. -
Save a proposed memory only with explicit user-approved semantics. -
Report source and confidence.

Keep tool permissions narrow. Reading context and writing durable memory
should be separate permissions/actions.

------------------------------------------------------------------------

# 8. Study Mode --- The Brain for a student

This is a high-value future module because The Brain can already ingest
lecture notes, PDFs, slides, scans and Moodle materials.

Capabilities: - Generate flashcards from the user's own notes. -
Generate MCQs, quizzes and answer explanations. - Create viva questions
and oral-practice prompts. - Build unit/topic-wise revision sets mapped
to the student's syllabus. - Cite the exact source
document/page/slide/section for answers wherever possible. - Track weak
topics and schedule spaced revision. - Support timed exam practice,
mixed questions and topic-specific practice. - Distinguish
teacher-provided source material from AI-generated explanations. - Let
users flag/correct bad questions and answers. - Feed approved
corrections back into the knowledge base.

Start with one Brain/project and a limited set of supported formats.
Validate answer correctness and source citations before expanding.

------------------------------------------------------------------------

# 9. Local-first, offline and genuinely air-gapped mode

Use the existing `07_local_ai_ollama` folder convention as a starting
point, but inspect the actual adapter/runtime before designing around
it.

These modes must be distinguished:

-   **Local-first:** data is stored locally by default, but optional
    network calls may exist.
-   **Offline-capable:** core workflows work without internet, but some
    optional features may need it.
-   **Air-gapped:** the app makes no network calls while the mode is
    active.

A genuinely air-gapped mode requires: - Local storage and local model
inference. - Disable remote APIs, cloud sync, telemetry and external
services. - No hidden remote fonts, CDNs, analytics, update checks or
external assets while active. - Bundle/document required assets. - A
visible air-gap/network state indicator. - Tests that prove no outbound
calls occur. - Explicit import/export boundaries for moving data to
another environment. - No automatic cloud fallback if a local model is
unavailable. - A clear warning before switching out of air-gapped mode
or exporting data.

Treat this as a distinct operating mode/edition, not a checkbox that
only hides cloud buttons.

------------------------------------------------------------------------

# 10. Voice capture

A future capture method: - One-tap recording for thoughts, reminders,
project ideas and meeting notes. - Record → transcribe → review →
ingest. - Preserve recording time, transcript time, source and selected
Brain/project. - Prefer local transcription where feasible. - If cloud
transcription is offered, make it explicit and explain what audio leaves
the device. - Allow transcript correction before it becomes durable
memory. - Handle permissions, cancellation, failed transcription,
interrupted recording and deletion. - Treat audio as sensitive; do not
retain raw recordings by default without clear user consent and
retention controls.

------------------------------------------------------------------------

# 11. Brain-to-brain handoff --- git-style sharing

This is deliberate, selective knowledge transfer, not immediate
real-time multi-user sync.

Requirements: - Export a selected Brain/project slice as a versioned
package. - Include relevant facts, source metadata, entities and
relationships. - Import into another Brain with preview, diff and
conflict resolution. - Keep provenance of contributing source
instance/person where appropriate. - Support incremental/patch-like
updates in a later version. - Make scope explicit: selected project
only, never the whole personal memory by default. - Exclude credentials,
personal facts, private chats and attachments unless explicitly
selected. - Consider checksums/package signing and trust warnings for
external packages. - Keep a record of what was imported and from where.

This feature depends on the portable `.brainpack.zip` format and stable
IDs/schema.

------------------------------------------------------------------------

# 12. Generated retrospectives --- the story of your work

A useful reflection feature: - Monthly, semester-wise or project-wise
retrospectives. - Show project evolution, milestones, decisions, pivots
and unresolved questions. - Link every narrative point to supporting
facts and dates. - Allow users to correct, hide or omit events before
sharing. - Avoid inventing motives or psychological interpretations. -
Export a readable summary for personal review or project handoff.

This depends on reliable timestamps, entities, provenance and project
relationships.

------------------------------------------------------------------------

# 13. Shared portable data contract and interoperability

Argon and GPT Build should align on product-level semantics, not storage
internals.

Keep a documented shared contract for: - Stable
fact/source/entity/relationship identifiers. - Source and provenance
fields. - Original creation time vs import time. - Topic keys, related
sources and tags. - Entity types and relationship types. - Confidence
and evidence references. - Schema version and migration rules. -
Portable `.brain.md`, `.brain.json` and `.brainpack.zip` formats.

Argon stores this in SQLite; GPT Build stores it in PostgreSQL. The same
package should be importable into either implementation when supported,
with preview and conflict handling.

Do not make Argon depend on GPT Build's cloud database or account
system.

------------------------------------------------------------------------

# 14. Suggested implementation order

This is a dependency-aware order, not a rigid sprint schedule. Reassess
after auditing the current repository.

## Phase 0 --- Audit and stop misleading behaviour

1.  Audit current branch/repo and update the status of every item in
    this handoff.
2.  Fix the MCP Bridge/runtime mismatch.
3.  Verify local security/privacy claims and write the first accurate
    privacy/data-flow explanation.
4.  Confirm the actual local runtime and supported install/run workflow.

## Phase 1 --- Reliability and foundations

1.  Test SQLite backup/restore/integrity thoroughly.
2.  Complete import reliability, folder/ZIP path preservation and
    provenance.
3.  Finish global import/processing settings and session override
    clarity.
4.  Complete responsive/device QA across core screens.
5.  Ensure Activity Log and source inspection make imports and
    transformations explainable.

## Phase 2 --- Portable knowledge and memory structure

1.  Finalise `.brain.md`, `.brain.json` and `.brainpack.zip`.
2.  Add structured entity schema and extraction from existing facts.
3.  Add entity review, correction, alias and merge/split workflows.
4.  Improve Neural Graph using real entities and provenance-aware
    relationships.

## Phase 3 --- Trustworthy intelligence

1.  Add Manual / Assisted / Automatic memory modes.
2.  Build contradiction detection with user review.
3.  Build "Let it sleep on it" consolidation with provenance, versioning
    and rollback.
4.  Add decay/reinforcement as ranking and salience only, with pinning
    and explanations.

## Phase 4 --- Local-first differentiators

1.  Build the genuine air-gapped mode using local model adapters.
2.  Complete tested MCP/context handshake and cross-AI context
    retrieval.
3.  Add voice capture with local-first transcription.
4.  Add cross-AI second opinions where supported and consented.

## Phase 5 --- Knowledge workflows

1.  Add Study Mode.
2.  Add selective Brain-to-Brain handoff.
3.  Add generated retrospectives.
4.  Expand provider integrations based on real API/export availability.

------------------------------------------------------------------------

# 15. Acceptance criteria --- what "done" means

A feature is not done just because the UI exists.

For each feature, verify:

-   **End-to-end behaviour:** a real user can complete the workflow.
-   **Persistence:** state survives refresh/restart where promised.
-   **Data safety:** no unexpected loss, duplication or overwrite.
-   **Failure handling:** invalid input, cancellation, interrupted
    operations and errors are recoverable.
-   **Provenance:** source and derived-data links are retained.
-   **Security/privacy:** permissions, local/cloud data flow and secret
    handling are checked.
-   **Performance:** large files/batches do not freeze or exhaust the
    app unexpectedly.
-   **Accessibility:** keyboard, focus, touch, zoom and screen sizes are
    usable.
-   **Tests:** relevant unit/integration/regression tests pass.
-   **Runtime verification:** setup instructions work in the real
    supported environment.
-   **Documentation:** limitations and user-facing consequences are
    accurate.

------------------------------------------------------------------------

# 16. How to report progress back

After each coherent task, report:

1.  **What was inspected.**
2.  **What was changed.**
3.  **Files/modules affected.**
4.  **Database/schema impact**, if any.
5.  **Tests and commands actually run**, with pass/fail results.
6.  **Manual runtime verification** performed.
7.  **Known limitations or unresolved risks.**
8.  **Whether data migration is needed** and how rollback works.
9.  **What is now complete vs merely implemented.**
10. **The next smallest safe task.**

Keep a living changelog and update this handoff when decisions change.
Do not erase completed history; mark items complete with the
commit/version and verification evidence.

------------------------------------------------------------------------

# 17. Important guardrails --- never violate these

-   Never delete or rewrite raw facts during entity extraction,
    consolidation or decay.
-   Never silently resolve a meaningful contradiction.
-   Never send the entire memory database to a model just because a
    context handshake is requested.
-   Never call Argon air-gapped until outbound network behaviour has
    been tested.
-   Never claim encryption at rest without verifying the database, WAL,
    backups and exports.
-   Never advertise a nonexistent MCP executable or server.
-   Never present a Markdown export as a complete database backup.
-   Never import/restore a package without validation, preview and a
    recoverable path.
-   Never include secrets or private personal memories in a shared Brain
    package by default.
-   Never assume a provider supports continuous sync; verify its actual
    API/export capabilities.
-   Never implement cloud-only GPT Build features by adding a hidden
    dependency on Supabase/Vercel to Argon.
-   Never treat a successful build as proof of correct runtime
    behaviour.

------------------------------------------------------------------------

# 18. Immediate instruction

**Start by auditing the current Argon repository against this handoff.**
Then fix the highest-priority confirmed correctness issue (the MCP
Bridge/runtime mismatch, if it is still present). After that, proceed in
the implementation order above, one coherent, tested task at a time.

Do not attempt to implement every future feature in one pass. Establish
a reliable, safe foundation first, then build the memory intelligence
and differentiators on top of it.
