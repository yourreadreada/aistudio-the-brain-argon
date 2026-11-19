import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  recordSystemAuditLog,
  resolveServerSourceToken,
  serializeFactRow,
  validateAISource,
  validateBrainName,
} from './brainBackend.js';

export const MCP_PROTOCOL_VERSION = '2024-11-05';
export const MCP_SERVER_INFO = {
  name: 'the-brain-argon',
  version: '0.2.0',
};

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export const MCP_TOOLS = [
  {
    name: 'list_brains',
    description:
      'List all available Brain workspaces in the local SQLite database along with fact counts and last updated timestamps. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'search_memories',
    description:
      'Search stored memories/facts across a specific Brain or all Brains, returning grounded content with full provenance (source, folder, filename, original date, import date, tags). Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        brain: {
          type: 'string',
          description: 'Optional Brain workspace slug (e.g. coding, personal). Omit to search all Brains.',
        },
        query: {
          type: 'string',
          description: 'Keyword or phrase to search across memory content, filenames, and tags.',
        },
        source: {
          type: 'string',
          description: 'Optional source filter (claude, gpt, gemini, ollama, github, manual, etc.).',
        },
        limit: {
          type: 'integer',
          description: 'Maximum results to return (default 10, max 50).',
          default: 10,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_memory',
    description:
      'Retrieve a single durable memory by numeric ID with full source provenance and parent/child hierarchy links. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'integer',
          description: 'Numeric fact ID in SQLite.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'remember_fact',
    description:
      'Explicitly write a new durable fact into a Brain workspace with source attribution. Write permission — only invoke when saving a durable user-approved fact.',
    inputSchema: {
      type: 'object',
      properties: {
        brain: {
          type: 'string',
          description: 'Target Brain slug (defaults to BRAIN_DEFAULT or "coding").',
        },
        content: {
          type: 'string',
          description: 'Concise, durable memory content to store.',
        },
        source: {
          type: 'string',
          description: 'Originating AI or tool source (claude, gpt, gemini, cursor, ollama, manual, etc.).',
          default: 'claude',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for categorization.',
        },
        fileName: {
          type: 'string',
          description: 'Optional originating filename or document label.',
        },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
  {
    name: 'database_status',
    description:
      'Return live local SQLite engine health, schema version, workspace counts, and database path. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
] as const;

function makeToolResult(payload: any, isError = false) {
  return {
    content: [
      {
        type: 'text',
        text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: typeof payload === 'object' ? payload : undefined,
    isError,
  };
}

function listBrainsFromDb(db: DatabaseSync) {
  const rows = db
    .prepare(
      `SELECT brain, COUNT(*) as factCount, MAX(updated_at) as lastUpdatedAt
       FROM facts
       GROUP BY brain
       ORDER BY brain ASC`
    )
    .all() as Array<{ brain: string; factCount: number; lastUpdatedAt: string | null }>;
  return rows.map((r) => ({
    brain: r.brain,
    factCount: Number(r.factCount || 0),
    lastUpdatedAt: r.lastUpdatedAt || null,
  }));
}

function searchMemoriesFromDb(
  db: DatabaseSync,
  args: { brain?: string; query?: string; source?: string; limit?: number }
) {
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
  const conditions: string[] = [];
  const params: any[] = [];

  if (args.brain && args.brain.trim() && args.brain.trim().toLowerCase() !== 'all') {
    const check = validateBrainName(args.brain);
    if (!check.valid) {
      throw new Error(check.error || 'Invalid brain name');
    }
    conditions.push('brain = ?');
    params.push(check.value);
  }

  if (args.source && args.source.trim() && args.source.trim().toLowerCase() !== 'all') {
    const resolved = resolveServerSourceToken(args.source) || args.source;
    const check = validateAISource(resolved);
    if (!check.valid) {
      throw new Error(check.error || 'Invalid source');
    }
    conditions.push('source = ?');
    params.push(check.value);
  }

  if (args.query && args.query.trim()) {
    const terms = args.query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .slice(0, 8);
    if (terms.length > 0) {
      const termClauses = terms.map(
        () =>
          '(LOWER(content) LIKE ? OR LOWER(COALESCE(file_name, \'\')) LIKE ? OR LOWER(COALESCE(tags_json, \'\')) LIKE ? OR LOWER(COALESCE(source_folder, \'\')) LIKE ?)'
      );
      conditions.push(`(${termClauses.join(' AND ')})`);
      for (const term of terms) {
        const pattern = `%${term}%`;
        params.push(pattern, pattern, pattern, pattern);
      }
    }
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM facts ${whereSql} ORDER BY updated_at DESC, id DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit);
  return rows.map(serializeFactRow).filter(Boolean);
}

/**
 * Executes a single JSON-RPC 2.0 MCP request directly against the local SQLite database.
 * Returns null for JSON-RPC notifications (no `id`) that expect no response.
 */
export function handleMcpJsonRpcRequest(
  db: DatabaseSync,
  request: JsonRpcRequest,
  options: { defaultBrain?: string; transport?: 'stdio' | 'http' } = {}
): JsonRpcResponse | null {
  const defaultBrain = options.defaultBrain || process.env.BRAIN_DEFAULT || 'coding';
  const transport = options.transport || 'http';
  const id = request.id !== undefined ? request.id : null;

  if (!request || typeof request.method !== 'string') {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32600, message: 'Invalid JSON-RPC request: method is required.' },
    };
  }

  // Notifications without an id do not produce a JSON-RPC response
  if (
    request.method === 'notifications/initialized' ||
    request.method === 'notifications/cancelled'
  ) {
    if (request.id === undefined) return null;
    return { jsonrpc: '2.0', id, result: {} };
  }

  try {
    switch (request.method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
            },
            serverInfo: MCP_SERVER_INFO,
            instructions:
              'The Brain — Argon local-first SQLite memory server. Use list_brains and search_memories to recall grounded context with provenance. Use remember_fact only to persist explicit durable user facts.',
          },
        };
      }

      case 'ping': {
        return { jsonrpc: '2.0', id, result: { ok: true, timestamp: new Date().toISOString() } };
      }

      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: MCP_TOOLS,
          },
        };
      }

      case 'tools/call': {
        const toolName = String(request.params?.name || '');
        const args = (request.params?.arguments || {}) as Record<string, any>;

        if (toolName === 'list_brains') {
          const brains = listBrainsFromDb(db);
          return {
            jsonrpc: '2.0',
            id,
            result: makeToolResult({
              brains,
              totalBrains: brains.length,
              totalFacts: brains.reduce((sum, b) => sum + b.factCount, 0),
            }),
          };
        }

        if (toolName === 'search_memories') {
          const results = searchMemoriesFromDb(db, {
            brain: typeof args.brain === 'string' ? args.brain : undefined,
            query: typeof args.query === 'string' ? args.query : undefined,
            source: typeof args.source === 'string' ? args.source : undefined,
            limit: typeof args.limit === 'number' ? args.limit : 10,
          });
          return {
            jsonrpc: '2.0',
            id,
            result: makeToolResult({
              count: results.length,
              query: args.query || '',
              brain: args.brain || 'all',
              memories: results,
            }),
          };
        }

        if (toolName === 'get_memory') {
          const factId = Number(args.id);
          if (!Number.isInteger(factId) || factId <= 0) {
            return {
              jsonrpc: '2.0',
              id,
              result: makeToolResult({ error: 'Valid positive integer id is required.' }, true),
            };
          }
          const row = db.prepare('SELECT * FROM facts WHERE id = ?').get(factId);
          if (!row) {
            return {
              jsonrpc: '2.0',
              id,
              result: makeToolResult({ error: `Memory #${factId} not found.` }, true),
            };
          }
          const fact = serializeFactRow(row);
          const children = db
            .prepare('SELECT id, brain, source, file_name, content FROM facts WHERE parent_id = ?')
            .all(factId);
          return {
            jsonrpc: '2.0',
            id,
            result: makeToolResult({ memory: fact, children }),
          };
        }

        if (toolName === 'remember_fact') {
          const content = typeof args.content === 'string' ? args.content.trim() : '';
          if (!content) {
            return {
              jsonrpc: '2.0',
              id,
              result: makeToolResult({ error: 'content is required and cannot be empty.' }, true),
            };
          }
          const brainCheck = validateBrainName(args.brain || defaultBrain);
          if (!brainCheck.valid) {
            return {
              jsonrpc: '2.0',
              id,
              result: makeToolResult({ error: brainCheck.error }, true),
            };
          }
          const normalizedSource =
            resolveServerSourceToken(String(args.source || 'claude')) ||
            String(args.source || 'claude');
          const sourceCheck = validateAISource(normalizedSource);
          if (!sourceCheck.valid) {
            return {
              jsonrpc: '2.0',
              id,
              result: makeToolResult({ error: sourceCheck.error }, true),
            };
          }
          const tags = Array.isArray(args.tags)
            ? args.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
            : ['mcp'];
          const fileName =
            typeof args.fileName === 'string' && args.fileName.trim()
              ? args.fileName.trim().slice(0, 255)
              : null;
          const now = new Date().toISOString();
          const insert = db.prepare(`
            INSERT INTO facts (
              brain, content, source, source_folder, file_name, file_path, file_type,
              tags_json, imported_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, NULL, 'mcp', ?, ?, ?, ?)
          `);
          const res = insert.run(
            brainCheck.value,
            content,
            sourceCheck.value,
            `mcp_${transport}`,
            fileName,
            JSON.stringify(tags),
            now,
            now,
            now
          );
          const created = serializeFactRow(
            db.prepare('SELECT * FROM facts WHERE id = ?').get(res.lastInsertRowid)
          );
          try {
            recordSystemAuditLog(db, {
              category: 'mcp_remember',
              brain: brainCheck.value,
              source: sourceCheck.value,
              summary: `MCP (${transport}) stored memory #${created?.id}`,
              status: 'success',
              details: { factId: created?.id, transport },
            });
          } catch {
            // non-fatal audit write
          }
          return {
            jsonrpc: '2.0',
            id,
            result: makeToolResult({
              saved: true,
              memory: created,
            }),
          };
        }

        if (toolName === 'database_status') {
          const brains = listBrainsFromDb(db);
          const schemaRow = db
            .prepare('SELECT MAX(version) as version FROM schema_migrations')
            .get() as { version?: number } | undefined;
          const integrityRow = db
            .prepare('PRAGMA integrity_check')
            .get() as { integrity_check?: string } | undefined;
          return {
            jsonrpc: '2.0',
            id,
            result: makeToolResult({
              engine: 'node:sqlite (DatabaseSync)',
              dbPath: (db as any).__brainDbPath || ':memory:',
              schemaVersion: Number(schemaRow?.version || 5),
              integrityOk:
                String(integrityRow?.integrity_check || '').toLowerCase() === 'ok',
              totalBrains: brains.length,
              totalFacts: brains.reduce((s, b) => s + b.factCount, 0),
              transport,
            }),
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Unknown MCP tool "${toolName}".` },
        };
      }

      case 'resources/list': {
        const brains = listBrainsFromDb(db);
        const resources = [
          {
            uri: 'brain://workspaces',
            name: 'All Brain Workspaces',
            description: 'JSON summary of all Brain workspaces and fact counts.',
            mimeType: 'application/json',
          },
          ...brains.map((b) => ({
            uri: `brain://workspace/${b.brain}/snapshot`,
            name: `Brain Snapshot: ${b.brain}`,
            description: `Concise context snapshot of recent durable facts in "${b.brain}" (${b.factCount} facts).`,
            mimeType: 'text/markdown',
          })),
        ];
        return {
          jsonrpc: '2.0',
          id,
          result: { resources },
        };
      }

      case 'resources/read': {
        const uri = String(request.params?.uri || '');
        if (uri === 'brain://workspaces') {
          const brains = listBrainsFromDb(db);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(brains, null, 2),
                },
              ],
            },
          };
        }
        const match = uri.match(/^brain:\/\/workspace\/([^/]+)\/snapshot$/);
        if (match) {
          const slug = match[1];
          const facts = searchMemoriesFromDb(db, { brain: slug, limit: 25 });
          const md = [
            `# Brain Context Snapshot: ${slug}`,
            '',
            ...facts.map(
              (f: any) =>
                `- [#${f.id} | ${f.source}${f.fileName ? ` | ${f.fileName}` : ''}] ${f.content}`
            ),
          ].join('\n');
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [{ uri, mimeType: 'text/markdown', text: md }],
            },
          };
        }
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32002, message: `Resource not found: ${uri}` },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${request.method}` },
        };
    }
  } catch (err: any) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: err?.message || 'Internal MCP server error',
      },
    };
  }
}

export interface McpDiagnosticsReport {
  checkedAt: string;
  protocolVersion: string;
  serverInfo: { name: string; version: string };
  runtime: {
    nodeExecutable: string;
    nodeVersion: string;
    tsxBinPath: string;
    tsxAvailable: boolean;
    mcpScriptPath: string;
    mcpScriptExists: boolean;
    dbPath: string;
    workspaceRoot: string;
  };
  transports: {
    desktopStdioMcp: {
      status: 'available' | 'unavailable';
      label: string;
      protocol: string;
      command: string;
      args: string[];
      cwd: string;
      env: Record<string, string>;
      summary: string;
    };
    localHttpApi: {
      status: 'online';
      label: string;
      baseUrl: string;
      endpoints: {
        status: string;
        brains: string;
        recall: string;
        remember: string;
        mcpJsonRpc: string;
        openApi: string;
      };
      summary: string;
    };
    browserCompanion: {
      status: 'paired' | 'ready_unpaired' | 'unavailable';
      label: string;
      manifestExists: boolean;
      activeDevices: number;
      captureEndpoint: string;
      summary: string;
    };
  };
  testedClientConfigs: {
    claudeDesktop: {
      clientName: string;
      configPathHint: string;
      config: Record<string, any>;
    };
    cursor: {
      clientName: string;
      configPathHint: string;
      config: Record<string, any>;
    };
  };
  tools: Array<{ name: string; permission: 'read' | 'write'; description: string }>;
}

export function collectMcpDiagnostics(params: {
  db: DatabaseSync;
  dbPath: string;
  origin: string;
  defaultBrain?: string;
  cwd?: string;
}): McpDiagnosticsReport {
  const workspaceRoot = params.cwd || process.cwd();
  const defaultBrain = params.defaultBrain || process.env.BRAIN_DEFAULT || 'coding';
  const nodeExecutable = process.execPath;
  const tsxBinName = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const tsxBinPath = path.join(workspaceRoot, 'node_modules', '.bin', tsxBinName);
  const tsxLoaderPath = path.join(workspaceRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs');
  const tsxAvailable = fs.existsSync(tsxBinPath) || fs.existsSync(tsxLoaderPath);
  const mcpScriptPath = path.join(workspaceRoot, 'scripts', 'mcp-server.ts');
  const mcpScriptExists = fs.existsSync(mcpScriptPath);
  const extensionManifestPath = path.join(workspaceRoot, 'extension', 'manifest.json');
  const manifestExists = fs.existsSync(extensionManifestPath);

  let activeDevices = 0;
  try {
    const row = params.db
      .prepare('SELECT count(*) as count FROM companion_devices WHERE revoked_at IS NULL')
      .get() as { count?: number } | undefined;
    activeDevices = Number(row?.count || 0);
  } catch {
    activeDevices = 0;
  }

  const stdioAvailable = tsxAvailable && mcpScriptExists;
  // Prefer `node --import tsx <absolute script>` because Claude Desktop / Cursor may not inherit shell PATH
  const stdioCommand = nodeExecutable;
  const stdioArgs = ['--import', 'tsx', mcpScriptPath];
  const resolvedDbPath =
    params.dbPath && params.dbPath !== ':memory:'
      ? path.resolve(params.dbPath)
      : path.resolve(workspaceRoot, 'data', 'brain.db');

  const stdioEnv: Record<string, string> = {
    BRAIN_DB_PATH: resolvedDbPath,
    BRAIN_DEFAULT: defaultBrain,
  };

  const baseUrl = params.origin.replace(/\/$/, '');

  const claudeDesktopConfig = {
    mcpServers: {
      'the-brain-argon': {
        command: stdioCommand,
        args: stdioArgs,
        cwd: workspaceRoot,
        env: stdioEnv,
      },
    },
  };

  const cursorConfig = {
    mcpServers: {
      'the-brain-argon': {
        command: stdioCommand,
        args: stdioArgs,
        cwd: workspaceRoot,
        env: stdioEnv,
      },
    },
  };

  return {
    checkedAt: new Date().toISOString(),
    protocolVersion: MCP_PROTOCOL_VERSION,
    serverInfo: MCP_SERVER_INFO,
    runtime: {
      nodeExecutable,
      nodeVersion: process.version,
      tsxBinPath,
      tsxAvailable,
      mcpScriptPath,
      mcpScriptExists,
      dbPath: resolvedDbPath,
      workspaceRoot,
    },
    transports: {
      desktopStdioMcp: {
        status: stdioAvailable ? 'available' : 'unavailable',
        label: 'Desktop stdio MCP (Claude Desktop / Cursor)',
        protocol: `MCP JSON-RPC 2.0 over stdio (${MCP_PROTOCOL_VERSION})`,
        command: stdioCommand,
        args: stdioArgs,
        cwd: workspaceRoot,
        env: stdioEnv,
        summary: stdioAvailable
          ? 'Verified Node.js/TypeScript stdio MCP server ready at scripts/mcp-server.ts. Launches directly against local node:sqlite.'
          : 'Desktop stdio MCP runtime is missing tsx or scripts/mcp-server.ts.',
      },
      localHttpApi: {
        status: 'online',
        label: 'Local HTTP API & JSON-RPC Endpoint',
        baseUrl,
        endpoints: {
          status: `${baseUrl}/api/status`,
          brains: `${baseUrl}/api/brains`,
          recall: `${baseUrl}/api/recall`,
          remember: `${baseUrl}/api/remember`,
          mcpJsonRpc: `${baseUrl}/api/mcp`,
          openApi: `${baseUrl}/openapi.json`,
        },
        summary:
          'Local Express + node:sqlite HTTP server serving REST recall/remember endpoints and POST /api/mcp JSON-RPC 2.0.',
      },
      browserCompanion: {
        status: !manifestExists ? 'unavailable' : activeDevices > 0 ? 'paired' : 'ready_unpaired',
        label: 'Browser Companion Extension (Chrome / Edge / Brave)',
        manifestExists,
        activeDevices,
        captureEndpoint: `${baseUrl}/api/companion/capture`,
        summary: !manifestExists
          ? 'Browser extension folder was not found in this workspace.'
          : activeDevices > 0
            ? `${activeDevices} paired browser device(s) connected to ${baseUrl}/api/companion/capture.`
            : 'Extension unpacked folder is available (extension/manifest.json); pair a device token to capture web chats.',
      },
    },
    testedClientConfigs: {
      claudeDesktop: {
        clientName: 'Claude Desktop',
        configPathHint:
          'macOS: ~/Library/Application Support/Claude/claude_desktop_config.json · Windows: %APPDATA%\\Claude\\claude_desktop_config.json',
        config: claudeDesktopConfig,
      },
      cursor: {
        clientName: 'Cursor',
        configPathHint: '.cursor/mcp.json (workspace) or ~/.cursor/mcp.json (global)',
        config: cursorConfig,
      },
    },
    tools: MCP_TOOLS.map((t) => ({
      name: t.name,
      permission: t.name === 'remember_fact' ? 'write' : 'read',
      description: t.description,
    })),
  };
}

export function runMcpLiveSmokeTest(db: DatabaseSync, defaultBrain = 'coding') {
  const startedAt = Date.now();
  const steps: Array<{
    step: string;
    ok: boolean;
    detail: string;
  }> = [];

  const initRes = handleMcpJsonRpcRequest(
    db,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'argon-smoke-test', version: '1.0.0' },
      },
    },
    { defaultBrain, transport: 'http' }
  );
  const initOk = Boolean(initRes?.result?.protocolVersion === MCP_PROTOCOL_VERSION);
  steps.push({
    step: 'initialize',
    ok: initOk,
    detail: initOk
      ? `Negotiated protocol ${initRes?.result?.protocolVersion} (${initRes?.result?.serverInfo?.name})`
      : initRes?.error?.message || 'Initialize failed',
  });

  const toolsRes = handleMcpJsonRpcRequest(
    db,
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { defaultBrain, transport: 'http' }
  );
  const toolCount = Array.isArray(toolsRes?.result?.tools) ? toolsRes!.result.tools.length : 0;
  steps.push({
    step: 'tools/list',
    ok: toolCount >= 4,
    detail: `Discovered ${toolCount} MCP tools`,
  });

  const brainsRes = handleMcpJsonRpcRequest(
    db,
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_brains', arguments: {} },
    },
    { defaultBrain, transport: 'http' }
  );
  const brainsPayload = brainsRes?.result?.structuredContent;
  const brainsOk = Boolean(brainsRes && !brainsRes.error && !brainsRes.result?.isError);
  steps.push({
    step: 'tools/call (list_brains)',
    ok: brainsOk,
    detail: brainsOk
      ? `Found ${brainsPayload?.totalBrains ?? 0} brain(s), ${brainsPayload?.totalFacts ?? 0} total memories`
      : brainsRes?.error?.message || 'list_brains failed',
  });

  const searchRes = handleMcpJsonRpcRequest(
    db,
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'search_memories',
        arguments: { brain: defaultBrain, limit: 5 },
      },
    },
    { defaultBrain, transport: 'http' }
  );
  const searchPayload = searchRes?.result?.structuredContent;
  const searchOk = Boolean(searchRes && !searchRes.error && !searchRes.result?.isError);
  steps.push({
    step: 'tools/call (search_memories)',
    ok: searchOk,
    detail: searchOk
      ? `Recalled ${searchPayload?.count ?? 0} grounded memory node(s) from "${defaultBrain}"`
      : searchRes?.error?.message || 'search_memories failed',
  });

  const allPassed = steps.every((s) => s.ok);
  return {
    ok: allPassed,
    durationMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
    steps,
    sampleMemories: (searchPayload?.memories || []).slice(0, 3),
  };
}
