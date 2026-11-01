import React, { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { RecentActivityItem, SOURCE_PALETTE, ActivityAction } from '../types/brain';

interface RecentActivityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activities: RecentActivityItem[];
  onSelectActivity: (item: RecentActivityItem) => void;
  onClearActivities?: () => void;
}

export const RecentActivityPanel: React.FC<RecentActivityPanelProps> = ({
  isOpen,
  onClose,
  activities,
  onSelectActivity,
  onClearActivities,
}) => {
  const [filterAction, setFilterAction] = useState<ActivityAction | 'all'>('all');

  if (!isOpen) return null;

  const filtered = activities.filter((act) => {
    if (filterAction === 'all') return true;
    return act.action === filterAction;
  });

  const formatRelativeTime = (isoString: string): string => {
    try {
      const then = new Date(isoString).getTime();
      const now = Date.now();
      const diffSec = Math.floor((now - then) / 1000);

      if (diffSec < 45) return 'Just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return `${Math.floor(diffSec / 86400)}d ago`;
    } catch {
      return '';
    }
  };

  const getActionLabel = (action: ActivityAction) => {
    switch (action) {
      case 'modified':
        return { label: 'Modified', color: 'text-amber-300' };
      case 'created':
        return { label: 'Stored', color: 'text-emerald-300' };
      case 'accessed':
      default:
        return { label: 'Viewed', color: 'text-sky-300' };
    }
  };

  return (
    <aside
      aria-label="Activity Log"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[360px] flex-col border-l border-white/12 bg-[#060812]/95 shadow-2xl backdrop-blur-2xl transition-transform duration-200 ease-out"
    >
      {/* Top Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Activity Log</span>
          <span className="text-white/25" aria-hidden="true">·</span>
          <span className="mono text-xs tabular-nums text-white/45">
            {filtered.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/45 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Close activity log"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Filter Bar */}
      <div className="border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-1">
          {(['all', 'modified', 'created', 'accessed'] as const).map((act) => {
            const label =
              act === 'all'
                ? 'All'
                : act === 'modified'
                ? 'Modified'
                : act === 'created'
                ? 'Stored'
                : 'Viewed';
            return (
              <button
                key={act}
                type="button"
                onClick={() => setFilterAction(act)}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  filterAction === act
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Activity List */}
      <div className="flex-1 overflow-y-auto px-5 py-3 scrollbar-thin">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-xs text-white/55">No matching activity events.</p>
            <p className="mt-1 text-xs text-white/35">
              Nodes you inspect, store, or edit appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {filtered.map((item) => {
              const palette = SOURCE_PALETTE[item.source] || {
                color: '#fff',
                name: item.source,
              };
              const actionMeta = getActionLabel(item.action);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectActivity(item)}
                  className="group block w-full py-3 text-left transition hover:bg-white/[0.02]"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`font-medium ${actionMeta.color}`}>
                        {actionMeta.label}
                      </span>
                      <span className="text-white/25" aria-hidden="true">·</span>
                      <span
                        className="font-medium"
                        style={{ color: palette.color }}
                      >
                        {palette.name}
                      </span>
                      <span className="text-white/25" aria-hidden="true">·</span>
                      <span className="mono text-[11px] tabular-nums text-white/50">
                        #{item.factId}
                      </span>
                      <span className="text-white/25" aria-hidden="true">·</span>
                      <span className="text-white/55 capitalize truncate">
                        {item.brain}
                      </span>
                    </div>

                    <span className="mono text-[11px] tabular-nums text-white/40 shrink-0 ml-2">
                      {formatRelativeTime(item.timestamp)}
                    </span>
                  </div>

                  <p className="mt-1.5 text-xs text-white/80 leading-relaxed line-clamp-2 group-hover:text-white">
                    {item.snippet}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
        <span className="text-xs text-white/40">Local audit history</span>
        {onClearActivities && activities.length > 0 && (
          <button
            type="button"
            onClick={onClearActivities}
            className="flex items-center gap-1 text-xs text-white/45 hover:text-rose-300 transition"
          >
            <Trash2 className="h-3 w-3" />
            <span>Clear</span>
          </button>
        )}
      </div>
    </aside>
  );
};
