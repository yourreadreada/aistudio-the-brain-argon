import React from 'react';
import { ApexLogo } from './ApexLogo';

interface BrainHeaderProps {
  onSearchChange: (q: string) => void;
  searchQuery: string;
  activeCategory: string | null;
  onSelectCategory: (cat: string | null) => void;
  onSwitchToLogin: () => void;
  onOpenIntegrations: () => void;
}

const CATEGORIES = [
  { id: null, label: 'All Synapses' },
  { id: 'person', label: 'People' },
  { id: 'company', label: 'Companies' },
  { id: 'deal', label: 'Deals' },
  { id: 'meeting', label: 'Meetings' },
  { id: 'commitment', label: 'Commitments' },
];

export const BrainHeader: React.FC<BrainHeaderProps> = ({
  onSearchChange,
  searchQuery,
  activeCategory,
  onSelectCategory,
  onSwitchToLogin,
  onOpenIntegrations,
}) => {
  return (
    <header className="relative z-20 flex h-14 w-full items-center justify-between border-b border-white/10 bg-[#03040a]/90 px-4 backdrop-blur-xl md:px-6">
      {/* Zone 1: Wordmark */}
      <div className="flex items-center gap-3">
        <button
          onClick={onSwitchToLogin}
          className="flex items-center gap-2.5 text-white transition hover:opacity-80"
          title="Apex Operating System"
        >
          <ApexLogo size={16} className="text-white" />
          <span className="mono text-[13px] font-semibold tracking-wider text-white">
            APEX
          </span>
        </button>
        <div className="hidden h-3.5 w-px bg-white/20 sm:block" />
        <span className="mono hidden text-[11px] uppercase tracking-widest text-white/50 sm:inline-block">
          The Brain
        </span>
      </div>

      {/* Zone 2: Search & Category Filters */}
      <div className="flex max-w-xl flex-1 items-center justify-center gap-2 px-4">
        {/* Search Input */}
        <div className="relative w-full max-w-xs">
          <input
            type="text"
            placeholder="Search business memory..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-black/40 py-1.5 pl-8 pr-3 text-xs text-white placeholder-white/40 outline-none transition focus:border-white/40 focus:bg-black/60"
          />
          <svg
            className="pointer-events-none absolute left-2.5 top-2.5 text-white/40"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="mono absolute right-2.5 top-2 text-[10px] text-white/40 hover:text-white"
            >
              ×
            </button>
          )}
        </div>

        {/* Category Filter Tabs */}
        <div className="hidden items-center gap-1 xl:flex">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.label}
                onClick={() => onSelectCategory(cat.id)}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-xs transition ${
                  isActive
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-white/50 hover:bg-white/5 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Zone 3: Primary Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenIntegrations}
          className="mono hidden items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/80 transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white md:flex"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Integrations (6)</span>
        </button>

        <button
          onClick={onSwitchToLogin}
          className="mono rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white transition hover:bg-white/20"
        >
          Back to Login
        </button>
      </div>
    </header>
  );
};
