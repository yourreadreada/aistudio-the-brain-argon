import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  createConsistentBackup,
  listBackups,
  restoreDatabaseFromBackup,
  initializeDatabase,
  seedDemoFactsNonDestructive,
} from '../src/server/brainBackend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = process.env.BRAIN_DB_PATH
  ? path.resolve(process.env.BRAIN_DB_PATH)
  : path.join(ROOT_DIR, 'data', 'brain.db');
const BACKUP_DIR = path.join(ROOT_DIR, 'data', 'backups');

const command = (process.argv[2] || 'backup').trim().toLowerCase();

if (command === 'backup') {
  if (!fs.existsSync(DB_PATH) || fs.statSync(DB_PATH).size === 0) {
    console.log(`No database file found at ${DB_PATH} — nothing to back up.`);
    process.exit(0);
  }
  const meta = createConsistentBackup(DB_PATH, {
    backupDir: BACKUP_DIR,
    kind: 'manual',
  });
  console.log(
    `Verified SQLite snapshot created: ${meta.backupPath} (${meta.sizeBytes} bytes, schema v${meta.schemaVersion}, ${meta.factsCount} facts, integrity=${meta.integrityStatus})`
  );
} else if (command === 'list-backups') {
  const backups = listBackups(BACKUP_DIR);
  if (backups.length === 0) {
    console.log(`No backups found in ${BACKUP_DIR}`);
  } else {
    for (const b of backups) {
      console.log(
        `${b.fileName} | verified=${b.verified} | kind=${b.kind} | facts=${b.factsCount} | size=${b.sizeBytes}B | created=${b.createdAt}`
      );
    }
  }
} else if (command === 'restore') {
  const targetFile = (process.argv[3] || '').trim();
  if (!targetFile) {
    console.error('Usage: npm run db:backup -- restore <backupFileName.db>');
    process.exit(1);
  }
  const candidatePath = path.isAbsolute(targetFile)
    ? targetFile
    : path.join(BACKUP_DIR, targetFile);
  const result = restoreDatabaseFromBackup({
    dbPath: DB_PATH,
    backupPath: candidatePath,
    backupDir: BACKUP_DIR,
  });
  console.log(
    `Database restored from ${result.restoredFrom.fileName} (${result.factsCountAfterRestore} facts). Safety backup saved at ${result.safetyBackup.backupPath}`
  );
} else if (command === 'seed-demo') {
  const { db } = initializeDatabase(DB_PATH, {
    seedOnBrandNewDb: false,
    backupDir: BACKUP_DIR,
  });
  try {
    const inserted = seedDemoFactsNonDestructive(db);
    console.log(
      `Non-destructive demo seed complete: ${inserted} missing demo fact(s) added (existing user records preserved).`
    );
  } finally {
    db.close();
  }
} else {
  console.error(
    `Unknown db-cli command "${command}". Supported: backup | list-backups | restore <file> | seed-demo`
  );
  process.exit(1);
}

