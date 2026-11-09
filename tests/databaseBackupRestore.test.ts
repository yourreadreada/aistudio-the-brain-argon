import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

import {
  initializeDatabase,
  runSchemaMigrations,
  SCHEMA_MIGRATIONS,
  seedDemoFactsNonDestructive,
  createConsistentBackup,
  verifyDatabaseFileIntegrity,
  listBackups,
  applyBackupRetention,
  restoreDatabaseFromBackup,
  cleanupIncompleteBackups,
  createBrainApp,
} from '../src/server/brainBackend';

async function withServer(
  db: DatabaseSync,
  options: { dbPath: string; backupDir: string },
  fn: (baseUrl: string) => Promise<void>
) {
  const app = createBrainApp(db, options);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('Argon — Database, Backup, Restore & Settings Completion Suite', () => {
  let tempRoot: string;

  before(() => {
    tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'argon-db-backup-restore-test-')
    );
  });

  after(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  // ==========================================================================
  // 1. Fresh database initialization
  // ==========================================================================
  describe('1. Fresh database initialization', () => {
    it('initializes a brand-new database with WAL mode, versioned migrations, and zero demo facts when seedOnBrandNewDb=false', () => {
      const dbPath = path.join(tempRoot, 'fresh-init.db');
      const backupDir = path.join(tempRoot, 'fresh-init-backups');

      const result = initializeDatabase(dbPath, {
        backupDir,
        seedOnBrandNewDb: false,
      });

      try {
        assert.equal(result.isBrandNewDb, true);
        assert.equal(result.seededCount, 0);
        assert.equal(
          result.appliedMigrations.length,
          SCHEMA_MIGRATIONS.length
        );
        assert.equal(result.backupPath, null);

        const integrity = verifyDatabaseFileIntegrity(dbPath);
        assert.equal(integrity.valid, true);
        assert.equal(integrity.integrityStatus, 'ok');
        assert.equal(integrity.schemaVersion, 4);
        assert.equal(integrity.factsCount, 0);
      } finally {
        result.db.close();
      }
    });
  });

  // ==========================================================================
  // 2. Existing database preservation across restart
  // ==========================================================================
  describe('2. Existing database preservation across restart', () => {
    it('preserves user facts across multiple restarts and never auto-seeds demo data into an existing database', () => {
      const dbPath = path.join(tempRoot, 'restart-preserve.db');
      const backupDir = path.join(tempRoot, 'restart-preserve-backups');

      // First boot
      const boot1 = initializeDatabase(dbPath, {
        backupDir,
        seedOnBrandNewDb: false,
      });
      const now = new Date().toISOString();
      boot1.db
        .prepare(
          `INSERT INTO facts (brain, content, source, file_name, file_path, file_type, tags_json, created_at, updated_at)
           VALUES ('coding', 'Custom user architecture note #1', 'claude', 'arch.md', 'arch.md', 'md', '["architecture"]', ?, ?)`
        )
        .run(now, now);
      boot1.db.close();

      // Second boot with seedOnBrandNewDb: true — must NOT seed demo facts because DB is not brand-new
      const boot2 = initializeDatabase(dbPath, {
        backupDir,
        seedOnBrandNewDb: true,
      });
      try {
        assert.equal(boot2.isBrandNewDb, false);
        assert.equal(boot2.seededCount, 0);
        assert.equal(boot2.appliedMigrations.length, 0);

        const rows = boot2.db
          .prepare('SELECT id, brain, content FROM facts')
          .all() as Array<{ id: number; brain: string; content: string }>;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].content, 'Custom user architecture note #1');
      } finally {
        boot2.db.close();
      }
    });
  });

  // ==========================================================================
  // 3. Migration execution, migration failure rollback & malformed DB handling
  // ==========================================================================
  describe('3. Migration execution, migration failure rollback & malformed DB handling', () => {
    it('rolls back failed migrations atomically, leaves earlier migrations intact, and creates a verified pre-migration backup', () => {
      const dbPath = path.join(tempRoot, 'migration-rollback.db');
      const backupDir = path.join(tempRoot, 'migration-rollback-backups');

      // Initialize with standard v1-v4 migrations and insert a user fact
      const init = initializeDatabase(dbPath, {
        backupDir,
        seedOnBrandNewDb: false,
      });
      const now = new Date().toISOString();
      init.db
        .prepare(
          `INSERT INTO facts (brain, content, source, created_at, updated_at)
           VALUES ('coding', 'Critical pre-migration user fact', 'gpt', ?, ?)`
        )
        .run(now, now);

      // Define a custom v5 migration that partially mutates state and then throws an error
      const failingMigrations = [
        ...SCHEMA_MIGRATIONS,
        {
          version: 5,
          name: '005_failing_migration',
          up: (db: DatabaseSync) => {
            db.exec(`INSERT INTO app_metadata (key, value, updated_at) VALUES ('partial_v5_key', 'should_rollback', '${now}')`);
            throw new Error('Simulated v5 migration syntax/constraint error');
          },
        },
      ];

      assert.throws(
        () =>
          runSchemaMigrations(
            init.db,
            dbPath,
            backupDir,
            failingMigrations
          ),
        /Simulated v5 migration syntax\/constraint error/
      );

      // Verify v5 was rolled back completely and database remains usable at v4
      const partialRow = init.db
        .prepare(`SELECT value FROM app_metadata WHERE key = 'partial_v5_key'`)
        .get();
      assert.equal(partialRow, undefined, 'Partial migration write must be rolled back');

      const maxVer = (
        init.db
          .prepare('SELECT MAX(version) as ver FROM schema_migrations')
          .get() as { ver: number }
      ).ver;
      assert.equal(maxVer, 4);

      const userFact = init.db
        .prepare('SELECT content FROM facts')
        .get() as { content: string };
      assert.equal(userFact.content, 'Critical pre-migration user fact');

      // Verify that a consistent pre-migration backup was created and verified
      const backups = listBackups(backupDir);
      assert.equal(backups.length, 1);
      assert.equal(backups[0].kind, 'pre-migration');
      assert.equal(backups[0].verified, true);
      assert.equal(backups[0].factsCount, 1);

      init.db.close();
    });

    it('detects and rejects malformed or corrupted database files on startup without overwriting them', () => {
      const corruptPath = path.join(tempRoot, 'corrupted-startup.db');
      const corruptBytes = 'NOT_A_VALID_SQLITE_HEADER_1234567890';
      fs.writeFileSync(corruptPath, corruptBytes, 'utf8');

      assert.throws(
        () => initializeDatabase(corruptPath),
        /Malformed or corrupted SQLite database file/
      );

      // Original file must not be overwritten or truncated
      assert.equal(fs.readFileSync(corruptPath, 'utf8'), corruptBytes);
    });
  });

  // ==========================================================================
  // 4. Non-destructive demo seeding behavior
  // ==========================================================================
  describe('4. Non-destructive demo seeding behavior', () => {
    it('adds missing demo facts without modifying or deleting existing user facts, and is idempotent on repeat runs', () => {
      const dbPath = path.join(tempRoot, 'non-destructive-seed.db');
      const { db } = initializeDatabase(dbPath, { seedOnBrandNewDb: false });

      try {
        const now = new Date().toISOString();
        db.prepare(
          `INSERT INTO facts (brain, content, source, file_name, created_at, updated_at)
           VALUES ('coding', 'User custom fact that must never be deleted', 'claude', 'user_custom.md', ?, ?)`
        ).run(now, now);

        const insertedFirst = seedDemoFactsNonDestructive(db);
        assert.ok(insertedFirst >= 13);

        const insertedSecond = seedDemoFactsNonDestructive(db);
        assert.equal(insertedSecond, 0, 'Second demo seed must be a no-op');

        const customFact = db
          .prepare(`SELECT content FROM facts WHERE file_name = 'user_custom.md'`)
          .get() as { content: string } | undefined;
        assert.ok(customFact);
        assert.equal(
          customFact.content,
          'User custom fact that must never be deleted'
        );
      } finally {
        db.close();
      }
    });
  });

  // ==========================================================================
  // 5 & 6. Consistent SQLite backup (VACUUM INTO) & integrity verification
  // ==========================================================================
  describe('5-6. Consistent SQLite backup (VACUUM INTO) & integrity verification', () => {
    it('creates a consistent, verified snapshot via VACUUM INTO while the WAL database is actively open and written to', () => {
      const dbPath = path.join(tempRoot, 'live-wal.db');
      const backupDir = path.join(tempRoot, 'live-wal-backups');
      const { db } = initializeDatabase(dbPath, {
        backupDir,
        seedOnBrandNewDb: false,
      });

      try {
        const now = new Date().toISOString();
        for (let i = 1; i <= 5; i++) {
          db.prepare(
            `INSERT INTO facts (brain, content, source, file_name, created_at, updated_at)
             VALUES ('coding', ?, 'claude', ?, ?, ?)`
          ).run(`Live WAL Fact #${i}`, `fact_${i}.md`, now, now);
        }

        const backupMeta = createConsistentBackup(db, dbPath, {
          backupDir,
          kind: 'manual',
        });

        assert.equal(backupMeta.verified, true);
        assert.equal(backupMeta.integrityStatus, 'ok');
        assert.equal(backupMeta.factsCount, 5);
        assert.equal(backupMeta.schemaVersion, 4);
        assert.equal(backupMeta.kind, 'manual');
        assert.ok(fs.existsSync(backupMeta.backupPath));
        assert.ok(fs.existsSync(`${backupMeta.backupPath}.meta.json`));

        // Ensure no -wal or -shm files are needed by the self-contained snapshot
        assert.equal(fs.existsSync(`${backupMeta.backupPath}-wal`), false);
        assert.equal(fs.existsSync(`${backupMeta.backupPath}-shm`), false);

        const standaloneCheck = verifyDatabaseFileIntegrity(
          backupMeta.backupPath
        );
        assert.equal(standaloneCheck.valid, true);
        assert.equal(standaloneCheck.factsCount, 5);
      } finally {
        db.close();
      }
    });

    it('cleans up temporary staging files and never exposes an invalid backup if a backup is interrupted or fails verification', () => {
      const dbPath = path.join(tempRoot, 'interrupted-backup.db');
      const backupDir = path.join(tempRoot, 'interrupted-backup-dir');
      const { db } = initializeDatabase(dbPath, {
        backupDir,
        seedOnBrandNewDb: true,
      });

      try {
        assert.throws(
          () =>
            createConsistentBackup(db, dbPath, {
              backupDir,
              simulateInterruptedBackup: true,
            }),
          /Simulated backup interruption/
        );

        assert.throws(
          () =>
            createConsistentBackup(db, dbPath, {
              backupDir,
              simulateCorruptStaging: true,
            }),
          /Backup verification failed on staged snapshot/
        );

        // Verify zero valid backups and zero leftover .tmp files exist in backupDir
        const filesInDir = fs.existsSync(backupDir)
          ? fs.readdirSync(backupDir)
          : [];
        assert.equal(
          filesInDir.filter((f) => f.endsWith('.tmp')).length,
          0,
          'Incomplete .tmp staging files must be cleaned up on failure'
        );
        assert.equal(listBackups(backupDir).length, 0);
      } finally {
        db.close();
      }
    });
  });

  // ==========================================================================
  // 7 & 8. Backup listing, metadata, unique names, and retention rules
  // ==========================================================================
  describe('7-8. Backup listing, metadata, unique names, and retention policy', () => {
    it('creates unique timestamped filenames without overwriting, ignores .tmp files, and preserves the last known-good backup during retention cleanup', () => {
      const dbPath = path.join(tempRoot, 'retention.db');
      const backupDir = path.join(tempRoot, 'retention-backups');
      const { db } = initializeDatabase(dbPath, {
        backupDir,
        seedOnBrandNewDb: true,
      });

      try {
        // Create 4 rapid backups in the same millisecond window
        const b1 = createConsistentBackup(db, dbPath, { backupDir });
        const b2 = createConsistentBackup(db, dbPath, { backupDir });
        const b3 = createConsistentBackup(db, dbPath, { backupDir });
        const b4 = createConsistentBackup(db, dbPath, { backupDir });

        const uniqueNames = new Set([
          b1.fileName,
          b2.fileName,
          b3.fileName,
          b4.fileName,
        ]);
        assert.equal(
          uniqueNames.size,
          4,
          'Every backup must receive a unique filename and never overwrite an existing backup'
        );

        // Plant an orphan .tmp staging file and verify listBackups ignores it
        fs.writeFileSync(
          path.join(backupDir, '.staging_orphan.db.tmp'),
          'partial',
          'utf8'
        );
        const listed = listBackups(backupDir);
        assert.equal(listed.length, 4);
        assert.ok(listed.every((b) => !b.fileName.endsWith('.tmp')));

        // Apply retention with maxBackups = 2
        const ret2 = applyBackupRetention(backupDir, 2);
        assert.equal(ret2.keptCount, 2);
        assert.equal(ret2.deletedCount, 2);
        assert.ok(ret2.lastKnownGoodBackup);

        // Apply retention with maxBackups = 1 (minimum) — must NEVER delete the last known-good backup
        const ret1 = applyBackupRetention(backupDir, 1);
        assert.equal(ret1.keptCount, 1);
        assert.equal(ret1.deletedCount, 1);

        const remaining = listBackups(backupDir);
        assert.equal(remaining.length, 1);
        assert.equal(remaining[0].verified, true);
        assert.equal(remaining[0].fileName, ret1.lastKnownGoodBackup);
      } finally {
        db.close();
      }
    });
  });

  // ==========================================================================
  // 9, 10, 11, 12. Restore validation, safety backup, successful restore & rollback
  // ==========================================================================
  describe('9-12. Restore workflow, pre-restore safety backup, invalid backup rejection & failure rollback', () => {
    it('creates an automatic pre-restore safety backup, restores database state accurately, rejects corrupted backups, and rolls back automatically on failure', () => {
      const dbPath = path.join(tempRoot, 'restore-flow.db');
      const backupDir = path.join(tempRoot, 'restore-flow-backups');
      const { db } = initializeDatabase(dbPath, {
        backupDir,
        seedOnBrandNewDb: false,
      });

      try {
        const now = new Date().toISOString();
        // State A: 2 initial facts
        db.prepare(
          `INSERT INTO facts (brain, content, source, file_name, created_at, updated_at)
           VALUES ('coding', 'State A Fact 1', 'claude', 'a1.md', ?, ?),
                  ('coding', 'State A Fact 2', 'gpt', 'a2.md', ?, ?)`
        ).run(now, now, now, now);

        const stateABackup = createConsistentBackup(db, dbPath, {
          backupDir,
          kind: 'manual',
        });
        assert.equal(stateABackup.factsCount, 2);

        // Mutate live DB to State B: 3 facts (added State B Fact 3)
        db.prepare(
          `INSERT INTO facts (brain, content, source, file_name, created_at, updated_at)
           VALUES ('coding', 'State B Fact 3 (added after backup)', 'gemini', 'b3.md', ?, ?)`
        ).run(now, now);

        const countBeforeRestore = (
          db.prepare('SELECT count(*) as count FROM facts').get() as {
            count: number;
          }
        ).count;
        assert.equal(countBeforeRestore, 3);

        // 10. Reject corrupted backup file before touching live DB
        const corruptBackupPath = path.join(
          backupDir,
          'brain_backup_corrupted.db'
        );
        fs.writeFileSync(
          corruptBackupPath,
          'CORRUPTED_FILE_NOT_SQLITE',
          'utf8'
        );
        assert.throws(
          () =>
            restoreDatabaseFromBackup({
              db,
              dbPath,
              backupPath: corruptBackupPath,
              backupDir,
            }),
          /Cannot restore from invalid or corrupted backup/
        );
        fs.unlinkSync(corruptBackupPath);

        // Verify State B (3 facts) is untouched after rejected restore
        assert.equal(
          (
            db.prepare('SELECT count(*) as count FROM facts').get() as {
              count: number;
            }
          ).count,
          3
        );

        // 12. Simulate failure during live apply and verify automatic rollback to State B (3 facts)
        assert.throws(
          () =>
            restoreDatabaseFromBackup({
              db,
              dbPath,
              backupPath: stateABackup.backupPath,
              backupDir,
              simulateApplyFailure: true,
            }),
          /Restore failed and was safely rolled back to safety backup/
        );

        const countAfterRollback = (
          db.prepare('SELECT count(*) as count FROM facts').get() as {
            count: number;
          }
        ).count;
        assert.equal(
          countAfterRollback,
          3,
          'Live database must be rolled back to State B (3 facts) when restore fails mid-apply'
        );

        // 9 & 11. Perform successful restore to State A (2 facts) and verify safety backup of State B
        const restoreResult = restoreDatabaseFromBackup({
          db,
          dbPath,
          backupPath: stateABackup.backupPath,
          backupDir,
        });

        assert.equal(restoreResult.success, true);
        assert.equal(restoreResult.factsCountAfterRestore, 2);
        assert.equal(restoreResult.safetyBackup.kind, 'pre-restore-safety');
        assert.equal(restoreResult.safetyBackup.verified, true);
        assert.equal(restoreResult.safetyBackup.factsCount, 3);

        const liveFactsAfterRestore = db
          .prepare('SELECT content FROM facts ORDER BY id ASC')
          .all() as Array<{ content: string }>;
        assert.deepEqual(
          liveFactsAfterRestore.map((r) => r.content),
          ['State A Fact 1', 'State A Fact 2']
        );
      } finally {
        db.close();
      }
    });
  });

  // ==========================================================================
  // 13. Settings API endpoints (/api/database/*) & error states
  // ==========================================================================
  describe('13. Settings page API actions, download, retention, restore confirmation & error states', () => {
    it('supports status inspection, manual backup creation, backup file export download, retention updates, confirmed restore, and error handling over HTTP', async () => {
      const dbPath = path.join(tempRoot, 'settings-api.db');
      const backupDir = path.join(tempRoot, 'settings-api-backups');
      const { db } = initializeDatabase(dbPath, {
        backupDir,
        seedOnBrandNewDb: false,
      });

      try {
        const now = new Date().toISOString();
        db.prepare(
          `INSERT INTO facts (brain, content, source, file_name, created_at, updated_at)
           VALUES ('coding', 'Settings API Initial Fact', 'claude', 'init.md', ?, ?)`
        ).run(now, now);

        await withServer(db, { dbPath, backupDir }, async (baseUrl) => {
          // 1. GET /api/database/status
          const statusRes1 = await fetch(`${baseUrl}/api/database/status`);
          assert.equal(statusRes1.status, 200);
          const status1 = await statusRes1.json();
          assert.equal(status1.status, 'healthy');
          assert.equal(status1.integrityStatus, 'ok');
          assert.equal(status1.schemaVersion, 4);
          assert.equal(status1.factsCount, 1);
          assert.equal(status1.backups.length, 0);

          // 2. POST /api/database/backups (Create Backup)
          const createRes = await fetch(`${baseUrl}/api/database/backups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          assert.equal(createRes.status, 201);
          const createdData = await createRes.json();
          assert.equal(createdData.success, true);
          assert.equal(createdData.backup.verified, true);
          assert.equal(createdData.backup.factsCount, 1);
          const backupFileName = createdData.backup.fileName;

          // 3. Simulated backup error state returns 500 with clear message
          const failBackupRes = await fetch(`${baseUrl}/api/database/backups`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Simulate-Failure': 'true',
            },
          });
          assert.equal(failBackupRes.status, 500);
          const failBackupJson = await failBackupRes.json();
          assert.equal(failBackupJson.code, 'BACKUP_FAILED');

          // 4. GET /api/database/backups/:fileName/download (Export backup)
          const downloadRes = await fetch(
            `${baseUrl}/api/database/backups/${encodeURIComponent(backupFileName)}/download`
          );
          assert.equal(downloadRes.status, 200);
          assert.equal(
            downloadRes.headers.get('content-type'),
            'application/x-sqlite3'
          );
          const downloadedBuf = Buffer.from(await downloadRes.arrayBuffer());
          assert.equal(
            downloadedBuf.subarray(0, 16).toString('utf8'),
            'SQLite format 3\0'
          );

          // Path traversal in download must be rejected (400)
          const badDownloadRes = await fetch(
            `${baseUrl}/api/database/backups/..%2Fsecret.db/download`
          );
          assert.equal(badDownloadRes.status, 400);

          // Missing backup download must return 404
          const missingDownloadRes = await fetch(
            `${baseUrl}/api/database/backups/brain_backup_missing.db/download`
          );
          assert.equal(missingDownloadRes.status, 404);

          // Corrupted backup download must be rejected with 400 BACKUP_CORRUPTED
          const corruptExportName = 'brain_backup_corrupt_export.db';
          const corruptExportPath = path.join(backupDir, corruptExportName);
          fs.writeFileSync(corruptExportPath, 'CORRUPTED_BYTES_NOT_SQLITE', 'utf8');
          const corruptDownloadRes = await fetch(
            `${baseUrl}/api/database/backups/${corruptExportName}/download`
          );
          assert.equal(corruptDownloadRes.status, 400);
          assert.equal((await corruptDownloadRes.json()).code, 'BACKUP_CORRUPTED');
          fs.unlinkSync(corruptExportPath);

          // 5. Add a second fact to live DB so we can test restore via HTTP
          db.prepare(
            `INSERT INTO facts (brain, content, source, file_name, created_at, updated_at)
             VALUES ('coding', 'Temporary Fact Added After Snapshot', 'gpt', 'temp.md', ?, ?)`
          ).run(now, now);

          // 6. POST /api/database/restore without confirm: true must be rejected (400)
          const unconfirmedRes = await fetch(
            `${baseUrl}/api/database/restore`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileName: backupFileName, confirm: false }),
            }
          );
          assert.equal(unconfirmedRes.status, 400);
          assert.equal(
            (await unconfirmedRes.json()).code,
            'RESTORE_CONFIRMATION_REQUIRED'
          );

          // 7. POST /api/database/restore with simulated apply failure rolls back and returns 500
          const rollbackRes = await fetch(`${baseUrl}/api/database/restore`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Simulate-Failure': 'true',
            },
            body: JSON.stringify({ fileName: backupFileName, confirm: true }),
          });
          assert.equal(rollbackRes.status, 500);
          const rollbackJson = await rollbackRes.json();
          assert.equal(rollbackJson.rolledBack, true);

          // 8. POST /api/database/restore with confirm: true succeeds
          const restoreRes = await fetch(`${baseUrl}/api/database/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: backupFileName, confirm: true }),
          });
          assert.equal(restoreRes.status, 200);
          const restoreJson = await restoreRes.json();
          assert.equal(restoreJson.success, true);
          assert.equal(restoreJson.status.factsCount, 1);
          assert.equal(restoreJson.safetyBackup.kind, 'pre-restore-safety');

          // 9. POST /api/database/retention validates input and applies retention policy
          const badRetentionRes = await fetch(
            `${baseUrl}/api/database/retention`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ maxBackups: 0 }),
            }
          );
          assert.equal(badRetentionRes.status, 400);

          const goodRetentionRes = await fetch(
            `${baseUrl}/api/database/retention`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ maxBackups: 2 }),
            }
          );
          assert.equal(goodRetentionRes.status, 200);
          const goodRetentionJson = await goodRetentionRes.json();
          assert.equal(goodRetentionJson.maxBackups, 2);
          assert.ok(goodRetentionJson.backups.length <= 2);
          assert.ok(goodRetentionJson.retentionResult.lastKnownGoodBackup);
        });
      } finally {
        db.close();
      }
    });

    it('upgrades older v1 pre-migration backups during staged restore and synchronizes sqlite_sequence', () => {
      const legacyBackupPath = path.join(tempRoot, 'legacy-v1-backup.db');
      const legacyDb = new DatabaseSync(legacyBackupPath);
      try {
        // Apply only v1 migration to simulate a legacy v1 snapshot
        runSchemaMigrations(legacyDb, undefined, undefined, [SCHEMA_MIGRATIONS[0]]);
        const now = new Date().toISOString();
        legacyDb
          .prepare(
            `INSERT INTO facts (brain, content, source, created_at, updated_at)
             VALUES ('coding', 'Legacy v1 Fact Content', 'claude', ?, ?)`
          )
          .run(now, now);
      } finally {
        legacyDb.close();
      }

      const targetDbPath = path.join(tempRoot, 'target-v4-for-legacy-restore.db');
      const targetBackupDir = path.join(tempRoot, 'target-v4-legacy-backups');
      const { db } = initializeDatabase(targetDbPath, {
        backupDir: targetBackupDir,
        seedOnBrandNewDb: true,
      });

      try {
        const res = restoreDatabaseFromBackup({
          db,
          dbPath: targetDbPath,
          backupPath: legacyBackupPath,
          backupDir: targetBackupDir,
        });
        assert.equal(res.success, true);
        assert.equal(res.factsCountAfterRestore, 1);
        assert.equal(res.schemaVersionAfterRestore, 4);

        // Insert a new fact after restore and verify its AUTOINCREMENT id is 2
        const now = new Date().toISOString();
        const insertRes = db
          .prepare(
            `INSERT INTO facts (brain, content, source, created_at, updated_at)
             VALUES ('coding', 'Post-restore Fact #2', 'gpt', ?, ?)`
          )
          .run(now, now);
        assert.equal(Number(insertRes.lastInsertRowid), 2);
      } finally {
        db.close();
      }
    });
  });
});

