import React, { useState, useEffect } from 'react';
import {
  Code2,
  GraduationCap,
  User,
  BrainCircuit,
  Check,
  Database,
  Search,
  MousePointerClick,
  Plug,
  IdCard,
} from 'lucide-react';
import { Constellation, ConstellationMood } from './Constellation';
import { BrainLogo } from './BrainLogo';
import { brainStore } from '../services/brainStorage';
import { DeleteBrainModal } from './DeleteBrainModal';
import { SOURCE_PALETTE, AISource } from '../types/brain';

interface WelcomeViewProps {
  onEnterBrain: (selectedBrain?: string, userLabel?: string) => void;
  isEnteringExternal?: boolean;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  onEnterBrain,
  isEnteringExternal = false,
}) => {
  const [brains, setBrains] = useState<string[]>(() => brainStore.getBrains());
  const [brainCounts, setBrainCounts] = useState<Record<string, number>>(() =>
    brainStore.getFactCountsByBrain()
  );
  const [selectedBrain, setSelectedBrain] = useState<string>(() => {
    const list = brainStore.getBrains();
    return list.includes('coding') ? 'coding' : list[0] || 'coding';
  });
  const [userLabel, setUserLabel] = useState<string>('');
  const [isEnteringLocal, setIsEnteringLocal] = useState(false);
  const [isHoveredLaunch, setIsHoveredLaunch] = useState(false);
  const [isCreatingBrain, setIsCreatingBrain] = useState(false);
  const [newBrainInput, setNewBrainInput] = useState('');
  const [brainToDelete, setBrainToDelete] = useState<string | null>(null);

  useEffect(() => {
    const syncState = () => {
      const updated = brainStore.getBrains();
      setBrains(updated);
      setBrainCounts(brainStore.getFactCountsByBrain());
      if (!updated.includes(selectedBrain) && updated.length > 0) {
        setSelectedBrain(updated[0]);
      }
    };
    syncState();
    const unsubscribe = brainStore.subscribe(syncState);
    return unsubscribe;
  }, [selectedBrain]);

  const isEntering = isEnteringLocal || isEnteringExternal;

  const mood: ConstellationMood = isEntering
    ? 'entering'
    : isHoveredLaunch
    ? 'typing'
    : 'idle';

  const handleLaunch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isEntering) return;
    setIsEnteringLocal(true);
    onEnterBrain(selectedBrain, userLabel.trim() || 'Local Developer');
  };

  const handleCreateNewBrain = () => {
    const name = newBrainInput.trim().toLowerCase();
    if (!name) return;
    brainStore.createBrain(name);
    setSelectedBrain(name);
    setNewBrainInput('');
    setIsCreatingBrain(false);
  };

  const getBrainIcon = (brainName: string) => {
    const lower = brainName.toLowerCase();
    if (lower === 'coding' || lower.includes('dev') || lower.includes('code')) {
      return <Code2 className="h-4 w-4" />;
    }
    if (lower === 'college' || lower.includes('uni') || lower.includes('study')) {
      return <GraduationCap className="h-4 w-4" />;
    }
    if (lower === 'personal' || lower.includes('life')) {
      return <User className="h-4 w-4" />;
    }
    return <BrainCircuit className="h-4 w-4" />;
  };

  const formatBrainTitle = (name: string) =>
    name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Coding';

  const sourceKeys = Object.keys(SOURCE_PALETTE) as AISource[];

  return (
    <main className="relative min-h-[100svh] overflow-x-hidden bg-[#03040a] text-white selection:bg-white/20">
      {/* Multi-Source Interactive Neural Constellation Hero */}
      <Constellation mood={mood} />

      {/* Subtle spatial grid overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity ease-out [background-image:linear-gradient(rgba(255,255,255,.022)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.022)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(circle_at_center,black,transparent_82%)]"
        style={{
          opacity: isEntering ? 0 : 0.2,
          transitionDuration: '420ms',
        }}
      />

      {/* Soft dark vignette behind left workspace column */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[640px] w-[580px] -translate-x-1/2 -translate-y-1/2 transition-opacity ease-out lg:left-[28%] lg:h-[720px] lg:w-[660px]"
        style={{
          background:
            'radial-gradient(closest-side, rgba(4,5,11,0.94) 0%, rgba(4,5,11,0.78) 58%, rgba(3,4,10,0) 100%)',
          opacity: isEntering ? 0 : 1,
          transitionDuration: '300ms',
        }}
      />

      {/* Foreground Content Layout */}
      <div
        className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-[1380px] flex-col justify-between px-6 py-8 sm:px-10 lg:px-16 lg:py-10 transition-[opacity,transform] ease-out"
        style={{
          opacity: isEntering ? 0 : 1,
          transform: isEntering ? 'translateY(8px)' : 'none',
          transitionDuration: '420ms',
        }}
      >
        {/* Top Brand Lockup (Clean, focused product identity without developer console links or status pills) */}
        <header className="rise flex items-center justify-between" style={{ animationDelay: '60ms' }}>
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] text-white shadow-inner backdrop-blur-md">
              <BrainLogo size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold tracking-tight text-white">
                The Brain
              </span>
              <span className="mono text-[10px] tracking-[0.2em] text-white/45 uppercase">
                Central Memory System
              </span>
            </div>
          </div>
        </header>

        {/* Main Hero & Workspace Selection Column */}
        <div className="my-auto py-8 lg:py-6">
          <div className="w-full max-w-[440px]">
            {/* Main Tagline */}
            <h1
              className="rise text-[38px] sm:text-[46px] font-bold leading-[1.08] tracking-tight text-white"
              style={{ animationDelay: '130ms' }}
            >
              <span className="block">One memory.</span>
              <span className="block bg-gradient-to-r from-[#D85A30] via-[#9B72CF] to-[#378ADD] bg-clip-text text-transparent">
                Every AI you use.
              </span>
            </h1>

            {/* Supporting Description */}
            <p
              className="rise mt-4 text-[14px] leading-relaxed text-white/60"
              style={{ animationDelay: '200ms' }}
            >
              A local memory that follows you across Claude, ChatGPT, Gemini, Cursor, GitHub and your local models. Stop re-explaining context and burning tokens.
            </p>

            {/* Workspace Brain Selection & Launch Card */}
            <form
              onSubmit={handleLaunch}
              className="rise mt-7 rounded-2xl border border-white/12 bg-[#080a14]/88 p-5 shadow-2xl backdrop-blur-xl"
              style={{ animationDelay: '270ms' }}
            >
              {/* Choose Workspace Brain Header */}
              <div className="flex items-center justify-between mb-3">
                <span className="mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-white/50">
                  Choose Workspace Brain
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreatingBrain((prev) => !prev)}
                  className="mono text-[11px] font-medium text-white/65 transition hover:text-white"
                >
                  {isCreatingBrain ? 'Cancel' : '+ New brain'}
                </button>
              </div>

              {/* Inline New Brain Creation */}
              {isCreatingBrain && (
                <div className="mb-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="New brain name (e.g. research)..."
                    value={newBrainInput}
                    onChange={(e) => setNewBrainInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateNewBrain();
                      }
                    }}
                    className="mono flex-1 rounded-xl border border-white/20 bg-black/60 px-3 py-2 text-xs text-white outline-none placeholder:text-white/35 focus:border-white/45"
                  />
                  <button
                    type="button"
                    onClick={handleCreateNewBrain}
                    className="mono rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-black transition hover:bg-white/90"
                  >
                    Add
                  </button>
                </div>
              )}

              {/* Workspace Brain Cards Grid */}
              <div
                role="radiogroup"
                aria-label="Choose Workspace Brain"
                className="grid grid-cols-3 gap-2.5 max-h-52 overflow-y-auto pr-0.5 scrollbar-thin"
              >
                {brains.map((b) => {
                  const isSelected = selectedBrain === b;
                  const count = brainCounts[b] || 0;
                  return (
                    <div
                      key={b}
                      onClick={() => setSelectedBrain(b)}
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={`${formatBrainTitle(b)} (${count} ${count === 1 ? 'memory' : 'memories'})`}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedBrain(b);
                        }
                      }}
                      className={`group relative flex cursor-pointer flex-col justify-between rounded-xl border p-3 text-left transition-all ${
                        isSelected
                          ? 'border-white/45 bg-white/[0.09] text-white shadow-lg shadow-black/40'
                          : 'border-white/10 bg-white/[0.02] text-white/65 hover:border-white/25 hover:bg-white/[0.05] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`transition-colors ${
                            isSelected ? 'text-white' : 'text-white/50 group-hover:text-white/75'
                          }`}
                        >
                          {getBrainIcon(b)}
                        </span>

                        <div className="flex items-center gap-1">
                          {brains.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setBrainToDelete(b);
                              }}
                              className="opacity-0 group-hover:opacity-100 text-white/35 hover:text-rose-400 transition-opacity text-[11px] px-0.5"
                              title={`Delete brain "${b}"`}
                              aria-label={`Delete brain ${b}`}
                            >
                              ×
                            </button>
                          )}
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${
                              isSelected
                                ? 'border-white bg-white text-black'
                                : 'border-white/20 bg-transparent'
                            }`}
                          >
                            {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="text-[13px] font-semibold capitalize tracking-tight text-white truncate">
                          {b}
                        </div>
                        <div className="mono mt-0.5 text-[10.5px] tabular-nums text-white/45">
                          {count} {count === 1 ? 'memory' : 'memories'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Optional Workspace Identity */}
              <div className="mt-4">
                <label
                  htmlFor="workspace-identity-input"
                  className="mono block text-[10.5px] uppercase tracking-[0.14em] text-white/45 mb-1.5"
                >
                  Workspace Identity <span className="text-white/30 lowercase tracking-normal">— optional</span>
                </label>
                <div className="relative flex items-center">
                  <IdCard className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-white/35" />
                  <input
                    id="workspace-identity-input"
                    type="text"
                    placeholder="e.g. My Projects, Alex's Lab"
                    value={userLabel}
                    onChange={(e) => setUserLabel(e.target.value)}
                    className="w-full rounded-xl border border-white/12 bg-black/50 pl-9 pr-3.5 py-2.5 text-xs text-white outline-none transition placeholder:text-white/30 focus:border-white/35 focus:bg-black/70"
                  />
                </div>
              </div>

              {/* Primary Launch Action */}
              <button
                type="submit"
                disabled={isEntering}
                onMouseEnter={() => setIsHoveredLaunch(true)}
                onMouseLeave={() => setIsHoveredLaunch(false)}
                className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[13px] font-semibold text-black shadow-xl shadow-white/5 transition-all hover:bg-white/92 active:scale-[0.99] disabled:opacity-50"
              >
                <span>
                  {isEntering
                    ? 'Opening The Brain…'
                    : `Launch ${formatBrainTitle(selectedBrain)} brain`}
                </span>
                <span aria-hidden="true" className="text-black/70">
                  →
                </span>
              </button>

              {/* Unified Multi-Source Footer inside Card */}
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3.5 text-[11px]">
                <span className="text-white/45">Multi-source unified</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    {sourceKeys.map((srcKey) => (
                      <span
                        key={srcKey}
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: SOURCE_PALETTE[srcKey].color }}
                        title={SOURCE_PALETTE[srcKey].name}
                      />
                    ))}
                  </div>
                  <span className="mono text-[10.5px] tabular-nums text-white/50">
                    {sourceKeys.length} sources
                  </span>
                </div>
              </div>
            </form>

            {/* Core Capability Highlights */}
            <div
              className="rise mt-5 grid grid-cols-2 gap-x-6 gap-y-2.5 px-1 text-[11.5px] text-white/50"
              style={{ animationDelay: '340ms' }}
            >
              <div className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5 text-white/35 shrink-0" />
                <span>Local SQLite storage</span>
              </div>
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-white/35 shrink-0" />
                <span>Full-text recall</span>
              </div>
              <div className="flex items-center gap-2">
                <MousePointerClick className="h-3.5 w-3.5 text-white/35 shrink-0" />
                <span>Click-to-correct</span>
              </div>
              <div className="flex items-center gap-2">
                <Plug className="h-3.5 w-3.5 text-white/35 shrink-0" />
                <span>MCP integration ready</span>
              </div>
            </div>
          </div>
        </div>

        {/* Subtle bottom spacer for balanced vertical rhythm */}
        <div className="h-2" />
      </div>

      {brainToDelete && (
        <DeleteBrainModal
          isOpen={Boolean(brainToDelete)}
          onClose={() => setBrainToDelete(null)}
          brainToDelete={brainToDelete}
          onBrainDeleted={(deleted) => {
            const updated = brainStore.getBrains().filter((b) => b !== deleted);
            const next = updated.length > 0 ? updated[0] : 'coding';
            setSelectedBrain(next);
            setBrainToDelete(null);
          }}
        />
      )}
    </main>
  );
};

// Backward-compatible alias
export const ApexLogin = WelcomeView;
