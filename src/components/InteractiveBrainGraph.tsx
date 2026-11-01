import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { BrainNode, INITIAL_BRAIN_NODES, CATEGORY_COLORS } from '../data/brainData';

interface InteractiveBrainGraphProps {
  onSelectNode: (node: BrainNode | null) => void;
  selectedNodeId: string | null;
  searchQuery: string;
  activeCategory: string | null;
  activeSource: string | null;
}

export const InteractiveBrainGraph: React.FC<InteractiveBrainGraphProps> = ({
  onSelectNode,
  selectedNodeId,
  searchQuery,
  activeCategory,
  activeSource,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredNode, setHoveredNode] = useState<BrainNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Pan & Zoom state
  const panRef = useRef({ x: 0, y: 0, zoom: 1 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const didDragRef = useRef(false);

  // Sonar scan effect
  const scanTimeRef = useRef(0);
  const isScanningRef = useRef(true);

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    return INITIAL_BRAIN_NODES.filter((node) => {
      if (activeCategory && node.category !== activeCategory) return false;
      if (activeSource && node.source !== activeSource) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesLabel = node.label.toLowerCase().includes(q);
        const matchesSubtext = node.subtext.toLowerCase().includes(q);
        const matchesSummary = node.summary.toLowerCase().includes(q);
        if (!matchesLabel && !matchesSubtext && !matchesSummary) return false;
      }
      return true;
    });
  }, [activeCategory, activeSource, searchQuery]);

  const filteredIdSet = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);
  const selectedConnections = useMemo(() => {
    const sel = INITIAL_BRAIN_NODES.find((n) => n.id === selectedNodeId);
    return sel ? new Set(sel.connections) : new Set<string>();
  }, [selectedNodeId]);

  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;

  const hoveredNodeRef = useRef(hoveredNode);
  hoveredNodeRef.current = hoveredNode;

  const filteredIdSetRef = useRef(filteredIdSet);
  filteredIdSetRef.current = filteredIdSet;

  const selectedConnectionsRef = useRef(selectedConnections);
  selectedConnectionsRef.current = selectedConnections;

  // Trigger sonar wave on search change
  useEffect(() => {
    scanTimeRef.current = 0;
    isScanningRef.current = true;
  }, [searchQuery, activeCategory, activeSource]);

  // Smooth Zoom-to-Fit Animator
  const animatePanZoom = (targetX: number, targetY: number, targetZoom: number, duration = 480) => {
    const startX = panRef.current.x;
    const startY = panRef.current.y;
    const startZoom = panRef.current.zoom;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3);

      panRef.current.x = startX + (targetX - startX) * ease;
      panRef.current.y = startY + (targetY - startY) * ease;
      panRef.current.zoom = startZoom + (targetZoom - startZoom) * ease;

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  };

  const wasNodeSelectedRef = useRef(false);
  useEffect(() => {
    if (selectedNodeId) {
      const node = INITIAL_BRAIN_NODES.find((n) => n.id === selectedNodeId);
      if (!node) return;
      const clusterNodes = INITIAL_BRAIN_NODES.filter(
        (n) => n.category === node.category || n.source === node.source
      );
      const avgX = clusterNodes.reduce((acc, n) => acc + n.x, 0) / clusterNodes.length;
      const avgY = clusterNodes.reduce((acc, n) => acc + n.y, 0) / clusterNodes.length;

      const canvas = canvasRef.current;
      const width = canvas ? canvas.clientWidth : 800;
      const height = canvas ? canvas.clientHeight : 600;
      const baseRadius = Math.min(width, height) * 0.45;

      const panelWidth = Math.min(400, width * 0.42);
      const shiftX = -panelWidth / 2;
      const targetZoom = 1.45;

      const targetPanX = shiftX - avgX * baseRadius * targetZoom;
      const targetPanY = -avgY * baseRadius * targetZoom;

      animatePanZoom(targetPanX, targetPanY, targetZoom, 500);
      wasNodeSelectedRef.current = true;
    } else if (wasNodeSelectedRef.current) {
      animatePanZoom(0, 0, 1.0, 460);
      wasNodeSelectedRef.current = false;
    }
  }, [selectedNodeId]);

  // Main rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      if (!canvas || !ctx) return;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const startTime = performance.now();

    const nodePos = new Map<string, { x: number; y: number; r: number; node: BrainNode }>();
    INITIAL_BRAIN_NODES.forEach((node) => {
      nodePos.set(node.id, { x: 0, y: 0, r: 7, node });
    });

    function render(time: number) {
      if (!ctx) return;
      const elapsed = (time - startTime) / 1000;
      scanTimeRef.current += 0.016;

      const selectedNodeId = selectedNodeIdRef.current;
      const hoveredNode = hoveredNodeRef.current;
      const filteredIdSet = filteredIdSetRef.current;
      const selectedConnections = selectedConnectionsRef.current;

      // Clear with deep space black
      ctx.fillStyle = '#03040a';
      ctx.fillRect(0, 0, width, height);

      // Subtle coordinate background grid with perspective
      const pan = panRef.current;
      const gridSize = 48 * pan.zoom;
      const startX = (width / 2 + pan.x) % gridSize;
      const startY = (height / 2 + pan.y) % gridSize;

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.lineWidth = 1;
      for (let x = startX; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = startY; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Clean ambient center glow (radar circle removed for realistic brain topology)
      const centerX = width / 2 + pan.x;
      const centerY = height / 2 + pan.y;
      const baseRadius = Math.min(width, height) * 0.45 * pan.zoom;

      const radialGlow = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        baseRadius * 1.4
      );
      radialGlow.addColorStop(0, 'rgba(157, 180, 255, 0.07)');
      radialGlow.addColorStop(0.4, 'rgba(157, 180, 255, 0.02)');
      radialGlow.addColorStop(1, 'rgba(3, 4, 10, 0)');
      ctx.fillStyle = radialGlow;
      ctx.fillRect(0, 0, width, height);

      // Update node screen positions
      INITIAL_BRAIN_NODES.forEach((node) => {
        // Slight organic orbital breathing motion
        const breath = 0.012 * Math.sin(elapsed * 0.8 + node.importance);
        const effectiveX = node.x * (1 + breath);
        const effectiveY = node.y * (1 + breath);

        const screenX = centerX + effectiveX * baseRadius;
        const screenY = centerY + effectiveY * baseRadius;

        const entry = nodePos.get(node.id);
        if (entry) {
          entry.x = screenX;
          entry.y = screenY;
          entry.r = (5 + node.importance * 1.8) * Math.sqrt(pan.zoom);
        }
      });

      // Draw Connections (Synapses)
      INITIAL_BRAIN_NODES.forEach((node) => {
        const from = nodePos.get(node.id);
        if (!from) return;

        node.connections.forEach((targetId) => {
          const to = nodePos.get(targetId);
          if (!to) return;
          // Avoid drawing lines twice
          if (node.id > targetId) return;

          const isConnectedToSelected =
            selectedNodeId === node.id || selectedNodeId === targetId;
          const isSelected = selectedNodeId === node.id && selectedNodeId === targetId;
          const isMatchingFilter =
            filteredIdSet.has(node.id) &&
            filteredIdSet.has(targetId);

          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);

          if (selectedNodeId) {
            if (isConnectedToSelected) {
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
              ctx.lineWidth = 1.6;
            } else {
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
              ctx.lineWidth = 0.6;
            }
          } else if (isMatchingFilter) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.lineWidth = 0.9;
          } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.lineWidth = 0.5;
          }
          ctx.stroke();

          // Animated synaptic data packet
          if (isMatchingFilter || isConnectedToSelected) {
            const packetT = (elapsed * 0.4 + (node.importance % 3) * 0.33) % 1;
            const px = from.x + (to.x - from.x) * packetT;
            const py = from.y + (to.y - from.y) * packetT;

            ctx.beginPath();
            ctx.arc(px, py, 1.8 * Math.sqrt(pan.zoom), 0, Math.PI * 2);
            ctx.fillStyle = isConnectedToSelected
              ? 'rgba(255, 255, 255, 0.95)'
              : 'rgba(157, 180, 255, 0.7)';
            ctx.fill();
          }
        });
      });

      // Draw Center Memory Core Beacon
      ctx.beginPath();
      ctx.arc(centerX, centerY, 8 * Math.sqrt(pan.zoom), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.shadowColor = '#9db4ff';
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(centerX, centerY, 16 * Math.sqrt(pan.zoom), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw Nodes
      INITIAL_BRAIN_NODES.forEach((node) => {
        const pos = nodePos.get(node.id);
        if (!pos) return;

        const isFiltered = filteredIdSet.has(node.id);
        const isSelected = selectedNodeId === node.id;
        const isConnectedToSelected = selectedConnections.has(node.id);
        const isHovered = hoveredNode?.id === node.id;

        const colors = CATEGORY_COLORS[node.category];
        const r = pos.r || 7;

        let alpha = 0.25;
        if (selectedNodeId) {
          if (isSelected) alpha = 1;
          else if (isConnectedToSelected) alpha = 0.85;
          else alpha = 0.12;
        } else if (isFiltered) {
          alpha = isHovered ? 1 : 0.85;
        } else {
          alpha = 0.15;
        }

        // Outer glow on selected/hovered
        if (isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r + 6, 0, Math.PI * 2);
          ctx.fillStyle = colors.bg;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = colors.stroke;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#ffffff' : colors.fill;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Label beside node
        const fontSize = Math.max(10, Math.min(13, Math.round(11 * Math.sqrt(pan.zoom))));
        ctx.font = `${isSelected || isHovered ? '600' : '400'} ${fontSize}px Plus Jakarta Sans, sans-serif`;
        ctx.fillStyle = isSelected
          ? '#ffffff'
          : isHovered || isConnectedToSelected
          ? 'rgba(255, 255, 255, 0.9)'
          : isFiltered
          ? 'rgba(255, 255, 255, 0.65)'
          : 'rgba(255, 255, 255, 0.2)';

        const textX = pos.x + r + 7;
        const textY = pos.y + 3.5;
        ctx.fillText(node.label, textX, textY);

        if (isSelected || isHovered) {
          ctx.font = `400 ${Math.max(9, fontSize - 2)}px JetBrains Mono, monospace`;
          ctx.fillStyle = colors.text;
          ctx.fillText(node.subtext, textX, textY + fontSize + 2);
        }
      });

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Pointer interactions for hovering & clicking nodes
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    didDragRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > 4) {
        didDragRef.current = true;
        panRef.current.x += dx;
        panRef.current.y += dy;
        dragStartRef.current = { x: e.clientX, y: e.clientY };
      }
      return;
    }

    // Hit-testing nodes
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pan = panRef.current;
    const centerX = width / 2 + pan.x;
    const centerY = height / 2 + pan.y;
    const baseRadius = Math.min(width, height) * 0.45 * pan.zoom;

    let hit: BrainNode | null = null;
    for (const node of INITIAL_BRAIN_NODES) {
      const screenX = centerX + node.x * baseRadius;
      const screenY = centerY + node.y * baseRadius;
      const r = (5 + node.importance * 1.8) * Math.sqrt(pan.zoom) + 6;
      if (Math.hypot(mouseX - screenX, mouseY - screenY) <= r) {
        hit = node;
        break;
      }
    }

    setHoveredNode(hit);
    if (hit) {
      setTooltipPos({ x: e.clientX, y: e.clientY });
    } else {
      setTooltipPos(null);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    if (!didDragRef.current) {
      // It's a genuine click
      if (hoveredNode) {
        onSelectNode(hoveredNode);
      } else {
        onSelectNode(null);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    panRef.current.zoom = Math.max(0.6, Math.min(2.5, panRef.current.zoom * zoomFactor));
  };

  const resetView = () => {
    panRef.current = { x: 0, y: 0, zoom: 1 };
  };

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#03040a]">
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      />

      {/* Floating View Controls */}
      <div className="pointer-events-auto absolute bottom-5 left-5 flex items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-md">
        <button
          onClick={() => {
            panRef.current.zoom = Math.min(2.5, panRef.current.zoom * 1.2);
          }}
          className="mono text-xs text-white/70 transition hover:text-white"
          title="Zoom In"
        >
          +
        </button>
        <div className="h-3 w-px bg-white/20" />
        <button
          onClick={() => {
            panRef.current.zoom = Math.max(0.6, panRef.current.zoom * 0.8);
          }}
          className="mono text-xs text-white/70 transition hover:text-white"
          title="Zoom Out"
        >
          −
        </button>
        <div className="h-3 w-px bg-white/20" />
        <button
          onClick={resetView}
          className="mono text-[11px] text-white/50 transition hover:text-white"
        >
          Recenter
        </button>
      </div>

      {/* Tooltip on Node Hover */}
      {hoveredNode && tooltipPos && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-white/20 bg-[#0c0e18]/90 px-3 py-2 text-xs shadow-2xl backdrop-blur-md transition-all duration-75"
          style={{
            left: `${tooltipPos.x + 16}px`,
            top: `${tooltipPos.y + 16}px`,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[hoveredNode.category].fill }}
            />
            <span className="font-semibold text-white">{hoveredNode.label}</span>
            <span className="mono text-[10px] uppercase text-white/50">
              {hoveredNode.category}
            </span>
          </div>
          <p className="mt-0.5 text-white/70">{hoveredNode.subtext}</p>
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-white/40">
            <span>Source: {hoveredNode.source.toUpperCase()}</span>
            <span>·</span>
            <span>Active: {hoveredNode.lastActive}</span>
          </div>
        </div>
      )}
    </div>
  );
};
