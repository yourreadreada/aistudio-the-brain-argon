import React, { useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Network,
  Table2,
  Sparkles,
  History,
  Plus,
  FolderGit2,
  GraduationCap,
  User,
  BrainCircuit,
  Trash2,
  Settings2,
  FileCode2,
  FileText,
  FileSpreadsheet,
  Presentation,
  MessageSquare,
  Layers,
  Download,
  LogOut,
  Check,
  X,
} from 'lucide-react';
import {
  AISource,
  FactFileType,
  SOURCE_PALETTE,
  FILE_TYPE_CONFIG,
} from '../types/brain';
import { BrainLogo } from './BrainLogo';
import { GuidedService } from './GuidedConnectionModal';

export type WorkspaceViewMode = 'graph' | 'list' | 'simulator';

interface BrainSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  currentBrain: string;
  brains: string[];
  brainCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  fileTypeCounts: Record<string, number>;
  totalFactsInBrain: number;
  onSelectBrain: (brain: string) => void;
  onCreateBrain: (name: string) => void;
  onDeleteBrain: (brain: string) => void;
  onOpenManageBrains: () => void;
  viewMode: WorkspaceViewMode;
  onSelectViewMode: (mode: WorkspaceViewMode) => void;
  activeSourceFilter: AISource | null;
  onSelectSourceFilter: (src: AISource | null) => void;
  activeFileTypeFilter: FactFileType | null;
  onSelectFileTypeFilter: (ft: FactFileType | null) => void;
  isRecentActivityOpen: boolean;
  onToggleRecentActivity: () => void;
  recentActivityCount: number;
  onOpenAddFact: () => void;
  onOpenIngest: () => void;
  onOpenGuidedConfig: (service?: GuidedService) => void;
  onExportSnapshot: () => void;
  onSwitchToWelcome: () => void;
}

export const BrainSidebar: React.FC<BrainSidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  currentBrain,
  brains,
  brainCounts,
  sourceCounts,
  fileTypeCounts,
  totalFactsInBrain,
  onSelectBrain,
  onCreateBrain,
  onDeleteBrain,
  onOpenManageBrains,
  viewMode,
  onSelectViewMode,
  activeSourceFilter,
  onSelectSourceFilter,
  activeFileTypeFilter,
  onSelectFileTypeFilter,
  isRecentActivityOpen,
  onToggleRecentActivity,
  recentActivityCount,
  onOpenAddFact,
  onOpenIngest,
  onOpenGuidedConfig,
  onExportSnapshot,
  onSwitchToWelcome,
}) => {
  const [isCreatingBrain, setIsCreatingBrain] = useState(false);
  const [newBrainName, setNewBrainName] = useState('');

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newBrainName.trim().toLowerCase();
    if (!cleaned) return;
    onCreateBrain(cleaned);
    setNewBrainName('');
    setIsCreatingBrain(false);
  };

  const getBrainIcon = (brainName: string) => {
    const lower = brainName.toLowerCase();
    if (lower === 'coding' || lower.includes('dev') || lower.includes('code')) {
      return <FolderGit2 className="h-4 w-4 shrink-0" />;
    }
    if (lower === 'college' || lower.includes('uni') || lower.includes('study')) {
      return <GraduationCap className="h-4 w-4 shrink-0" />;
    }
    if (lower === 'personal' || lower.includes('life')) {
      return <User className="h-4 w-4 shrink-0" />;
    }
    return <BrainCircuit className="h-4 w-4 shrink-0" />;
  };

  const getFileTypeIcon = (ft: FactFileType) => {
    switch (ft) {
      case 'code':
        return <FileCode2 className="h-3.5 w-3.5 shrink-0" />;
      case 'xlsx':
        return <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />;
      case 'pptx':
        return <Presentation className="h-3.5 w-3.5 shrink-0" />;
      case 'chat':
        return <MessageSquare className="h-3.5 w-3.5 shrink-0" />;
      default:
        return <FileText className="h-3.5 w-3.5 shrink-0" />;
    }
  };

  const activeFileTypes = (Object.keys(FILE_TYPE_CONFIG) as FactFileType[]).filter(
    (ft) => (fileTypeCounts[ft] || 0) > 0 || activeFileTypeFilter === ft
  );

  return (
    <aside
      aria-label="Workspace navigation"
      className={`relative z-30 flex h-full shrink-0 flex-col border-r border-white/10 bg-[#060811] select-none transition-[width] duration-200 ease-out ${
        isCollapsed ? 'w-16' : 'w-[264px]'
      }`}
    >
      {/* Top Brand Header + Collapse Toggle */}
      <div
        className={`flex h-14 shrink-0 items-center border-b border-white/10 ${
          isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-white">
              <BrainLogo size={16} />
            </div>
            <span className="font-sans text-sm font-semibold tracking-tight text-white whitespace-nowrap truncate">
              The Brain
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          title={isCollapsed ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Scrollable Navigation Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2.5 space-y-5 scrollbar-thin">
        {/* Quick Primary Action in Collapsed Mode */}
        {isCollapsed && (
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenAddFact}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-black transition hover:bg-white/90"
              title="Store Fact"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* SECTION 1: Workspace Views */}
        <div>
          {!isCollapsed && (
            <div className="px-2 pb-1.5 text-[11px] font-medium text-white/45">
              Workspace View
            </div>
          )}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => onSelectViewMode('graph')}
              title="Neural Graph View"
              className={`flex w-full items-center rounded-lg text-xs font-medium transition-colors ${
                isCollapsed ? 'justify-center py-2.5' : 'justify-between px-2.5 py-2'
              } ${
                viewMode === 'graph'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 whitespace-nowrap">
                <Network className="h-4 w-4 shrink-0 text-[#9db4ff]" />
                {!isCollapsed && <span>Neural Graph</span>}
              </span>
              {!isCollapsed && (
                <span className="mono text-[11px] tabular-nums text-white/40">
                  {totalFactsInBrain}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onSelectViewMode('list')}
              title="Memory Ledger Table"
              className={`flex w-full items-center rounded-lg text-xs font-medium transition-colors ${
                isCollapsed ? 'justify-center py-2.5' : 'justify-between px-2.5 py-2'
              } ${
                viewMode === 'list'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 whitespace-nowrap">
                <Table2 className="h-4 w-4 shrink-0 text-emerald-400" />
                {!isCollapsed && <span>Memory Table</span>}
              </span>
              {!isCollapsed && (
                <span className="mono text-[11px] tabular-nums text-white/40">
                  {totalFactsInBrain}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onSelectViewMode('simulator')}
              title="Live AI Memory Sync & Simulator"
              className={`flex w-full items-center rounded-lg text-xs font-medium transition-colors ${
                isCollapsed ? 'justify-center py-2.5' : 'justify-between px-2.5 py-2'
              } ${
                viewMode === 'simulator'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 whitespace-nowrap">
                <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
                {!isCollapsed && <span>AI Sync Studio</span>}
              </span>
              {!isCollapsed && (
                <span className="mono text-[10px] text-white/40">2-Way</span>
              )}
            </button>

            <button
              type="button"
              onClick={onToggleRecentActivity}
              title="Recent Activity Feed"
              className={`flex w-full items-center rounded-lg text-xs font-medium transition-colors ${
                isCollapsed ? 'justify-center py-2.5' : 'justify-between px-2.5 py-2'
              } ${
                isRecentActivityOpen
                  ? 'bg-white/[0.1] text-white'
                  : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 whitespace-nowrap">
                <History className="h-4 w-4 shrink-0 text-sky-400" />
                {!isCollapsed && <span>Activity Log</span>}
              </span>
              {!isCollapsed && recentActivityCount > 0 && (
                <span className="mono text-[11px] tabular-nums text-white/40">
                  {recentActivityCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* SECTION 2: Brains (Workspaces) */}
        <div className="border-t border-white/10 pt-4">
          {!isCollapsed ? (
            <div className="flex items-center justify-between px-2 pb-1.5">
              <span className="text-[11px] font-medium text-white/45">
                Memory Brains
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsCreatingBrain((v) => !v)}
                  className="flex h-5 w-5 items-center justify-center rounded text-white/45 transition hover:bg-white/10 hover:text-white"
                  title="Create New Brain"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onOpenManageBrains}
                  className="flex h-5 w-5 items-center justify-center rounded text-white/45 transition hover:bg-white/10 hover:text-white"
                  title="Manage All Brains"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center pb-1.5">
              <button
                type="button"
                onClick={onOpenManageBrains}
                className="flex h-7 w-7 items-center justify-center rounded-md text-white/45 hover:bg-white/10 hover:text-white"
                title="Manage Brains"
              >
                <BrainCircuit className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Inline New Brain Input */}
          {!isCollapsed && isCreatingBrain && (
            <form onSubmit={handleCreateSubmit} className="mb-2 flex items-center gap-1 px-1">
              <input
                type="text"
                autoFocus
                placeholder="new brain name..."
                value={newBrainName}
                onChange={(e) => setNewBrainName(e.target.value)}
                className="mono min-w-0 flex-1 rounded-md border border-white/20 bg-black/50 px-2.5 py-1 text-xs text-white placeholder:text-white/30 outline-none focus:border-white/45"
              />
              <button
                type="submit"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-black hover:bg-white/90"
                title="Add Brain"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingBrain(false)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/45 hover:text-white"
                title="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </form>
          )}

          <div className="space-y-0.5">
            {brains.map((b) => {
              const isSelected = currentBrain === b;
              const count = brainCounts[b] || 0;
              return (
                <div
                  key={b}
                  className={`group flex items-center rounded-lg transition-colors ${
                    isCollapsed ? 'justify-center py-2' : 'justify-between px-2.5 py-1.5'
                  } ${
                    isSelected
                      ? 'bg-white/[0.11] text-white font-medium'
                      : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectBrain(b)}
                    title={`Brain: ${b} (${count} facts)`}
                    className={`flex min-w-0 flex-1 items-center gap-2.5 text-left text-xs ${
                      isCollapsed ? 'justify-center' : ''
                    }`}
                  >
                    <span className={isSelected ? 'text-white' : 'text-white/50'}>
                      {getBrainIcon(b)}
                    </span>
                    {!isCollapsed && (
                      <span className="truncate capitalize whitespace-nowrap">{b}</span>
                    )}
                  </button>

                  {!isCollapsed && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="mono text-[11px] tabular-nums text-white/40">
                        {count}
                      </span>
                      {brains.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteBrain(b);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-white/35 hover:text-rose-400 transition-opacity p-0.5"
                          title={`Delete brain "${b}"`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 3: AI Source Filter */}
        <div className="border-t border-white/10 pt-4">
          {!isCollapsed && (
            <div className="flex items-center justify-between px-2 pb-1.5">
              <span className="text-[11px] font-medium text-white/45">
                AI Sources
              </span>
              {activeSourceFilter && (
                <button
                  type="button"
                  onClick={() => onSelectSourceFilter(null)}
                  className="text-[11px] text-white/50 hover:text-white transition"
                >
                  Reset
                </button>
              )}
            </div>
          )}

          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => onSelectSourceFilter(null)}
              title="All AI Sources"
              className={`flex w-full items-center rounded-lg text-xs transition-colors ${
                isCollapsed ? 'justify-center py-2' : 'justify-between px-2.5 py-1.5'
              } ${
                activeSourceFilter === null
                  ? 'bg-white/[0.09] text-white font-medium'
                  : 'text-white/55 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 whitespace-nowrap">
                <Layers className="h-3.5 w-3.5 shrink-0 text-white/60" />
                {!isCollapsed && <span>All Sources</span>}
              </span>
              {!isCollapsed && (
                <span className="mono text-[11px] tabular-nums text-white/40">
                  {totalFactsInBrain}
                </span>
              )}
            </button>

            {(Object.keys(SOURCE_PALETTE) as AISource[]).map((src) => {
              const meta = SOURCE_PALETTE[src];
              const isSelected = activeSourceFilter === src;
              const count = sourceCounts[src] || 0;

              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => onSelectSourceFilter(isSelected ? null : src)}
                  title={`${meta.name} (${count} facts)`}
                  className={`flex w-full items-center rounded-lg text-xs transition-colors ${
                    isCollapsed ? 'justify-center py-2' : 'justify-between px-2.5 py-1.5'
                  } ${
                    isSelected
                      ? 'bg-white/[0.11] text-white font-medium'
                      : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: meta.color }}
                    />
                    {!isCollapsed && (
                      <span className="truncate whitespace-nowrap">{meta.name}</span>
                    )}
                  </span>
                  {!isCollapsed && (
                    <span className="mono text-[11px] tabular-nums text-white/40">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* SECTION 4: Document Format Filter (Expanded Mode) */}
        {!isCollapsed && activeFileTypes.length > 0 && (
          <div className="border-t border-white/10 pt-4">
            <div className="flex items-center justify-between px-2 pb-1.5">
              <span className="text-[11px] font-medium text-white/45">
                Content Formats
              </span>
              {activeFileTypeFilter && (
                <button
                  type="button"
                  onClick={() => onSelectFileTypeFilter(null)}
                  className="text-[11px] text-white/50 hover:text-white transition"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="space-y-0.5">
              {activeFileTypes.map((ft) => {
                const meta = FILE_TYPE_CONFIG[ft];
                const isSelected = activeFileTypeFilter === ft;
                const count = fileTypeCounts[ft] || 0;

                return (
                  <button
                    key={ft}
                    type="button"
                    onClick={() => onSelectFileTypeFilter(isSelected ? null : ft)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                      isSelected
                        ? 'bg-white/[0.11] text-white font-medium'
                        : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span style={{ color: meta.color }}>{getFileTypeIcon(ft)}</span>
                      <span className="truncate whitespace-nowrap">{meta.label}</span>
                    </span>
                    <span className="mono text-[11px] tabular-nums text-white/40">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar Bottom Utility Footer */}
      <div className="shrink-0 border-t border-white/10 p-2.5 space-y-1 bg-[#05070f]">
        {!isCollapsed ? (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={onOpenIngest}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-white/75 transition hover:border-white/25 hover:bg-white/[0.07] hover:text-white whitespace-nowrap"
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span>Ingest Files</span>
              </button>
              <button
                type="button"
                onClick={onExportSnapshot}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-white/75 transition hover:border-white/25 hover:bg-white/[0.07] hover:text-white whitespace-nowrap"
                title="Copy Markdown context snapshot to clipboard"
              >
                <Download className="h-3.5 w-3.5 shrink-0" />
                <span>Export MD</span>
              </button>
            </div>
            <div className="flex items-center justify-between pt-1 px-1">
              <button
                type="button"
                onClick={() => onOpenGuidedConfig('chatgpt')}
                className="text-[11px] text-white/50 hover:text-white transition whitespace-nowrap"
              >
                Connect Web AI & MCP
              </button>
              <button
                type="button"
                onClick={onSwitchToWelcome}
                className="flex items-center gap-1 text-[11px] text-white/45 hover:text-white transition whitespace-nowrap"
                title="Switch to Welcome Portal"
              >
                <span>Portal</span>
                <LogOut className="h-3 w-3" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={onExportSnapshot}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.06] hover:text-white"
              title="Export Context Snapshot"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onSwitchToWelcome}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.06] hover:text-white"
              title="Welcome Portal"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
