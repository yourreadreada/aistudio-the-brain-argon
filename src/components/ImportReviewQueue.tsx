import React, { useState, useMemo, useEffect } from 'react';
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
  FileText,
  CheckSquare,
  Square,
  MinusSquare,
  ShieldAlert,
} from 'lucide-react';
import {
  AISource,
  DuplicateDetectionState,
  ExistingFileNodeCheck,
  SOURCE_PALETTE,
} from '../types/brain';

export type ReviewResolutionAction =
  | 'create'
  | 'merge'
  | 'replace'
  | 'skip'
  | 'undecided';

export type ReviewItemStatus =
  | 'extracting'
  | 'ready'
  | 'duplicate_identical'
  | 'duplicate_diff'
  | 'importing'
  | 'processing'
  | 'imported'
  | 'skipped'
  | 'error';

/**
 * Reusable progress model for queue items, large file extraction, bulk imports,
 * and future background synchronization.
 *
 * - Use `mode: 'determinate'` ONLY when `current` and `total` come from a real,
 *   measurable operation (e.g. bytes uploaded / total bytes, chunks processed / total chunks,
 *   records processed / total records, or pages extracted / total pages).
 * - Use `mode: 'indeterminate'` when the underlying operation does not expose
 *   measurable progress. Never fabricate a percentage.
 */
export interface ImportItemProgress {
  mode: 'determinate' | 'indeterminate';
  phase?: 'uploading' | 'extracting' | 'importing' | 'processing';
  current?: number;
  total?: number;
  unit?: string;
  label?: string;
}

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
  progress?: ImportItemProgress;
}

export interface BatchExecutionProgress {
  actionLabel: string;
  completed: number;
  total: number;
  activeCount: number;
}

export interface ImportReviewQueueProps {
  items: ImportReviewItem[];
  destinations: string[];
  sources?: AISource[];
  isBatchProcessing?: boolean;
  concurrencyLimit?: number;
  selectedIds?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  onMerge: (item: ImportReviewItem) => Promise<boolean | void> | boolean | void;
  onSkip: (item: ImportReviewItem) => Promise<boolean | void> | boolean | void;
  onReplace: (
    item: ImportReviewItem
  ) => Promise<boolean | void> | boolean | void;
  onRetry: (item: ImportReviewItem) => Promise<boolean | void> | boolean | void;
  onImportNew?: (
    item: ImportReviewItem
  ) => Promise<boolean | void> | boolean | void;
  onBulkMerge?: (items: ImportReviewItem[]) => Promise<void> | void;
  onBulkReplace?: (items: ImportReviewItem[]) => Promise<void> | void;
  onBulkSkip?: (items: ImportReviewItem[]) => Promise<void> | void;
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

/**
 * Explicit default resolution rules based on duplicate detection state:
 * - New -> Create
 * - Exact duplicate -> Skip by default
 * - Possible duplicate -> Ask user ('undecided')
 * - Related content -> Ask user ('undecided')
 * - Unable to determine -> Ask user ('undecided'); never silently Merge or Replace
 */
export function getDefaultResolutionForDuplicateState(
  duplicateState: DuplicateDetectionState
): ReviewResolutionAction {
  switch (duplicateState) {
    case 'new':
      return 'create';
    case 'exact_duplicate':
      return 'skip';
    case 'possible_duplicate':
    case 'related_content':
    case 'unable_to_determine':
    default:
      return 'undecided';
  }
}

/**
 * Bounded concurrency runner to prevent firing an uncontrolled number of simultaneous
 * backend persistence requests during bulk operations.
 */
export async function runWithControlledConcurrency<T>(
  items: T[],
  concurrencyLimit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  const safeLimit = Math.max(1, Math.min(concurrencyLimit, items.length || 1));
  let cursor = 0;

  const runners = Array.from({ length: safeLimit }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor++;
      await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
}

/**
 * Evaluates whether a queue item is eligible for a specific bulk or individual action
 * while respecting duplicate detection rules:
 * - 'unable_to_determine' must NEVER silently allow Merge or Replace.
 * - 'extracting', 'importing', 'processing', and 'imported' items are not modified by new bulk actions.
 */
export function isItemEligibleForAction(
  item: ImportReviewItem,
  action: 'create' | 'merge' | 'replace' | 'skip'
): { eligible: boolean; reason?: string } {
  if (
    item.status === 'extracting' ||
    item.status === 'importing' ||
    item.status === 'processing'
  ) {
    return { eligible: false, reason: 'Item is currently busy processing.' };
  }

  if (item.status === 'imported') {
    return {
      eligible: false,
      reason: 'Item has already been persisted to the destination Brain.',
    };
  }

  if (action === 'skip') {
    if (item.status === 'skipped') {
      return { eligible: false, reason: 'Item is already marked as Skipped.' };
    }
    return { eligible: true };
  }

  // Create, Merge, or Replace requires readable text content
  if (!item.text || !item.text.trim()) {
    return {
      eligible: false,
      reason: 'Cannot persist item with empty content.',
    };
  }

  if (action === 'create') {
    return { eligible: true };
  }

  // Duplicate safety rule: Unable to determine must NEVER silently allow Merge or Replace
  if (item.duplicateState === 'unable_to_determine') {
    return {
      eligible: false,
      reason:
        'Duplicate state is "Unable to determine" — never silently allows Merge or Replace. Choose an explicit action per item.',
    };
  }

  return { eligible: true };
}

const DUPLICATE_BADGE_META: Record<
  DuplicateDetectionState,
  {
    label: string;
    ruleHint: string;
    className: string;
    dotColor: string;
    textClass: string;
  }
> = {
  new: {
    label: 'New',
    ruleHint: 'Default: Create',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    dotColor: '#34d399',
    textClass: 'text-emerald-300',
  },
  possible_duplicate: {
    label: 'Possible duplicate',
    ruleHint: 'Ask user: Merge, Replace, or Skip',
    className: 'border-amber-500/35 bg-amber-500/12 text-amber-200',
    dotColor: '#fbbf24',
    textClass: 'text-amber-200',
  },
  exact_duplicate: {
    label: 'Exact duplicate',
    ruleHint: 'Default: Skip',
    className: 'border-orange-500/35 bg-orange-500/12 text-orange-200',
    dotColor: '#fb923c',
    textClass: 'text-orange-200',
  },
  related_content: {
    label: 'Related content',
    ruleHint: 'Ask user: Merge or Create',
    className: 'border-sky-500/35 bg-sky-500/12 text-sky-200',
    dotColor: '#38bdf8',
    textClass: 'text-sky-200',
  },
  unable_to_determine: {
    label: 'Unable to determine',
    ruleHint: 'Ask user — overwrite blocked',
    className: 'border-white/15 bg-white/[0.04] text-white/60',
    dotColor: '#94a3b8',
    textClass: 'text-white/60',
  },
};

export const ImportReviewQueue: React.FC<ImportReviewQueueProps> = ({
  items,
  destinations,
  sources = Object.keys(SOURCE_PALETTE) as AISource[],
  isBatchProcessing = false,
  concurrencyLimit = 3,
  selectedIds: controlledSelectedIds,
  onSelectionChange,
  onMerge,
  onSkip,
  onReplace,
  onRetry,
  onImportNew,
  onBulkMerge,
  onBulkReplace,
  onBulkSkip,
  onUpdateItem,
  onRemoveItem,
  onClearQueue,
}) => {
  const [expandedPreviewId, setExpandedPreviewId] = useState<string | null>(
    null
  );
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const [internalBatchProgress, setInternalBatchProgress] =
    useState<BatchExecutionProgress | null>(null);
  const [bulkSafeguardNotice, setBulkSafeguardNotice] = useState<string | null>(
    null
  );
  const [confirmingUnknownAction, setConfirmingUnknownAction] = useState<{
    itemId: string;
    action: 'merge' | 'replace';
  } | null>(null);

  // Support both controlled and uncontrolled selection
  const selectedIds =
    controlledSelectedIds !== undefined
      ? controlledSelectedIds
      : internalSelectedIds;

  const updateSelection = (nextIds: string[]) => {
    if (onSelectionChange) {
      onSelectionChange(nextIds);
    } else {
      setInternalSelectedIds(nextIds);
    }
  };

  // Keep selection pruned to existing item IDs
  useEffect(() => {
    const validIdSet = new Set(items.map((i) => i.id));
    const filtered = selectedIds.filter((id) => validIdSet.has(id));
    if (filtered.length !== selectedIds.length) {
      updateSelection(filtered);
    }
  }, [items]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedSet.has(item.id)),
    [items, selectedSet]
  );

  // Compute eligibility breakdowns for the current selection
  const selectionEligibility = useMemo(() => {
    const mergeEligible = selectedItems.filter(
      (i) => isItemEligibleForAction(i, 'merge').eligible
    );
    const replaceEligible = selectedItems.filter(
      (i) => isItemEligibleForAction(i, 'replace').eligible
    );
    const skipEligible = selectedItems.filter(
      (i) => isItemEligibleForAction(i, 'skip').eligible
    );
    const unknownDuplicateSelected = selectedItems.filter(
      (i) =>
        i.duplicateState === 'unable_to_determine' &&
        i.status !== 'imported' &&
        i.status !== 'skipped'
    );
    return {
      mergeEligible,
      replaceEligible,
      skipEligible,
      unknownDuplicateSelected,
    };
  }, [selectedItems]);

  const metrics = useMemo(() => {
    const total = items.length;
    const imported = items.filter((i) => i.status === 'imported').length;
    const skipped = items.filter((i) => i.status === 'skipped').length;
    const failed = items.filter((i) => i.status === 'error').length;
    const processing = items.filter(
      (i) =>
        i.status === 'processing' ||
        i.status === 'importing' ||
        i.status === 'extracting'
    ).length;
    const duplicates = items.filter(
      (i) =>
        i.duplicateState === 'possible_duplicate' ||
        i.duplicateState === 'exact_duplicate' ||
        i.duplicateState === 'related_content'
    ).length;
    const ready = items.filter(
      (i) =>
        i.status === 'ready' ||
        i.status === 'duplicate_identical' ||
        i.status === 'duplicate_diff'
    ).length;
    const needsDecision = items.filter(
      (i) =>
        (i.status === 'ready' ||
          i.status === 'duplicate_identical' ||
          i.status === 'duplicate_diff') &&
        i.resolution === 'undecided'
    ).length;

    return {
      total,
      imported,
      skipped,
      failed,
      processing,
      duplicates,
      ready,
      needsDecision,
    };
  }, [items]);

  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const someSelected =
    selectedIds.length > 0 && selectedIds.length < items.length;
  const isAnyBatchRunning =
    isBatchProcessing || internalBatchProgress !== null;

  const handleToggleItem = (id: string) => {
    setBulkSafeguardNotice(null);
    if (selectedSet.has(id)) {
      updateSelection(selectedIds.filter((itemId) => itemId !== id));
    } else {
      updateSelection([...selectedIds, id]);
    }
  };

  const handleToggleSelectAll = () => {
    setBulkSafeguardNotice(null);
    if (allSelected) {
      updateSelection([]);
    } else {
      updateSelection(items.map((item) => item.id));
    }
  };

  const handleClearSelection = () => {
    setBulkSafeguardNotice(null);
    updateSelection([]);
  };

  /**
   * Executes a bulk action ('merge' | 'replace' | 'skip') across selected items
   * reusing the exact same per-item persistence handlers and bounded concurrency.
   */
  const executeBulkOperation = async (
    action: 'merge' | 'replace' | 'skip'
  ) => {
    if (selectedItems.length === 0 || isAnyBatchRunning) return;
    setBulkSafeguardNotice(null);

    if (action === 'skip') {
      if (onBulkSkip) {
        await onBulkSkip(selectionEligibility.skipEligible);
        return;
      }
      for (const item of selectionEligibility.skipEligible) {
        await onSkip(item);
      }
      return;
    }

    const eligibleList =
      action === 'merge'
        ? selectionEligibility.mergeEligible
        : selectionEligibility.replaceEligible;

    const blockedUnknownCount =
      selectionEligibility.unknownDuplicateSelected.length;

    if (blockedUnknownCount > 0) {
      setBulkSafeguardNotice(
        `${blockedUnknownCount} selected ${
          blockedUnknownCount === 1 ? 'item has' : 'items have'
        } "Unable to determine" duplicate status and ${
          blockedUnknownCount === 1 ? 'was' : 'were'
        } excluded from ${
          action === 'merge' ? 'Bulk Merge' : 'Bulk Replace'
        }. Choose an explicit action per item.`
      );
    }

    if (eligibleList.length === 0) return;

    if (action === 'merge' && onBulkMerge) {
      await onBulkMerge(eligibleList);
      return;
    }

    if (action === 'replace' && onBulkReplace) {
      await onBulkReplace(eligibleList);
      return;
    }

    const totalToRun = eligibleList.length;
    let completedCount = 0;
    let activeWorkers = 0;

    setInternalBatchProgress({
      actionLabel: action === 'merge' ? 'Bulk Merge' : 'Bulk Replace',
      completed: 0,
      total: totalToRun,
      activeCount: Math.min(concurrencyLimit, totalToRun),
    });

    try {
      await runWithControlledConcurrency(
        eligibleList,
        concurrencyLimit,
        async (item) => {
          activeWorkers++;
          setInternalBatchProgress({
            actionLabel: action === 'merge' ? 'Bulk Merge' : 'Bulk Replace',
            completed: completedCount,
            total: totalToRun,
            activeCount: activeWorkers,
          });
          try {
            if (action === 'merge') {
              await onMerge(item);
            } else {
              await onReplace(item);
            }
          } finally {
            activeWorkers--;
            completedCount++;
            setInternalBatchProgress({
              actionLabel: action === 'merge' ? 'Bulk Merge' : 'Bulk Replace',
              completed: completedCount,
              total: totalToRun,
              activeCount: activeWorkers,
            });
          }
        }
      );
    } finally {
      setInternalBatchProgress(null);
    }
  };

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
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            <span>Extracting</span>
          </span>
        );
      case 'importing':
        return (
          <span className="inline-flex items-center gap-1.5 mono text-[11px] text-[#9db4ff]">
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            <span>Importing</span>
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 mono text-[11px] text-[#9db4ff]">
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            <span>Processing</span>
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
      case 'ready':
      case 'duplicate_identical':
      case 'duplicate_diff':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 mono text-[11px] text-white/80">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                item.resolution === 'undecided'
                  ? 'bg-amber-400'
                  : 'bg-[#9db4ff]'
              }`}
            />
            <span>
              {item.resolution === 'undecided'
                ? 'Ready · Decision needed'
                : 'Ready'}
            </span>
          </span>
        );
    }
  };

  /**
   * Renders accurate per-item progress feedback:
   * - Determinate percentage & counter ONLY when `progress.mode === 'determinate'`
   *   and `total > 0` (e.g. `482 / 1000 records` or `2 / 5 chunks`).
   * - Indeterminate indicator (`Processing…` / `Importing…` / `Extracting…`) when
   *   the underlying operation does not provide measurable progress.
   */
  const renderItemProgress = (item: ImportReviewItem) => {
    const isActivelyRunning =
      item.status === 'extracting' ||
      item.status === 'importing' ||
      item.status === 'processing';

    if (!isActivelyRunning && !item.progress) {
      return null;
    }

    const prog = item.progress;
    const hasMeasurableDeterminate =
      prog &&
      prog.mode === 'determinate' &&
      typeof prog.current === 'number' &&
      typeof prog.total === 'number' &&
      prog.total > 0;

    if (hasMeasurableDeterminate && prog) {
      const pct = Math.min(
        100,
        Math.max(0, Math.round((prog.current! / prog.total!) * 100))
      );
      const phaseTitle =
        prog.phase === 'uploading'
          ? 'Uploading'
          : prog.phase === 'extracting'
          ? 'Extracting'
          : prog.phase === 'importing'
          ? 'Importing'
          : 'Processing';

      return (
        <div
          className="mt-1.5 space-y-1 min-w-[140px]"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="flex items-center justify-between gap-2 mono text-[10px]">
            <span className="text-[#9db4ff] truncate">
              {prog.label || phaseTitle}
            </span>
            <span className="font-semibold tabular-nums text-white">
              {pct}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#9db4ff] transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mono text-[10px] tabular-nums text-white/55">
            {prog.current!.toLocaleString()} / {prog.total!.toLocaleString()}
            {prog.unit ? ` ${prog.unit}` : ''}
          </div>
        </div>
      );
    }

    if (isActivelyRunning || prog?.mode === 'indeterminate') {
      const indeterminateLabel =
        prog?.label ||
        (item.status === 'extracting'
          ? 'Extracting…'
          : item.status === 'importing'
          ? 'Importing…'
          : 'Processing…');

      return (
        <div
          className="mt-1.5 space-y-1 min-w-[140px]"
          role="progressbar"
          aria-busy="true"
        >
          <div className="mono text-[10px] text-[#9db4ff] truncate">
            {indeterminateLabel}
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-2/5 rounded-full bg-[#9db4ff] animate-pulse" />
          </div>
        </div>
      );
    }

    return null;
  };

  const renderActionButtons = (item: ImportReviewItem) => {
    const isBusy =
      item.status === 'processing' ||
      item.status === 'importing' ||
      item.status === 'extracting';
    const isCompleted = item.status === 'imported';
    const isSkipped = item.status === 'skipped';
    const isError = item.status === 'error';
    const matchedFact = item.nodeCheck?.existingFact;
    const isUnknownDup = item.duplicateState === 'unable_to_determine';

    const createEligibility = isItemEligibleForAction(item, 'create');
    const mergeEligibility = isItemEligibleForAction(item, 'merge');
    const replaceEligibility = isItemEligibleForAction(item, 'replace');
    const skipEligibility = isItemEligibleForAction(item, 'skip');

    const isConfirmingThisItem =
      confirmingUnknownAction?.itemId === item.id;

    if (isConfirmingThisItem && confirmingUnknownAction) {
      return (
        <div className="flex items-center justify-end gap-1.5 flex-wrap rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5">
          <span className="mono text-[10.5px] text-amber-200">
            Duplicate state unknown. Confirm{' '}
            <strong>{confirmingUnknownAction.action.toUpperCase()}</strong>?
          </span>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              const act = confirmingUnknownAction.action;
              setConfirmingUnknownAction(null);
              if (act === 'merge') onMerge(item);
              else onReplace(item);
            }}
            className="rounded bg-amber-400 px-2 py-0.5 mono text-[10.5px] font-semibold text-black hover:bg-amber-300"
          >
            Confirm {confirmingUnknownAction.action}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingUnknownAction(null)}
            className="rounded border border-white/15 bg-black/50 px-2 py-0.5 mono text-[10.5px] text-white/70 hover:text-white"
          >
            Cancel
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-end gap-1.5 flex-wrap">
        {!isCompleted && (
          <>
            {/* Create / Import Action (Available for New, Related, Possible Duplicate, or explicit choice on Unknown when text is present) */}
            {onImportNew && (
              <button
                type="button"
                disabled={isBusy || !createEligibility.eligible}
                onClick={() => onImportNew(item)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 mono text-[11px] font-semibold transition disabled:opacity-35 ${
                  item.resolution === 'create'
                    ? 'bg-emerald-400 text-black hover:bg-emerald-300'
                    : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                }`}
                title="Create as a new node in destination Brain without overwriting existing nodes"
              >
                <Check className="h-3 w-3" />
                <span>Create</span>
              </button>
            )}

            {/* Merge Action */}
            <button
              type="button"
              disabled={isBusy || !item.text.trim()}
              onClick={() => {
                if (isUnknownDup) {
                  setConfirmingUnknownAction({
                    itemId: item.id,
                    action: 'merge',
                  });
                } else {
                  onMerge(item);
                }
              }}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 mono text-[11px] font-medium transition disabled:opacity-35 ${
                item.resolution === 'merge'
                  ? 'bg-[#9db4ff] text-black font-semibold hover:bg-[#b4c6ff]'
                  : 'border border-white/15 bg-white/[0.04] text-white/85 hover:border-white/30 hover:bg-white/[0.09] hover:text-white'
              }`}
              title={
                isUnknownDup
                  ? 'Duplicate status is Unable to determine — requires explicit confirmation before merging'
                  : !mergeEligibility.eligible
                  ? mergeEligibility.reason
                  : matchedFact
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
              disabled={isBusy || !item.text.trim()}
              onClick={() => {
                if (isUnknownDup) {
                  setConfirmingUnknownAction({
                    itemId: item.id,
                    action: 'replace',
                  });
                } else {
                  onReplace(item);
                }
              }}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 mono text-[11px] font-medium transition disabled:opacity-35 ${
                item.resolution === 'replace'
                  ? 'bg-amber-400 text-black font-semibold hover:bg-amber-300'
                  : 'border border-white/15 bg-white/[0.04] text-white/85 hover:border-white/30 hover:bg-white/[0.09] hover:text-white'
              }`}
              title={
                isUnknownDup
                  ? 'Duplicate status is Unable to determine — requires explicit confirmation before replacing'
                  : !replaceEligibility.eligible
                  ? replaceEligibility.reason
                  : matchedFact
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
              disabled={isBusy || !skipEligibility.eligible}
              onClick={() => onSkip(item)}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 mono text-[11px] font-medium transition disabled:opacity-35 ${
                isSkipped || item.resolution === 'skip'
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
                expandedPreviewId === item.id ? null : item.id
              )
            }
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/12 bg-white/[0.03] text-white/65 hover:text-white transition"
            title={
              expandedPreviewId === item.id
                ? 'Hide content preview'
                : 'Preview extracted content'
            }
          >
            {expandedPreviewId === item.id ? (
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
    );
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#060914] overflow-hidden">
      {/* Queue Header & Summary Metrics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.02] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <h3 className="font-semibold uppercase tracking-wider text-white">
            Import Review Queue
          </h3>
          <span className="text-white/25">·</span>
          <span className="mono text-[11px] tabular-nums text-white/65">
            {metrics.total} {metrics.total === 1 ? 'item' : 'items'}
          </span>
          {metrics.ready > 0 && (
            <>
              <span className="text-white/25">·</span>
              <span className="mono text-[11px] tabular-nums text-[#9db4ff]">
                {metrics.ready} ready
              </span>
            </>
          )}
          {metrics.needsDecision > 0 && (
            <>
              <span className="text-white/25">·</span>
              <span className="mono text-[11px] tabular-nums text-amber-300">
                {metrics.needsDecision} awaiting decision
              </span>
            </>
          )}
          {metrics.processing > 0 && (
            <>
              <span className="text-white/25">·</span>
              <span className="mono text-[11px] tabular-nums text-[#9db4ff]">
                {metrics.processing} active
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
              disabled={isAnyBatchRunning || metrics.processing > 0}
              onClick={onClearQueue}
              className="mono rounded-md border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20 disabled:opacity-40 transition"
            >
              Clear Queue
            </button>
          </div>
        )}
      </div>

      {/* Bulk Selection & Bulk Actions Toolbar */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#080c1a] px-4 py-2.5">
          {/* Left: Select All / Deselect All + Selected Count + Clear Selection */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="inline-flex items-center gap-2 rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-1 mono text-[11px] text-white/85 hover:border-white/25 hover:bg-white/[0.06] transition"
            >
              {allSelected ? (
                <CheckSquare className="h-3.5 w-3.5 text-[#9db4ff]" />
              ) : someSelected ? (
                <MinusSquare className="h-3.5 w-3.5 text-[#9db4ff]" />
              ) : (
                <Square className="h-3.5 w-3.5 text-white/40" />
              )}
              <span>
                {allSelected ? 'Deselect all' : `Select all (${items.length})`}
              </span>
            </button>

            <span className="mono text-[11px] tabular-nums text-white/75">
              <strong className="text-white">{selectedIds.length}</strong>{' '}
              selected
            </span>

            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="mono rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-[11px] text-white/55 hover:border-white/20 hover:text-white transition"
              >
                Clear selection
              </button>
            )}
          </div>

          {/* Right: Bulk Merge / Bulk Replace / Bulk Skip */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={
                isAnyBatchRunning ||
                selectionEligibility.mergeEligible.length === 0
              }
              onClick={() => executeBulkOperation('merge')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#9db4ff]/35 bg-[#9db4ff]/15 px-3 py-1.5 mono text-[11px] font-semibold text-[#9db4ff] hover:bg-[#9db4ff]/25 disabled:opacity-35 transition"
              title="Merge eligible selected items into their destination Brains via backend persistence"
            >
              <GitMerge className="h-3.5 w-3.5" />
              <span>Bulk Merge</span>
              {selectedIds.length > 0 && (
                <span className="tabular-nums rounded bg-black/40 px-1.5 py-0.2 text-[10px]">
                  {selectionEligibility.mergeEligible.length}
                </span>
              )}
            </button>

            <button
              type="button"
              disabled={
                isAnyBatchRunning ||
                selectionEligibility.replaceEligible.length === 0
              }
              onClick={() => executeBulkOperation('replace')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/35 bg-amber-500/15 px-3 py-1.5 mono text-[11px] font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-35 transition"
              title="Replace destination content for eligible selected items via backend persistence"
            >
              <Replace className="h-3.5 w-3.5" />
              <span>Bulk Replace</span>
              {selectedIds.length > 0 && (
                <span className="tabular-nums rounded bg-black/40 px-1.5 py-0.2 text-[10px]">
                  {selectionEligibility.replaceEligible.length}
                </span>
              )}
            </button>

            <button
              type="button"
              disabled={
                isAnyBatchRunning ||
                selectionEligibility.skipEligible.length === 0
              }
              onClick={() => executeBulkOperation('skip')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 mono text-[11px] font-medium text-white/85 hover:bg-white/[0.1] disabled:opacity-35 transition"
              title="Mark selected items as Skipped without modifying destination"
            >
              <SkipForward className="h-3.5 w-3.5" />
              <span>Bulk Skip</span>
              {selectedIds.length > 0 && (
                <span className="tabular-nums rounded bg-black/40 px-1.5 py-0.2 text-[10px]">
                  {selectionEligibility.skipEligible.length}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Controlled Concurrency Batch Progress Banner (Measurable completed / total items) */}
      {internalBatchProgress && (
        <div className="border-b border-white/10 bg-[#0b1229] px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 mono text-[11px]">
            <div className="flex items-center gap-2 text-[#9db4ff]">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              <span>
                Running <strong>{internalBatchProgress.actionLabel}</strong>{' '}
                (max {concurrencyLimit} concurrent requests)
              </span>
            </div>
            <span className="tabular-nums text-white/80">
              {internalBatchProgress.completed} / {internalBatchProgress.total}{' '}
              items processed (
              {Math.round(
                (internalBatchProgress.completed /
                  Math.max(1, internalBatchProgress.total)) *
                  100
              )}
              %)
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#9db4ff] transition-all duration-200"
              style={{
                width: `${Math.round(
                  (internalBatchProgress.completed /
                    Math.max(1, internalBatchProgress.total)) *
                    100
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Duplicate Safety Notice (When unknown duplicate items are selected) */}
      {bulkSafeguardNotice && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
            <span>{bulkSafeguardNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setBulkSafeguardNotice(null)}
            className="mono text-[11px] text-amber-200/75 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

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
            Select files or <code className="mono text-white/75">.zip</code>{' '}
            archives above, or stage a transcript from the Paste Conversation
            tab. Every item is checked for duplicates before you choose to
            Create, Merge, Replace, or Skip.
          </p>
        </div>
      ) : (
        <>
          {/* ===============================================================
              DESKTOP TABLE VIEW (`hidden lg:block`)
             =============================================================== */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.015] mono text-[10.5px] uppercase tracking-wider text-white/45">
                  <th className="py-2.5 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={handleToggleSelectAll}
                      aria-label="Select all items in queue"
                      className="h-3.5 w-3.5 rounded border-white/25 bg-black text-[#9db4ff] cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-3 min-w-[200px]">Title</th>
                  <th className="py-2.5 px-3 min-w-[135px]">Source</th>
                  <th className="py-2.5 px-3 min-w-[125px]">Destination</th>
                  <th className="py-2.5 px-3 min-w-[165px]">
                    Status & Progress
                  </th>
                  <th className="py-2.5 px-3 min-w-[175px]">
                    Duplicate Detection
                  </th>
                  <th className="py-2.5 pl-3 pr-4 text-right min-w-[260px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-xs">
                {items.map((item) => {
                  const srcMeta = SOURCE_PALETTE[item.source];
                  const isExpanded = expandedPreviewId === item.id;
                  const isSelected = selectedSet.has(item.id);
                  const isBusy =
                    item.status === 'processing' ||
                    item.status === 'importing' ||
                    item.status === 'extracting';
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
                          isSelected
                            ? 'bg-[#9db4ff]/[0.06]'
                            : isCompleted
                            ? 'bg-emerald-500/[0.03]'
                            : isError
                            ? 'bg-rose-500/[0.04]'
                            : isSkipped
                            ? 'opacity-65 bg-black/20'
                            : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        {/* 0. CHECKBOX */}
                        <td className="py-3 pl-4 pr-2 align-top">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleItem(item.id)}
                            aria-label={`Select ${item.title}`}
                            className="mt-1 h-3.5 w-3.5 rounded border-white/25 bg-black text-[#9db4ff] cursor-pointer"
                          />
                        </td>

                        {/* 1. TITLE */}
                        <td className="py-3 px-3 align-top">
                          <div className="flex items-center gap-2">
                            <span className="mono rounded border border-white/15 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/80 shrink-0">
                              {item.extension.replace('.', '') || 'DOC'}
                            </span>
                            {onUpdateItem && !isCompleted && !isBusy ? (
                              <input
                                type="text"
                                value={item.title}
                                onChange={(e) =>
                                  onUpdateItem(item.id, {
                                    title: e.target.value,
                                  })
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

                        {/* 4. STATUS & PROGRESS */}
                        <td className="py-3 px-3 align-top">
                          <div>{renderStatusPill(item)}</div>
                          {renderItemProgress(item)}
                          {item.statusMessage &&
                            item.status !== 'error' &&
                            !item.progress && (
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
                          <div className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.03] px-2 py-0.5 mono text-[10.5px] font-medium">
                            <span
                              className="h-1.5 w-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: dupMeta.dotColor }}
                            />
                            <span className={dupMeta.textClass}>
                              {dupMeta.label}
                            </span>
                          </div>

                          <div className="mt-1 mono text-[10px] text-white/45">
                            {matchedFact ? (
                              <span>
                                Matches Node{' '}
                                <strong className="text-white/80">
                                  #{matchedFact.id}
                                </strong>
                                {(item.duplicateState ===
                                  'possible_duplicate' ||
                                  item.duplicateState === 'related_content') &&
                                item.nodeCheck?.newSectionsDetected
                                  ? ` (+${item.nodeCheck.newSectionsDetected} new)`
                                  : ''}
                              </span>
                            ) : (
                              <span>{dupMeta.ruleHint}</span>
                            )}
                          </div>
                        </td>

                        {/* 6. ACTIONS */}
                        <td className="py-3 pl-3 pr-4 align-top text-right">
                          {renderActionButtons(item)}
                        </td>
                      </tr>

                      {/* Error Detail Banner Row */}
                      {isError && (
                        <tr className="bg-rose-950/25">
                          <td colSpan={7} className="px-4 py-2.5">
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

                      {/* Expandable Content Preview Row */}
                      {isExpanded && item.text && (
                        <tr className="bg-black/50">
                          <td colSpan={7} className="px-4 py-3">
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

          {/* ===============================================================
              RESPONSIVE MOBILE / TABLET / FOLDABLE CARD VIEW (`block lg:hidden`)
             =============================================================== */}
          <div className="block lg:hidden divide-y divide-white/10">
            {items.map((item) => {
              const srcMeta = SOURCE_PALETTE[item.source];
              const isExpanded = expandedPreviewId === item.id;
              const isSelected = selectedSet.has(item.id);
              const isBusy =
                item.status === 'processing' ||
                item.status === 'importing' ||
                item.status === 'extracting';
              const isCompleted = item.status === 'imported';
              const isSkipped = item.status === 'skipped';
              const isError = item.status === 'error';
              const dupMeta =
                DUPLICATE_BADGE_META[item.duplicateState] ||
                DUPLICATE_BADGE_META.unable_to_determine;
              const matchedFact = item.nodeCheck?.existingFact;

              return (
                <div
                  key={item.id}
                  className={`p-4 space-y-3 transition-colors ${
                    isSelected
                      ? 'bg-[#9db4ff]/[0.06]'
                      : isCompleted
                      ? 'bg-emerald-500/[0.03]'
                      : isError
                      ? 'bg-rose-500/[0.04]'
                      : isSkipped
                      ? 'opacity-65 bg-black/20'
                      : ''
                  }`}
                >
                  {/* Top Row: Checkbox + Title + Duplicate Badge */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleItem(item.id)}
                        aria-label={`Select ${item.title}`}
                        className="mt-1 h-4 w-4 rounded border-white/25 bg-black text-[#9db4ff] shrink-0 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
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
                              className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-0.5 text-xs font-semibold text-white outline-none focus:border-white/35"
                            />
                          ) : (
                            <span className="font-semibold text-xs text-white truncate">
                              {item.title}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 mono text-[10.5px] text-white/45">
                          <span className="truncate max-w-[180px]">
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
                        </div>
                      </div>
                    </div>

                    {/* Duplicate Detection Badge */}
                    <div className="text-right shrink-0">
                      <div className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.03] px-2 py-0.5 mono text-[10px] font-medium">
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: dupMeta.dotColor }}
                        />
                        <span className={dupMeta.textClass}>
                          {dupMeta.label}
                        </span>
                      </div>
                      <div className="mt-0.5 mono text-[10px] text-white/50">
                        {matchedFact ? (
                          <span>
                            Node{' '}
                            <strong className="text-white/80">
                              #{matchedFact.id}
                            </strong>
                          </span>
                        ) : (
                          <span>{dupMeta.ruleHint}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle Row: Source + Destination Selectors */}
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <span className="block mono text-[10px] uppercase tracking-wider text-white/40 mb-1">
                        Source
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: srcMeta?.color || '#fff' }}
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
                            className="mono w-full rounded-lg border border-white/15 bg-black/50 px-2 py-1 text-[11px] text-white outline-none"
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
                          <span className="mono text-[11px] text-white/85 truncate">
                            {srcMeta?.name || item.source}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="block mono text-[10px] uppercase tracking-wider text-white/40 mb-1">
                        Destination
                      </span>
                      {onUpdateItem && !isCompleted && !isBusy ? (
                        <select
                          value={item.destinationBrain}
                          onChange={(e) =>
                            onUpdateItem(item.id, {
                              destinationBrain: e.target.value,
                            })
                          }
                          aria-label="Destination Brain"
                          className="mono w-full rounded-lg border border-white/15 bg-black/50 px-2 py-1 text-[11px] text-[#9db4ff] outline-none"
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
                        <span className="mono text-[11px] text-[#9db4ff] truncate">
                          {item.destinationBrain}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status + Per-Item Progress Row */}
                  <div className="rounded-lg border border-white/8 bg-black/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      {renderStatusPill(item)}
                      {item.statusMessage && item.status !== 'error' && (
                        <span className="mono text-[10px] text-white/45 truncate">
                          {item.statusMessage}
                        </span>
                      )}
                    </div>
                    {renderItemProgress(item)}
                  </div>

                  {/* Error Banner inside Card */}
                  {isError && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                        <span>
                          <strong>Persistence failed:</strong>{' '}
                          {item.errorMessage ||
                            item.statusMessage ||
                            'Backend did not confirm persistence.'}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onRetry(item)}
                        className="inline-flex items-center gap-1 rounded-md bg-rose-400 px-2.5 py-1 mono text-[10.5px] font-semibold text-black hover:bg-rose-300 disabled:opacity-40"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Retry</span>
                      </button>
                    </div>
                  )}

                  {/* Expandable Preview inside Card */}
                  {isExpanded && item.text && (
                    <div className="rounded-xl border border-white/12 bg-[#04060e] p-3 space-y-2">
                      <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mono text-[10px] text-white/50">
                        <span className="truncate">{item.fileName}</span>
                        <span className="tabular-nums">
                          {item.text.length.toLocaleString()} chars
                        </span>
                      </div>
                      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-white/80 leading-relaxed">
                        {item.text}
                      </pre>
                    </div>
                  )}

                  {/* Bottom Action Buttons */}
                  <div className="pt-1 flex items-center justify-end">
                    {renderActionButtons(item)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
