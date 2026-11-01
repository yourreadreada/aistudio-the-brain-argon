import React, { useState, useRef, useEffect } from 'react';
import {
  AISource,
  FactFileType,
  IngestStrategy,
  MergeStrategy,
  ExistingFileNodeCheck,
  SOURCE_PALETTE,
  FILE_TYPE_CONFIG,
  inferFileTypeFromExtension,
} from '../types/brain';
import { brainStore } from '../services/brainStorage';
import { BrainLogo } from './BrainLogo';
import {
  extractTextFromFile,
  ExtractedFileResult,
  SUPPORTED_FILE_EXTENSIONS,
} from '../services/fileExtractor';

interface IngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBrain: string;
  brains: string[];
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

interface QueuedFile {
  id: string;
  file: File;
  result?: ExtractedFileResult;
  isProcessing: boolean;
  source: AISource;
  nodeCheck?: ExistingFileNodeCheck;
}

export const IngestModal: React.FC<IngestModalProps> = ({
  isOpen,
  onClose,
  currentBrain,
  brains,
  onIngest,
}) => {
  const [brain, setBrain] = useState(currentBrain);
  const [chunkSize, setChunkSize] = useState(1200);
  const [ingestStrategy, setIngestStrategy] = useState<IngestStrategy>('semantic');
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>('auto-merge');
  const [activeTab, setActiveTab] = useState<'files' | 'paste'>('files');
  const [manualText, setManualText] = useState('');
  const [manualSource, setManualSource] = useState<AISource>('claude');
  const [fileQueue, setFileQueue] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestSuccessMessage, setIngestSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Re-check existing file nodes when target brain changes
  useEffect(() => {
    if (fileQueue.length > 0) {
      setFileQueue((prev) =>
        prev.map((q) => {
          if (q.result?.text) {
            const nodeCheck = brainStore.checkExistingFileNode(
              brain,
              q.file.name,
              q.result.text,
              q.file.name
            );
            return { ...q, nodeCheck };
          }
          return q;
        })
      );
    }
  }, [brain]);

  if (!isOpen) return null;

  // Process uploaded files through fileExtractor
  const handleFilesSelected = async (files: FileList | File[]) => {
    const newItems: QueuedFile[] = Array.from(files).map((file) => ({
      id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      file,
      isProcessing: true,
      source: 'claude', // placeholder until auto-detection completes
    }));

    setFileQueue((prev) => [...prev, ...newItems]);

    for (const item of newItems) {
      try {
        const result = await extractTextFromFile(item.file);
        const nodeCheck = result.text
          ? brainStore.checkExistingFileNode(brain, item.file.name, result.text, item.file.name)
          : undefined;

        setFileQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  result,
                  nodeCheck,
                  isProcessing: false,
                  source: result.detectedSource,
                }
              : q
          )
        );
      } catch (err: any) {
        setFileQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  isProcessing: false,
                  result: {
                    fileName: item.file.name,
                    extension: '.' + item.file.name.split('.').pop(),
                    sizeBytes: item.file.size,
                    text: '',
                    detectedSource: 'claude',
                    status: 'error',
                    statusMessage: err?.message || 'Extraction failed',
                  },
                }
              : q
          )
        );
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const removeQueuedFile = (id: string) => {
    setFileQueue((prev) => prev.filter((q) => q.id !== id));
    if (previewFileId === id) setPreviewFileId(null);
  };

  const updateFileSource = (id: string, newSource: AISource) => {
    setFileQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, source: newSource } : q))
    );
  };

  const totalExtractedCharacters = fileQueue.reduce(
    (acc, q) => acc + (q.result?.text.length || 0),
    0
  );

  const totalEstimatedChunks = fileQueue.reduce((acc, q) => {
    if (!q.result?.text) return acc;
    if (ingestStrategy === 'semantic' || ingestStrategy === 'single') return acc + 1;
    if (ingestStrategy === 'branching') {
      const turns = q.result.text.includes('#### User')
        ? q.result.text.split(/(?=#### (?:User|Assistant))/g).filter(Boolean).length
        : q.result.text.split(/(?=^#{1,3}\s+)/m).filter(Boolean).length;
      return acc + 1 + Math.max(1, turns);
    }
    return acc + Math.max(1, Math.ceil(q.result.text.length / chunkSize));
  }, 0);

  const handleBatchIngest = async () => {
    setIsIngesting(true);

    if (activeTab === 'paste') {
      if (!manualText.trim()) return;
      if (ingestStrategy === 'semantic') {
        const res = brainStore.ingestSemanticFile(
          brain,
          manualSource,
          manualText,
          'direct_paste.md',
          'direct_paste.md',
          'chat',
          undefined,
          mergeStrategy
        );
        setIngestSuccessMessage(res.message);
      } else {
        const count = onIngest(
          brain,
          manualSource,
          manualText,
          chunkSize,
          'direct_paste.md',
          'chat',
          ingestStrategy
        );
        setIngestSuccessMessage(`Ingested ${count} facts from text paste into "${brain}"!`);
      }

      setTimeout(() => {
        setIsIngesting(false);
        setIngestSuccessMessage(null);
        setManualText('');
        onClose();
      }, 1500);
      return;
    }

    let mergedCount = 0;
    let createdCount = 0;
    let unchangedCount = 0;

    for (const q of fileQueue) {
      if (q.result?.text?.trim()) {
        const detectedType = inferFileTypeFromExtension(q.result.extension || q.file.name);
        if (ingestStrategy === 'semantic' || ingestStrategy === 'single') {
          const res = brainStore.ingestSemanticFile(
            brain,
            q.source,
            q.result.text,
            q.file.name,
            q.file.name,
            detectedType,
            undefined,
            mergeStrategy
          );
          if (res.action === 'merged') mergedCount++;
          else if (res.action === 'unchanged') unchangedCount++;
          else createdCount++;
        } else {
          const count = onIngest(
            brain,
            q.source,
            q.result.text,
            chunkSize,
            q.file.name,
            detectedType,
            ingestStrategy
          );
          createdCount += count;
        }
      }
    }

    let summaryParts: string[] = [];
    if (mergedCount > 0) {
      summaryParts.push(`${mergedCount} file(s) incrementally merged into existing nodes`);
    }
    if (createdCount > 0) {
      summaryParts.push(`${createdCount} file(s) created as unified coherent context nodes`);
    }
    if (unchangedCount > 0) {
      summaryParts.push(`${unchangedCount} file(s) identical & deduplicated`);
    }

    const finalSummary = summaryParts.length
      ? `Ingestion complete for brain "${brain}": ${summaryParts.join(', ')}.`
      : `Successfully processed ${fileQueue.length} file(s) into brain "${brain}"!`;

    setIngestSuccessMessage(finalSummary);

    setTimeout(() => {
      setIsIngesting(false);
      setIngestSuccessMessage(null);
      setFileQueue([]);
      onClose();
    }, 1800);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFormatBadge = (ext: string) => {
    const e = ext.toLowerCase();
    if (e === '.pdf') {
      return { label: 'PDF', bg: 'bg-rose-500/15 border-rose-500/30 text-rose-300' };
    }
    if (e === '.docx') {
      return { label: 'DOCX', bg: 'bg-blue-500/15 border-blue-500/30 text-blue-300' };
    }
    if (e === '.xlsx' || e === '.xls') {
      return { label: 'XLSX', bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' };
    }
    if (e === '.pptx') {
      return { label: 'PPTX', bg: 'bg-amber-500/15 border-amber-500/30 text-amber-300' };
    }
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(e)) {
      return { label: 'IMAGE', bg: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300' };
    }
    return { label: 'TEXT', bg: 'bg-purple-500/15 border-purple-500/30 text-purple-300' };
  };

  const previewTarget = fileQueue.find((q) => q.id === previewFileId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity"
      />

      {/* Modal Dialog */}
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-white/20 bg-[#060814]/95 shadow-2xl backdrop-blur-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2.5 text-white">
            <BrainLogo size={18} className="text-white" />
            <span className="mono text-[13px] font-semibold text-white tracking-wider">
              THE BRAIN · INGESTION ENGINE
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 transition hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Subhead with Target Brain Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.02] px-6 py-3">
          <div>
            <h2 className="text-lg font-medium text-white tracking-tight">
              Ingest College Material & AI Chat Exports
            </h2>
            <p className="mono mt-0.5 text-[11px] text-white/50">
              Extracts text from PDFs, DOCX, XLSX, PPTX, Markdown, chats, & images into searchable facts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="mono text-[11px] text-white/40">Target Brain:</span>
            <select
              value={brain}
              onChange={(e) => setBrain(e.target.value)}
              className="mono rounded-xl border border-white/20 bg-black/40 px-3 py-1.5 text-xs text-white outline-none"
            >
              {brains.map((b) => (
                <option key={b} value={b} className="bg-[#050713]">
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-white/10 bg-black/30 px-6 pt-2">
          <button
            onClick={() => setActiveTab('files')}
            className={`mono flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-medium transition ${
              activeTab === 'files'
                ? 'border-indigo-400 text-white'
                : 'border-transparent text-white/40 hover:text-white'
            }`}
          >
            <span>📁 Upload Files ({fileQueue.length})</span>
            {fileQueue.length > 0 && (
              <span className="rounded-full bg-indigo-500/30 px-1.5 py-0.2 text-[10px] text-indigo-200">
                {fileQueue.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('paste')}
            className={`mono border-b-2 px-4 py-2.5 text-xs font-medium transition ${
              activeTab === 'paste'
                ? 'border-indigo-400 text-white'
                : 'border-transparent text-white/40 hover:text-white'
            }`}
          >
            📋 Direct Text / Markdown Paste
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin space-y-4">
          {/* Strategy Selector */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="mono text-xs font-semibold text-white/90 flex items-center gap-1.5">
                <span>🧠</span>
                <span>Ingestion & Chunking Strategy</span>
              </span>
              <span className="mono text-[10px] text-indigo-300">
                {ingestStrategy === 'semantic' || ingestStrategy === 'single'
                  ? 'Coherent unified context node'
                  : ingestStrategy === 'branching'
                  ? 'File node + connected turns'
                  : 'Character chunk slices'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setIngestStrategy('semantic')}
                className={`text-left p-2.5 rounded-xl border transition ${
                  ingestStrategy === 'semantic' || ingestStrategy === 'single'
                    ? 'border-indigo-400 bg-indigo-500/15 text-white ring-1 ring-indigo-400/40'
                    : 'border-white/10 bg-black/30 text-white/50 hover:border-white/20 hover:text-white/80'
                }`}
              >
                <div className="mono text-[11px] font-semibold flex items-center gap-1.5 text-white">
                  <span>🧠</span>
                  <span>Semantic Unified Node</span>
                  <span className="text-[9px] bg-emerald-500/25 text-emerald-300 px-1 py-0.2 rounded ml-auto">Recommended</span>
                </div>
                <p className="text-[10px] text-white/60 mt-1 leading-snug">
                  Parses logical breaks into 1 coherent unified node. Detects existing file nodes and incrementally merges without redundant split nodes.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setIngestStrategy('branching')}
                className={`text-left p-2.5 rounded-xl border transition ${
                  ingestStrategy === 'branching'
                    ? 'border-indigo-400 bg-indigo-500/15 text-white ring-1 ring-indigo-400/40'
                    : 'border-white/10 bg-black/30 text-white/50 hover:border-white/20 hover:text-white/80'
                }`}
              >
                <div className="mono text-[11px] font-semibold flex items-center gap-1.5 text-white">
                  <span>🌳</span>
                  <span>Document Branching</span>
                </div>
                <p className="text-[10px] text-white/60 mt-1 leading-snug">
                  Creates a master File Node (3rd node under source) and branches dialogue turns/sections out from it.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setIngestStrategy('chunk')}
                className={`text-left p-2.5 rounded-xl border transition ${
                  ingestStrategy === 'chunk'
                    ? 'border-indigo-400 bg-indigo-500/15 text-white ring-1 ring-indigo-400/40'
                    : 'border-white/10 bg-black/30 text-white/50 hover:border-white/20 hover:text-white/80'
                }`}
              >
                <div className="mono text-[11px] font-semibold flex items-center gap-1.5 text-white">
                  <span>🧩</span>
                  <span>Chunk Slices</span>
                </div>
                <p className="text-[10px] text-white/60 mt-1 leading-snug">
                  Splits text linearly into {chunkSize}-character slices as individual peer facts.
                </p>
              </button>
            </div>

            {/* Existing Node Merge Controller */}
            {fileQueue.some((q) => q.nodeCheck?.exists) && (
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between mono text-[10.5px]">
                  <span className="text-indigo-200 font-semibold flex items-center gap-1.5">
                    <span>⚡</span>
                    <span>Existing Node Detected · Incremental Update Strategy</span>
                  </span>
                  <span className="text-indigo-300/80">Prevents split/duplicate nodes</span>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setMergeStrategy('auto-merge')}
                    className={`mono px-2.5 py-1 rounded-lg text-xs transition ${
                      mergeStrategy === 'auto-merge'
                        ? 'bg-indigo-500 text-white font-medium shadow'
                        : 'bg-black/40 text-white/60 hover:text-white border border-white/10'
                    }`}
                  >
                    ✓ Intelligent Incremental Merge (Recommended)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMergeStrategy('replace')}
                    className={`mono px-2.5 py-1 rounded-lg text-xs transition ${
                      mergeStrategy === 'replace'
                        ? 'bg-amber-500 text-black font-semibold shadow'
                        : 'bg-black/40 text-white/60 hover:text-white border border-white/10'
                    }`}
                  >
                    Replace Content In-Place
                  </button>
                </div>
              </div>
            )}

            {/* Chunk size adjuster if chunk slicing is active */}
            {ingestStrategy === 'chunk' && (
              <div className="flex items-center gap-3 pt-1 border-t border-white/5">
                <span className="mono text-[10.5px] text-white/40">Section / Chunk Boundary Size:</span>
                <input
                  type="number"
                  value={chunkSize}
                  onChange={(e) => setChunkSize(parseInt(e.target.value, 10) || 1200)}
                  className="mono w-24 rounded-lg border border-white/20 bg-black/50 px-2 py-1 text-xs text-white outline-none"
                />
                <span className="mono text-[10px] text-white/40">characters</span>
              </div>
            )}
          </div>

          {activeTab === 'files' ? (
            <div className="space-y-4">
              {/* Drag and Drop Upload Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
                  isDragging
                    ? 'border-indigo-400 bg-indigo-500/10'
                    : 'border-white/20 bg-black/30 hover:border-white/40 hover:bg-black/50'
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
                    }
                  }}
                  className="hidden"
                />

                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white/70">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </div>

                <p className="mt-3 text-xs font-medium text-white">
                  Drop files here or click to browse
                </p>
                <p className="mono mt-1 text-[11px] text-white/40">
                  Select multiple files at once. All college & AI chat formats supported.
                </p>

                {/* Formats Supported Badges */}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  <span className="mono rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[9.5px] text-rose-300">
                    PDF (Syllabus/Papers)
                  </span>
                  <span className="mono rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[9.5px] text-blue-300">
                    DOCX (Assignments)
                  </span>
                  <span className="mono rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9.5px] text-emerald-300">
                    XLSX (Marks/Data)
                  </span>
                  <span className="mono rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9.5px] text-amber-300">
                    PPTX (Lectures)
                  </span>
                  <span className="mono rounded border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[9.5px] text-purple-300">
                    MD / TXT (Chats)
                  </span>
                  <span className="mono rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9.5px] text-cyan-300">
                    Images / Diagrams
                  </span>
                </div>
              </div>

              {/* Uploaded File Queue List */}
              {fileQueue.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span className="mono text-[11px] uppercase tracking-wider">
                      Processed Files ({fileQueue.length})
                    </span>
                    <button
                      onClick={() => setFileQueue([])}
                      className="mono text-[10.5px] text-white/40 hover:text-rose-300 transition"
                    >
                      Clear all
                    </button>
                  </div>

                  <div className="space-y-2">
                    {fileQueue.map((item) => {
                      const badge = getFormatBadge(
                        item.result?.extension || '.' + item.file.name.split('.').pop()
                      );

                      return (
                        <div
                          key={item.id}
                          className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 transition hover:border-white/20"
                        >
                          <div className="flex items-center justify-between gap-3">
                            {/* File type badge + name */}
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`mono rounded border px-1.5 py-0.5 text-[10px] font-semibold ${badge.bg}`}
                              >
                                {badge.label}
                              </span>
                              <span className="truncate text-xs font-medium text-white">
                                {item.file.name}
                              </span>
                              <span className="mono text-[10px] text-white/40 shrink-0">
                                {formatFileSize(item.file.size)}
                              </span>
                            </div>

                            {/* Actions & Source Picker */}
                            <div className="flex items-center gap-2 shrink-0">
                              {/* Source Origin Picker */}
                              <select
                                value={item.source}
                                onChange={(e) =>
                                  updateFileSource(item.id, e.target.value as AISource)
                                }
                                className="mono rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-white outline-none"
                              >
                                {(Object.keys(SOURCE_PALETTE) as AISource[]).map((src) => (
                                  <option key={src} value={src} className="bg-[#050713]">
                                    {SOURCE_PALETTE[src].name}
                                  </option>
                                ))}
                              </select>

                              {/* Preview Toggle */}
                              {item.result?.text && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewFileId(
                                      previewFileId === item.id ? null : item.id
                                    )
                                  }
                                  className="mono rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10.5px] text-white/70 hover:text-white"
                                >
                                  {previewFileId === item.id ? 'Hide' : 'Preview'}
                                </button>
                              )}

                              {/* Remove */}
                              <button
                                type="button"
                                onClick={() => removeQueuedFile(item.id)}
                                className="mono text-white/40 hover:text-rose-300 text-sm px-1"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* Extraction Status & Stats */}
                          <div className="flex items-center gap-3 text-[10.5px] text-white/50 mono">
                            {item.isProcessing ? (
                              <span className="flex items-center gap-1.5 text-indigo-300">
                                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-indigo-400" />
                                Extracting text layer & structure...
                              </span>
                            ) : item.result?.status === 'success' ? (
                              <span className="text-emerald-400">
                                ✓ Extracted {item.result.text.length} chars
                                {item.result.pageOrItemCount
                                  ? ` (${item.result.pageOrItemCount} units)`
                                  : ''}
                              </span>
                            ) : (
                              <span className="text-amber-400">
                                ⚠ {item.result?.statusMessage || 'Partial text extracted'}
                              </span>
                            )}
                          </div>

                          {/* Existing Node Detection Badge */}
                          {item.nodeCheck?.exists && (
                            <div className="flex items-center justify-between gap-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-1.5 mono text-[10.5px]">
                              <div className="flex items-center gap-1.5 text-indigo-200 font-medium">
                                <span>⚡</span>
                                <span>Existing Node #{item.nodeCheck.existingFact?.id} detected in "{brain}"</span>
                              </div>
                              <div>
                                {item.nodeCheck.isIdentical ? (
                                  <span className="text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded text-[9.5px] font-semibold">
                                    ✓ Identical (No duplicate created)
                                  </span>
                                ) : (
                                  <span className="text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded text-[9.5px] font-semibold">
                                    +{item.nodeCheck.newSectionsDetected} new turn(s) · Incremental merge
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Collapsible Extracted Text Preview */}
                          {previewFileId === item.id && item.result?.text && (
                            <div className="mt-2 rounded-lg border border-white/10 bg-black/60 p-3">
                              <div className="flex items-center justify-between pb-1 border-b border-white/10 text-[10px] text-white/40 mono">
                                <span>Preview extracted text from {item.file.name}:</span>
                                <span>{item.result.text.length} chars</span>
                              </div>
                              <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-white/80 leading-relaxed scrollbar-thin">
                                {item.result.text}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Direct Text / Markdown Paste Tab */
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mono text-[11px] text-white/40 block mb-1">
                    Receipt Source
                  </label>
                  <select
                    value={manualSource}
                    onChange={(e) => setManualSource(e.target.value as AISource)}
                    className="mono w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-xs text-white outline-none"
                  >
                    {(Object.keys(SOURCE_PALETTE) as AISource[]).map((src) => (
                      <option key={src} value={src} className="bg-[#050713]">
                        {SOURCE_PALETTE[src].name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mono text-[11px] text-white/40 block mb-1">
                    Chunk Paragraph Size
                  </label>
                  <input
                    type="number"
                    value={chunkSize}
                    onChange={(e) => setChunkSize(parseInt(e.target.value, 10) || 1200)}
                    className="mono w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mono text-[11px] text-white/40 block mb-1">
                  Paste Conversation Transcript or Markdown Document
                </label>
                <textarea
                  rows={9}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="Paste your exported Claude or ChatGPT chat, notes, or code context here..."
                  className="mono w-full rounded-xl border border-white/20 bg-black/40 p-3.5 text-xs text-white placeholder-white/30 outline-none leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-white/10 bg-black/40 px-6 py-4">
          <div className="mono text-xs text-white/60">
            {activeTab === 'files' ? (
              <span>
                {fileQueue.length} file(s) · ~{totalEstimatedChunks} chunk(s)
              </span>
            ) : (
              <span>
                {manualText.length} characters
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="mono rounded-xl border border-white/15 px-4 py-2 text-xs text-white/60 hover:text-white transition"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={
                isIngesting ||
                (activeTab === 'files'
                  ? fileQueue.length === 0 || totalExtractedCharacters === 0
                  : !manualText.trim())
              }
              onClick={handleBatchIngest}
              className="mono rounded-xl bg-white px-5 py-2 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-40 shadow-lg shadow-white/10"
            >
              {isIngesting
                ? 'Ingesting into Brain...'
                : ingestSuccessMessage
                ? '✓ Success!'
                : activeTab === 'files'
                ? `Ingest ${fileQueue.length} File${fileQueue.length === 1 ? '' : 's'}`
                : 'Ingest Text'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
