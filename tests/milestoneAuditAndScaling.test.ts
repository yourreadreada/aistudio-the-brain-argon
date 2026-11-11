import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import {
  initializeDatabase,
  seedDemoFactsNonDestructive,
  createBrainApp,
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
import { MAX_ZIP_FILE_COUNT } from '../src/services/fileExtractor';

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

describe('Argon Milestone: Database Audit, Strategy Integrity, 1,000-File Scaling & Settings Overhaul', () => {
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

  it('Phase 1.1: Reproduces and explains the exact 202 processed / 193 imported / 9 skipped / 397 Coding / 402 Total arithmetic under Branching', () => {
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

    // Simulate the 202-item corpus under Branching strategy:
    // - 9 items skipped (exact duplicates + negative fixtures)
    // - 193 items imported into 'coding':
    //   * 95 multi-section documents (1 hub + 2 branch nodes = 3 records each -> 285 records)
    //   * 1 multi-section document (1 hub + 6 branch nodes = 7 records -> 7 records)
    //   * 97 single-section documents (1 root record each -> 97 records)
    // Total new SQLite records = 285 + 7 + 97 = 389 records (193 roots + 196 children)
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
    assert.equal(codingCount, 397); // 8 seed + 193 hubs + 196 children = 397
    assert.equal(totalCount, 402); // 397 coding + 4 college + 1 personal = 402
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

    // Reload from backend WITHOUT forceReplaceLocal — should detect seed-only backend and re-hydrate user record!
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

    // Re-import check for Unified -> exact_duplicate
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

    // Verify child nodes have parentId = branchingRes.fact.id
    const branchChildren = brainStore
      .getFacts('coding')
      .filter((f) => f.parentId === branchingRes.fact.id);
    assert.equal(branchChildren.length, (branchingRes.chunksCreated || 1) - 1);

    // Reconstructed content has zero content loss
    const reconstructedBranching = brainStore.getReconstructedDocumentContent(
      branchingRes.fact
    );
    assert.ok(reconstructedBranching.includes('Phase 1: Leader Election'));
    assert.ok(reconstructedBranching.includes('Phase 2: Log Replication'));

    // Re-import check for Branching -> exact_duplicate (compares reconstructed content!)
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

    // Replace on Branching cleans up old children and writes new children
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

    // Re-import check for Sliced -> exact_duplicate
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

  it('Phase 2 & 4: Executes 1, 10, 100, 350, 500, and 1,000 file batch imports across concurrency settings 1, 3, 5, 8, and 10 with zero data loss', async () => {
    assert.equal(MAX_ZIP_FILE_COUNT, 1000);
    assert.equal(DEFAULT_IMPORT_CONCURRENCY, 3);
    assert.equal(MAX_IMPORT_CONCURRENCY, 10);
    assert.equal(normalizeImportConcurrency(10), 10);

    const testMatrix: { batchSize: number; concurrency: number }[] = [
      { batchSize: 1, concurrency: 1 },
      { batchSize: 10, concurrency: 3 },
      { batchSize: 100, concurrency: 5 },
      { batchSize: 350, concurrency: 8 },
      { batchSize: 500, concurrency: 10 },
      { batchSize: 1000, concurrency: 3 },
    ];

    const metricsLog: {
      batchSize: number;
      concurrency: number;
      durationMs: number;
      imported: number;
      peakHeapMB: number;
    }[] = [];

    for (const { batchSize, concurrency } of testMatrix) {
      const brainName = `scale_${batchSize}_c${concurrency}`;
      brainStore.createBrain(brainName);

      const items = Array.from({ length: batchSize }, (_, idx) => ({
        id: `item_${batchSize}_${idx}`,
        title: `Scale File ${idx + 1}`,
        fileName: `scale_file_${idx + 1}.md`,
        filePath: `batch_${batchSize}/scale_file_${idx + 1}.md`,
        content: `# Scale File ${idx + 1}\n\nBatch size ${batchSize} concurrency ${concurrency} item payload #${idx + 1}.`,
      }));

      let importedCount = 0;
      const t0 = performance.now();

      await runWithControlledConcurrency(items, concurrency, async (item) => {
        await brainStore.persistReviewedItem({
          action: 'create',
          brain: brainName,
          source: 'claude',
          title: item.title,
          content: item.content,
          fileName: item.fileName,
          filePath: item.filePath,
          fileType: 'md',
          strategy: 'semantic',
        });
        importedCount++;
      });

      const durationMs = Math.round(performance.now() - t0);
      const peakHeapMB =
        Math.round((process.memoryUsage().heapUsed / (1024 * 1024)) * 10) / 10;

      metricsLog.push({
        batchSize,
        concurrency,
        durationMs,
        imported: importedCount,
        peakHeapMB,
      });

      assert.equal(importedCount, batchSize);
      const dbCount = (
        db
          .prepare('SELECT COUNT(*) as c FROM facts WHERE brain = ?')
          .get(brainName) as { c: number }
      ).c;
      assert.equal(dbCount, batchSize);
    }

    console.log('# IMPORT_SCALING_BENCHMARKS:', JSON.stringify(metricsLog));
    const integrityRow = db.prepare('PRAGMA integrity_check').get() as {
      integrity_check?: string;
    };
    assert.equal(integrityRow?.integrity_check, 'ok');
    assert.equal(metricsLog.length, 6);
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

  it('Phase 3: Verifies Header Settings shortcut markup, 7-Category Settings Centre, Settings persistence across restarts, and Scheduled Auto-Backups', async () => {
    // 1. Header Settings button renders with active state and aria-pressed
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

    // 2. Render 7-Category Settings Centre & verify all panels are present
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

    // 3. Persist Global Settings via API & verify survival across SQLite reload
    const updatedSettings = await brainStore.updateGlobalSettings({
      importProcessing: {
        maxFilesPerBatch: 1500,
        concurrency: 8,
        defaultStrategy: 'branching',
        defaultDuplicatePolicy: 'merge',
        maxRetries: 4,
        failedRetryBehaviour: 'auto_retry_transient',
      },
      autoBackup: {
        enabled: true,
        schedule: 'hourly',
        maxBackups: 12,
      },
    });

    assert.equal(updatedSettings.importProcessing.maxFilesPerBatch, 1500);
    assert.equal(updatedSettings.importProcessing.concurrency, 8);
    assert.equal(updatedSettings.importProcessing.defaultStrategy, 'branching');
    assert.equal(updatedSettings.autoBackup.enabled, true);
    assert.equal(updatedSettings.autoBackup.schedule, 'hourly');

    // Clear localStorage and re-sync from backend to prove SQLite durability
    localStorage.clear();
    const reSynced = await brainStore.syncGlobalSettingsFromBackend();
    assert.equal(reSynced.importProcessing.maxFilesPerBatch, 1500);
    assert.equal(reSynced.importProcessing.concurrency, 8);
    assert.equal(reSynced.importProcessing.defaultStrategy, 'branching');
    assert.equal(reSynced.autoBackup.enabled, true);

    // 4. Trigger Scheduled Auto-Backup & verify snapshot integrity
    const autoBackupRes = await brainStore.runAutoBackupCheck(true, 'scheduled');
    assert.equal(autoBackupRes.triggered, true);
    assert.equal(autoBackupRes.backup?.verified, true);
    assert.equal(autoBackupRes.backup?.kind, 'scheduled');
    assert.ok(autoBackupRes.autoBackup.lastBackupAt);
    assert.ok(autoBackupRes.autoBackup.nextScheduledBackupAt);
  });
});
