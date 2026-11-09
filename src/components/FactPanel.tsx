import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  Trash2,
  Plus,
  ArrowLeft,
  RefreshCw,
  Table2,
  FileText,
  FileCode2,
  FileSpreadsheet,
  Presentation,
  MessageSquare,
  FolderGit2,
  Link2,
  Sparkles,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Layers,
} from 'lucide-react';
import {
  Fact,
  AISource,
  FactFileType,
  SOURCE_PALETTE,
  getFactFileType,
  FILE_TYPE_CONFIG,
} from '../types/brain';
import { brainStore } from '../services/brainStorage';
import { parseTabularTextToSheet } from '../services/fileExtractor';

interface FactPanelProps {
  fact: Fact | null;
  selectedSource?: AISource | null;
  currentBrain?: string;
  allBrainFacts?: Fact[];
  connectionStatus?: { chatgpt: boolean; claude: boolean; gemini: boolean; backend: boolean };
  onClose: () => void;
  onSelectFact?: (fact: Fact | null) => void;
  onSelectSource?: (source: AISource | null) => void;
  onSaveCorrection: (id: number, newContent: string) => void;
  onDeleteFact: (id: number) => void;
  onUpdateTags?: (id: number, tags: string[]) => void;
  onOpenAddFactForSource?: (source: AISource) => void;
  onResyncSource?: (source: AISource) => void;
  onOpenSourceInTable?: (source: AISource) => void;
}

function formatRelativeTimestamp(isoString?: string | null): string {
  if (!isoString) return 'Unknown';
  const date = new Date(isoString);
  const ts = date.getTime();
  if (Number.isNaN(ts)) return isoString;
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatFullTimestamp(isoString?: string | null): string {
  if (!isoString) return 'Unknown';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export const FactPanel: React.FC<FactPanelProps> = ({
  fact,
  selectedSource = null,
  currentBrain = 'coding',
  allBrainFacts = [],
  connectionStatus,
  onClose,
  onSelectFact,
  onSelectSource,
  onSaveCorrection,
  onDeleteFact,
  onUpdateTags,
  onOpenAddFactForSource,
  onResyncSource,
  onOpenSourceInTable,
}) => {
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSavedToast, setIsSavedToast] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [viewerTab, setViewerTab] = useState<'format' | 'extracted' | 'normalized' | 'summary' | 'edit'>('format');
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [activePageIdx, setActivePageIdx] = useState(0);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);

  const lastFactIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (fact) {
      if (fact.id !== lastFactIdRef.current) {
        lastFactIdRef.current = fact.id;
        setContent(fact.content);
        setTags(fact.tags || []);
        setTagInput('');
        setIsSavedToast(false);
        setIsCopied(false);
        setIsConfirmingDelete(false);
        setViewerTab('format');
        setActiveSheetIdx(0);
        setActivePageIdx(0);
        setActiveSlideIdx(0);
      }
    } else {
      lastFactIdRef.current = null;
    }
  }, [fact]);

  const activeSourceKey: AISource | null = fact ? fact.source : selectedSource;

  const sourceFacts = useMemo(() => {
    if (!activeSourceKey) return [];
    return allBrainFacts
      .filter((f) => f.source === activeSourceKey)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [allBrainFacts, activeSourceKey]);

  const connectedSources = useMemo(() => {
    if (!activeSourceKey) return [];
    const present = Array.from(
      new Set(allBrainFacts.map((f) => f.source).filter((s) => s !== activeSourceKey))
    ) as AISource[];
    return present;
  }, [allBrainFacts, activeSourceKey]);

  // Compute deterministic workspace relationships for the active fact
  const workspaceEdges = useMemo(() => {
    return brainStore.computeWorkspaceRelationships(allBrainFacts);
  }, [allBrainFacts]);

  const factRelationships = useMemo(() => {
    if (!fact) return { provenance: [], semanticAndExplicit: [] };
    const nodeKey = `fact-${fact.id}`;
    const matching = workspaceEdges.filter((e) => e.fromId === nodeKey || e.toId === nodeKey);
    return {
      provenance: matching.filter((e) => e.type === 'source' || (e.type === 'explicit' && (e.toId.startsWith('source-') || e.fromId.startsWith('source-')))),
      semanticAndExplicit: matching.filter(
        (e) => e.type === 'semantic' || (e.type === 'explicit' && e.fromId.startsWith('fact-') && e.toId.startsWith('fact-'))
      ),
    };
  }, [fact, workspaceEdges]);

  if (!fact && !selectedSource) return null;

  const getFormatIcon = (ft: FactFileType) => {
    switch (ft) {
      case 'code':
        return <FileCode2 className="h-3 w-3 shrink-0" />;
      case 'xlsx':
        return <FileSpreadsheet className="h-3 w-3 shrink-0" />;
      case 'pptx':
        return <Presentation className="h-3 w-3 shrink-0" />;
      case 'chat':
        return <MessageSquare className="h-3 w-3 shrink-0" />;
      case 'img':
        return <ImageIcon className="h-3 w-3 shrink-0" />;
      default:
        return <FileText className="h-3 w-3 shrink-0" />;
    }
  };

  // ============================================================================
  // MODE A: SOURCE INSPECTOR (when a Source is selected and no individual Fact is active)
  // ============================================================================
  if (!fact && selectedSource) {
    const sourceMeta = SOURCE_PALETTE[selectedSource] || {
      name: selectedSource,
      color: '#ffffff',
      dotColor: '#ffffff',
    };

    const totalFactsInBrain = allBrainFacts.length;
    const sharePercent =
      totalFactsInBrain > 0 ? Math.round((sourceFacts.length / totalFactsInBrain) * 100) : 0;
    const formatCounts: Record<string, number> = {};
    sourceFacts.forEach((f) => {
      const ft = getFactFileType(f);
      formatCounts[ft] = (formatCounts[ft] || 0) + 1;
    });
    const distinctFormatsCount = Object.keys(formatCounts).length;
    const latestSourceUpdate = sourceFacts[0]?.updated_at;

    const isConfiguredInWizard =
      (selectedSource === 'claude' && connectionStatus?.claude) ||
      (selectedSource === 'gpt' && connectionStatus?.chatgpt) ||
      (selectedSource === 'gemini' && connectionStatus?.gemini);

    return (
      <aside
        aria-label="Source Inspector"
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-white/12 bg-[#060812]/95 shadow-2xl backdrop-blur-2xl transition-transform duration-200 ease-out"
      >
        {/* Top Inspector Bar */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <span className="mono text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
            Source Inspector
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/45 transition hover:bg-white/[0.06] hover:text-white"
            aria-label="Close inspector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Source Inspector Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 scrollbar-thin">
          {/* Source Identity & Connection State */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                style={{
                  backgroundColor: `${sourceMeta.color}18`,
                  borderColor: `${sourceMeta.color}45`,
                }}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ backgroundColor: sourceMeta.color }}
                />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-white truncate">
                  {sourceMeta.name}
                </h2>
                <div className="mono text-[11px] text-white/45 truncate">
                  {sourceFacts.length > 0
                    ? `source · updated ${formatRelativeTimestamp(latestSourceUpdate)}`
                    : 'source · no memories in this brain'}
                </div>
              </div>
            </div>

            <span
              className={`mono shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                isConfiguredInWizard || sourceFacts.length > 0
                  ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-300'
                  : 'border-white/12 bg-white/[0.04] text-white/50'
              }`}
            >
              {isConfiguredInWizard
                ? 'Synced'
                : sourceFacts.length > 0
                ? 'Active'
                : 'Idle'}
            </span>
          </div>

          {/* Genuine Source Metrics Row */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="mono text-[10px] uppercase tracking-wider text-white/40">
                Memories
              </div>
              <div className="mono mt-1 text-lg font-semibold tabular-nums text-white">
                {sourceFacts.length}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="mono text-[10px] uppercase tracking-wider text-white/40">
                Share
              </div>
              <div className="mono mt-1 text-lg font-semibold tabular-nums text-white">
                {sharePercent}%
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="mono text-[10px] uppercase tracking-wider text-white/40">
                Formats
              </div>
              <div className="mono mt-1 text-lg font-semibold tabular-nums text-white">
                {distinctFormatsCount}
              </div>
            </div>
          </div>

          {/* Format Breakdown Chips */}
          {distinctFormatsCount > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(formatCounts).map(([ft, cnt]) => {
                const meta = FILE_TYPE_CONFIG[ft as FactFileType] || FILE_TYPE_CONFIG.md;
                return (
                  <span
                    key={ft}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 mono text-[10px] text-white/75"
                  >
                    <span style={{ color: meta.color }}>{getFormatIcon(ft as FactFileType)}</span>
                    <span>{meta.label}:</span>
                    <strong className="text-white">{cnt}</strong>
                  </span>
                );
              })}
            </div>
          )}

          {/* Captured Facts List */}
          <div className="border-t border-white/10 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-white/45">
                Captured Memories ({sourceFacts.length})
              </span>
              {onOpenAddFactForSource && (
                <button
                  type="button"
                  onClick={() => onOpenAddFactForSource(selectedSource)}
                  className="mono text-[11px] font-medium text-white/70 transition hover:text-white"
                >
                  + Add
                </button>
              )}
            </div>

            {sourceFacts.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center">
                <p className="text-xs text-white/60">
                  No memories stored from {sourceMeta.name} in "{currentBrain}" yet.
                </p>
                {onOpenAddFactForSource && (
                  <button
                    type="button"
                    onClick={() => onOpenAddFactForSource(selectedSource)}
                    className="mt-2.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white/90"
                  >
                    + Store fact for {sourceMeta.name}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
                {sourceFacts.map((item) => {
                  const ft = getFactFileType(item);
                  const ftMeta = FILE_TYPE_CONFIG[ft];
                  const title = item.documentTitle || item.fileName || `Node #${item.id}`;
                  const cleanPreview = item.content
                    .replace(/^#\s+[^\n]+\n*/m, '')
                    .replace(/####\s*(?:User|Assistant)\s*/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectFact && onSelectFact(item)}
                      className="group w-full rounded-xl border border-white/10 bg-white/[0.025] p-3 text-left transition hover:border-white/25 hover:bg-white/[0.05]"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white truncate">
                          {title}
                        </span>
                        <span className="mono text-[10px] text-white/45 shrink-0">
                          #{item.id}
                        </span>
                      </div>
                      {item.filePath && (
                        <div className="mb-1 mono text-[10px] text-white/45 truncate">
                          {item.filePath}
                        </div>
                      )}
                      <p className="text-[11px] leading-relaxed text-white/75 line-clamp-2 group-hover:text-white/90">
                        {cleanPreview || item.content}
                      </p>

                      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-white/45">
                        <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 mono text-[9.5px] text-white/70">
                          <span style={{ color: ftMeta.color }}>{getFormatIcon(ft)}</span>
                          <span>{ftMeta.label}</span>
                        </span>
                        <span className="mono text-[10px] tabular-nums text-white/40">
                          {formatRelativeTimestamp(item.updated_at)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Connected Sources Chips */}
          {connectedSources.length > 0 && (
            <div className="border-t border-white/10 pt-4 space-y-2.5">
              <span className="mono block text-[10.5px] font-medium uppercase tracking-[0.14em] text-white/45">
                Connected Sources in {currentBrain}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {connectedSources.map((srcKey) => {
                  const meta = SOURCE_PALETTE[srcKey];
                  const cnt = allBrainFacts.filter((f) => f.source === srcKey).length;
                  return (
                    <button
                      key={srcKey}
                      type="button"
                      onClick={() => onSelectSource && onSelectSource(srcKey)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-1 text-xs text-white/75 transition hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
                      title={`Inspect ${meta.name} (${cnt} facts)`}
                    >
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span>{meta.name}</span>
                      <span className="mono text-[10px] text-white/40">{cnt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Source Actions Footer */}
        <div className="shrink-0 border-t border-white/10 p-4 grid grid-cols-2 gap-2.5 bg-[#05070f]">
          <button
            type="button"
            onClick={() => onResyncSource && onResyncSource(selectedSource)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 text-xs font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Re-sync</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenSourceInTable && onOpenSourceInTable(selectedSource)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-black transition hover:bg-white/90"
          >
            <Table2 className="h-3.5 w-3.5" />
            <span>Open in table</span>
          </button>
        </div>
      </aside>
    );
  }

  // ============================================================================
  // MODE B: INDIVIDUAL MEMORY & FORMAT-AWARE DOCUMENT INSPECTOR
  // ============================================================================
  if (!fact) return null;

  const sourceMeta = SOURCE_PALETTE[fact.source] || {
    name: fact.source,
    color: '#ffffff',
    dotColor: '#ffffff',
  };

  const fileType = getFactFileType(fact);
  const fileMeta = FILE_TYPE_CONFIG[fileType] || FILE_TYPE_CONFIG.md;

  const handleSave = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSaveCorrection(fact.id, trimmed);
    if (onUpdateTags) {
      onUpdateTags(fact.id, tags);
    } else {
      brainStore.updateFactTags(fact.id, tags);
    }
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 2400);
  };

  const handleDelete = () => {
    onDeleteFact(fact.id);
    onClose();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleAddTag = (tagToAdd?: string) => {
    const raw = tagToAdd || tagInput;
    const clean = raw.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-');
    if (!clean) return;
    if (tags.includes(clean)) {
      setTagInput('');
      return;
    }
    const updated = [...tags, clean];
    setTags(updated);
    setTagInput('');
    if (onUpdateTags) {
      onUpdateTags(fact.id, updated);
    } else {
      brainStore.updateFactTags(fact.id, updated);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = tags.filter((t) => t !== tagToRemove);
    setTags(updated);
    if (onUpdateTags) {
      onUpdateTags(fact.id, updated);
    } else {
      brainStore.updateFactTags(fact.id, updated);
    }
  };

  const availableSuggestions = brainStore
    .getAllTags(fact.brain)
    .filter((t) => !tags.includes(t))
    .slice(0, 5);

  // Derive format-aware structured data (either stored or parsed live from content)
  const renderFormatAwareViewer = () => {
    const sd = fact.structuredData;

    // 1. SPREADSHEET / CSV TABLE VIEWER
    if (
      fileType === 'xlsx' ||
      (fact.fileName && /\.(csv|tsv|xlsx|xls)$/i.test(fact.fileName)) ||
      sd?.kind === 'spreadsheet'
    ) {
      const sheets =
        sd?.sheets && sd.sheets.length > 0
          ? sd.sheets
          : [parseTabularTextToSheet(content, fact.fileName || 'Sheet 1')];
      const currentSheet = sheets[Math.min(activeSheetIdx, sheets.length - 1)] || sheets[0];

      return (
        <div className="space-y-2.5">
          {sheets.length > 1 && (
            <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
              {sheets.map((sh, idx) => (
                <button
                  key={sh.name}
                  type="button"
                  onClick={() => setActiveSheetIdx(idx)}
                  className={`mono rounded px-2 py-0.5 text-[10px] transition ${
                    idx === activeSheetIdx
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-white/[0.04] text-white/55 hover:text-white'
                  }`}
                >
                  {sh.name} ({sh.totalRows})
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-[10.5px] mono text-white/50">
            <span>
              Sheet: <strong className="text-white/85">{currentSheet.name}</strong>
            </span>
            <span>
              {currentSheet.totalRows} rows × {(currentSheet.columns || currentSheet.headers || []).length} cols
            </span>
          </div>

          <div className="max-h-[320px] overflow-auto rounded-lg border border-white/15 bg-black/50 scrollbar-thin">
            <table className="w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 bg-[#0d1326] text-white/80 mono text-[10px]">
                <tr>
                  <th className="border-b border-r border-white/10 px-2 py-1.5 text-white/40">#</th>
                  {(currentSheet.columns || currentSheet.headers || []).map((col: string, cIdx: number) => (
                    <th key={cIdx} className="border-b border-r border-white/10 px-2.5 py-1.5 font-semibold">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] font-mono text-[10.5px]">
                {currentSheet.rows.slice(0, 60).map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-white/[0.03]">
                    <td className="border-r border-white/10 px-2 py-1 text-white/35">{rIdx + 1}</td>
                    {(currentSheet.columns || currentSheet.headers || []).map((_: string, cIdx: number) => (
                      <td key={cIdx} className="border-r border-white/[0.05] px-2.5 py-1 text-white/85">
                        {row[cIdx] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // 2. PDF PAGE-BY-PAGE VIEWER
    if (fileType === 'pdf' || sd?.kind === 'pdf') {
      const pages =
        sd?.pages && sd.pages.length > 0
          ? sd.pages
          : content
              .split(/(?=\[Page \d+\])/g)
              .filter((p) => p.trim())
              .map((p, idx) => ({
                pageNumber: idx + 1,
                text: p.replace(/^\[Page \d+\]\s*/i, '').trim(),
              }));
      const currentPage = pages[Math.min(activePageIdx, Math.max(0, pages.length - 1))] || {
        pageNumber: 1,
        text: content,
      };
      const ocrStatus = sd?.ocrStatus || 'not_needed';

      return (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="mono text-white/80 font-medium">
                Page {currentPage.pageNumber} of {pages.length}
              </span>
              <span className="mono rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[9.5px] text-white/55">
                OCR: {ocrStatus === 'not_needed' ? 'Native Text Layer' : 'Not Run'}
              </span>
            </div>
            {pages.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={activePageIdx <= 0}
                  onClick={() => setActivePageIdx((p) => Math.max(0, p - 1))}
                  className="rounded border border-white/10 p-1 text-white/70 hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  disabled={activePageIdx >= pages.length - 1}
                  onClick={() => setActivePageIdx((p) => Math.min(pages.length - 1, p + 1))}
                  className="rounded border border-white/10 p-1 text-white/70 hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          <div className="max-h-[320px] overflow-y-auto rounded-lg border border-white/15 bg-black/45 p-3.5 text-xs leading-relaxed text-white/90 whitespace-pre-wrap scrollbar-thin">
            {currentPage.text}
          </div>
        </div>
      );
    }

    // 3. PRESENTATION (PPTX) SLIDE DECK VIEWER
    if (fileType === 'pptx' || sd?.kind === 'presentation') {
      const slides =
        sd?.slides && sd.slides.length > 0
          ? sd.slides
          : content
              .split(/(?=\[Slide \d+\])/g)
              .filter((s) => s.trim())
              .map((s, idx) => {
                const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
                return {
                  slideNumber: idx + 1,
                  title: lines[0] || `Slide ${idx + 1}`,
                  bullets: lines.slice(1),
                };
              });
      const currentSlide = slides[Math.min(activeSlideIdx, Math.max(0, slides.length - 1))] || {
        slideNumber: 1,
        title: fact.documentTitle || 'Slide 1',
        bullets: [content],
      };

      return (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px]">
            <span className="mono text-amber-300 font-medium">
              Slide {currentSlide.slideNumber} of {slides.length}
            </span>
            {slides.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={activeSlideIdx <= 0}
                  onClick={() => setActiveSlideIdx((s) => Math.max(0, s - 1))}
                  className="rounded border border-white/10 p-1 text-white/70 hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  disabled={activeSlideIdx >= slides.length - 1}
                  onClick={() => setActiveSlideIdx((s) => Math.min(slides.length - 1, s + 1))}
                  className="rounded border border-white/10 p-1 text-white/70 hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-amber-500/25 bg-[#0c1020] p-4 space-y-2.5">
            <h4 className="text-xs font-semibold text-white">{currentSlide.title}</h4>
            <ul className="list-disc pl-4 space-y-1.5 text-xs text-white/85">
              {currentSlide.bullets.map((b, idx) => (
                <li key={idx} className="leading-relaxed">
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    }

    // 4. IMAGE VIEWER
    if (fileType === 'img' || sd?.kind === 'image') {
      return (
        <div className="space-y-3 rounded-xl border border-white/15 bg-black/45 p-3.5">
          {sd?.imagePreviewDataUrl && (
            <div className="overflow-hidden rounded-lg border border-white/10 bg-black flex items-center justify-center max-h-[220px]">
              <img
                src={sd.imagePreviewDataUrl}
                alt={fact.fileName || 'Memory asset'}
                className="max-h-[210px] w-auto object-contain"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-[11px] mono">
            <div className="rounded border border-white/10 bg-white/[0.03] p-2">
              <span className="text-white/45 block text-[9.5px]">DIMENSIONS</span>
              <span className="text-white/90">
                {sd?.imageDimensions
                  ? `${sd.imageDimensions.width} × ${sd.imageDimensions.height} px`
                  : 'Metadata indexed'}
              </span>
            </div>
            <div className="rounded border border-white/10 bg-white/[0.03] p-2">
              <span className="text-white/45 block text-[9.5px]">OCR STATUS</span>
              <span className="text-amber-300">
                {sd?.ocrStatus === 'completed' ? 'Completed' : 'Not Run (Honest Mode)'}
              </span>
            </div>
          </div>
          <div className="text-xs text-white/80 whitespace-pre-wrap">{content}</div>
        </div>
      );
    }

    // 5. SOURCE CODE VIEWER (Line-numbered)
    if (fileType === 'code' || sd?.kind === 'code') {
      const codeLines = content.split('\n');
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-t-lg border border-white/15 bg-[#0c1222] px-3 py-1.5 mono text-[10.5px] text-white/65">
            <span>{fact.fileName || 'source_code'}</span>
            <span>
              {sd?.language || fileType.toUpperCase()} · {codeLines.length} lines
            </span>
          </div>
          <div className="max-h-[340px] overflow-auto rounded-b-lg border border-t-0 border-white/15 bg-black/60 p-3 font-mono text-[11px] leading-relaxed scrollbar-thin">
            {codeLines.map((line, lIdx) => (
              <div key={lIdx} className="flex gap-3">
                <span className="w-7 shrink-0 select-none text-right text-white/30">
                  {lIdx + 1}
                </span>
                <span className="whitespace-pre-wrap break-all text-emerald-100/90">
                  {line || ' '}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 6. CHAT / MARKDOWN / DOCX STRUCTURED READER
    if (content.includes('#### User') || content.includes('#### Assistant')) {
      return (
        <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1 scrollbar-thin">
          {content
            .split(/(?=#### (?:User|Assistant))/g)
            .filter(Boolean)
            .map((turn, tIdx) => {
              const isUser = turn.startsWith('#### User');
              const isAssistant = turn.startsWith('#### Assistant');
              const cleanBody = turn.replace(/^#### (?:User|Assistant)\s*/, '').trim();
              return (
                <div
                  key={tIdx}
                  className={`rounded-lg p-3 text-xs leading-relaxed border ${
                    isUser
                      ? 'bg-white/[0.03] border-white/12 text-white/95'
                      : isAssistant
                      ? 'bg-[#121624]/80 border-white/10 text-white/85'
                      : 'bg-black/40 border-white/10 text-white/80'
                  }`}
                >
                  <div className="mono text-[10px] font-semibold uppercase text-white/50 mb-1">
                    {isUser ? 'User' : isAssistant ? 'Assistant' : 'Note'}
                  </div>
                  <div className="whitespace-pre-wrap">{cleanBody}</div>
                </div>
              );
            })}
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-white/15 bg-black/45 p-3.5 text-xs text-white/90 leading-relaxed max-h-[340px] overflow-y-auto whitespace-pre-wrap scrollbar-thin">
        {content}
      </div>
    );
  };

  const sections = brainStore.getSemanticSections(fact);

  return (
    <aside
      aria-label="Node Inspector"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[440px] flex-col border-l border-white/12 bg-[#060812]/95 shadow-2xl backdrop-blur-2xl transition-transform duration-200 ease-out"
    >
      {/* Inspector Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5">
        <div className="flex items-center gap-2 min-w-0">
          {onSelectSource && (
            <button
              type="button"
              onClick={() => {
                if (onSelectFact) onSelectFact(null);
                onSelectSource(fact.source);
              }}
              className="mr-1 flex h-6 w-6 items-center justify-center rounded-md border border-white/12 bg-white/[0.03] text-white/65 transition hover:border-white/25 hover:text-white"
              title={`Inspect ${sourceMeta.name} source`}
              aria-label={`Back to ${sourceMeta.name}`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="mono text-xs font-semibold tabular-nums text-white">
            Node #{fact.id}
          </span>
          <span className="text-white/25" aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => {
              if (onSelectSource) {
                if (onSelectFact) onSelectFact(null);
                onSelectSource(fact.source);
              }
            }}
            className="text-xs font-semibold hover:underline"
            style={{ color: sourceMeta.color }}
          >
            {sourceMeta.name}
          </button>
          <span className="text-white/25" aria-hidden="true">·</span>
          <span className="mono text-[11px] text-white/65">
            {fileMeta.badge}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/45 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Close inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable Inspector Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 scrollbar-thin">
        {/* Title & Primary Badges */}
        <div>
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {fact.fixtureId && (
              <span className="mono rounded border border-indigo-400/35 bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-200">
                {fact.fixtureId}
              </span>
            )}
            {fact.topicKey && (
              <span className="mono rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                topic: {fact.topicKey}
              </span>
            )}
            {fact.extractionStatus && (
              <span
                className={`mono rounded border px-1.5 py-0.5 text-[10px] ${
                  fact.extractionStatus === 'ok'
                    ? 'border-white/10 bg-white/[0.04] text-white/55'
                    : 'border-amber-500/35 bg-amber-500/10 text-amber-300'
                }`}
              >
                extract: {fact.extractionStatus}
              </span>
            )}
          </div>

          <h2 className="text-base font-semibold leading-snug text-white">
            {fact.documentTitle || fact.fileName || `Memory Node #${fact.id}`}
          </h2>
        </div>

        {/* Section 5.B: Provenance & Timestamp Metadata Grid */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-2 text-[11px]">
          <div className="flex items-center gap-1.5 mono text-[10px] font-semibold uppercase tracking-wider text-white/50">
            <FolderGit2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>Provenance & Chronology</span>
          </div>

          <dl className="grid grid-cols-1 gap-1.5 pt-1">
            {fact.filePath && (
              <div className="flex items-start justify-between gap-2 border-b border-white/[0.05] pb-1">
                <dt className="text-white/45 shrink-0">File Path</dt>
                <dd className="mono text-right text-white/90 break-all">{fact.filePath}</dd>
              </div>
            )}
            {fact.sourceFolder && (
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] pb-1">
                <dt className="text-white/45">Source Folder</dt>
                <dd className="mono text-emerald-300">{fact.sourceFolder}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] pb-1">
              <dt className="text-white/45">Original Doc Date</dt>
              <dd className="mono text-white/85">
                {fact.originalCreatedAt ? formatFullTimestamp(fact.originalCreatedAt) : 'Unknown'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] pb-1">
              <dt className="text-white/45">Imported / Created</dt>
              <dd className="mono text-white/80">
                {formatFullTimestamp(fact.importedAt || fact.created_at)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] pb-1">
              <dt className="text-white/45">Last Modified</dt>
              <dd className="mono text-white/80">{formatFullTimestamp(fact.updated_at)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-white/45">Size & Checksum</dt>
              <dd className="mono text-white/75">
                {formatBytes(fact.fileSizeBytes || fact.content.length)} ·{' '}
                {fact.checksum || `${fact.content.length} chars`}
              </dd>
            </div>
          </dl>
        </div>

        {/* Section 5.C: Format-Aware Document & Content Viewer Tabs */}
        <div className="border-t border-white/10 pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap rounded-lg border border-white/12 bg-black/50 p-0.5 text-[10.5px]">
              {(
                [
                  { id: 'format', label: 'Format Viewer' },
                  { id: 'extracted', label: 'Extracted' },
                  { id: 'normalized', label: 'Normalized' },
                  { id: 'summary', label: 'Summary' },
                  { id: 'edit', label: 'Edit' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setViewerTab(tab.id)}
                  className={`rounded-md px-2 py-1 transition ${
                    viewerTab === tab.id
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-white/50 transition hover:text-white"
            >
              {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{isCopied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {viewerTab === 'format' && renderFormatAwareViewer()}

          {viewerTab === 'extracted' && (
            <div className="rounded-lg border border-white/15 bg-black/50 p-3.5 font-mono text-[11px] text-white/85 leading-relaxed max-h-[340px] overflow-y-auto whitespace-pre-wrap scrollbar-thin">
              {content}
            </div>
          )}

          {viewerTab === 'normalized' && (
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 scrollbar-thin">
              <div className="mono text-[10px] text-white/45">
                {sections.length} semantic section{sections.length === 1 ? '' : 's'} indexed for recall
              </div>
              {sections.map((sec, idx) => (
                <div
                  key={sec.id || idx}
                  className="rounded-lg border border-white/10 bg-white/[0.025] p-3 space-y-1"
                >
                  <div className="flex items-center justify-between mono text-[10px] text-emerald-300">
                    <span>{sec.title || `Section ${idx + 1}`}</span>
                    <span className="text-white/40">{sec.kind}</span>
                  </div>
                  <p className="text-xs text-white/85 whitespace-pre-wrap leading-relaxed">
                    {sec.content}
                  </p>
                </div>
              ))}
            </div>
          )}

          {viewerTab === 'summary' && (
            <div className="rounded-xl border border-white/12 bg-white/[0.03] p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center gap-1.5 text-emerald-300 font-medium">
                <Layers className="h-3.5 w-3.5" />
                <span>Document Summary & Key Metadata</span>
              </div>
              <p className="text-white/85 leading-relaxed">
                {fact.structuredData?.summary ||
                  content
                    .replace(/^#+\s+[^\n]+\n*/gm, '')
                    .trim()
                    .slice(0, 360)}
              </p>
              {fact.extractionWarnings && fact.extractionWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
                  <strong>Extraction Warnings:</strong> {fact.extractionWarnings.join(' · ')}
                </div>
              )}
            </div>
          )}

          {viewerTab === 'edit' && (
            <div className="space-y-2.5">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={10}
                placeholder="Enter durable fact content..."
                className="w-full rounded-lg border border-white/15 bg-black/50 p-3 text-xs text-white leading-relaxed outline-none transition placeholder:text-white/30 focus:border-white/40 font-mono"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={!content.trim()}
                className={`w-full rounded-lg py-2 text-xs font-semibold transition ${
                  isSavedToast
                    ? 'bg-emerald-400 text-black'
                    : 'bg-white text-black hover:bg-white/90 disabled:opacity-40'
                }`}
              >
                {isSavedToast ? 'Saved Correction' : 'Save Correction'}
              </button>
            </div>
          )}
        </div>

        {/* Section 5.B: Provenance vs Semantic / Explicit Relationships */}
        <div className="border-t border-white/10 pt-4 space-y-3">
          <div className="flex items-center gap-1.5 mono text-[10.5px] font-semibold uppercase tracking-wider text-white/55">
            <Link2 className="h-3.5 w-3.5 text-[#9db4ff]" />
            <span>Provenance & Graph Relationships</span>
          </div>

          {/* Provenance Links */}
          <div className="space-y-1.5">
            <div className="mono text-[10px] text-white/40 uppercase">
              Provenance Attribution ({factRelationships.provenance.length})
            </div>
            {factRelationships.provenance.map((edge) => (
              <div
                key={edge.id}
                className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-[11px] space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{edge.label}</span>
                  <span className="mono rounded bg-white/10 px-1.5 py-0.5 text-[9.5px] text-white/70 uppercase">
                    {edge.type}
                  </span>
                </div>
                <p className="text-white/65 leading-relaxed">{edge.explanation}</p>
              </div>
            ))}
          </div>

          {/* Semantic & Explicit Peer Node Links */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-1.5 mono text-[10px] text-white/40 uppercase">
              <Sparkles className="h-3 w-3 text-amber-300" />
              <span>
                Semantic & Explicit Node Links ({factRelationships.semanticAndExplicit.length})
              </span>
            </div>
            {factRelationships.semanticAndExplicit.length === 0 ? (
              <p className="text-[11px] text-white/40">
                No secondary semantic or explicit peer links above threshold.
              </p>
            ) : (
              factRelationships.semanticAndExplicit.map((edge) => {
                const otherNodeIdStr =
                  edge.fromId === `fact-${fact.id}` ? edge.toId : edge.fromId;
                const otherFactId = Number(otherNodeIdStr.replace('fact-', ''));
                const otherFact = allBrainFacts.find((f) => f.id === otherFactId);

                return (
                  <button
                    key={edge.id}
                    type="button"
                    onClick={() => otherFact && onSelectFact && onSelectFact(otherFact)}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.025] p-2.5 text-left text-[11px] transition hover:border-white/25 hover:bg-white/[0.05] space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white truncate">
                        {otherFact
                          ? `#${otherFact.id} · ${otherFact.documentTitle || otherFact.fileName || otherFact.source}`
                          : edge.label}
                      </span>
                      <span
                        className={`mono shrink-0 rounded px-1.5 py-0.5 text-[9.5px] uppercase ${
                          edge.type === 'explicit'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/30'
                        }`}
                      >
                        {edge.type} · {Math.round(edge.score * 100)}%
                      </span>
                    </div>
                    <p className="text-white/65 leading-relaxed">{edge.explanation}</p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Tags Section */}
        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-white/70">Tags</span>
            <span className="mono text-[11px] tabular-nums text-white/40">
              {tags.length}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
            {tags.length === 0 ? (
              <span className="text-white/35">No tags assigned</span>
            ) : (
              tags.map((tag, idx) => (
                <React.Fragment key={tag}>
                  {idx > 0 && <span className="text-white/25" aria-hidden="true">·</span>}
                  <span className="inline-flex items-center gap-1 mono text-[11px] text-[#9db4ff]">
                    <span>#{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-white/35 hover:text-rose-400 transition"
                      title={`Remove #${tag}`}
                    >
                      ×
                    </button>
                  </span>
                </React.Fragment>
              ))
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddTag();
            }}
            className="mt-3 flex items-center gap-1.5"
          >
            <input
              type="text"
              placeholder="Add tag (e.g. architecture, rag)..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              className="mono flex-1 rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-white/40"
            />
            <button
              type="submit"
              disabled={!tagInput.trim()}
              className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white/85 transition hover:bg-white/[0.12] disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add</span>
            </button>
          </form>

          {availableSuggestions.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-white/45">
              <span>Suggested:</span>
              {availableSuggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => handleAddTag(sug)}
                  className="mono text-white/60 hover:text-white transition"
                >
                  +{sug}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Delete Node Section */}
        <div className="border-t border-white/10 pt-4">
          {isConfirmingDelete ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 space-y-2.5">
              <p className="text-xs text-rose-200">
                Permanently delete Node #{fact.id} from "{fact.brain}"?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex-1 rounded-lg bg-rose-600 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 transition"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(false)}
                  className="rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white/70 hover:text-white transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.05] py-2 text-xs text-rose-300/90 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Node</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
