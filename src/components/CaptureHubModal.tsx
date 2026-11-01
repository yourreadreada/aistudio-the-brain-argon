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
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  FileArchive,
  FileText,
  FolderGit2,
  ShieldCheck,
  KeyRound,
  ArrowRight,
  Layers,
  X,
} from 'lucide-react';
import {
  AISource,
  FactFileType,
  IngestStrategy,
  ExistingFileNodeCheck,
  SOURCE_PALETTE,
  inferFileTypeFromExtension,
} from '../types/brain';
import {
  brainStore,
  CompanionDeviceRecord,
  GatewayStatusInfo,
} from '../services/brainStorage';
import { BrainLogo } from './BrainLogo';
import {
  extractItemsFromFile,
  ExtractedFileResult,
  SUPPORTED_FILE_EXTENSIONS,
} from '../services/fileExtractor';

export type CaptureHubTab = 'companion' | 'import' | 'paste' | 'export';

export type ReviewResolutionAction = 'create' | 'merge' | 'replace' | 'skip';

export type ReviewItemStatus =
  | 'extracting'
  | 'ready'
  | 'duplicate_identical'
  | 'duplicate_diff'
  | 'imported'
  | 'skipped'
  | 'error';

export interface ReviewQueueItem {
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
  nodeCheck?: ExistingFileNodeCheck;
  resolution: ReviewResolutionAction;
  tags: string[];
}

export interface CaptureHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBrain: string;
  brains: string[];
  initialTab?: CaptureHubTab;
  onCreateBrain?: (name: string) => void;
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

export const CaptureHubModal: React.FC<CaptureHubModalProps> = ({
  isOpen,
  onClose,
  currentBrain,
  brains,
  initialTab = 'import',
  onCreateBrain,
  onIngest,
}) => {
  const [activeTab, setActiveTab] = useState<CaptureHubTab>(initialTab);
  const [defaultBrain, setDefaultBrain] = useState<string>(currentBrain);
  const [ingestStrategy, setIngestStrategy] = useState<IngestStrategy>('semantic');
  const [chunkSize, setChunkSize] = useState<number>(1200);

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

  // --- Workflow 2: Import Files & Review Queue State ---
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [expandedPreviewId, setExpandedPreviewId] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitBanner, setCommitBanner] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Workflow 3: Paste Conversation State ---
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteSource, setPasteSource] = useState<AISource>('claude');
  const [pasteBrain, setPasteBrain] = useState<string>(currentBrain);
  const [pasteTagsInput, setPasteTagsInput] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [pasteStatusBanner, setPasteStatusBanner] = useState<string | null>(null);

  // --- Workflow 4: Export State ---
  const [exportBrain, setExportBrain] = useState<string>(currentBrain);
  const [exportSourceFilter, setExportSourceFilter] = useState<AISource | 'all'>('all');
  const [exportIncludeMetadata, setExportIncludeMetadata] = useState<boolean>(true);
  const [exportGroupBySource, setExportGroupBySource] = useState<boolean>(true);
  const [exportCopied, setExportCopied] = useState(false);

  // Sync currentBrain when modal opens
  useEffect(() => {
    if (isOpen) {
      setDefaultBrain(currentBrain);
      setPasteBrain(currentBrain);
      setExportBrain(currentBrain);
      if (initialTab) {
        setActiveTab(initialTab);
      }
      refreshCompanionState();
    }
  }, [isOpen, currentBrain, initialTab]);

  const refreshCompanionState = async () => {
    setIsLoadingCompanion(true);
    try {
      const [status, devList] = await Promise.all([
        brainStore.checkGatewayStatus(),
        brainStore.fetchCompanionDevices(),
      ]);
      setGatewayStatus(status);
      setDevices(devList);
    } finally {
      setIsLoadingCompanion(false);
    }
  };

  const computeStatusAndResolution = (
    text: string,
    fileName: string,
    targetBrain: string,
    hasError?: boolean
  ): {
    nodeCheck?: ExistingFileNodeCheck;
    status: ReviewItemStatus;
    resolution: ReviewResolutionAction;
  } => {
    if (hasError || !text.trim()) {
      return {
        status: 'error',
        resolution: 'skip',
      };
    }

    const nodeCheck = brainStore.checkExistingFileNode(
      targetBrain,
      fileName,
      text,
      fileName
    );

    if (nodeCheck.exists) {
      if (nodeCheck.isIdentical) {
        return {
          nodeCheck,
          status: 'duplicate_identical',
          resolution: 'skip',
        };
      }
      return {
        nodeCheck,
        status: 'duplicate_diff',
        resolution: 'merge',
      };
    }

    return {
      nodeCheck,
      status: 'ready',
      resolution: 'create',
    };
  };

  // Re-evaluate duplicate check when an item's destination brain or title/filename changes
  const revalidateQueueItem = (item: ReviewQueueItem): ReviewQueueItem => {
    if (item.status === 'extracting' || item.status === 'imported') return item;
    const evalResult = computeStatusAndResolution(
      item.text,
      item.fileName,
      item.destinationBrain,
      item.status === 'error'
    );
    return {
      ...item,
      nodeCheck: evalResult.nodeCheck,
      status: evalResult.status,
      resolution: evalResult.resolution,
    };
  };

  // Live duplicate check for Paste tab
  const pasteDuplicateCheck = useMemo(() => {
    if (!pasteContent.trim()) return null;
    const syntheticFileName =
      (pasteTitle.trim()
        ? pasteTitle.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase()
        : 'pasted_conversation') + '.md';
    return brainStore.checkExistingFileNode(
      pasteBrain,
      syntheticFileName,
      pasteContent,
      syntheticFileName
    );
  }, [pasteContent, pasteTitle, pasteBrain]);

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
  ]);

  const exportNodeCount = useMemo(() => {
    return brainStore.recall(
      exportBrain,
      '',
      exportSourceFilter === 'all' ? null : exportSourceFilter,
      null
    ).length;
  }, [exportBrain, exportSourceFilter, isOpen]);

  // Queue metrics (must be declared before any early return)
  const queueMetrics = useMemo(() => {
    const total = reviewQueue.length;
    const ready = reviewQueue.filter(
      (q) =>
        q.status !== 'imported' &&
        q.status !== 'skipped' &&
        q.resolution !== 'skip' &&
        q.status !== 'extracting'
    ).length;
    const duplicates = reviewQueue.filter((q) => q.nodeCheck?.exists).length;
    const totalUnits = reviewQueue.reduce((acc, q) => acc + (q.itemCount || 1), 0);
    return { total, ready, duplicates, totalUnits };
  }, [reviewQueue]);

  if (!isOpen) return null;

  const handleCopyText = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreateNewBrainInline = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newBrainInput.trim().toLowerCase();
    if (!cleaned) return;
    brainStore.createBrain(cleaned);
    if (onCreateBrain) onCreateBrain(cleaned);
    setDefaultBrain(cleaned);
    setPasteBrain(cleaned);
    setExportBrain(cleaned);
    setNewBrainInput('');
    setIsCreatingBrain(false);
  };

  // --- Workflow 1 Handlers ---
  const handleCreateDeviceToken = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newDeviceName.trim() || `${newDeviceBrowser} Companion`;
    const created = await brainStore.createCompanionDevice(label, newDeviceBrowser);
    if (created) {
      setNewlyIssuedToken({ name: created.name, token: created.token });
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

  // --- Workflow 2 Handlers ---
  const handleFilesSelected = async (files: FileList | File[]) => {
    setCommitBanner(null);
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      const placeholderId = `rq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const placeholderItem: ReviewQueueItem = {
        id: placeholderId,
        title: file.name.replace(/\.[^/.]+$/, ''),
        fileName: file.name,
        extension: '.' + (file.name.split('.').pop()?.toLowerCase() || 'txt'),
        sizeBytes: file.size,
        text: '',
        source: 'claude',
        destinationBrain: defaultBrain,
        itemCount: 1,
        itemUnitLabel: 'document',
        status: 'extracting',
        resolution: 'create',
        tags: [],
      };

      setReviewQueue((prev) => [...prev, placeholderItem]);

      try {
        const extractedItems: ExtractedFileResult[] = await extractItemsFromFile(file);
        const mappedItems: ReviewQueueItem[] = extractedItems.map((ext, idx) => {
          const hasErr = ext.status === 'error' || !ext.text.trim();
          const evalRes = computeStatusAndResolution(
            ext.text,
            ext.fileName,
            defaultBrain,
            hasErr
          );
          return {
            id: `${placeholderId}-${idx}`,
            title: ext.title || ext.fileName.replace(/\.[^/.]+$/, ''),
            fileName: ext.fileName,
            archiveParent: ext.archiveParent,
            extension: ext.extension,
            sizeBytes: ext.sizeBytes,
            text: ext.text,
            source: ext.detectedSource,
            destinationBrain: defaultBrain,
            itemCount: ext.pageOrItemCount || 1,
            itemUnitLabel: ext.itemUnitLabel || 'document',
            status: evalRes.status,
            statusMessage: ext.statusMessage,
            nodeCheck: evalRes.nodeCheck,
            resolution: evalRes.resolution,
            tags: ext.archiveParent ? ['archive-import'] : [],
          };
        });

        setReviewQueue((prev) =>
          prev.flatMap((item) => (item.id === placeholderId ? mappedItems : [item]))
        );
      } catch (err: any) {
        setReviewQueue((prev) =>
          prev.map((item) =>
            item.id === placeholderId
              ? {
                  ...item,
                  status: 'error',
                  statusMessage: err?.message || 'Failed to parse file',
                  resolution: 'skip',
                }
              : item
          )
        );
      }
    }
  };

  const handleUpdateQueueItem = (
    id: string,
    patch: Partial<ReviewQueueItem>
  ) => {
    setReviewQueue((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...patch };
        if (
          patch.destinationBrain !== undefined ||
          patch.fileName !== undefined
        ) {
          return revalidateQueueItem(updated);
        }
        return updated;
      })
    );
  };

  const handleApplyBrainToAllQueue = (targetBrain: string) => {
    setDefaultBrain(targetBrain);
    setReviewQueue((prev) =>
      prev.map((item) =>
        item.status === 'imported'
          ? item
          : revalidateQueueItem({ ...item, destinationBrain: targetBrain })
      )
    );
  };

  const handleSetAllDuplicatesResolution = (resolution: ReviewResolutionAction) => {
    setReviewQueue((prev) =>
      prev.map((item) =>
        item.nodeCheck?.exists && item.status !== 'imported'
          ? { ...item, resolution }
          : item
      )
    );
  };

  const handleRemoveQueueItem = (id: string) => {
    setReviewQueue((prev) => prev.filter((item) => item.id !== id));
    if (expandedPreviewId === id) setExpandedPreviewId(null);
  };

  const handleCommitReviewQueue = () => {
    const actionable = reviewQueue.filter(
      (item) => item.status !== 'extracting' && item.status !== 'imported'
    );
    if (actionable.length === 0) return;

    setIsCommitting(true);
    let createdCount = 0;
    let mergedCount = 0;
    let replacedCount = 0;
    let skippedCount = 0;

    const updatedQueue = reviewQueue.map((item) => {
      if (item.status === 'extracting' || item.status === 'imported') {
        return item;
      }

      if (item.resolution === 'skip' || !item.text.trim()) {
        skippedCount++;
        return {
          ...item,
          status: 'skipped' as ReviewItemStatus,
          statusMessage: 'Skipped by user resolution',
        };
      }

      const detectedType = inferFileTypeFromExtension(
        item.extension || item.fileName
      );
      const formattedContent =
        item.title.trim() &&
        !item.text.trim().startsWith(`# ${item.title.trim()}`)
          ? `# ${item.title.trim()}\n\n${item.text}`
          : item.text;

      if (
        ingestStrategy === 'semantic' ||
        ingestStrategy === 'single' ||
        item.resolution === 'merge' ||
        item.resolution === 'replace'
      ) {
        const mergeMode =
          item.resolution === 'replace' ? 'replace' : 'auto-merge';
        const res = brainStore.ingestSemanticFile(
          item.destinationBrain,
          item.source,
          formattedContent,
          item.fileName,
          item.fileName,
          detectedType,
          item.tags,
          mergeMode
        );
        if (res.action === 'merged') {
          if (item.resolution === 'replace') replacedCount++;
          else mergedCount++;
        } else if (res.action === 'unchanged') {
          skippedCount++;
        } else {
          createdCount++;
        }
      } else {
        const count = onIngest(
          item.destinationBrain,
          item.source,
          formattedContent,
          chunkSize,
          item.fileName,
          detectedType,
          ingestStrategy
        );
        createdCount += count;
      }

      return {
        ...item,
        status: 'imported' as ReviewItemStatus,
        statusMessage:
          item.resolution === 'merge'
            ? 'Incrementally merged into existing node'
            : item.resolution === 'replace'
            ? 'Replaced existing node content in-place'
            : 'Stored in Brain',
      };
    });

    setReviewQueue(updatedQueue);
    setIsCommitting(false);

    const summarySegments: string[] = [];
    if (createdCount > 0) summarySegments.push(`${createdCount} created`);
    if (mergedCount > 0) summarySegments.push(`${mergedCount} merged`);
    if (replacedCount > 0) summarySegments.push(`${replacedCount} replaced`);
    if (skippedCount > 0) summarySegments.push(`${skippedCount} skipped`);

    setCommitBanner(
      `Import queue processed: ${summarySegments.join(' · ') || 'Complete'}.`
    );
  };

  // --- Workflow 3: Paste Conversation Handlers ---
  const countConversationUnits = (raw: string): { count: number; label: string } => {
    const turnMatches = raw.match(/(?:^|\n)(?:####\s*(?:User|Assistant|Human|Claude|ChatGPT|Gemini)|(?:User|Assistant|Human|AI):)/gi);
    if (turnMatches && turnMatches.length >= 2) {
      return { count: turnMatches.length, label: turnMatches.length === 1 ? 'turn' : 'turns' };
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
      cleanTitle.replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase() + '.md';
    const units = countConversationUnits(pasteContent);
    const parsedTags = pasteTagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const evalRes = computeStatusAndResolution(
      pasteContent,
      fileName,
      pasteBrain,
      false
    );

    const newItem: ReviewQueueItem = {
      id: `paste-${Date.now()}`,
      title: cleanTitle,
      fileName,
      extension: '.md',
      sizeBytes: new Blob([pasteContent]).size,
      text: pasteContent,
      source: pasteSource,
      destinationBrain: pasteBrain,
      itemCount: units.count,
      itemUnitLabel: units.label,
      status: evalRes.status,
      statusMessage: 'Queued from manual conversation paste',
      nodeCheck: evalRes.nodeCheck,
      resolution: evalRes.resolution,
      tags: parsedTags,
    };

    setReviewQueue((prev) => [newItem, ...prev]);
    setPasteTitle('');
    setPasteContent('');
    setPasteTagsInput('');
    setActiveTab('import');
  };

  const handleStorePasteDirectly = () => {
    if (!pasteContent.trim()) return;
    const cleanTitle =
      pasteTitle.trim() ||
      `${SOURCE_PALETTE[pasteSource].name} Conversation (${new Date().toLocaleDateString()})`;
    const fileName =
      cleanTitle.replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase() + '.md';
    const parsedTags = pasteTagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const formattedText = pasteContent.trim().startsWith('# ')
      ? pasteContent
      : `# ${cleanTitle}\n\n${pasteContent}`;

    const res = brainStore.ingestSemanticFile(
      pasteBrain,
      pasteSource,
      formattedText,
      fileName,
      fileName,
      'chat',
      parsedTags,
      'auto-merge'
    );

    setPasteStatusBanner(res.message);
    setPasteTitle('');
    setPasteContent('');
    setPasteTagsInput('');
    setTimeout(() => setPasteStatusBanner(null), 3500);
  };

  // --- Workflow 4: Export Handlers ---
  const handleDownloadMarkdown = () => {
    const blob = new Blob([exportedMarkdown], {
      type: 'text/markdown;charset=utf-8',
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

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity"
      />

      {/* Modal Container */}
      <div className="relative flex h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-white/15 bg-[#050711] text-white shadow-2xl overflow-hidden">
        {/* Top Header Bar with Lifecycle Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#070a17] px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06]">
              <BrainLogo size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-white">
                  Capture Hub
                </h2>
                <span className="text-white/25">·</span>
                <span className="mono text-[11px] text-[#9db4ff]">
                  Source-Aware Memory Pipeline
                </span>
              </div>
              {/* Product Vision Workflow Pipeline */}
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
                          (step === 'CAPTURE' || step === 'STORE')) ||
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
          <div className="flex items-center gap-2.5">
            {!isCreatingBrain ? (
              <div className="flex items-center gap-1.5">
                <span className="mono text-[11px] text-white/45 hidden md:inline">
                  Active Brain:
                </span>
                <select
                  value={defaultBrain}
                  onChange={(e) => {
                    setDefaultBrain(e.target.value);
                    setPasteBrain(e.target.value);
                    setExportBrain(e.target.value);
                  }}
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
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-white/10 bg-[#060914] px-4 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('companion')}
            className={`flex items-center justify-center sm:justify-start gap-2.5 border-b-2 px-3 py-3 text-xs font-medium transition ${
              activeTab === 'companion'
                ? 'border-[#9db4ff] text-white bg-white/[0.03]'
                : 'border-transparent text-white/55 hover:text-white hover:bg-white/[0.015]'
            }`}
          >
            <Puzzle className="h-4 w-4 shrink-0 text-[#9db4ff]" />
            <div className="text-left">
              <div className="leading-none">1. Browser Companion</div>
              <div className="mono text-[10px] text-white/40 mt-1 hidden md:block">
                Extension & device tokens
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`flex items-center justify-center sm:justify-start gap-2.5 border-b-2 px-3 py-3 text-xs font-medium transition ${
              activeTab === 'import'
                ? 'border-[#9db4ff] text-white bg-white/[0.03]'
                : 'border-transparent text-white/55 hover:text-white hover:bg-white/[0.015]'
            }`}
          >
            <Upload className="h-4 w-4 shrink-0 text-emerald-400" />
            <div className="text-left">
              <div className="flex items-center gap-1.5 leading-none">
                <span>2. Import & Review</span>
                {reviewQueue.length > 0 && (
                  <span className="mono tabular-nums rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                    {reviewQueue.length}
                  </span>
                )}
              </div>
              <div className="mono text-[10px] text-white/40 mt-1 hidden md:block">
                Files, ZIPs & review queue
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`flex items-center justify-center sm:justify-start gap-2.5 border-b-2 px-3 py-3 text-xs font-medium transition ${
              activeTab === 'paste'
                ? 'border-[#9db4ff] text-white bg-white/[0.03]'
                : 'border-transparent text-white/55 hover:text-white hover:bg-white/[0.015]'
            }`}
          >
            <ClipboardPaste className="h-4 w-4 shrink-0 text-amber-400" />
            <div className="text-left">
              <div className="leading-none">3. Paste Conversation</div>
              <div className="mono text-[10px] text-white/40 mt-1 hidden md:block">
                Raw transcript or Markdown
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`flex items-center justify-center sm:justify-start gap-2.5 border-b-2 px-3 py-3 text-xs font-medium transition ${
              activeTab === 'export'
                ? 'border-[#9db4ff] text-white bg-white/[0.03]'
                : 'border-transparent text-white/55 hover:text-white hover:bg-white/[0.015]'
            }`}
          >
            <Download className="h-4 w-4 shrink-0 text-purple-400" />
            <div className="text-left">
              <div className="leading-none">4. Portable Export</div>
              <div className="mono text-[10px] text-white/40 mt-1 hidden md:block">
                Markdown snapshot (.md)
              </div>
            </div>
          </button>
        </div>

        {/* Main Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 scrollbar-thin">
          {/* ===============================================================
              WORKFLOW 1: BROWSER COMPANION
             =============================================================== */}
          {activeTab === 'companion' && (
            <div className="space-y-6">
              {/* Live Connection Status Card */}
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
                        gatewayStatus.online ? 'bg-emerald-400' : 'bg-rose-400'
                      }`}
                    />
                    <span className="text-base font-semibold text-white">
                      {gatewayStatus.online
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
                      {devices.length === 1 ? 'authorized device' : 'authorized devices'}
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
              <div className="rounded-xl border border-white/10 bg-[#070a15] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-[#9db4ff]" />
                      <span>Device Token Management</span>
                    </h3>
                    <p className="mt-0.5 text-xs text-white/50">
                      Issue per-browser tokens to authenticate the Browser Companion extension without exposing personal credentials.
                    </p>
                  </div>
                </div>

                {/* Issue New Device Token Form */}
                <form
                  onSubmit={handleCreateDeviceToken}
                  className="flex flex-wrap items-center gap-2.5 pt-1"
                >
                  <input
                    type="text"
                    placeholder="Device label (e.g., MacBook Chrome, Work Edge)..."
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                    className="min-w-[220px] flex-1 rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs text-white placeholder-white/35 outline-none focus:border-white/35"
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

                {/* Newly Issued One-Time Token Banner */}
                {newlyIssuedToken && (
                  <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-200">
                        Device Token Created for "{newlyIssuedToken.name}" — Copy Now
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
                      Paste this token into the "Device Token" field inside the Browser Companion extension popup:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="mono flex-1 rounded-lg border border-emerald-500/30 bg-black/60 px-3 py-2 text-xs text-emerald-300 select-all">
                        {newlyIssuedToken.token}
                      </code>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText('issued-token', newlyIssuedToken.token)
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

                {/* Registered Devices Table */}
                {devices.length === 0 ? (
                  <div className="rounded-lg border border-white/8 bg-black/30 py-6 text-center text-xs text-white/45">
                    No companion device tokens issued yet. Create a token above to pair your browser extension.
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
                          <th className="py-2.5 px-3">Last Active</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/8">
                        {devices.map((dev) => (
                          <tr key={dev.id} className="hover:bg-white/[0.02]">
                            <td className="py-2.5 px-3 font-medium text-white">
                              {dev.name}
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
                              {dev.last_used_at ? (
                                <span className="text-emerald-400">
                                  {new Date(dev.last_used_at).toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-white/35">Never used</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleRevokeDevice(dev.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20 transition"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span>Revoke</span>
                              </button>
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
                    The unpacked Chrome/Edge extension in <code className="mono text-white/85">/extension</code> captures live conversation turns from the active browser tab and injects recalled Brain context directly into the prompt input on:
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
                    Sources without direct browser DOM hooks are captured via the **Import & Review** tab or **Paste Conversation** tab using real client-side parsers:
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
            </div>
          )}

          {/* ===============================================================
              WORKFLOW 2: IMPORT FILES & ARCHIVES + REVIEW QUEUE
             =============================================================== */}
          {activeTab === 'import' && (
            <div className="space-y-5">
              {/* Top Row: Dropzone + Ingestion Strategy */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* File & ZIP Archive Dropzone (7 cols) */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
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
                    Select or drop files and .ZIP export archives to stage in the Review Queue
                  </p>
                  <p className="mt-1 text-[11px] text-white/50 max-w-md">
                    Unpacks <span className="mono text-white/80">.zip</span> archives client-side and extracts <span className="mono text-white/80">conversations.json</span> (ChatGPT/Claude), <span className="mono text-white/80">.pdf</span>, <span className="mono text-white/80">.docx</span>, <span className="mono text-white/80">.pptx</span>, <span className="mono text-white/80">.xlsx</span>, <span className="mono text-white/80">.md</span>, <span className="mono text-white/80">.txt</span>, <span className="mono text-white/80">.csv</span>.
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
                      Choose how reviewed items are structured when committed to a Brain.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIngestStrategy('semantic')}
                      className={`rounded-lg border p-2 text-left transition ${
                        ingestStrategy === 'semantic' || ingestStrategy === 'single'
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
                          setChunkSize(Math.max(200, parseInt(e.target.value, 10) || 1200))
                        }
                        className="mono w-24 rounded border border-white/20 bg-black/50 px-2 py-1 text-xs text-white outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Commit Status Notification Banner */}
              {commitBanner && (
                <div className="flex items-center justify-between rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>{commitBanner}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCommitBanner(null)}
                    className="text-emerald-300/70 hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* ===========================================================
                  IMPORT REVIEW QUEUE TABLE
                 =========================================================== */}
              <div className="rounded-xl border border-white/10 bg-[#060914] overflow-hidden">
                {/* Review Queue Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.02] px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
                      Import Review Queue
                    </h3>
                    <span className="text-white/25">·</span>
                    <span className="mono text-[11px] tabular-nums text-white/60">
                      {queueMetrics.total} {queueMetrics.total === 1 ? 'item' : 'items'}
                    </span>
                    <span className="text-white/25">·</span>
                    <span className="mono text-[11px] tabular-nums text-emerald-300">
                      {queueMetrics.ready} ready to store
                    </span>
                    {queueMetrics.duplicates > 0 && (
                      <>
                        <span className="text-white/25">·</span>
                        <span className="mono text-[11px] tabular-nums text-amber-300">
                          {queueMetrics.duplicates}{' '}
                          {queueMetrics.duplicates === 1 ? 'duplicate' : 'duplicates'} detected
                        </span>
                      </>
                    )}
                  </div>

                  {/* Batch Resolution Controls */}
                  {reviewQueue.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {queueMetrics.duplicates > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSetAllDuplicatesResolution('merge')}
                            className="mono rounded-md border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/75 hover:border-white/25 hover:text-white transition"
                          >
                            All Duplicates → Merge
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetAllDuplicatesResolution('replace')}
                            className="mono rounded-md border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/75 hover:border-white/25 hover:text-white transition"
                          >
                            All Duplicates → Replace
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetAllDuplicatesResolution('skip')}
                            className="mono rounded-md border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/75 hover:border-white/25 hover:text-white transition"
                          >
                            All Duplicates → Skip
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setReviewQueue([])}
                        className="mono rounded-md border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20 transition"
                      >
                        Clear Queue
                      </button>
                    </div>
                  )}
                </div>

                {/* Empty Queue State */}
                {reviewQueue.length === 0 ? (
                  <div className="py-12 px-6 text-center">
                    <p className="text-xs font-medium text-white/70">
                      Your Import Review Queue is empty
                    </p>
                    <p className="mt-1 text-[11px] text-white/45 max-w-md mx-auto">
                      Drop files or a <code className="mono text-white/75">.zip</code> export above, or queue a transcript from the **Paste Conversation** tab to inspect detected sources, duplicate nodes, and merge/replace options before storing.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/10">
                    {reviewQueue.map((item) => {
                      const srcMeta = SOURCE_PALETTE[item.source];
                      const isExpanded = expandedPreviewId === item.id;
                      const hasExisting = Boolean(item.nodeCheck?.exists);

                      return (
                        <div
                          key={item.id}
                          className="p-4 transition hover:bg-white/[0.015] space-y-3"
                        >
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                            {/* 1. File or Conversation Title (4 cols) */}
                            <div className="lg:col-span-4 min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="mono rounded border border-white/15 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white/80 shrink-0">
                                  {item.extension.replace('.', '') || 'DOC'}
                                </span>
                                <input
                                  type="text"
                                  value={item.title}
                                  disabled={item.status === 'imported'}
                                  onChange={(e) =>
                                    handleUpdateQueueItem(item.id, {
                                      title: e.target.value,
                                    })
                                  }
                                  aria-label="Conversation or document title"
                                  className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs font-semibold text-white hover:border-white/15 focus:border-white/35 focus:bg-black/50 outline-none truncate"
                                />
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 pl-1 mono text-[10.5px] text-white/45">
                                <span className="truncate max-w-[190px]" title={item.fileName}>
                                  {item.fileName}
                                </span>
                                <span>·</span>
                                <span className="tabular-nums">
                                  {formatBytes(item.sizeBytes)}
                                </span>
                                {item.archiveParent && (
                                  <>
                                    <span>·</span>
                                    <span className="text-[#9db4ff]">
                                      from {item.archiveParent}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* 2. Detected Source & 3. Destination Brain (3 cols) */}
                            <div className="lg:col-span-3 flex flex-wrap sm:flex-nowrap items-center gap-2">
                              {/* Source Selector */}
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <span
                                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                                  style={{ backgroundColor: srcMeta?.color || '#fff' }}
                                />
                                <select
                                  value={item.source}
                                  disabled={item.status === 'imported'}
                                  onChange={(e) =>
                                    handleUpdateQueueItem(item.id, {
                                      source: e.target.value as AISource,
                                    })
                                  }
                                  aria-label="Detected source"
                                  className="mono w-full rounded-lg border border-white/15 bg-black/50 px-2 py-1 text-[11px] text-white outline-none"
                                >
                                  {(Object.keys(SOURCE_PALETTE) as AISource[]).map(
                                    (sKey) => (
                                      <option
                                        key={sKey}
                                        value={sKey}
                                        className="bg-[#050711]"
                                      >
                                        {SOURCE_PALETTE[sKey].name}
                                      </option>
                                    )
                                  )}
                                </select>
                              </div>

                              {/* Destination Brain Selector */}
                              <select
                                value={item.destinationBrain}
                                disabled={item.status === 'imported'}
                                onChange={(e) =>
                                  handleUpdateQueueItem(item.id, {
                                    destinationBrain: e.target.value,
                                  })
                                }
                                aria-label="Destination Brain"
                                className="mono rounded-lg border border-white/15 bg-black/50 px-2 py-1 text-[11px] text-[#9db4ff] outline-none"
                              >
                                {brains.map((b) => (
                                  <option key={b} value={b} className="bg-[#050711]">
                                    → {b}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* 4. Count & 5. Import Status / Duplicate Badge (2 cols) */}
                            <div className="lg:col-span-2 flex flex-col justify-center">
                              <div className="mono text-[11px] tabular-nums text-white/85">
                                {item.itemCount} {item.itemUnitLabel}
                              </div>

                              <div className="mt-0.5 mono text-[10.5px]">
                                {item.status === 'extracting' && (
                                  <span className="text-indigo-300">
                                    Extracting...
                                  </span>
                                )}
                                {item.status === 'ready' && (
                                  <span className="text-emerald-400">
                                    Ready · New Node
                                  </span>
                                )}
                                {item.status === 'duplicate_identical' && (
                                  <span className="text-amber-300">
                                    Duplicate (#{item.nodeCheck?.existingFact?.id}) · Identical
                                  </span>
                                )}
                                {item.status === 'duplicate_diff' && (
                                  <span className="text-amber-300">
                                    Duplicate (#{item.nodeCheck?.existingFact?.id}) · +
                                    {item.nodeCheck?.newSectionsDetected || 1} new
                                  </span>
                                )}
                                {item.status === 'imported' && (
                                  <span className="text-emerald-400 font-semibold">
                                    ✓ Stored in "{item.destinationBrain}"
                                  </span>
                                )}
                                {item.status === 'skipped' && (
                                  <span className="text-white/40">Skipped</span>
                                )}
                                {item.status === 'error' && (
                                  <span className="text-rose-400">
                                    {item.statusMessage || 'Parse error'}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 6. Merge / Skip / Replace Resolution + Preview/Remove (3 cols) */}
                            <div className="lg:col-span-3 flex items-center justify-end gap-1.5">
                              {item.status !== 'imported' &&
                                item.status !== 'extracting' && (
                                  <div className="inline-flex rounded-lg border border-white/15 bg-black/50 p-0.5 mono text-[10.5px]">
                                    {hasExisting ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleUpdateQueueItem(item.id, {
                                              resolution: 'merge',
                                            })
                                          }
                                          className={`rounded-md px-2 py-1 transition ${
                                            item.resolution === 'merge'
                                              ? 'bg-[#9db4ff] text-black font-semibold'
                                              : 'text-white/60 hover:text-white'
                                          }`}
                                          title="Incrementally merge new sections into existing node"
                                        >
                                          Merge
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleUpdateQueueItem(item.id, {
                                              resolution: 'replace',
                                            })
                                          }
                                          className={`rounded-md px-2 py-1 transition ${
                                            item.resolution === 'replace'
                                              ? 'bg-amber-400 text-black font-semibold'
                                              : 'text-white/60 hover:text-white'
                                          }`}
                                          title="Overwrite existing node content in-place"
                                        >
                                          Replace
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleUpdateQueueItem(item.id, {
                                              resolution: 'skip',
                                            })
                                          }
                                          className={`rounded-md px-2 py-1 transition ${
                                            item.resolution === 'skip'
                                              ? 'bg-white/20 text-white font-semibold'
                                              : 'text-white/60 hover:text-white'
                                          }`}
                                          title="Skip this item"
                                        >
                                          Skip
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleUpdateQueueItem(item.id, {
                                              resolution: 'create',
                                            })
                                          }
                                          className={`rounded-md px-2.5 py-1 transition ${
                                            item.resolution === 'create'
                                              ? 'bg-emerald-400 text-black font-semibold'
                                              : 'text-white/60 hover:text-white'
                                          }`}
                                        >
                                          Import
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleUpdateQueueItem(item.id, {
                                              resolution: 'skip',
                                            })
                                          }
                                          className={`rounded-md px-2.5 py-1 transition ${
                                            item.resolution === 'skip'
                                              ? 'bg-white/20 text-white font-semibold'
                                              : 'text-white/60 hover:text-white'
                                          }`}
                                        >
                                          Skip
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}

                              {item.text && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedPreviewId(
                                      isExpanded ? null : item.id
                                    )
                                  }
                                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/12 bg-white/[0.03] text-white/65 hover:text-white transition"
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

                              <button
                                type="button"
                                onClick={() => handleRemoveQueueItem(item.id)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-white/45 hover:border-rose-500/30 hover:text-rose-300 transition"
                                title="Remove from queue"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Duplicate Detection Detail Callout */}
                          {hasExisting && item.nodeCheck?.existingFact && (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px]">
                              <div className="flex items-center gap-2 text-amber-200">
                                <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                                <span>
                                  Matches existing Node{' '}
                                  <strong className="mono">
                                    #{item.nodeCheck.existingFact.id}
                                  </strong>{' '}
                                  in "{item.destinationBrain}"
                                  {item.nodeCheck.isIdentical
                                    ? ' (100% identical content — recommended: Skip)'
                                    : ` (${item.nodeCheck.newSectionsDetected} new semantic section(s) detected — recommended: Merge)`}
                                </span>
                              </div>
                              <span className="mono text-[10px] text-amber-300/80">
                                Action: {item.resolution.toUpperCase()}
                              </span>
                            </div>
                          )}

                          {/* Expandable Content Preview */}
                          {isExpanded && item.text && (
                            <div className="rounded-xl border border-white/12 bg-black/70 p-3.5 space-y-2">
                              <div className="flex items-center justify-between border-b border-white/10 pb-2 mono text-[10.5px] text-white/50">
                                <span>
                                  Extracted Content Preview · {item.fileName}
                                </span>
                                <span className="tabular-nums">
                                  {item.text.length.toLocaleString()} characters
                                </span>
                              </div>
                              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-white/80 leading-relaxed scrollbar-thin">
                                {item.text}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===============================================================
              WORKFLOW 3: PASTE CONVERSATION
             =============================================================== */}
          {activeTab === 'paste' && (
            <div className="space-y-4">
              {pasteStatusBanner && (
                <div className="flex items-center justify-between rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>{pasteStatusBanner}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPasteStatusBanner(null)}
                    className="text-emerald-300/70 hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* Title */}
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

                {/* Source */}
                <div>
                  <label className="block mono text-[11px] text-white/50 mb-1">
                    AI Source Origin
                  </label>
                  <select
                    value={pasteSource}
                    onChange={(e) => setPasteSource(e.target.value as AISource)}
                    className="mono w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none focus:border-white/40"
                  >
                    {(Object.keys(SOURCE_PALETTE) as AISource[]).map((src) => (
                      <option key={src} value={src} className="bg-[#050711]">
                        {SOURCE_PALETTE[src].name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Destination Brain */}
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

              {/* Optional Tags */}
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

              {/* Live Duplicate Detection Callout */}
              {pasteDuplicateCheck?.exists && pasteDuplicateCheck.existingFact && (
                <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                    <span>
                      Existing Node{' '}
                      <strong className="mono">
                        #{pasteDuplicateCheck.existingFact.id}
                      </strong>{' '}
                      detected in "{pasteBrain}".{' '}
                      {pasteDuplicateCheck.isIdentical
                        ? 'Content is identical.'
                        : `${pasteDuplicateCheck.newSectionsDetected} new section(s) will be incrementally merged.`}
                    </span>
                  </div>
                </div>
              )}

              {/* Conversation / Markdown Textarea */}
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
                  rows={10}
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="Paste conversation turns (e.g., User: ... / Assistant: ...) or structured Markdown notes here..."
                  className="mono w-full rounded-xl border border-white/15 bg-black/60 p-3.5 text-xs text-white placeholder-white/30 outline-none focus:border-white/40 leading-relaxed"
                />
              </div>

              {/* Paste Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={!pasteContent.trim()}
                  onClick={handleQueuePastedConversation}
                  className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/[0.05] px-4 py-2 text-xs font-medium text-white hover:bg-white/[0.1] disabled:opacity-40 transition"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  <span>Stage in Review Queue</span>
                </button>

                <button
                  type="button"
                  disabled={!pasteContent.trim()}
                  onClick={handleStorePasteDirectly}
                  className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-white/90 disabled:opacity-40 transition"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Store Directly in "{pasteBrain}"</span>
                </button>
              </div>
            </div>
          )}

          {/* ===============================================================
              WORKFLOW 4: PORTABLE MARKDOWN EXPORT
             =============================================================== */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              {/* Export Configuration Bar */}
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
                      setExportSourceFilter(e.target.value as AISource | 'all')
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
                      onChange={(e) => setExportIncludeMetadata(e.target.checked)}
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
                  <div className="flex items-center gap-2 w-full justify-end">
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

              {/* Portable Markdown Preview */}
              <div className="rounded-xl border border-white/10 bg-[#060914] overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-4 py-2.5 mono text-[11px] text-white/55">
                  <span>
                    Portable Markdown Preview ·{' '}
                    <strong className="text-white">
                      the-brain-{exportBrain}.md
                    </strong>
                  </span>
                  <span className="tabular-nums">
                    {exportNodeCount} {exportNodeCount === 1 ? 'node' : 'nodes'}{' '}
                    · {exportedMarkdown.length.toLocaleString()} chars
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#070a17] px-5 py-3.5 shrink-0">
          <div className="mono text-xs text-white/55">
            {activeTab === 'companion' && (
              <span>
                Gateway:{' '}
                <strong
                  className={
                    gatewayStatus.online ? 'text-emerald-400' : 'text-rose-400'
                  }
                >
                  {gatewayStatus.online ? 'Connected' : 'Local Mode'}
                </strong>{' '}
                · {devices.length} registered device token(s)
              </span>
            )}
            {activeTab === 'import' && (
              <span className="tabular-nums">
                {queueMetrics.total} queued · {queueMetrics.totalUnits} total
                conversations/documents · {queueMetrics.ready} actionable
              </span>
            )}
            {activeTab === 'paste' && (
              <span className="tabular-nums">
                Target Brain: <strong className="text-white">{pasteBrain}</strong>{' '}
                · Source:{' '}
                <strong className="text-white">
                  {SOURCE_PALETTE[pasteSource].name}
                </strong>
              </span>
            )}
            {activeTab === 'export' && (
              <span className="tabular-nums">
                Exporting <strong className="text-white">{exportNodeCount}</strong>{' '}
                memory nodes from "{exportBrain}"
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/15 px-4 py-2 text-xs font-medium text-white/70 hover:text-white transition"
            >
              Close
            </button>

            {activeTab === 'import' && (
              <button
                type="button"
                disabled={isCommitting || queueMetrics.ready === 0}
                onClick={handleCommitReviewQueue}
                className="flex items-center gap-1.5 rounded-xl bg-white px-5 py-2 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
                <span>
                  {isCommitting
                    ? 'Storing Reviewed Items...'
                    : `Commit Review Queue (${queueMetrics.ready})`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
