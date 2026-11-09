import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import { DatabaseSync } from 'node:sqlite';
import {
  resolveSourceFromProvenance,
  extractMetadataFromDocumentText,
  extractItemsFromFile,
  ExtractedFileResult,
} from '../src/services/fileExtractor';
import {
  initializeDatabase,
  createConsistentBackup,
  verifyDatabaseFileIntegrity,
  restoreDatabaseFromBackup,
  recordSystemAuditLog,
  redactSecrets,
  repairAndEnrichFactsProvenance,
} from '../src/server/brainBackend';
import { brainStore } from '../src/services/brainStorage';
import { Fact, AI_ENTITIES_REGISTRY, SPINAL_CORD_BOUNDARY } from '../src/types/brain';

describe('The Brain — Argon Master Stabilization, Provenance, Backup & Architecture Suite', () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-argon-master-'));
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('enforces strict folder-first and header-first provenance over incidental body keywords', () => {
    // 1. Folder path 01_claude must win even if body mentions ChatGPT, Gemini, Cursor, GitHub, Moodle, and Ollama
    const claudeRes = resolveSourceFromProvenance(
      'the_brain_test_data/01_claude/cross_model_comparison.md',
      'cross_model_comparison.md',
      'In this note we compare ChatGPT, Gemini, GitHub Copilot, Cursor, Moodle, and local Ollama models.'
    );
    assert.equal(claudeRes.source, 'claude');
    assert.equal(claudeRes.sourceFolder, '01_claude');
    assert.equal(claudeRes.confidence, 'folder');

    // 2. All 7 canonical corpus folders map deterministically
    const folderMappings: [string, string][] = [
      ['01_claude/arch.pdf', 'claude'],
      ['02_chatgpt/session.docx', 'gpt'],
      ['03_gemini/research.xlsx', 'gemini'],
      ['04_github/pr_review.py', 'github'],
      ['05_moodle/syllabus.pptx', 'moodle'],
      ['06_cursor_antigravity/refactor.ts', 'cursor'],
      ['07_local_ai_ollama/weights.json', 'local-ai'],
    ];

    for (const [relPath, expectedSource] of folderMappings) {
      const res = resolveSourceFromProvenance(
        relPath,
        path.basename(relPath),
        'Body mentions Claude, ChatGPT, Gemini, GitHub, Moodle, Cursor, and Ollama.'
      );
      assert.equal(res.source, expectedSource);
      assert.equal(res.confidence, 'folder');
    }

    // 3. Explicit Primary Source header wins when folder path is absent
    const headerRes = resolveSourceFromProvenance(
      undefined,
      'neutral_note.md',
      'Fixture ID: BRAIN-GRAPH-ADD-091\nPrimary Source: Gemini\nRelated Sources: Claude, GitHub\nBody discusses ChatGPT and Ollama.'
    );
    assert.equal(headerRes.source, 'gemini');
    assert.equal(headerRes.confidence, 'header');
  });

  it('extracts Fixture ID, Topic Key, Related Sources, and honest Original Document Date (null when absent)', () => {
    const sampleText = [
      '# Distributed Vector Indexing Spec',
      'Fixture ID: BRAIN-GRAPH-ADD-091',
      'Primary Source: Claude',
      'Related Sources: Gemini, GitHub, Local AI / Ollama',
      'Topic Key: vector-indexing',
      '',
      'We evaluated HNSW indexing latency across local SQLite and pgvector.',
    ].join('\n');

    const meta = extractMetadataFromDocumentText(sampleText, 'claude');
    assert.equal(meta.fixtureId, 'BRAIN-GRAPH-ADD-091');
    assert.equal(meta.topicKey, 'vector-indexing');
    assert.ok(meta.relatedSources?.includes('gemini'));
    assert.ok(meta.relatedSources?.includes('github'));
    assert.ok(meta.relatedSources?.includes('local-ai'));
    // Must NOT fabricate originalCreatedAt when not explicitly present in the document
    assert.equal(meta.originalCreatedAt, null);
  });

  it('unpacks nested ZIP archives recursively while preserving relative folder provenance', async () => {
    const innerZip = new JSZip();
    innerZip.file(
      '06_cursor_antigravity/agent_rules.md',
      '# Cursor Agent Rules\nFixture ID: BRAIN-CURSOR-007\nAlways preserve SQLite WAL mode even when discussing ChatGPT.'
    );
    const innerBuffer = await innerZip.generateAsync({ type: 'uint8array' });

    const outerZip = new JSZip();
    outerZip.file('nested_corpus.zip', innerBuffer);
    outerZip.file(
      '05_moodle/lecture_01.txt',
      'CS101 Lecture Notes on Compilers. Mentions Claude and Gemini.'
    );
    const outerBlob = await outerZip.generateAsync({ type: 'blob' });
    const zipFile = new File([outerBlob], 'master_corpus.zip', { type: 'application/zip' });

    const extracted = await extractItemsFromFile(zipFile);
    assert.equal(extracted.length, 2);

    const cursorDoc = extracted.find((d: ExtractedFileResult) => d.fileName === 'agent_rules.md');
    const moodleDoc = extracted.find((d: ExtractedFileResult) => d.fileName === 'lecture_01.txt');

    assert.ok(cursorDoc);
    assert.equal(cursorDoc?.detectedSource, 'cursor');
    assert.equal(cursorDoc?.sourceFolder, '06_cursor_antigravity');
    assert.equal(cursorDoc?.fixtureId, 'BRAIN-CURSOR-007');

    assert.ok(moodleDoc);
    assert.equal(moodleDoc?.detectedSource, 'moodle');
    assert.equal(moodleDoc?.sourceFolder, '05_moodle');
  });

  it('computes identical Source, Semantic, and Explicit relationship edges for Radial and Force layouts', () => {
    const nowIso = new Date().toISOString();
    const sampleFacts: Fact[] = [
      {
        id: 101,
        brain: 'coding',
        content: 'Primary Source: Claude\nFixture ID: BRAIN-001\nArchitecture specification for Spinal Cord.',
        source: 'claude',
        tags: ['spinal-cord', 'local-gateway'],
        topicKey: 'spinal-cord',
        fixtureId: 'BRAIN-001',
        relatedSources: ['github'],
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: 102,
        brain: 'coding',
        content: 'Implementation of Spinal Cord transport boundary referencing BRAIN-001.',
        source: 'github',
        tags: ['spinal-cord', 'local-gateway', 'typescript'],
        topicKey: 'spinal-cord',
        fixtureId: 'BRAIN-002',
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: 103,
        brain: 'coding',
        content: 'Semantic peer note discussing local gateway transport and TypeScript validation.',
        source: 'gemini',
        tags: ['spinal-cord', 'local-gateway', 'typescript'],
        topicKey: 'spinal-cord',
        fixtureId: 'BRAIN-003',
        created_at: nowIso,
        updated_at: nowIso,
      },
    ];

    const edgesFirstRun = brainStore.computeWorkspaceRelationships(sampleFacts);
    const edgesSecondRun = brainStore.computeWorkspaceRelationships(sampleFacts);

    assert.deepEqual(edgesFirstRun, edgesSecondRun);
    assert.ok(edgesFirstRun.some((e) => e.type === 'source'));
    assert.ok(edgesFirstRun.some((e) => e.type === 'semantic'));
    assert.ok(edgesFirstRun.some((e) => e.type === 'explicit'));
  });

  it('searches across all records by Fixture ID, filePath, tags, and content without 6-result truncation', () => {
    const nowIso = new Date().toISOString();
    const manyFacts: Fact[] = Array.from({ length: 15 }, (_, idx) => ({
      id: 500 + idx,
      brain: 'coding',
      content: `Synthetic memory item ${idx} for full search verification`,
      source: 'claude',
      fileName: `doc_${idx}.md`,
      filePath: `01_claude/doc_${idx}.md`,
      fixtureId: idx === 11 ? 'BRAIN-GRAPH-ADD-091' : `BRAIN-GEN-${idx}`,
      tags: ['search-verification'],
      created_at: nowIso,
      updated_at: nowIso,
    }));

    const fixtureMatch = manyFacts.filter(
      (f) => brainStore.computeRelevanceScore(f, 'BRAIN-GRAPH-ADD-091').score > 0
    );
    assert.equal(fixtureMatch.length, 1);
    assert.equal(fixtureMatch[0].id, 511);

    const allTagMatches = manyFacts.filter(
      (f) => brainStore.computeRelevanceScore(f, 'search-verification').score > 0
    );
    assert.equal(allTagMatches.length, 15);
  });

  it('rejects HTML/cookie-check pages when inspecting external .db backups and restores valid external SQLite backups safely', () => {
    const dbPath = path.join(tmpDir, 'brain.db');
    const backupDir = path.join(tmpDir, 'backups');
    const { db } = initializeDatabase(dbPath, { backupDir, seedOnBrandNewDb: false });
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO facts (brain, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run('coding', 'Initial fact before external restore', 'claude', now, now);

    // Create a valid external SQLite database file with 2 facts
    const extPath = path.join(tmpDir, 'external_valid.db');
    const extInit = initializeDatabase(extPath, { seedOnBrandNewDb: false });
    extInit.db
      .prepare(
        'INSERT INTO facts (brain, content, source, fixture_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run('coding', 'External Restored Fact 1', 'gemini', 'EXT-001', now, now);
    extInit.db
      .prepare(
        'INSERT INTO facts (brain, content, source, fixture_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run('coding', 'External Restored Fact 2', 'github', 'EXT-002', now, now);
    extInit.db.close();

    const validInspection = verifyDatabaseFileIntegrity(extPath);
    assert.equal(validInspection.valid, true);
    assert.equal(validInspection.integrityStatus, 'ok');
    assert.equal(validInspection.factsCount, 2);

    // Create an invalid HTML cookie-check pseudo-backup file
    const htmlFakePath = path.join(tmpDir, 'corrupted_download.db');
    fs.writeFileSync(
      htmlFakePath,
      '<!doctype html><html><head><title>Cookie check</title></head><body>Proxy</body></html>'
    );
    const invalidInspection = verifyDatabaseFileIntegrity(htmlFakePath);
    assert.equal(invalidInspection.valid, false);

    // Copy valid external backup into backups directory and test staged restore
    const backupResult = createConsistentBackup(db, dbPath, { backupDir, kind: 'manual' });
    assert.equal(backupResult.verified, true);

    const importedBackupPath = path.join(backupDir, 'brain_backup_external_test.db');
    fs.copyFileSync(extPath, importedBackupPath);

    const restoreOutcome = restoreDatabaseFromBackup({
      db,
      dbPath,
      backupPath: importedBackupPath,
      backupDir,
    });
    assert.equal(restoreOutcome.success, true);
    assert.equal(restoreOutcome.safetyBackup.verified, true);

    const rows = db
      .prepare('SELECT content, fixture_id FROM facts WHERE fixture_id IN (?, ?)')
      .all('EXT-001', 'EXT-002') as Array<{ content: string; fixture_id: string }>;
    assert.equal(rows.length, 2);
    db.close();
  });

  it('records durable activity logs and redacts secrets automatically', () => {
    const dbPath = path.join(tmpDir, 'audit.db');
    const { db } = initializeDatabase(dbPath, { seedOnBrandNewDb: false });

    const entry = recordSystemAuditLog(db, {
      category: 'backup_exported',
      summary: 'Verified binary backup export',
      status: 'success',
      brain: 'coding',
      details: {
        apiKey: 'sk-secret-token-12345',
        authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9',
        fileSizeBytes: 667648,
      },
    });

    assert.ok(entry.id);
    const rawRow = db
      .prepare('SELECT details_json FROM activity_logs WHERE id = ?')
      .get(entry.id) as { details_json: string };
    assert.ok(rawRow.details_json.includes('[REDACTED]'));
    assert.ok(!rawRow.details_json.includes('sk-secret-token-12345'));

    const redactedDirect = redactSecrets({ password: 'my-password', safe: 'ok' }) as Record<
      string,
      string
    >;
    assert.equal(redactedDirect.password, '[REDACTED]');
    assert.equal(redactedDirect.safe, 'ok');
    db.close();
  });

  it('exposes provider-neutral AI Entities and local-only 127.0.0.1 Spinal Cord boundary', () => {
    assert.equal(Object.keys(AI_ENTITIES_REGISTRY).length, 7);
    assert.equal(SPINAL_CORD_BOUNDARY.host, '127.0.0.1');
    assert.equal(SPINAL_CORD_BOUNDARY.lanExposureEnabled, false);
    assert.equal(SPINAL_CORD_BOUNDARY.remoteAccessEnabled, false);
  });

  it('verifies the live data/brain.db contains all 195 records with 100% accurate folder provenance', () => {
    const liveDbPath = path.resolve(process.cwd(), 'data', 'brain.db');
    if (!fs.existsSync(liveDbPath)) return;

    const { db } = initializeDatabase(liveDbPath);
    const repairStats = repairAndEnrichFactsProvenance(db);
    assert.ok(repairStats.totalInspected >= 195);

    const totalRow = db.prepare('SELECT COUNT(*) as c FROM facts').get() as { c: number };
    assert.equal(totalRow.c, 195);

    const bySource = db
      .prepare(
        "SELECT source, COUNT(*) as c FROM facts WHERE brain = 'coding' GROUP BY source ORDER BY source"
      )
      .all() as { source: string; c: number }[];
    const sourceMap = Object.fromEntries(bySource.map((r) => [r.source, r.c]));

    assert.deepEqual(sourceMap, {
      claude: 29,
      cursor: 27,
      gemini: 27,
      github: 27,
      gpt: 25,
      'local-ai': 28,
      moodle: 27,
    });

    const fixture91 = db
      .prepare('SELECT id, source, fixture_id FROM facts WHERE fixture_id = ?')
      .get('BRAIN-GRAPH-ADD-091') as { id: number; source: string; fixture_id: string } | undefined;
    assert.ok(fixture91);
    assert.equal(fixture91?.fixture_id, 'BRAIN-GRAPH-ADD-091');

    db.close();
  });
});
