import React, { useState, useEffect } from 'react';
import { brainStore } from '../services/brainStorage';
import { AISource, Fact } from '../types/brain';
import { BrainLogo } from './BrainLogo';

export type GuidedService = 'chatgpt' | 'claude' | 'gemini' | 'extension';

interface GuidedConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBrain: string;
  initialService?: GuidedService;
  onConnectionStatusChange?: () => void;
}

export const GuidedConnectionModal: React.FC<GuidedConnectionModalProps> = ({
  isOpen,
  onClose,
  currentBrain,
  initialService = 'chatgpt',
  onConnectionStatusChange,
}) => {
  const [selectedService, setSelectedService] = useState<GuidedService>(initialService);
  const [step, setStep] = useState<1 | 2 | 3>(2);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Status map
  const [connections, setConnections] = useState({
    chatgpt: false,
    claude: false,
    gemini: false,
    backend: false,
  });

  // Verification Test bench
  const [testPrompt, setTestPrompt] = useState('What project context is stored in my Brain?');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    recalled: Fact[];
    reply: string;
    savedFact?: Fact;
    success: boolean;
    isLiveApi?: boolean;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedService(initialService);
      setStep(2);
      setTestResult(null);
      refreshStatus();
    }
  }, [isOpen, initialService]);

  const refreshStatus = () => {
    const status = brainStore.getConnectionStatus();
    setConnections(status);
  };

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleToggleConnection = (service: 'chatgpt' | 'claude' | 'gemini', active: boolean) => {
    brainStore.setConnectionStatus(service, active);
    refreshStatus();
    if (onConnectionStatusChange) onConnectionStatusChange();
  };

  const handleRunVerification = async () => {
    if (!testPrompt.trim()) return;
    setIsTesting(true);

    const source: AISource =
      selectedService === 'chatgpt' ? 'gpt' : selectedService === 'claude' ? 'claude' : 'gemini';

    try {
      const res = await brainStore.runLiveAiTest(currentBrain, source, testPrompt);
      setTestResult({
        recalled: res.recalledFacts,
        reply: res.reply,
        savedFact: res.savedFact,
        success: true,
        isLiveApi: res.isLiveApi,
      });

      if (selectedService !== 'extension') {
        handleToggleConnection(selectedService as 'chatgpt' | 'claude' | 'gemini', true);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const chatGptCustomInstructions = brainStore.generateChatGptCustomInstructions(currentBrain);
  const chatGptResponseRules = brainStore.generateChatGptResponseRules(currentBrain);
  const claudePrimer = brainStore.generateClaudePrimer(currentBrain);
  const geminiPrimer = brainStore.generateGeminiPrimer(currentBrain);
  const contextSnapshot = brainStore.exportContextSnapshot(currentBrain);

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
          <div className="flex items-center gap-3">
            <BrainLogo size={20} className="text-white" />
            <div>
              <div className="flex items-center gap-2">
                <span className="mono text-xs font-semibold tracking-wider text-white">
                  GUIDED TWO-WAY SYNC WIZARD
                </span>
                <span className="mono rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[9.5px] text-emerald-300 font-semibold">
                  100% Free Plan Compatible
                </span>
              </div>
              <p className="mono text-[11px] text-white/50">
                Step-by-step connection for web users · No subscriptions or desktop apps
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

        {/* Step Indicator */}
        <div className="flex items-center justify-between border-b border-white/10 bg-black/40 px-6 py-2.5 mono text-xs">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setStep(1)}
              className={`flex items-center gap-2 transition ${
                step === 1 ? 'text-white font-semibold' : 'text-white/40 hover:text-white/70'
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                step === 1 ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/60'
              }`}>
                1
              </span>
              <span>Choose AI Service</span>
            </button>

            <span className="text-white/20">→</span>

            <button
              onClick={() => setStep(2)}
              className={`flex items-center gap-2 transition ${
                step === 2 ? 'text-white font-semibold' : 'text-white/40 hover:text-white/70'
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                step === 2 ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/60'
              }`}>
                2
              </span>
              <span>Setup Free Sync</span>
            </button>

            <span className="text-white/20">→</span>

            <button
              onClick={() => setStep(3)}
              className={`flex items-center gap-2 transition ${
                step === 3 ? 'text-white font-semibold' : 'text-white/40 hover:text-white/70'
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                step === 3 ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/60'
              }`}>
                3
              </span>
              <span>Verify & Activate</span>
            </button>
          </div>

          <div className="text-[11px] text-white/40 hidden sm:block">
            Target Brain: <strong className="text-white">"{currentBrain}"</strong>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 max-h-[65vh] scrollbar-thin">
          {/* STEP 1: SERVICE SELECTION */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Select External AI to Connect</h3>
                <p className="text-xs text-white/60 mt-1">
                  Choose which platform you want to configure first. All platforms work with standard free accounts.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* ChatGPT Option */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedService('chatgpt');
                    setStep(2);
                  }}
                  className={`text-left p-4 rounded-xl border transition ${
                    selectedService === 'chatgpt'
                      ? 'border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="mono text-xs font-semibold text-emerald-300">
                      ChatGPT Web (chatgpt.com)
                    </span>
                    {connections.chatgpt ? (
                      <span className="mono text-[9.5px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                        Active ✓
                      </span>
                    ) : (
                      <span className="mono text-[9.5px] text-white/40">Not Connected</span>
                    )}
                  </div>
                  <p className="text-xs text-white/70 mt-2 leading-relaxed">
                    Permanent two-way memory sync via ChatGPT Free's built-in Custom Instructions. Zero cost.
                  </p>
                </button>

                {/* Claude Option */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedService('claude');
                    setStep(2);
                  }}
                  className={`text-left p-4 rounded-xl border transition ${
                    selectedService === 'claude'
                      ? 'border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/30'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="mono text-xs font-semibold text-amber-300">
                      Claude Web (claude.ai)
                    </span>
                    {connections.claude ? (
                      <span className="mono text-[9.5px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
                        Active ✓
                      </span>
                    ) : (
                      <span className="mono text-[9.5px] text-white/40">Not Connected</span>
                    )}
                  </div>
                  <p className="text-xs text-white/70 mt-2 leading-relaxed">
                    Long-context memory priming & automatic structured milestone capture for free claude.ai chats.
                  </p>
                </button>

                {/* Gemini Option */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedService('gemini');
                    setStep(2);
                  }}
                  className={`text-left p-4 rounded-xl border transition ${
                    selectedService === 'gemini'
                      ? 'border-sky-500/60 bg-sky-500/10 ring-1 ring-sky-500/30'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="mono text-xs font-semibold text-sky-300">
                      Gemini Web (gemini.google.com)
                    </span>
                    {connections.gemini ? (
                      <span className="mono text-[9.5px] bg-sky-500/20 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 rounded">
                        Active ✓
                      </span>
                    ) : (
                      <span className="mono text-[9.5px] text-white/40">Not Connected</span>
                    )}
                  </div>
                  <p className="text-xs text-white/70 mt-2 leading-relaxed">
                    Grounding primer & structured takeaways for standard Google Gemini web chats.
                  </p>
                </button>

                {/* Browser Extension Option */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedService('extension');
                    setStep(2);
                  }}
                  className={`text-left p-4 rounded-xl border transition ${
                    selectedService === 'extension'
                      ? 'border-indigo-500/60 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="mono text-xs font-semibold text-indigo-300">
                      All-in-One Browser Extension
                    </span>
                    <span className="mono text-[9.5px] bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 px-1.5 py-0.5 rounded">
                      Recommended
                    </span>
                  </div>
                  <p className="text-xs text-white/70 mt-2 leading-relaxed">
                    Inject context and save conversations directly on ChatGPT, Claude, and Gemini tabs in 1-click.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: GUIDED SETUP INSTRUCTIONS */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Service Subtitle Bar */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/50">Configuring:</span>
                  <span className="mono text-xs font-bold text-white uppercase">
                    {selectedService === 'chatgpt'
                      ? 'ChatGPT Web (Free Plan)'
                      : selectedService === 'claude'
                      ? 'Claude Web (Free Plan)'
                      : selectedService === 'gemini'
                      ? 'Gemini Web (Free Plan)'
                      : 'All-In-One Browser Extension'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="mono text-[11px] text-indigo-400 hover:text-indigo-300 transition"
                >
                  Change Service
                </button>
              </div>

              {/* CHATGPT FREE WALKTHROUGH */}
              {selectedService === 'chatgpt' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-200">
                    <strong>Two-Way Sync on ChatGPT Free:</strong> We use ChatGPT's built-in Custom Instructions (100% free, no ChatGPT Plus needed). ChatGPT pulls your Brain memory into every chat, and formats new decisions with <code>### 🧠 SAVE TO BRAIN:</code> so you can save them with 1 click!
                  </div>

                  <div className="space-y-2.5">
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="mono text-[11px] font-semibold text-white">
                          1. Open ChatGPT Custom Instructions
                        </span>
                        <a
                          href="https://chatgpt.com"
                          target="_blank"
                          rel="noreferrer"
                          className="mono px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium hover:bg-emerald-500/30 transition flex items-center gap-1"
                        >
                          <span>Open chatgpt.com</span>
                          <span>↗</span>
                        </a>
                      </div>
                      <p className="text-xs text-white/70 leading-relaxed">
                        In <a href="https://chatgpt.com" target="_blank" rel="noreferrer" className="text-emerald-400 underline">chatgpt.com</a>, click your profile icon (bottom-left or top-right) $\rightarrow$ <strong>Settings</strong> $\rightarrow$ <strong>Personalization</strong> $\rightarrow$ <strong>Custom Instructions</strong>.
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="mono text-[11px] font-semibold text-white">
                          2. Paste Box 1: Stored Facts & Context
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(chatGptCustomInstructions, 'chatgpt-sync')}
                          className="mono px-3 py-1 rounded-lg bg-emerald-500 text-black font-semibold text-xs hover:bg-emerald-400 transition"
                        >
                          {copiedKey === 'chatgpt-sync' ? 'Copied ✓' : 'Copy Box 1 Instructions'}
                        </button>
                      </div>
                      <p className="text-[11px] text-white/50">
                        Paste into: <em>"What would you like ChatGPT to know about you to provide better responses?"</em>
                      </p>
                      <pre className="max-h-28 overflow-y-auto rounded-lg bg-black/60 p-2.5 font-mono text-[11px] text-white/80 leading-relaxed scrollbar-thin whitespace-pre-wrap">
                        {chatGptCustomInstructions}
                      </pre>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="mono text-[11px] font-semibold text-white">
                          3. Paste Box 2: Response & Memory Capture Rules
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(chatGptResponseRules, 'chatgpt-rules')}
                          className="mono px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold text-xs hover:bg-emerald-500/30 transition"
                        >
                          {copiedKey === 'chatgpt-rules' ? 'Copied ✓' : 'Copy Box 2 Rules'}
                        </button>
                      </div>
                      <p className="text-[11px] text-white/50">
                        Paste into: <em>"How would you like ChatGPT to respond?"</em>
                      </p>
                      <pre className="max-h-20 overflow-y-auto rounded-lg bg-black/60 p-2 font-mono text-[11px] text-white/80 leading-relaxed scrollbar-thin whitespace-pre-wrap">
                        {chatGptResponseRules}
                      </pre>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-1.5">
                      <span className="mono text-[11px] font-semibold text-white">
                        4. Enable Toggle & Click Save
                      </span>
                      <p className="text-xs text-white/70 leading-relaxed">
                        Ensure <strong>"Enable for new chats"</strong> is toggled ON, then click <strong>Save</strong>. Every new conversation on ChatGPT web is now synchronized with your Brain!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* CLAUDE FREE WALKTHROUGH */}
              {selectedService === 'claude' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
                    <strong>Two-Way Sync on Claude Free:</strong> Claude Web has a massive 200k context window. Use this tailored primer in new chats to ground Claude in your durable memory and have it surface decisions for 1-click capture.
                  </div>

                  <div className="space-y-2.5">
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="mono text-[11px] font-semibold text-white">
                          1. Open Claude.ai Web
                        </span>
                        <a
                          href="https://claude.ai"
                          target="_blank"
                          rel="noreferrer"
                          className="mono px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-medium hover:bg-amber-500/30 transition flex items-center gap-1"
                        >
                          <span>Open claude.ai</span>
                          <span>↗</span>
                        </a>
                      </div>
                      <p className="text-xs text-white/70 leading-relaxed">
                        Navigate to <a href="https://claude.ai" target="_blank" rel="noreferrer" className="text-amber-400 underline">claude.ai</a> and start a new chat.
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="mono text-[11px] font-semibold text-white">
                          2. Copy Claude Two-Way Memory Primer
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(claudePrimer, 'claude-primer')}
                          className="mono px-3 py-1 rounded-lg bg-amber-500 text-black font-semibold text-xs hover:bg-amber-400 transition"
                        >
                          {copiedKey === 'claude-primer' ? 'Copied ✓' : 'Copy Claude Primer'}
                        </button>
                      </div>
                      <pre className="max-h-36 overflow-y-auto rounded-lg bg-black/60 p-2.5 font-mono text-[11px] text-white/80 leading-relaxed scrollbar-thin whitespace-pre-wrap">
                        {claudePrimer}
                      </pre>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-1.5">
                      <span className="mono text-[11px] font-semibold text-white">
                        3. Saving Back to Brain
                      </span>
                      <p className="text-xs text-white/70 leading-relaxed">
                        Whenever Claude highlights a durable fact or milestone, you can paste it into "+ Store Fact" or use the Brain Companion extension to save in 1 click!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* GEMINI FREE WALKTHROUGH */}
              {selectedService === 'gemini' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5 text-xs text-sky-200">
                    <strong>Two-Way Sync on Gemini Free:</strong> Connects Gemini web chats by grounding Gemini in your verified memories and formatting takeaways as <code>🧠 SAVED FACT:</code>.
                  </div>

                  <div className="space-y-2.5">
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="mono text-[11px] font-semibold text-white">
                          1. Open Gemini Web
                        </span>
                        <a
                          href="https://gemini.google.com"
                          target="_blank"
                          rel="noreferrer"
                          className="mono px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[11px] font-medium hover:bg-sky-500/30 transition flex items-center gap-1"
                        >
                          <span>Open gemini.google.com</span>
                          <span>↗</span>
                        </a>
                      </div>
                      <p className="text-xs text-white/70 leading-relaxed">
                        Navigate to <a href="https://gemini.google.com" target="_blank" rel="noreferrer" className="text-sky-400 underline">gemini.google.com</a>.
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="mono text-[11px] font-semibold text-white">
                          2. Copy Gemini Grounding Primer
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(geminiPrimer, 'gemini-primer')}
                          className="mono px-3 py-1 rounded-lg bg-sky-500 text-black font-semibold text-xs hover:bg-sky-400 transition"
                        >
                          {copiedKey === 'gemini-primer' ? 'Copied ✓' : 'Copy Primer'}
                        </button>
                      </div>
                      <pre className="max-h-36 overflow-y-auto rounded-lg bg-black/60 p-2.5 font-mono text-[11px] text-white/80 leading-relaxed scrollbar-thin whitespace-pre-wrap">
                        {geminiPrimer}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {/* EXTENSION WALKTHROUGH */}
              {selectedService === 'extension' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3.5 text-xs text-indigo-200">
                    <strong>The 100% Free Browser Companion:</strong> Injects memories into prompt boxes and captures chat turns back into SQLite with zero manual copy-pasting.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-1">
                      <span className="mono text-[10.5px] font-semibold text-indigo-300">1. chrome://extensions</span>
                      <p className="text-xs text-white/70">
                        Open extensions tab in Chrome/Edge/Brave and switch on <strong>Developer mode</strong>.
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-1">
                      <span className="mono text-[10.5px] font-semibold text-indigo-300">2. Load Unpacked</span>
                      <p className="text-xs text-white/70">
                        Click <strong>Load unpacked</strong> and select the <code>extension/</code> folder.
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-1">
                      <span className="mono text-[10.5px] font-semibold text-indigo-300">3. 1-Click Sync</span>
                      <p className="text-xs text-white/70">
                        Click the Brain icon on any AI chat tab to Inject Memory or Save Chat!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Continue to Step 3 */}
              <div className="pt-2 flex items-center justify-between border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="mono text-xs text-white/60 hover:text-white"
                >
                  ← Back to Selection
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="mono rounded-xl bg-white px-5 py-2 text-xs font-semibold text-black transition hover:bg-white/90 shadow"
                >
                  Proceed to Step 3: Verify & Activate →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: VERIFICATION TEST BENCH */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Step 3: Verify Two-Way Sync & Activate
                </h3>
                <p className="text-xs text-white/60 mt-1">
                  Run a live verification test to confirm your brain can recall facts and store new decisions for {selectedService.toUpperCase()}.
                </p>
              </div>

              {/* Test Input Form */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <label className="mono text-xs text-white/70 block">
                  Test Prompt (Try asking about your facts or establishing a new decision):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRunVerification()}
                    className="mono flex-1 rounded-xl border border-white/20 bg-black/50 px-3.5 py-2 text-xs text-white outline-none"
                  />
                  <button
                    type="button"
                    disabled={isTesting || !testPrompt.trim()}
                    onClick={handleRunVerification}
                    className="mono rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-40 shrink-0"
                  >
                    {isTesting ? 'Verifying...' : 'Run Test Sync'}
                  </button>
                </div>

                {/* Preset Suggestions */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTestPrompt('What project context is stored in my Brain?');
                    }}
                    className="mono text-[10.5px] rounded border border-white/10 bg-white/5 px-2 py-0.5 text-white/60 hover:text-white"
                  >
                    Test Recall: "What project context..."
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTestPrompt('Remember that we finalized two-way free web sync for ChatGPT');
                    }}
                    className="mono text-[10.5px] rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300 hover:bg-emerald-500/20"
                  >
                    Test Auto-Save: "Remember that we finalized..."
                  </button>
                </div>
              </div>

              {/* Verification Output */}
              {testResult && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20 mono text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-300 font-semibold">
                        ✓ Two-Way Sync Verification Successful!
                      </span>
                      {testResult.isLiveApi ? (
                        <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[9.5px] text-emerald-300 font-semibold">
                          ⚡ Live Gemini AI
                        </span>
                      ) : (
                        <span className="rounded bg-indigo-500/20 border border-indigo-500/40 px-2 py-0.5 text-[9.5px] text-indigo-300 font-semibold">
                          Two-Way Memory Bench
                        </span>
                      )}
                    </div>
                    <span className="text-white/60">
                      {testResult.savedFact ? 'Fact Recorded' : `${testResult.recalled.length} Fact(s) Recalled`}
                    </span>
                  </div>

                  {testResult.recalled.length > 0 && (
                    <div className="space-y-1">
                      <span className="mono text-[10px] text-white/50 uppercase">Grounding Facts Retrieved:</span>
                      {testResult.recalled.slice(0, 1).map((rf) => (
                        <div key={rf.id} className="mono text-[11px] text-white/80 bg-black/40 p-2 rounded">
                          [#{rf.id}] {rf.content.slice(0, 150)}...
                        </div>
                      ))}
                    </div>
                  )}

                  {testResult.savedFact && (
                    <div className="mono text-xs text-emerald-300 bg-black/40 p-2 rounded">
                      <strong>✓ Auto-Saved to SQLite:</strong> Fact #{testResult.savedFact.id} ("{testResult.savedFact.content}")
                    </div>
                  )}

                  <div className="space-y-1">
                    <span className="mono text-[10px] text-white/50 uppercase">Verified AI Response:</span>
                    <div className="text-xs text-white/90 bg-black/40 p-3 rounded leading-relaxed whitespace-pre-wrap">
                      {testResult.reply}
                    </div>
                  </div>
                </div>
              )}

              {/* Activation Controls */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white">
                    Connection Status for {selectedService.toUpperCase()}
                  </div>
                  <p className="text-[11px] text-white/50 mt-0.5">
                    Keep this marked as Active to display real-time status in the Brain header.
                  </p>
                </div>

                {selectedService !== 'extension' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const current = connections[selectedService as 'chatgpt' | 'claude' | 'gemini'];
                      handleToggleConnection(selectedService as 'chatgpt' | 'claude' | 'gemini', !current);
                    }}
                    className={`mono px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                      connections[selectedService as 'chatgpt' | 'claude' | 'gemini']
                        ? 'bg-emerald-500 text-black hover:bg-emerald-400'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {connections[selectedService as 'chatgpt' | 'claude' | 'gemini']
                      ? '✓ Connected (Click to Deactivate)'
                      : 'Mark as Active'}
                  </button>
                ) : (
                  <span className="mono text-xs text-emerald-400">Extension Ready ✓</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-white/10 bg-black/40 px-6 py-3.5">
          <div className="flex items-center gap-2 mono text-xs text-white/50">
            <span>Status:</span>
            <span className={connections.chatgpt ? 'text-emerald-400' : 'text-white/40'}>GPT {connections.chatgpt ? '●' : '○'}</span>
            <span className="text-white/20">·</span>
            <span className={connections.claude ? 'text-amber-400' : 'text-white/40'}>Claude {connections.claude ? '●' : '○'}</span>
            <span className="text-white/20">·</span>
            <span className={connections.gemini ? 'text-sky-400' : 'text-white/40'}>Gemini {connections.gemini ? '●' : '○'}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mono rounded-xl bg-white px-5 py-2 text-xs font-semibold text-black transition hover:bg-white/90 shadow"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
