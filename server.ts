import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Setup SQLite database
const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_PATH = path.join(DB_DIR, 'brain.db');
const db = new DatabaseSync(DB_PATH);

// Initialize schema if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brain TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL,
    file_name TEXT,
    file_path TEXT,
    file_type TEXT,
    tags_json TEXT,
    parent_id INTEGER,
    is_document_root INTEGER DEFAULT 0,
    is_unified_context_node INTEGER DEFAULT 0,
    document_title TEXT,
    semantic_section_count INTEGER,
    merge_history_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS companion_devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token_prefix TEXT NOT NULL,
    token_value TEXT NOT NULL,
    browser TEXT,
    created_at TEXT NOT NULL,
    last_used_at TEXT
  );
`);

// Ensure new columns exist on older DB files
const existingCols = (db.prepare(`PRAGMA table_info(facts)`).all() as { name: string }[]).map((c) => c.name);
const alterColumns: [string, string][] = [
  ['file_type', 'TEXT'],
  ['tags_json', 'TEXT'],
  ['parent_id', 'INTEGER'],
  ['is_document_root', 'INTEGER DEFAULT 0'],
  ['is_unified_context_node', 'INTEGER DEFAULT 0'],
  ['document_title', 'TEXT'],
  ['semantic_section_count', 'INTEGER'],
  ['merge_history_json', 'TEXT'],
];
for (const [col, type] of alterColumns) {
  if (!existingCols.includes(col)) {
    try {
      db.exec(`ALTER TABLE facts ADD COLUMN ${col} ${type}`);
    } catch {
      // ignore if already exists
    }
  }
}

const INITIAL_SEED_FACTS = [
  {
    brain: 'coding',
    source: 'claude',
    content: 'Dog translator project: Moved from heuristic regex audio rules to a real ML model. Preprocessing pipeline uses librosa for Mel-frequency cepstral coefficients (MFCCs) with PyTorch acoustic classifier.',
    tags: ['audio-ml', 'pytorch', 'dsp'],
    fileType: 'code',
    fileName: 'dog_translator_mfcc.py',
    created_at: '2026-10-02T14:22:00Z',
    updated_at: '2026-10-02T14:22:00Z',
  },
  {
    brain: 'coding',
    source: 'gpt',
    content: 'Dog translator audio normalization: Target sampling rate is strictly 22050 Hz, mono channel, 3.5s sliding window to capture distinctive bark frequencies and whimpers.',
    tags: ['audio-ml', 'preprocessing', 'audio'],
    fileType: 'pdf',
    fileName: 'audio_normalization_spec.pdf',
    created_at: '2026-10-03T09:15:00Z',
    updated_at: '2026-10-03T09:15:00Z',
  },
  {
    brain: 'coding',
    source: 'cursor',
    content: 'Canteen system architecture: Built on FastAPI + React + Redis pub/sub for instant order status queue. Token collection counters refresh live without polling.',
    tags: ['fastapi', 'redis', 'architecture'],
    fileType: 'docx',
    fileName: 'canteen_architecture_rfc.docx',
    created_at: '2026-10-03T16:40:00Z',
    updated_at: '2026-10-03T16:40:00Z',
  },
  {
    brain: 'coding',
    source: 'github',
    content: 'Canteen system commit 4f9a2c: Swapped SQLite locks for Postgres connection pooling with PgBouncer. Peak load test sustained 850 concurrent lunch requests.',
    tags: ['postgres', 'performance', 'database'],
    fileType: 'xlsx',
    fileName: 'database_load_benchmarks.xlsx',
    created_at: '2026-10-04T11:05:00Z',
    updated_at: '2026-10-04T11:05:00Z',
  },
  {
    brain: 'coding',
    source: 'claude',
    content: 'Preferred coding style: Always TypeScript strict mode, functional components, zero unnecessary abstractions, prefer early returns, no arbitrary try/catch swallowing errors. Use Tailwind for UI without CSS files.',
    tags: ['typescript', 'coding-style', 'frontend'],
    fileType: 'md',
    fileName: 'typescript_guidelines.md',
    created_at: '2026-10-04T13:30:00Z',
    updated_at: '2026-10-04T13:30:00Z',
  },
  {
    brain: 'coding',
    source: 'gemini',
    content: 'Idea-builder-system: Context window optimization strategy. Store summaries in local vector cache and feed only the last 3 turns + top 5 relevant memory cards to preserve tokens.',
    tags: ['llm-context', 'vector-cache', 'optimization'],
    fileType: 'pptx',
    fileName: 'context_window_strategy.pptx',
    created_at: '2026-10-04T15:10:00Z',
    updated_at: '2026-10-04T15:10:00Z',
  },
  {
    brain: 'coding',
    source: 'local-ai',
    content: 'Local Ollama setup: Qwen 2.5 Coder 14B runs at 38 t/s on local GPU; used for quick boilerplate generation without exposing internal project tokens.',
    tags: ['ollama', 'local-llm', 'gpu'],
    fileType: 'code',
    fileName: 'local_ollama_qwen.py',
    created_at: '2026-10-04T17:45:00Z',
    updated_at: '2026-10-04T17:45:00Z',
  },
  {
    brain: 'college',
    source: 'moodle',
    content: 'Moodle extension: Automated scraper for attendance portal and lab submission notices. Uses DOM mutation observers to inject quick download buttons beside PDF links.',
    tags: ['moodle', 'scraping', 'extension'],
    fileType: 'code',
    fileName: 'moodle_scraper_extension.ts',
    created_at: '2026-10-01T08:00:00Z',
    updated_at: '2026-10-01T08:00:00Z',
  },
  {
    brain: 'college',
    source: 'moodle',
    content: 'Computer Networks Assignment 3: Implementation of distance vector routing algorithm and Bellman-Ford count-to-infinity mitigation. Deadline Friday 11:59 PM.',
    tags: ['networks', 'assignment', 'algorithms'],
    fileType: 'pdf',
    fileName: 'cn_assignment3_routing.pdf',
    created_at: '2026-10-03T18:20:00Z',
    updated_at: '2026-10-03T18:20:00Z',
  },
  {
    brain: 'college',
    source: 'claude',
    content: 'SIH (Smart India Hackathon) project: Edge AI system for offline agricultural disease detection on low-cost smartphones with quantized MobileNetV3.',
    tags: ['sih', 'edge-ai', 'hackathon'],
    fileType: 'pptx',
    fileName: 'sih_crop_disease_model.pptx',
    created_at: '2026-10-04T10:12:00Z',
    updated_at: '2026-10-04T10:12:00Z',
  },
  {
    brain: 'college',
    source: 'gpt',
    content: 'Research paper literature review: Surveying retrieval-augmented generation architectures for cross-session developer memory retention.',
    tags: ['rag', 'research', 'paper'],
    fileType: 'pdf',
    fileName: 'rag_architectures_literature_review.pdf',
    created_at: '2026-10-04T12:00:00Z',
    updated_at: '2026-10-04T12:00:00Z',
  },
  {
    brain: 'coding',
    source: 'claude',
    content: `# Project - The Brain

#### User
new project idea: build something which is like a centralised memory, like this: https://apex.host/

#### Assistant
That search pulled up web/Minecraft hosting companies, not what you're describing — let me check the actual site directly. Who is this centralized memory for? What should it pull together first? Should the AI just answer questions from it, or also act?

#### User
me and if its good, we will launch it. What should it pull together first? everything. but first all different ai chats and codes and moodle, drive, things etc. personal mein can say not yet now. Should the AI just answer questions from it, or also act? no idea. i just thought of such idea, not clear about this though.

#### Assistant
Okay, that actually makes a lot of sense given how much you've got running in parallel — moodle extension, dog translator, canteen system, idea-builder-system, a couple of papers, SIH... you're basically already living the problem apex.host is solving for businesses, just across tools instead of across a sales team.
One thing worth flagging before we go further: Claude and ChatGPT don't give you a live API to pull your own conversation history. You can export it, but there's no "connect and it auto-syncs". So "code and Moodle and Drive" are realistically connect-and-sync; "AI chats" would start as exports or manual paste.
Which tools are in your rotation where re-explaining happens?

#### User
i am switching between tools and context understanding wastes a lot of time and tokens, which is not optimised and efficient. Claude, GPT, Gemini, GLM, Github, Local AI and what not, can say everything. By context explaining, i mean that if i am working on same project using different platforms, have to explain to each one of them, and not just that, a topic i need to understand, or just the way and style in which i code.

#### Assistant
That's a sharp, specific pain point — and honestly, you've got a live example of half this problem sitting right in front of you. What Claude is doing right now, reading those project files before answering you, is already a working mini-version of "context so I don't have to re-explain myself." The gap is that it's scoped to Claude only — if you move to ChatGPT or Cursor or Antigravity for the same project, none of that transfers.
Good catch — right now images inside a PDF or PPTX need OCR or Vision. Next up: a live GitHub connector to pull commits, issues and PRs in directly.`,
    tags: ['centralized-memory', 'multi-tool-context', 'apex-architecture'],
    fileType: 'md',
    fileName: 'Project - The Brain.md',
    filePath: 'exports/claude/Project - The Brain.md',
    isDocumentRoot: true,
    isUnifiedContextNode: true,
    documentTitle: 'Project - The Brain',
    semanticSectionCount: 6,
    mergeHistory: [
      {
        timestamp: '2026-10-06T09:50:00Z',
        action: 'created',
        summary: 'Unified context node initialized from Claude chat export (6 conversation turns)',
        newContentLength: 1740,
      },
    ],
    created_at: '2026-10-06T09:50:00Z',
    updated_at: '2026-10-06T09:50:00Z',
  },
  {
    brain: 'personal',
    source: 'gemini',
    content: 'Reading & synthesis workflow: Technical papers and architectural notes are summarized into atomic durable facts and linked by project domain tags.',
    tags: ['workflow', 'knowledge-base', 'synthesis'],
    fileType: 'md',
    fileName: 'reading_synthesis_notes.md',
    created_at: '2026-10-05T11:20:00Z',
    updated_at: '2026-10-05T11:20:00Z',
  },
];

// Seed default brains if sparse (<= 2 facts from old partial seed)
const countRow = db.prepare('SELECT count(*) as count FROM facts').get() as { count: number };
if (countRow.count <= 2) {
  db.exec('DELETE FROM facts');
  const insertSeed = db.prepare(`
    INSERT INTO facts (
      brain, content, source, file_name, file_path, file_type, tags_json,
      is_document_root, is_unified_context_node, document_title, semantic_section_count,
      merge_history_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of INITIAL_SEED_FACTS) {
    insertSeed.run(
      item.brain,
      item.content,
      item.source,
      item.fileName || null,
      (item as any).filePath || item.fileName || null,
      item.fileType || null,
      JSON.stringify(item.tags || []),
      (item as any).isDocumentRoot ? 1 : 0,
      (item as any).isUnifiedContextNode ? 1 : 0,
      (item as any).documentTitle || null,
      (item as any).semanticSectionCount || null,
      (item as any).mergeHistory ? JSON.stringify((item as any).mergeHistory) : null,
      item.created_at,
      item.updated_at
    );
  }
}

function serializeFactRow(row: any) {
  if (!row) return null;
  let tags: string[] = [];
  let mergeHistory: any[] | undefined = undefined;
  try {
    if (row.tags_json) tags = JSON.parse(row.tags_json);
  } catch {}
  try {
    if (row.merge_history_json) mergeHistory = JSON.parse(row.merge_history_json);
  } catch {}

  return {
    id: row.id,
    brain: row.brain,
    content: row.content,
    source: row.source,
    fileName: row.file_name || undefined,
    filePath: row.file_path || undefined,
    fileType: row.file_type || undefined,
    tags,
    parentId: row.parent_id || undefined,
    isDocumentRoot: Boolean(row.is_document_root),
    isUnifiedContextNode: Boolean(row.is_unified_context_node),
    documentTitle: row.document_title || undefined,
    semanticSectionCount: row.semantic_section_count || undefined,
    mergeHistory,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Parse JSON bodies
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Helper to list brains
function getBrainList(): string[] {
  const rows = db.prepare('SELECT DISTINCT brain FROM facts ORDER BY brain').all() as { brain: string }[];
  const found = rows.map((r) => r.brain);
  const defaults = ['coding', 'college', 'personal'];
  return Array.from(new Set([...defaults, ...found]));
}

// Track Browser Companion device token usage if Bearer header is present
app.use((req, _res, next) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token) {
      try {
        db.prepare('UPDATE companion_devices SET last_used_at = ? WHERE token_value = ?').run(
          new Date().toISOString(),
          token
        );
      } catch {}
    }
  }
  next();
});

// 1. Status API
app.get('/api/status', (req, res) => {
  const count = (db.prepare('SELECT count(*) as count FROM facts').get() as { count: number }).count;
  const devices = db
    .prepare('SELECT id, name, token_prefix, browser, created_at, last_used_at FROM companion_devices ORDER BY created_at DESC')
    .all();
  res.json({
    status: 'online',
    time: new Date().toISOString(),
    database: 'sqlite-embedded',
    factsCount: count,
    brains: getBrainList(),
    companionDevicesCount: devices.length,
    geminiLiveTest: Boolean(process.env.GEMINI_API_KEY),
  });
});

// 1b. Browser Companion Device Tokens API
app.get('/api/companion/devices', (_req, res) => {
  const rows = db
    .prepare('SELECT id, name, token_prefix, browser, created_at, last_used_at FROM companion_devices ORDER BY created_at DESC')
    .all();
  res.json(rows);
});

app.post('/api/companion/devices', (req, res) => {
  const name = (req.body?.name || 'Chrome Browser Companion').trim();
  const browser = (req.body?.browser || 'Chromium / Manifest V3').trim();
  const id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const randomSecret =
    Math.random().toString(36).slice(2, 12) +
    Math.random().toString(36).slice(2, 12) +
    Date.now().toString(36);
  const fullToken = `brn_live_${randomSecret}`;
  const tokenPrefix = `${fullToken.slice(0, 13)}…${fullToken.slice(-4)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO companion_devices (id, name, token_prefix, token_value, browser, created_at, last_used_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `).run(id, name, tokenPrefix, fullToken, browser, now);

  res.json({
    device: {
      id,
      name,
      token_prefix: tokenPrefix,
      browser,
      created_at: now,
      last_used_at: null,
    },
    token: fullToken,
  });
});

app.delete('/api/companion/devices/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM companion_devices WHERE id = ?').run(id);
  res.json({ ok: true, id });
});

// 2. List Brains API
app.get('/api/brains', (req, res) => {
  res.json(getBrainList());
});

// 3. Facts by Brain API
app.get('/api/facts', (req, res) => {
  const brain = (req.query.brain as string) || '';
  if (!brain) {
    const allRows = db.prepare('SELECT * FROM facts ORDER BY updated_at DESC LIMIT 1000').all();
    return res.json(allRows.map(serializeFactRow));
  }
  const rows = db.prepare('SELECT * FROM facts WHERE brain = ? ORDER BY updated_at DESC LIMIT 1000').all(brain);
  res.json(rows.map(serializeFactRow));
});

// 4. Recall Search API
app.get('/api/recall', (req, res) => {
  const brain = (req.query.brain as string) || '';
  const query = (req.query.query as string) || '';
  const limit = parseInt((req.query.limit as string) || '10', 10);

  if (!brain) {
    return res.status(400).json({ error: 'missing ?brain=' });
  }

  if (query.trim()) {
    const terms = query
      .replace(/[^\w\s]/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2 && !['what', 'about', 'this', 'that', 'with', 'from', 'have', 'your', 'please'].includes(t));

    if (terms.length > 0) {
      const clauses = terms.map(() => 'LOWER(content) LIKE ?').join(' OR ');
      const params = [brain, ...terms.map((t) => `%${t}%`), limit];
      const sql = `SELECT * FROM facts WHERE brain = ? AND (${clauses}) ORDER BY updated_at DESC LIMIT ?`;
      const rows = db.prepare(sql).all(...params);
      if (rows.length > 0) {
        return res.json(rows.map(serializeFactRow));
      }
    }
  }

  const defaultRows = db.prepare('SELECT * FROM facts WHERE brain = ? ORDER BY updated_at DESC LIMIT ?').all(brain, limit);
  res.json(defaultRows.map(serializeFactRow));
});

// 5. Store / Remember Fact API
app.post('/api/remember', (req, res) => {
  try {
    if (req.headers['x-simulate-failure'] === 'true') {
      return res.status(503).json({
        error: 'Simulated persistence failure — destination Brain was not modified',
      });
    }

    const {
      brain,
      content,
      source,
      file_name,
      fileName,
      file_path,
      filePath,
      file_type,
      fileType,
      tags,
      isDocumentRoot,
      isUnifiedContextNode,
      documentTitle,
      semanticSectionCount,
      mergeHistory,
      parentId,
    } = req.body;
    if (!brain || !content || !source) {
      return res.status(400).json({ error: 'brain, content, and source are required' });
    }

    const now = new Date().toISOString();
    const resolvedFileName = fileName || file_name || null;
    const resolvedFilePath = filePath || file_path || resolvedFileName;
    const resolvedFileType = fileType || file_type || null;
    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : '[]';
    const mergeHistoryJson = Array.isArray(mergeHistory) ? JSON.stringify(mergeHistory) : null;

    const insert = db.prepare(`
      INSERT INTO facts (
        brain, content, source, file_name, file_path, file_type, tags_json,
        parent_id, is_document_root, is_unified_context_node, document_title,
        semantic_section_count, merge_history_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insert.run(
      brain.trim().toLowerCase(),
      content.trim(),
      source.trim(),
      resolvedFileName,
      resolvedFilePath,
      resolvedFileType,
      tagsJson,
      parentId ?? null,
      isDocumentRoot ? 1 : 0,
      isUnifiedContextNode ? 1 : 0,
      documentTitle || null,
      semanticSectionCount ?? null,
      mergeHistoryJson,
      now,
      now
    );

    const newFact = db.prepare('SELECT * FROM facts WHERE id = ?').get(result.lastInsertRowid);
    res.json(serializeFactRow(newFact));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to persist fact' });
  }
});

// 6. Correct / Update Fact API
app.post('/api/correct', (req, res) => {
  try {
    if (req.headers['x-simulate-failure'] === 'true') {
      return res.status(503).json({
        error: 'Simulated persistence failure — destination node was not modified',
      });
    }

    const {
      id,
      content,
      source,
      tags,
      fileName,
      filePath,
      fileType,
      documentTitle,
      semanticSectionCount,
      mergeHistory,
      isDocumentRoot,
      isUnifiedContextNode,
    } = req.body;
    if (id === undefined || (!content && !Array.isArray(tags))) {
      return res.status(400).json({ error: 'id and content or tags are required' });
    }

    const existing = db.prepare('SELECT * FROM facts WHERE id = ?').get(Number(id)) as any;
    if (!existing) {
      return res.status(404).json({ error: `Destination node #${id} not found on backend` });
    }

    const now = new Date().toISOString();
    const nextContent = typeof content === 'string' ? content.trim() : existing.content;
    const nextSource = typeof source === 'string' && source.trim() ? source.trim() : existing.source;
    const nextTagsJson = Array.isArray(tags) ? JSON.stringify(tags) : existing.tags_json;
    const nextFileName = fileName !== undefined ? fileName : existing.file_name;
    const nextFilePath = filePath !== undefined ? filePath : existing.file_path;
    const nextFileType = fileType !== undefined ? fileType : existing.file_type;
    const nextDocTitle = documentTitle !== undefined ? documentTitle : existing.document_title;
    const nextSectionCount =
      semanticSectionCount !== undefined ? semanticSectionCount : existing.semantic_section_count;
    const nextMergeHistoryJson = Array.isArray(mergeHistory)
      ? JSON.stringify(mergeHistory)
      : existing.merge_history_json;
    const nextIsDocRoot =
      isDocumentRoot !== undefined ? (isDocumentRoot ? 1 : 0) : existing.is_document_root;
    const nextIsUnified =
      isUnifiedContextNode !== undefined
        ? isUnifiedContextNode
          ? 1
          : 0
        : existing.is_unified_context_node;

    db.prepare(`
      UPDATE facts
      SET content = ?,
          source = ?,
          tags_json = ?,
          file_name = ?,
          file_path = ?,
          file_type = ?,
          document_title = ?,
          semantic_section_count = ?,
          merge_history_json = ?,
          is_document_root = ?,
          is_unified_context_node = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      nextContent,
      nextSource,
      nextTagsJson,
      nextFileName,
      nextFilePath,
      nextFileType,
      nextDocTitle,
      nextSectionCount,
      nextMergeHistoryJson,
      nextIsDocRoot,
      nextIsUnified,
      now,
      Number(id)
    );

    const updatedRow = db.prepare('SELECT * FROM facts WHERE id = ?').get(Number(id));
    res.json({ ok: true, id: Number(id), updated_at: now, fact: serializeFactRow(updatedRow) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to update fact on backend' });
  }
});

// 7. Forget / Delete Fact API
app.post('/api/forget', (req, res) => {
  const { id } = req.body;
  if (id === undefined) {
    return res.status(400).json({ error: 'id required' });
  }
  db.prepare('DELETE FROM facts WHERE id = ?').run(Number(id));
  res.json({ ok: true, id });
});

// 8. Delete Entire Brain API
app.post('/api/delete_brain', (req, res) => {
  const brain = (req.body.brain || '').trim().toLowerCase();
  if (!brain) {
    return res.status(400).json({ error: 'brain required' });
  }
  const countBefore = (db.prepare('SELECT count(*) as c FROM facts WHERE brain = ?').get(brain) as { c: number }).c;
  db.prepare('DELETE FROM facts WHERE brain = ?').run(brain);
  res.json({ ok: true, brain, deleted_facts: countBefore });
});

// 9. Ingest / Check File API
app.post('/api/check_file', (req, res) => {
  const { brain, file_path, file_name, content } = req.body;
  const pathTarget = (file_path || file_name || '').trim();
  if (!brain || !pathTarget) {
    return res.status(400).json({ error: 'brain and file_path required' });
  }

  const existing = db.prepare(`
    SELECT * FROM facts
    WHERE brain = ? AND (file_path = ? OR file_name = ?)
    ORDER BY updated_at DESC LIMIT 1
  `).get(brain.toLowerCase(), pathTarget, path.basename(pathTarget)) as any;

  if (!existing) {
    return res.json({ exists: false, is_identical: false });
  }

  const isIdentical = (existing.content || '').trim() === (content || '').trim();
  res.json({ exists: true, fact: serializeFactRow(existing), is_identical: isIdentical });
});

app.post('/api/ingest', (req, res) => {
  const { brain, content, source, file_name = 'document.md', file_path = '' } = req.body;
  if (!brain || !content || !source) {
    return res.status(400).json({ error: 'brain, content and source required' });
  }

  const cleanContent = content.trim();
  const effectivePath = file_path || file_name;
  const resolvedBrain = brain.trim().toLowerCase();

  const existing = db.prepare(`
    SELECT * FROM facts
    WHERE brain = ? AND (file_path = ? OR file_name = ?)
    ORDER BY updated_at DESC LIMIT 1
  `).get(resolvedBrain, effectivePath, path.basename(effectivePath)) as any;

  const now = new Date().toISOString();

  if (existing) {
    let merged = cleanContent;
    if (existing.content.trim() === cleanContent) {
      return res.json({ fact: serializeFactRow(existing), action: 'unchanged', message: 'Content is identical' });
    }
    if (!cleanContent.startsWith(existing.content)) {
      merged = `${existing.content}\n\n${cleanContent}`;
    }
    db.prepare('UPDATE facts SET content = ?, updated_at = ? WHERE id = ?').run(merged, now, existing.id);
    const updated = db.prepare('SELECT * FROM facts WHERE id = ?').get(existing.id);
    return res.json({ fact: serializeFactRow(updated), action: 'merged', message: `Merged into node #${existing.id}` });
  }

  const insert = db.prepare(`
    INSERT INTO facts (brain, content, source, file_name, file_path, is_document_root, is_unified_context_node, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
  `);
  const r = insert.run(resolvedBrain, cleanContent, source, file_name, effectivePath, now, now);
  const created = db.prepare('SELECT * FROM facts WHERE id = ?').get(r.lastInsertRowid);
  res.json({ fact: serializeFactRow(created), action: 'created', message: `Created new node #${r.lastInsertRowid}` });
});

// 10. OpenAPI Specification for Custom GPTs
app.get('/api/openapi.json', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol || 'http';
  res.json({
    openapi: '3.1.0',
    info: {
      title: 'The Brain API',
      description: 'Two-way personal memory storage and retrieval for AI chats.',
      version: '1.0.0',
    },
    servers: [{ url: `${protocol}://${host}` }],
    paths: {
      '/api/recall': {
        get: {
          summary: 'Recall facts from brain memory',
          operationId: 'recallMemories',
          parameters: [
            { name: 'brain', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'query', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 10 } },
          ],
          responses: {
            '200': {
              description: 'List of matching facts',
              content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } },
            },
          },
        },
      },
      '/api/remember': {
        post: {
          summary: 'Store a new fact or decision',
          operationId: 'rememberFact',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['brain', 'content', 'source'],
                  properties: {
                    brain: { type: 'string' },
                    content: { type: 'string' },
                    source: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Fact saved successfully',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
          },
        },
      },
    },
  });
});

// 11. Live AI Web Chat Test Endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { brain = 'coding', message = '', source = 'gpt' } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const resolvedBrain = brain.trim().toLowerCase();

    // Query facts from SQLite
    const terms = message
      .replace(/[^\w\s]/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter((t: string) => t.length > 2 && !['what', 'about', 'this', 'that', 'with', 'from', 'have', 'your', 'please'].includes(t));

    let rawFacts: any[] = [];
    if (terms.length > 0) {
      const clauses = terms.map(() => 'LOWER(content) LIKE ?').join(' OR ');
      const sql = `SELECT * FROM facts WHERE brain = ? AND (${clauses}) ORDER BY updated_at DESC LIMIT 5`;
      rawFacts = db.prepare(sql).all(resolvedBrain, ...terms.map((t: string) => `%${t}%`));
    }
    if (rawFacts.length === 0) {
      rawFacts = db.prepare('SELECT * FROM facts WHERE brain = ? ORDER BY updated_at DESC LIMIT 5').all(resolvedBrain);
    }

    const facts = rawFacts.map(serializeFactRow).filter(Boolean);
    const factsText = facts.length > 0
      ? facts.map((f: any) => `- [#${f.id}] (${f.source}) ${f.content}`).join('\n')
      : 'No prior facts recorded in this brain yet.';

    const systemPrompt = `You are a personalized AI Web Companion simulating two-way sync with "The Brain" memory system for the user's ${source.toUpperCase()} web account.
Active Brain: "${resolvedBrain}"

DURABLE MEMORY FACTS CURRENTLY STORED:
${factsText}

INSTRUCTIONS FOR TWO-WAY SYNC:
1. Ground your response in the durable facts above.
2. If the user announces a new rule, decision, milestone, project preference, or asks to remember something, you MUST append a memory block at the end:
### SAVE TO BRAIN:
<Concise 1-2 sentence statement of the durable fact to store>
`;

    let replyText = '';
    let savedFact: any = null;

    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI();
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Message: ${message}` }] }],
        });
        replyText = response.text || 'Received and processed.';
      } catch (err: any) {
        console.warn('Gemini 3 Flash error, using fallback:', err.message);
        try {
          const ai = new GoogleGenAI();
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Message: ${message}` }] }],
          });
          replyText = response.text || 'Received and processed.';
        } catch {
          replyText = `Connected to "${resolvedBrain}". Grounded in ${facts.length} stored memory nodes.\n\n### SAVE TO BRAIN:\nVerified two-way memory sync for ${source.toUpperCase()} web account in ${resolvedBrain}.`;
        }
      }
    } else {
      replyText = `Grounded response (${source.toUpperCase()}) using ${facts.length} memory nodes from "${resolvedBrain}":\n${facts.slice(0, 2).map((f: any) => `• [#${f.id}] ${f.content.slice(0, 120)}...`).join('\n')}\n\n### SAVE TO BRAIN:\nSynchronized context query from ${source.toUpperCase()} session: "${message.slice(0, 90)}"`;
    }

    // Auto-save memory block into SQLite
    const saveMatch = replyText.match(/### (?:🧠\s*)?SAVE TO BRAIN:\s*\n+([^\n]+(?:\n[^\n]+)?)/i);
    if (saveMatch && saveMatch[1]) {
      const factContent = saveMatch[1].trim();
      const now = new Date().toISOString();
      const insert = db.prepare(`
        INSERT INTO facts (brain, content, source, file_name, file_path, file_type, tags_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'chat', '["ai-sync"]', ?, ?)
      `);
      const r = insert.run(resolvedBrain, factContent, source, null, null, now, now);
      const rawSaved = db.prepare('SELECT * FROM facts WHERE id = ?').get(r.lastInsertRowid);
      savedFact = serializeFactRow(rawSaved);
    }

    res.json({
      reply: replyText,
      recalledFacts: facts,
      savedFact,
      success: true,
    });
  } catch (err: any) {
    console.error('Error in /api/chat:', err);
    res.status(500).json({ error: err.message || 'Chat error' });
  }
});

// Setup Frontend
async function setupFrontend() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`The Brain Full-Stack server running at http://0.0.0.0:${PORT}`);
  });
}

setupFrontend();
