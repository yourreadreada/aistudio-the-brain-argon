import React, { useState } from 'react';
import { brainStore } from '../services/brainStorage';
import { BrainLogo } from './BrainLogo';

interface BrainManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBrain: string;
  brains: string[];
  onSelectBrain: (brain: string) => void;
  onCreateBrain: (name: string) => void;
  onRequestDeleteBrain: (brain: string) => void;
}

export const BrainManagerModal: React.FC<BrainManagerModalProps> = ({
  isOpen,
  onClose,
  currentBrain,
  brains,
  onSelectBrain,
  onCreateBrain,
  onRequestDeleteBrain,
}) => {
  const [newBrainName, setNewBrainName] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newBrainName.trim().toLowerCase();
    if (!trimmed) {
      setError('Please enter a valid brain name');
      return;
    }
    if (brains.includes(trimmed)) {
      setError(`Brain "${trimmed}" already exists`);
      return;
    }
    onCreateBrain(trimmed);
    setNewBrainName('');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity"
      />

      {/* Modal Dialog */}
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl border border-white/20 bg-[#070914]/95 shadow-2xl backdrop-blur-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <BrainLogo size={18} className="text-white" />
            <div>
              <h3 className="mono text-xs font-semibold tracking-wider text-white uppercase">
                Manage Brains
              </h3>
              <p className="mono text-[11px] text-white/50">
                Create, switch between, and delete memory brain workspaces
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 transition hover:text-white mono text-xs p-1"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-thin">
          {/* Create New Brain Box */}
          <form onSubmit={handleCreate} className="space-y-2">
            <label className="mono block text-[11px] uppercase tracking-wider text-white/60">
              Create New Brain
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. mobile-app, deep-learning, thesis..."
                value={newBrainName}
                onChange={(e) => {
                  setNewBrainName(e.target.value);
                  if (error) setError(null);
                }}
                className="mono flex-1 rounded-xl border border-white/20 bg-black/50 px-3.5 py-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/50"
              />
              <button
                type="submit"
                className="mono rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-white/90 transition shadow"
              >
                + Create
              </button>
            </div>
            {error && (
              <p className="mono text-[11px] text-rose-400">{error}</p>
            )}
          </form>

          {/* List of Existing Brains */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <label className="mono text-[11px] uppercase tracking-wider text-white/60">
                Existing Brains ({brains.length})
              </label>
              <span className="mono text-[10.5px] text-white/40">
                Click trash to permanently delete
              </span>
            </div>

            <div className="space-y-2">
              {brains.map((b) => {
                const isCurrent = b === currentBrain;
                const factsCount = brainStore.recall(b, '').length;

                return (
                  <div
                    key={b}
                    className={`flex items-center justify-between rounded-xl border p-3 transition ${
                      isCurrent
                        ? 'border-indigo-500/50 bg-indigo-500/10'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="mono text-xs font-semibold text-white">
                            {b}
                          </span>
                          {isCurrent && (
                            <span className="mono rounded bg-indigo-500/20 border border-indigo-500/40 px-1.5 py-0.2 text-[9.5px] text-indigo-300 font-medium">
                              Active
                            </span>
                          )}
                        </div>
                        <span className="mono text-[11px] text-white/50">
                          {factsCount} stored fact{factsCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isCurrent ? (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectBrain(b);
                            onClose();
                          }}
                          className="mono rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/15 hover:text-white transition"
                        >
                          Switch
                        </button>
                      ) : (
                        <span className="mono text-[11px] text-indigo-300/80 px-2 py-1">
                          Current
                        </span>
                      )}

                      {/* Delete Brain Button */}
                      <button
                        type="button"
                        onClick={() => {
                          onRequestDeleteBrain(b);
                        }}
                        className="mono flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 hover:border-rose-500/50 transition"
                        title={`Permanently delete brain "${b}" and its ${factsCount} facts`}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 bg-black/40 px-6 py-3">
          <p className="mono text-[11px] text-white/40">
            Deleting a brain removes all of its facts from SQLite & memory.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mono rounded-xl border border-white/15 px-4 py-1.5 text-xs text-white/70 hover:text-white hover:border-white/30 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
