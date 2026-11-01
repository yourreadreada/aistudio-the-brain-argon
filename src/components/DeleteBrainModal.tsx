import React, { useState } from 'react';
import { brainStore } from '../services/brainStorage';
import { BrainLogo } from './BrainLogo';

interface DeleteBrainModalProps {
  isOpen: boolean;
  onClose: () => void;
  brainToDelete: string;
  onBrainDeleted: (deletedBrain: string) => void;
}

export const DeleteBrainModal: React.FC<DeleteBrainModalProps> = ({
  isOpen,
  onClose,
  brainToDelete,
  onBrainDeleted,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const factsInBrain = brainStore.recall(brainToDelete, '');
  const factCount = factsInBrain.length;

  const handleDelete = () => {
    setIsDeleting(true);
    setTimeout(() => {
      brainStore.deleteBrain(brainToDelete);
      setIsDeleting(false);
      onBrainDeleted(brainToDelete);
      onClose();
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md rounded-2xl border border-rose-500/30 bg-[#090508]/95 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-rose-400">
            <BrainLogo size={18} className="text-rose-400" />
            <span className="mono text-xs font-semibold tracking-wider uppercase text-rose-400">
              Delete Brain
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 transition hover:text-white mono text-xs"
          >
            ✕
          </button>
        </div>

        <h3 className="mt-4 text-base font-semibold text-white">
          Delete brain "{brainToDelete}"?
        </h3>

        <p className="mt-2 text-xs text-white/70 leading-relaxed">
          This will permanently delete the brain <strong className="text-white">"{brainToDelete}"</strong> and all <strong className="text-rose-300">{factCount} stored facts</strong> inside it.
        </p>

        <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 mono text-[11px] text-rose-300 leading-relaxed">
          ⚠️ This action cannot be undone. Any unified nodes, chat histories, or tagged context in this brain will be wiped from your local SQLite database.
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="mono rounded-xl border border-white/15 px-4 py-2 text-xs text-white/70 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleDelete}
            className="mono rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition shadow-lg shadow-rose-600/20 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Yes, Delete Brain'}
          </button>
        </div>
      </div>
    </div>
  );
};
