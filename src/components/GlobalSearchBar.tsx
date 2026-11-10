import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Fact, SOURCE_PALETTE } from '../types/brain';
import { brainStore } from '../services/brainStorage';

interface GlobalSearchBarProps {
  currentBrain: string;
  onSelectFact: (fact: Fact, targetBrain?: string) => void;
  onFilterChange: (query: string) => void;
  filterQuery: string;
}

const INITIAL_VISIBLE_RESULTS = 40;
const LOAD_MORE_STEP = 40;

export const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({
  currentBrain,
  onSelectFact,
  onFilterChange,
  filterQuery,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const [results, setResults] = useState<Fact[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE_RESULTS);
  const [localQuery, setLocalQuery] = useState(filterQuery);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLDivElement | null>(null);

  // Sync external filterQuery
  useEffect(() => {
    setLocalQuery(filterQuery);
  }, [filterQuery]);

  // Debounce notification to parent to keep typing responsive without thrashing canvas
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQuery !== filterQuery) {
        onFilterChange(localQuery);
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [localQuery, filterQuery, onFilterChange]);

  // Global keyboard shortcut: Cmd+K / Ctrl+K, '/', or Escape
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === 'Escape') {
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
          inputRef.current?.blur();
        } else if (localQuery.trim()) {
          setLocalQuery('');
          onFilterChange('');
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, localQuery, onFilterChange]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const effectiveQuery = localQuery.trim();

  // Update search results whenever query or scope changes
  useEffect(() => {
    setVisibleLimit(INITIAL_VISIBLE_RESULTS);
    if (!effectiveQuery) {
      if (isOpen) {
        const suggestions = brainStore.recall(currentBrain).slice(0, 10);
        setResults(suggestions);
      } else {
        setResults([]);
      }
      setSelectedIndex(0);
      return;
    }

    if (scope === 'all') {
      const matches = brainStore.globalSearch(effectiveQuery, currentBrain);
      setResults(matches);
    } else {
      const matches = brainStore.recall(currentBrain, effectiveQuery);
      setResults(matches);
    }
    setSelectedIndex(0);
  }, [effectiveQuery, scope, currentBrain, isOpen]);

  // Ensure selectedIndex expands visibleLimit if keyboard navigation reaches the bottom
  useEffect(() => {
    if (selectedIndex >= visibleLimit) {
      setVisibleLimit((prev) => Math.min(results.length, selectedIndex + LOAD_MORE_STEP));
    }
  }, [selectedIndex, visibleLimit, results.length]);

  // Scroll active keyboard selection into view inside the independent dropdown scroll container
  useEffect(() => {
    if (isOpen && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [selectedIndex, isOpen]);

  const visibleResults = useMemo(
    () => results.slice(0, visibleLimit),
    [results, visibleLimit]
  );

  const handleSelect = (fact: Fact) => {
    brainStore.recordActivity(fact, 'accessed');
    onSelectFact(fact, fact.brain);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const clearQuery = () => {
    setLocalQuery('');
    onFilterChange('');
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen) {
        setIsOpen(false);
        inputRef.current?.blur();
      } else if (localQuery) {
        clearQuery();
      }
      return;
    }

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelectedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelectedIndex(results.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    }
  };

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (visibleLimit >= results.length) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      setVisibleLimit((prev) => Math.min(results.length, prev + LOAD_MORE_STEP));
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-lg"
      data-testid="global-search-container"
    >
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <svg
          className="pointer-events-none absolute left-3 text-white/40 transition group-focus-within:text-white"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>

        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="global-search-results-listbox"
          aria-label={`Search memories in ${currentBrain}`}
          data-testid="global-search-input"
          placeholder={`Search titles, content, files, tags, Fixture ID in ${currentBrain}... (⌘K)`}
          value={localQuery}
          onChange={(e) => {
            const val = e.target.value;
            setLocalQuery(val);
            onFilterChange(val);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="mono w-full rounded-xl border border-white/20 bg-black/55 py-1.5 pl-8 pr-16 text-[12px] text-white placeholder-white/40 outline-none backdrop-blur-md transition hover:border-white/30 focus:border-[#9db4ff]/60 focus:bg-black/80"
        />

        {/* Shortcuts / Clear indicator */}
        <div className="absolute right-2 flex items-center gap-1">
          {localQuery ? (
            <button
              type="button"
              onClick={clearQuery}
              title="Clear search and restore graph"
              aria-label="Clear search"
              data-testid="global-search-clear-btn"
              className="mono rounded px-1.5 py-0.5 text-[12px] text-white/60 hover:bg-white/15 hover:text-white transition"
            >
              ×
            </button>
          ) : (
            <span className="mono pointer-events-none rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9.5px] text-white/40">
              ⌘K
            </span>
          )}
        </div>
      </div>

      {/* Aligned Floating Search Results Dropdown with Independent Scrollable Area */}
      {isOpen && (
        <div
          id="global-search-results-listbox"
          role="listbox"
          data-testid="global-search-dropdown"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 flex max-h-[min(440px,calc(100vh-96px))] w-full min-w-[290px] flex-col overflow-hidden rounded-2xl border border-white/20 bg-[#060814]/98 shadow-[0_20px_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
        >
          {/* Header Controls: Scope & Count */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#080b1a] px-3.5 py-2 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="mono text-white/40 text-[10px] uppercase">Scope:</span>
              <button
                type="button"
                onClick={() => setScope('current')}
                className={`mono rounded-md px-2 py-0.5 text-[10.5px] transition ${
                  scope === 'current'
                    ? 'bg-white/20 text-white font-medium'
                    : 'text-white/40 hover:text-white'
                }`}
              >
                brain: {currentBrain}
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`mono rounded-md px-2 py-0.5 text-[10.5px] transition ${
                  scope === 'all'
                    ? 'bg-white/20 text-white font-medium'
                    : 'text-white/40 hover:text-white'
                }`}
              >
                All Brains
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="mono text-[10px] text-emerald-300/90 font-medium tabular-nums"
                data-testid="global-search-match-count"
              >
                {effectiveQuery
                  ? `${results.length} matching node${results.length === 1 ? '' : 's'}`
                  : `Recent (${results.length})`}
              </span>
              {effectiveQuery && (
                <button
                  type="button"
                  onClick={clearQuery}
                  className="mono text-[10px] text-white/45 underline hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Independent Scrollable Results List */}
          <div
            ref={listContainerRef}
            onScroll={handleListScroll}
            data-testid="global-search-scroll-area"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 scrollbar-thin"
          >
            {results.length === 0 ? (
              <div className="py-7 px-3 text-center">
                <p className="text-xs text-white/70">
                  No neural nodes match "{effectiveQuery}"
                </p>
                <p className="mono mt-1 text-[10.5px] text-white/40">
                  Try searching by title, filename, path, Fixture ID (e.g. BRAIN-GRAPH-ADD-091), tag, source, or #ID
                </p>
              </div>
            ) : (
              <>
                {visibleResults.map((fact, idx) => {
                  const isSelected = idx === selectedIndex;
                  const palette = SOURCE_PALETTE[fact.source] || {
                    color: '#fff',
                    name: fact.source,
                  };
                  const title =
                    fact.documentTitle || fact.fileName || `Memory #${fact.id}`;
                  const relevance = effectiveQuery
                    ? brainStore.computeRelevanceScore(
                        fact,
                        effectiveQuery,
                        currentBrain
                      )
                    : null;

                  return (
                    <div
                      key={fact.id}
                      ref={isSelected ? activeItemRef : null}
                      role="option"
                      aria-selected={isSelected}
                      data-testid={`search-result-item-${fact.id}`}
                      onClick={() => handleSelect(fact)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`group flex cursor-pointer items-start gap-2.5 rounded-xl p-2.5 transition ${
                        isSelected
                          ? 'border border-[#9db4ff]/45 bg-[#9db4ff]/12'
                          : 'border border-transparent hover:bg-white/[0.05]'
                      }`}
                    >
                      {/* Source Color Dot */}
                      <div className="mt-1 flex shrink-0 items-center justify-center">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: palette.color }}
                        />
                      </div>

                      {/* Content Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className="mono text-[10px] font-semibold uppercase tracking-wider"
                            style={{ color: palette.color }}
                          >
                            {palette.name}
                          </span>
                          <span className="mono text-[10px] text-white/45">
                            #{fact.id}
                          </span>
                          {fact.fixtureId && (
                            <span className="mono rounded bg-indigo-500/20 border border-indigo-400/30 px-1.5 py-0.2 text-[9px] text-indigo-200">
                              {fact.fixtureId}
                            </span>
                          )}
                          {fact.filePath && (
                            <span className="mono truncate max-w-[180px] rounded bg-white/5 px-1.5 py-0.2 text-[9px] text-white/50">
                              {fact.filePath}
                            </span>
                          )}
                          {scope === 'all' && fact.brain !== currentBrain && (
                            <span className="mono rounded bg-white/10 px-1 py-0.2 text-[9.5px] text-white/60">
                              brain: {fact.brain}
                            </span>
                          )}
                          <span className="mono ml-auto text-[9.5px] text-white/30">
                            {new Date(fact.updated_at).toLocaleDateString(
                              undefined,
                              {
                                month: 'short',
                                day: 'numeric',
                              }
                            )}
                          </span>
                        </div>

                        <div className="mt-0.5 text-[11.5px] font-semibold text-white truncate">
                          {title}
                        </div>

                        <p className="mt-0.5 line-clamp-2 text-[11px] text-white/75 leading-relaxed font-sans">
                          {fact.content}
                        </p>

                        {relevance && relevance.matchedFields.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="mono text-[9px] text-white/35">
                              Matched in:
                            </span>
                            {relevance.matchedFields.map((field) => (
                              <span
                                key={field}
                                className="mono rounded bg-emerald-500/15 border border-emerald-500/30 px-1 py-0.2 text-[8.5px] text-emerald-300"
                              >
                                {field}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {visibleLimit < results.length && (
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleLimit((prev) =>
                        Math.min(results.length, prev + LOAD_MORE_STEP)
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] py-1.5 mono text-[10.5px] text-[#9db4ff] hover:bg-white/[0.07] transition"
                  >
                    Show more ({results.length - visibleLimit} remaining)
                  </button>
                )}
              </>
            )}
          </div>

          {/* Footer Shortcuts Navigation */}
          <div className="flex shrink-0 items-center justify-between border-t border-white/10 bg-[#080b1a] px-3 py-1.5 text-[10px] text-white/45 font-mono">
            <span>↑↓ navigate ({results.length})</span>
            <span>↵ focus node & inspect</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="hover:text-white transition"
            >
              ESC close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
