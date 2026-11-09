import path from 'path';
import { fileURLToPath } from 'url';
import {
  backupDatabaseFile,
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
  const backupPath = backupDatabaseFile(DB_PATH, BACKUP_DIR);
  if (backupPath) {
    console.log(`Database backup created: ${backupPath}`);
  } else {
    console.log(`No database file found at ${DB_PATH} — nothing to back up.`);
  }
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
  console.error(`Unknown db-cli command "${command}". Supported: backup | seed-demo`);
  process.exit(1);
}
