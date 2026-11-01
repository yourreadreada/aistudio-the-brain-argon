import React, { useState, useEffect } from 'react';
import { Constellation, ConstellationMood } from './Constellation';
import { BrainLogo } from './BrainLogo';
import { brainStore } from '../services/brainStorage';
import { DeleteBrainModal } from './DeleteBrainModal';

interface WelcomeViewProps {
  onEnterBrain: (selectedBrain?: string, userLabel?: string) => void;
  isEnteringExternal?: boolean;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({ onEnterBrain, isEnteringExternal = false }) => {
  const [brains, setBrains] = useState<string[]>(brainStore.getBrains());
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
    const unsubscribe = brainStore.subscribe(() => {
      const updated = brainStore.getBrains();
      setBrains(updated);
      if (!updated.includes(selectedBrain) && updated.length > 0) {
        setSelectedBrain(updated[0]);
      }
    });
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
    // Notify parent to start warp sequence
    onEnterBrain(selectedBrain, userLabel || 'Local Developer');
  };

  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#03040a]">
      {/* Colourful Multi-Source Interactive Constellation Canvas */}
      <Constellation mood={mood} />

      {/* Grid line ambient overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity ease-out [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(circle_at_center,black,transparent_80%)]"
        style={{
          opacity: isEntering ? 0 : 0.18,
          transitionDuration: '420ms',
        }}
      />

      {/* Radial shadow backdrop behind form */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[500px] -translate-x-1/2 -translate-y-1/2 transition-opacity ease-out lg:left-[28%] lg:h-[480px] lg:w-[540px]"
        style={{
          background:
            'radial-gradient(closest-side, rgba(5,5,8,0.92) 0%, rgba(5,5,8,0.72) 58%, rgba(3,4,10,0) 100%)',
          opacity: isEntering ? 0 : 1,
          transitionDuration: '300ms',
        }}
      />

      {/* Welcome Card Container */}
      <div className="relative flex min-h-[100svh] items-center justify-center px-6 lg:justify-start lg:px-[10%]">
        <div
          className="w-full max-w-[380px] transition-[opacity,transform] ease-out"
          style={{
            opacity: isEntering ? 0 : 1,
            transform: isEntering ? 'translateY(8px)' : 'none',
            transitionDuration: '420ms',
          }}
        >
          {/* Logo Mark */}
          <div
            className="rise mb-6 flex items-center gap-3 text-ink-soft"
            style={{ animationDelay: '100ms' }}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white backdrop-blur-md">
              <BrainLogo size={18} />
            </div>
            <div className="flex flex-col">
              <span className="mono text-[14px] font-semibold tracking-wider text-white">
                THE BRAIN
              </span>
              <span className="mono text-[10px] text-ink-ghost tracking-widest uppercase">
                Central Memory System
              </span>
            </div>
          </div>

          {/* Heading */}
          <h1
            className="rise text-[26px] font-medium leading-tight text-white tracking-tight"
            style={{ animationDelay: '180ms' }}
          >
            Welcome to The Brain
          </h1>

          {/* Value Prop Subtitle */}
          <p
            className="rise mt-2.5 text-xs text-ink-faint leading-relaxed"
            style={{ animationDelay: '260ms' }}
          >
            One local memory that follows you across Claude, ChatGPT, Gemini, Cursor, GitHub, and local tools. Stop re-explaining context and burning tokens.
          </p>

          {/* Starter Config */}
          <form
            onSubmit={handleLaunch}
            className="rise mt-6 flex flex-col gap-4"
            style={{ animationDelay: '340ms' }}
          >
            {/* Quick Brain Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="mono text-[11px] uppercase tracking-wider text-ink-ghost">
                  Choose Workspace Brain
                </label>
                <button
                  type="button"
                  onClick={() => setIsCreatingBrain(!isCreatingBrain)}
                  className="mono text-[10.5px] text-indigo-400 hover:text-indigo-300 transition"
                >
                  {isCreatingBrain ? 'Cancel' : '+ New Brain'}
                </button>
              </div>

              {isCreatingBrain && (
                <div className="flex gap-1.5 mb-2.5">
                  <input
                    type="text"
                    placeholder="New brain name..."
                    value={newBrainInput}
                    onChange={(e) => setNewBrainInput(e.target.value)}
                    className="mono flex-1 rounded-xl border border-white/25 bg-black/60 px-3 py-1.5 text-xs text-white outline-none placeholder:text-white/30"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newBrainInput.trim()) {
                        const name = newBrainInput.trim().toLowerCase();
                        brainStore.createBrain(name);
                        setSelectedBrain(name);
                        setNewBrainInput('');
                        setIsCreatingBrain(false);
                      }
                    }}
                    className="mono rounded-xl bg-white/90 px-3 py-1.5 text-xs font-semibold text-black hover:bg-white"
                  >
                    Add
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto scrollbar-thin">
                {brains.map((b) => {
                  const isSelected = selectedBrain === b;
                  return (
                    <div
                      key={b}
                      className={`mono flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium capitalize transition ${
                        isSelected
                          ? 'border-white/50 bg-white/20 text-white shadow-lg shadow-white/5'
                          : 'border-white/15 bg-black/40 text-white/60 hover:border-white/30 hover:text-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedBrain(b)}
                        className="text-left"
                      >
                        {b}
                      </button>
                      {brains.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBrainToDelete(b);
                          }}
                          className="text-white/30 hover:text-rose-400 transition ml-1 text-[11px]"
                          title={`Delete brain "${b}"`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Optional Workspace Label */}
            <div>
              <label className="mono block text-[11px] uppercase tracking-wider text-ink-ghost mb-1.5">
                Workspace / Identity <span className="text-white/30">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. My Projects, Alex's Lab"
                value={userLabel}
                onChange={(e) => setUserLabel(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/40 px-3.5 py-2.5 text-xs text-white outline-none backdrop-blur-md transition placeholder:text-white/30 focus:border-white/45 focus:bg-black/60"
              />
            </div>

            {/* Direct Launch CTA */}
            <button
              type="submit"
              disabled={isEntering}
              onMouseEnter={() => setIsHoveredLaunch(true)}
              onMouseLeave={() => setIsHoveredLaunch(false)}
              className="mono mt-2 min-h-11 w-full rounded-xl bg-white px-4 py-3.5 text-xs font-semibold text-black transition-all hover:bg-white/90 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl shadow-white/10"
            >
              <span>{isEntering ? 'Opening The Brain…' : 'Launch The Brain'}</span>
              <span className="text-black/60">→</span>
            </button>
          </form>

          {/* Multi-AI Feature Highlights */}
          <div
            className="rise mt-7 border-t border-white/10 pt-4"
            style={{ animationDelay: '420ms' }}
          >
            <div className="flex items-center justify-between text-[11px]">
              <span className="mono text-white/40">Multi-source unified:</span>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#D85A30]" title="Claude" />
                <span className="h-2 w-2 rounded-full bg-[#378ADD]" title="ChatGPT" />
                <span className="h-2 w-2 rounded-full bg-[#1D9E75]" title="Gemini" />
                <span className="h-2 w-2 rounded-full bg-[#7F77DD]" title="GitHub" />
                <span className="h-2 w-2 rounded-full bg-[#D4537E]" title="Moodle" />
                <span className="h-2 w-2 rounded-full bg-[#3D9BB8]" title="Cursor" />
                <span className="h-2 w-2 rounded-full bg-[#B8923D]" title="Local AI" />
              </div>
            </div>
            <p className="mono mt-2 text-[10px] text-white/40 leading-relaxed">
              Local SQLite storage · Full-text search (recall) · Click-to-correct · MCP integration ready
            </p>
          </div>
        </div>
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
