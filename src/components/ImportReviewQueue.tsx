import React, { useState, useMemo } from 'react';
import {
  Eye,
  EyeOff,
  Trash2,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Loader2,
  GitMerge,
  Replace,
  SkipForward,
  Check,
  HelpCircle,
  Sparkles,
  FileText,
} from 'lucide-react';
import {
  AISource,
  DuplicateDetectionState,
  ExistingFileNodeCheck,
  SOURCE_PALETTE,
} from '../types/brain';

export type ReviewResolutionAction = 'create' | 'merge' | 'replace' | 'skip';

export type ReviewItemStatus =
  | 'extracting'
  | 'ready'
  | 'duplicate_identical'
  | 'duplicate_diff'
  | 'processing'
  | 'imported'
  | 'skipped'
  | 'error';

export interface ImportReviewItem {
  id: string;
  title: string;
  fileName: string;
  archiveParent?: string;
  extension: string;
  sizeBytes: number;
  text: string;
  source: AISource;
  destinationBrain: string;
  itemCount: number;
  itemUnitLabel: string;
  status: ReviewItemStatus;
  statusMessage?: string;
  errorMessage?: string;
  lastAttemptedAction?: 'create' | 'merge' | 'replace';
  duplicateState: DuplicateDetectionState;
  nodeCheck?: ExistingFileNodeCheck;
  resolution: ReviewResolutionAction;
  tags: string[];
}

export interface ImportReviewQueueProps {
  items: ImportReviewItem[];
  destinations: string[];
  sources?: AISource[];
  isBatchProcessing?: boolean;
  onMerge: (item: ImportReviewItem) => void | Promise<void>;
  onSkip: (item: ImportReviewItem) => void | Promise<void>;
  onReplace: (item: ImportReviewItem) => void | Promise<void>;
  onRetry: (item: ImportReviewItem) => void | Promise<void>;
  onImportNew?: (item: ImportReviewItem) => void | Promise<void>;
  onUpdateItem?: (
    id: string,
    patch: Partial<
      Pick<
        ImportReviewItem,
        'title' | 'source' | 'destinationBrain' | 'resolution' | 'tags'
      >
    >
  ) => void;
  onRemoveItem?: (id: string) => void;
  onClearQueue?: () => void;
}

const DUPLICATE_BADGE_META: Record<
  DuplicateDetectionState,
  {
    label: string;
    className: string;
    dotColor: string;
  }
> = {
  new: {
    label: 'New',
    className:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    dotColor: '#34d399',
  },
  possible_duplicate: {
    label: 'Possible duplicate',
    className:
      'border-amber-500/35 bg-amber-500/12 text-amber-200',
    dotColor: '#fbbf24',
  },
  exact_duplicate: {
    label: 'Exact duplicate',
    className:
      'border-orange-500/35 bg-orange-500/12 text-orange-200',
    dotColor: '#fb923c',
  },
  unable_to_determine: {
    label: 'Unable to determine',
    className:
      'border-white/15 bg-white/[0.04] text-white/60',
    dotColor: '#94a3b8',
  },
};

export const ImportReviewQueue: React.FC<ImportReviewQueueProps> = ({
  items,
  destinations,
  sources = Object.keys(SOURCE_PALETTE) as AISource[],
  isBatchProcessing = false,
  onMerge,
  onSkip,
  onReplace,
  onRetry,
  onImportNew,
  onUpdateItem,
  onRemoveItem,
  onClearQueue,
}) => {
  const [expandedPreviewId, setExpandedPreviewId] = useState<string | null>(
    null
  );

  const metrics = useMemo(() => {
    const total = items.length;
    const imported = items.filter((i) => i.status === 'imported').length;
    const skipped = items.filter((i) => i.status === 'skipped').length;
    const failed = items.filter((i) => i.status === 'error').length;
    const processing = items.filter(
      (i) => i.status === 'processing' || i.status === 'extracting'
    ).length;
    const duplicates = items.filter(
      (i) =>
        i.duplicateState === 'possible_duplicate' ||
        i.duplicateState === 'exact_duplicate'
    ).length;
    const pending = items.filter(
      (i) =>
        i.status !== 'imported' &&
        i.status !== 'skipped' &&
        i.status !== 'processing' &&
        i.status !== 'extracting'
    ).length;

    return {
      total,
      imported,
      skipped,
      failed,
      processing,
      duplicates,
      pending,
    };
  }, [items]);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderStatusPill = (item: ImportReviewItem) => {
    switch (item.status) {
      case 'extracting':
        return (
          <span className="inline-flex items-center gap-1.5 mono text-[11px] text-indigo-300">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Extracting…</span>
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 mono text-[11px] text-[#9db4ff]">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Persisting…</span>
          </span>
        );
      case 'imported':
        return (
          <span className="inline-flex items-center gap-1 mono text-[11px] font-semibold text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>Imported</span>
          </span>
        );
      case 'skipped':
        return (
          <span className="inline-flex items-center gap-1 mono text-[11px] text-white/45">
            <SkipForward className="h-3 w-3 shrink-0" />
            <span>Skipped</span>
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 mono text-[11px] font-semibold text-rose-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Error</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 mono text-[11px] text-white/75">
            <span className="h-1.5 w-1.5 rounded-full bg-[#9db4ff]" />
            <span>Pending review</span>
          </span>
        );
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#060914] overflow-hidden">
      {/* Queue Header & Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.02] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <h3 className="font-semibold uppercase tracking-wider text-white">
            Import Review Queue
          </h3>
          <span className="text-white/25">·</span>
          <span className="mono text-[11px] tabular-nums text-white/65">
            {metrics.total} {metrics.total === 1 ? 'item' : 'items'}
          </span>
          {metrics.pending > 0 && (
            <>
              <span className="text-white/25">·</span>
              <span className="mono text-[11px] tabular-nums text-[#9db4ff]">
                {metrics.pending} awaiting decision
              </span>
            </>
          )}
          {metrics.duplicates > 0 && (
            <>
              <span className="text-white/25">·</span>
              <span className="mono text-[11px] tabular-nums text-amber-300">
                {metrics.duplicates}{' '}
                {metrics.duplicates === 1 ? 'duplicate' : 'duplicates'} flagged
              </span>
            </>
          )}
          {metrics.imported > 0 && (
            <>
              <span className="text-white/25">·</span>
              <span className="mono text-[11px] tabular-nums text-emerald-400">
                {metrics.imported} imported
              </span>
            </>
          )}
          {metrics.skipped > 0 && (
            <>
              <span className="text-white/25">·</span>
              <span className="mono text-[11px] tabular-nums text-white/45">
                {metrics.skipped} skipped
              </span>
            </>
          )}
          {metrics.failed > 0 && (
            <>
              <span className="text-white/25">·</span>
              <span className="mono text-[11px] tabular-nums text-rose-400">
                {metrics.failed} failed
              </span>
            </>
          )}
        </div>

        {items.length > 0 && onClearQueue && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isBatchProcessing || metrics.processing > 0}
              onClick={onClearQueue}
              className="mono rounded-md border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20 disabled:opacity-40 transition"
            >
              Clear Queue
            </button>
          </div>
        )}
      </div>

      {/* Empty State */}
      {items.length === 0 ? (
        <div className="py-12 px-6 text-center">
          <div className="mx-auto mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/45">
            <FileText className="h-4 w-4" />
          </div>
          <p className="text-xs font-medium text-white/75">
            No items staged in the Import Review Queue
          </p>
          <p className="mt-1 text-[11px] text-white/45 max-w-md mx-auto leading-relaxed">
            Select files or <code className="mono text-white/75">.zip</code> archives above, or stage a transcript from the Paste Conversation tab. Every item is checked for duplicates before you choose to Merge, Replace, or Skip.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.015] mono text-[10.5px] uppercase tracking-wider text-white/45">
                <th className="py-2.5 pl-4 pr-3 min-w-[210px]">Title</th>
                <th className="py-2.5 px-3 min-w-[140px]">Source</th>
                <th className="py-2.5 px-3 min-w-[130px]">Destination</th>
                <th className="py-2.5 px-3 min-w-[125px]">Status</th>
                <th className="py-2.5 px-3 min-w-[175px]">
                  Duplicate Detection
                </th>
                <th className="py-2.5 pl-3 pr-4 text-right min-w-[240px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-xs">
              {items.map((item) => {
                const srcMeta = SOURCE_PALETTE[item.source];
                const isExpanded = expandedPreviewId === item.id;
                const isBusy =
                  item.status === 'processing' ||
                  item.status === 'extracting' ||
                  isBatchProcessing;
                const isCompleted = item.status === 'imported';
                const isSkipped = item.status === 'skipped';
                const isError = item.status === 'error';
                const dupMeta =
                  DUPLICATE_BADGE_META[item.duplicateState] ||
                  DUPLICATE_BADGE_META.unable_to_determine;
                const matchedFact = item.nodeCheck?.existingFact;

                return (
                  <React.Fragment key={item.id}>
                    <tr
                      className={`transition-colors ${
                        isCompleted
                          ? 'bg-emerald-500/[0.03]'
                          : isError
                          ? 'bg-rose-500/[0.04]'
                          : isSkipped
                          ? 'opacity-65 bg-black/20'
                          : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      {/* 1. TITLE */}
                      <td className="py-3 pl-4 pr-3 align-top">
                        <div className="flex items-center gap-2">
                          <span className="mono rounded border border-white/15 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/80 shrink-0">
                            {item.extension.replace('.', '') || 'DOC'}
                          </span>
                          {onUpdateItem && !isCompleted && !isBusy ? (
                            <input
                              type="text"
                              value={item.title}
                              onChange={(e) =>
                                onUpdateItem(item.id, { title: e.target.value })
                              }
                              aria-label="Imported item title"
                              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs font-semibold text-white hover:border-white/15 focus:border-white/35 focus:bg-black/60 outline-none truncate"
                            />
                          ) : (
                            <span
                              className="font-semibold text-white truncate"
                              title={item.title}
                            >
                              {item.title}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-1 mono text-[10.5px] text-white/45">
                          <span
                            className="truncate max-w-[170px]"
                            title={item.fileName}
                          >
                            {item.fileName}
                          </span>
                          <span>·</span>
                          <span className="tabular-nums">
                            {item.itemCount} {item.itemUnitLabel}
                          </span>
                          <span>·</span>
                          <span className="tabular-nums">
                            {formatBytes(item.sizeBytes)}
                          </span>
                          {item.archiveParent && (
                            <>
                              <span>·</span>
                              <span className="text-[#9db4ff]">
                                {item.archiveParent}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* 2. SOURCE */}
                      <td className="py-3 px-3 align-top">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-sm shrink-0"
                            style={{
                              backgroundColor: srcMeta?.color || '#fff',
                            }}
                          />
                          {onUpdateItem && !isCompleted && !isBusy ? (
                            <select
                              value={item.source}
                              onChange={(e) =>
                                onUpdateItem(item.id, {
                                  source: e.target.value as AISource,
                                })
                              }
                              aria-label="Source"
                              className="mono rounded-lg border border-white/15 bg-black/50 px-2 py-1 text-[11px] text-white outline-none focus:border-white/35"
                            >
                              {sources.map((sKey) => (
                                <option
                                  key={sKey}
                                  value={sKey}
                                  className="bg-[#050711]"
                                >
                                  {SOURCE_PALETTE[sKey]?.name || sKey}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="mono text-[11px] text-white/85">
                              {srcMeta?.name || item.source}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 3. DESTINATION */}
                      <td className="py-3 px-3 align-top">
                        {onUpdateItem && !isCompleted && !isBusy ? (
                          <select
                            value={item.destinationBrain}
                            onChange={(e) =>
                              onUpdateItem(item.id, {
                                destinationBrain: e.target.value,
                              })
                            }
                            aria-label="Destination Brain"
                            className="mono rounded-lg border border-white/15 bg-black/50 px-2 py-1 text-[11px] text-[#9db4ff] outline-none focus:border-white/35"
                          >
                            {destinations.map((b) => (
                              <option
                                key={b}
                                value={b}
                                className="bg-[#050711]"
                              >
                                {b}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="mono text-[11px] text-[#9db4ff]">
                            {item.destinationBrain}
                          </span>
                        )}
                      </td>

                      {/* 4. STATUS */}
                      <td className="py-3 px-3 align-top">
                        <div>{renderStatusPill(item)}</div>
                        {item.statusMessage && item.status !== 'error' && (
                          <div
                            className="mt-0.5 mono text-[10px] text-white/45 line-clamp-1"
                            title={item.statusMessage}
                          >
                            {item.statusMessage}
                          </div>
                        )}
                      </td>

                      {/* 5. DUPLICATE DETECTION RESULT */}
                      <td className="py-3 px-3 align-top">
                        <div className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 mono text-[10.5px] font-medium">
                          <span
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: dupMeta.dotColor }}
                          />
                          <span
                            className={
                              item.duplicateState === 'new'
                                ? 'text-emerald-300'
                                : item.duplicateState === 'possible_duplicate'
                                ? 'text-amber-200'
                                : item.duplicateState === 'exact_duplicate'
                                ? 'text-orange-200'
                                : 'text-white/60'
                            }
                          >
                            {dupMeta.label}
                          </span>
                        </div>

                        {matchedFact && (
                          <div className="mt-1 mono text-[10px] text-white/50">
                            Matches Node{' '}
                            <strong className="text-white/80">
                              #{matchedFact.id}
                            </strong>
                            {item.duplicateState === 'possible_duplicate' &&
                            item.nodeCheck?.newSectionsDetected
                              ? ` (+${item.nodeCheck.newSectionsDetected} new)`
                              : ''}
                          </div>
                        )}
                      </td>

                      {/* 6. ACTIONS */}
                      <td className="py-3 pl-3 pr-4 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Primary Action Buttons: Merge / Replace / Skip / Retry */}
                          {!isCompleted && (
                            <>
                              {/* If New item and onImportNew is provided, offer Import (plus Merge/Replace/Skip) */}
                              {item.duplicateState === 'new' && onImportNew && (
                                <button
                                  type="button"
                                  disabled={
                                    isBusy ||
                                    !item.text.trim() ||
                                    item.status === 'extracting'
                                  }
                                  onClick={() => onImportNew(item)}
                                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 mono text-[11px] font-semibold transition disabled:opacity-40 ${
                                    item.resolution === 'create'
                                      ? 'bg-emerald-400 text-black hover:bg-emerald-300'
                                      : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                                  }`}
                                  title="Persist new item to destination Brain"
                                >
                                  <Check className="h-3 w-3" />
                                  <span>Import</span>
                                </button>
                              )}

                              {/* Merge Action */}
                              <button
                                type="button"
                                disabled={
                                  isBusy ||
                                  !item.text.trim() ||
                                  item.status === 'extracting'
                                }
                                onClick={() => onMerge(item)}
                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 mono text-[11px] font-medium transition disabled:opacity-40 ${
                                  item.resolution === 'merge' &&
                                  item.duplicateState !== 'new'
                                    ? 'bg-[#9db4ff] text-black font-semibold hover:bg-[#b4c6ff]'
                                    : 'border border-white/15 bg-white/[0.04] text-white/85 hover:border-white/30 hover:bg-white/[0.09] hover:text-white'
                                }`}
                                title={
                                  matchedFact
                                    ? `Combine imported content with Node #${matchedFact.id} and persist to backend`
                                    : 'Merge content into destination Brain'
                                }
                              >
                                <GitMerge className="h-3 w-3" />
                                <span>Merge</span>
                              </button>

                              {/* Replace Action */}
                              <button
                                type="button"
                                disabled={
                                  isBusy ||
                                  !item.text.trim() ||
                                  item.status === 'extracting'
                                }
                                onClick={() => onReplace(item)}
                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 mono text-[11px] font-medium transition disabled:opacity-40 ${
                                  item.resolution === 'replace'
                                    ? 'bg-amber-400 text-black font-semibold hover:bg-amber-300'
                                    : 'border border-white/15 bg-white/[0.04] text-white/85 hover:border-white/30 hover:bg-white/[0.09] hover:text-white'
                                }`}
                                title={
                                  matchedFact
                                    ? `Replace Node #${matchedFact.id} with imported content and persist to backend`
                                    : 'Replace content in destination Brain'
                                }
                              >
                                <Replace className="h-3 w-3" />
                                <span>Replace</span>
                              </button>

                              {/* Skip Action */}
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => onSkip(item)}
                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 mono text-[11px] font-medium transition disabled:opacity-40 ${
                                  isSkipped
                                    ? 'border border-white/25 bg-white/15 text-white'
                                    : 'border border-white/12 bg-black/40 text-white/65 hover:border-white/25 hover:text-white'
                                }`}
                                title="Do not modify destination; mark item as Skipped"
                              >
                                <SkipForward className="h-3 w-3" />
                                <span>Skip</span>
                              </button>

                              {/* Retry Action when Error */}
                              {isError && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => onRetry(item)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-400/40 bg-rose-500/20 px-2.5 py-1 mono text-[11px] font-semibold text-rose-200 hover:bg-rose-500/30 disabled:opacity-40 transition"
                                  title="Retry failed persistence operation"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  <span>Retry</span>
                                </button>
                              )}
                            </>
                          )}

                          {/* Preview Toggle */}
                          {item.text && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPreviewId(
                                  isExpanded ? null : item.id
                                )
                              }
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/12 bg-white/[0.03] text-white/65 hover:text-white transition"
                              title={
                                isExpanded
                                  ? 'Hide content preview'
                                  : 'Preview extracted content'
                              }
                            >
                              {isExpanded ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}

                          {/* Remove from Queue */}
                          {onRemoveItem && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => onRemoveItem(item.id)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-white/40 hover:border-rose-500/30 hover:text-rose-300 disabled:opacity-40 transition"
                              title="Remove item from queue"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Error Detail Banner Row (when persistence fails) */}
                    {isError && (
                      <tr className="bg-rose-950/25">
                        <td colSpan={6} className="px-4 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-200">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                              <span>
                                <strong>Persistence failed:</strong>{' '}
                                {item.errorMessage ||
                                  item.statusMessage ||
                                  'Backend did not confirm persistence. Existing destination content was not modified.'}
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => onRetry(item)}
                              className="inline-flex items-center gap-1.5 rounded-md bg-rose-400 px-3 py-1 mono text-[11px] font-semibold text-black hover:bg-rose-300 disabled:opacity-40 transition"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>
                                Retry{' '}
                                {item.lastAttemptedAction
                                  ? item.lastAttemptedAction.toUpperCase()
                                  : 'IMPORT'}
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Expandable Content & Duplicate Comparison Row */}
                    {isExpanded && item.text && (
                      <tr className="bg-black/50">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="rounded-xl border border-white/12 bg-[#04060e] p-3.5 space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2 mono text-[10.5px] text-white/50">
                              <span>
                                Content Preview ·{' '}
                                <strong className="text-white/85">
                                  {item.fileName}
                                </strong>
                              </span>
                              <span className="tabular-nums">
                                {item.text.length.toLocaleString()} characters
                              </span>
                            </div>
                            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-white/80 leading-relaxed scrollbar-thin">
                              {item.text}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
