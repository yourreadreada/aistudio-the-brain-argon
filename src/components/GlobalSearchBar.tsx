import React, { useState, useEffect, useRef } from 'react';
import { Fact, SOURCE_PALETTE } from '../types/brain';
import { brainStore } from '../services/brainStorage';

interface GlobalSearchBarProps {
  currentBrain: string;
  onSelectFact: (fact: Fact, targetBrain?: string) => void;
  onFilterChange: (query: string) => void;
  filterQuery: string;
}

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
  const [localQuery, setLocalQuery] = useState(filterQuery);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Sync external filterQuery
  useEffect(() => {
    setLocalQuery(filterQuery);
  }, [filterQuery]);

  // Debounce notification to parent to keep typing at 0ms latency without thrashing canvas
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQuery !== filterQuery) {
        onFilterChange(localQuery);
      }
    }, 110);
    return () => clearTimeout(timer);
  }, [localQuery, filterQuery, onFilterChange]);

  // Global keyboard shortcut: Cmd+K / Ctrl+K or '/'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

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

  // Update search results whenever query or scope changes
  useEffect(() => {
    if (!filterQuery.trim()) {
      if (isOpen) {
        // Show recent or starter suggestions when empty
        const suggestions = brainStore.recall(currentBrain).slice(0, 6);
        setResults(suggestions);
      } else {
        setResults([]);
      }
      setSelectedIndex(0);
      return;
    }

    if (scope === 'all') {
      const matches = brainStore.globalSearch(filterQuery, currentBrain);
      setResults(matches);
    } else {
      const matches = brainStore.recall(currentBrain, filterQuery);
      setResults(matches);
    }
    setSelectedIndex(0);
  }, [filterQuery, scope, currentBrain, isOpen]);

  const handleSelect = (fact: Fact) => {
    brainStore.recordActivity(fact, 'accessed');
    onSelectFact(fact, fact.brain);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    }
  };

  const clearQuery = () => {
    setLocalQuery('');
    onFilterChange('');
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-lg">
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
          placeholder={`Search neural nodes in ${currentBrain}... (⌘K)`}
          value={localQuery}
          onChange={(e) => {
            setLocalQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="mono w-full rounded-xl border border-white/20 bg-black/45 py-1.5 pl-8 pr-16 text-[12px] text-white placeholder-white/40 outline-none backdrop-blur-md transition hover:border-white/30 focus:border-white/50 focus:bg-black/70"
        />

        {/* Shortcuts / Clear indicator */}
        <div className="absolute right-2 flex items-center gap-1">
          {localQuery ? (
            <button
              onClick={clearQuery}
              className="mono rounded px-1 text-[11px] text-white/40 hover:text-white"
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

      {/* Floating Global Search Results Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[440px] overflow-hidden rounded-2xl border border-white/20 bg-[#060814]/95 shadow-2xl backdrop-blur-2xl">
          {/* Header Controls: Scope & Count */}
          <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="mono text-white/40 text-[10px] uppercase">Scope:</span>
              <button
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

            <span className="mono text-[10px] text-white/40">
              {results.length} node{results.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Results List */}
          <div className="max-h-[340px] overflow-y-auto p-1.5 scrollbar-thin">
            {results.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-white/50">No neural nodes match "{filterQuery}"</p>
                <p className="mono mt-1 text-[10.5px] text-white/30">
                  Try searching by keyword, title, source origin, or node ID (e.g. #3)
                </p>
              </div>
            ) : (
              results.map((fact, idx) => {
                const isSelected = idx === selectedIndex;
                const palette = SOURCE_PALETTE[fact.source] || {
                  color: '#fff',
                  name: fact.source,
                };

                return (
                  <div
                    key={fact.id}
                    onClick={() => handleSelect(fact)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`group flex cursor-pointer items-start gap-2.5 rounded-xl p-2.5 transition ${
                      isSelected
                        ? 'border border-white/25 bg-white/10'
                        : 'border border-transparent hover:bg-white/5'
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
                      <div className="flex items-center gap-2">
                        <span
                          className="mono text-[10.5px] font-semibold uppercase tracking-wider"
                          style={{ color: palette.color }}
                        >
                          {palette.name}
                        </span>
                        <span className="mono text-[10.5px] text-white/40">
                          #{fact.id}
                        </span>
                        {scope === 'all' && fact.brain !== currentBrain && (
                          <span className="mono rounded bg-white/10 px-1 py-0.2 text-[9.5px] text-white/60">
                            brain: {fact.brain}
                          </span>
                        )}
                        <span className="mono ml-auto text-[9.5px] text-white/30">
                          {new Date(fact.updated_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>

                      <p className="mt-1 line-clamp-2 text-[11.5px] text-white/90 leading-relaxed font-sans">
                        {fact.content}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Shortcuts Navigation */}
          <div className="flex items-center justify-between border-t border-white/10 px-3 py-1.5 text-[10px] text-white/40 font-mono">
            <span>↑↓ to navigate</span>
            <span>↵ to select & focus</span>
            <span>ESC to close</span>
          </div>
        </div>
      )}
    </div>
  );
};
