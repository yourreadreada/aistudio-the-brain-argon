import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  initializeDatabase,
  createBrainApp,
  resolveBindHost,
} from './src/server/brainBackend';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_PATH = process.env.BRAIN_DB_PATH
  ? path.resolve(process.env.BRAIN_DB_PATH)
  : path.join(DB_DIR, 'brain.db');

// Safe SQLite initialization:
// - Runs versioned schema migrations with pre-migration backup
// - Seeds demo facts ONLY if DB is brand-new (never deletes existing user data)
// - Explicit demo seeding on an existing DB is available via BRAIN_SEED_DEMO=true
const { db } = initializeDatabase(DB_PATH, {
  seedOnBrandNewDb: process.env.BRAIN_SEED_DEMO !== 'false',
  forceDemoSeed: process.env.BRAIN_SEED_DEMO === 'true',
  backupDir: path.join(DB_DIR, 'backups'),
});

const app = createBrainApp(db);

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
      app.get('*', (_req, res) => {
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

  const host = resolveBindHost(process.env);
  app.listen(PORT, host, () => {
    console.log(`The Brain Argon server running at http://${host}:${PORT}`);
  });
}

setupFrontend();
