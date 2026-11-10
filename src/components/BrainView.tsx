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
  ArrowUp,
  ArrowDown,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Filter,
  X,
} from 'lucide-react';
import {
  Fact,
  AISource,
  FactFileType,
  IngestStrategy,
  SOURCE_PALETTE,
  FILE_TYPE_CONFIG,
  RecentActivityItem,
  ActivityLogEntry,
  AIEntity,
  AI_ENTITIES_REGISTRY,
  SPINAL_CORD_BOUNDARY,
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

export type TableSortField =
  | 'id'
  | 'created'
  | 'updated'
  | 'oldest'
  | 'title'
  | 'source'
  | 'type'
  | 'size'
  | 'length'
  | 'relevance';

interface BrainViewProps {
  userEmail: string;
  initialBrainName?: string;
  onSwitchToLogin: () => void;
}

export const BrainView: React.FC<BrainViewProps> = ({
  userEmail,
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
  const [allBrainFacts, setAllBrainFacts] = useState<Fact[]>([]);
  const [brainCounts, setBrainCounts] = useState<Record<string, number>>({});
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [fileTypeCounts, setFileTypeCounts] = useState<Record<string, number>>({});
  const [selectedFact, setSelectedFact] = useState<Fact | null>(null);
  const [selectedSource, setSelectedSource] = useState<AISource | null>(null);
  const [addFactDefaultSource, setAddFactDefaultSource] = useState<AISource | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSourceFilter, setActiveSourceFilter] = useState<AISource | null>(null);
  const [activeFileTypeFilter, setActiveFileTypeFilter] = useState<FactFileType | null>(null);
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('graph');

  // Section 4: Memory Table Sorting & Pagination State
  const [sortField, setSortField] = useState<TableSortField>('updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

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

  // Recent Activity State & Full Audit Log State (Section 8)
  const [isRecentActivityOpen, setIsRecentActivityOpen] = useState(false);
  const [activities, setActivities] = useState<RecentActivityItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<ActivityLogEntry[]>([]);
  const [auditTotalCount, setAuditTotalCount] = useState<number>(0);
  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditPageSize, setAuditPageSize] = useState<number>(50);
  const [auditTotalPages, setAuditTotalPages] = useState<number>(1);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditCategory, setAuditCategory] = useState('all');
  const [auditStatus, setAuditStatus] = useState('all');
  const [auditSource, setAuditSource] = useState('all');
  const [auditSortDir, setAuditSortDir] = useState<'desc' | 'asc'>('desc');
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);

  const refreshActivities = () => {
    setActivities(brainStore.getRecentActivities());
  };

  const refreshAuditLogs = async (targetPage = auditPage, targetPageSize = auditPageSize) => {
    const res = await brainStore.fetchActivityLogs({
      category: auditCategory === 'all' ? undefined : auditCategory,
      status: auditStatus === 'all' ? undefined : auditStatus,
      source: auditSource === 'all' ? undefined : auditSource,
      search: auditSearch.trim() || undefined,
      sort: auditSortDir === 'asc' ? 'oldest' : 'newest',
      page: targetPage,
      pageSize: targetPageSize,
    });
    setAuditLogs(res.logs);
    setAuditTotalCount(res.total);
    setAuditTotalPages(res.totalPages);
  };

  useEffect(() => {
    refreshActivities();
  }, []);

  useEffect(() => {
    setAuditPage(1);
  }, [auditCategory, auditStatus, auditSource, auditSearch, auditSortDir]);

  useEffect(() => {
    if (viewMode === 'activity') {
      refreshAuditLogs(auditPage, auditPageSize);
    }
  }, [
    viewMode,
    auditCategory,
    auditStatus,
    auditSource,
    auditSearch,
    auditSortDir,
    auditPage,
    auditPageSize,
  ]);

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

  const refreshData = () => {
    const brainList = brainStore.getBrains();
    setBrains(brainList);
    if (!brainList.includes(currentBrain) && brainList.length > 0) {
      setCurrentBrain(brainList[0]);
    }
    const unfilteredBrainFacts = brainStore.recall(currentBrain, '', null, null);
    setAllBrainFacts(unfilteredBrainFacts);
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

  const graphFacts = useMemo(() => {
    if (!activeSourceFilter && !activeFileTypeFilter) {
      return allBrainFacts;
    }
    return brainStore.recall(
      currentBrain,
      '',
      activeSourceFilter,
      activeFileTypeFilter
    );
  }, [allBrainFacts, currentBrain, activeSourceFilter, activeFileTypeFilter]);

  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return new Set(facts.map((f) => f.id));
  }, [facts, searchQuery]);

  useEffect(() => {
    refreshData();
    setCurrentPage(1);
    if (searchQuery.trim() && sortField !== 'relevance') {
      setSortField('relevance');
      setSortDir('desc');
    }
  }, [currentBrain, searchQuery, activeSourceFilter, activeFileTypeFilter]);

  useEffect(() => {
    const unsubscribe = brainStore.subscribe(() => {
      refreshData();
      refreshActivities();
      if (viewMode === 'activity') {
        refreshAuditLogs(auditPage, auditPageSize);
      }
    });
    return unsubscribe;
  }, [
    currentBrain,
    searchQuery,
    activeSourceFilter,
    activeFileTypeFilter,
    viewMode,
    auditPage,
    auditPageSize,
    auditCategory,
    auditStatus,
    auditSource,
    auditSearch,
    auditSortDir,
  ]);

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
    if (viewMode !== 'graph' && viewMode !== 'list') {
      setViewMode('graph');
    }
    setSelectedSource(null);
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
    } catch {
      // ignore
    }
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
    brainStore.recordAuditLog({
      category: 'export',
      action: 'export_markdown_snapshot',
      summary: `Exported Markdown snapshot for workspace "${currentBrain}"`,
      status: 'success',
      brain: currentBrain,
    });
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

  // Section 4: Comprehensive 10-Mode Sorting with Ascending/Descending & Column Header Sync
  const handleToggleColumnSort = (field: TableSortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'id' || field === 'title' || field === 'source' || field === 'oldest' ? 'asc' : 'desc');
    }
    setCurrentPage(1);
  };

  const sortedFacts = useMemo(() => {
    const list = [...facts];
    const dirMultiplier = sortDir === 'asc' ? 1 : -1;

    list.sort((a, b) => {
      switch (sortField) {
        case 'id':
          return (a.id - b.id) * dirMultiplier;
        case 'created': {
          const ta = new Date(a.created_at || a.updated_at).getTime();
          const tb = new Date(b.created_at || b.updated_at).getTime();
          return ((ta - tb) || (a.id - b.id)) * dirMultiplier;
        }
        case 'updated': {
          const ta = new Date(a.updated_at).getTime();
          const tb = new Date(b.updated_at).getTime();
          return ((ta - tb) || (a.id - b.id)) * dirMultiplier;
        }
        case 'oldest': {
          const ta = new Date(a.created_at || a.updated_at).getTime();
          const tb = new Date(b.created_at || b.updated_at).getTime();
          return ((ta - tb) || (a.id - b.id)) * (sortDir === 'asc' ? 1 : -1);
        }
        case 'title': {
          const titleA = (a.documentTitle || a.fileName || a.content.slice(0, 60)).toLowerCase();
          const titleB = (b.documentTitle || b.fileName || b.content.slice(0, 60)).toLowerCase();
          return titleA.localeCompare(titleB) * dirMultiplier;
        }
        case 'source': {
          const srcA = (SOURCE_PALETTE[a.source]?.name || a.source).toLowerCase();
          const srcB = (SOURCE_PALETTE[b.source]?.name || b.source).toLowerCase();
          return (srcA.localeCompare(srcB) || a.id - b.id) * dirMultiplier;
        }
        case 'type': {
          const ftA = getFactFileType(a);
          const ftB = getFactFileType(b);
          return (ftA.localeCompare(ftB) || a.id - b.id) * dirMultiplier;
        }
        case 'size': {
          const szA = a.fileSizeBytes ?? a.content.length;
          const szB = b.fileSizeBytes ?? b.content.length;
          return ((szA - szB) || (a.id - b.id)) * dirMultiplier;
        }
        case 'length': {
          return ((a.content.length - b.content.length) || (a.id - b.id)) * dirMultiplier;
        }
        case 'relevance': {
          if (!searchQuery.trim()) {
            return (b.id - a.id) * dirMultiplier;
          }
          const scoreA = brainStore.computeRelevanceScore(a, searchQuery).score;
          const scoreB = brainStore.computeRelevanceScore(b, searchQuery).score;
          return ((scoreA - scoreB) || (a.id - b.id)) * dirMultiplier;
        }
        default:
          return (a.id - b.id) * dirMultiplier;
      }
    });

    return list;
  }, [facts, sortField, sortDir, searchQuery]);

  const totalPages = pageSize <= 0 ? 1 : Math.max(1, Math.ceil(sortedFacts.length / pageSize));
  const paginatedFacts = useMemo(() => {
    if (pageSize <= 0) return sortedFacts;
    const start = (currentPage - 1) * pageSize;
    return sortedFacts.slice(start, start + pageSize);
  }, [sortedFacts, currentPage, pageSize]);

  const totalFactsInCurrentBrain = brainCounts[currentBrain] || allBrainFacts.length;
  const hasActiveFilters = Boolean(searchQuery.trim() || activeSourceFilter || activeFileTypeFilter);

  // Filtered and Sorted Audit Logs (Section 8)
  const sortedAuditLogs = useMemo(() => {
    const list = [...auditLogs];
    list.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return auditSortDir === 'desc' ? tb - ta : ta - tb;
    });
    return list;
  }, [auditLogs, auditSortDir]);

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
            setSelectedSource(null);
          }}
          onCreateBrain={handleCreateBrain}
          onDeleteBrain={handleOpenDeleteBrain}
          onOpenManageBrains={() => setIsBrainManagerOpen(true)}
          viewMode={viewMode}
          onSelectViewMode={setViewMode}
          activeSourceFilter={activeSourceFilter}
          onSelectSourceFilter={(src) => {
            setActiveSourceFilter(src);
            setSelectedFact(null);
            setSelectedSource(src);
          }}
          activeFileTypeFilter={activeFileTypeFilter}
          onSelectFileTypeFilter={setActiveFileTypeFilter}
          isRecentActivityOpen={isRecentActivityOpen}
          onToggleRecentActivity={() => {
            setIsRecentActivityOpen((prev) => !prev);
            if (!isRecentActivityOpen) {
              setSelectedFact(null);
              setSelectedSource(null);
            }
          }}
          recentActivityCount={activities.length}
          onOpenAddFact={() => {
            setAddFactDefaultSource(null);
            setIsAddFactOpen(true);
          }}
          onOpenIngest={(tab) => handleOpenCaptureHub(tab || 'import')}
          onOpenGuidedConfig={handleOpenGuidedConfig}
          onExportSnapshot={handleExportSnapshot}
          onSwitchToWelcome={onSwitchToLogin}
          userIdentity={userEmail}
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
                setSelectedSource(null);
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
              onSelectSourceFilter={(src) => {
                setActiveSourceFilter(src);
                setSelectedFact(null);
                setSelectedSource(src);
              }}
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
                setAddFactDefaultSource(null);
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
              userIdentity={userEmail}
            />
          </div>
        </div>
      )}

      {/* Right Workspace Column */}
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

        {/* Section 7: Active View Context & Filter Banner */}
        {hasActiveFilters && (
          <div className="z-20 flex flex-wrap items-center justify-between gap-2 border-b border-indigo-500/20 bg-indigo-500/[0.06] px-4 py-1.5 text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 font-medium text-indigo-300">
                <Filter className="h-3 w-3" />
                <span>
                  Showing <strong className="mono text-white">{facts.length}</strong> of{' '}
                  <strong className="mono text-white">{totalFactsInCurrentBrain}</strong> memories in{' '}
                  <span className="capitalize text-white">{currentBrain}</span>
                </span>
              </span>
              {activeSourceFilter && (
                <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-white">
                  <span>Source: {SOURCE_PALETTE[activeSourceFilter]?.name || activeSourceFilter}</span>
                  <button
                    type="button"
                    onClick={() => setActiveSourceFilter(null)}
                    className="text-white/50 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {activeFileTypeFilter && (
                <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-white">
                  <span>Format: {FILE_TYPE_CONFIG[activeFileTypeFilter]?.label || activeFileTypeFilter}</span>
                  <button
                    type="button"
                    onClick={() => setActiveFileTypeFilter(null)}
                    className="text-white/50 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {searchQuery.trim() && (
                <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-white">
                  <span>Query: "{searchQuery}"</span>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-white/50 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveSourceFilter(null);
                setActiveFileTypeFilter(null);
              }}
              className="mono text-[10.5px] text-indigo-300 underline hover:text-white"
            >
              Reset all filters
            </button>
          </div>
        )}

        {/* Export Toast Notification */}
        {exportToast && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-white/20 bg-[#0b0f1d] px-4 py-2 text-xs font-medium text-white shadow-xl">
            {exportToast}
          </div>
        )}

        {/* Main Content Viewport */}
        <div className="relative flex-1 overflow-hidden">
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
                facts={graphFacts}
                searchMatchIds={searchMatchIds}
                selectedFactId={selectedFact?.id || null}
                selectedSource={selectedSource}
                onSelectFact={handleFactSelected}
                onSelectSource={(src) => {
                  setSelectedSource(src);
                  setActiveSourceFilter(src);
                  if (src) {
                    setSelectedFact(null);
                    setIsRecentActivityOpen(false);
                  }
                }}
                searchQuery={searchQuery}
                activeSourceFilter={activeSourceFilter}
                isInspectorOpen={Boolean(selectedFact || selectedSource)}
              />

              {graphFacts.length === 0 && (
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

          {/* VIEW 2: HIGH-DENSITY MEMORY LEDGER TABLE (Section 4) */}
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
                      Showing <span className="mono tabular-nums text-white/85">{paginatedFacts.length}</span> of{' '}
                      <span className="mono tabular-nums text-white/85">{sortedFacts.length}</span> matching memory nodes (Workspace total: {totalFactsInCurrentBrain})
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* 10-Mode Sort Dropdown */}
                    <div className="flex items-center gap-1 rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-1 text-xs">
                      <ArrowUpDown className="h-3.5 w-3.5 text-white/50" />
                      <span className="text-white/45 text-[11px]">Sort:</span>
                      <select
                        value={sortField}
                        onChange={(e) => {
                          setSortField(e.target.value as TableSortField);
                          setCurrentPage(1);
                        }}
                        className="bg-transparent text-xs font-medium text-white outline-none cursor-pointer"
                      >
                        <option value="id" className="bg-[#070913]">Node ID</option>
                        <option value="created" className="bg-[#070913]">Recently Created</option>
                        <option value="updated" className="bg-[#070913]">Recently Updated</option>
                        <option value="oldest" className="bg-[#070913]">Oldest First</option>
                        <option value="title" className="bg-[#070913]">Title / Filename</option>
                        <option value="source" className="bg-[#070913]">AI Source</option>
                        <option value="type" className="bg-[#070913]">Document Type</option>
                        <option value="size" className="bg-[#070913]">File Size</option>
                        <option value="length" className="bg-[#070913]">Content Length</option>
                        <option value="relevance" className="bg-[#070913]">Search Relevance</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                        className="ml-1 rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 mono text-[10px] text-white/85 hover:bg-white/15"
                        title="Toggle Ascending / Descending order"
                      >
                        {sortDir === 'asc' ? 'ASC ↑' : 'DESC ↓'}
                      </button>
                    </div>

                    {/* Page Size Selector */}
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="mono rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/80 outline-none"
                      title="Rows per page"
                    >
                      <option value={25} className="bg-[#070913]">25 / page</option>
                      <option value={50} className="bg-[#070913]">50 / page</option>
                      <option value={100} className="bg-[#070913]">100 / page</option>
                      <option value={0} className="bg-[#070913]">Show All ({sortedFacts.length})</option>
                    </select>

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
                        <tr className="border-b border-white/10 bg-white/[0.02] text-[11px] font-medium text-white/55 select-none">
                          <th
                            onClick={() => handleToggleColumnSort('id')}
                            className="py-2.5 pl-4 pr-2 w-20 cursor-pointer hover:text-white"
                          >
                            <span className="inline-flex items-center gap-1">
                              <span>ID</span>
                              {sortField === 'id' &&
                                (sortDir === 'asc' ? (
                                  <ArrowUp className="h-3 w-3 text-indigo-400" />
                                ) : (
                                  <ArrowDown className="h-3 w-3 text-indigo-400" />
                                ))}
                            </span>
                          </th>
                          <th
                            onClick={() => handleToggleColumnSort('source')}
                            className="py-2.5 px-3 w-36 cursor-pointer hover:text-white"
                          >
                            <span className="inline-flex items-center gap-1">
                              <span>Source</span>
                              {sortField === 'source' &&
                                (sortDir === 'asc' ? (
                                  <ArrowUp className="h-3 w-3 text-indigo-400" />
                                ) : (
                                  <ArrowDown className="h-3 w-3 text-indigo-400" />
                                ))}
                            </span>
                          </th>
                          <th
                            onClick={() => handleToggleColumnSort('title')}
                            className="py-2.5 px-3 cursor-pointer hover:text-white"
                          >
                            <span className="inline-flex items-center gap-1">
                              <span>Memory Content & Provenance</span>
                              {(sortField === 'title' || sortField === 'length' || sortField === 'relevance') &&
                                (sortDir === 'asc' ? (
                                  <ArrowUp className="h-3 w-3 text-indigo-400" />
                                ) : (
                                  <ArrowDown className="h-3 w-3 text-indigo-400" />
                                ))}
                            </span>
                          </th>
                          <th
                            onClick={() => handleToggleColumnSort('type')}
                            className="py-2.5 px-3 w-44 hidden lg:table-cell cursor-pointer hover:text-white"
                          >
                            <span className="inline-flex items-center gap-1">
                              <span>Document / Type</span>
                              {sortField === 'type' &&
                                (sortDir === 'asc' ? (
                                  <ArrowUp className="h-3 w-3 text-indigo-400" />
                                ) : (
                                  <ArrowDown className="h-3 w-3 text-indigo-400" />
                                ))}
                            </span>
                          </th>
                          <th
                            onClick={() => handleToggleColumnSort('size')}
                            className="py-2.5 px-3 w-28 hidden md:table-cell cursor-pointer hover:text-white"
                          >
                            <span className="inline-flex items-center gap-1">
                              <span>Size / Chars</span>
                              {sortField === 'size' &&
                                (sortDir === 'asc' ? (
                                  <ArrowUp className="h-3 w-3 text-indigo-400" />
                                ) : (
                                  <ArrowDown className="h-3 w-3 text-indigo-400" />
                                ))}
                            </span>
                          </th>
                          <th
                            onClick={() => handleToggleColumnSort('updated')}
                            className="py-2.5 pl-3 pr-4 w-32 text-right cursor-pointer hover:text-white"
                          >
                            <span className="inline-flex items-center justify-end gap-1">
                              <span>Updated</span>
                              {(sortField === 'updated' || sortField === 'created' || sortField === 'oldest') &&
                                (sortDir === 'asc' ? (
                                  <ArrowUp className="h-3 w-3 text-indigo-400" />
                                ) : (
                                  <ArrowDown className="h-3 w-3 text-indigo-400" />
                                ))}
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/8 text-xs">
                        {paginatedFacts.map((fact) => {
                          const s = SOURCE_PALETTE[fact.source];
                          const ft = getFactFileType(fact);
                          const ftMeta = FILE_TYPE_CONFIG[ft];
                          const isSelected = selectedFact?.id === fact.id;

                          return (
                            <tr
                              key={fact.id}
                              onClick={() => handleFactSelected(fact)}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? 'bg-white/[0.09]' : 'hover:bg-white/[0.04]'
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
                                {fact.sourceFolder && (
                                  <div className="mono text-[9.5px] text-white/35">
                                    {fact.sourceFolder}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 align-top">
                                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                  {(fact.documentTitle || fact.fileName) && (
                                    <span className="font-semibold text-white">
                                      {fact.documentTitle || fact.fileName}
                                    </span>
                                  )}
                                  {fact.fixtureId && (
                                    <span className="mono rounded bg-indigo-500/20 px-1.5 py-0.2 text-[9.5px] text-indigo-200 border border-indigo-400/30">
                                      {fact.fixtureId}
                                    </span>
                                  )}
                                </div>
                                <p className="text-white/85 leading-relaxed line-clamp-2">
                                  {fact.content}
                                </p>
                                {fact.tags && fact.tags.length > 0 && (
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5 mono text-[10px] text-[#9db4ff]">
                                    {fact.tags.slice(0, 4).map((t) => (
                                      <span key={t}>#{t}</span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 align-top hidden lg:table-cell whitespace-nowrap">
                                <div className="flex items-center gap-1.5 text-[11px] text-white/60">
                                  <span className="mono font-medium" style={{ color: ftMeta.color }}>
                                    {ftMeta.badge}
                                  </span>
                                  {fact.fileName && (
                                    <>
                                      <span className="text-white/25">·</span>
                                      <span
                                        className="truncate max-w-[130px]"
                                        title={fact.filePath || fact.fileName}
                                      >
                                        {fact.fileName}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3 align-top hidden md:table-cell mono text-[10.5px] text-white/50">
                                {fact.fileSizeBytes
                                  ? `${(fact.fileSizeBytes / 1024).toFixed(1)} KB`
                                  : `${fact.content.length} chars`}
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

                    {/* Pagination Footer */}
                    {pageSize > 0 && totalPages > 1 && (
                      <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.02] px-4 py-2.5 text-xs">
                        <span className="mono text-[11px] text-white/50">
                          Page {currentPage} of {totalPages} ({sortedFacts.length} records)
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={currentPage <= 1}
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            className="rounded border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs text-white/80 hover:bg-white/10 disabled:opacity-35"
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            className="rounded border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs text-white/80 hover:bg-white/10 disabled:opacity-35"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW 3: LIVE AI SYNC STUDIO, ENTITIES, WORMHOLES & SPINAL CORD ARCHITECTURE (Sections 10 & 11) */}
          {viewMode === 'simulator' && (
            <div className="relative z-10 h-full overflow-y-auto p-6 md:p-8 scrollbar-thin">
              <div className="mx-auto max-w-6xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-lg font-semibold text-white">
                        AI Sync Studio · <span className="capitalize text-[#9db4ff]">{currentBrain}</span>
                      </h2>
                      <span className="mono rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-medium text-amber-300">
                        Local Simulator · Offline Grounding
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-white/55">
                      Simulate memory recall and durable fact extraction locally against SQLite, copy 1-click grounding primers for external web chats, or inspect provider transport modes.
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

                {/* Explicit Connectivity Honesty Banner */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-xl border border-white/10 bg-[#060812]/80 p-3.5 text-xs">
                  <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">Studio Playground</span>
                      <span className="mono rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                        Simulated
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-white/50 leading-relaxed">
                      Simulates how AI models ground responses using your local "{currentBrain}" SQLite nodes. Does not send messages to external Claude/ChatGPT web accounts.
                    </p>
                  </div>

                  <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">Web AI Primers</span>
                      <span className="mono rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300">
                        Manual Copy
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-white/50 leading-relaxed">
                      One-click grounding blocks for pasting into Claude Projects, ChatGPT Custom Instructions, or Gemini Web sessions.
                    </p>
                  </div>

                  <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">Browser Companion & API</span>
                      <span
                        className={`mono rounded px-1.5 py-0.5 text-[10px] ${
                          connectionStatus.backend
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-white/10 text-white/55'
                        }`}
                      >
                        {connectionStatus.backend ? 'Local REST Active' : 'Offline Fallback'}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-white/50 leading-relaxed">
                      Real capture from browser tabs requires pairing the Browser Companion extension or calling the local <code className="mono text-white/75">127.0.0.1</code> REST/MCP endpoints.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left 7 Cols: Interactive Two-Way AI Memory Playground */}
                  <div className="lg:col-span-7 flex flex-col rounded-xl border border-white/10 bg-[#060812]/90 overflow-hidden">
                    <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-400" />
                        <span className="text-xs font-semibold text-white">
                          Simulated Memory Grounding Playground
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-white/45">Simulate persona:</span>
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

                  {/* Right 5 Cols: 1-Click Context Primers */}
                  <div className="lg:col-span-5 space-y-4">
                    <div className="rounded-xl border border-white/10 bg-[#060812]/90 p-5 space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          One-Click Context Primers
                        </h3>
                        <p className="mt-1 text-xs text-white/50 leading-relaxed">
                          Copy pre-formatted grounding instructions containing all{' '}
                          <span className="mono tabular-nums text-white/80">{facts.length}</span> facts from "{currentBrain}" for ChatGPT, Claude, or Gemini Web.
                        </p>
                      </div>

                      <div className="space-y-2.5">
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

                {/* Sections 10 & 11: Provider-Neutral AI Entities, Wormholes & Spinal Cord Architecture */}
                <div className="rounded-xl border border-white/10 bg-[#060812]/90 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        AI Entities, Wormhole Context Channels & Spinal Cord Boundary
                      </h3>
                      <p className="text-xs text-white/50">
                        Provider-neutral entity registry and local-only Spinal Cord transport boundary ({SPINAL_CORD_BOUNDARY.host}:{SPINAL_CORD_BOUNDARY.port}).
                      </p>
                    </div>
                    <span className="mono rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-300">
                      Binding: {SPINAL_CORD_BOUNDARY.host} (LAN Exposure Disabled)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {(Object.values(AI_ENTITIES_REGISTRY) as AIEntity[]).map((ent) => {
                      const palette = SOURCE_PALETTE[ent.id];
                      const count = sourceCounts[ent.id] || 0;
                      return (
                        <div
                          key={ent.id}
                          className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className="text-xs font-semibold"
                              style={{ color: palette?.color || '#fff' }}
                            >
                              {ent.displayName}
                            </span>
                            <span className="mono text-[10px] text-white/50">{count} facts</span>
                          </div>
                          <div className="mono text-[10px] text-white/45">
                            Provider: {ent.provider || ent.providerFamily} · {ent.transportChannel || ent.syncStatus}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {ent.capabilities.map((cap: string) => (
                              <span
                                key={cap}
                                className="mono rounded bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] text-white/70"
                              >
                                {cap}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
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

          {/* VIEW 5: FULL-PAGE ACTIVITY LOG & DIAGNOSTICS (Section 8) */}
          {viewMode === 'activity' && (
            <div className="relative z-10 h-full overflow-y-auto p-6 md:p-8 scrollbar-thin">
              <div className="mx-auto max-w-6xl space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-400" />
                      <h2 className="text-lg font-semibold text-white">
                        Activity Log & System Audit Ledger
                      </h2>
                    </div>
                    <p className="mt-0.5 text-xs text-white/50">
                      Durable audit trail across imports, provenance resolution, edits, backups, restores, and searches. Secrets are automatically redacted.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={brainStore.getActivityLogExportUrl('json')}
                      download="brain-activity-logs.json"
                      className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/[0.09]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Export JSON</span>
                    </a>
                    <a
                      href={brainStore.getActivityLogExportUrl('csv')}
                      download="brain-activity-logs.csv"
                      className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/[0.09]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Export CSV</span>
                    </a>
                  </div>
                </div>

                {/* Filter Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                  <div className="relative lg:col-span-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                    <input
                      type="text"
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      placeholder="Search audit events, filenames, batch IDs..."
                      className="w-full rounded-lg border border-white/12 bg-black/50 pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/35 outline-none focus:border-white/30"
                    />
                  </div>

                  <select
                    value={auditCategory}
                    onChange={(e) => setAuditCategory(e.target.value)}
                    className="mono rounded-lg border border-white/12 bg-black/50 px-2.5 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="all">All Categories</option>
                    <option value="import">import</option>
                    <option value="archive_extract">archive_extract</option>
                    <option value="provenance">provenance</option>
                    <option value="create">create</option>
                    <option value="edit">edit</option>
                    <option value="delete">delete</option>
                    <option value="tag_update">tag_update</option>
                    <option value="search">search</option>
                    <option value="backup_create">backup_create</option>
                    <option value="backup_verify">backup_verify</option>
                    <option value="backup_export">backup_export</option>
                    <option value="backup_delete">backup_delete</option>
                    <option value="restore_internal">restore_internal</option>
                    <option value="restore_external">restore_external</option>
                    <option value="migration">migration</option>
                  </select>

                  <select
                    value={auditStatus}
                    onChange={(e) => setAuditStatus(e.target.value)}
                    className="mono rounded-lg border border-white/12 bg-black/50 px-2.5 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="all">All Statuses</option>
                    <option value="success">success</option>
                    <option value="warning">warning</option>
                    <option value="error">error</option>
                    <option value="info">info</option>
                  </select>

                  <div className="flex items-center gap-2">
                    <select
                      value={auditSource}
                      onChange={(e) => setAuditSource(e.target.value)}
                      className="mono flex-1 rounded-lg border border-white/12 bg-black/50 px-2.5 py-1.5 text-xs text-white outline-none"
                    >
                      <option value="all">All Sources</option>
                      {(Object.keys(SOURCE_PALETTE) as AISource[]).map((s) => (
                        <option key={s} value={s}>
                          {SOURCE_PALETTE[s].name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setAuditSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                      className="mono rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white/80 hover:text-white"
                    >
                      {auditSortDir === 'desc' ? 'Newest' : 'Oldest'}
                    </button>
                  </div>
                </div>

                {/* Audit Log Table */}
                <div className="overflow-hidden rounded-xl border border-white/10 bg-[#060812]/90">
                  {/* Pagination & Summary Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.02] px-4 py-2.5 text-xs">
                    <div className="text-white/60">
                      Showing{' '}
                      <span className="mono font-medium text-white">
                        {auditTotalCount === 0
                          ? 0
                          : (auditPage - 1) * auditPageSize + 1}
                      </span>
                      –
                      <span className="mono font-medium text-white">
                        {Math.min(
                          auditTotalCount,
                          (auditPage - 1) * auditPageSize + sortedAuditLogs.length
                        )}
                      </span>{' '}
                      of{' '}
                      <span className="mono font-medium text-white">
                        {auditTotalCount}
                      </span>{' '}
                      audit events
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-white/50">
                        <span>Rows:</span>
                        <select
                          value={auditPageSize}
                          onChange={(e) => {
                            setAuditPageSize(Number(e.target.value));
                            setAuditPage(1);
                          }}
                          className="mono rounded border border-white/15 bg-black/60 px-2 py-1 text-xs text-white outline-none"
                        >
                          <option value={25}>25 / page</option>
                          <option value={50}>50 / page</option>
                          <option value={100}>100 / page</option>
                          <option value={250}>250 / page</option>
                        </select>
                      </label>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={auditPage <= 1}
                          onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                          className="rounded border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs text-white/80 hover:bg-white/[0.1] hover:text-white disabled:opacity-35 disabled:pointer-events-none"
                        >
                          Previous
                        </button>
                        <span className="mono px-2 text-[11px] text-white/70">
                          Page {auditPage} of {Math.max(1, auditTotalPages)}
                        </span>
                        <button
                          type="button"
                          disabled={auditPage >= auditTotalPages}
                          onClick={() =>
                            setAuditPage((p) => Math.min(auditTotalPages, p + 1))
                          }
                          className="rounded border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs text-white/80 hover:bg-white/[0.1] hover:text-white disabled:opacity-35 disabled:pointer-events-none"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>

                  {sortedAuditLogs.length === 0 ? (
                    <div className="py-16 text-center text-xs text-white/50">
                      No audit events match your current filters.
                    </div>
                  ) : (
                    <div className="divide-y divide-white/8">
                      {sortedAuditLogs.map((log) => {
                        const isExpanded = expandedAuditId === log.id;
                        const statusColor =
                          log.status === 'success'
                            ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
                            : log.status === 'warning'
                            ? 'text-amber-300 bg-amber-500/15 border-amber-500/30'
                            : log.status === 'error'
                            ? 'text-rose-300 bg-rose-500/15 border-rose-500/30'
                            : 'text-indigo-300 bg-indigo-500/15 border-indigo-500/30';

                        return (
                          <div key={log.id} className="p-3.5 hover:bg-white/[0.02] transition">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedAuditId(isExpanded ? null : log.id)
                                  }
                                  className="text-white/50 hover:text-white"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </button>
                                <span
                                  className={`mono rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusColor}`}
                                >
                                  {log.status}
                                </span>
                                <span className="mono rounded bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-white/80">
                                  {log.category}
                                </span>
                                <span className="text-xs font-medium text-white">
                                  {log.action || log.summary}
                                </span>
                                {log.source && (
                                  <span
                                    className="mono text-[10.5px] font-semibold"
                                    style={{
                                      color:
                                        SOURCE_PALETTE[log.source as AISource]?.color || '#9db4ff',
                                    }}
                                  >
                                    · {SOURCE_PALETTE[log.source as AISource]?.name || log.source}
                                  </span>
                                )}
                                {log.brain && (
                                  <span className="mono text-[10.5px] text-white/45">
                                    [{log.brain}]
                                  </span>
                                )}
                              </div>

                              <span className="mono text-[10.5px] text-white/45">
                                {new Date(log.timestamp).toLocaleString()}
                              </span>
                            </div>

                            {isExpanded && (
                              <div className="mt-2.5 ml-6 rounded-lg border border-white/10 bg-black/50 p-3 mono text-[11px] text-white/75 overflow-x-auto">
                                <pre className="whitespace-pre-wrap">
                                  {JSON.stringify(
                                    {
                                      id: log.id,
                                      timestamp: log.timestamp,
                                      category: log.category,
                                      status: log.status,
                                      brain: log.brain || null,
                                      source: log.source || null,
                                      factId: log.factId ?? log.recordId ?? null,
                                      details: log.details || {},
                                    },
                                    null,
                                    2
                                  )}
                                </pre>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Bottom Pagination Controls when multi-page */}
                  {auditTotalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.02] px-4 py-2.5 text-xs">
                      <span className="mono text-[11px] text-white/55">
                        Page {auditPage} of {auditTotalPages} ({auditTotalCount} total events)
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={auditPage <= 1}
                          onClick={() => setAuditPage(1)}
                          className="rounded border border-white/15 bg-white/[0.04] px-2 py-1 text-[11px] text-white/80 hover:bg-white/[0.1] disabled:opacity-35"
                        >
                          First
                        </button>
                        <button
                          type="button"
                          disabled={auditPage <= 1}
                          onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                          className="rounded border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/[0.1] disabled:opacity-35"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          disabled={auditPage >= auditTotalPages}
                          onClick={() =>
                            setAuditPage((p) => Math.min(auditTotalPages, p + 1))
                          }
                          className="rounded border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/[0.1] disabled:opacity-35"
                        >
                          Next
                        </button>
                        <button
                          type="button"
                          disabled={auditPage >= auditTotalPages}
                          onClick={() => setAuditPage(auditTotalPages)}
                          className="rounded border border-white/15 bg-white/[0.04] px-2 py-1 text-[11px] text-white/80 hover:bg-white/[0.1] disabled:opacity-35"
                        >
                          Last
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Slide-over Inspection & Correction Panel */}
          <FactPanel
            fact={selectedFact}
            selectedSource={selectedSource}
            currentBrain={currentBrain}
            allBrainFacts={allBrainFacts}
            connectionStatus={connectionStatus}
            onClose={() => {
              setSelectedFact(null);
              setSelectedSource(null);
            }}
            onSelectFact={(f) => {
              handleFactSelected(f);
            }}
            onSelectSource={(src) => {
              setSelectedFact(null);
              setSelectedSource(src);
            }}
            onSaveCorrection={handleSaveCorrection}
            onDeleteFact={handleDeleteFact}
            onUpdateTags={handleUpdateFactTags}
            onOpenAddFactForSource={(src) => {
              setAddFactDefaultSource(src);
              setIsAddFactOpen(true);
            }}
            onResyncSource={(src) => {
              if (src === 'claude' || src === 'gemini' || src === 'gpt') {
                handleOpenGuidedConfig(src === 'gpt' ? 'chatgpt' : src);
              } else {
                handleOpenCaptureHub('import');
              }
            }}
            onOpenSourceInTable={(src) => {
              setActiveSourceFilter(src);
              setViewMode('list');
            }}
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
        onClose={() => {
          setIsAddFactOpen(false);
          setAddFactDefaultSource(null);
        }}
        currentBrain={currentBrain}
        brains={brains}
        defaultSource={addFactDefaultSource}
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
