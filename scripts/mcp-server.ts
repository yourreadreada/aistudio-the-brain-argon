#!/usr/bin/env node
import path from 'node:path';
import { initializeDatabase } from '../src/server/brainBackend.js';
import { handleMcpJsonRpcRequest, JsonRpcRequest } from '../src/server/mcpProtocol.js';

const dbPath =
  process.env.BRAIN_DB_PATH || path.resolve(process.cwd(), 'data', 'brain.db');
const defaultBrain = process.env.BRAIN_DEFAULT || 'coding';

const { db } = initializeDatabase({
  dbPath,
  seedOnBrandNewDb: false,
});

let buffer = Buffer.alloc(0);

function writeMessage(payload: unknown, useContentLengthFraming: boolean) {
  const json = JSON.stringify(payload);
  if (useContentLengthFraming) {
    const byteLength = Buffer.byteLength(json, 'utf8');
    process.stdout.write(`Content-Length: ${byteLength}\r\n\r\n${json}`);
  } else {
    process.stdout.write(`${json}\n`);
  }
}

function dispatchRawJson(rawJson: string, useContentLengthFraming: boolean) {
  const trimmed = rawJson.trim();
  if (!trimmed) return;
  let parsed: JsonRpcRequest;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err: any) {
    writeMessage(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${err?.message || 'invalid JSON'}`,
        },
      },
      useContentLengthFraming
    );
    return;
  }

  const response = handleMcpJsonRpcRequest(db, parsed, {
    defaultBrain,
    transport: 'stdio',
  });
  if (response !== null) {
    writeMessage(response, useContentLengthFraming);
  }
}

function processBuffer() {
  while (buffer.length > 0) {
    const asStr = buffer.toString('utf8');

    // Support LSP Content-Length header framing
    if (/^Content-Length:\s*\d+/i.test(asStr)) {
      const headerEndIdx = buffer.indexOf('\r\n\r\n');
      const altHeaderEndIdx = headerEndIdx === -1 ? buffer.indexOf('\n\n') : -1;
      const sepLen = headerEndIdx !== -1 ? 4 : altHeaderEndIdx !== -1 ? 2 : 0;
      const sepIdx = headerEndIdx !== -1 ? headerEndIdx : altHeaderEndIdx;
      if (sepIdx === -1) return; // Wait for full headers

      const headerStr = buffer.subarray(0, sepIdx).toString('utf8');
      const lengthMatch = headerStr.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        buffer = buffer.subarray(sepIdx + sepLen);
        continue;
      }
      const contentLength = Number(lengthMatch[1]);
      const messageStart = sepIdx + sepLen;
      const messageEnd = messageStart + contentLength;
      if (buffer.length < messageEnd) return; // Wait for full body

      const body = buffer.subarray(messageStart, messageEnd).toString('utf8');
      buffer = buffer.subarray(messageEnd);
      dispatchRawJson(body, true);
      continue;
    }

    // Standard MCP newline-delimited JSON framing
    const newlineIdx = buffer.indexOf('\n');
    if (newlineIdx === -1) return;

    const line = buffer.subarray(0, newlineIdx).toString('utf8');
    buffer = buffer.subarray(newlineIdx + 1);
    dispatchRawJson(line, false);
  }
}

process.stdin.on('data', (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  processBuffer();
});

process.stdin.on('end', () => {
  if (buffer.length > 0) {
    dispatchRawJson(buffer.toString('utf8'), false);
    buffer = Buffer.alloc(0);
  }
  try {
    db.close();
  } catch {
    // ignore
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  try {
    db.close();
  } catch {
    // ignore
  }
  process.exit(0);
});

process.stderr.write(
  `[The Brain — Argon MCP stdio server] Ready (db=${dbPath}, defaultBrain=${defaultBrain})\n`
);
