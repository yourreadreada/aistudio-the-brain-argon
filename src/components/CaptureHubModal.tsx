import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Puzzle,
  Upload,
  ClipboardPaste,
  Download,
  Check,
  Copy,
  Trash2,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  FileArchive,
  KeyRound,
  ArrowRight,
  X,
  GitMerge,
  Replace,
  SkipForward,
  RotateCcw,
} from 'lucide-react';
import {
  AISource,
  FactFileType,
  IngestStrategy,
  ExistingFileNodeCheck,
  DuplicateDetectionState,
  SOURCE_PALETTE,
  ReviewResolutionAction,
  ReviewItemStatus,
  ImportItemProgress,
  ImportReviewItem,
  BatchExecutionProgress,
  DuplicateHandlingPolicy,
  FailedRetryBehaviour,
} from '../types/brain';
import {
  brainStore,
  CompanionDeviceRecord,
  CompanionCaptureItem,
  CompanionUnreachableResource,
  GatewayStatusInfo,
} from '../services/brainStorage';
import { BrainLogo } from './BrainLogo';
import {
  extractItemsFromFile,
  ExtractedFileResult,
  SUPPORTED_FILE_EXTENSIONS,
  inferFileTypeFromExtension,
  cleanTitleFromFileName,
  formatReadableTitle,
} from '../services/fileExtractor';
import { areDocumentsExactDuplicates } from '../services/semanticChunker';
import {
  ImportReviewQueue,
  DEFAULT_IMPORT_CONCURRENCY,
  normalizeImportConcurrency,
  computeImportCheckpointKey,
  filterRemainingItemsAfterInterruption,
  runWithControlledConcurrency,
  isItemEligibleForAction,
  getDefaultResolutionForDuplicateState,
  canSilentlyImportItem,
  applyBulkTitleFormatting,
  applyBulkSourceAssignment,
} from './ImportReviewQueue';

export type CaptureHubTab = 'companion' | 'import' | 'paste' | 'export';

export type {
  ImportReviewItem as ReviewQueueItem,
  ImportItemProgress,
  ReviewResolutionAction,
  ReviewItemStatus,
};

export interface CaptureHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBrain: string;
  brains: string[];
  initialTab?: CaptureHubTab;
  initialConcurrencyLimit?: number;
  onCreateBrain?: (name: string) => void;
  onImportComplete?: (summary: {
    imported: number;
    skipped: number;
    failed: number;
  }) => void;
  onIngest: (
    brain: string,
    source: AISource,
    rawText: string,
    chunkSize: number,
    fileName?: string,
    fileType?: FactFileType,
    strategy?: IngestStrategy
  ) => number;
}

const WORKFLOW_STEPS = [
  'CAPTURE',
  'REVIEW',
  'ORGANISE',
  'STORE',
  'RECALL',
  'EXPORT',
] as const;

const BULK_CONCURRENCY_LIMIT = DEFAULT_IMPORT_CONCURRENCY;

/**
 * Reconciles intra-queue exact duplicates so that when multiple identical files
 * with different filenames or archive paths (e.g. unpacked from a .ZIP archive)
 * are staged together in the Review Queue for the same destination Brain,
 * subsequent identical items are flagged as `exact_duplicate` (default `skip`)
 * while preserving original `fileName` and `filePath`.
 */
export function reconcileIntraQueueDuplicates(
  items: ImportReviewItem[]
): ImportReviewItem[] {
  const result: ImportReviewItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const current = items[i];
    if (
      current.status !== 'ready' ||
      !current.text ||
      !current.text.trim() ||
      current.duplicateState === 'exact_duplicate'
    ) {
      result.push(current);
      continue;
    }

    const earlierDuplicate = result.find(
      (prev) =>
        prev.id !== current.id &&
        prev.destinationBrain === current.destinationBrain &&
        prev.status !== 'error' &&
        prev.status !== 'skipped' &&
        prev.text &&
        prev.text.trim() &&
        areDocumentsExactDuplicates(
          prev.text,
          current.text,
          [prev.title, prev.fileName, prev.filePath],
          [current.title, current.fileName, current.filePath]
        )
    );

    if (earlierDuplicate) {
      result.push({
        ...current,
        duplicateState: 'exact_duplicate',
        resolution:
          current.resolution === 'create' || current.resolution === 'undecided'
            ? 'skip'
            : current.resolution,
        statusMessage: `Exact duplicate of staged item "${earlierDuplicate.fileName}" (Skip by default)`,
        nodeCheck: {
          exists: true,
          hasDiff: false,
          isIdentical: true,
          newSectionsDetected: 0,
          recommendedAction: 'skip',
          duplicateState: 'exact_duplicate',
          summary: `Exact duplicate of staged item "${earlierDuplicate.fileName}" (Skip by default)`,
        },
      });
    } else {
      result.push(current);
    }
  }

  return result;
}

export const CaptureHubModal: React.FC<CaptureHubModalProps> = ({
  isOpen,
  onClose,
  currentBrain,
  brains,
  initialTab = 'import',
  initialConcurrencyLimit,
  onCreateBrain,
  onImportComplete,
}) => {
  const initialGlobalImport = brainStore.getGlobalSettings().importProcessing;
  const [activeTab, setActiveTab] = useState<CaptureHubTab>(initialTab);
  const [defaultBrain, setDefaultBrain] = useState<string>(
    currentBrain || initialGlobalImport.defaultBrain || 'coding'
  );
  const [ingestStrategy, setIngestStrategy] = useState<IngestStrategy>(
    initialGlobalImport.defaultStrategy || 'semantic'
  );
  const [chunkSize, setChunkSize] = useState<number>(
    initialGlobalImport.chunkSize || 1200
  );
  const [maxFilesPerBatch, setMaxFilesPerBatch] = useState<number>(
    initialGlobalImport.maxFilesPerBatch || 1000
  );
  const [duplicateDetectionEnabled, setDuplicateDetectionEnabled] =
    useState<boolean>(initialGlobalImport.duplicateDetectionEnabled ?? true);
  const [defaultDuplicatePolicy, setDefaultDuplicatePolicy] =
    useState<DuplicateHandlingPolicy>(
      initialGlobalImport.defaultDuplicatePolicy || 'skip'
    );
  const [maxRetries, setMaxRetries] = useState<number>(
    initialGlobalImport.maxRetries ?? 2
  );
  const [failedRetryBehaviour, setFailedRetryBehaviour] =
    useState<FailedRetryBehaviour>(
      initialGlobalImport.failedRetryBehaviour || 'manual'
    );
  const [totalRetriedCount, setTotalRetriedCount] = useState<number>(0);
  const [storeRevision, setStoreRevision] = useState<number>(0);

  // Inline brain creation inside Capture Hub
  const [isCreatingBrain, setIsCreatingBrain] = useState(false);
  const [newBrainInput, setNewBrainInput] = useState('');

  // --- Workflow 1: Browser Companion State ---
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatusInfo>({
    online: false,
    factsCount: 0,
    brainsCount: 0,
    companionDevicesCount: 0,
  });
  const [devices, setDevices] = useState<CompanionDeviceRecord[]>([]);
  const [isLoadingCompanion, setIsLoadingCompanion] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceBrowser, setNewDeviceBrowser] = useState('Chrome / Chromium');
  const [newlyIssuedToken, setNewlyIssuedToken] = useState<{
    name: string;
    token: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [companionCaptures, setCompanionCaptures] = useState<
    CompanionCaptureItem[]
  >([]);
  const [companionUnreachable, setCompanionUnreachable] = useState<
    CompanionUnreachableResource[]
  >([]);
  const [companionStageBanner, setCompanionStageBanner] = useState<
    string | null
  >(null);

  // --- Workflow 2: Import Files & Review Queue State ---
  const [reviewQueue, setReviewQueue] = useState<ImportReviewItem[]>([]);
  const [selectedQueueIds, setSelectedQueueIds] = useState<string[]>([]);
  const [concurrencyLimit, setConcurrencyLimit] = useState<number>(
    normalizeImportConcurrency(
      initialConcurrencyLimit ?? initialGlobalImport.concurrency
    )
  );
  const completedCheckpointKeysRef = useRef<Set<string>>(new Set());
  const batchAbortControllerRef = useRef<AbortController | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [batchProgress, setBatchProgress] =
    useState<BatchExecutionProgress | null>(null);
  const [commitBanner, setCommitBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Workflow 3: Paste Conversation State ---
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteFileNameInput, setPasteFileNameInput] = useState('');
  const [pasteSource, setPasteSource] = useState<AISource>('claude');
  const [pasteBrain, setPasteBrain] = useState<string>(currentBrain);
  const [pasteTagsInput, setPasteTagsInput] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [pasteResolution, setPasteResolution] =
    useState<ReviewResolutionAction>('create');
  const [isStoringPaste, setIsStoringPaste] = useState(false);
  const [pasteErrorRetryAction, setPasteErrorRetryAction] = useState<
    'create' | 'merge' | 'replace' | null
  >(null);
  const [pasteStatusBanner, setPasteStatusBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // --- Workflow 4: Export State ---
  const [exportBrain, setExportBrain] = useState<string>(currentBrain);
  const [exportSourceFilter, setExportSourceFilter] = useState<
    AISource | 'all'
  >('all');
  const [exportIncludeMetadata, setExportIncludeMetadata] =
    useState<boolean>(true);
  const [exportGroupBySource, setExportGroupBySource] = useState<boolean>(true);
  const [exportCopied, setExportCopied] = useState(false);

  /**
   * Evaluates duplicate state in the destination Brain without modifying any existing content.
   * Explicit resolution rules:
   * - New -> Create
   * - Exact duplicate -> Skip by default
   * - Possible duplicate -> Ask user ('undecided')
   * - Related content -> Ask user ('undecided')
   * - Unable to determine -> Ask user ('undecided'); never silently Merge or Replace
   */
  const computeDuplicateEvaluation = (
    text: string,
    fileName: string,
    targetBrain: string,
    title?: string,
    hasExtractionError?: boolean,
    filePath?: string
  ): {
    nodeCheck?: ExistingFileNodeCheck;
    duplicateState: DuplicateDetectionState;
    status: ReviewItemStatus;
    resolution: ReviewResolutionAction;
  } => {
    if (hasExtractionError || !text || !text.trim() || !targetBrain) {
      return {
        duplicateState: 'unable_to_determine',
        status: hasExtractionError ? 'error' : 'ready',
        resolution: 'undecided',
      };
    }

    if (!duplicateDetectionEnabled) {
      return {
        duplicateState: 'new',
        status: 'ready',
        resolution: 'create',
      };
    }

    const effectivePath = (filePath || fileName || '').trim();
    const effectiveFileName = (fileName || effectivePath || 'untitled.md').trim();

    const nodeCheck = brainStore.checkExistingFileNode(
      targetBrain,
      effectiveFileName,
      text,
      effectivePath,
      title
    );

    const dupState: DuplicateDetectionState =
      nodeCheck.duplicateState ||
      (nodeCheck.exists
        ? nodeCheck.isIdentical
          ? 'exact_duplicate'
          : 'possible_duplicate'
        : 'new');

    let defaultResolution = getDefaultResolutionForDuplicateState(dupState);
    if (dupState !== 'new' && dupState !== 'unable_to_determine') {
      if (defaultDuplicatePolicy === 'skip') {
        defaultResolution = 'skip';
      } else if (defaultDuplicatePolicy === 'ask_user') {
        defaultResolution = dupState === 'exact_duplicate' ? 'skip' : 'undecided';
      } else if (defaultDuplicatePolicy === 'merge') {
        defaultResolution = dupState === 'exact_duplicate' ? 'skip' : 'merge';
      } else if (defaultDuplicatePolicy === 'replace') {
        defaultResolution = dupState === 'exact_duplicate' ? 'skip' : 'replace';
      }
    }

    return {
      nodeCheck,
      duplicateState: dupState,
      status: 'ready',
      resolution: defaultResolution,
    };
  };

  // Re-evaluate duplicate check when an item's destination brain, filename, filePath, title, or content changes
  const revalidateQueueItem = (item: ImportReviewItem): ImportReviewItem => {
    if (
      item.status === 'extracting' ||
      item.status === 'importing' ||
      item.status === 'processing' ||
      item.status === 'imported'
    ) {
      return item;
    }
    const evalResult = computeDuplicateEvaluation(
      item.text,
      item.fileName,
      item.destinationBrain,
      item.title,
      false,
      item.filePath || item.fileName
    );
    return {
      ...item,
      nodeCheck: evalResult.nodeCheck,
      duplicateState: evalResult.duplicateState,
      status: evalResult.status,
      resolution: evalResult.resolution,
      statusMessage: evalResult.nodeCheck?.summary,
      errorMessage: undefined,
    };
  };

  // Subscribe to brainStore updates so queue duplicate checks stay fresh when nodes are added/modified
  useEffect(() => {
    const unsubscribe = brainStore.subscribe(() => {
      setStoreRevision((r) => r + 1);
      setReviewQueue((prev) =>
        prev.map((item) => {
          if (item.status !== 'ready') return item;
          const evalResult = computeDuplicateEvaluation(
            item.text,
            item.fileName,
            item.destinationBrain,
            item.title,
            false,
            item.filePath || item.fileName
          );
          const preserveUserResolution =
            item.resolution !== 'undecided' &&
            !(
              evalResult.duplicateState === 'unable_to_determine' &&
              (item.resolution === 'merge' || item.resolution === 'replace')
            ) &&
            item.duplicateState === evalResult.duplicateState;
          return {
            ...item,
            nodeCheck: evalResult.nodeCheck,
            duplicateState: evalResult.duplicateState,
            statusMessage: evalResult.nodeCheck?.summary || item.statusMessage,
            resolution: preserveUserResolution
              ? item.resolution
              : evalResult.resolution,
          };
        })
      );
    });
    return unsubscribe;
  }, []);

  // Sync currentBrain and global import settings when modal opens
  useEffect(() => {
    if (isOpen) {
      const globalImport = brainStore.getGlobalSettings().importProcessing;
      setDefaultBrain(currentBrain || globalImport.defaultBrain || 'coding');
      setPasteBrain(currentBrain || globalImport.defaultBrain || 'coding');
      setExportBrain(currentBrain || globalImport.defaultBrain || 'coding');
      setIngestStrategy(globalImport.defaultStrategy || 'semantic');
      setChunkSize(globalImport.chunkSize || 1200);
      setMaxFilesPerBatch(globalImport.maxFilesPerBatch || 1000);
      setConcurrencyLimit(
        normalizeImportConcurrency(
          initialConcurrencyLimit ?? globalImport.concurrency
        )
      );
      setDuplicateDetectionEnabled(
        globalImport.duplicateDetectionEnabled ?? true
      );
      setDefaultDuplicatePolicy(globalImport.defaultDuplicatePolicy || 'skip');
      setMaxRetries(globalImport.maxRetries ?? 2);
      setFailedRetryBehaviour(globalImport.failedRetryBehaviour || 'manual');
      if (initialTab) {
        setActiveTab(initialTab);
      }
      refreshCompanionState();
    }
  }, [isOpen, currentBrain, initialTab, initialConcurrencyLimit]);

  const stageCompanionItemsIntoReviewQueue = (
    capturedItems: CompanionCaptureItem[]
  ) => {
    if (!capturedItems || capturedItems.length === 0) return;

    setReviewQueue((prev) => {
      const existingIds = new Set(prev.map((q) => q.id));
      const newQueueItems: ImportReviewItem[] = [];

      for (const cap of capturedItems) {
        if (existingIds.has(cap.id) || !cap.content?.trim()) continue;
        const targetBrain = cap.brain || defaultBrain;
        const formattedTitle = cap.title
          ? formatReadableTitle(cap.title)
          : cleanTitleFromFileName(cap.fileName);
        const evalRes = computeDuplicateEvaluation(
          cap.content,
          cap.fileName,
          targetBrain,
          formattedTitle,
          false,
          cap.filePath || cap.fileName
        );
        const ext =
          '.' + (cap.fileName.split('.').pop()?.toLowerCase() || 'md');

        newQueueItems.push({
          id: cap.id,
          title: formattedTitle,
          fileName: cap.fileName,
          filePath: cap.filePath || cap.fileName,
          fileType: cap.fileType || inferFileTypeFromExtension(ext),
          archiveParent: cap.projectName
            ? `Project: ${cap.projectName}`
            : cap.provenanceUrl
            ? 'Browser Companion'
            : undefined,
          extension: ext,
          sizeBytes: new Blob([cap.content]).size,
          text: cap.content,
          source: cap.source || 'claude',
          destinationBrain: targetBrain,
          itemCount: 1,
          itemUnitLabel: cap.resourceKind || 'resource',
          status: evalRes.status,
          statusMessage:
            evalRes.nodeCheck?.summary ||
            (cap.projectName
              ? `Captured from project "${cap.projectName}"`
              : 'Staged from Browser Companion'),
          duplicateState: evalRes.duplicateState,
          nodeCheck: evalRes.nodeCheck,
          resolution: evalRes.resolution,
          tags: Array.isArray(cap.tags) ? cap.tags : ['companion-capture'],
        });
      }

      if (newQueueItems.length === 0) return prev;
      return reconcileIntraQueueDuplicates([...newQueueItems, ...prev]);
    });
  };

  const refreshCompanionState = async () => {
    setIsLoadingCompanion(true);
    try {
      const [status, devList, stagedCaptures] = await Promise.all([
        brainStore.checkGatewayStatus(),
        brainStore.fetchCompanionDevices(),
        brainStore.fetchCompanionCaptures(),
      ]);
      setGatewayStatus(status);
      setDevices(devList);
      setCompanionCaptures(stagedCaptures);
      if (stagedCaptures.length > 0) {
        stageCompanionItemsIntoReviewQueue(stagedCaptures);
      }
    } finally {
      setIsLoadingCompanion(false);
    }
  };

  // Live duplicate evaluation for Paste tab
  const pasteEvaluation = useMemo(() => {
    const syntheticFileName =
      pasteFileNameInput.trim() ||
      (pasteTitle.trim()
        ? pasteTitle.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase() +
          '.md'
        : 'pasted_conversation.md');

    return computeDuplicateEvaluation(
      pasteContent,
      syntheticFileName,
      pasteBrain,
      pasteTitle.trim() || undefined,
      false,
      syntheticFileName
    );
  }, [
    pasteContent,
    pasteTitle,
    pasteFileNameInput,
    pasteBrain,
    storeRevision,
  ]);

  // Keep pasteResolution synced to safe defaults when paste duplicate state changes
  useEffect(() => {
    setPasteResolution(pasteEvaluation.resolution);
    setPasteErrorRetryAction(null);
  }, [pasteEvaluation.duplicateState, pasteBrain]);

  // Live Markdown preview for Export tab
  const exportedMarkdown = useMemo(() => {
    return brainStore.exportPortableMarkdown(exportBrain, {
      includeMetadata: exportIncludeMetadata,
      groupBySource: exportGroupBySource,
      sourceFilter: exportSourceFilter === 'all' ? null : exportSourceFilter,
    });
  }, [
    exportBrain,
    exportIncludeMetadata,
    exportGroupBySource,
    exportSourceFilter,
    isOpen,
    storeRevision,
  ]);

  const exportNodeCount = useMemo(() => {
    return brainStore.recall(
      exportBrain,
      '',
      exportSourceFilter === 'all' ? null : exportSourceFilter,
      null
    ).length;
  }, [exportBrain, exportSourceFilter, isOpen, storeRevision]);

  // Queue metrics (declared before early return)
  const queueMetrics = useMemo(() => {
    const total = reviewQueue.length;
    const imported = reviewQueue.filter((q) => q.status === 'imported').length;
    const skipped = reviewQueue.filter((q) => q.status === 'skipped').length;
    const failed = reviewQueue.filter((q) => q.status === 'error').length;
    const pending = reviewQueue.filter(
      (q) =>
        q.status === 'ready' ||
        q.status === 'extracting' ||
        q.status === 'importing' ||
        q.status === 'processing'
    ).length;
    const ready = reviewQueue.filter(
      (q) =>
        q.status === 'ready' &&
        q.resolution !== 'undecided' &&
        (q.resolution === 'skip' || canSilentlyImportItem(q))
    ).length;
    const needsDecision = reviewQueue.filter(
      (q) =>
        q.status === 'ready' &&
        (q.resolution === 'undecided' ||
          (q.duplicateState === 'unable_to_determine' &&
            q.resolution !== 'skip'))
    ).length;
    const duplicates = reviewQueue.filter(
      (q) =>
        q.duplicateState === 'possible_duplicate' ||
        q.duplicateState === 'exact_duplicate' ||
        q.duplicateState === 'related_content'
    ).length;
    const totalUnits = reviewQueue.reduce(
      (acc, q) => acc + (q.itemCount || 1),
      0
    );
    return {
      total,
      imported,
      skipped,
      failed,
      pending,
      retried: totalRetriedCount,
      ready,
      needsDecision,
      duplicates,
      totalUnits,
    };
  }, [reviewQueue, totalRetriedCount]);

  if (!isOpen) return null;

  const handleCopyText = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDefaultBrainChange = (nextBrain: string) => {
    const previousBrain = defaultBrain;
    setDefaultBrain(nextBrain);
    setPasteBrain(nextBrain);
    setExportBrain(nextBrain);
    // Re-evaluate queued items that were targeting the previous default brain and haven't been imported yet
    setReviewQueue((prev) =>
      prev.map((item) => {
        if (
          item.status === 'ready' &&
          item.destinationBrain === previousBrain
        ) {
          return revalidateQueueItem({
            ...item,
            destinationBrain: nextBrain,
          });
        }
        return item;
      })
    );
  };

  const handleCreateNewBrainInline = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newBrainInput.trim().toLowerCase();
    if (!cleaned) return;
    brainStore.createBrain(cleaned);
    if (onCreateBrain) onCreateBrain(cleaned);
    handleDefaultBrainChange(cleaned);
    setNewBrainInput('');
    setIsCreatingBrain(false);
  };

  // --- Workflow 1 Handlers ---
  const handleCreateDeviceToken = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newDeviceName.trim() || `${newDeviceBrowser} Companion`;
    const created = await brainStore.createCompanionDevice(
      label,
      newDeviceBrowser
    );
    if (created) {
      setNewlyIssuedToken({ name: created.device.name, token: created.token });
      setNewDeviceName('');
      await refreshCompanionState();
    }
  };

  const handleRevokeDevice = async (id: string) => {
    const ok = await brainStore.revokeCompanionDevice(id);
    if (ok) {
      await refreshCompanionState();
    }
  };

  const handleDeleteDevice = async (id: string) => {
    const ok = await brainStore.deleteCompanionDevice(id);
    if (ok) {
      await refreshCompanionState();
    }
  };

  const handleStageSampleProjectCapture = async () => {
    setCompanionStageBanner(null);
    const stageRes = await brainStore.stageCompanionProjectCapture({
      brain: defaultBrain,
      source: 'claude',
      projectName: 'The Brain Argon Architecture',
      provenanceUrl: 'https://claude.ai/project/argon-memory-workspace',
      items: [
        {
          title: 'argon_project_system_instructions_v2',
          fileName: 'argon_project_system_instructions_v2.md',
          filePath:
            'claude-project/The_Brain_Argon_Architecture/argon_project_system_instructions_v2.md',
          fileType: 'md',
          resourceKind: 'project_instructions',
          content: `# Argon Project System Instructions\n\n> Provenance: https://claude.ai/project/argon-memory-workspace\n\nAlways preserve Argon's local-first persistence model (localStorage + local SQLite gateway) and route multi-file captures through ImportReviewQueue.`,
          tags: ['companion-capture', 'project-instructions', 'claude'],
        },
        {
          title: 'capture_hub_deduplication_spec_artifact',
          fileName: 'capture_hub_deduplication_spec_artifact.md',
          filePath:
            'claude-project/The_Brain_Argon_Architecture/capture_hub_deduplication_spec_artifact.md',
          fileType: 'md',
          resourceKind: 'artifact',
          content: `# Capture Hub Deduplication Spec\n\n> Provenance: https://claude.ai/project/argon-memory-workspace\n\nCompare normalized document bodies after stripping leading auto-generated title headings so renamed copies are detected as exact duplicates.`,
          tags: ['companion-capture', 'artifact', 'claude'],
        },
      ],
      unreachableResources: [
        {
          name: 'architecture_whitepaper_scan.pdf',
          kind: 'pdf',
          reason:
            'Binary attachment card is not expanded in page DOM — download and drop into Import & Review',
        },
      ],
    });

    setCompanionUnreachable(stageRes.unreachableResources || []);
    stageCompanionItemsIntoReviewQueue(stageRes.items);
    const refreshed = await brainStore.fetchCompanionCaptures();
    setCompanionCaptures(refreshed);
    setCompanionStageBanner(
      `Staged ${stageRes.stagedCount} project resource(s) from "The Brain Argon Architecture" into the Import Review Queue with full provenance.`
    );
  };

  // --- Workflow 2: File Selection & Review Queue Action Handlers ---
  const handleFilesSelected = async (files: FileList | File[]) => {
    setCommitBanner(null);
    const rawFileArray = Array.from(files);
    const effectiveLimit = Math.max(1, Math.min(5000, maxFilesPerBatch || 1000));
    const fileArray =
      rawFileArray.length > effectiveLimit
        ? rawFileArray.slice(0, effectiveLimit)
        : rawFileArray;

    if (rawFileArray.length > effectiveLimit) {
      setCommitBanner({
        type: 'warning',
        text: `Selected ${rawFileArray.length} files; capped at configured batch limit of ${effectiveLimit} files per batch (adjustable in Settings → Import & Processing).`,
      });
    }

    let discoveredCountInBatch = 0;

    for (const file of fileArray) {
      const remainingSlots = Math.max(1, effectiveLimit - discoveredCountInBatch);
      const placeholderId = `rq-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || 'txt');
      const relativePath =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
        file.name;

      const placeholderItem: ImportReviewItem = {
        id: placeholderId,
        title: cleanTitleFromFileName(file.name),
        fileName: file.name,
        filePath: relativePath,
        fileType: inferFileTypeFromExtension(ext),
        extension: ext,
        sizeBytes: file.size,
        text: '',
        source: 'claude',
        destinationBrain: defaultBrain,
        itemCount: 1,
        itemUnitLabel: 'document',
        status: 'extracting',
        duplicateState: 'unable_to_determine',
        resolution: 'undecided',
        tags: [],
        progress: {
          mode: 'indeterminate',
          phase: 'extracting',
          label: 'Extracting…',
        },
      };

      setReviewQueue((prev) => [...prev, placeholderItem]);

      try {
        const extractedItems: ExtractedFileResult[] =
          await extractItemsFromFile(
            file,
            (progInfo) => {
              setReviewQueue((prev) =>
                prev.map((item) =>
                  item.id === placeholderId
                    ? {
                        ...item,
                        progress: {
                          mode: progInfo.mode,
                          phase: 'extracting',
                          current: progInfo.current,
                          total: progInfo.total,
                          unit: progInfo.unit,
                          label: progInfo.label,
                        },
                      }
                    : item
                )
              );
            },
            { maxFilesPerBatch: remainingSlots }
          );
        discoveredCountInBatch += extractedItems.length;

        const batchId = `batch_${Date.now().toString(36)}`;
        const nowIso = new Date().toISOString();
        const mappedItems: ImportReviewItem[] = extractedItems.map(
          (extItem, idx) => {
            const hasErr = extItem.status === 'error' || !extItem.text.trim();
            const itemTitle =
              extItem.title
                ? formatReadableTitle(extItem.title)
                : cleanTitleFromFileName(extItem.fileName);
            const effectiveFilePath = extItem.filePath || extItem.fileName;
            const evalRes = computeDuplicateEvaluation(
              extItem.text,
              extItem.fileName,
              defaultBrain,
              itemTitle,
              hasErr,
              effectiveFilePath
            );
            const baseTags = extItem.archiveParent ? ['archive-import'] : [];
            const mergedTags = Array.from(
              new Set([...baseTags, ...(extItem.extractedTags || [])])
            );
            return {
              id: `${placeholderId}-${idx}`,
              title: itemTitle,
              fileName: extItem.fileName,
              filePath: effectiveFilePath,
              fileType:
                extItem.fileType ||
                inferFileTypeFromExtension(extItem.extension),
              archiveParent: extItem.archiveParent,
              extension: extItem.extension,
              sizeBytes: extItem.sizeBytes,
              text: extItem.text,
              source: extItem.detectedSource,
              destinationBrain: defaultBrain,
              itemCount: extItem.pageOrItemCount || 1,
              itemUnitLabel: extItem.itemUnitLabel || 'document',
              status: evalRes.status,
              statusMessage:
                extItem.statusMessage || evalRes.nodeCheck?.summary,
              errorMessage: hasErr
                ? extItem.statusMessage || 'Unable to extract readable text'
                : undefined,
              duplicateState: evalRes.duplicateState,
              nodeCheck: evalRes.nodeCheck,
              resolution: evalRes.resolution,
              tags: mergedTags,
              sourceFolder: extItem.sourceFolder,
              originalCreatedAt: extItem.originalCreatedAt ?? null,
              importedAt: nowIso,
              importBatchId: batchId,
              checksum: extItem.checksum,
              extractionStatus: extItem.extractionStatus || (hasErr ? 'failed' : 'ok'),
              extractionWarnings: extItem.extractionWarnings,
              relatedSources: extItem.relatedSources,
              fixtureId: extItem.fixtureId,
              topicKey: extItem.topicKey,
              structuredData: extItem.structuredData,
              progress: undefined,
            };
          }
        );

        setReviewQueue((prev) =>
          reconcileIntraQueueDuplicates(
            prev.flatMap((item) =>
              item.id === placeholderId ? mappedItems : [item]
            )
          )
        );
      } catch (err: any) {
        setReviewQueue((prev) =>
          prev.map((item) =>
            item.id === placeholderId
              ? {
                  ...item,
                  status: 'error',
                  duplicateState: 'unable_to_determine',
                  errorMessage: err?.message || 'Failed to parse file',
                  statusMessage: err?.message || 'Failed to parse file',
                  resolution: 'undecided',
                  progress: undefined,
                }
              : item
          )
        );
      }
    }
  };

  const handleUpdateQueueItem = (
    id: string,
    patch: Partial<
      Pick<
        ImportReviewItem,
        | 'title'
        | 'fileName'
        | 'filePath'
        | 'text'
        | 'source'
        | 'destinationBrain'
        | 'resolution'
        | 'tags'
        | 'simulateFailureOnce'
      >
    >
  ) => {
    setReviewQueue((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated: ImportReviewItem = { ...item, ...patch };
        if (
          patch.destinationBrain !== undefined ||
          patch.title !== undefined ||
          patch.fileName !== undefined ||
          patch.filePath !== undefined ||
          patch.text !== undefined
        ) {
          return revalidateQueueItem(updated);
        }
        return updated;
      })
    );
  };

  const handleRemoveQueueItem = (id: string) => {
    setReviewQueue((prev) => prev.filter((item) => item.id !== id));
    setSelectedQueueIds((prev) => prev.filter((selId) => selId !== id));
    brainStore.consumeCompanionCapture(id).catch(() => {});
  };

  /**
   * Executes a single item persistence action ('create' | 'merge' | 'replace')
   * against the backend.
   * - Never optimistically marks as Imported.
   * - Never allows Merge or Replace when duplicateState === 'unable_to_determine'.
   * - Reports determinate progress ONLY when multi-chunk/record operations provide real counts;
   *   otherwise uses indeterminate progress.
   */
  const executeItemPersistence = async (
    item: ImportReviewItem,
    action: 'create' | 'merge' | 'replace'
  ): Promise<boolean> => {
    if (
      item.status === 'processing' ||
      item.status === 'importing' ||
      item.status === 'extracting'
    ) {
      return false;
    }

    // Avoid reprocessing files that have already been successfully imported prior to an interruption
    const checkpointKey = computeImportCheckpointKey(item);
    if (
      item.status === 'imported' ||
      completedCheckpointKeysRef.current.has(checkpointKey)
    ) {
      setReviewQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: 'imported',
                errorMessage: undefined,
                statusMessage:
                  q.statusMessage ||
                  'Already imported prior to interruption — skipped reprocessing.',
                progress: undefined,
              }
            : q
        )
      );
      return true;
    }

    // Strict Duplicate Safety Rule: NEVER allow Merge or Replace if duplicate state is Unable to determine
    if (
      item.duplicateState === 'unable_to_determine' &&
      (action === 'merge' || action === 'replace')
    ) {
      const blockedMsg =
        'Duplicate status cannot be determined — Merge and Replace are blocked for safety. Choose Create or Skip, or provide readable content.';
      setReviewQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: 'error',
                errorMessage: blockedMsg,
                statusMessage: blockedMsg,
                progress: undefined,
              }
            : q
        )
      );
      return false;
    }

    // Safeguard: never overwrite if content is empty
    if (!item.text || !item.text.trim()) {
      const emptyMsg =
        'Cannot persist item with empty content. Destination content was not modified.';
      setReviewQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: 'error',
                errorMessage: emptyMsg,
                statusMessage: emptyMsg,
                progress: undefined,
              }
            : q
        )
      );
      return false;
    }

    const activeStatus: ReviewItemStatus =
      action === 'create' ? 'importing' : 'processing';

    setReviewQueue((prev) =>
      prev.map((q) =>
        q.id === item.id
          ? {
              ...q,
              status: activeStatus,
              resolution: action,
              lastAttemptedAction: action,
              errorMessage: undefined,
              statusMessage:
                action === 'merge'
                  ? 'Merging with destination node…'
                  : action === 'replace'
                  ? 'Replacing destination node…'
                  : 'Persisting new node to Brain…',
              progress: {
                mode: 'indeterminate',
                phase: action === 'create' ? 'importing' : 'processing',
                label:
                  action === 'create' ? 'Importing…' : 'Processing…',
              },
            }
          : q
      )
    );

    try {
      const result = await brainStore.persistReviewedItem({
        action,
        brain: item.destinationBrain,
        source: item.source,
        title: item.title,
        content: item.text,
        fileName: item.fileName,
        filePath: item.filePath || item.fileName,
        fileType:
          item.fileType || inferFileTypeFromExtension(item.extension),
        tags: item.tags,
        targetFactId: item.nodeCheck?.existingFact?.id,
        strategy: ingestStrategy,
        chunkSize,
        simulateFailure: Boolean(item.simulateFailureOnce),
        sourceFolder: item.sourceFolder,
        originalCreatedAt: item.originalCreatedAt,
        importedAt: item.importedAt,
        importBatchId: item.importBatchId,
        checksum: item.checksum,
        extractionStatus: item.extractionStatus,
        extractionWarnings: item.extractionWarnings,
        relatedSources: item.relatedSources,
        fixtureId: item.fixtureId,
        topicKey: item.topicKey,
        fileSizeBytes: item.sizeBytes,
        structuredData: item.structuredData,
        onProgress: (prog) => {
          setReviewQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    progress: {
                      mode: prog.mode,
                      phase: action === 'create' ? 'importing' : 'processing',
                      current: prog.current,
                      total: prog.total,
                      unit: prog.unit,
                      label: prog.label,
                    },
                  }
                : q
            )
          );
        },
      });

      // Only mark as Imported AFTER backend/local persistence succeeds
      completedCheckpointKeysRef.current.add(checkpointKey);
      setReviewQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: 'imported',
                resolution: action,
                simulateFailureOnce: false,
                errorMessage: undefined,
                statusMessage: result.message,
                progress: undefined,
              }
            : q
        )
      );
      brainStore.consumeCompanionCapture(item.id).catch(() => {});
      return true;
    } catch (err: any) {
      const message =
        err?.message ||
        'Persistence failed. Existing content was not modified.';
      setReviewQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: 'error',
                // Clear one-shot simulated failure flag so subsequent Retry succeeds
                simulateFailureOnce: false,
                errorMessage: message,
                statusMessage: message,
                lastAttemptedAction: action,
                progress: undefined,
              }
            : q
        )
      );
      return false;
    }
  };

  const handleMergeItem = async (item: ImportReviewItem): Promise<boolean> => {
    const ok = await executeItemPersistence(item, 'merge');
    onImportComplete?.({
      imported: ok ? 1 : 0,
      skipped: 0,
      failed: ok ? 0 : 1,
    });
    return ok;
  };

  const handleReplaceItem = async (
    item: ImportReviewItem
  ): Promise<boolean> => {
    const ok = await executeItemPersistence(item, 'replace');
    onImportComplete?.({
      imported: ok ? 1 : 0,
      skipped: 0,
      failed: ok ? 0 : 1,
    });
    return ok;
  };

  const handleImportNewItem = async (
    item: ImportReviewItem
  ): Promise<boolean> => {
    const ok = await executeItemPersistence(item, 'create');
    onImportComplete?.({
      imported: ok ? 1 : 0,
      skipped: 0,
      failed: ok ? 0 : 1,
    });
    return ok;
  };

  const handleSkipItem = (item: ImportReviewItem) => {
    if (
      item.status === 'processing' ||
      item.status === 'importing' ||
      item.status === 'extracting'
    ) {
      return;
    }
    setReviewQueue((prev) =>
      prev.map((q) =>
        q.id === item.id
          ? {
              ...q,
              status: 'skipped',
              resolution: 'skip',
              errorMessage: undefined,
              statusMessage: 'Skipped — destination not modified',
              progress: undefined,
            }
          : q
      )
    );
    brainStore.consumeCompanionCapture(item.id).catch(() => {});
  };

  const handleRetryItem = async (item: ImportReviewItem): Promise<boolean> => {
    const retryAction: 'create' | 'merge' | 'replace' =
      item.lastAttemptedAction ||
      (item.resolution === 'merge'
        ? 'merge'
        : item.resolution === 'replace'
        ? 'replace'
        : 'create');
    // Ensure simulateFailureOnce is cleared on retry
    const cleanItem: ImportReviewItem = {
      ...item,
      simulateFailureOnce: false,
    };
    setTotalRetriedCount((r) => r + 1);
    const ok = await executeItemPersistence(cleanItem, retryAction);
    onImportComplete?.({
      imported: ok ? 1 : 0,
      skipped: 0,
      failed: ok ? 0 : 1,
    });
    return ok;
  };

  const handleCancelBatch = () => {
    if (batchAbortControllerRef.current) {
      batchAbortControllerRef.current.abort();
    }
  };

  const handleRetryAllFailed = async (failedItems: ImportReviewItem[]) => {
    if (failedItems.length === 0 || isCommitting) return;
    setIsCommitting(true);
    setCommitBanner(null);

    let succeededCount = 0;
    let failedCount = 0;
    let completedCount = 0;
    let activeWorkers = 0;
    const { remaining: retryTargets } = filterRemainingItemsAfterInterruption(
      failedItems,
      completedCheckpointKeysRef.current
    );
    if (retryTargets.length === 0) {
      setIsCommitting(false);
      return;
    }
    const totalToRun = retryTargets.length;
    const activeConcurrency = normalizeImportConcurrency(concurrencyLimit);

    setBatchProgress({
      actionLabel: 'Retry Failed Items',
      completed: 0,
      total: totalToRun,
      activeCount: Math.min(activeConcurrency, totalToRun),
    });

    try {
      await runWithControlledConcurrency(
        retryTargets,
        activeConcurrency,
        async (item) => {
          activeWorkers++;
          setBatchProgress({
            actionLabel: 'Retry Failed Items',
            completed: completedCount,
            total: totalToRun,
            activeCount: activeWorkers,
          });
          try {
            const ok = await handleRetryItem(item);
            if (ok) succeededCount++;
            else failedCount++;
          } finally {
            activeWorkers--;
            completedCount++;
            setBatchProgress({
              actionLabel: 'Retry Failed Items',
              completed: completedCount,
              total: totalToRun,
              activeCount: activeWorkers,
            });
          }
        },
        {
          shouldSkip: (item) =>
            item.status === 'imported' ||
            completedCheckpointKeysRef.current.has(
              computeImportCheckpointKey(item)
            ),
          onSkipped: () => {
            completedCount++;
          },
        }
      );
    } finally {
      setBatchProgress(null);
      setIsCommitting(false);
    }

    const parts: string[] = [];
    if (succeededCount > 0) parts.push(`${succeededCount} imported`);
    if (failedCount > 0) parts.push(`${failedCount} failed (retry available)`);

    setCommitBanner({
      type:
        failedCount > 0
          ? succeededCount > 0
            ? 'warning'
            : 'error'
          : 'success',
      text: `Retry finished: ${parts.join(' · ')}.`,
    });
  };

  // --- Bulk Action Handlers (Reusing single-item persistence + Controlled Concurrency) ---
  const handleBulkAction = async (
    itemsToProcess: ImportReviewItem[],
    action: 'merge' | 'replace' | 'skip'
  ) => {
    if (itemsToProcess.length === 0) return;

    if (action === 'skip') {
      let skippedCount = 0;
      for (const item of itemsToProcess) {
        if (isItemEligibleForAction(item, 'skip').eligible) {
          handleSkipItem(item);
          skippedCount++;
        }
      }
      if (skippedCount > 0) {
        setCommitBanner({
          type: 'success',
          text: `Bulk Skip complete: ${skippedCount} ${
            skippedCount === 1 ? 'item' : 'items'
          } marked as Skipped.`,
        });
        onImportComplete?.({
          imported: 0,
          skipped: skippedCount,
          failed: 0,
        });
      }
      return;
    }

    const { remaining: candidateItems } = filterRemainingItemsAfterInterruption(
      itemsToProcess,
      completedCheckpointKeysRef.current
    );
    const eligibleItems = candidateItems.filter(
      (item) => isItemEligibleForAction(item, action).eligible
    );
    if (eligibleItems.length === 0) return;

    setIsCommitting(true);
    setCommitBanner(null);

    let succeededCount = 0;
    let failedCount = 0;
    let completedCount = 0;
    let activeWorkers = 0;
    const totalToRun = eligibleItems.length;
    const label = action === 'merge' ? 'Bulk Merge' : 'Bulk Replace';
    const activeConcurrency = normalizeImportConcurrency(concurrencyLimit);

    setBatchProgress({
      actionLabel: label,
      completed: 0,
      total: totalToRun,
      activeCount: Math.min(activeConcurrency, totalToRun),
    });

    try {
      await runWithControlledConcurrency(
        eligibleItems,
        activeConcurrency,
        async (item) => {
          activeWorkers++;
          setBatchProgress({
            actionLabel: label,
            completed: completedCount,
            total: totalToRun,
            activeCount: activeWorkers,
          });
          try {
            const ok = await executeItemPersistence(item, action);
            if (ok) {
              succeededCount++;
            } else {
              failedCount++;
            }
          } finally {
            activeWorkers--;
            completedCount++;
            setBatchProgress({
              actionLabel: label,
              completed: completedCount,
              total: totalToRun,
              activeCount: activeWorkers,
            });
          }
        },
        {
          shouldSkip: (item) =>
            item.status === 'imported' ||
            completedCheckpointKeysRef.current.has(
              computeImportCheckpointKey(item)
            ),
          onSkipped: () => {
            completedCount++;
          },
        }
      );
    } finally {
      setBatchProgress(null);
      setIsCommitting(false);
    }

    const summaryParts: string[] = [];
    if (succeededCount > 0) summaryParts.push(`${succeededCount} imported`);
    if (failedCount > 0) {
      summaryParts.push(`${failedCount} failed (retry available)`);
    }

    setCommitBanner({
      type:
        failedCount > 0
          ? succeededCount > 0
            ? 'warning'
            : 'error'
          : 'success',
      text: `${label} finished: ${summaryParts.join(' · ')}.`,
    });

    onImportComplete?.({
      imported: succeededCount,
      skipped: 0,
      failed: failedCount,
    });
  };

  const handleBulkFormatTitles = (itemsToFormat: ImportReviewItem[]) => {
    if (itemsToFormat.length === 0) return;
    const ids = itemsToFormat.map((i) => i.id);
    setReviewQueue((prev) => {
      const { updatedItems } = applyBulkTitleFormatting(prev, ids);
      return updatedItems;
    });
    setCommitBanner({
      type: 'success',
      text: `Formatted ${itemsToFormat.length} ${
        itemsToFormat.length === 1 ? 'title' : 'titles'
      } into Title Case (original filenames and paths preserved).`,
    });
  };

  const handleBulkAssignSource = (
    itemsToUpdate: ImportReviewItem[],
    source: AISource
  ) => {
    if (itemsToUpdate.length === 0) return;
    const ids = itemsToUpdate.map((i) => i.id);
    setReviewQueue((prev) => {
      const { updatedItems } = applyBulkSourceAssignment(prev, ids, source);
      return updatedItems;
    });
    setCommitBanner({
      type: 'success',
      text: `Assigned source "${
        SOURCE_PALETTE[source]?.name || source
      }" to ${itemsToUpdate.length} selected ${
        itemsToUpdate.length === 1 ? 'item' : 'items'
      }.`,
    });
  };

  const handleCommitReviewQueue = async () => {
    const actionable = reviewQueue.filter(
      (item) => item.status === 'ready' && item.resolution !== 'undecided'
    );
    if (actionable.length === 0) return;

    setIsCommitting(true);
    setCommitBanner(null);

    const abortController = new AbortController();
    batchAbortControllerRef.current = abortController;

    let succeededCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let retriedInRun = 0;

    const toPersist: {
      item: ImportReviewItem;
      action: 'create' | 'merge' | 'replace';
    }[] = [];

    for (const item of actionable) {
      if (item.resolution === 'skip') {
        handleSkipItem(item);
        skippedCount++;
        continue;
      }

      // Never allow an unknown duplicate state ('unable_to_determine') to be silently imported
      if (
        item.duplicateState === 'unable_to_determine' ||
        !canSilentlyImportItem(item)
      ) {
        continue;
      }

      const actionToRun: 'create' | 'merge' | 'replace' =
        item.resolution === 'merge'
          ? 'merge'
          : item.resolution === 'replace'
          ? 'replace'
          : 'create';

      toPersist.push({ item, action: actionToRun });
    }

    const totalToRun = toPersist.length;
    let completedCount = 0;
    let activeWorkers = 0;
    const activeConcurrency = normalizeImportConcurrency(concurrencyLimit);

    if (totalToRun > 0) {
      setBatchProgress({
        actionLabel: 'Queue Import',
        completed: 0,
        total: totalToRun,
        activeCount: Math.min(activeConcurrency, totalToRun),
        pending: totalToRun,
        retried: 0,
      });
    }

    try {
      await runWithControlledConcurrency(
        toPersist,
        activeConcurrency,
        async ({ item, action }) => {
          activeWorkers++;
          setBatchProgress({
            actionLabel: 'Queue Import',
            completed: completedCount,
            total: totalToRun,
            activeCount: activeWorkers,
            pending: Math.max(0, totalToRun - completedCount),
            retried: retriedInRun,
          });
          try {
            let ok = await executeItemPersistence(item, action);
            if (
              !ok &&
              failedRetryBehaviour === 'auto_retry_transient' &&
              maxRetries > 0 &&
              !abortController.signal.aborted
            ) {
              for (let attempt = 1; attempt <= maxRetries; attempt++) {
                if (abortController.signal.aborted) break;
                retriedInRun++;
                setTotalRetriedCount((r) => r + 1);
                const retryClean: ImportReviewItem = {
                  ...item,
                  simulateFailureOnce: false,
                };
                ok = await executeItemPersistence(retryClean, action);
                if (ok) break;
              }
            }
            if (ok) {
              succeededCount++;
            } else {
              failedCount++;
            }
          } finally {
            activeWorkers--;
            completedCount++;
            setBatchProgress({
              actionLabel: 'Queue Import',
              completed: completedCount,
              total: totalToRun,
              activeCount: activeWorkers,
              pending: Math.max(0, totalToRun - completedCount),
              retried: retriedInRun,
            });
          }
        },
        {
          signal: abortController.signal,
          shouldSkip: ({ item }) =>
            item.status === 'imported' ||
            completedCheckpointKeysRef.current.has(
              computeImportCheckpointKey(item)
            ),
          onSkipped: () => {
            completedCount++;
          },
        }
      );
    } finally {
      batchAbortControllerRef.current = null;
      setBatchProgress(null);
      setIsCommitting(false);
    }

    const globalImport = brainStore.getGlobalSettings().importProcessing;
    let postImportBackupNote = '';
    if (
      globalImport.autoBackupAfterLargeImport &&
      succeededCount >= (globalImport.largeImportBackupThreshold || 50)
    ) {
      const backupRes = await brainStore.runAutoBackupCheck(true, 'post-import');
      if (backupRes.triggered && backupRes.backup) {
        postImportBackupNote = ` · Post-import safety backup created (${backupRes.backup.fileName})`;
      }
    }

    const undecidedRemaining = reviewQueue.filter(
      (item) => item.status === 'ready' && item.resolution === 'undecided'
    ).length;
    const pendingRemaining = Math.max(
      0,
      reviewQueue.length - (succeededCount + skippedCount + failedCount)
    );

    const parts: string[] = [
      `${reviewQueue.length} discovered`,
      `${succeededCount} imported`,
      `${skippedCount} skipped`,
      `${failedCount} failed`,
      `${pendingRemaining} pending`,
      `${retriedInRun} retried`,
    ];
    if (abortController.signal.aborted) {
      parts.push('cancelled by user (completed items preserved)');
    } else if (undecidedRemaining > 0) {
      parts.push(`${undecidedRemaining} awaiting explicit user decision`);
    }

    setCommitBanner({
      type:
        failedCount > 0 || abortController.signal.aborted
          ? succeededCount > 0
            ? 'warning'
            : 'error'
          : undecidedRemaining > 0
          ? 'warning'
          : 'success',
      text: `Batch result (${
        succeededCount + skippedCount + failedCount
      } processed): ${parts.join(' · ')}${postImportBackupNote}.`,
    });

    onImportComplete?.({
      imported: succeededCount,
      skipped: skippedCount,
      failed: failedCount,
    });
  };

  // --- Workflow 3: Paste Conversation Handlers ---
  const countConversationUnits = (
    raw: string
  ): { count: number; label: string } => {
    const turnMatches = raw.match(
      /(?:^|\n)(?:####\s*(?:User|Assistant|Human|Claude|ChatGPT|Gemini)|(?:User|Assistant|Human|AI):)/gi
    );
    if (turnMatches && turnMatches.length >= 2) {
      return {
        count: turnMatches.length,
        label: turnMatches.length === 1 ? 'turn' : 'turns',
      };
    }
    const headingMatches = raw.match(/^#{1,3}\s+.+$/gm);
    if (headingMatches && headingMatches.length >= 2) {
      return { count: headingMatches.length, label: 'sections' };
    }
    return { count: 1, label: 'conversation' };
  };

  const handleQueuePastedConversation = () => {
    if (!pasteContent.trim()) return;
    const cleanTitle =
      pasteTitle.trim() ||
      `${SOURCE_PALETTE[pasteSource].name} Conversation (${new Date().toLocaleDateString()})`;
    const fileName =
      pasteFileNameInput.trim() ||
      cleanTitle.replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase() + '.md';
    const units = countConversationUnits(pasteContent);
    const parsedTags = pasteTagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const evalRes = computeDuplicateEvaluation(
      pasteContent,
      fileName,
      pasteBrain,
      cleanTitle,
      false,
      fileName
    );

    const chosenResolution =
      pasteResolution !== 'undecided' ? pasteResolution : evalRes.resolution;

    const newItem: ImportReviewItem = {
      id: `paste-${Date.now()}`,
      title: cleanTitle,
      fileName,
      filePath: fileName,
      fileType: 'chat',
      extension: '.md',
      sizeBytes: new Blob([pasteContent]).size,
      text: pasteContent,
      source: pasteSource,
      destinationBrain: pasteBrain,
      itemCount: units.count,
      itemUnitLabel: units.label,
      status: evalRes.status,
      statusMessage:
        evalRes.nodeCheck?.summary || 'Staged from manual conversation paste',
      duplicateState: evalRes.duplicateState,
      nodeCheck: evalRes.nodeCheck,
      resolution: chosenResolution,
      tags: parsedTags,
    };

    setReviewQueue((prev) => [newItem, ...prev]);
    setPasteTitle('');
    setPasteFileNameInput('');
    setPasteContent('');
    setPasteTagsInput('');
    setActiveTab('import');
  };

  const handleExecutePasteResolution = async (
    explicitAction?: 'create' | 'merge' | 'replace' | 'skip'
  ) => {
    if (!pasteContent.trim() || isStoringPaste) return;

    const chosen =
      explicitAction ||
      (pasteResolution === 'undecided' ? null : pasteResolution);

    if (!chosen) {
      setPasteStatusBanner({
        type: 'warning',
        text: 'Duplicate detected: Please choose an explicit resolution (Create, Merge, Replace, or Skip) or Stage in Review Queue.',
      });
      return;
    }

    if (chosen === 'skip') {
      setPasteStatusBanner({
        type: 'warning',
        text: `Skipped pasted conversation — "${pasteBrain}" was not modified.`,
      });
      return;
    }

    if (
      pasteEvaluation.duplicateState === 'unable_to_determine' &&
      (chosen === 'merge' || chosen === 'replace')
    ) {
      setPasteStatusBanner({
        type: 'error',
        text: 'Duplicate status cannot be determined — Merge and Replace are blocked for safety.',
      });
      return;
    }

    setIsStoringPaste(true);
    setPasteStatusBanner(null);
    setPasteErrorRetryAction(null);

    const cleanTitle =
      pasteTitle.trim() ||
      `${SOURCE_PALETTE[pasteSource].name} Conversation (${new Date().toLocaleDateString()})`;
    const fileName =
      pasteFileNameInput.trim() ||
      cleanTitle.replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase() + '.md';
    const parsedTags = pasteTagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    try {
      const res = await brainStore.persistReviewedItem({
        action: chosen,
        brain: pasteBrain,
        source: pasteSource,
        title: cleanTitle,
        content: pasteContent,
        fileName,
        filePath: fileName,
        fileType: 'chat',
        tags: parsedTags,
        targetFactId: pasteEvaluation.nodeCheck?.existingFact?.id,
        strategy: ingestStrategy,
        chunkSize,
      });

      setPasteStatusBanner({ type: 'success', text: res.message });
      setPasteTitle('');
      setPasteFileNameInput('');
      setPasteContent('');
      setPasteTagsInput('');
      onImportComplete?.({ imported: 1, skipped: 0, failed: 0 });
    } catch (err: any) {
      setPasteErrorRetryAction(chosen);
      setPasteStatusBanner({
        type: 'error',
        text:
          err?.message ||
          'Failed to persist conversation to backend. Your content is preserved below — click Retry to try again.',
      });
      onImportComplete?.({ imported: 0, skipped: 0, failed: 1 });
    } finally {
      setIsStoringPaste(false);
    }
  };

  // --- Workflow 4: Export Handlers ---
  const handleDownloadMarkdown = () => {
    const blob = new Blob([exportedMarkdown], {
      type: 'text/markdown;charset-utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `the-brain-${exportBrain}-${dateStamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyExportMarkdown = () => {
    navigator.clipboard.writeText(exportedMarkdown);
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-4 overflow-x-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity"
      />

      {/* Modal Container */}
      <div className="relative flex h-[94vh] sm:h-[92vh] w-full max-w-6xl flex-col rounded-2xl border border-white/15 bg-[#050711] text-white shadow-2xl overflow-hidden">
        {/* Top Header Bar with Lifecycle Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/10 bg-[#070a17] px-3.5 sm:px-5 py-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] shrink-0">
              <BrainLogo size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="text-sm font-semibold tracking-tight text-white">
                  Capture Hub
                </h2>
                <span className="text-white/25 hidden xs:inline">·</span>
                <span className="mono text-[11px] text-[#9db4ff] truncate">
                  Source-Aware Memory Pipeline
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 mt-0.5 mono text-[10px] tracking-wider text-white/45">
                {WORKFLOW_STEPS.map((step, i) => (
                  <React.Fragment key={step}>
                    {i > 0 && <span className="text-white/20">→</span>}
                    <span
                      className={
                        (activeTab === 'companion' && step === 'CAPTURE') ||
                        (activeTab === 'import' &&
                          (step === 'CAPTURE' ||
                            step === 'REVIEW' ||
                            step === 'ORGANISE' ||
                            step === 'STORE')) ||
                        (activeTab === 'paste' &&
                          (step === 'CAPTURE' ||
                            step === 'REVIEW' ||
                            step === 'STORE')) ||
                        (activeTab === 'export' && step === 'EXPORT')
                          ? 'text-white font-semibold'
                          : 'text-white/40'
                      }
                    >
                      {step}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Right Header Controls: Default Brain Selector + Close */}
          <div className="flex items-center gap-2">
            {!isCreatingBrain ? (
              <div className="flex items-center gap-1.5">
                <span className="mono text-[11px] text-white/45 hidden md:inline">
                  Active Brain:
                </span>
                <select
                  value={defaultBrain}
                  onChange={(e) => handleDefaultBrainChange(e.target.value)}
                  aria-label="Default destination brain"
                  className="mono rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/35"
                >
                  {brains.map((b) => (
                    <option key={b} value={b} className="bg-[#050711]">
                      {b}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsCreatingBrain(true)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/12 bg-white/[0.03] text-white/60 hover:border-white/25 hover:text-white transition"
                  title="Create new destination Brain"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleCreateNewBrainInline}
                className="flex items-center gap-1"
              >
                <input
                  type="text"
                  autoFocus
                  placeholder="new brain..."
                  value={newBrainInput}
                  onChange={(e) => setNewBrainInput(e.target.value)}
                  className="mono w-28 rounded-lg border border-white/25 bg-black/60 px-2.5 py-1 text-xs text-white outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-black"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingBrain(false)}
                  className="p-1 text-white/50 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Capture Hub"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/55 hover:bg-white/[0.06] hover:text-white transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 4-Workflow Navigation Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-white/10 bg-[#060914] px-1.5 sm:px-4 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('companion')}
            className={`flex items-center justify-center sm:justify-start gap-2 border-b-2 px-2 sm:px-3 py-2.5 sm:py-3 text-xs font-medium transition ${
              activeTab === 'companion'
                ? 'border-[#9db4ff] text-white bg-white/[0.03]'
                : 'border-transparent text-white/55 hover:text-white hover:bg-white/[0.015]'
            }`}
          >
            <Puzzle className="h-4 w-4 shrink-0 text-[#9db4ff]" />
            <div className="text-left min-w-0">
              <div className="leading-none truncate">1. Browser Companion</div>
              <div className="mono text-[10px] text-white/40 mt-1 hidden md:block truncate">
                Extension & device tokens
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`flex items-center justify-center sm:justify-start gap-2 border-b-2 px-2 sm:px-3 py-2.5 sm:py-3 text-xs font-medium transition ${
              activeTab === 'import'
                ? 'border-[#9db4ff] text-white bg-white/[0.03]'
                : 'border-transparent text-white/55 hover:text-white hover:bg-white/[0.015]'
            }`}
          >
            <Upload className="h-4 w-4 shrink-0 text-emerald-400" />
            <div className="text-left min-w-0">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="truncate">2. Import & Review</span>
                {reviewQueue.length > 0 && (
                  <span className="mono tabular-nums rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                    {reviewQueue.length}
                  </span>
                )}
              </div>
              <div className="mono text-[10px] text-white/40 mt-1 hidden md:block truncate">
                Files, ZIPs & review queue
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`flex items-center justify-center sm:justify-start gap-2 border-b-2 px-2 sm:px-3 py-2.5 sm:py-3 text-xs font-medium transition ${
              activeTab === 'paste'
                ? 'border-[#9db4ff] text-white bg-white/[0.03]'
                : 'border-transparent text-white/55 hover:text-white hover:bg-white/[0.015]'
            }`}
          >
            <ClipboardPaste className="h-4 w-4 shrink-0 text-amber-400" />
            <div className="text-left min-w-0">
              <div className="leading-none truncate">3. Paste Conversation</div>
              <div className="mono text-[10px] text-white/40 mt-1 hidden md:block truncate">
                Raw transcript or Markdown
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`flex items-center justify-center sm:justify-start gap-2 border-b-2 px-2 sm:px-3 py-2.5 sm:py-3 text-xs font-medium transition ${
              activeTab === 'export'
                ? 'border-[#9db4ff] text-white bg-white/[0.03]'
                : 'border-transparent text-white/55 hover:text-white hover:bg-white/[0.015]'
            }`}
          >
            <Download className="h-4 w-4 shrink-0 text-purple-400" />
            <div className="text-left min-w-0">
              <div className="leading-none truncate">4. Portable Export</div>
              <div className="mono text-[10px] text-white/40 mt-1 hidden md:block truncate">
                Markdown snapshot (.md)
              </div>
            </div>
          </button>
        </div>

        {/* Main Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 md:p-6 scrollbar-thin">
          {/* ===============================================================
              WORKFLOW 1: BROWSER COMPANION
             =============================================================== */}
          {activeTab === 'companion' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between">
                    <span className="mono text-[11px] text-white/50">
                      API Gateway Status
                    </span>
                    <button
                      type="button"
                      onClick={refreshCompanionState}
                      className="text-white/45 hover:text-white transition"
                      title="Refresh connection status"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${
                          isLoadingCompanion ? 'animate-spin' : ''
                        }`}
                      />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        gatewayStatus.online || gatewayStatus.reachable
                          ? 'bg-emerald-400'
                          : 'bg-rose-400'
                      }`}
                    />
                    <span className="text-base font-semibold text-white">
                      {gatewayStatus.online || gatewayStatus.reachable
                        ? 'Gateway Online'
                        : 'Offline (Local Cache Mode)'}
                    </span>
                  </div>
                  <p className="mt-1 mono text-[11px] text-white/45 truncate">
                    Endpoint: {window.location.origin}/api
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <span className="mono text-[11px] text-white/50">
                    Registered Device Tokens
                  </span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="mono text-xl font-semibold tabular-nums text-white">
                      {devices.length}
                    </span>
                    <span className="text-xs text-white/50">
                      {devices.length === 1
                        ? 'authorized device'
                        : 'authorized devices'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-white/45">
                    {devices.some((d) => d.last_used_at)
                      ? 'Active companion telemetry verified'
                      : 'No companion requests recorded yet'}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <span className="mono text-[11px] text-white/50">
                    Gateway Endpoint URL
                  </span>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={window.location.origin}
                      className="mono min-w-0 flex-1 rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 text-xs text-white/85 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText('gateway-url', window.location.origin)
                      }
                      className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/[0.05] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/[0.1] transition shrink-0"
                    >
                      {copiedKey === 'gateway-url' ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-white/45">
                    Paste this URL into the Browser Extension popup.
                  </p>
                </div>
              </div>

              {/* Device Token Management */}
              <div className="rounded-xl border border-white/10 bg-[#070a15] p-4 sm:p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-[#9db4ff]" />
                    <span>Device Token Management</span>
                  </h3>
                  <p className="mt-0.5 text-xs text-white/50">
                    Issue per-browser tokens to authenticate the Browser
                    Companion extension without exposing personal credentials.
                  </p>
                </div>

                <form
                  onSubmit={handleCreateDeviceToken}
                  className="flex flex-wrap items-center gap-2.5 pt-1"
                >
                  <input
                    type="text"
                    placeholder="Device label (e.g., MacBook Chrome, Work Edge)..."
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                    className="min-w-[180px] flex-1 rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs text-white placeholder-white/35 outline-none focus:border-white/35"
                  />
                  <select
                    value={newDeviceBrowser}
                    onChange={(e) => setNewDeviceBrowser(e.target.value)}
                    className="mono rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none"
                  >
                    <option value="Chrome / Chromium" className="bg-[#050711]">
                      Chrome / Chromium
                    </option>
                    <option value="Brave Browser" className="bg-[#050711]">
                      Brave Browser
                    </option>
                    <option value="Microsoft Edge" className="bg-[#050711]">
                      Microsoft Edge
                    </option>
                    <option value="Arc Browser" className="bg-[#050711]">
                      Arc Browser
                    </option>
                  </select>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-white/90 transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Issue Device Token</span>
                  </button>
                </form>

                {newlyIssuedToken && (
                  <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-200">
                        Device Token Created for "{newlyIssuedToken.name}" —
                        Copy Now
                      </span>
                      <button
                        type="button"
                        onClick={() => setNewlyIssuedToken(null)}
                        className="text-xs text-emerald-300/70 hover:text-white"
                      >
                        Dismiss
                      </button>
                    </div>
                    <p className="text-[11px] text-emerald-200/80">
                      Paste this token into the "Device Token" field inside the
                      Browser Companion extension popup:
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="mono flex-1 min-w-0 truncate rounded-lg border border-emerald-500/30 bg-black/60 px-3 py-2 text-xs text-emerald-300 select-all">
                        {newlyIssuedToken.token}
                      </code>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(
                            'issued-token',
                            newlyIssuedToken.token
                          )
                        }
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3.5 py-2 text-xs font-semibold text-black hover:bg-emerald-300 transition"
                      >
                        {copiedKey === 'issued-token' ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy Token</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {devices.length === 0 ? (
                  <div className="rounded-lg border border-white/8 bg-black/30 py-6 text-center text-xs text-white/45">
                    No companion device tokens issued yet. Create a token above
                    to pair your browser extension.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/40">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.02] text-[11px] text-white/45">
                          <th className="py-2.5 px-3">Device Name</th>
                          <th className="py-2.5 px-3">Browser</th>
                          <th className="py-2.5 px-3">Token Prefix</th>
                          <th className="py-2.5 px-3">Created</th>
                          <th className="py-2.5 px-3">Status / Last Active</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/8">
                        {devices.map((dev) => (
                          <tr key={dev.id} className="hover:bg-white/[0.02]">
                            <td className="py-2.5 px-3 font-medium text-white">
                              <div className="flex items-center gap-2">
                                <span>{dev.name}</span>
                                {dev.revoked_at && (
                                  <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
                                    Revoked
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-white/65">
                              {dev.browser}
                            </td>
                            <td className="py-2.5 px-3 mono text-[11px] text-[#9db4ff]">
                              {dev.token_prefix}
                            </td>
                            <td className="py-2.5 px-3 mono text-[11px] tabular-nums text-white/50">
                              {new Date(dev.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-2.5 px-3 mono text-[11px] tabular-nums">
                              {dev.revoked_at ? (
                                <span className="text-rose-400">
                                  Revoked {new Date(dev.revoked_at).toLocaleDateString()}
                                </span>
                              ) : dev.last_used_at ? (
                                <span className="text-emerald-400">
                                  {new Date(dev.last_used_at).toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-white/35">
                                  Never used
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {!dev.revoked_at && (
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeDevice(dev.id)}
                                    className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200 hover:bg-amber-500/20 transition"
                                  >
                                    <span>Revoke</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDevice(dev.id)}
                                  className="inline-flex items-center gap-1 rounded-md border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20 transition"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Honest Source Capture Matrix */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                      Direct Browser Companion Capture
                    </h4>
                    <span className="mono text-[10px] text-white/45">
                      DOM Script Injection (`extension/`)
                    </span>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    The unpacked Chrome/Edge extension in{' '}
                    <code className="mono text-white/85">/extension</code>{' '}
                    captures live conversation turns from the active browser tab
                    and injects recalled Brain context directly into the prompt
                    input on:
                  </p>
                  <ul className="space-y-2 text-xs">
                    <li className="flex items-center justify-between rounded-lg border border-white/8 bg-black/30 px-3 py-2">
                      <span className="font-medium text-[#378ADD]">
                        ChatGPT Web (chatgpt.com)
                      </span>
                      <span className="mono text-[11px] text-emerald-400">
                        Active Tab Capture + Inject
                      </span>
                    </li>
                    <li className="flex items-center justify-between rounded-lg border border-white/8 bg-black/30 px-3 py-2">
                      <span className="font-medium text-[#D85A30]">
                        Claude Web (claude.ai)
                      </span>
                      <span className="mono text-[11px] text-emerald-400">
                        Active Tab Capture + Inject
                      </span>
                    </li>
                    <li className="flex items-center justify-between rounded-lg border border-white/8 bg-black/30 px-3 py-2">
                      <span className="font-medium text-[#1D9E75]">
                        Google Gemini Web (gemini.google.com)
                      </span>
                      <span className="mono text-[11px] text-emerald-400">
                        Active Tab Capture + Inject
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#9db4ff]">
                      Archive & File Import Sources
                    </h4>
                    <span className="mono text-[10px] text-white/45">
                      Client-Side Parsers
                    </span>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Sources without direct browser DOM hooks are captured via
                    the <strong>Import & Review</strong> tab or{' '}
                    <strong>Paste Conversation</strong> tab using real
                    client-side parsers:
                  </p>
                  <ul className="space-y-2 text-xs">
                    <li className="flex items-center justify-between rounded-lg border border-white/8 bg-black/30 px-3 py-2">
                      <span className="font-medium text-white/85">
                        ChatGPT & Claude Full Account Exports
                      </span>
                      <span className="mono text-[11px] text-[#9db4ff]">
                        .zip / conversations.json
                      </span>
                    </li>
                    <li className="flex items-center justify-between rounded-lg border border-white/8 bg-black/30 px-3 py-2">
                      <span className="font-medium text-[#7F77DD]">
                        Moodle & Academic Coursework
                      </span>
                      <span className="mono text-[11px] text-[#9db4ff]">
                        .pdf · .docx · .pptx · .xlsx
                      </span>
                    </li>
                    <li className="flex items-center justify-between rounded-lg border border-white/8 bg-black/30 px-3 py-2">
                      <span className="font-medium text-[#639922]">
                        GitHub, Cursor & Local AI Logs
                      </span>
                      <span className="mono text-[11px] text-[#9db4ff]">
                        .md · .txt · .json · .csv · Paste
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Project & Resource Capture Staging into Review Queue */}
              <div className="rounded-xl border border-white/10 bg-[#070a15] p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-white">
                      Browser Companion — Project & Resource Capture
                    </h4>
                    <p className="mt-0.5 text-xs text-white/55">
                      Captures project instructions, Claude Artifacts / ChatGPT
                      Canvas blocks, open project documents, code snippets, and
                      conversation turns with provenance, and stages them into
                      the <strong>Import Review Queue</strong>.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleStageSampleProjectCapture}
                      data-testid="stage-companion-project-btn"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#9db4ff]/35 bg-[#9db4ff]/15 px-3 py-1.5 mono text-[11px] font-semibold text-[#9db4ff] hover:bg-[#9db4ff]/25 transition"
                    >
                      <Puzzle className="h-3.5 w-3.5" />
                      <span>Stage Project Resources to Review Queue</span>
                    </button>
                    {companionCaptures.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('import')}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 mono text-[11px] font-semibold text-black hover:bg-emerald-300 transition"
                      >
                        <span>
                          Open Review Queue ({companionCaptures.length} staged)
                        </span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {companionStageBanner && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span>{companionStageBanner}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('import')}
                      className="mono text-[11px] font-semibold text-emerald-300 underline hover:text-white"
                    >
                      Review in Queue →
                    </button>
                  </div>
                )}

                {companionUnreachable.length > 0 && (
                  <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200 space-y-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span>
                        Browser Permission / DOM Boundary Notice (
                        {companionUnreachable.length} binary attachment card)
                      </span>
                    </div>
                    <ul className="list-disc list-inside text-[11px] text-amber-200/85">
                      {companionUnreachable.map((u, idx) => (
                        <li key={idx}>
                          <strong className="mono">{u.name}</strong> —{' '}
                          {u.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===============================================================
              WORKFLOW 2: IMPORT FILES & ARCHIVES + REUSABLE IMPORT REVIEW QUEUE
             =============================================================== */}
          {activeTab === 'import' && (
            <div className="space-y-5">
              {/* Top Row: Dropzone + Ingestion Strategy */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (
                      e.dataTransfer.files &&
                      e.dataTransfer.files.length > 0
                    ) {
                      handleFilesSelected(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`lg:col-span-7 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition ${
                    isDragging
                      ? 'border-[#9db4ff] bg-[#9db4ff]/10'
                      : 'border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={SUPPORTED_FILE_EXTENSIONS.join(',')}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFilesSelected(e.target.files);
                        e.target.value = '';
                      }
                    }}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-[#9db4ff]">
                      <Upload className="h-5 w-5" />
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-emerald-400">
                      <FileArchive className="h-5 w-5" />
                    </div>
                  </div>
                  <p className="mt-2.5 text-xs font-semibold text-white">
                    Select or drop files and .ZIP export archives to stage in
                    the Review Queue
                  </p>
                  <p className="mt-1 text-[11px] text-white/50 max-w-md">
                    Unpacks <span className="mono text-white/80">.zip</span>{' '}
                    archives client-side and extracts{' '}
                    <span className="mono text-white/80">
                      conversations.json
                    </span>{' '}
                    (ChatGPT/Claude),{' '}
                    <span className="mono text-white/80">.pdf</span>,{' '}
                    <span className="mono text-white/80">.docx</span>,{' '}
                    <span className="mono text-white/80">.pptx</span>,{' '}
                    <span className="mono text-white/80">.xlsx</span>,{' '}
                    <span className="mono text-white/80">.md</span>,{' '}
                    <span className="mono text-white/80">.txt</span>,{' '}
                    <span className="mono text-white/80">.csv</span>.
                  </p>
                </div>

                {/* Organise & Chunking Strategy (5 cols) */}
                <div className="lg:col-span-5 rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">
                        Storage & Node Structure
                      </span>
                      <span className="mono text-[10px] text-[#9db4ff]">
                        {ingestStrategy === 'semantic'
                          ? 'Unified Context Node'
                          : ingestStrategy === 'branching'
                          ? 'Master + Turn Branches'
                          : `${chunkSize}-char Slices`}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-white/45">
                      Duplicate detection never modifies existing content
                      automatically. Choose Create, Merge, Replace, or Skip
                      individually or in bulk below.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIngestStrategy('semantic')}
                      className={`rounded-lg border p-2 text-left transition ${
                        ingestStrategy === 'semantic' ||
                        ingestStrategy === 'single'
                          ? 'border-[#9db4ff] bg-[#9db4ff]/15 text-white'
                          : 'border-white/10 bg-black/30 text-white/55 hover:text-white'
                      }`}
                    >
                      <div className="text-[11px] font-semibold">Unified</div>
                      <div className="text-[10px] text-white/50 mt-0.5">
                        1 semantic node + diff merge
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIngestStrategy('branching')}
                      className={`rounded-lg border p-2 text-left transition ${
                        ingestStrategy === 'branching'
                          ? 'border-[#9db4ff] bg-[#9db4ff]/15 text-white'
                          : 'border-white/10 bg-black/30 text-white/55 hover:text-white'
                      }`}
                    >
                      <div className="text-[11px] font-semibold">Branching</div>
                      <div className="text-[10px] text-white/50 mt-0.5">
                        File hub + turn nodes
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIngestStrategy('chunk')}
                      className={`rounded-lg border p-2 text-left transition ${
                        ingestStrategy === 'chunk'
                          ? 'border-[#9db4ff] bg-[#9db4ff]/15 text-white'
                          : 'border-white/10 bg-black/30 text-white/55 hover:text-white'
                      }`}
                    >
                      <div className="text-[11px] font-semibold">Sliced</div>
                      <div className="text-[10px] text-white/50 mt-0.5">
                        Fixed character chunks
                      </div>
                    </button>
                  </div>

                  {ingestStrategy === 'chunk' && (
                    <div className="flex items-center justify-between pt-1 border-t border-white/10 text-xs">
                      <span className="text-white/50">Chunk size (chars):</span>
                      <input
                        type="number"
                        value={chunkSize}
                        onChange={(e) =>
                          setChunkSize(
                            Math.max(200, parseInt(e.target.value, 10) || 1200)
                          )
                        }
                        className="mono w-24 rounded border border-white/20 bg-black/50 px-2 py-1 text-xs text-white outline-none"
                      />
                    </div>
                  )}

                  {/* Per-Import Override Bar (Synchronized with Settings -> Import & Processing) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10 mono text-[10.5px] text-white/60">
                    <label className="inline-flex items-center gap-1.5">
                      <span>Max Batch:</span>
                      <select
                        value={maxFilesPerBatch}
                        onChange={(e) => {
                          const next = parseInt(e.target.value, 10) || 1000;
                          setMaxFilesPerBatch(next);
                          brainStore
                            .updateGlobalSettings({
                              importProcessing: { maxFilesPerBatch: next },
                            })
                            .catch(() => {});
                        }}
                        data-testid="capture-hub-max-batch-select"
                        className="rounded border border-white/15 bg-black/60 px-1.5 py-0.5 text-[10.5px] text-[#9db4ff] outline-none"
                      >
                        {[100, 350, 500, 1000, 2000, 5000].map((limit) => (
                          <option
                            key={limit}
                            value={limit}
                            className="bg-[#050711] text-white"
                          >
                            {limit.toLocaleString()} files
                            {limit === 1000 ? ' (default)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="inline-flex items-center gap-1.5">
                      <span>Duplicates:</span>
                      <select
                        value={defaultDuplicatePolicy}
                        onChange={(e) => {
                          const next = e.target
                            .value as DuplicateHandlingPolicy;
                          setDefaultDuplicatePolicy(next);
                          brainStore
                            .updateGlobalSettings({
                              importProcessing: { defaultDuplicatePolicy: next },
                            })
                            .catch(() => {});
                        }}
                        data-testid="capture-hub-duplicate-policy-select"
                        className="rounded border border-white/15 bg-black/60 px-1.5 py-0.5 text-[10.5px] text-[#9db4ff] outline-none"
                      >
                        <option value="skip" className="bg-[#050711] text-white">
                          Skip duplicates
                        </option>
                        <option
                          value="ask_user"
                          className="bg-[#050711] text-white"
                        >
                          Ask per item
                        </option>
                        <option
                          value="merge"
                          className="bg-[#050711] text-white"
                        >
                          Merge modified
                        </option>
                        <option
                          value="replace"
                          className="bg-[#050711] text-white"
                        >
                          Replace modified
                        </option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              {/* 6-Metric Batch Breakdown Bar when items are staged */}
              {reviewQueue.length > 0 && (
                <div
                  data-testid="batch-metrics-breakdown"
                  className="grid grid-cols-2 sm:grid-cols-6 gap-2 rounded-xl border border-white/10 bg-[#060914] p-2.5 mono text-[11px]"
                >
                  <div className="rounded-lg border border-white/8 bg-black/40 px-2.5 py-1.5">
                    <div className="text-[10px] text-white/45">
                      Total Discovered
                    </div>
                    <div className="text-xs font-semibold tabular-nums text-white">
                      {queueMetrics.total}
                    </div>
                  </div>
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5">
                    <div className="text-[10px] text-emerald-300/75">
                      Imported
                    </div>
                    <div className="text-xs font-semibold tabular-nums text-emerald-300">
                      {queueMetrics.imported}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                    <div className="text-[10px] text-white/50">Skipped</div>
                    <div className="text-xs font-semibold tabular-nums text-white/80">
                      {queueMetrics.skipped}
                    </div>
                  </div>
                  <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 py-1.5">
                    <div className="text-[10px] text-rose-300/75">Failed</div>
                    <div className="text-xs font-semibold tabular-nums text-rose-300">
                      {queueMetrics.failed}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#9db4ff]/25 bg-[#9db4ff]/10 px-2.5 py-1.5">
                    <div className="text-[10px] text-[#9db4ff]/80">Pending</div>
                    <div className="text-xs font-semibold tabular-nums text-[#9db4ff]">
                      {queueMetrics.pending}
                    </div>
                  </div>
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5">
                    <div className="text-[10px] text-amber-300/80">Retried</div>
                    <div className="text-xs font-semibold tabular-nums text-amber-300">
                      {queueMetrics.retried}
                    </div>
                  </div>
                </div>
              )}

              {/* Commit Status Notification Banner */}
              {commitBanner && (
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-xs ${
                    commitBanner.type === 'error'
                      ? 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                      : commitBanner.type === 'warning'
                      ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                      : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {commitBanner.type === 'error' ? (
                      <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    )}
                    <span>{commitBanner.text}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCommitBanner(null)}
                    className="opacity-70 hover:opacity-100"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Reusable ImportReviewQueue Component with Bulk Selection & Per-Item Progress */}
              <ImportReviewQueue
                items={reviewQueue}
                destinations={brains}
                isBatchProcessing={isCommitting}
                batchProgress={batchProgress}
                concurrencyLimit={concurrencyLimit}
                onConcurrencyLimitChange={(next) => {
                  const normalized = normalizeImportConcurrency(next);
                  setConcurrencyLimit(normalized);
                  brainStore
                    .updateGlobalSettings({
                      importProcessing: { concurrency: normalized },
                    })
                    .catch(() => {});
                }}
                selectedIds={selectedQueueIds}
                onSelectionChange={setSelectedQueueIds}
                onMerge={handleMergeItem}
                onReplace={handleReplaceItem}
                onSkip={handleSkipItem}
                onRetry={handleRetryItem}
                onRetryAllFailed={handleRetryAllFailed}
                onImportNew={handleImportNewItem}
                onBulkMerge={(items) => handleBulkAction(items, 'merge')}
                onBulkReplace={(items) => handleBulkAction(items, 'replace')}
                onBulkSkip={(items) => handleBulkAction(items, 'skip')}
                onBulkFormatTitles={handleBulkFormatTitles}
                onBulkAssignSource={handleBulkAssignSource}
                onUpdateItem={handleUpdateQueueItem}
                onRemoveItem={handleRemoveQueueItem}
                onClearQueue={() => {
                  setReviewQueue([]);
                  setSelectedQueueIds([]);
                  setTotalRetriedCount(0);
                  completedCheckpointKeysRef.current.clear();
                }}
              />
            </div>
          )}

          {/* ===============================================================
              WORKFLOW 3: PASTE CONVERSATION
              (Paste -> Source -> Brain -> Duplicate Check -> Review/Decision -> Persistence -> Confirmation)
             =============================================================== */}
          {activeTab === 'paste' && (
            <div className="space-y-4">
              {pasteStatusBanner && (
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-xs ${
                    pasteStatusBanner.type === 'error'
                      ? 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                      : pasteStatusBanner.type === 'warning'
                      ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                      : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {pasteStatusBanner.type === 'error' ? (
                      <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    )}
                    <span>{pasteStatusBanner.text}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {pasteStatusBanner.type === 'error' &&
                      pasteErrorRetryAction && (
                        <button
                          type="button"
                          disabled={isStoringPaste}
                          onClick={() =>
                            handleExecutePasteResolution(pasteErrorRetryAction)
                          }
                          className="inline-flex items-center gap-1 rounded-md bg-rose-400 px-2.5 py-1 mono text-[11px] font-semibold text-black hover:bg-rose-300"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>
                            Retry {pasteErrorRetryAction.toUpperCase()}
                          </span>
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() => setPasteStatusBanner(null)}
                      className="opacity-70 hover:opacity-100"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="block mono text-[11px] text-white/50 mb-1">
                    Conversation or Document Title
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Auth Architecture Review with Claude..."
                    value={pasteTitle}
                    onChange={(e) => setPasteTitle(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-white/40"
                  />
                </div>

                <div>
                  <label className="block mono text-[11px] text-white/50 mb-1">
                    AI Source Origin
                  </label>
                  <select
                    value={pasteSource}
                    onChange={(e) =>
                      setPasteSource(e.target.value as AISource)
                    }
                    className="mono w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none focus:border-white/40"
                  >
                    {(Object.keys(SOURCE_PALETTE) as AISource[]).map((src) => (
                      <option key={src} value={src} className="bg-[#050711]">
                        {SOURCE_PALETTE[src].name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mono text-[11px] text-white/50 mb-1">
                    Destination Brain
                  </label>
                  <select
                    value={pasteBrain}
                    onChange={(e) => setPasteBrain(e.target.value)}
                    className="mono w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs text-[#9db4ff] outline-none focus:border-white/40"
                  >
                    {brains.map((b) => (
                      <option key={b} value={b} className="bg-[#050711]">
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block mono text-[11px] text-white/50 mb-1">
                    Filename / Path (optional, used for duplicate check)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., auth_architecture_review.md"
                    value={pasteFileNameInput}
                    onChange={(e) => setPasteFileNameInput(e.target.value)}
                    className="mono w-full rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-white/40"
                  />
                </div>
                <div>
                  <label className="block mono text-[11px] text-white/50 mb-1">
                    Tags (optional, comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="architecture,database,sprint-planning"
                    value={pasteTagsInput}
                    onChange={(e) => setPasteTagsInput(e.target.value)}
                    className="mono w-full rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-white/40"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="mono text-[11px] text-white/50">
                    Conversation History or Markdown Content
                  </label>
                  <span className="mono text-[11px] tabular-nums text-white/40">
                    {pasteContent.length.toLocaleString()} chars ·{' '}
                    {pasteContent.trim()
                      ? `${countConversationUnits(pasteContent).count} ${
                          countConversationUnits(pasteContent).label
                        }`
                      : '0 turns'}
                  </span>
                </div>
                <textarea
                  rows={8}
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="Paste conversation turns (e.g., User: ... / Assistant: ...) or structured Markdown notes here..."
                  className="mono w-full rounded-xl border border-white/15 bg-black/60 p-3.5 text-xs text-white placeholder-white/30 outline-none focus:border-white/40 leading-relaxed"
                />
              </div>

              {/* Live Duplicate Check & Explicit User Resolution Panel */}
              <div className="rounded-xl border border-white/12 bg-[#070a15] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="mono text-[11px] uppercase tracking-wider text-white/55">
                      Duplicate Check & Resolution Decision
                    </span>
                    <span className="mono rounded border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-white">
                      {pasteEvaluation.duplicateState === 'new'
                        ? 'New'
                        : pasteEvaluation.duplicateState === 'exact_duplicate'
                        ? 'Exact duplicate'
                        : pasteEvaluation.duplicateState ===
                          'possible_duplicate'
                        ? 'Possible duplicate'
                        : pasteEvaluation.duplicateState === 'related_content'
                        ? 'Related content'
                        : 'Unable to determine'}
                    </span>
                  </div>
                  {pasteEvaluation.nodeCheck?.existingFact && (
                    <span className="mono text-[11px] text-amber-300">
                      Matches Node #{pasteEvaluation.nodeCheck.existingFact.id}{' '}
                      in "{pasteBrain}"
                    </span>
                  )}
                </div>

                <p className="text-xs text-white/65">
                  {pasteEvaluation.nodeCheck?.summary ||
                    (pasteContent.trim()
                      ? `No conflicting node found in "${pasteBrain}". Safe to create as a new node.`
                      : 'Paste conversation content above to evaluate duplicate state against the destination Brain.')}
                </p>

                {/* Resolution Selector Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mono text-[11px] text-white/45 mr-1">
                      Resolution:
                    </span>
                    <button
                      type="button"
                      disabled={!pasteContent.trim() || isStoringPaste}
                      onClick={() => setPasteResolution('create')}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 mono text-[11px] font-medium transition disabled:opacity-35 ${
                        pasteResolution === 'create'
                          ? 'bg-emerald-400 text-black font-semibold'
                          : 'border border-white/15 bg-white/[0.04] text-white/80 hover:text-white'
                      }`}
                    >
                      <Check className="h-3 w-3" />
                      <span>Create</span>
                    </button>

                    <button
                      type="button"
                      disabled={
                        !pasteContent.trim() ||
                        isStoringPaste ||
                        pasteEvaluation.duplicateState === 'unable_to_determine'
                      }
                      onClick={() => setPasteResolution('merge')}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 mono text-[11px] font-medium transition disabled:opacity-35 disabled:cursor-not-allowed ${
                        pasteResolution === 'merge'
                          ? 'bg-[#9db4ff] text-black font-semibold'
                          : 'border border-white/15 bg-white/[0.04] text-white/80 hover:text-white'
                      }`}
                      title={
                        pasteEvaluation.duplicateState === 'unable_to_determine'
                          ? 'Merge is blocked when duplicate status cannot be determined'
                          : 'Merge pasted transcript with existing node in destination Brain'
                      }
                    >
                      <GitMerge className="h-3 w-3" />
                      <span>Merge</span>
                    </button>

                    <button
                      type="button"
                      disabled={
                        !pasteContent.trim() ||
                        isStoringPaste ||
                        pasteEvaluation.duplicateState === 'unable_to_determine'
                      }
                      onClick={() => setPasteResolution('replace')}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 mono text-[11px] font-medium transition disabled:opacity-35 disabled:cursor-not-allowed ${
                        pasteResolution === 'replace'
                          ? 'bg-amber-400 text-black font-semibold'
                          : 'border border-white/15 bg-white/[0.04] text-white/80 hover:text-white'
                      }`}
                      title={
                        pasteEvaluation.duplicateState === 'unable_to_determine'
                          ? 'Replace is blocked when duplicate status cannot be determined'
                          : 'Replace matched node in destination Brain'
                      }
                    >
                      <Replace className="h-3 w-3" />
                      <span>Replace</span>
                    </button>

                    <button
                      type="button"
                      disabled={!pasteContent.trim() || isStoringPaste}
                      onClick={() => setPasteResolution('skip')}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 mono text-[11px] font-medium transition disabled:opacity-35 ${
                        pasteResolution === 'skip'
                          ? 'border border-white/30 bg-white/15 text-white font-semibold'
                          : 'border border-white/12 bg-black/40 text-white/65 hover:text-white'
                      }`}
                    >
                      <SkipForward className="h-3 w-3" />
                      <span>Skip</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!pasteContent.trim() || isStoringPaste}
                      onClick={handleQueuePastedConversation}
                      className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/[0.05] px-3.5 py-2 text-xs font-medium text-white hover:bg-white/[0.1] disabled:opacity-40 transition"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      <span>Stage in Review Queue</span>
                    </button>

                    <button
                      type="button"
                      disabled={
                        !pasteContent.trim() ||
                        isStoringPaste ||
                        pasteResolution === 'undecided'
                      }
                      onClick={() => handleExecutePasteResolution()}
                      className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-white/90 disabled:opacity-40 transition"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>
                        {isStoringPaste
                          ? 'Persisting...'
                          : pasteResolution === 'undecided'
                          ? 'Choose Resolution Above'
                          : `${
                              pasteResolution === 'create'
                                ? 'Create'
                                : pasteResolution === 'merge'
                                ? 'Merge'
                                : pasteResolution === 'replace'
                                ? 'Replace'
                                : 'Skip'
                            } in "${pasteBrain}"`}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===============================================================
              WORKFLOW 4: PORTABLE MARKDOWN EXPORT
             =============================================================== */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div>
                  <label className="block mono text-[11px] text-white/50 mb-1">
                    Brain to Export
                  </label>
                  <select
                    value={exportBrain}
                    onChange={(e) => setExportBrain(e.target.value)}
                    className="mono w-full rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white outline-none"
                  >
                    {brains.map((b) => (
                      <option key={b} value={b} className="bg-[#050711]">
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mono text-[11px] text-white/50 mb-1">
                    Filter by AI Source
                  </label>
                  <select
                    value={exportSourceFilter}
                    onChange={(e) =>
                      setExportSourceFilter(
                        e.target.value as AISource | 'all'
                      )
                    }
                    className="mono w-full rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="all" className="bg-[#050711]">
                      All Sources
                    </option>
                    {(Object.keys(SOURCE_PALETTE) as AISource[]).map((src) => (
                      <option key={src} value={src} className="bg-[#050711]">
                        {SOURCE_PALETTE[src].name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col justify-center space-y-2 pt-2 md:pt-0">
                  <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportIncludeMetadata}
                      onChange={(e) =>
                        setExportIncludeMetadata(e.target.checked)
                      }
                      className="rounded border-white/25 bg-black"
                    />
                    <span>Include YAML Frontmatter & Metadata</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportGroupBySource}
                      onChange={(e) => setExportGroupBySource(e.target.checked)}
                      className="rounded border-white/25 bg-black"
                    />
                    <span>Group Sections by AI Source</span>
                  </label>
                </div>

                <div className="flex flex-col justify-center items-end gap-2">
                  <div className="flex flex-wrap items-center gap-2 w-full justify-end">
                    <button
                      type="button"
                      onClick={handleCopyExportMarkdown}
                      className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-xs font-medium text-white hover:bg-white/[0.1] transition"
                    >
                      {exportCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy MD</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadMarkdown}
                      className="flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-black hover:bg-white/90 transition"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download .md</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#060914] overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-2.5 mono text-[11px] text-white/55">
                  <span>
                    Portable Markdown Preview ·{' '}
                    <strong className="text-white">
                      the-brain-{exportBrain}.md
                    </strong>
                  </span>
                  <span className="tabular-nums">
                    {exportNodeCount}{' '}
                    {exportNodeCount === 1 ? 'node' : 'nodes'} ·{' '}
                    {exportedMarkdown.length.toLocaleString()} chars
                  </span>
                </div>
                <pre className="h-[340px] overflow-y-auto p-4 font-mono text-xs text-white/80 whitespace-pre-wrap leading-relaxed scrollbar-thin">
                  {exportedMarkdown}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-white/10 bg-[#070a17] px-3.5 sm:px-5 py-3 shrink-0">
          <div className="mono text-xs text-white/55">
            {activeTab === 'companion' && (
              <span>
                Gateway:{' '}
                <strong
                  className={
                    gatewayStatus.online || gatewayStatus.reachable
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }
                >
                  {gatewayStatus.online || gatewayStatus.reachable
                    ? 'Connected'
                    : 'Local Mode'}
                </strong>{' '}
                · {devices.length} registered device token(s)
              </span>
            )}
            {activeTab === 'import' && (
              <span className="tabular-nums">
                {queueMetrics.imported} / {queueMetrics.total} imported ·{' '}
                {queueMetrics.skipped} skipped · {queueMetrics.failed} failed ·{' '}
                {queueMetrics.pending} pending · {queueMetrics.retried} retried
              </span>
            )}
            {activeTab === 'paste' && (
              <span className="tabular-nums">
                Target Brain:{' '}
                <strong className="text-white">{pasteBrain}</strong> · Source:{' '}
                <strong className="text-white">
                  {SOURCE_PALETTE[pasteSource].name}
                </strong>
              </span>
            )}
            {activeTab === 'export' && (
              <span className="tabular-nums">
                Exporting{' '}
                <strong className="text-white">{exportNodeCount}</strong> memory
                nodes from "{exportBrain}"
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'import' && isCommitting && (
              <button
                type="button"
                onClick={handleCancelBatch}
                data-testid="cancel-batch-btn"
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/25 transition"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cancel Batch</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/15 px-3.5 sm:px-4 py-2 text-xs font-medium text-white/70 hover:text-white transition"
            >
              Close
            </button>

            {activeTab === 'import' && (
              <button
                type="button"
                disabled={isCommitting || queueMetrics.ready === 0}
                onClick={handleCommitReviewQueue}
                className="flex items-center gap-1.5 rounded-xl bg-white px-4 sm:px-5 py-2 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
                <span>
                  {isCommitting
                    ? 'Persisting Queue...'
                    : `Process Actionable Items (${queueMetrics.ready})`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
