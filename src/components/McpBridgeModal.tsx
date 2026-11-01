import React, { useState, useEffect } from 'react';
import { brainStore } from '../services/brainStorage';
import { AISource, Fact } from '../types/brain';
import { BrainLogo } from './BrainLogo';

interface McpBridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBrain: string;
}

type BridgeTab = 'extension' | 'chatgpt' | 'claude' | 'gemini' | 'simulator' | 'advanced';

export const McpBridgeModal: React.FC<McpBridgeModalProps> = ({
  isOpen,
  onClose,
  currentBrain,
}) => {
  const [activeTab, setActiveTab] = useState<BridgeTab>('extension');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Local server prober
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

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

  useEffect(() => {
    if (!isOpen) return;

    // Check if local web server (http://localhost:8787) is responding
    fetch('http://localhost:8787/api/brains', { signal: AbortSignal.timeout(1500) })
      .then((res) => {
        setServerOnline(res.ok);
      })
      .catch(() => {
        setServerOnline(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
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
    }, 400);
  };

  const chatGptInstructions = brainStore.generateChatGptCustomInstructions(currentBrain);
  const claudePrimer = brainStore.generateClaudePrimer(currentBrain);
  const geminiPrimer = brainStore.generateGeminiPrimer(currentBrain);
  const contextSnapshot = brainStore.exportContextSnapshot(currentBrain);
  const openApiSpec = JSON.stringify(brainStore.getOpenApiSpec(), null, 2);
  const desktopMcpJson = JSON.stringify(
    {
      mcpServers: {
        brain: {
          command: 'python3',
          args: ['-m', 'brain.server'],
          env: { BRAIN_DEFAULT: currentBrain },
        },
      },
    },
    null,
    2
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity"
      />

      {/* Modal Dialog */}
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-white/20 bg-[#060814]/95 shadow-2xl backdrop-blur-2xl overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3 text-white">
            <BrainLogo size={18} className="text-white" />
            <div>
              <div className="flex items-center gap-2">
                <span className="mono text-xs font-semibold tracking-wider text-white">
                  WEB AI & MEMORY BRIDGE
                </span>
                <span className="mono rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] text-emerald-300 font-semibold">
                  100% Free Plan Compatible
                </span>
              </div>
              <p className="mono text-[11px] text-white/50">
                Connect your memory to ChatGPT, Claude & Gemini web chats with zero subscriptions.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 transition hover:text-white p-1 text-sm mono"
          >
            ✕
          </button>
        </div>

        {/* Tab Strip */}
        <div className="flex items-center gap-1 border-b border-white/10 bg-black/40 px-6 py-2 overflow-x-auto scrollbar-thin">
          <button
            onClick={() => setActiveTab('extension')}
            className={`mono whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'extension'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            Browser Extension (1-Click)
          </button>
          <button
            onClick={() => setActiveTab('chatgpt')}
            className={`mono whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'chatgpt'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            ChatGPT Web (Free)
          </button>
          <button
            onClick={() => setActiveTab('claude')}
            className={`mono whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'claude'
                ? 'bg-amber-600 text-white shadow'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            Claude Web (Free)
          </button>
          <button
            onClick={() => setActiveTab('gemini')}
            className={`mono whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'gemini'
                ? 'bg-sky-600 text-white shadow'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            Gemini Web (Free)
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`mono whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'simulator'
                ? 'bg-purple-600 text-white shadow'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            🧪 Live Simulator
          </button>
          <button
            onClick={() => setActiveTab('advanced')}
            className={`mono whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'advanced'
                ? 'bg-white/20 text-white shadow'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}
          >
            Advanced / Plus
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 max-h-[65vh] scrollbar-thin">
          {/* TAB 1: BROWSER EXTENSION COMPANION */}
          {activeTab === 'extension' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-indigo-200">
                    The Brain Browser Companion (Chrome / Edge / Brave)
                  </h3>
                  <span className="mono text-[11px] text-indigo-300">
                    Active Brain: <strong className="text-white">"{currentBrain}"</strong>
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-white/70 leading-relaxed">
                  The fastest zero-cost way to connect your memory. Once loaded into your browser, it adds 1-click <strong>"Inject Memory"</strong> and <strong>"Save Chat"</strong> buttons directly while you browse <code>chatgpt.com</code>, <code>claude.ai</code>, or <code>gemini.google.com</code>.
                </p>
              </div>

              {/* Local Server Prober Status */}
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 py-3 mono text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-white/60">Local Memory API Status:</span>
                  {serverOnline ? (
                    <span className="text-emerald-400 font-medium">✓ Online (http://localhost:8787)</span>
                  ) : serverOnline === false ? (
                    <span className="text-amber-400 font-medium">
                      Offline · Run <code>python -m brain.web</code> in terminal
                    </span>
                  ) : (
                    <span className="text-white/40">Checking...</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setServerOnline(null);
                    fetch('http://localhost:8787/api/brains', { signal: AbortSignal.timeout(1500) })
                      .then((r) => setServerOnline(r.ok))
                      .catch(() => setServerOnline(false));
                  }}
                  className="text-indigo-400 hover:text-indigo-300 transition"
                >
                  Re-check
                </button>
              </div>

              {/* 3-Step Setup Guide */}
              <div className="space-y-3">
                <h4 className="mono text-xs uppercase tracking-wider text-white/50">
                  3-Step Setup (Takes 30 Seconds)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-1.5">
                    <div className="mono text-[11px] font-semibold text-indigo-400">
                      Step 1 · Open Extensions
                    </div>
                    <p className="text-xs text-white/70 leading-relaxed">
                      In Chrome or Brave, navigate to:
                      <code className="block mt-1 bg-black/50 p-1 rounded text-[11px] text-white/90">
                        chrome://extensions
                      </code>
                      and toggle on <strong>Developer mode</strong> (top right).
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-1.5">
                    <div className="mono text-[11px] font-semibold text-indigo-400">
                      Step 2 · Load Unpacked
                    </div>
                    <p className="text-xs text-white/70 leading-relaxed">
                      Click the <strong>Load unpacked</strong> button and select the <code>extension/</code> folder located in this workspace.
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-1.5">
                    <div className="mono text-[11px] font-semibold text-indigo-400">
                      Step 3 · Pin & Use
                    </div>
                    <p className="text-xs text-white/70 leading-relaxed">
                      Pin the Brain icon to your toolbar. Open ChatGPT, Claude, or Gemini web and click <strong>Inject Memory</strong> or <strong>Save Chat</strong>!
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="mono text-xs text-white/70">
                    Quick Context Snapshot for "{currentBrain}"
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(contextSnapshot, 'snapshot')}
                    className="mono px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 transition"
                  >
                    {copiedKey === 'snapshot' ? 'Copied ✓' : 'Copy Snapshot'}
                  </button>
                </div>
                <pre className="max-h-28 overflow-y-auto rounded-lg bg-black/60 p-2.5 font-mono text-[10.5px] text-white/70 leading-relaxed scrollbar-thin">
                  {contextSnapshot}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 2: CHATGPT WEB (FREE) */}
          {activeTab === 'chatgpt' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-emerald-200">
                    ChatGPT Web Free · Two-Way Memory Guide
                  </h3>
                  <span className="mono text-[10.5px] text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded">
                    100% Free · No Plus Required
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-white/70 leading-relaxed">
                  On the free tier of ChatGPT, you can connect your Brain using <strong>Custom Instructions</strong> (permanent memory across all chats) or the <strong>Browser Extension</strong> (1-click prompt injection).
                </p>
              </div>

              {/* Method 1: Permanent Custom Instructions */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-white">
                      Method 1: Permanent Memory via ChatGPT Custom Instructions
                    </h4>
                    <p className="text-[11px] text-white/50">
                      In chatgpt.com, click your Profile → Settings → Personalization → Custom Instructions.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(chatGptInstructions, 'chatgpt-instructions')}
                    className="mono px-3 py-1.5 rounded-lg bg-emerald-500 text-black font-semibold text-xs hover:bg-emerald-400 transition shrink-0"
                  >
                    {copiedKey === 'chatgpt-instructions' ? 'Copied ✓' : 'Copy Instructions'}
                  </button>
                </div>

                <div className="rounded-lg bg-black/60 p-3">
                  <span className="mono text-[10px] text-white/40 block mb-1">
                    Paste into: "What would you like ChatGPT to know about you to provide better responses?"
                  </span>
                  <pre className="max-h-36 overflow-y-auto font-mono text-[11px] text-white/80 leading-relaxed scrollbar-thin whitespace-pre-wrap">
                    {chatGptInstructions}
                  </pre>
                </div>
              </div>

              {/* Method 2: Extension Flow */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                <h4 className="text-xs font-semibold text-white">
                  Method 2: One-Click Extension Injection & Saving
                </h4>
                <p className="text-xs text-white/70 leading-relaxed">
                  With the Chrome Extension loaded, you can open any chat on <code>chatgpt.com</code>, click the Brain icon, and:
                </p>
                <ul className="list-disc list-inside text-xs text-white/60 space-y-1">
                  <li>Click <strong>Inject Brain Memory</strong> to pre-fill your prompt box with your facts.</li>
                  <li>Click <strong>Save Current Web Chat</strong> to automatically record decisions back into SQLite!</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 3: CLAUDE WEB (FREE) */}
          {activeTab === 'claude' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-amber-200">
                    Claude Web Free · Memory Priming & Capture
                  </h3>
                  <span className="mono text-[10.5px] text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded">
                    Free Claude.ai Chats
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-white/70 leading-relaxed">
                  Claude has a massive context window. In free chats on <code>claude.ai</code>, paste this tailored primer at the start of your session, or use the extension to inject it automatically.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-white">
                      Claude Context Primer Block
                    </h4>
                    <p className="text-[11px] text-white/50">
                      Paste at the beginning of any new conversation on claude.ai.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(claudePrimer, 'claude-primer')}
                    className="mono px-3 py-1.5 rounded-lg bg-amber-500 text-black font-semibold text-xs hover:bg-amber-400 transition shrink-0"
                  >
                    {copiedKey === 'claude-primer' ? 'Copied ✓' : 'Copy Claude Primer'}
                  </button>
                </div>

                <pre className="max-h-44 overflow-y-auto rounded-lg bg-black/60 p-3 font-mono text-[11px] text-white/80 leading-relaxed scrollbar-thin whitespace-pre-wrap">
                  {claudePrimer}
                </pre>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-3.5 text-xs text-white/60">
                <strong className="text-white">How Claude saves facts back:</strong> Claude will highlight any finalized milestone with <code>🧠 DURABLE FACT: ...</code>. When done, click <strong>Save Current Web Chat</strong> in the extension to automatically merge it into your brain!
              </div>
            </div>
          )}

          {/* TAB 4: GEMINI WEB (FREE) */}
          {activeTab === 'gemini' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-sky-200">
                    Gemini Web Free · Grounding & Memory Sync
                  </h3>
                  <span className="mono text-[10.5px] text-sky-300 bg-sky-500/20 px-2 py-0.5 rounded">
                    Free Gemini Chats
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-white/70 leading-relaxed">
                  Connect your memory to Google Gemini on <code>gemini.google.com</code> using one-click prompt injection or pasting this tailored memory primer.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-white">
                      Gemini Grounding Primer
                    </h4>
                    <p className="text-[11px] text-white/50">
                      Paste into Gemini web prompt box or custom system instructions.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(geminiPrimer, 'gemini-primer')}
                    className="mono px-3 py-1.5 rounded-lg bg-sky-500 text-black font-semibold text-xs hover:bg-sky-400 transition shrink-0"
                  >
                    {copiedKey === 'gemini-primer' ? 'Copied ✓' : 'Copy Gemini Primer'}
                  </button>
                </div>

                <pre className="max-h-44 overflow-y-auto rounded-lg bg-black/60 p-3 font-mono text-[11px] text-white/80 leading-relaxed scrollbar-thin whitespace-pre-wrap">
                  {geminiPrimer}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 5: LIVE MEMORY SIMULATOR */}
          {activeTab === 'simulator' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-purple-200">
                    Live Web AI Memory Simulator
                  </h3>
                  <span className="mono text-[10.5px] text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded">
                    Test Two-Way Flow Right Now
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-white/70 leading-relaxed">
                  Test how ChatGPT, Claude, and Gemini retrieve your durable facts and automatically save new ones to brain <strong>"{currentBrain}"</strong> before opening any external tabs.
                </p>
              </div>

              {/* Persona Selector */}
              <div className="flex items-center gap-2">
                <span className="mono text-xs text-white/50">Simulate:</span>
                <div className="flex rounded-lg border border-white/15 bg-black/40 p-0.5 mono text-xs">
                  <button
                    type="button"
                    onClick={() => setSimModel('gpt')}
                    className={`px-3 py-1 rounded transition ${
                      simModel === 'gpt' ? 'bg-emerald-600 text-white font-medium' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    ChatGPT Web
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimModel('claude')}
                    className={`px-3 py-1 rounded transition ${
                      simModel === 'claude' ? 'bg-amber-600 text-white font-medium' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Claude Web
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimModel('gemini')}
                    className={`px-3 py-1 rounded transition ${
                      simModel === 'gemini' ? 'bg-sky-600 text-white font-medium' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Gemini Web
                  </button>
                </div>
              </div>

              {/* Preset Test Buttons */}
              <div className="space-y-1.5">
                <span className="mono text-[10.5px] text-white/40 block">Try Preset Test Messages:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSimPrompt('What is our architecture for The Brain?');
                      handleRunSimulation('What is our architecture for The Brain?');
                    }}
                    className="mono rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/80 hover:text-white hover:bg-white/10 transition"
                  >
                    1. Test Recall ("What is our architecture...")
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const testSave = 'Remember that we switched to SQLite FTS5 for zero-latency semantic recall';
                      setSimPrompt(testSave);
                      handleRunSimulation(testSave);
                    }}
                    className="mono rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 transition"
                  >
                    2. Test Auto-Save ("Remember that we switched to SQLite...")
                  </button>
                </div>
              </div>

              {/* Input Form */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={simPrompt}
                  onChange={(e) => setSimPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRunSimulation()}
                  placeholder="Type a message or fact to test..."
                  className="mono flex-1 rounded-xl border border-white/20 bg-black/50 px-3.5 py-2 text-xs text-white outline-none"
                />
                <button
                  type="button"
                  disabled={isSimulating || !simPrompt.trim()}
                  onClick={() => handleRunSimulation()}
                  className="mono rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 transition disabled:opacity-40"
                >
                  {isSimulating ? 'Processing...' : 'Send Test'}
                </button>
              </div>

              {/* Simulation Result Output */}
              {simLog && (
                <div className="rounded-xl border border-white/10 bg-black/60 p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10 mono text-xs text-white/60">
                    <span>
                      Interaction Log · Simulated {simLog.model.toUpperCase()}
                    </span>
                    <span className="text-emerald-400">
                      {simLog.savedFact ? '✓ Memory Auto-Saved' : `✓ ${simLog.recalled.length} Fact(s) Recalled`}
                    </span>
                  </div>

                  {/* Recalled Facts Pill */}
                  {simLog.recalled.length > 0 && (
                    <div className="space-y-1">
                      <span className="mono text-[10px] text-white/40 uppercase">Facts Recalled from SQLite:</span>
                      <div className="space-y-1">
                        {simLog.recalled.slice(0, 2).map((rf) => (
                          <div key={rf.id} className="mono text-[11px] text-white/70 bg-white/5 p-2 rounded border border-white/5">
                            [#{rf.id} | {rf.source.toUpperCase()}] {rf.content.slice(0, 140)}...
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Saved Fact Notification */}
                  {simLog.savedFact && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 p-2.5 mono text-xs text-emerald-300">
                      <strong>✓ Stored New Fact #{simLog.savedFact.id}</strong> into brain "{currentBrain}"!
                    </div>
                  )}

                  {/* AI Reply */}
                  <div className="space-y-1">
                    <span className="mono text-[10px] text-white/40 uppercase">Simulated AI Response:</span>
                    <div className="whitespace-pre-wrap rounded-lg bg-white/[0.03] p-3 text-xs text-white/90 leading-relaxed border border-white/10">
                      {simLog.reply}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: ADVANCED / PLUS & DESKTOP MCP */}
          {activeTab === 'advanced' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-white">
                      ChatGPT Plus Custom Action (OpenAPI Spec)
                    </h4>
                    <p className="text-[11px] text-white/50">
                      If you ever upgrade to ChatGPT Plus, you can paste this into "Create new action" in Custom GPTs.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(openApiSpec, 'openapi')}
                    className="mono px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 transition shrink-0"
                  >
                    {copiedKey === 'openapi' ? 'Copied ✓' : 'Copy OpenAPI Spec'}
                  </button>
                </div>
                <pre className="max-h-36 overflow-y-auto rounded-lg bg-black/60 p-3 font-mono text-[10.5px] text-white/70 leading-relaxed scrollbar-thin">
                  {openApiSpec}
                </pre>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-white">
                      Desktop MCP Config (Claude Desktop / Cursor)
                    </h4>
                    <p className="text-[11px] text-white/50">
                      For desktop apps using stdio terminal processes.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(desktopMcpJson, 'desktop-mcp')}
                    className="mono px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 transition shrink-0"
                  >
                    {copiedKey === 'desktop-mcp' ? 'Copied ✓' : 'Copy Config'}
                  </button>
                </div>
                <pre className="max-h-28 overflow-y-auto rounded-lg bg-black/60 p-3 font-mono text-[10.5px] text-white/70 leading-relaxed scrollbar-thin">
                  {desktopMcpJson}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-white/10 bg-black/40 px-6 py-3.5">
          <div className="mono text-xs text-white/50 flex items-center gap-1.5">
            <span>Targeting Brain:</span>
            <strong className="text-white">"{currentBrain}"</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mono rounded-xl bg-white px-5 py-2 text-xs font-semibold text-black transition hover:bg-white/90 shadow-md"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
