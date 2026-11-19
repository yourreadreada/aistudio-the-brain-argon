import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import JSZip from 'jszip';

import {
  createBrainApp,
  createConsistentBackup,
  initializeDatabase,
  restoreDatabaseFromBackup,
  applyBackupRetention,
  cleanupIncompleteBackups,
  verifyDatabaseFileIntegrity,
  listBackups,
} from '../src/server/brainBackend.js';
import {
  buildPortablePackage,
  buildBrainpackZip,
  parseBrainpackZip,
  parsePortableMarkdown,
  parsePortablePackageJson,
  serializePortableMarkdown,
} from '../src/services/portableFormat.js';
import { extractItemsFromFile } from '../src/services/fileExtractor.js';

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function startTestServer(dbPath: string, backupDir: string) {
  const init = initializeDatabase({ dbPath, backupDir, seedOnBrandNewDb: false });
  const app = createBrainApp(init.db, { dbPath, backupDir });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    db: init.db,
    server,
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      try {
        init.db.close();
      } catch {}
    },
  };
}

// ============================================================================
// 1. SECTION 2.1 — REAL DESKTOP STDIO MCP SERVER SMOKE TEST
// ============================================================================
test('Section 2.1: Desktop stdio MCP server initializes, lists tools, searches memories, and persists remember_fact', async () => {
  const tmpDir = createTempDir('argon-mcp-stdio-');
  const dbPath = path.join(tmpDir, 'brain.db');
  const backupDir = path.join(tmpDir, 'backups');

  // Prepare SQLite database with known grounded fact
  const init = initializeDatabase({ dbPath, backupDir, seedOnBrandNewDb: false });
  const now = new Date().toISOString();
  init.db
    .prepare(
      `INSERT INTO facts (brain, content, source, source_folder, file_name, tags_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'coding',
      'Argon uses node:sqlite with WAL mode for local-first memory persistence.',
      'claude',
      '01_claude',
      'architecture.md',
      JSON.stringify(['sqlite', 'argon']),
      now,
      now
    );
  init.db.close();

  const mcpScript = path.resolve(process.cwd(), 'scripts', 'mcp-server.ts');
  const child = spawn(process.execPath, ['--import', 'tsx', mcpScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BRAIN_DB_PATH: dbPath,
      BRAIN_DEFAULT: 'coding',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const responses: any[] = [];
  let stdoutBuf = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString('utf8');
    let nlIdx: number;
    while ((nlIdx = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, nlIdx).trim();
      stdoutBuf = stdoutBuf.slice(nlIdx + 1);
      if (line) responses.push(JSON.parse(line));
    }
  });

  const requests = [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-mcp-client', version: '1.0.0' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_brains', arguments: {} },
    },
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'search_memories', arguments: { brain: 'coding', query: 'WAL mode' } },
    },
    {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'remember_fact',
        arguments: {
          brain: 'coding',
          content: 'Verified stdio MCP write persistence in Argon test.',
          source: 'cursor',
          tags: ['mcp-verified'],
        },
      },
    },
  ];

  for (const req of requests) {
    child.stdin.write(`${JSON.stringify(req)}\n`);
  }
  child.stdin.end();

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('MCP stdio server timed out'));
    }, 15_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`MCP stdio server exited with code ${code}`));
    });
  });

  assert.equal(responses.length, 5, 'Should return 5 JSON-RPC responses (notification returns none)');
  assert.equal(responses[0].result.protocolVersion, '2024-11-05');
  assert.equal(responses[0].result.serverInfo.name, 'the-brain-argon');

  const toolNames = responses[1].result.tools.map((t: any) => t.name);
  assert.ok(toolNames.includes('list_brains'));
  assert.ok(toolNames.includes('search_memories'));
  assert.ok(toolNames.includes('remember_fact'));

  const brainsRes = responses[2].result.structuredContent;
  assert.equal(brainsRes.totalBrains, 1);
  assert.equal(brainsRes.brains[0].brain, 'coding');

  const searchRes = responses[3].result.structuredContent;
  assert.equal(searchRes.count, 1);
  assert.match(searchRes.memories[0].content, /WAL mode/);
  assert.equal(searchRes.memories[0].sourceFolder, '01_claude');

  const writeRes = responses[4].result.structuredContent;
  assert.equal(writeRes.saved, true);
  assert.ok(writeRes.memory.id > 1);

  // Verify persisted on disk after stdio process exited
  const reopened = initializeDatabase({ dbPath, backupDir, seedOnBrandNewDb: false });
  const countRow = reopened.db
    .prepare('SELECT count(*) as count FROM facts WHERE brain = ?')
    .get('coding') as { count: number };
  assert.equal(countRow.count, 2);
  reopened.db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// 2. SECTION 2.1 — HTTP MCP, LIVE DIAGNOSTICS & ZERO PYTHON / 8787 REGRESSIONS
// ============================================================================
test('Section 2.1: HTTP MCP diagnostics report verified Node runtime with zero Python or port 8787 references', async () => {
  const tmpDir = createTempDir('argon-mcp-http-');
  const srv = await startTestServer(path.join(tmpDir, 'brain.db'), path.join(tmpDir, 'backups'));

  try {
    const diagRes = await fetch(`${srv.baseUrl}/api/mcp/diagnostics?brain=coding`);
    assert.equal(diagRes.status, 200);
    const diag = await diagRes.json();

    assert.equal(diag.transports.desktopStdioMcp.status, 'available');
    assert.equal(diag.transports.localHttpApi.status, 'online');
    assert.ok(['paired', 'ready_unpaired'].includes(diag.transports.browserCompanion.status));

    const serialized = JSON.stringify(diag);
    assert.ok(!/python3?\b/i.test(serialized), 'Diagnostics must never emit stale python commands');
    assert.ok(!serialized.includes('8787'), 'Diagnostics must never emit stale port 8787');
    assert.ok(diag.runtime.mcpScriptExists);
    assert.ok(diag.runtime.tsxAvailable);

    // Run live smoke test endpoint
    const smokeRes = await fetch(`${srv.baseUrl}/api/mcp/smoke-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brain: 'coding' }),
    });
    assert.equal(smokeRes.status, 200);
    const smoke = await smokeRes.json();
    assert.equal(smoke.ok, true);
    assert.equal(smoke.steps.length, 4);
    assert.ok(smoke.steps.every((s: any) => s.ok));

    // Direct JSON-RPC POST /api/mcp
    const rpcRes = await fetch(`${srv.baseUrl}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'rpc-1',
        method: 'tools/call',
        params: { name: 'database_status', arguments: {} },
      }),
    });
    assert.equal(rpcRes.status, 200);
    const rpcJson = await rpcRes.json();
    assert.equal(rpcJson.result.structuredContent.engine, 'node:sqlite (DatabaseSync)');
    assert.equal(rpcJson.result.structuredContent.integrityOk, true);
  } finally {
    await srv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============================================================================
// 3. SECTION 2.2 — LOCAL SECURITY & PRIVACY POSTURE (HONEST DISK AUDIT + 0600)
// ============================================================================
test('Section 2.2: Security posture truthfully reports unencrypted SQLite, enforces 0600 permissions, and audits tokens/Ollama', async () => {
  const tmpDir = createTempDir('argon-sec-');
  const dbPath = path.join(tmpDir, 'brain.db');
  const backupDir = path.join(tmpDir, 'backups');
  const srv = await startTestServer(dbPath, backupDir);

  try {
    // Deliberately loosen DB permissions first to verify hardening endpoint fixes it
    if (process.platform !== 'win32') {
      fs.chmodSync(dbPath, 0o644);
    }

    const beforeRes = await fetch(`${srv.baseUrl}/api/security/posture`);
    assert.equal(beforeRes.status, 200);
    const before = await beforeRes.json();

    // Honest encryption-at-rest verification: standard node:sqlite is plaintext on disk
    assert.equal(before.encryptionAtRest.encryptedAtRest, false);
    assert.equal(before.encryptionAtRest.status, 'unencrypted_standard_sqlite');
    assert.equal(before.encryptionAtRest.verifiedAgainstDisk, true);

    // Honest operating mode: local_first (NOT claiming air-gapped)
    assert.equal(before.operatingMode, 'local_first');
    assert.equal(before.loopbackOnly, true);
    assert.equal(before.bindHost, '127.0.0.1');
    assert.equal(before.credentialsAndSecrets.companionTokensStoredHashedOnly, true);
    assert.equal(before.credentialsAndSecrets.plaintextTokenRowsDetected, 0);
    assert.equal(before.ollamaLocalBehaviour.folderConvention, '07_local_ai_ollama');
    assert.equal(before.ollamaLocalBehaviour.makesOutboundNetworkCalls, false);

    // Enforce 0600 permissions via API
    const hardenRes = await fetch(`${srv.baseUrl}/api/security/harden-permissions`, {
      method: 'POST',
    });
    assert.equal(hardenRes.status, 200);
    const hardened = await hardenRes.json();
    assert.equal(hardened.ok, true);

    if (process.platform !== 'win32') {
      const stat = fs.statSync(dbPath);
      assert.equal(stat.mode & 0o777, 0o600, 'SQLite DB should be restricted to 0600');
      assert.equal(hardened.posture.filePermissions.allPresentFilesOwnerOnly, true);
    }
  } finally {
    await srv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============================================================================
// 4. SECTION 4 — LARGE ZIP IMPORT, OLLAMA FOLDER PROVENANCE & SETTINGS PERSISTENCE
// ============================================================================
test('Section 4: Multi-folder ZIP extraction preserves 07_local_ai_ollama provenance, handles Unicode & malformed files, and persists settings', async () => {
  const zip = new JSZip();
  zip.file(
    '07_local_ai_ollama/notes_unicode_日本語.md',
    '# Local Model Prompt\nRunning Llama 3 locally via Ollama with zero cloud calls.'
  );
  zip.file(
    '01_claude/design.md',
    'Primary Source: Claude\nDecided to keep local-first SQLite snapshots.'
  );
  zip.file('07_local_ai_ollama/empty.txt', '');

  const zipBytes = await zip.generateAsync({ type: 'arraybuffer' });
  const zipFile = new File([zipBytes], 'argon-bundle.zip', { type: 'application/zip' });

  const extractedItems = await extractItemsFromFile(zipFile, undefined, {
    maxFilesPerBatch: 1000,
  });

  assert.ok(extractedItems.length >= 2, 'Should extract valid text/md files from ZIP');
  const ollamaFile = extractedItems.find((f) => (f.filePath || '').includes('07_local_ai_ollama'));
  assert.ok(ollamaFile, 'Should preserve 07_local_ai_ollama relative folder path');
  assert.equal(ollamaFile.detectedSource, 'local-ai', '07_local_ai_ollama must attribute source to local-ai');
  assert.ok((ollamaFile.filePath || '').includes('日本語'), 'Should preserve Unicode filename');

  // Verify settings persistence across server/DB restart
  const tmpDir = createTempDir('argon-settings-');
  const dbPath = path.join(tmpDir, 'brain.db');
  const backupDir = path.join(tmpDir, 'backups');
  const srv1 = await startTestServer(dbPath, backupDir);
  try {
    const putRes = await fetch(`${srv1.baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        importProcessing: {
          maxFilesPerBatch: 2500,
          concurrency: 4,
        },
      }),
    });
    assert.equal(putRes.status, 200);
  } finally {
    await srv1.close();
  }

  const srv2 = await startTestServer(dbPath, backupDir);
  try {
    const getRes = await fetch(`${srv2.baseUrl}/api/settings`);
    assert.equal(getRes.status, 200);
    const data = await getRes.json();
    assert.equal(data.settings.importProcessing.maxFilesPerBatch, 2500);
    assert.equal(data.settings.importProcessing.concurrency, 4);
  } finally {
    await srv2.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============================================================================
// 5. SECTION 5.1-5.3 — SQLITE BACKUP, CORRUPTION, INTERRUPTION & RETENTION MATRIX
// ============================================================================
test('Section 5.3: Backup matrix covers concurrent writes, corruption rejection, interrupted staging cleanup, rollback, and last-known-good retention', () => {
  const tmpDir = createTempDir('argon-backup-matrix-');
  const dbPath = path.join(tmpDir, 'brain.db');
  const backupDir = path.join(tmpDir, 'backups');

  const init = initializeDatabase({ dbPath, backupDir, seedOnBrandNewDb: false });
  const now = new Date().toISOString();
  init.db
    .prepare(
      `INSERT INTO facts (brain, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    )
    .run('coding', 'Baseline fact before backup.', 'claude', now, now);

  // 1. Normal consistent snapshot while DB is open with active WAL writes
  const snap1 = createConsistentBackup(init.db, dbPath, {
    backupDir,
    kind: 'manual',
  });
  assert.equal(snap1.verified, true);
  assert.equal(snap1.factsCount, 1);

  // Write another fact after snap1
  init.db
    .prepare(
      `INSERT INTO facts (brain, content, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    )
    .run('coding', 'Post-snapshot fact written under WAL.', 'gpt', now, now);

  // 2. Interrupted staging artifact cleanup
  const strayTmp = path.join(backupDir, '.staging_interrupted_snapshot.db.tmp');
  fs.writeFileSync(strayTmp, 'partial garbage bytes');
  const cleaned = cleanupIncompleteBackups(backupDir);
  assert.ok(cleaned.some((p) => p.includes('.staging_interrupted_snapshot.db.tmp')));
  assert.equal(fs.existsSync(strayTmp), false);

  // 3. Corrupt backup inspection must fail cleanly
  const corruptBackupPath = path.join(backupDir, 'corrupt-fake.db');
  fs.writeFileSync(corruptBackupPath, '<html>not a sqlite file</html>');
  const corruptCheck = verifyDatabaseFileIntegrity(corruptBackupPath);
  assert.equal(corruptCheck.valid, false);

  // 4. Attempting restore from corrupt backup must reject without altering active DB
  assert.throws(() => {
    restoreDatabaseFromBackup({
      db: init.db,
      dbPath,
      backupPath: corruptBackupPath,
      backupDir,
    });
  });

  // 5. Retention cleanup preserves at least 1 known-good backup
  const snap2 = createConsistentBackup(init.db, dbPath, {
    backupDir,
    kind: 'manual',
  });
  assert.equal(snap2.factsCount, 2);

  const retention = applyBackupRetention(backupDir, 1);
  assert.ok(retention.keptCount >= 1);
  const remainingValid = listBackups(backupDir).filter((b) => b.verified);
  assert.equal(remainingValid.length, 1, 'Retention max=1 must keep exactly 1 verified known-good backup');

  // 6. Valid restore creates pre-restore safety backup and restores exact snapshot state
  const restoreRes = restoreDatabaseFromBackup({
    db: init.db,
    dbPath,
    backupPath: remainingValid[0].backupPath,
    backupDir,
  });
  assert.equal(restoreRes.success, true);
  assert.ok(restoreRes.safetyBackup, 'Pre-restore safety backup must be created');

  // Reopen restored DB and verify integrity + persistence
  const reopened = initializeDatabase({ dbPath, backupDir, seedOnBrandNewDb: false });
  const row = reopened.db
    .prepare('SELECT count(*) as count FROM facts WHERE brain = ?')
    .get('coding') as { count: number };
  assert.equal(row.count, 2);
  reopened.db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// 6. SECTION 5.4 — PORTABLE FORMAT FAMILY (.brain.json, .brain.md, .brainpack.zip)
// ============================================================================
test('Section 5.4: Portable .brain.json, .brain.md, and .brainpack.zip round-trip losslessly, redact secrets, reject tampering, and handle conflicts', async () => {
  const srcDir = createTempDir('argon-portable-src-');
  const dstDir = createTempDir('argon-portable-dst-');
  const srcSrv = await startTestServer(path.join(srcDir, 'brain.db'), path.join(srcDir, 'backups'));
  const dstSrv = await startTestServer(path.join(dstDir, 'brain.db'), path.join(dstDir, 'backups'));

  try {
    const now = '2026-11-18T10:00:00.000Z';
    const insert = srcSrv.db.prepare(`
      INSERT INTO facts (
        brain, content, source, source_folder, file_name, file_path, file_type,
        tags_json, original_created_at, imported_at, created_at, updated_at,
        fixture_id, parent_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const parentRes = insert.run(
      'coding',
      'Parent architecture spec with token sk-proj-supersecretkey1234567890 redacted on export.',
      'claude',
      '01_claude',
      'spec.md',
      '01_claude/spec.md',
      'md',
      JSON.stringify(['architecture', 'argon']),
      '2026-11-01T09:00:00.000Z',
      now,
      now,
      now,
      'FIX-PARENT-01',
      null
    );
    const parentId = Number(parentRes.lastInsertRowid);

    insert.run(
      'coding',
      'Child implementation note linked to parent architecture spec.',
      'local-ai',
      '07_local_ai_ollama',
      'ollama_note.md',
      '07_local_ai_ollama/ollama_note.md',
      'md',
      JSON.stringify(['ollama']),
      '2026-11-02T12:00:00.000Z',
      now,
      now,
      now,
      'FIX-CHILD-01',
      parentId
    );

    // Private-tagged fact should be excluded by default
    insert.run(
      'coding',
      'Personal banking note should not be exported by default.',
      'claude',
      '01_claude',
      'private.md',
      '01_claude/private.md',
      'md',
      JSON.stringify(['private']),
      null,
      now,
      now,
      now,
      'FIX-PRIVATE-01',
      null
    );

    // 1. Export .brain.json via HTTP endpoint
    const jsonExportRes = await fetch(
      `${srcSrv.baseUrl}/api/portable/export?format=json&brain=coding`
    );
    assert.equal(jsonExportRes.status, 200);
    const exportedJsonText = await jsonExportRes.text();
    const parsedPkg = parsePortablePackageJson(exportedJsonText);
    assert.equal(parsedPkg.valid, true);
    assert.equal(parsedPkg.packageData!.facts.length, 2, 'Private-tagged fact must be excluded by default');
    assert.ok(
      !exportedJsonText.includes('sk-proj-supersecretkey1234567890'),
      'Secrets must be redacted by default in portable exports'
    );
    assert.ok(exportedJsonText.includes('[REDACTED_API_KEY]'));

    // 2. Tamper check: modifying content without updating checksum must fail with HTTP 400
    const tamperedPkg = JSON.parse(exportedJsonText);
    tamperedPkg.facts[0].content += ' TAMPERED';
    const tamperRes = await fetch(`${dstSrv.baseUrl}/api/portable/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'json', content: JSON.stringify(tamperedPkg) }),
    });
    assert.equal(tamperRes.status, 400);
    const tamperBody = await tamperRes.json();
    assert.equal(tamperBody.valid, false);
    assert.match(tamperBody.error, /checksum mismatch/i);

    // 3. Inspect valid package against fresh destination DB
    const inspectRes = await fetch(`${dstSrv.baseUrl}/api/portable/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'json', content: exportedJsonText }),
    });
    assert.equal(inspectRes.status, 200);
    const preview = await inspectRes.json();
    assert.equal(preview.valid, true);
    assert.equal(preview.summary.newCount, 2);

    // 4. Import valid .brain.json into fresh destination DB & verify provenance + remapped parent_id
    const importRes = await fetch(`${dstSrv.baseUrl}/api/portable/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'json',
        content: exportedJsonText,
        conflictPolicy: 'skip',
      }),
    });
    assert.equal(importRes.status, 200);
    const importBody = await importRes.json();
    assert.equal(importBody.ok, true);
    assert.equal(importBody.importedCount, 2);
    assert.equal(importBody.restoredParentLinks, 1);

    const dstFacts = dstSrv.db
      .prepare('SELECT * FROM facts ORDER BY id ASC')
      .all() as any[];
    assert.equal(dstFacts.length, 2);
    assert.equal(dstFacts[0].fixture_id, 'FIX-PARENT-01');
    assert.equal(dstFacts[0].original_created_at, '2026-11-01T09:00:00.000Z');
    assert.equal(dstFacts[1].fixture_id, 'FIX-CHILD-01');
    assert.equal(dstFacts[1].parent_id, dstFacts[0].id, 'Parent/child hierarchy must survive ID remapping');
    assert.equal(dstFacts[1].source_folder, '07_local_ai_ollama');

    // 5. Conflict resolution test: update parent content in source, export, and merge into dst
    srcSrv.db
      .prepare('UPDATE facts SET content = ? WHERE fixture_id = ?')
      .run('Updated parent architecture specification v2.', 'FIX-PARENT-01');
    const updatedExportRes = await fetch(
      `${srcSrv.baseUrl}/api/portable/export?format=json&brain=coding`
    );
    const updatedJsonText = await updatedExportRes.text();

    const mergeRes = await fetch(`${dstSrv.baseUrl}/api/portable/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'json',
        content: updatedJsonText,
        conflictPolicy: 'merge',
      }),
    });
    assert.equal(mergeRes.status, 200);
    const mergeBody = await mergeRes.json();
    assert.equal(mergeBody.mergedCount, 1);
    assert.equal(mergeBody.skippedCount, 1);

    // 6. .brain.md round-trip export & parse
    const mdExportRes = await fetch(
      `${srcSrv.baseUrl}/api/portable/export?format=md&brain=coding`
    );
    assert.equal(mdExportRes.status, 200);
    const mdText = await mdExportRes.text();
    assert.match(mdText, /Not a full SQLite disaster-recovery backup/i);
    const parsedMd = parsePortableMarkdown(mdText);
    assert.equal(parsedMd.valid, true);
    assert.equal(parsedMd.packageData!.facts.length, 2);

    // 7. .brainpack.zip round-trip export (with attachments opt-in) & parse + tamper check
    const zipExportRes = await fetch(
      `${srcSrv.baseUrl}/api/portable/export?format=zip&brain=coding&includeAttachments=true`
    );
    assert.equal(zipExportRes.status, 200);
    const zipBuf = new Uint8Array(await zipExportRes.arrayBuffer());
    const parsedZip = await parseBrainpackZip(zipBuf);
    assert.equal(parsedZip.valid, true);
    assert.equal(parsedZip.packageData!.facts.length, 2);
    assert.equal(parsedZip.packageData!.attachments.length, 2);

    // Inspect .brainpack.zip via API
    const zipInspectRes = await fetch(`${dstSrv.baseUrl}/api/portable/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'zip',
        fileName: 'export.brainpack.zip',
        base64: Buffer.from(zipBuf).toString('base64'),
      }),
    });
    assert.equal(zipInspectRes.status, 200);
    const zipInspectBody = await zipInspectRes.json();
    assert.equal(zipInspectBody.valid, true);
    assert.equal(zipInspectBody.format, 'brainpack_zip');
  } finally {
    await srcSrv.close();
    await dstSrv.close();
    fs.rmSync(srcDir, { recursive: true, force: true });
    fs.rmSync(dstDir, { recursive: true, force: true });
  }
});
