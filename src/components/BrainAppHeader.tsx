import React from 'react';
import { Menu, Plus, Upload, Puzzle, Settings } from 'lucide-react';
import { AISource, Fact, FactFileType, SOURCE_PALETTE, FILE_TYPE_CONFIG } from '../types/brain';
import { GlobalSearchBar } from './GlobalSearchBar';
import { GuidedService } from './GuidedConnectionModal';
import { CaptureHubTab } from './CaptureHubModal';

interface BrainAppHeaderProps {
  currentBrain: string;
  brains: string[];
  onSelectBrain: (brain: string) => void;
  onCreateBrain: (name: string) => void;
  onDeleteBrain?: (brain: string) => void;
  onOpenManageBrains?: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectFactFromSearch: (fact: Fact, targetBrain?: string) => void;
  activeSourceFilter: AISource | null;
  onSelectSourceFilter: (src: AISource | null) => void;
  activeFileTypeFilter?: FactFileType | null;
  onSelectFileTypeFilter?: (ft: FactFileType | null) => void;
  onOpenAddFact: () => void;
  onOpenIngest: (initialTab?: CaptureHubTab) => void;
  onOpenMcp: () => void;
  onOpenSettings?: () => void;
  isSettingsActive?: boolean;
  onOpenGuidedConfig?: (service?: GuidedService) => void;
  connectionStatus?: { chatgpt: boolean; claude: boolean; gemini: boolean; backend: boolean };
  onSwitchToLogin: () => void;
  onToggleRecentActivity: () => void;
  recentActivityCount?: number;
  isRecentActivityOpen?: boolean;
  onToggleMobileSidebar?: () => void;
  totalFactsCount?: number;
}

export const BrainAppHeader: React.FC<BrainAppHeaderProps> = ({
  currentBrain,
  searchQuery,
  onSearchChange,
  onSelectFactFromSearch,
  activeSourceFilter,
  onSelectSourceFilter,
  activeFileTypeFilter,
  onSelectFileTypeFilter,
  onOpenAddFact,
  onOpenIngest,
  onOpenSettings,
  isSettingsActive = false,
  onToggleMobileSidebar,
  totalFactsCount = 0,
}) => {
  return (
    <header className="relative z-30 flex h-14 w-full shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#050710]/90 px-4 md:px-6 backdrop-blur-xl">
      {/* Zone 1: Mobile Sidebar Toggle & Contextual Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0 shrink-0">
        {onToggleMobileSidebar && (
          <button
            type="button"
            onClick={onToggleMobileSidebar}
            className="flex md:hidden h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-white/70 hover:text-white"
            aria-label="Toggle navigation menu"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}

        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs whitespace-nowrap">
          <span className="text-white/45 hidden sm:inline">Workspaces</span>
          <span className="text-white/25 hidden sm:inline" aria-hidden="true">›</span>
          <span className="font-semibold text-white capitalize">{currentBrain}</span>
          <span className="mono rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] tabular-nums text-white/60">
            {totalFactsCount} {totalFactsCount === 1 ? 'node' : 'nodes'}
          </span>

          {activeSourceFilter && (
            <>
              <span className="text-white/25" aria-hidden="true">›</span>
              <button
                type="button"
                onClick={() => onSelectSourceFilter(null)}
                className="flex items-center gap-1.5 text-white/85 hover:text-white transition"
                title="Click to clear source filter"
              >
                <span>{SOURCE_PALETTE[activeSourceFilter]?.name || activeSourceFilter}</span>
                <span className="text-white/40">×</span>
              </button>
            </>
          )}

          {activeFileTypeFilter && onSelectFileTypeFilter && (
            <>
              <span className="text-white/25" aria-hidden="true">›</span>
              <button
                type="button"
                onClick={() => onSelectFileTypeFilter(null)}
                className="flex items-center gap-1.5 text-white/85 hover:text-white transition"
                title="Click to clear format filter"
              >
                <span>{FILE_TYPE_CONFIG[activeFileTypeFilter]?.badge || activeFileTypeFilter}</span>
                <span className="text-white/40">×</span>
              </button>
            </>
          )}
        </nav>
      </div>

      {/* Zone 2: Global Search Bar */}
      <div className="flex flex-1 items-center justify-center max-w-lg">
        <GlobalSearchBar
          currentBrain={currentBrain}
          filterQuery={searchQuery}
          onFilterChange={onSearchChange}
          onSelectFact={onSelectFactFromSearch}
        />
      </div>

      {/* Zone 3: Primary Workspace Actions (Companion, Capture Hub, Store Fact, Settings) */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onOpenIngest('companion')}
          className="hidden lg:flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.02] px-2.5 py-1.5 text-xs font-medium text-white/75 transition hover:border-white/25 hover:bg-white/[0.06] hover:text-white whitespace-nowrap shrink-0"
          title="Browser Companion & Device Tokens"
        >
          <Puzzle className="h-3.5 w-3.5 text-[#9db4ff]" />
          <span>Companion</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenIngest('import')}
          className="hidden sm:flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/90 transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white whitespace-nowrap shrink-0"
        >
          <Upload className="h-3.5 w-3.5 text-emerald-400" />
          <span>Capture Hub</span>
        </button>

        <button
          type="button"
          onClick={onOpenAddFact}
          className="flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Store Fact</span>
        </button>

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            data-testid="header-settings-button"
            aria-label={isSettingsActive ? 'Return to Workspace from Settings' : 'Open Application Settings'}
            aria-pressed={isSettingsActive}
            title={isSettingsActive ? 'Close Settings (Return to Workspace)' : 'Settings'}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition shrink-0 focus:outline-none focus:ring-2 focus:ring-[#9db4ff]/50 ${
              isSettingsActive
                ? 'border-[#9db4ff]/60 bg-[#9db4ff]/20 text-white shadow-[0_0_12px_rgba(157,180,255,0.25)]'
                : 'border-white/12 bg-white/[0.03] text-white/70 hover:border-white/25 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>
    </header>
  );
};

