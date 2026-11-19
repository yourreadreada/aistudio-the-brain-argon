import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Play,
  Copy,
  Check,
  Terminal,
  Globe,
  Puzzle,
  Sparkles,
  FlaskConical,
  X,
} from 'lucide-react';
import { brainStore } from '../services/brainStorage';
import { AISource, Fact } from '../types/brain';
import { BrainLogo } from './BrainLogo';

interface McpBridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBrain: string;
}

type BridgeTab = 'desktop_mcp' | 'http_api' | 'companion' | 'web_primers' | 'simulator';

interface McpDiagnosticsState {
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

interface SmokeTestResult {
  ok: boolean;
  durationMs: number;
  checkedAt: string;
  steps: Array<{ step: string; ok: boolean; detail: string }>;
  sampleMemories?: Fact[];
  error?: string;
}

export const McpBridgeModal: React.FC<McpBridgeModalProps> = ({
  isOpen,
  onClose,
  currentBrain,
}) => {
  const [activeTab, setActiveTab] = useState<BridgeTab>('desktop_mcp');
  const [selectedClient, setSelectedClient] = useState<'claudeDesktop' | 'cursor'>('claudeDesktop');
  const [selectedPrimer, setSelectedPrimer] = useState<'chatgpt' | 'claude' | 'gemini'>('chatgpt');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Live diagnostics & health check
  const [diagnostics, setDiagnostics] = useState<McpDiagnosticsState | null>(null);
  const [diagLoading, setDiagLoading] = useState<boolean>(false);
  const [diagError, setDiagError] = useState<string | null>(null);

  // Live smoke test
  const [smokeRunning, setSmokeRunning] = useState<boolean>(false);
  const [smokeResult, setSmokeResult] = useState<SmokeTestResult | null>(null);

  // Live Simulator State
  const [simModel, setSimModel] = useState<AISource>('gpt');
  const [simPrompt, setSimPrompt] = useState<string>('What is our architecture for The Brain?');
  const [simLog, setSimLog] = useState<{
    prompt: string;
    model: AISource;
    recalled: Fact[];
    reply: string;
    savedFact?: Fact;
  } | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  const loadDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    setDiagError(null);
    try {
      const data = await brainStore.fetchMcpDiagnostics(currentBrain);
      setDiagnostics(data);
    } catch (err: any) {
      setDiagnostics(null);
      setDiagError(
        err?.message ||
          'Local Argon HTTP server is unreachable. Start it with: npm run dev'
      );
    } finally {
      setDiagLoading(false);
    }
  }, [currentBrain]);

  useEffect(() => {
    if (!isOpen) return;
    loadDiagnostics();
  }, [isOpen, loadDiagnostics]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRunSmokeTest = async () => {
    setSmokeRunning(true);
    setSmokeResult(null);
    try {
      const res = await brainStore.runMcpSmokeTest(currentBrain);
      setSmokeResult(res);
    } catch (err: any) {
      setSmokeResult({
        ok: false,
        durationMs: 0,
        checkedAt: new Date().toISOString(),
        steps: [],
        error: err?.message || 'MCP smoke test failed',
      });
    } finally {
      setSmokeRunning(false);
    }
  };

  const handleRunSimulation = (promptToRun?: string) => {
    const text = (promptToRun || simPrompt).trim();
    if (!text) return;

    setIsSimulating(true);
    setTimeout(() => {
      const result = brainStore.simulateWebAiInteraction(currentBrain, simModel, text);
      setSimLog({
        prompt: text,
        model: simModel,
        recalled: result.recalledFacts,
        reply: result.reply,
        savedFact: result.savedFact,
      });
      setIsSimulating(false);
    }, 250);
  };

  const chatGptInstructions = brainStore.generateChatGptCustomInstructions(currentBrain);
  const claudePrimer = brainStore.generateClaudePrimer(currentBrain);
  const geminiPrimer = brainStore.generateGeminiPrimer(currentBrain);
  const contextSnapshot = brainStore.exportContextSnapshot(currentBrain);
  const openApiSpec = JSON.stringify(brainStore.getOpenApiSpec(), null, 2);

  const activeClientConfig = diagnostics?.testedClientConfigs?.[selectedClient];
  const activeClientConfigJson = activeClientConfig
    ? JSON.stringify(activeClientConfig.config, null, 2)
    : '';

  const localBaseUrl =
    diagnostics?.transports.localHttpApi.baseUrl ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3000');

  const curlMcpExample = `curl -s -X POST ${localBaseUrl}/api/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_memories","arguments":{"brain":"${currentBrain}","limit":5}}}'`;

  const stdioStatus = diagnostics?.transports.desktopStdioMcp.status;
  const companionStatus = diagnostics?.transports.browserCompanion.status;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mcp-bridge-modal-title"
      data-testid="mcp-bridge-modal"
    >
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity"
      />

      <div className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col rounded-2xl border border-white/15 bg-[#060814]/98 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3 text-white min-w-0">
            <BrainLogo size={18} className="text-white shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="mcp-bridge-modal-title"
                  className="mono text-xs font-semibold tracking-wider text-white uppercase"
                >
                  MCP Bridge & Local Transport Diagnostics
                </h2>
                <span className="mono rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/75">
                  Node.js + node:sqlite
                </span>
              </div>
              <p className="mt-0.5 text-xs text-white/55">
                Three distinct local connection paths: Desktop stdio MCP, Local HTTP API, and Browser Companion.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={loadDiagnostics}
              disabled={diagLoading}
              aria-label="Re-check live MCP runtime diagnostics"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10 hover:text-white transition min-h-[36px]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${diagLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Re-check</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close MCP Bridge modal"
              className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white h-9 w-9"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Transport Status Overview Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-b border-white/10 bg-black/40 px-4 sm:px-6 py-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="mono text-[10px] uppercase tracking-wider text-white/45">
                1. Desktop stdio MCP
              </div>
              <div className="text-xs font-medium text-white truncate">
                Claude Desktop / Cursor
              </div>
            </div>
            <span
              data-testid="mcp-stdio-status-badge"
              className={`mono text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 ${
                stdioStatus === 'available'
                  ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                  : diagLoading
                    ? 'border-white/15 bg-white/5 text-white/50'
                    : 'border-amber-500/30 bg-amber-500/15 text-amber-300'
              }`}
            >
              {diagLoading ? 'Checking' : stdioStatus === 'available' ? 'Verified' : 'Unavailable'}
            </span>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="mono text-[10px] uppercase tracking-wider text-white/45">
                2. Local HTTP API
              </div>
              <div className="mono text-[11px] text-white truncate">{localBaseUrl}</div>
            </div>
            <span
              data-testid="mcp-http-status-badge"
              className={`mono text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 ${
                diagnostics
                  ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                  : diagLoading
                    ? 'border-white/15 bg-white/5 text-white/50'
                    : 'border-rose-500/30 bg-rose-500/15 text-rose-300'
              }`}
            >
              {diagLoading ? 'Checking' : diagnostics ? 'Online' : 'Offline'}
            </span>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="mono text-[10px] uppercase tracking-wider text-white/45">
                3. Browser Companion
              </div>
              <div className="text-xs font-medium text-white truncate">
                {diagnostics
                  ? `${diagnostics.transports.browserCompanion.activeDevices} paired device(s)`
                  : 'Chrome / Edge / Brave'}
              </div>
            </div>
            <span
              data-testid="mcp-companion-status-badge"
              className={`mono text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 ${
                companionStatus === 'paired'
                  ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                  : companionStatus === 'ready_unpaired'
                    ? 'border-sky-500/30 bg-sky-500/15 text-sky-300'
                    : 'border-white/15 bg-white/5 text-white/50'
              }`}
            >
              {companionStatus === 'paired'
                ? 'Paired'
                : companionStatus === 'ready_unpaired'
                  ? 'Unpaired'
                  : diagLoading
                    ? 'Checking'
                    : 'Unavailable'}
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          role="tablist"
          aria-label="MCP transport tabs"
          className="flex items-center gap-1 border-b border-white/10 bg-black/30 px-4 sm:px-6 py-2 overflow-x-auto"
        >
          {[
            { id: 'desktop_mcp' as BridgeTab, label: 'Desktop stdio MCP', icon: Terminal },
            { id: 'http_api' as BridgeTab, label: 'Local HTTP API', icon: Globe },
            { id: 'companion' as BridgeTab, label: 'Browser Companion', icon: Puzzle },
            { id: 'web_primers' as BridgeTab, label: 'Web AI Primers', icon: Sparkles },
            { id: 'simulator' as BridgeTab, label: 'Live Simulator', icon: FlaskConical },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-1.5 mono whitespace-nowrap px-3 py-2 rounded-lg text-xs font-medium transition min-h-[36px] ${
                activeTab === id
                  ? 'bg-[#9db4ff] text-[#050712] font-semibold'
                  : 'text-white/65 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {diagError && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">Local Argon runtime check failed</div>
                <p className="text-amber-100/80">{diagError}</p>
                <p className="mono text-[11px] text-white/75">
                  Start the supported Node/TypeScript runtime with: <code>npm run dev</code> (serves{' '}
                  <code>http://127.0.0.1:3000</code>).
                </p>
              </div>
            </div>
          )}

          {/* TAB 1: DESKTOP STDIO MCP */}
          {activeTab === 'desktop_mcp' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Desktop stdio MCP Server (Node.js + node:sqlite)
                    </h3>
                    <p className="mt-0.5 text-xs text-white/60">
                      Launched directly as a subprocess by desktop MCP clients (Claude Desktop, Cursor) over stdin/stdout JSON-RPC 2.0. Does not require Python or a separate web port.
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="run-mcp-smoke-test-btn"
                    onClick={handleRunSmokeTest}
                    disabled={smokeRunning || !diagnostics}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-[#04110b] hover:bg-emerald-400 transition disabled:opacity-40 min-h-[38px]"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>{smokeRunning ? 'Running Smoke Test...' : 'Run Live MCP Smoke Test'}</span>
                  </button>
                </div>

                {/* Live Runtime Verification Grid */}
                {diagnostics && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1 text-xs">
                    <div className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-1">
                      <div className="mono text-[10px] uppercase tracking-wider text-white/45">
                        Verified Node & Script Runtime
                      </div>
                      <div className="mono text-[11px] text-white/85 break-all">
                        Node {diagnostics.runtime.nodeVersion} ·{' '}
                        {diagnostics.runtime.tsxAvailable ? 'tsx present' : 'tsx missing'}
                      </div>
                      <div className="mono text-[10.5px] text-white/55 break-all">
                        Entry: {diagnostics.runtime.mcpScriptPath}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-1">
                      <div className="mono text-[10px] uppercase tracking-wider text-white/45">
                        Target SQLite Database & Protocol
                      </div>
                      <div className="mono text-[11px] text-emerald-300">
                        MCP Protocol {diagnostics.protocolVersion} · stdio JSON-RPC 2.0
                      </div>
                      <div className="mono text-[10.5px] text-white/55 break-all">
                        DB: {diagnostics.runtime.dbPath}
                      </div>
                    </div>
                  </div>
                )}

                {/* Smoke Test Output */}
                {smokeResult && (
                  <div
                    data-testid="mcp-smoke-test-result"
                    className={`rounded-xl border p-3.5 space-y-2.5 text-xs ${
                      smokeResult.ok
                        ? 'border-emerald-500/30 bg-emerald-500/10'
                        : 'border-rose-500/30 bg-rose-500/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-semibold text-white">
                        {smokeResult.ok ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-rose-400" />
                        )}
                        <span>
                          {smokeResult.ok
                            ? `MCP Smoke Test Passed (${smokeResult.durationMs}ms)`
                            : 'MCP Smoke Test Failed'}
                        </span>
                      </div>
                      <span className="mono text-[10px] text-white/60">
                        Brain: {currentBrain}
                      </span>
                    </div>
                    {smokeResult.error && (
                      <p className="text-rose-200">{smokeResult.error}</p>
                    )}
                    <div className="space-y-1">
                      {smokeResult.steps.map((st, idx) => (
                        <div
                          key={idx}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/40 px-2.5 py-1.5 mono text-[11px]"
                        >
                          <span className={st.ok ? 'text-emerald-300' : 'text-rose-300'}>
                            {st.ok ? 'PASS' : 'FAIL'} · {st.step}
                          </span>
                          <span className="text-white/75">{st.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Tested Client Configs */}
              {diagnostics && (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedClient('claudeDesktop')}
                        className={`mono px-3 py-1.5 rounded-lg text-xs transition ${
                          selectedClient === 'claudeDesktop'
                            ? 'bg-white text-black font-semibold'
                            : 'bg-white/5 text-white/70 hover:text-white'
                        }`}
                      >
                        Claude Desktop
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedClient('cursor')}
                        className={`mono px-3 py-1.5 rounded-lg text-xs transition ${
                          selectedClient === 'cursor'
                            ? 'bg-white text-black font-semibold'
                            : 'bg-white/5 text-white/70 hover:text-white'
                        }`}
                      >
                        Cursor
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(activeClientConfigJson, `client-${selectedClient}`)}
                      className="inline-flex items-center gap-1.5 mono px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 transition"
                    >
                      {copiedKey === `client-${selectedClient}` ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {copiedKey === `client-${selectedClient}` ? 'Copied' : 'Copy JSON Config'}
                      </span>
                    </button>
                  </div>

                  {activeClientConfig && (
                    <p className="mono text-[11px] text-white/55">
                      Config file: {activeClientConfig.configPathHint}
                    </p>
                  )}

                  <pre
                    data-testid="mcp-client-config-json"
                    className="max-h-56 overflow-auto rounded-lg bg-black/65 p-3 font-mono text-[11px] text-emerald-200/90 leading-relaxed"
                  >
                    {activeClientConfigJson}
                  </pre>

                  <p className="text-[11px] text-white/55">
                    You can also launch the stdio server manually to inspect stderr logs via{' '}
                    <code className="mono text-white/85">npm run mcp:server</code>.
                  </p>
                </div>
              )}

              {/* Exposed MCP Tools & Read/Write Permissions */}
              {diagnostics?.tools && (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2.5">
                  <h4 className="mono text-[11px] uppercase tracking-wider text-white/55">
                    Exposed MCP Tools (Read vs Write Permissions Separated)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {diagnostics.tools.map((tool) => (
                      <div
                        key={tool.name}
                        className="rounded-lg border border-white/10 bg-black/40 p-2.5 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <code className="mono text-xs font-semibold text-white">{tool.name}</code>
                          <span
                            className={`mono text-[10px] px-1.5 py-0.5 rounded border ${
                              tool.permission === 'write'
                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                : 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                            }`}
                          >
                            {tool.permission.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-white/60 leading-relaxed">
                          {tool.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LOCAL HTTP API */}
          {activeTab === 'http_api' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Local HTTP REST & JSON-RPC API
                    </h3>
                    <p className="mt-0.5 text-xs text-white/60">
                      Bound strictly to <code>127.0.0.1:3000</code> (or active origin <code>{localBaseUrl}</code>) for local automation, scripts, and HTTP MCP clients.
                    </p>
                  </div>
                  <span className="mono text-[11px] text-emerald-300">
                    {diagnostics ? 'HTTP 200 Verified' : 'Unavailable'}
                  </span>
                </div>

                {diagnostics && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] mono">
                    {Object.entries(diagnostics.transports.localHttpApi.endpoints).map(
                      ([key, url]) => (
                        <div
                          key={key}
                          className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <span className="text-white/50">{key}</span>
                          <span className="text-white/90 truncate">{url}</span>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-white">
                    Test Local HTTP JSON-RPC (`POST /api/mcp`)
                  </h4>
                  <button
                    type="button"
                    onClick={() => handleCopy(curlMcpExample, 'curl-mcp')}
                    className="mono px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 transition"
                  >
                    {copiedKey === 'curl-mcp' ? 'Copied' : 'Copy curl'}
                  </button>
                </div>
                <pre className="overflow-x-auto rounded-lg bg-black/65 p-3 font-mono text-[11px] text-white/80 leading-relaxed">
                  {curlMcpExample}
                </pre>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold text-white">
                      OpenAPI 3.1.0 Specification
                    </h4>
                    <p className="text-[11px] text-white/55">
                      Uses active origin <code>{localBaseUrl}</code> for `/api/recall` and `/api/remember`.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(openApiSpec, 'openapi')}
                    className="mono px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 transition shrink-0"
                  >
                    {copiedKey === 'openapi' ? 'Copied' : 'Copy OpenAPI'}
                  </button>
                </div>
                <pre className="max-h-44 overflow-auto rounded-lg bg-black/65 p-3 font-mono text-[10.5px] text-white/75 leading-relaxed">
                  {openApiSpec}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: BROWSER COMPANION */}
          {activeTab === 'companion' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/10 p-4 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-indigo-100">
                    Browser Companion Extension (Separate from Desktop MCP)
                  </h3>
                  <span className="mono text-[11px] text-indigo-200">
                    {diagnostics?.transports.browserCompanion.activeDevices ?? 0} paired device(s)
                  </span>
                </div>
                <p className="text-xs text-white/75 leading-relaxed">
                  The unpacked Chrome/Edge/Brave extension communicates with{' '}
                  <code>{localBaseUrl}/api/companion/capture</code> using a SHA-256-hashed Bearer device token. It does not spawn a desktop stdio MCP process.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-1.5">
                  <div className="mono text-[11px] font-semibold text-[#9db4ff]">
                    Step 1 · Open Extensions
                  </div>
                  <p className="text-xs text-white/70 leading-relaxed">
                    Open <code className="bg-black/50 px-1 py-0.5 rounded">chrome://extensions</code> and enable <strong>Developer mode</strong>.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-1.5">
                  <div className="mono text-[11px] font-semibold text-[#9db4ff]">
                    Step 2 · Load Unpacked
                  </div>
                  <p className="text-xs text-white/70 leading-relaxed">
                    Select the <code>extension/</code> directory in this Argon workspace (configured for <code>127.0.0.1:3000</code> and <code>localhost:3000</code>).
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-1.5">
                  <div className="mono text-[11px] font-semibold text-[#9db4ff]">
                    Step 3 · Pair Device Token
                  </div>
                  <p className="text-xs text-white/70 leading-relaxed">
                    Generate a one-time <code>brn_live_*</code> token in the AI Sync Studio or Settings to authenticate captures into the Review Queue.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: WEB AI PRIMERS (FREE FALLBACK) */}
          {activeTab === 'web_primers' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {(['chatgpt', 'claude', 'gemini'] as const).map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setSelectedPrimer(provider)}
                    className={`mono px-3 py-1.5 rounded-lg text-xs transition ${
                      selectedPrimer === provider
                        ? 'bg-white text-black font-semibold'
                        : 'bg-white/5 text-white/65 hover:text-white'
                    }`}
                  >
                    {provider === 'chatgpt'
                      ? 'ChatGPT Web'
                      : provider === 'claude'
                        ? 'Claude Web'
                        : 'Gemini Web'}
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold text-white">
                      Manual Context Primer for "{currentBrain}"
                    </h4>
                    <p className="text-[11px] text-white/55">
                      Fallback when using web chat interfaces without Desktop MCP. Copy and paste into your session.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        selectedPrimer === 'chatgpt'
                          ? chatGptInstructions
                          : selectedPrimer === 'claude'
                            ? claudePrimer
                            : geminiPrimer,
                        `primer-${selectedPrimer}`
                      )
                    }
                    className="mono px-3 py-1.5 rounded-lg bg-[#9db4ff] text-[#050712] font-semibold text-xs hover:bg-white transition"
                  >
                    {copiedKey === `primer-${selectedPrimer}` ? 'Copied' : 'Copy Primer'}
                  </button>
                </div>
                <pre className="max-h-56 overflow-auto rounded-lg bg-black/65 p-3 font-mono text-[11px] text-white/80 leading-relaxed whitespace-pre-wrap">
                  {selectedPrimer === 'chatgpt'
                    ? chatGptInstructions
                    : selectedPrimer === 'claude'
                      ? claudePrimer
                      : geminiPrimer}
                </pre>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="mono text-xs text-white/75">
                    Concise Context Snapshot ("{currentBrain}")
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(contextSnapshot, 'snapshot')}
                    className="mono px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 transition"
                  >
                    {copiedKey === 'snapshot' ? 'Copied' : 'Copy Snapshot'}
                  </button>
                </div>
                <pre className="max-h-36 overflow-auto rounded-lg bg-black/60 p-2.5 font-mono text-[10.5px] text-white/70 leading-relaxed whitespace-pre-wrap">
                  {contextSnapshot}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 5: LIVE SIMULATOR */}
          {activeTab === 'simulator' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <h3 className="text-sm font-semibold text-white">
                  Local Recall & Save-Back Simulator
                </h3>
                <p className="text-xs text-white/65">
                  Exercises local recall against Brain <strong>"{currentBrain}"</strong> without calling external APIs.
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono text-xs text-white/50">Provider Persona:</span>
                  {(['gpt', 'claude', 'gemini'] as AISource[]).map((src) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setSimModel(src)}
                      className={`mono px-3 py-1.5 rounded-lg text-xs transition ${
                        simModel === src
                          ? 'bg-white text-black font-semibold'
                          : 'bg-white/5 text-white/65 hover:text-white'
                      }`}
                    >
                      {src.toUpperCase()}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    value={simPrompt}
                    onChange={(e) => setSimPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRunSimulation()}
                    placeholder="Type a recall query or durable fact..."
                    className="mono flex-1 rounded-xl border border-white/20 bg-black/50 px-3.5 py-2.5 text-xs text-white"
                  />
                  <button
                    type="button"
                    disabled={isSimulating || !simPrompt.trim()}
                    onClick={() => handleRunSimulation()}
                    className="mono rounded-xl bg-[#9db4ff] px-4 py-2.5 text-xs font-semibold text-[#050712] hover:bg-white transition disabled:opacity-40 min-h-[40px]"
                  >
                    {isSimulating ? 'Running...' : 'Run Local Test'}
                  </button>
                </div>

                {simLog && (
                  <div className="rounded-xl border border-white/10 bg-black/60 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10 mono text-xs text-white/60">
                      <span>Simulated {simLog.model.toUpperCase()}</span>
                      <span className="text-emerald-400">
                        {simLog.savedFact
                          ? 'Saved New Memory'
                          : `${simLog.recalled.length} Fact(s) Recalled`}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap rounded-lg bg-white/[0.03] p-3 text-xs text-white/90 leading-relaxed border border-white/10">
                      {simLog.reply}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/40 px-4 sm:px-6 py-3.5 safe-bottom">
          <div className="mono text-xs text-white/55">
            Target Brain: <strong className="text-white">"{currentBrain}"</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mono rounded-xl bg-white px-5 py-2 text-xs font-semibold text-black transition hover:bg-white/90 min-h-[38px]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
