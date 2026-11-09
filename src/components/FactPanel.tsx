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

function formatRelativeTimestamp(isoString?: string): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  const ts = date.getTime();
  if (Number.isNaN(ts)) return '—';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  const [viewMode, setViewMode] = useState<'reader' | 'edit'>('reader');

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
        setViewMode('reader');
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
    const distinctFormatsCount = new Set(sourceFacts.map((f) => getFactFileType(f))).size;
    const latestSourceUpdate = sourceFacts[0]?.updated_at;

    const isConfiguredInWizard =
      (selectedSource === 'claude' && connectionStatus?.claude) ||
      (selectedSource === 'gpt' && connectionStatus?.chatgpt) ||
      (selectedSource === 'gemini' && connectionStatus?.gemini);

    return (
      <aside
        aria-label="Source Inspector"
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[380px] flex-col border-l border-white/12 bg-[#060812]/95 shadow-2xl backdrop-blur-2xl transition-transform duration-200 ease-out"
      >
        {/* Top Inspector Bar */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <span className="mono text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
            Inspector
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
          {/* Source Identity & Real Connection State */}
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
                Facts
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

          {/* Captured Facts List */}
          <div className="border-t border-white/10 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-white/45">
                Captured Facts
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
              <div className="space-y-2.5">
                {sourceFacts.map((item) => {
                  const ft = getFactFileType(item);
                  const ftMeta = FILE_TYPE_CONFIG[ft];
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
                      className="group w-full rounded-xl border border-white/10 bg-white/[0.025] p-3.5 text-left transition hover:border-white/25 hover:bg-white/[0.05]"
                    >
                      {item.documentTitle && (
                        <div className="mb-1 text-xs font-semibold text-white group-hover:text-white truncate">
                          {item.documentTitle}
                        </div>
                      )}
                      <p className="text-xs leading-relaxed text-white/85 line-clamp-2 group-hover:text-white">
                        {cleanPreview || item.content}
                      </p>

                      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-white/45">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 mono text-[10px] text-white/70">
                            <span style={{ color: ftMeta.color }}>{getFormatIcon(ft)}</span>
                            <span>{ftMeta.label}</span>
                          </span>
                          <span className="mono text-[10.5px] tabular-nums text-white/40 truncate">
                            {formatRelativeTimestamp(item.updated_at)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className="h-1 w-6 rounded-full"
                            style={{ backgroundColor: sourceMeta.color }}
                          />
                          <span className="mono text-[10.5px] tabular-nums text-white/50">
                            #{item.id}
                          </span>
                        </div>
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
                Connected To
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
  // MODE B: FACT NODE INSPECTOR (when a specific Fact is selected)
  // ============================================================================
  if (!fact) return null;

  const sourceMeta = SOURCE_PALETTE[fact.source] || {
    name: fact.source,
    color: '#ffffff',
    dotColor: '#ffffff',
  };

  const fileType = getFactFileType(fact);
  const fileMeta = FILE_TYPE_CONFIG[fileType];

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

  const formattedDate = new Date(fact.updated_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const siblingSourceFacts = sourceFacts.filter((f) => f.id !== fact.id).slice(0, 3);

  return (
    <aside
      aria-label="Node Inspector"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[380px] flex-col border-l border-white/12 bg-[#060812]/95 shadow-2xl backdrop-blur-2xl transition-transform duration-200 ease-out"
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
          <span className="mono text-[11px] text-white/55">
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
        {/* Clean Unboxed Metadata Line */}
        <div>
          <h2 className="text-base font-semibold leading-snug text-white">
            {fact.documentTitle || fact.fileName || `Memory Node #${fact.id}`}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/50">
            <span>
              Brain: <span className="text-white/85 capitalize">{fact.brain}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="mono text-[11px] tabular-nums">{formattedDate}</span>
            {fact.fileName && (
              <>
                <span aria-hidden="true">·</span>
                <span className="mono text-[11px] text-white/75 truncate max-w-[180px]" title={fact.fileName}>
                  {fact.fileName}
                </span>
              </>
            )}
          </div>

          {(fact.isUnifiedContextNode || fact.parentId) && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-amber-300/90">
              {fact.isUnifiedContextNode && (
                <span>
                  Unified Context Node
                  {fact.semanticSectionCount ? ` · ${fact.semanticSectionCount} sections` : ''}
                </span>
              )}
              {fact.parentId && (
                <span>Child branch of Node #{fact.parentId}</span>
              )}
            </div>
          )}
        </div>

        {/* Incremental Merge History */}
        {fact.mergeHistory && fact.mergeHistory.length > 0 && (
          <div className="border-t border-white/10 pt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-white/55">
              <span className="font-medium text-white/80">Update History</span>
              <span className="mono text-[11px] tabular-nums">
                {fact.mergeHistory.length} {fact.mergeHistory.length === 1 ? 'event' : 'events'}
              </span>
            </div>
            <div className="space-y-1.5">
              {fact.mergeHistory.map((hist, hIdx) => (
                <div
                  key={hIdx}
                  className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px] text-white/45">
                    <span className="capitalize text-emerald-400 font-medium">{hist.action}</span>
                    <span className="mono tabular-nums">
                      {new Date(hist.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-white/80 leading-relaxed">{hist.summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Memory Content Editor / Reader */}
        <div className="border-t border-white/10 pt-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-white/70">Memory Content</span>
              {content.length > 260 && (
                <div className="flex rounded-md border border-white/12 bg-black/40 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setViewMode('reader')}
                    className={`px-2 py-0.5 rounded transition ${
                      viewMode === 'reader'
                        ? 'bg-white/15 text-white font-medium'
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    Formatted
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('edit')}
                    className={`px-2 py-0.5 rounded transition ${
                      viewMode === 'edit'
                        ? 'bg-white/15 text-white font-medium'
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    Edit
                  </button>
                </div>
              )}
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

          {viewMode === 'reader' && (content.includes('#### User') || content.includes('#### Assistant')) ? (
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1 scrollbar-thin">
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
          ) : viewMode === 'reader' && content.length > 400 ? (
            <div className="rounded-lg border border-white/15 bg-black/40 p-3.5 text-xs text-white/90 leading-relaxed max-h-[360px] overflow-y-auto whitespace-pre-wrap scrollbar-thin">
              {content}
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={Math.min(12, Math.max(5, Math.ceil(content.length / 50)))}
              placeholder="Enter durable fact content..."
              className="w-full rounded-lg border border-white/15 bg-black/50 p-3 text-xs text-white leading-relaxed outline-none transition placeholder:text-white/30 focus:border-white/40 font-mono"
            />
          )}

          {(viewMode === 'edit' || (!content.includes('#### User') && content.length <= 400)) && (
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
          )}
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

        {/* Other Facts from this Source & Connected Sources */}
        {(siblingSourceFacts.length > 0 || connectedSources.length > 0) && (
          <div className="border-t border-white/10 pt-4 space-y-3">
            {siblingSourceFacts.length > 0 && (
              <div className="space-y-1.5">
                <span className="mono block text-[10.5px] font-medium uppercase tracking-[0.14em] text-white/45">
                  More from {sourceMeta.name}
                </span>
                <div className="space-y-1.5">
                  {siblingSourceFacts.map((sib) => (
                    <button
                      key={sib.id}
                      type="button"
                      onClick={() => onSelectFact && onSelectFact(sib)}
                      className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-xs text-white/75 transition hover:border-white/25 hover:text-white"
                    >
                      <div className="line-clamp-1">{sib.content}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {connectedSources.length > 0 && (
              <div className="space-y-1.5">
                <span className="mono block text-[10.5px] font-medium uppercase tracking-[0.14em] text-white/45">
                  Connected Sources
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {connectedSources.map((srcKey) => {
                    const meta = SOURCE_PALETTE[srcKey];
                    return (
                      <button
                        key={srcKey}
                        type="button"
                        onClick={() => {
                          if (onSelectFact) onSelectFact(null);
                          if (onSelectSource) onSelectSource(srcKey);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-1 text-xs text-white/75 transition hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
                      >
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span>{meta.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

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
