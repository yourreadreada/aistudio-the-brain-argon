import React from 'react';
import { INTEGRATION_TOOLS } from '../data/brainData';
import { ApexLogo } from './ApexLogo';

interface IntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IntegrationsModal: React.FC<IntegrationsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-md transition-opacity"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#090b14] p-6 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <ApexLogo size={16} className="text-white" />
            <div>
              <h3 className="text-base font-medium text-white">Connected Tools</h3>
              <p className="mono text-[11px] text-white/50">
                Apex synthesizes memory automatically without manual tagging
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {INTEGRATION_TOOLS.map((tool) => (
            <div
              key={tool.id}
              className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3.5 transition hover:border-white/15 hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-xs font-semibold text-white">
                  {tool.name[0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{tool.name}</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </div>
                  <div className="mono mt-0.5 text-xs text-white/50">
                    {tool.count} · {tool.status}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="mono rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                  Active
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
          <span className="mono text-xs text-white/40">
            Encrypted Zero-Knowledge Memory Store
          </span>
          <button
            onClick={onClose}
            className="mono rounded-xl bg-white/90 px-4 py-2 text-xs font-medium text-black transition hover:bg-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
