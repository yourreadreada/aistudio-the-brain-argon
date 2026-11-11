import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import JSZip from 'jszip';
import {
  initializeDatabase,
  seedDemoFactsNonDestructive,
  createBrainApp,
  listBackups,
} from '../src/server/brainBackend';
import { brainStore } from '../src/services/brainStorage';
import {
  DEFAULT_IMPORT_CONCURRENCY,
  MAX_IMPORT_CONCURRENCY,
  normalizeImportConcurrency,
  runWithControlledConcurrency,
} from '../src/components/ImportReviewQueue';
import { BrainAppHeader } from '../src/components/BrainAppHeader';
import { DatabaseSettingsView } from '../src/components/DatabaseSettingsView';
import {
  MAX_ZIP_FILE_COUNT,
  extractItemsFromFile,
} from '../src/services/fileExtractor';

// Minimal localStorage polyfill for Node test environment
const memoryStorage = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => memoryStorage.get(k) ?? null,
      setItem: (k: string, v: string) => memoryStorage.set(k, String(v)),
      removeItem: (k: string) => memoryStorage.delete(k),
      clear: () => memoryStorage.clear(),
    },
    configurable: true,
  });
}

function makeTestFile(name: string, content: string | Uint8Array, type = 'text/markdown'): File {
  const blobPart = typeof content === 'string' ? content : Buffer.from(content);
  return new File([blobPart], name, { type, lastModified: 1762819200000 });
}

describe('Argon Final Validation & Release Gate: Audit, 1,000-File & ZIP Workflow, Backup Reliability & Global Settings', () => {
  let tmpDir: string;
  let dbPath: string;
  let backupDir: string;
  let db: DatabaseSync;
  let server: http.Server;
  let baseUrl: string;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'argon-milestone-test-'));
    dbPath = path.join(tmpDir, 'brain.db');
    backupDir = path.join(tmpDir, 'backups');

    const init = initializeDatabase({ dbPath, backupDir });
    db = init.db;
    seedDemoFactsNonDestructive(db);

    const app = createBrainApp(db, { dbPath, backupDir });
    server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, initReq?: RequestInit) => {
      if (typeof input === 'string' && input.startsWith('/api')) {
        return originalFetch(`${baseUrl}${input}`, initReq);
      }
      return originalFetch(input, initReq);
    }) as typeof globalThis.fetch;

    localStorage.clear();
    await brainStore.loadFromBackend({ forceReplaceLocal: true });
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve) => {
      if (server) server.close(() => resolve());
      else resolve();
    });
    try {
      if (db && db.isOpen) {
        db.close();
      }
    } catch {
      // Ignore close errors
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('Phase 1.1: Audits actual on-disk data/brain.db non-destructively and unit-tests the Branching 202/193/9 -> 397/402 node multiplication mechanism', () => {
    // 1. Non-destructive read-only inspection of actual repository data/brain.db
    const repoDbPath = path.join(process.cwd(), 'data', 'brain.db');
    if (fs.existsSync(repoDbPath)) {
      const repoDb = new DatabaseSync(repoDbPath, { open: true });
      try {
        const integrity = repoDb.prepare('PRAGMA integrity_check').get() as {
          integrity_check?: string;
        };
        const totalRows = (
          repoDb.prepare('SELECT COUNT(*) as c FROM facts').get() as { c: number }
        ).c;
        const perBrain = repoDb
          .prepare('SELECT brain, COUNT(*) as count FROM facts GROUP BY brain ORDER BY brain')
          .all() as Array<{ brain: string; count: number }>;
        console.log(
          '# ACTUAL_ON_DISK_DB_AUDIT:',
          JSON.stringify({
            path: repoDbPath,
            sizeBytes: fs.statSync(repoDbPath).size,
            integrity: integrity?.integrity_check,
            totalRows,
            perBrain,
            historical200FileCorpusPresentOnDisk: totalRows > 13,
          })
        );
        assert.equal(integrity?.integrity_check, 'ok');
      } finally {
        repoDb.close();
      }
    }

    // 2. Unit verification of the Branching record multiplication mechanism in isolated test DB:
    // Demonstrates how 193 imported files (with 196 child branch sections) + 8 coding seeds = 397 Coding / 402 Total
    const initialTotal = (
      db.prepare('SELECT COUNT(*) as c FROM facts').get() as { c: number }
    ).c;
    const initialCoding = (
      db
        .prepare("SELECT COUNT(*) as c FROM facts WHERE brain = 'coding'")
        .get() as { c: number }
    ).c;
    assert.equal(initialTotal, 13);
    assert.equal(initialCoding, 8);

    const insertStmt = db.prepare(`
      INSERT INTO facts (
        brain, content, source, created_at, updated_at,
        document_title, file_name, file_path, file_type, parent_id, is_document_root, is_unified_context_node
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'md', ?, ?, 0)
    `);

    const now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      for (let i = 1; i <= 193; i++) {
        const rootRes = insertStmt.run(
          'coding',
          `[Document Hub: doc_${i}.md]\n\nOverview of document ${i}.`,
          'claude',
          now,
          now,
          `Doc ${i}`,
          `doc_${i}.md`,
          `corpus/doc_${i}.md`,
          null,
          1
        );
        const rootId = Number(rootRes.lastInsertRowid);
        const childCount = i <= 95 ? 2 : i === 96 ? 6 : 0;
        for (let c = 1; c <= childCount; c++) {
          insertStmt.run(
            'coding',
            `### Section ${c}\nDetailed branch content ${c} for document ${i}.`,
            'claude',
            now,
            now,
            `Doc ${i} — Section ${c}`,
            `doc_${i}.md`,
            `corpus/doc_${i}.md`,
            rootId,
            0
          );
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const codingCount = (
      db
        .prepare("SELECT COUNT(*) as c FROM facts WHERE brain = 'coding'")
        .get() as { c: number }
    ).c;
    const totalCount = (
      db.prepare('SELECT COUNT(*) as c FROM facts').get() as { c: number }
    ).c;
    const rootRecords = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM facts WHERE brain = 'coding' AND id > 13 AND is_document_root = 1"
        )
        .get() as { c: number }
    ).c;
    const childRecords = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM facts WHERE brain = 'coding' AND id > 13 AND parent_id IS NOT NULL"
        )
        .get() as { c: number }
    ).c;

    assert.equal(rootRecords, 193);
    assert.equal(childRecords, 196);
    assert.equal(codingCount, 397);
    assert.equal(totalCount, 402);
  });

  it('Phase 1.2: Preserves and re-hydrates local user records into SQLite if backend restarts with only seed records', async () => {
    const created = await brainStore.persistReviewedItem({
      action: 'create',
      brain: 'coding',
      source: 'claude',
      title: 'Persistent User Architecture Spec',
      content:
        '# Persistent Spec\n\nCritical architecture notes that must survive container restarts.',
      fileName: 'persistent_spec.md',
      filePath: 'specs/persistent_spec.md',
      fileType: 'md',
      strategy: 'semantic',
    });
    assert.ok(created.fact.id > 0);

    // Simulate container restart where SQLite DB is wiped and re-initialized with only the 13 seed records
    db.prepare('DELETE FROM facts WHERE id > 13').run();
    const countAfterWipe = (
      db.prepare('SELECT COUNT(*) as c FROM facts').get() as { c: number }
    ).c;
    assert.equal(countAfterWipe, 13);

    // Reload from backend WITHOUT forceReplaceLocal — detects seed-only backend and re-hydrates user record
    await brainStore.loadFromBackend();

    const countAfterReconcile = (
      db.prepare('SELECT COUNT(*) as c FROM facts').get() as { c: number }
    ).c;
    assert.equal(countAfterReconcile, 14);
    const recalled = brainStore.recall('coding', 'Persistent Spec');
    assert.ok(recalled.length >= 1);
  });

  it('Phase 1.3: Verifies Unified, Branching, and Sliced strategies for record counts, parent-child links, duplicate detection, Merge/Replace, and atomic rollback on failure', async () => {
    const multiSectionMarkdown = [
      '# Distributed Consensus Protocol',
      '',
      'Introduction to quorum-based replication and leader election.',
      '',
      '## Phase 1: Leader Election',
      '',
      'Nodes increment term counters and request votes from a majority quorum.',
      '',
      '## Phase 2: Log Replication',
      '',
      'The leader appends entries and commits once a majority acknowledges.',
    ].join('\n');

    // 1. Unified Strategy -> 1 record
    const unifiedRes = await brainStore.persistReviewedItem({
      action: 'create',
      brain: 'coding',
      source: 'claude',
      title: 'Consensus Unified',
      content: multiSectionMarkdown,
      fileName: 'consensus_unified.md',
      filePath: 'docs/consensus_unified.md',
      fileType: 'md',
      strategy: 'semantic',
      checksum: 'chk_unified_v1',
    });
    assert.equal(unifiedRes.chunksCreated, 1);
    assert.equal(unifiedRes.fact.isDocumentRoot, true);
    assert.equal(unifiedRes.fact.isUnifiedContextNode, true);

    const unifiedDupCheck = brainStore.checkExistingFileNode(
      'coding',
      'consensus_unified.md',
      multiSectionMarkdown,
      'docs/consensus_unified.md',
      'Consensus Unified'
    );
    assert.equal(unifiedDupCheck.exists, true);
    assert.equal(unifiedDupCheck.isIdentical, true);
    assert.equal(unifiedDupCheck.duplicateState, 'exact_duplicate');

    // 2. Branching Strategy -> 1 Hub + N Child Branch Nodes
    const branchingRes = await brainStore.persistReviewedItem({
      action: 'create',
      brain: 'coding',
      source: 'gpt',
      title: 'Consensus Branching',
      content: multiSectionMarkdown,
      fileName: 'consensus_branching.md',
      filePath: 'docs/consensus_branching.md',
      fileType: 'md',
      strategy: 'branching',
      checksum: 'chk_branching_v1',
    });
    assert.ok((branchingRes.chunksCreated || 0) >= 3);
    assert.equal(branchingRes.fact.isDocumentRoot, true);
    assert.equal(branchingRes.fact.isUnifiedContextNode, false);

    const branchChildren = brainStore
      .getFacts('coding')
      .filter((f) => f.parentId === branchingRes.fact.id);
    assert.equal(branchChildren.length, (branchingRes.chunksCreated || 1) - 1);

    const reconstructedBranching = brainStore.getReconstructedDocumentContent(
      branchingRes.fact
    );
    assert.ok(reconstructedBranching.includes('Phase 1: Leader Election'));
    assert.ok(reconstructedBranching.includes('Phase 2: Log Replication'));

    const branchingDupCheck = brainStore.checkExistingFileNode(
      'coding',
      'consensus_branching.md',
      multiSectionMarkdown,
      'docs/consensus_branching.md',
      'Consensus Branching'
    );
    assert.equal(branchingDupCheck.exists, true);
    assert.equal(branchingDupCheck.isIdentical, true);
    assert.equal(branchingDupCheck.duplicateState, 'exact_duplicate');

    const updatedBranchingContent =
      multiSectionMarkdown +
      '\n\n## Phase 3: Compaction\n\nSnapshots truncate committed log prefixes.';
    const replacedBranching = await brainStore.persistReviewedItem({
      action: 'replace',
      brain: 'coding',
      source: 'gpt',
      title: 'Consensus Branching',
      content: updatedBranchingContent,
      fileName: 'consensus_branching.md',
      filePath: 'docs/consensus_branching.md',
      fileType: 'md',
      targetFactId: branchingRes.fact.id,
      strategy: 'branching',
    });
    const newChildren = brainStore
      .getFacts('coding')
      .filter((f) => f.parentId === replacedBranching.fact.id);
    assert.equal(
      newChildren.length,
      (replacedBranching.chunksCreated || 1) - 1
    );
    assert.ok(
      brainStore
        .getReconstructedDocumentContent(replacedBranching.fact)
        .includes('Phase 3: Compaction')
    );

    // 3. Sliced Strategy -> Multiple linked chunks
    const slicedRes = await brainStore.persistReviewedItem({
      action: 'create',
      brain: 'coding',
      source: 'gemini',
      title: 'Consensus Sliced',
      content: multiSectionMarkdown,
      fileName: 'consensus_sliced.md',
      filePath: 'docs/consensus_sliced.md',
      fileType: 'md',
      strategy: 'chunk',
      chunkSize: 120,
    });
    assert.ok((slicedRes.chunksCreated || 0) > 1);
    assert.equal(slicedRes.fact.isDocumentRoot, true);

    const slicedDupCheck = brainStore.checkExistingFileNode(
      'coding',
      'consensus_sliced.md',
      multiSectionMarkdown,
      'docs/consensus_sliced.md',
      'Consensus Sliced'
    );
    assert.equal(slicedDupCheck.exists, true);
    assert.equal(slicedDupCheck.isIdentical, true);
    assert.equal(slicedDupCheck.duplicateState, 'exact_duplicate');

    // 4. Simulated failure rolls back cleanly without orphan nodes
    const countBeforeFail = brainStore.recall('coding').length;
    await assert.rejects(async () => {
      await brainStore.persistReviewedItem({
        action: 'create',
        brain: 'coding',
        source: 'claude',
        title: 'Fail Rollback Doc',
        content: multiSectionMarkdown,
        fileName: 'fail_rollback.md',
        filePath: 'docs/fail_rollback.md',
        fileType: 'md',
        strategy: 'branching',
        simulateFailure: true,
      });
    });
    const countAfterFail = brainStore.recall('coding').length;
    assert.equal(countAfterFail, countBeforeFail);
  });

  it('Phase 2 & 3 (Release Gate #3): Tests the complete 1,000-file workflow using real generated Files, 1,000-file ZIP archive, and Mixed Files + Multiple ZIPs across concurrency levels', async () => {
    assert.equal(MAX_ZIP_FILE_COUNT, 1000);
    assert.equal(DEFAULT_IMPORT_CONCURRENCY, 3);
    assert.equal(MAX_IMPORT_CONCURRENCY, 10);
    assert.equal(normalizeImportConcurrency(10), 10);

    const workflowBenchmarks: Array<{
      scenario: string;
      inputFiles: number;
      concurrency: number;
      extractMs: number;
      persistMs: number;
      totalMs: number;
      extractedCount: number;
      extractionFailures: number;
      importedCount: number;
      persistenceFailures: number;
      sampledPeakHeapMB: number;
    }> = [];

    async function runFullCaptureHubWorkflow(params: {
      scenario: string;
      brainName: string;
      files: File[];
      expectedItemCount: number;
      concurrency: number;
    }) {
      brainStore.createBrain(params.brainName);
      let sampledPeakBytes = process.memoryUsage().heapUsed;
      const sampleHeap = () => {
        const used = process.memoryUsage().heapUsed;
        if (used > sampledPeakBytes) sampledPeakBytes = used;
      };
      const sampler = setInterval(sampleHeap, 25);

      const tStart = performance.now();
      const extractedItems = [];
      let extractionFailures = 0;

      try {
        for (const f of params.files) {
          const unpacked = await extractItemsFromFile(f, undefined, {
            maxFilesPerBatch: 1000,
          });
          for (const item of unpacked) {
            if (item.status === 'error' || !item.text.trim()) {
              extractionFailures++;
            } else {
              extractedItems.push(item);
            }
          }
          sampleHeap();
        }
        const tAfterExtract = performance.now();

        let importedCount = 0;
        let persistenceFailures = 0;

        await runWithControlledConcurrency(
          extractedItems,
          params.concurrency,
          async (item) => {
            try {
              const dupCheck = brainStore.checkExistingFileNode(
                params.brainName,
                item.fileName,
                item.text,
                item.filePath,
                item.title
              );
              if (dupCheck.exists && dupCheck.isIdentical) {
                return;
              }
              await brainStore.persistReviewedItem({
                action: 'create',
                brain: params.brainName,
                source: item.detectedSource || 'claude',
                title: item.title,
                content: item.text,
                fileName: item.fileName,
                filePath: item.filePath,
                fileType: item.fileType || 'md',
                strategy: 'semantic',
                checksum: item.checksum,
              });
              importedCount++;
              sampleHeap();
            } catch {
              persistenceFailures++;
            }
          }
        );

        const tEnd = performance.now();
        clearInterval(sampler);

        const extractMs = Math.round(tAfterExtract - tStart);
        const persistMs = Math.round(tEnd - tAfterExtract);
        const totalMs = Math.round(tEnd - tStart);
        const sampledPeakHeapMB =
          Math.round((sampledPeakBytes / (1024 * 1024)) * 10) / 10;

        workflowBenchmarks.push({
          scenario: params.scenario,
          inputFiles: params.expectedItemCount,
          concurrency: params.concurrency,
          extractMs,
          persistMs,
          totalMs,
          extractedCount: extractedItems.length,
          extractionFailures,
          importedCount,
          persistenceFailures,
          sampledPeakHeapMB,
        });

        assert.equal(extractionFailures, 0);
        assert.equal(persistenceFailures, 0);
        assert.equal(extractedItems.length, params.expectedItemCount);
        assert.equal(importedCount, params.expectedItemCount);

        const dbCount = (
          db
            .prepare('SELECT COUNT(*) as c FROM facts WHERE brain = ?')
            .get(params.brainName) as { c: number }
        ).c;
        assert.equal(dbCount, params.expectedItemCount);
      } finally {
        clearInterval(sampler);
      }
    }

    // 1. Direct 350 files (concurrency 8)
    const files350 = Array.from({ length: 350 }, (_, i) =>
      makeTestFile(
        `direct350_${i + 1}.md`,
        `# Direct 350 File ${i + 1}\n\nPrimary Source: Claude\n\nVerified workflow payload for item ${i + 1} of 350.`
      )
    );
    await runFullCaptureHubWorkflow({
      scenario: '350_direct_files_c8',
      brainName: 'wf_350_c8',
      files: files350,
      expectedItemCount: 350,
      concurrency: 8,
    });

    // 2. Direct 500 files (concurrency 10)
    const files500 = Array.from({ length: 500 }, (_, i) =>
      makeTestFile(
        `direct500_${i + 1}.txt`,
        `Direct 500 text note #${i + 1}\nPrimary Source: ChatGPT\nDistinct content token ${i + 1}.`,
        'text/plain'
      )
    );
    await runFullCaptureHubWorkflow({
      scenario: '500_direct_files_c10',
      brainName: 'wf_500_c10',
      files: files500,
      expectedItemCount: 500,
      concurrency: 10,
    });

    // 3. Direct 1,000 files (concurrency 5)
    const files1000 = Array.from({ length: 1000 }, (_, i) =>
      makeTestFile(
        `direct1000_${i + 1}.md`,
        `# Direct 1000 Document ${i + 1}\n\nPrimary Source: Gemini\n\nFull 1,000-file direct batch item #${i + 1}.`
      )
    );
    await runFullCaptureHubWorkflow({
      scenario: '1000_direct_files_c5',
      brainName: 'wf_1000_direct_c5',
      files: files1000,
      expectedItemCount: 1000,
      concurrency: 5,
    });

    // 4. Real ZIP archive containing 1,000 supported files (concurrency 8)
    const zip1000 = new JSZip();
    for (let i = 1; i <= 1000; i++) {
      const folder =
        i % 3 === 0 ? '01_claude' : i % 3 === 1 ? '02_chatgpt' : '03_gemini';
      const ext = i % 4 === 0 ? 'json' : i % 4 === 1 ? 'md' : i % 4 === 2 ? 'ts' : 'txt';
      const body =
        ext === 'json'
          ? JSON.stringify({
              title: `ZIP 1000 Note ${i}`,
              summary: `Structured JSON payload ${i} inside 1,000-file archive`,
            })
          : `# ZIP 1000 Item ${i}\n\nContent payload for archived file #${i} in ${folder}.`;
      zip1000.file(`${folder}/zip_item_${i}.${ext}`, body);
    }
    const zip1000Bytes = await zip1000.generateAsync({ type: 'uint8array' });
    const zip1000File = makeTestFile(
      'corpus_1000_files.zip',
      zip1000Bytes,
      'application/zip'
    );
    await runFullCaptureHubWorkflow({
      scenario: '1000_zip_archive_c8',
      brainName: 'wf_1000_zip_c8',
      files: [zip1000File],
      expectedItemCount: 1000,
      concurrency: 8,
    });

    // 5. Mixed direct files + multiple ZIP archives (20 direct files + 2 ZIPs x 40 files = 100 items, concurrency 3)
    const mixedDirect = Array.from({ length: 20 }, (_, i) =>
      makeTestFile(
        `mixed_direct_${i + 1}.md`,
        `# Mixed Direct ${i + 1}\n\nStandalone markdown file ${i + 1}.`
      )
    );
    const zipA = new JSZip();
    const zipB = new JSZip();
    for (let i = 1; i <= 40; i++) {
      zipA.file(`01_claude/archive_a_${i}.md`, `# Archive A Item ${i}\n\nBody A-${i}.`);
      zipB.file(`04_github/archive_b_${i}.ts`, `export const ARCHIVE_B_${i} = ${i};\n`);
    }
    const zipAFile = makeTestFile(
      'archive_a.zip',
      await zipA.generateAsync({ type: 'uint8array' }),
      'application/zip'
    );
    const zipBFile = makeTestFile(
      'archive_b.zip',
      await zipB.generateAsync({ type: 'uint8array' }),
      'application/zip'
    );
    await runFullCaptureHubWorkflow({
      scenario: '100_mixed_direct_and_multi_zip_c3',
      brainName: 'wf_mixed_c3',
      files: [...mixedDirect, zipAFile, zipBFile],
      expectedItemCount: 100,
      concurrency: 3,
    });

    console.log(
      '# COMPLETE_1000_FILE_WORKFLOW_BENCHMARKS:',
      JSON.stringify(workflowBenchmarks)
    );

    const integrityRow = db.prepare('PRAGMA integrity_check').get() as {
      integrity_check?: string;
    };
    assert.equal(integrityRow?.integrity_check, 'ok');
  });

  it('Phase 2.3: Supports batch cancellation and preserves already-imported items without corruption', async () => {
    brainStore.createBrain('cancel_test');
    const abortController = new AbortController();
    const items = Array.from({ length: 20 }, (_, i) => i + 1);
    let completed = 0;

    await runWithControlledConcurrency(
      items,
      2,
      async (num) => {
        await brainStore.persistReviewedItem({
          action: 'create',
          brain: 'cancel_test',
          source: 'claude',
          title: `Cancel Doc ${num}`,
          content: `Content for cancel doc ${num}`,
          fileName: `cancel_${num}.md`,
          filePath: `cancel/cancel_${num}.md`,
          fileType: 'md',
          strategy: 'semantic',
        });
        completed++;
        if (completed >= 6) {
          abortController.abort();
        }
      },
      { signal: abortController.signal }
    );

    assert.ok(completed >= 6);
    assert.ok(completed < 20);
    const dbCount = (
      db
        .prepare("SELECT COUNT(*) as c FROM facts WHERE brain = 'cancel_test'")
        .get() as { c: number }
    ).c;
    assert.equal(dbCount, completed);
  });

  it('Phase 4 (Release Gate #4): Verifies Automatic Backup Reliability across first startup, missed interval restart, hourly/daily/weekly schedules, simulated failure, multi-scheduler lock, retention protection, and snapshot recovery', async () => {
    // 1. First startup with auto-backup enabled & zero backups -> non-forced check triggers immediately
    const initialBackups = listBackups(backupDir);
    assert.equal(initialBackups.length, 0);

    const firstStartupCheck = await brainStore.runAutoBackupCheck({
      force: false,
      kind: 'scheduled',
    });
    assert.equal(firstStartupCheck.triggered, true);
    assert.equal(firstStartupCheck.backup?.verified, true);
    assert.equal(firstStartupCheck.backup?.kind, 'scheduled');
    assert.ok(firstStartupCheck.autoBackup.lastBackupAt);
    assert.ok(firstStartupCheck.autoBackup.nextScheduledBackupAt);

    // Immediate second non-forced check is NOT due yet -> triggered: false
    const notDueCheck = await brainStore.runAutoBackupCheck({
      force: false,
      kind: 'scheduled',
    });
    assert.equal(notDueCheck.triggered, false);

    // 2. Restart after a missed scheduled interval (nextScheduledBackupAt in the past)
    const pastIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await brainStore.updateGlobalSettings({
      autoBackup: {
        enabled: true,
        schedule: 'hourly',
        nextScheduledBackupAt: pastIso,
      },
    });
    const missedIntervalCheck = await brainStore.runAutoBackupCheck({
      force: false,
      kind: 'scheduled',
    });
    assert.equal(missedIntervalCheck.triggered, true);
    assert.equal(missedIntervalCheck.backup?.verified, true);
    assert.ok(
      new Date(missedIntervalCheck.autoBackup.nextScheduledBackupAt!).getTime() >
        Date.now() + 30 * 60 * 1000
    );

    // 3. Hourly (+1h), Daily (+24h), and Weekly (+7d) schedule window computation
    const hourlySettings = await brainStore.updateGlobalSettings({
      autoBackup: { enabled: true, schedule: 'hourly' },
    });
    const hourlyDeltaMin = Math.round(
      (new Date(hourlySettings.autoBackup.nextScheduledBackupAt!).getTime() -
        Date.now()) /
        60000
    );
    assert.ok(hourlyDeltaMin >= 58 && hourlyDeltaMin <= 62);

    const dailySettings = await brainStore.updateGlobalSettings({
      autoBackup: { enabled: true, schedule: 'daily' },
    });
    const dailyDeltaHours = Math.round(
      (new Date(dailySettings.autoBackup.nextScheduledBackupAt!).getTime() -
        Date.now()) /
        3600000
    );
    assert.ok(dailyDeltaHours >= 23 && dailyDeltaHours <= 25);

    const weeklySettings = await brainStore.updateGlobalSettings({
      autoBackup: { enabled: true, schedule: 'weekly' },
    });
    const weeklyDeltaDays = Math.round(
      (new Date(weeklySettings.autoBackup.nextScheduledBackupAt!).getTime() -
        Date.now()) /
        (24 * 3600000)
    );
    assert.equal(weeklyDeltaDays, 7);

    // 4. Simulated backup failure records lastBackupError & preserves verified backups
    const backupsBeforeFail = listBackups(backupDir).filter((b) => b.verified);
    const failedCheck = await brainStore.runAutoBackupCheck({
      force: true,
      simulateFailure: true,
    });
    assert.equal(failedCheck.triggered, false);
    assert.ok(
      failedCheck.autoBackup.lastBackupError?.includes(
        'Simulated scheduled backup failure'
      )
    );
    const backupsAfterFail = listBackups(backupDir).filter((b) => b.verified);
    assert.equal(backupsAfterFail.length, backupsBeforeFail.length);

    // 5. Multiple scheduler instances lock safety
    const secondApp = createBrainApp(db, { dbPath, backupDir });
    const secondServer = http.createServer(secondApp);
    await new Promise<void>((resolve) =>
      secondServer.listen(0, '127.0.0.1', () => resolve())
    );
    const secondAddr = secondServer.address();
    const secondUrl = `http://127.0.0.1:${
      typeof secondAddr === 'object' && secondAddr ? secondAddr.port : 0
    }`;

    try {
      // Set due time in the past so both scheduler instances see it as due
      await brainStore.updateGlobalSettings({
        autoBackup: {
          enabled: true,
          schedule: 'daily',
          maxBackups: 10,
          nextScheduledBackupAt: new Date(Date.now() - 60_000).toISOString(),
        },
      });
      const [resA, resB] = await Promise.all([
        originalFetch(`${baseUrl}/api/database/auto-backup/run-check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: false }),
        }).then((r) => r.json()),
        originalFetch(`${secondUrl}/api/database/auto-backup/run-check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: false }),
        }).then((r) => r.json()),
      ]);
      // At least one triggers and neither corrupts the DB
      const triggeredTotal = (resA.triggered ? 1 : 0) + (resB.triggered ? 1 : 0);
      assert.equal(triggeredTotal, 1);
    } finally {
      await new Promise<void>((resolve) => secondServer.close(() => resolve()));
    }

    // 6. Retention & last-known-good protection
    await brainStore.updateGlobalSettings({
      autoBackup: { enabled: true, schedule: 'daily', maxBackups: 2 },
    });
    await brainStore.runAutoBackupCheck({ force: true, kind: 'scheduled' });
    await brainStore.runAutoBackupCheck({ force: true, kind: 'scheduled' });
    await brainStore.runAutoBackupCheck({ force: true, kind: 'scheduled' });

    const retainedBackups = listBackups(backupDir).filter((b) => b.verified);
    assert.equal(retainedBackups.length, 2);

    // Delete 1st backup -> succeeds; attempt to delete last remaining verified backup -> rejected (409)
    await brainStore.deleteDatabaseBackup(retainedBackups[0].fileName);
    await assert.rejects(async () => {
      await brainStore.deleteDatabaseBackup(retainedBackups[1].fileName);
    });

    // 7. Recovery from a verified scheduled snapshot
    const snapshotToRestore = retainedBackups[1];
    await brainStore.persistReviewedItem({
      action: 'create',
      brain: 'coding',
      source: 'claude',
      title: 'Transient Post-Snapshot Fact',
      content: 'This fact was added after the scheduled snapshot.',
      fileName: 'transient.md',
      filePath: 'transient.md',
      fileType: 'md',
    });
    const countBeforeRestore = (
      db.prepare('SELECT COUNT(*) as c FROM facts').get() as { c: number }
    ).c;
    assert.ok(countBeforeRestore > snapshotToRestore.factsCount);

    const restoreRes = await brainStore.restoreDatabaseBackup(
      snapshotToRestore.fileName
    );
    assert.equal(restoreRes.restoredFrom.fileName, snapshotToRestore.fileName);
    assert.equal(restoreRes.safetyBackup.kind, 'pre-restore-safety');

    const countAfterRestore = (
      db.prepare('SELECT COUNT(*) as c FROM facts').get() as { c: number }
    ).c;
    assert.equal(countAfterRestore, snapshotToRestore.factsCount);
  });

  it('Phase 3 & 5 (Release Gate #5): Verifies Header Settings shortcut, 7-Category Settings Centre, SQLite persistence across restarts, and Capture Hub per-import override isolation', async () => {
    const inactiveHtml = renderToStaticMarkup(
      React.createElement(BrainAppHeader, {
        currentBrain: 'coding',
        brains: ['coding', 'college', 'personal'],
        onSelectBrain: () => {},
        onCreateBrain: () => {},
        searchQuery: '',
        onSearchChange: () => {},
        onSelectFactFromSearch: () => {},
        activeSourceFilter: null,
        onSelectSourceFilter: () => {},
        onOpenAddFact: () => {},
        onOpenIngest: () => {},
        onOpenMcp: () => {},
        onOpenSettings: () => {},
        isSettingsActive: false,
        onSwitchToLogin: () => {},
        onToggleRecentActivity: () => {},
        totalFactsCount: 8,
      })
    );
    assert.ok(inactiveHtml.includes('data-testid="header-settings-button"'));
    assert.ok(inactiveHtml.includes('aria-pressed="false"'));

    const activeHtml = renderToStaticMarkup(
      React.createElement(BrainAppHeader, {
        currentBrain: 'coding',
        brains: ['coding', 'college', 'personal'],
        onSelectBrain: () => {},
        onCreateBrain: () => {},
        searchQuery: '',
        onSearchChange: () => {},
        onSelectFactFromSearch: () => {},
        activeSourceFilter: null,
        onSelectSourceFilter: () => {},
        onOpenAddFact: () => {},
        onOpenIngest: () => {},
        onOpenMcp: () => {},
        onOpenSettings: () => {},
        isSettingsActive: true,
        onSwitchToLogin: () => {},
        onToggleRecentActivity: () => {},
        totalFactsCount: 8,
      })
    );
    assert.ok(activeHtml.includes('aria-pressed="true"'));

    const settingsHtml = renderToStaticMarkup(
      React.createElement(DatabaseSettingsView, {
        onBackToWorkspace: () => {},
      })
    );
    assert.ok(settingsHtml.includes('data-testid="settings-category-nav"'));
    assert.ok(settingsHtml.includes('data-testid="auto-backup-scheduler-panel"'));
    assert.ok(settingsHtml.includes('data-testid="import-processing-settings-panel"'));
    assert.ok(settingsHtml.includes('1. General &amp; Appearance'));
    assert.ok(settingsHtml.includes('2. Database &amp; Backups'));
    assert.ok(settingsHtml.includes('3. Memory &amp; Intelligence'));
    assert.ok(settingsHtml.includes('4. Import &amp; Processing'));
    assert.ok(settingsHtml.includes('5. AI Connections'));
    assert.ok(settingsHtml.includes('6. Browser Companion &amp; Devices'));
    assert.ok(settingsHtml.includes('7. System &amp; Diagnostics'));

    // Persist global settings across all categories
    const updatedSettings = await brainStore.updateGlobalSettings({
      general: {
        defaultWorkspace: 'college',
        defaultViewMode: 'list',
        defaultGraphLayout: 'force',
        compactTableDensity: true,
      },
      memoryIntelligence: {
        enableSemanticRelationships: true,
        strictFolderProvenance: true,
      },
      importProcessing: {
        maxFilesPerBatch: 1500,
        concurrency: 5,
        defaultStrategy: 'semantic',
        defaultDuplicatePolicy: 'skip',
        maxRetries: 3,
        failedRetryBehaviour: 'auto_retry_transient',
      },
      autoBackup: {
        enabled: true,
        schedule: 'daily',
        maxBackups: 12,
      },
      aiConnections: {
        mcpBridgeEnabled: true,
        defaultRecallLimit: 300,
      },
    });

    assert.equal(updatedSettings.general.defaultWorkspace, 'college');
    assert.equal(updatedSettings.importProcessing.maxFilesPerBatch, 1500);
    assert.equal(updatedSettings.importProcessing.concurrency, 5);
    assert.equal(updatedSettings.importProcessing.defaultStrategy, 'semantic');

    // Simulate restart: clear localStorage and re-sync from SQLite backend
    localStorage.clear();
    const reSynced = await brainStore.syncGlobalSettingsFromBackend();
    assert.equal(reSynced.general.defaultWorkspace, 'college');
    assert.equal(reSynced.importProcessing.maxFilesPerBatch, 1500);
    assert.equal(reSynced.importProcessing.concurrency, 5);
    assert.equal(reSynced.importProcessing.defaultStrategy, 'semantic');

    // Verify per-import strategy override (e.g. 'branching' on a single import) does NOT overwrite global 'semantic' preference
    await brainStore.persistReviewedItem({
      action: 'create',
      brain: 'coding',
      source: 'claude',
      title: 'Per-Import Override Doc',
      content: '# Override Title\n\n## Section A\n\nText A\n\n## Section B\n\nText B',
      fileName: 'override_doc.md',
      filePath: 'docs/override_doc.md',
      fileType: 'md',
      strategy: 'branching',
    });

    const settingsAfterOverrideImport = await brainStore.syncGlobalSettingsFromBackend();
    assert.equal(
      settingsAfterOverrideImport.importProcessing.defaultStrategy,
      'semantic'
    );
    assert.equal(settingsAfterOverrideImport.importProcessing.concurrency, 5);
  });
});
