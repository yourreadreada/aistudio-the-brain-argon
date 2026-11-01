import React, { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, Trash2, Plus } from 'lucide-react';
import { Fact, SOURCE_PALETTE, getFactFileType, FILE_TYPE_CONFIG } from '../types/brain';
import { brainStore } from '../services/brainStorage';

interface FactPanelProps {
  fact: Fact | null;
  onClose: () => void;
  onSaveCorrection: (id: number, newContent: string) => void;
  onDeleteFact: (id: number) => void;
  onUpdateTags?: (id: number, tags: string[]) => void;
}

export const FactPanel: React.FC<FactPanelProps> = ({
  fact,
  onClose,
  onSaveCorrection,
  onDeleteFact,
  onUpdateTags,
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

  return (
    <aside
      aria-label="Node Inspector"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[380px] flex-col border-l border-white/12 bg-[#060812]/95 shadow-2xl backdrop-blur-2xl transition-transform duration-200 ease-out"
    >
      {/* Inspector Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="mono text-xs font-semibold tabular-nums text-white">
            Node #{fact.id}
          </span>
          <span className="text-white/25" aria-hidden="true">·</span>
          <span
            className="text-xs font-semibold"
            style={{ color: sourceMeta.color }}
          >
            {sourceMeta.name}
          </span>
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
