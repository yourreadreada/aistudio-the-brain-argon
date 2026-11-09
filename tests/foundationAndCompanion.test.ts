import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import JSZip from 'jszip';

import {
  initializeDatabase,
  runSchemaMigrations,
  seedDemoFactsNonDestructive,
  backupDatabaseFile,
  generateCompanionToken,
  hashCompanionToken,
  verifyCompanionToken,
  createBrainApp,
  isAllowedCorsOrigin,
  resolveBindHost,
  MAX_COMPANION_ITEMS_PER_REQUEST,
  MAX_COMPANION_ITEM_CONTENT_LENGTH,
} from '../src/server/brainBackend';
import {
  scanActivePageAndResources,
  parseGitHubUrl,
} from '../src/services/extensionScanner';
import { packageBrowserExtension } from '../scripts/package-extension.mjs';

// Helper to spin up an ephemeral HTTP server for Express app integration tests
async function withTestServer(
  db: DatabaseSync,
  fn: (baseUrl: string) => Promise<void>
): Promise<void> {
  const app = createBrainApp(db);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('Phase 1 & Phase 2: Argon Foundation + Browser Companion Completion', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-argon-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // ==========================================================================
  // 1. SQLite initialization, schema migrations & backup
  // ==========================================================================
  describe('1. SQLite initialization and schema migrations', () => {
    it('applies all versioned migrations idempotently and migrates legacy plaintext tokens to SHA-256 hashes', () => {
      const dbPath = path.join(tempDir, 'legacy.db');
      const legacyDb = new DatabaseSync(dbPath);
      legacyDb.exec(`
        CREATE TABLE facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          brain TEXT NOT NULL,
          content TEXT NOT NULL,
          source TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE companion_devices (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          token_prefix TEXT NOT NULL,
          token_value TEXT NOT NULL,
          browser TEXT,
          created_at TEXT NOT NULL,
          last_used_at TEXT
        );
      `);
      const legacyPlainToken = 'brn_live_legacyplainsecret1234567890';
      legacyDb
        .prepare(
          `INSERT INTO companion_devices (id, name, token_prefix, token_value, browser, created_at)
           VALUES ('dev_legacy', 'Legacy Chrome', 'brn_live_lega…7890', ?, 'Chrome', '2026-10-01T00:00:00Z')`
        )
        .run(legacyPlainToken);
      legacyDb.close();

      const backupDir = path.join(tempDir, 'backups');
      const { db, appliedMigrations } = initializeDatabase(dbPath, {
        seedOnBrandNewDb: false,
        backupDir,
      });

      assert.ok(appliedMigrations.length >= 4, 'Should apply all 4 schema migrations');

      // Verify pre-migration backup was created
      const backups = fs.readdirSync(backupDir);
      assert.ok(backups.length >= 1, 'Should create automatic pre-migration database backup');

      // Verify legacy token_value was hashed into token_hash and cleared from token_value
      const deviceRow = db
        .prepare(
          'SELECT id, token_value, token_hash, revoked_at FROM companion_devices WHERE id = ?'
        )
        .get('dev_legacy') as any;
      assert.equal(deviceRow.token_value, '', 'Legacy plaintext token_value must be scrubbed');
      assert.equal(
        deviceRow.token_hash,
        hashCompanionToken(legacyPlainToken),
        'Legacy token must be migrated to SHA-256 token_hash'
      );

      // Re-running migrations should be a safe no-op
      const secondRun = runSchemaMigrations(db);
      assert.equal(secondRun.appliedMigrations.length, 0, 'Repeated migration run must be idempotent');
      db.close();
    });
  });

  // ==========================================================================
  // 2. Existing-data preservation when DB has 1 or 2 facts
  // ==========================================================================
  describe('2. Existing-data preservation (1 or 2 facts bug fix)', () => {
    it('NEVER deletes existing user facts when database contains 1 or 2 records', () => {
      const dbPath = path.join(tempDir, 'user-single-fact.db');
      const setupDb = new DatabaseSync(dbPath);
      runSchemaMigrations(setupDb);
      setupDb
        .prepare(
          `INSERT INTO facts (brain, content, source, created_at, updated_at)
           VALUES ('personal', 'My single precious user fact that must never be deleted', 'claude', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`
        )
        .run();
      setupDb.close();

      // Re-open through initializeDatabase with seedOnBrandNewDb: true
      const { db, seededCount, isBrandNew } = initializeDatabase(dbPath, {
        seedOnBrandNewDb: true,
        backupDir: path.join(tempDir, 'backups'),
      });

      assert.equal(isBrandNew, false);
      assert.equal(seededCount, 0, 'Must not auto-seed an existing user database');

      const rows = db.prepare('SELECT * FROM facts').all() as any[];
      assert.equal(rows.length, 1, 'Existing single fact must be preserved intact');
      assert.equal(
        rows[0].content,
        'My single precious user fact that must never be deleted'
      );

      // Add a second fact and re-initialize again (testing count === 2 boundary)
      db.prepare(
        `INSERT INTO facts (brain, content, source, created_at, updated_at)
         VALUES ('coding', 'Second user fact', 'gpt', '2026-11-02T00:00:00Z', '2026-11-02T00:00:00Z')`
      ).run();
      db.close();

      const { db: db2 } = initializeDatabase(dbPath, {
        seedOnBrandNewDb: true,
        backupDir: path.join(tempDir, 'backups'),
      });
      const rowsAfter2 = db2.prepare('SELECT * FROM facts ORDER BY id ASC').all() as any[];
      assert.equal(rowsAfter2.length, 2, 'Both user facts must remain intact');
      assert.equal(
        rowsAfter2[0].content,
        'My single precious user fact that must never be deleted'
      );
      assert.equal(rowsAfter2[1].content, 'Second user fact');
      db2.close();
    });
  });

  // ==========================================================================
  // 3. Seed behavior on empty vs non-empty databases
  // ==========================================================================
  describe('3. Seed behavior on brand-new vs existing databases', () => {
    it('seeds demo data on a genuinely brand-new database and supports non-destructive demo seeding', () => {
      const newDbPath = path.join(tempDir, 'brand-new.db');
      const { db, isBrandNew, seededCount } = initializeDatabase(newDbPath, {
        seedOnBrandNewDb: true,
      });

      assert.equal(isBrandNew, true);
      assert.ok(seededCount >= 10, 'Brand-new DB should be seeded with initial demo facts');

      // Delete all facts intentionally as a user action, then reopen DB -> should NOT reseed automatically
      db.exec('DELETE FROM facts');
      db.close();

      const { db: reopenedDb, isBrandNew: reopenedNew, seededCount: reopenedSeeded } =
        initializeDatabase(newDbPath, { seedOnBrandNewDb: true });
      assert.equal(reopenedNew, false);
      assert.equal(
        reopenedSeeded,
        0,
        'Existing DB emptied by user must not be silently reseeded on restart'
      );

      // Explicit non-destructive demo seed should add demo facts without deleting user facts
      reopenedDb
        .prepare(
          `INSERT INTO facts (brain, content, source, created_at, updated_at)
           VALUES ('coding', 'Custom user architecture note', 'cursor', '2026-11-05T00:00:00Z', '2026-11-05T00:00:00Z')`
        )
        .run();
      const added = seedDemoFactsNonDestructive(reopenedDb);
      assert.ok(added >= 10);
      const totalFacts = (
        reopenedDb.prepare('SELECT count(*) as c FROM facts').get() as { c: number }
      ).c;
      assert.equal(totalFacts, 1 + added, 'User fact + demo facts must both exist');
      reopenedDb.close();
    });
  });

  // ==========================================================================
  // 4. Token generation and SHA-256 hashing
  // ==========================================================================
  describe('4. Cryptographic token generation and hashing', () => {
    it('generates high-entropy brn_live_ tokens with SHA-256 hashes and never stores plaintext', () => {
      const t1 = generateCompanionToken();
      const t2 = generateCompanionToken();
      assert.match(t1.fullToken, /^brn_live_[A-Za-z0-9_-]{32,}$/);
      assert.notEqual(t1.fullToken, t2.fullToken);
      assert.equal(t1.tokenHash, hashCompanionToken(t1.fullToken));
      assert.notEqual(t1.tokenHash, t1.fullToken);
      assert.equal(t1.tokenHash.length, 64);
    });
  });

  // ==========================================================================
  // 5, 6, 7. Auth middleware, Device revocation, and Companion endpoint access control
  // ==========================================================================
  describe('5-7. Authentication middleware, device revocation & endpoint access control', () => {
    it('enforces local enrollment intent, verifies Bearer tokens timing-safely, updates last_used_at, and blocks revoked tokens immediately', async () => {
      const dbPath = path.join(tempDir, 'auth.db');
      const { db } = initializeDatabase(dbPath, { seedOnBrandNewDb: false });

      try {
        await withTestServer(db, async (baseUrl) => {
          // 1. Unauthenticated request to /api/companion/devices or /api/companion/captures must be rejected
          const unauthDevices = await fetch(`${baseUrl}/api/companion/devices`);
          assert.equal(unauthDevices.status, 401);

          const unauthCaptures = await fetch(`${baseUrl}/api/companion/captures`);
          assert.equal(unauthCaptures.status, 401);

          // 2. Device creation without explicit UI enrollment intent header must be rejected (401)
          const missingIntentRes = await fetch(`${baseUrl}/api/companion/devices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Rogue Page' }),
          });
          assert.equal(missingIntentRes.status, 401);

          // 3. Valid enrollment from local Capture Hub succeeds and returns full token once
          const enrollRes = await fetch(`${baseUrl}/api/companion/devices`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Brain-Local-Client': 'argon-capture-hub',
              'X-Brain-UI-Intent': 'enroll-device',
            },
            body: JSON.stringify({
              name: 'Workstation Chromium',
              browser: 'Chromium / Manifest V3',
            }),
          });
          assert.equal(enrollRes.status, 201);
          const enrolled = await enrollRes.json();
          assert.match(enrolled.token, /^brn_live_[A-Za-z0-9_-]{32,}$/);
          assert.equal(enrolled.device.name, 'Workstation Chromium');
          assert.equal(enrolled.device.last_used_at, null);
          assert.equal((enrolled.device as any).token_hash, undefined);
          assert.equal((enrolled.device as any).token_value, undefined);

          // Verify SQLite row stores only token_hash, and token_value is empty
          const rawDbRow = db
            .prepare('SELECT token_value, token_hash FROM companion_devices WHERE id = ?')
            .get(enrolled.device.id) as any;
          assert.equal(rawDbRow.token_value, '');
          assert.equal(rawDbRow.token_hash, hashCompanionToken(enrolled.token));

          // 4. Listing devices never exposes plaintext token or token_hash
          const listRes = await fetch(`${baseUrl}/api/companion/devices`, {
            headers: { 'X-Brain-Local-Client': 'argon-capture-hub' },
          });
          assert.equal(listRes.status, 200);
          const devicesList = await listRes.json();
          assert.equal(devicesList.length, 1);
          assert.equal(devicesList[0].token_hash, undefined);
          assert.equal(devicesList[0].token, undefined);

          // 5. Invalid Bearer token is rejected and does NOT update last_used_at
          const badTokenRes = await fetch(`${baseUrl}/api/companion/captures`, {
            headers: { Authorization: 'Bearer brn_live_invalidtoken000000000000' },
          });
          assert.equal(badTokenRes.status, 401);
          const afterBadAuth = verifyCompanionToken(db, enrolled.token);
          assert.ok(afterBadAuth);

          // 6. Valid Bearer token succeeds and updates last_used_at
          const goodTokenRes = await fetch(`${baseUrl}/api/companion/captures`, {
            headers: { Authorization: `Bearer ${enrolled.token}` },
          });
          assert.equal(goodTokenRes.status, 200);

          const updatedDeviceRow = db
            .prepare('SELECT last_used_at FROM companion_devices WHERE id = ?')
            .get(enrolled.device.id) as any;
          assert.ok(updatedDeviceRow.last_used_at, 'last_used_at must be updated after valid auth');

          // 7. Revoking device immediately invalidates its token
          const revokeRes = await fetch(
            `${baseUrl}/api/companion/devices/${enrolled.device.id}/revoke`,
            {
              method: 'POST',
              headers: { 'X-Brain-Local-Client': 'argon-capture-hub' },
            }
          );
          assert.equal(revokeRes.status, 200);

          const afterRevokeRes = await fetch(`${baseUrl}/api/companion/captures`, {
            headers: { Authorization: `Bearer ${enrolled.token}` },
          });
          assert.equal(
            afterRevokeRes.status,
            401,
            'Revoked device token must immediately fail authentication'
          );

          // 8. Deleting device removes it from list
          const delRes = await fetch(
            `${baseUrl}/api/companion/devices/${enrolled.device.id}`,
            {
              method: 'DELETE',
              headers: { 'X-Brain-Local-Client': 'argon-capture-hub' },
            }
          );
          assert.equal(delRes.status, 200);
          const listAfterDel = await (
            await fetch(`${baseUrl}/api/companion/devices`, {
              headers: { 'X-Brain-Local-Client': 'argon-capture-hub' },
            })
          ).json();
          assert.equal(listAfterDel.length, 0);
        });
      } finally {
        db.close();
      }
    });

    it('restricts CORS to local development and extension origins and defaults bind host to 127.0.0.1', () => {
      assert.equal(isAllowedCorsOrigin(undefined), true);
      assert.equal(isAllowedCorsOrigin('http://localhost:3000'), true);
      assert.equal(isAllowedCorsOrigin('http://127.0.0.1:3000'), true);
      assert.equal(isAllowedCorsOrigin('chrome-extension://abcdefghijklmnop'), true);
      assert.equal(isAllowedCorsOrigin('moz-extension://12345678-1234'), true);
      assert.equal(isAllowedCorsOrigin('https://malicious-site.example.com'), false);

      assert.equal(resolveBindHost({}), '127.0.0.1');
      assert.equal(resolveBindHost({ BRAIN_ALLOW_LAN: 'true' }), '0.0.0.0');
      assert.equal(resolveBindHost({ BRAIN_HOST: '192.168.1.50' }), '192.168.1.50');
    });
  });

  // ==========================================================================
  // 8 & 9. Capture input validation, size limits & staging/listing/deletion
  // ==========================================================================
  describe('8-9. Capture input validation, size limits, and atomic staging', () => {
    it('validates source, resourceKind, provenanceUrl scheme, path traversal, item count, content length, and cross-Brain batch isolation', async () => {
      const dbPath = path.join(tempDir, 'captures.db');
      const { db } = initializeDatabase(dbPath, { seedOnBrandNewDb: false });

      try {
        await withTestServer(db, async (baseUrl) => {
          const enrollRes = await fetch(`${baseUrl}/api/companion/devices`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Brain-Local-Client': 'argon-capture-hub',
              'X-Brain-UI-Intent': 'enroll-device',
            },
            body: JSON.stringify({ name: 'Test Companion' }),
          });
          const { token } = await enrollRes.json();
          const authHeaders = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          };

          // 1. Reject invalid source
          const badSource = await fetch(`${baseUrl}/api/companion/captures`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
              brain: 'coding',
              source: 'invalid_source',
              items: [{ title: 'Doc', content: 'Valid content here for testing' }],
            }),
          });
          assert.equal(badSource.status, 400);

          // 2. Reject javascript: provenanceUrl
          const badUrl = await fetch(`${baseUrl}/api/companion/captures`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
              brain: 'coding',
              source: 'github',
              provenanceUrl: 'javascript:alert(1)',
              items: [{ title: 'Doc', content: 'Valid content here for testing' }],
            }),
          });
          assert.equal(badUrl.status, 400);

          // 3. Reject path traversal in fileName
          const badPath = await fetch(`${baseUrl}/api/companion/captures`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
              brain: 'coding',
              source: 'github',
              items: [
                {
                  title: 'Doc',
                  fileName: '../../etc/passwd',
                  content: 'Valid content here for testing',
                },
              ],
            }),
          });
          assert.equal(badPath.status, 400);

          // 4. Reject cross-Brain mismatch in a single batch
          const crossBrain = await fetch(`${baseUrl}/api/companion/captures`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
              brain: 'coding',
              source: 'claude',
              items: [
                {
                  brain: 'personal',
                  title: 'Wrong Brain Item',
                  content: 'Should not cross-contaminate coding brain batch',
                },
              ],
            }),
          });
          assert.equal(crossBrain.status, 400);

          // 5. Reject batch exceeding MAX_COMPANION_ITEMS_PER_REQUEST (50)
          const tooManyItems = Array.from(
            { length: MAX_COMPANION_ITEMS_PER_REQUEST + 1 },
            (_, i) => ({
              title: `Item ${i}`,
              content: `Content for item ${i} with sufficient length`,
            })
          );
          const batchLimitRes = await fetch(`${baseUrl}/api/companion/captures`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
              brain: 'coding',
              source: 'claude',
              items: tooManyItems,
            }),
          });
          assert.equal(batchLimitRes.status, 400);

          // 6. Reject oversized item exceeding MAX_COMPANION_ITEM_CONTENT_LENGTH (500,000) and verify atomic rollback
          const oversizedBatch = await fetch(`${baseUrl}/api/companion/captures`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
              brain: 'coding',
              source: 'claude',
              items: [
                { title: 'Valid First Item', content: 'This first item is valid.' },
                {
                  title: 'Oversized Second Item',
                  content: 'x'.repeat(MAX_COMPANION_ITEM_CONTENT_LENGTH + 10),
                },
              ],
            }),
          });
          assert.equal(oversizedBatch.status, 400);

          // Verify first item was rolled back and 0 captures were persisted
          const listAfterRollback = await (
            await fetch(`${baseUrl}/api/companion/captures`, { headers: authHeaders })
          ).json();
          assert.equal(
            listAfterRollback.length,
            0,
            'Failed batch must roll back atomically without partial staging'
          );

          // 7. Stage valid multi-item batch, list, delete one, and clear
          const validStage = await fetch(`${baseUrl}/api/companion/captures`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
              brain: 'coding',
              source: 'github',
              projectName: 'owner/argon',
              provenanceUrl: 'https://github.com/owner/argon',
              items: [
                {
                  title: 'README.md',
                  fileName: 'README.md',
                  filePath: 'owner/argon/README.md',
                  fileType: 'md',
                  resourceKind: 'document',
                  content: '# Argon README\n\nLocal-first personal memory architecture.',
                  tags: ['github-readme'],
                },
                {
                  title: 'server.ts',
                  fileName: 'server.ts',
                  filePath: 'owner/argon/server.ts',
                  fileType: 'code',
                  resourceKind: 'code',
                  content: 'export const PORT = 3000;\nconsole.log("Argon local server");',
                  tags: ['github-file', 'ts'],
                },
              ],
            }),
          });
          assert.equal(validStage.status, 200);
          const stagedData = await validStage.json();
          assert.equal(stagedData.stagedCount, 2);
          assert.equal(stagedData.items.length, 2);

          // Delete first staged capture
          const firstId = stagedData.items[0].id;
          const delOne = await fetch(`${baseUrl}/api/companion/captures/${firstId}`, {
            method: 'DELETE',
            headers: authHeaders,
          });
          assert.equal(delOne.status, 200);

          const remaining = await (
            await fetch(`${baseUrl}/api/companion/captures`, { headers: authHeaders })
          ).json();
          assert.equal(remaining.length, 1);
          assert.equal(remaining[0].fileName, 'server.ts');

          // Clear remaining captures
          const clearRes = await fetch(`${baseUrl}/api/companion/captures/clear`, {
            method: 'POST',
            headers: authHeaders,
          });
          assert.equal(clearRes.status, 200);
          const afterClear = await (
            await fetch(`${baseUrl}/api/companion/captures`, { headers: authHeaders })
          ).json();
          assert.equal(afterClear.length, 0);
        });
      } finally {
        db.close();
      }
    });
  });

  // ==========================================================================
  // 10. Import Review persistence & failure handling for staged captures
  // ==========================================================================
  describe('10. Import Review persistence and failure handling for staged captures', () => {
    it('completes end-to-end flow: stage capture -> review resolution (Create / Merge / Replace) -> simulated failure preserves staged capture -> retry succeeds and consumes capture', async () => {
      const dbPath = path.join(tempDir, 'e2e-review.db');
      const { db } = initializeDatabase(dbPath, { seedOnBrandNewDb: false });

      try {
        await withTestServer(db, async (baseUrl) => {
          const enrollRes = await fetch(`${baseUrl}/api/companion/devices`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Brain-Local-Client': 'argon-capture-hub',
              'X-Brain-UI-Intent': 'enroll-device',
            },
            body: JSON.stringify({ name: 'E2E Browser Companion' }),
          });
          const { token } = await enrollRes.json();

          // Stage 2 items from Companion
          const stageRes = await fetch(`${baseUrl}/api/companion/captures`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              brain: 'coding',
              source: 'github',
              projectName: 'yourreadreada/aistudio-the-brain-argon',
              provenanceUrl: 'https://github.com/yourreadreada/aistudio-the-brain-argon',
              items: [
                {
                  title: 'Architecture Spec',
                  fileName: 'ARCHITECTURE.md',
                  filePath: 'yourreadreada/aistudio-the-brain-argon/ARCHITECTURE.md',
                  fileType: 'md',
                  resourceKind: 'document',
                  content: '# Argon Architecture\n\nSection 1: SQLite WAL persistence.',
                },
                {
                  title: 'Scanner Module',
                  fileName: 'extensionScanner.ts',
                  filePath: 'yourreadreada/aistudio-the-brain-argon/src/services/extensionScanner.ts',
                  fileType: 'code',
                  resourceKind: 'code',
                  content: 'export function scanActivePageAndResources() { return true; }',
                },
              ],
            }),
          });
          assert.equal(stageRes.status, 200);
          const { items: stagedItems } = await stageRes.json();
          assert.equal(stagedItems.length, 2);

          // Simulate persistence failure on Item 1 (`x-simulate-failure: true`)
          const failAttempt = await fetch(`${baseUrl}/api/remember`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-simulate-failure': 'true',
            },
            body: JSON.stringify({
              brain: stagedItems[0].brain,
              content: stagedItems[0].content,
              source: stagedItems[0].source,
              fileName: stagedItems[0].fileName,
              filePath: stagedItems[0].filePath,
            }),
          });
          assert.equal(failAttempt.status, 503);

          // Verify destination Brain was NOT modified and staged capture is still in SQLite
          const factsAfterFail = await (
            await fetch(`${baseUrl}/api/facts?brain=coding`)
          ).json();
          assert.equal(factsAfterFail.length, 0);
          const pendingCaptures = await (
            await fetch(`${baseUrl}/api/companion/captures`, {
              headers: { 'X-Brain-Local-Client': 'argon-capture-hub' },
            })
          ).json();
          assert.equal(
            pendingCaptures.length,
            2,
            'Staged captures must remain available in queue when persistence fails'
          );

          // Retry Item 1 (Create) -> succeeds, then consume staged capture
          const createRes = await fetch(`${baseUrl}/api/remember`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brain: stagedItems[0].brain,
              content: stagedItems[0].content,
              source: stagedItems[0].source,
              fileName: stagedItems[0].fileName,
              filePath: stagedItems[0].filePath,
              fileType: stagedItems[0].fileType,
              isDocumentRoot: true,
              isUnifiedContextNode: true,
              documentTitle: stagedItems[0].title,
            }),
          });
          assert.equal(createRes.status, 200);
          const createdFact = await createRes.json();
          assert.equal(typeof createdFact.id, 'number');

          // Consume Item 1 from companion_captures after durable confirmation
          await fetch(`${baseUrl}/api/companion/captures/${stagedItems[0].id}`, {
            method: 'DELETE',
            headers: { 'X-Brain-Local-Client': 'argon-capture-hub' },
          });

          // Test Merge / Replace resolution on createdFact via /api/correct
          const mergeRes = await fetch(`${baseUrl}/api/correct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: createdFact.id,
              content: `${createdFact.content}\n\nSection 2: Companion token SHA-256 verification.`,
              source: 'github',
            }),
          });
          assert.equal(mergeRes.status, 200);
          const mergedData = await mergeRes.json();
          assert.equal(mergedData.ok, true);
          assert.match(mergedData.fact.content, /Section 2: Companion token SHA-256/);
        });
      } finally {
        db.close();
      }
    });
  });

  // ==========================================================================
  // 11. Extension scanner extraction, deduplication & GitHub repo scanning
  // ==========================================================================
  describe('11. Extension scanner extraction, deduplication, and deliberate GitHub scanning', () => {
    it('parses GitHub repository URLs accurately across root, tree, and blob views', () => {
      const rootInfo = parseGitHubUrl('https://github.com/yourreadreada/aistudio-the-brain-argon');
      assert.deepEqual(rootInfo, {
        isGitHubRepo: true,
        owner: 'yourreadreada',
        repo: 'aistudio-the-brain-argon',
        branch: 'HEAD',
        viewType: 'repo_root',
        relativePath: '',
      });

      const blobInfo = parseGitHubUrl(
        'https://github.com/yourreadreada/aistudio-the-brain-argon/blob/main/src/server/brainBackend.ts'
      );
      assert.deepEqual(blobInfo, {
        isGitHubRepo: true,
        owner: 'yourreadreada',
        repo: 'aistudio-the-brain-argon',
        branch: 'main',
        viewType: 'blob',
        relativePath: 'src/server/brainBackend.ts',
      });
    });

    it('scans a GitHub repository view (metadata, README, file tree, session-fetched readable files, and binary file reporting) and deduplicates identical items', async () => {
      // Mock DOM representing a GitHub repository root view with README, file tree links (readable + binary), and duplicate elements
      const mockTreeLinks = [
        {
          getAttribute: (name: string) =>
            name === 'href'
              ? '/yourreadreada/aistudio-the-brain-argon/blob/main/src/index.ts'
              : null,
          innerText: 'src/index.ts',
        },
        {
          getAttribute: (name: string) =>
            name === 'href'
              ? '/yourreadreada/aistudio-the-brain-argon/blob/main/docs/diagram.png'
              : null,
          innerText: 'docs/diagram.png',
        },
        {
          getAttribute: (name: string) =>
            name === 'href'
              ? '/yourreadreada/aistudio-the-brain-argon/blob/main/docs/manual.pdf'
              : null,
          innerText: 'docs/manual.pdf',
        },
      ];

      const mockDoc = {
        title: 'yourreadreada/aistudio-the-brain-argon: Local-first AI memory · GitHub',
        querySelector: (selector: string) => {
          if (selector.includes('repository-description')) {
            return {
              innerText:
                'Local-first personal memory and capture hub for AI conversations and code.',
            };
          }
          if (selector.includes('readme')) {
            return {
              innerText:
                'The Brain Argon is a local-first reference implementation with SQLite and ImportReviewQueue.',
            };
          }
          if (selector.includes('hotkey="w"')) {
            return { innerText: 'main' };
          }
          return null;
        },
        querySelectorAll: (selector: string) => {
          if (selector.includes('topic-tag')) {
            return [{ innerText: 'local-first' }, { innerText: 'sqlite' }];
          }
          if (selector.includes('/blob/')) {
            return mockTreeLinks;
          }
          if (selector.includes('pre code')) {
            // Return two identical code blocks to verify intra-scan deduplication
            return [
              {
                className: 'language-typescript',
                innerText:
                  'export const duplicateSnippet = () => console.log("identical code block in DOM");',
              },
              {
                className: 'language-typescript',
                innerText:
                  'export const duplicateSnippet = () => console.log("identical code block in DOM");',
              },
            ];
          }
          return [];
        },
      };

      const fetchedUrls: string[] = [];
      const mockFetch = async (url: string) => {
        fetchedUrls.push(url);
        return {
          ok: true,
          status: 200,
          text: async () =>
            'export function startArgon() {\n  return "Argon server initialized";\n}\n',
        };
      };

      const scanResult = await scanActivePageAndResources(
        mockDoc,
        {
          hostname: 'github.com',
          href: 'https://github.com/yourreadreada/aistudio-the-brain-argon',
          origin: 'https://github.com',
        },
        { fetchImpl: mockFetch, maxGitHubFileFetches: 5 }
      );

      assert.equal(scanResult.source, 'github');
      assert.equal(scanResult.projectName, 'yourreadreada/aistudio-the-brain-argon');

      // Expect:
      // 1) REPOSITORY_OVERVIEW.md
      // 2) README.md
      // 3) src/index.ts (fetched via mockFetch)
      // 4) 1 deduplicated code snippet (second identical snippet skipped)
      assert.equal(scanResult.items.length, 4);
      assert.equal(fetchedUrls.length, 1);
      assert.equal(
        fetchedUrls[0],
        'https://github.com/yourreadreada/aistudio-the-brain-argon/raw/main/src/index.ts'
      );

      // Binary files (diagram.png, manual.pdf) must be reported in unreachableResources
      assert.equal(scanResult.unreachableResources.length, 2);
      assert.ok(
        scanResult.unreachableResources.some((u) => u.name === 'docs/diagram.png')
      );
      assert.ok(
        scanResult.unreachableResources.some((u) => u.name === 'docs/manual.pdf')
      );

      // Scan metrics must reflect discovered, captured, and skipped counts accurately
      assert.equal(scanResult.metrics.captured, 4);
      assert.ok(
        scanResult.metrics.skipped >= 3,
        'Should count 2 binary files + 1 duplicate code snippet as skipped'
      );
    });
  });

  // ==========================================================================
  // 12. Extension packaging & Manifest V3 validity
  // ==========================================================================
  describe('12. Extension packaging and Manifest V3 validity', () => {
    it('packages a valid Manifest V3 ZIP archive containing all required files and zero secrets or databases', async () => {
      const outDir = path.join(tempDir, 'dist-ext');
      const result = await packageBrowserExtension({ outDir });

      assert.equal(result.manifest.manifest_version, 3);
      assert.equal(result.manifest.version, '0.3.0');
      assert.ok(fs.existsSync(result.versionedPath));
      assert.ok(fs.existsSync(result.latestPath));
      assert.ok(result.sizeBytes > 1000);

      // Inspect generated ZIP contents
      const zipBuf = fs.readFileSync(result.versionedPath);
      const zip = await JSZip.loadAsync(zipBuf);
      const zipFileNames = Object.keys(zip.files);

      assert.ok(zipFileNames.includes('manifest.json'));
      assert.ok(zipFileNames.includes('popup.html'));
      assert.ok(zipFileNames.includes('popup.js'));
      assert.ok(zipFileNames.includes('README.md'));
      assert.ok(zipFileNames.includes('icons/icon16.png'));
      assert.ok(zipFileNames.includes('icons/icon48.png'));
      assert.ok(zipFileNames.includes('icons/icon128.png'));
      assert.ok(
        !zipFileNames.some((f) => f.endsWith('.db') || f.includes('.env')),
        'Extension archive must never contain database or environment files'
      );
    });
  });
});
