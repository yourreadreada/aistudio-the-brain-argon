import React, { useState, useEffect, useMemo } from 'react';
import {
  Send,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  Plus,
  Upload,
  ArrowUpDown,
} from 'lucide-react';
import {
  Fact,
  AISource,
  FactFileType,
  IngestStrategy,
  SOURCE_PALETTE,
  FILE_TYPE_CONFIG,
  RecentActivityItem,
  getFactFileType,
} from '../types/brain';
import { brainStore } from '../services/brainStorage';
import { BrainAppHeader } from './BrainAppHeader';
import { BrainSidebar, WorkspaceViewMode } from './BrainSidebar';
import { BrainViewerCanvas } from './BrainViewerCanvas';
import { FactPanel } from './FactPanel';
import { AddFactModal } from './AddFactModal';
import { IngestModal, CaptureHubTab } from './IngestModal';
import { McpBridgeModal } from './McpBridgeModal';
import { GuidedConnectionModal, GuidedService } from './GuidedConnectionModal';
import { DeleteBrainModal } from './DeleteBrainModal';
import { BrainManagerModal } from './BrainManagerModal';
import { RecentActivityPanel } from './RecentActivityPanel';
import { DatabaseSettingsView } from './DatabaseSettingsView';


interface BrainViewProps {
  userEmail: string;
  initialBrainName?: string;
  onSwitchToLogin: () => void;
}

export const BrainView: React.FC<BrainViewProps> = ({
  initialBrainName,
  onSwitchToLogin,
}) => {
  const [currentBrain, setCurrentBrain] = useState(initialBrainName || 'coding');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (initialBrainName) {
      setCurrentBrain(initialBrainName);
    }
  }, [initialBrainName]);

  // Keyboard shortcut '[' to toggle sidebar collapse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '[' &&
        !e.metaKey &&
        !e.ctrlKey &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        setIsSidebarCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [brains, setBrains] = useState<string[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [brainCounts, setBrainCounts] = useState<Record<string, number>>({});
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [fileTypeCounts, setFileTypeCounts] = useState<Record<string, number>>({});
  const [selectedFact, setSelectedFact] = useState<Fact | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSourceFilter, setActiveSourceFilter] = useState<AISource | null>(null);
  const [activeFileTypeFilter, setActiveFileTypeFilter] = useState<FactFileType | null>(null);
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('graph');
  const [sortOrder, setSortOrder] = useState<'newest' | 'id'>('newest');
  const [exportToast, setExportToast] = useState<string | null>(null);

  // Live AI Simulator State
  const [simSource, setSimSource] = useState<AISource>('claude');
  const [simInput, setSimInput] = useState('');
  const [simLoading, setSimLoading] = useState(false);
  const [simHistory, setSimHistory] = useState<
    {
      role: 'user' | 'assistant';
      text: string;
      source: AISource;
      recalledFacts?: Fact[];
      savedFact?: Fact;
    }[]
  >([]);
  const [copiedPrimerKey, setCopiedPrimerKey] = useState<string | null>(null);

  // Recent Activity State
  const [isRecentActivityOpen, setIsRecentActivityOpen] = useState(false);
  const [activities, setActivities] = useState<RecentActivityItem[]>([]);

  const refreshActivities = () => {
    setActivities(brainStore.getRecentActivities());
  };

  useEffect(() => {
    refreshActivities();
  }, []);

  // Compute dynamic scale and intensity for background atmospheric glow container
  const glowMetrics = useMemo(() => {
    const nodeCount = facts.length;
    const scale = Math.min(1.75, Math.max(0.85, 0.85 + Math.sqrt(Math.max(0, nodeCount)) * 0.11));
    const outerWidth = Math.round(540 * scale);
    const outerHeight = Math.round(480 * scale);
    const innerWidth = Math.round(330 * scale);
    const innerHeight = Math.round(290 * scale);
    const primaryAlpha = Math.min(0.82, Math.max(0.46, 0.5 + Math.min(nodeCount, 60) * 0.0055));
    const secondaryAlpha = Math.min(0.55, Math.max(0.28, 0.32 + Math.min(nodeCount, 60) * 0.004));
    const etherealAlpha = Math.min(0.16, Math.max(0.06, 0.065 + Math.min(nodeCount, 60) * 0.0018));

    return {
      outerWidth,
      outerHeight,
      innerWidth,
      innerHeight,
      primaryAlpha,
      secondaryAlpha,
      etherealAlpha,
    };
  }, [facts]);

  // Modals
  const [isAddFactOpen, setIsAddFactOpen] = useState(false);
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const [captureHubTab, setCaptureHubTab] = useState<CaptureHubTab>('import');
  const [isMcpOpen, setIsMcpOpen] = useState(false);

  const handleOpenCaptureHub = (tab: CaptureHubTab = 'import') => {
    setCaptureHubTab(tab);
    setIsIngestOpen(true);
  };
  const [isGuidedConfigOpen, setIsGuidedConfigOpen] = useState(false);
  const [guidedService, setGuidedService] = useState<GuidedService>('chatgpt');
  const [isDeleteBrainOpen, setIsDeleteBrainOpen] = useState(false);
  const [isBrainManagerOpen, setIsBrainManagerOpen] = useState(false);
  const [brainToDelete, setBrainToDelete] = useState('');
  const [connectionStatus, setConnectionStatus] = useState(brainStore.getConnectionStatus());

  const refreshConnectionStatus = () => {
    setConnectionStatus(brainStore.getConnectionStatus());
  };

  // Load brains and facts
  const refreshData = () => {
    const brainList = brainStore.getBrains();
    setBrains(brainList);
    if (!brainList.includes(currentBrain) && brainList.length > 0) {
      setCurrentBrain(brainList[0]);
    }
    const currentFacts = brainStore.recall(
      currentBrain,
      searchQuery,
      activeSourceFilter,
      activeFileTypeFilter
    );
    setFacts(currentFacts);
    setBrainCounts(brainStore.getFactCountsByBrain());
    setSourceCounts(brainStore.getFactCountsBySource(currentBrain));
    setFileTypeCounts(brainStore.getFactCountsByFileType(currentBrain));
    refreshConnectionStatus();
  };

  useEffect(() => {
    refreshData();
  }, [currentBrain, searchQuery, activeSourceFilter, activeFileTypeFilter]);

  useEffect(() => {
    const unsubscribe = brainStore.subscribe(() => {
      refreshData();
      refreshActivities();
    });
    return unsubscribe;
  }, [currentBrain, searchQuery, activeSourceFilter, activeFileTypeFilter]);

  const handleCreateBrain = (name: string) => {
    brainStore.createBrain(name);
    setCurrentBrain(name);
    refreshData();
  };

  const handleOpenDeleteBrain = (brain: string) => {
    setBrainToDelete(brain);
    setIsDeleteBrainOpen(true);
  };

  const handleBrainDeleted = (deletedBrain: string) => {
    const remaining = brainStore.getBrains().filter((b) => b !== deletedBrain);
    const nextBrain = remaining.length > 0 ? remaining[0] : 'coding';
    setCurrentBrain(nextBrain);
    refreshData();
    refreshActivities();
  };

  const handleOpenGuidedConfig = (service: GuidedService = 'chatgpt') => {
    setGuidedService(service);
    setIsGuidedConfigOpen(true);
  };

  const handleAddFact = (
    brain: string,
    content: string,
    source: AISource,
    fileName?: string,
    fileType?: FactFileType
  ) => {
    const newFact = brainStore.remember(brain, content, source, fileName, fileType);
    if (brain !== currentBrain) {
      setCurrentBrain(brain);
    }
    refreshData();
    refreshActivities();
    setSelectedFact(newFact);
  };

  const handleSaveCorrection = (id: number, newContent: string) => {
    brainStore.correct(id, newContent);
    refreshData();
    refreshActivities();
    if (selectedFact && selectedFact.id === id) {
      setSelectedFact({ ...selectedFact, content: newContent, updated_at: new Date().toISOString() });
    }
  };

  const handleUpdateFactTags = (id: number, tags: string[]) => {
    brainStore.updateFactTags(id, tags);
    refreshData();
    refreshActivities();
    if (selectedFact && selectedFact.id === id) {
      setSelectedFact({ ...selectedFact, tags, updated_at: new Date().toISOString() });
    }
  };

  const handleDeleteFact = (id: number) => {
    brainStore.forget(id);
    refreshData();
    refreshActivities();
    if (selectedFact && selectedFact.id === id) {
      setSelectedFact(null);
    }
  };

  const handleIngest = (
    brain: string,
    source: AISource,
    rawText: string,
    chunkSize: number,
    fileName?: string,
    fileType?: FactFileType,
    strategy: IngestStrategy = 'single'
  ) => {
    const count = brainStore.ingest(
      brain,
      source,
      rawText,
      chunkSize,
      fileName,
      fileType,
      undefined,
      strategy
    );
    if (brain !== currentBrain) {
      setCurrentBrain(brain);
    }
    refreshData();
    refreshActivities();
    return count;
  };

  const handleSelectFactFromSearch = (fact: Fact, targetBrain?: string) => {
    if (targetBrain && targetBrain !== currentBrain) {
      setCurrentBrain(targetBrain);
    }
    setSelectedFact(fact);
    setIsRecentActivityOpen(false);
    brainStore.recordActivity(fact, 'accessed');
    refreshActivities();
  };

  const handleSelectActivity = (item: RecentActivityItem) => {
    const fact = brainStore.getFactById(item.factId);
    if (fact) {
      if (fact.brain !== currentBrain) {
        setCurrentBrain(fact.brain);
      }
      setSelectedFact(fact);
      brainStore.recordActivity(fact, 'accessed');
      refreshActivities();
      setIsRecentActivityOpen(false);
    }
  };

  const handleClearActivities = () => {
    try {
      localStorage.removeItem('brain_recent_activity_v1');
    } catch {}
    setActivities([]);
  };

  const handleFactSelected = (fact: Fact | null) => {
    setSelectedFact(fact);
    if (fact) {
      setIsRecentActivityOpen(false);
      brainStore.recordActivity(fact, 'accessed');
      refreshActivities();
    }
  };

  const handleExportSnapshot = () => {
    const snapshot = brainStore.exportContextSnapshot(currentBrain);
    navigator.clipboard.writeText(snapshot);
    setExportToast(`Copied "${currentBrain}" Markdown snapshot to clipboard`);
    setTimeout(() => setExportToast(null), 2600);
  };

  const handleCopyPrimer = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPrimerKey(key);
    setTimeout(() => setCopiedPrimerKey(null), 2000);
  };

  const handleSendSimMessage = async (e?: React.FormEvent, presetPrompt?: string) => {
    if (e) e.preventDefault();
    const promptText = (presetPrompt ?? simInput).trim();
    if (!promptText || simLoading) return;

    setSimInput('');
    setSimHistory((prev) => [
      ...prev,
      { role: 'user', text: promptText, source: simSource },
    ]);
    setSimLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brain: currentBrain,
          message: promptText,
          source: simSource,
        }),
      });
      if (!res.ok) throw new Error('API fallback');
      const data = await res.json();

      // Reload backend facts if a new durable fact was saved
      if (data.savedFact) {
        await brainStore.loadFromBackend();
        refreshData();
        refreshActivities();
      }

      setSimHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.reply,
          source: simSource,
          recalledFacts: data.recalledFacts || [],
          savedFact: data.savedFact || undefined,
        },
      ]);
    } catch {
      const localSim = brainStore.simulateWebAiInteraction(
        currentBrain,
        simSource,
        promptText
      );
      refreshData();
      refreshActivities();
      setSimHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: localSim.reply,
          source: simSource,
          recalledFacts: localSim.recalledFacts,
          savedFact: localSim.savedFact,
        },
      ]);
    } finally {
      setSimLoading(false);
    }
  };

  const sortedFacts = useMemo(() => {
    const list = [...facts];
    if (sortOrder === 'id') {
      return list.sort((a, b) => a.id - b.id);
    }
    return list.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [facts, sortOrder]);

  const totalFactsInCurrentBrain = brainCounts[currentBrain] || facts.length;

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[#03040a] text-white">
      {/* Desktop Collapsible Sidebar */}
      <div className="hidden md:flex h-full shrink-0">
        <BrainSidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          currentBrain={currentBrain}
          brains={brains}
          brainCounts={brainCounts}
          sourceCounts={sourceCounts}
          fileTypeCounts={fileTypeCounts}
          totalFactsInBrain={totalFactsInCurrentBrain}
          onSelectBrain={(b) => {
            setCurrentBrain(b);
            setSelectedFact(null);
          }}
          onCreateBrain={handleCreateBrain}
          onDeleteBrain={handleOpenDeleteBrain}
          onOpenManageBrains={() => setIsBrainManagerOpen(true)}
          viewMode={viewMode}
          onSelectViewMode={setViewMode}
          activeSourceFilter={activeSourceFilter}
          onSelectSourceFilter={setActiveSourceFilter}
          activeFileTypeFilter={activeFileTypeFilter}
          onSelectFileTypeFilter={setActiveFileTypeFilter}
          isRecentActivityOpen={isRecentActivityOpen}
          onToggleRecentActivity={() => {
            setIsRecentActivityOpen((prev) => !prev);
            if (!isRecentActivityOpen) setSelectedFact(null);
          }}
          recentActivityCount={activities.length}
          onOpenAddFact={() => setIsAddFactOpen(true)}
          onOpenIngest={(tab) => handleOpenCaptureHub(tab || 'import')}
          onOpenGuidedConfig={handleOpenGuidedConfig}
          onExportSnapshot={handleExportSnapshot}
          onSwitchToWelcome={onSwitchToLogin}
        />
      </div>

      {/* Mobile Collapsible Sidebar Drawer */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <div className="relative z-10 flex h-full">
            <BrainSidebar
              isCollapsed={false}
              onToggleCollapse={() => setIsMobileSidebarOpen(false)}
              currentBrain={currentBrain}
              brains={brains}
              brainCounts={brainCounts}
              sourceCounts={sourceCounts}
              fileTypeCounts={fileTypeCounts}
              totalFactsInBrain={totalFactsInCurrentBrain}
              onSelectBrain={(b) => {
                setCurrentBrain(b);
                setSelectedFact(null);
                setIsMobileSidebarOpen(false);
              }}
              onCreateBrain={handleCreateBrain}
              onDeleteBrain={handleOpenDeleteBrain}
              onOpenManageBrains={() => {
                setIsMobileSidebarOpen(false);
                setIsBrainManagerOpen(true);
              }}
              viewMode={viewMode}
              onSelectViewMode={(m) => {
                setViewMode(m);
                setIsMobileSidebarOpen(false);
              }}
              activeSourceFilter={activeSourceFilter}
              onSelectSourceFilter={setActiveSourceFilter}
              activeFileTypeFilter={activeFileTypeFilter}
              onSelectFileTypeFilter={setActiveFileTypeFilter}
              isRecentActivityOpen={isRecentActivityOpen}
              onToggleRecentActivity={() => {
                setIsRecentActivityOpen((prev) => !prev);
                setIsMobileSidebarOpen(false);
              }}
              recentActivityCount={activities.length}
              onOpenAddFact={() => {
                setIsMobileSidebarOpen(false);
                setIsAddFactOpen(true);
              }}
              onOpenIngest={(tab) => {
                setIsMobileSidebarOpen(false);
                handleOpenCaptureHub(tab || 'import');
              }}
              onOpenGuidedConfig={(s) => {
                setIsMobileSidebarOpen(false);
                handleOpenGuidedConfig(s);
              }}
              onExportSnapshot={handleExportSnapshot}
              onSwitchToWelcome={onSwitchToLogin}
            />
          </div>
        </div>
      )}

      {/* Right Workspace Column (Top Header + Main Viewport) */}
      <div className="relative flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top Application Header */}
        <BrainAppHeader
          currentBrain={currentBrain}
          brains={brains}
          onSelectBrain={setCurrentBrain}
          onCreateBrain={handleCreateBrain}
          onDeleteBrain={handleOpenDeleteBrain}
          onOpenManageBrains={() => setIsBrainManagerOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectFactFromSearch={handleSelectFactFromSearch}
          activeSourceFilter={activeSourceFilter}
          onSelectSourceFilter={setActiveSourceFilter}
          activeFileTypeFilter={activeFileTypeFilter}
          onSelectFileTypeFilter={setActiveFileTypeFilter}
          onOpenAddFact={() => setIsAddFactOpen(true)}
          onOpenIngest={(tab) => handleOpenCaptureHub(tab || 'import')}
          onOpenMcp={() => handleOpenGuidedConfig('chatgpt')}
          onOpenSettings={() =>
            setViewMode((prev) => (prev === 'settings' ? 'graph' : 'settings'))
          }
          isSettingsActive={viewMode === 'settings'}
          onOpenGuidedConfig={handleOpenGuidedConfig}
          connectionStatus={connectionStatus}
          onSwitchToLogin={onSwitchToLogin}
          onToggleRecentActivity={() => setIsRecentActivityOpen(!isRecentActivityOpen)}
          recentActivityCount={activities.length}
          isRecentActivityOpen={isRecentActivityOpen}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
          totalFactsCount={facts.length}
        />

        {/* Export Toast Notification */}
        {exportToast && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-white/20 bg-[#0b0f1d] px-4 py-2 text-xs font-medium text-white shadow-xl">
            {exportToast}
          </div>
        )}

        {/* Main Content Viewport */}
        <div className="relative flex-1 overflow-hidden">
          {/* Atmospheric Background Layers */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 transition-opacity ease-out [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(circle_at_center,black,transparent_80%)] opacity-20"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-out"
            style={{
              width: `${glowMetrics.outerWidth}px`,
              height: `${glowMetrics.outerHeight}px`,
              background: `radial-gradient(closest-side, rgba(24, 29, 46, ${glowMetrics.primaryAlpha}) 0%, rgba(12, 16, 28, ${glowMetrics.secondaryAlpha}) 52%, rgba(3, 4, 10, 0) 100%)`,
              filter: `blur(${Math.round(24 * (glowMetrics.outerWidth / 600))}px)`,
            }}
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-out"
            style={{
              width: `${glowMetrics.innerWidth}px`,
              height: `${glowMetrics.innerHeight}px`,
              background: `radial-gradient(circle, rgba(157, 180, 255, ${glowMetrics.etherealAlpha}) 0%, rgba(157, 180, 255, ${glowMetrics.etherealAlpha * 0.3}) 58%, transparent 100%)`,
            }}
          />

          {/* VIEW 1: NEURAL GRAPH */}
          {viewMode === 'graph' && (
            <>
              <BrainViewerCanvas
                brainName={currentBrain}
                facts={facts}
                selectedFactId={selectedFact?.id || null}
                onSelectFact={handleFactSelected}
                searchQuery={searchQuery}
                activeSourceFilter={activeSourceFilter}
              />

              {/* Empty state overlay on canvas if zero facts */}
              {facts.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                  <div className="pointer-events-auto rounded-xl border border-white/12 bg-[#070913]/95 p-6 text-center max-w-sm backdrop-blur-xl">
                    <h3 className="text-sm font-semibold text-white">
                      No memory nodes match in "{currentBrain}"
                    </h3>
                    <p className="mt-1.5 text-xs text-white/55 leading-relaxed">
                      {searchQuery || activeSourceFilter || activeFileTypeFilter
                        ? 'Clear your active search or sidebar filters to view all nodes in this workspace.'
                        : 'Store a durable fact or ingest your AI conversation exports and documents.'}
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      {searchQuery || activeSourceFilter || activeFileTypeFilter ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setActiveSourceFilter(null);
                            setActiveFileTypeFilter(null);
                          }}
                          className="rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-black transition hover:bg-white/90"
                        >
                          Clear Filters
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setIsAddFactOpen(true)}
                            className="rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-black transition hover:bg-white/90"
                          >
                            Store First Fact
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsIngestOpen(true)}
                            className="rounded-lg border border-white/15 px-3.5 py-2 text-xs text-white/80 hover:text-white"
                          >
                            Ingest Files
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* VIEW 2: HIGH-DENSITY MEMORY LEDGER TABLE */}
          {viewMode === 'list' && (
            <div className="relative z-10 h-full overflow-y-auto p-6 md:p-8 scrollbar-thin">
              <div className="mx-auto max-w-6xl space-y-4">
                {/* Table Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-white/10">
                  <div>
                    <h2 className="text-lg font-semibold text-white capitalize">
                      {currentBrain} Memory Ledger
                    </h2>
                    <p className="mt-0.5 text-xs text-white/50">
                      Showing <span className="mono tabular-nums text-white/85">{sortedFacts.length}</span> durable memory nodes · Click any row to inspect or edit
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSortOrder((prev) => (prev === 'newest' ? 'id' : 'newest'))
                      }
                      className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.03] px-3 py-1.5 text-xs text-white/75 transition hover:border-white/25 hover:text-white"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      <span>Sort: {sortOrder === 'newest' ? 'Recently Updated' : 'Node ID'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsIngestOpen(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.03] px-3 py-1.5 text-xs text-white/75 transition hover:border-white/25 hover:text-white"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Ingest</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsAddFactOpen(true)}
                      className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Store Fact</span>
                    </button>
                  </div>
                </div>

                {/* High-Density Structured Data Grid */}
                {sortedFacts.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] py-16 text-center">
                    <p className="text-sm font-medium text-white/75">
                      No facts found in "{currentBrain}"
                    </p>
                    <p className="mt-1 text-xs text-white/45">
                      Use "Store Fact" or "Ingest" to populate this workspace.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-[#060812]/90">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.02] text-[11px] font-medium text-white/45">
                          <th className="py-2.5 pl-4 pr-2 w-16">ID</th>
                          <th className="py-2.5 px-3 w-36">Source</th>
                          <th className="py-2.5 px-3">Memory Content & Context</th>
                          <th className="py-2.5 px-3 w-36 hidden lg:table-cell">Document / Type</th>
                          <th className="py-2.5 px-3 w-44 hidden md:table-cell">Tags</th>
                          <th className="py-2.5 pl-3 pr-4 w-28 text-right">Updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/8 text-xs">
                        {sortedFacts.map((fact) => {
                          const s = SOURCE_PALETTE[fact.source];
                          const ft = getFactFileType(fact);
                          const ftMeta = FILE_TYPE_CONFIG[ft];
                          const isSelected = selectedFact?.id === fact.id;

                          return (
                            <tr
                              key={fact.id}
                              onClick={() => handleFactSelected(fact)}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-white/[0.09]'
                                  : 'hover:bg-white/[0.04]'
                              }`}
                            >
                              <td className="py-3 pl-4 pr-2 align-top mono text-[11px] tabular-nums text-white/50">
                                #{fact.id}
                              </td>
                              <td className="py-3 px-3 align-top whitespace-nowrap">
                                <span
                                  className="font-semibold"
                                  style={{ color: s?.color || '#fff' }}
                                >
                                  {s?.name || fact.source}
                                </span>
                              </td>
                              <td className="py-3 px-3 align-top">
                                <p className="text-white/90 leading-relaxed line-clamp-2">
                                  {fact.content}
                                </p>
                              </td>
                              <td className="py-3 px-3 align-top hidden lg:table-cell whitespace-nowrap">
                                <div className="flex items-center gap-1.5 text-[11px] text-white/60">
                                  <span className="mono font-medium" style={{ color: ftMeta.color }}>
                                    {ftMeta.badge}
                                  </span>
                                  {fact.fileName && (
                                    <>
                                      <span className="text-white/25">·</span>
                                      <span className="truncate max-w-[110px]" title={fact.fileName}>
                                        {fact.fileName}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3 align-top hidden md:table-cell">
                                {fact.tags && fact.tags.length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mono text-[11px] text-[#9db4ff]">
                                    {fact.tags.slice(0, 3).map((t, i) => (
                                      <React.Fragment key={t}>
                                        {i > 0 && <span className="text-white/25">·</span>}
                                        <span>#{t}</span>
                                      </React.Fragment>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-white/25">—</span>
                                )}
                              </td>
                              <td className="py-3 pl-3 pr-4 align-top text-right mono text-[11px] tabular-nums text-white/45 whitespace-nowrap">
                                {new Date(fact.updated_at).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW 3: LIVE AI SYNC STUDIO & 2-WAY MEMORY SIMULATOR */}
          {viewMode === 'simulator' && (
            <div className="relative z-10 h-full overflow-y-auto p-6 md:p-8 scrollbar-thin">
              <div className="mx-auto max-w-6xl space-y-6">
                {/* Top Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      AI Sync Studio · <span className="capitalize text-[#9db4ff]">{currentBrain}</span>
                    </h2>
                    <p className="mt-0.5 text-xs text-white/55">
                      Test two-way memory recall and automatic durable fact extraction, or copy 1-click grounding prompts for your AI tools.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenGuidedConfig('chatgpt')}
                    className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-white transition hover:border-white/30 hover:bg-white/[0.08]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open Full Connection Wizard</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left 7 Cols: Interactive Two-Way AI Memory Playground */}
                  <div className="lg:col-span-7 flex flex-col rounded-xl border border-white/10 bg-[#060812]/90 overflow-hidden">
                    <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-400" />
                        <span className="text-xs font-semibold text-white">
                          Two-Way Memory Grounding Simulator
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-white/45">Simulate as:</span>
                        <select
                          value={simSource}
                          onChange={(e) => setSimSource(e.target.value as AISource)}
                          className="mono rounded-lg border border-white/15 bg-black/50 px-2.5 py-1 text-xs text-white outline-none"
                        >
                          {(Object.keys(SOURCE_PALETTE) as AISource[]).map((src) => (
                            <option key={src} value={src} className="bg-[#050713]">
                              {SOURCE_PALETTE[src].name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Starter Prompt Suggestions */}
                    <div className="border-b border-white/10 bg-white/[0.01] px-5 py-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-white/40 mr-1">Try:</span>
                      <button
                        type="button"
                        onClick={() =>
                          handleSendSimMessage(
                            undefined,
                            `What is our current architecture and tech stack in ${currentBrain}?`
                          )
                        }
                        className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/75 hover:border-white/25 hover:text-white transition"
                      >
                        Recall architecture context
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleSendSimMessage(
                            undefined,
                            `Remember this decision: We standardized on strict TypeScript, collapsible sidebar layout, and SQLite persistence.`
                          )
                        }
                        className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/75 hover:border-white/25 hover:text-white transition"
                      >
                        Test auto-saving a new decision
                      </button>
                    </div>

                    {/* Chat Messages Viewport */}
                    <div className="h-[340px] overflow-y-auto p-5 space-y-4 scrollbar-thin">
                      {simHistory.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center text-center px-6">
                          <p className="text-xs font-medium text-white/75">
                            Ask a question or announce a new project decision
                          </p>
                          <p className="mt-1 text-xs text-white/45 max-w-md leading-relaxed">
                            The simulator queries your local SQLite brain ("{currentBrain}") for relevant facts, grounds the response, and automatically extracts new durable facts back into your graph.
                          </p>
                        </div>
                      ) : (
                        simHistory.map((msg, idx) => (
                          <div
                            key={idx}
                            className={`rounded-xl p-3.5 text-xs leading-relaxed border ${
                              msg.role === 'user'
                                ? 'ml-8 bg-white/[0.05] border-white/15 text-white'
                                : 'mr-4 bg-[#0b0f1d] border-white/10 text-white/90'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] text-white/45 mb-1.5">
                              <span className="font-semibold text-white/80">
                                {msg.role === 'user'
                                  ? 'You'
                                  : `${SOURCE_PALETTE[msg.source]?.name || msg.source} (Grounded in ${currentBrain})`}
                              </span>
                              {msg.recalledFacts && msg.recalledFacts.length > 0 && (
                                <span className="mono text-[10px] text-[#9db4ff]">
                                  Recalled {msg.recalledFacts.length} nodes
                                </span>
                              )}
                            </div>
                            <div className="whitespace-pre-wrap">{msg.text}</div>
                            {msg.savedFact && (
                              <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
                                <span>
                                  Auto-saved to "{currentBrain}" as Node #{msg.savedFact.id}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleFactSelected(msg.savedFact!)}
                                  className="underline hover:text-white"
                                >
                                  Inspect Node
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                      {simLoading && (
                        <div className="text-xs text-white/50 mono px-2">
                          Recalling from "{currentBrain}" and generating grounded response...
                        </div>
                      )}
                    </div>

                    {/* Input Form */}
                    <form
                      onSubmit={(e) => handleSendSimMessage(e)}
                      className="flex items-center gap-2 border-t border-white/10 bg-black/40 p-3.5"
                    >
                      <input
                        type="text"
                        placeholder={`Message ${SOURCE_PALETTE[simSource].name} with "${currentBrain}" memory...`}
                        value={simInput}
                        onChange={(e) => setSimInput(e.target.value)}
                        className="flex-1 rounded-lg border border-white/15 bg-black/60 px-3.5 py-2 text-xs text-white placeholder-white/35 outline-none focus:border-white/40"
                      />
                      <button
                        type="submit"
                        disabled={!simInput.trim() || simLoading}
                        className="flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>Send</span>
                      </button>
                    </form>
                  </div>

                  {/* Right 5 Cols: 1-Click Context Primers for Free Web AI */}
                  <div className="lg:col-span-5 space-y-4">
                    <div className="rounded-xl border border-white/10 bg-[#060812]/90 p-5 space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          One-Click Context Primers
                        </h3>
                        <p className="mt-1 text-xs text-white/50 leading-relaxed">
                          Copy pre-formatted grounding instructions containing all <span className="mono tabular-nums text-white/80">{facts.length}</span> facts from "{currentBrain}" for ChatGPT, Claude, or Gemini Web.
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        {/* Claude Primer */}
                        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-3">
                          <div>
                            <div className="text-xs font-semibold text-[#D85A30]">
                              Claude Web Primer
                            </div>
                            <div className="text-[11px] text-white/45">
                              Persistent grounding block + durable fact capture rule
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyPrimer(
                                'claude',
                                brainStore.generateClaudePrimer(currentBrain)
                              )
                            }
                            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/[0.1] transition whitespace-nowrap"
                          >
                            {copiedPrimerKey === 'claude' ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>Copy Primer</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* ChatGPT Custom Instructions */}
                        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-3">
                          <div>
                            <div className="text-xs font-semibold text-[#378ADD]">
                              ChatGPT Custom Instructions
                            </div>
                            <div className="text-[11px] text-white/45">
                              Ready for Settings → Personalization → Custom Instructions
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyPrimer(
                                'chatgpt',
                                brainStore.generateChatGptCustomInstructions(currentBrain)
                              )
                            }
                            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/[0.1] transition whitespace-nowrap"
                          >
                            {copiedPrimerKey === 'chatgpt' ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>Copy Rules</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Gemini Primer */}
                        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-3">
                          <div>
                            <div className="text-xs font-semibold text-[#1D9E75]">
                              Google Gemini Context
                            </div>
                            <div className="text-[11px] text-white/45">
                              Structured workspace context for Gemini Web sessions
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyPrimer(
                                'gemini',
                                brainStore.generateGeminiPrimer(currentBrain)
                              )
                            }
                            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/[0.1] transition whitespace-nowrap"
                          >
                            {copiedPrimerKey === 'gemini' ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>Copy Primer</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 4: DATABASE & BACKUP SETTINGS */}
          {viewMode === 'settings' && (
            <div className="relative z-10 h-full overflow-hidden">
              <DatabaseSettingsView
                onBackToWorkspace={() => setViewMode('graph')}
                onAfterRestore={() => {
                  refreshData();
                  refreshActivities();
                }}
              />
            </div>
          )}

          {/* Slide-over Inspection & Correction Panel */}
          <FactPanel
            fact={selectedFact}
            onClose={() => setSelectedFact(null)}
            onSaveCorrection={handleSaveCorrection}
            onDeleteFact={handleDeleteFact}
            onUpdateTags={handleUpdateFactTags}
          />

          {/* Slide-over Recent Activity Panel */}
          <RecentActivityPanel
            isOpen={isRecentActivityOpen}
            onClose={() => setIsRecentActivityOpen(false)}
            activities={activities}
            onSelectActivity={handleSelectActivity}
            onClearActivities={handleClearActivities}
          />
        </div>
      </div>

      {/* Modals */}
      <AddFactModal
        isOpen={isAddFactOpen}
        onClose={() => setIsAddFactOpen(false)}
        currentBrain={currentBrain}
        brains={brains}
        onAddFact={handleAddFact}
      />

      <IngestModal
        isOpen={isIngestOpen}
        onClose={() => setIsIngestOpen(false)}
        currentBrain={currentBrain}
        brains={brains}
        initialTab={captureHubTab}
        onCreateBrain={handleCreateBrain}
        onIngest={handleIngest}
      />

      <McpBridgeModal
        isOpen={isMcpOpen}
        onClose={() => setIsMcpOpen(false)}
        currentBrain={currentBrain}
      />

      <GuidedConnectionModal
        isOpen={isGuidedConfigOpen}
        onClose={() => setIsGuidedConfigOpen(false)}
        currentBrain={currentBrain}
        initialService={guidedService}
        onConnectionStatusChange={refreshConnectionStatus}
      />

      <DeleteBrainModal
        isOpen={isDeleteBrainOpen}
        onClose={() => setIsDeleteBrainOpen(false)}
        brainToDelete={brainToDelete}
        onBrainDeleted={handleBrainDeleted}
      />

      <BrainManagerModal
        isOpen={isBrainManagerOpen}
        onClose={() => setIsBrainManagerOpen(false)}
        currentBrain={currentBrain}
        brains={brains}
        onSelectBrain={setCurrentBrain}
        onCreateBrain={handleCreateBrain}
        onRequestDeleteBrain={(b) => {
          setIsBrainManagerOpen(false);
          handleOpenDeleteBrain(b);
        }}
      />
    </div>
  );
};
