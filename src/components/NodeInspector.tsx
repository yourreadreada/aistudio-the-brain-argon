import React, { useState } from 'react';
import { BrainNode, CATEGORY_COLORS, INITIAL_BRAIN_NODES } from '../data/brainData';
import { ApexLogo } from './ApexLogo';

interface NodeInspectorProps {
  node: BrainNode | null;
  onClose: () => void;
  onSelectNode: (node: BrainNode) => void;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  node,
  onClose,
  onSelectNode,
}) => {
  const [askQuery, setAskQuery] = useState('');
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);

  if (!node) return null;

  const colors = CATEGORY_COLORS[node.category];
  const linkedNodes = node.connections
    .map((id) => INITIAL_BRAIN_NODES.find((n) => n.id === id))
    .filter((n): n is BrainNode => Boolean(n));

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!askQuery.trim()) return;
    setIsThinking(true);
    setAskAnswer(null);

    setTimeout(() => {
      setIsThinking(false);
      setAskAnswer(
        `Apex analyzed 14 cross-tool artifacts related to "${node.label}":\n` +
        `• Current Status: Fully aligned on ${node.subtext}.\n` +
        `• Direct Context: Next review checkpoint scheduled with zero outstanding blockers.\n` +
        `• Recommended Action: Keep automated Slack ingestion active.`
      );
    }, 600);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/10 bg-[#070913]/95 shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-out">
      {/* Drawer Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <ApexLogo size={14} className="text-white/60" />
          <span className="mono text-xs uppercase tracking-wider text-white/50">
            Memory Inspector
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
          aria-label="Close details"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {/* Entity Title & Category */}
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: colors.fill }}
            />
            <span
              className="mono text-xs uppercase tracking-wider"
              style={{ color: colors.text }}
            >
              {node.category}
            </span>
            <span className="text-white/30">·</span>
            <span className="mono text-xs text-white/50">
              via {node.source.toUpperCase()}
            </span>
            <span className="text-white/30">·</span>
            <span className="mono text-xs text-white/40">{node.lastActive}</span>
          </div>

          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {node.label}
          </h2>
          <p className="mono mt-1 text-xs text-white/60">{node.subtext}</p>
        </div>

        {/* Synthesis Summary */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
          <div className="mono text-[11px] font-medium text-white/40 uppercase tracking-wider">
            Autonomous Memory Synthesis
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/90">
            {node.summary}
          </p>
        </div>

        {/* Key Points */}
        {node.details.points && node.details.points.length > 0 && (
          <div>
            <div className="mono text-[11px] font-medium text-white/40 uppercase tracking-wider">
              Extracted Facts & Invariants
            </div>
            <ul className="mt-2.5 space-y-2">
              {node.details.points.map((point, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs text-white/80 leading-relaxed">
                  <span className="mt-1 block h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Metrics Grid if available */}
        {node.details.metrics && node.details.metrics.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5">
            {node.details.metrics.map((m, i) => (
              <div
                key={i}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-3"
              >
                <div className="mono text-[10px] text-white/40 uppercase">
                  {m.label}
                </div>
                <div className="mono mt-1 text-sm font-medium text-white">
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Timeline of Source Events */}
        {node.details.timeline && node.details.timeline.length > 0 && (
          <div>
            <div className="mono text-[11px] font-medium text-white/40 uppercase tracking-wider">
              Cross-Tool Provenance
            </div>
            <div className="mt-3 space-y-3">
              {node.details.timeline.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-2.5"
                >
                  <div className="mono mt-0.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">
                    {item.tool}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-white/90">{item.event}</p>
                    <p className="mono mt-0.5 text-[10px] text-white/40">{item.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connected Synaptic Nodes */}
        {linkedNodes.length > 0 && (
          <div>
            <div className="mono text-[11px] font-medium text-white/40 uppercase tracking-wider">
              Connected Synapses ({linkedNodes.length})
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {linkedNodes.map((target) => (
                <button
                  key={target.id}
                  onClick={() => onSelectNode(target)}
                  className="group flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/80 transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[target.category].fill }}
                  />
                  <span>{target.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ask Brain specific prompt */}
        <div className="pt-2">
          <div className="mono text-[11px] font-medium text-white/40 uppercase tracking-wider">
            Ask The Brain
          </div>
          <form onSubmit={handleAsk} className="mt-2">
            <div className="relative">
              <input
                type="text"
                placeholder={`Ask about ${node.label}...`}
                value={askQuery}
                onChange={(e) => setAskQuery(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/40 py-2.5 pl-3.5 pr-20 text-xs text-white placeholder-white/30 outline-none transition focus:border-white/50"
              />
              <button
                type="submit"
                disabled={!askQuery.trim() || isThinking}
                className="mono absolute right-1.5 top-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-[11px] font-medium text-black transition hover:bg-white disabled:opacity-40"
              >
                {isThinking ? '...' : 'Query'}
              </button>
            </div>
          </form>

          {askAnswer && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-relaxed text-white/90">
              <pre className="whitespace-pre-wrap font-sans">{askAnswer}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
