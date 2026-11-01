import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import {
  Fact,
  AISource,
  FactFileType,
  SOURCE_PALETTE,
  FILE_TYPE_CONFIG,
  getFactFileType,
} from '../types/brain';

interface BrainViewerCanvasProps {
  brainName: string;
  facts: Fact[];
  selectedFactId: number | null;
  onSelectFact: (fact: Fact | null) => void;
  searchQuery: string;
  activeSourceFilter: string | null;
}

interface GraphNode {
  id: string;
  isCenter?: boolean;
  isSourceHub?: boolean;
  sourceKey?: AISource;
  fact?: Fact;
  fileType?: FactFileType;
  fileName?: string;
  factContentLower?: string;
  unclusteredBaseX: number;
  unclusteredBaseY: number;
  clusterHubX: number;
  clusterHubY: number;
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  r: number;
  color: string;
  dotColor: string;
  amp: number;
  phase: number;
  phase2: number;
  speed: number;
  twspeed: number;
  label: string;
  subtext?: string;
  branchLevel: number; // 0=center, 1=hub, 2=sub-branch, 3=satellite
}

interface GraphLine {
  a: number;
  b: number;
  color: string;
  baseOpacity: number;
  tier: number; // 0, 1, 2 for multi-layer lighting
  isCrossLink?: boolean;
}

interface ClusterMeta {
  source: AISource;
  name: string;
  count: number;
  x: number;
  y: number;
  color: string;
  dotColor: string;
  clusterRadius: number;
  topTopic: string;
}

export const BrainViewerCanvas: React.FC<BrainViewerCanvasProps> = ({
  brainName,
  facts,
  selectedFactId,
  onSelectFact,
  searchQuery,
  activeSourceFilter,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredFact, setHoveredFact] = useState<Fact | null>(null);
  const [hoveredCluster, setHoveredCluster] = useState<ClusterMeta | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [currentZoomDisplay, setCurrentZoomDisplay] = useState(100);

  // Performance Optimization Refs for 60/120fps animation loop without React teardown
  const selectedFactIdRef = useRef(selectedFactId);
  selectedFactIdRef.current = selectedFactId;

  const hoveredFactRef = useRef(hoveredFact);
  hoveredFactRef.current = hoveredFact;

  const hoveredClusterRef = useRef(hoveredCluster);
  hoveredClusterRef.current = hoveredCluster;

  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  const activeSourceFilterRef = useRef(activeSourceFilter);
  activeSourceFilterRef.current = activeSourceFilter;

  // D3 Knowledge Density Heat-Map Overlay State
  const [showHeatMap, setShowHeatMap] = useState(false);
  const showHeatMapRef = useRef(showHeatMap);
  showHeatMapRef.current = showHeatMap;

  // Pan & Zoom
  const panRef = useRef({ x: 0, y: 0, zoom: 1 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const didDragRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);

  // Interactive mouse pointer magnetism (mimicking the login page physics)
  const pointerRef = useRef({ x: 99, y: 99 });

  // Progressive Natural Neural Awakening Animation (Plays only on initial entrance)
  const initialRevealDoneRef = useRef(false);
  const revealStartRef = useRef<number | null>(null);
  const lastBrainNameRef = useRef<string>(brainName);
  const brainSwitchTimeRef = useRef<number>(0);

  // When switching brain tabs after initial reveal, navigate INSTANTLY without re-running the 2.6s reveal!
  useEffect(() => {
    if (lastBrainNameRef.current !== brainName) {
      lastBrainNameRef.current = brainName;
      // Record quick switch timestamp for an instant sub-180ms spring settle
      brainSwitchTimeRef.current = performance.now();
    }
  }, [searchQuery, activeSourceFilter, brainName]);

  // Heat Map D3 Calculation Cache (Ensures silky 60fps without recalculating contours every single frame)
  const heatMapCacheRef = useRef<{
    contours: d3.ContourMultiPolygon[];
    maxVal: number;
    lastCalcTime: number;
    nodeCount: number;
    lastZoom: number;
  }>({
    contours: [],
    maxVal: 0.001,
    lastCalcTime: 0,
    nodeCount: 0,
    lastZoom: 1,
  });

  // ADAPTIVE GRAPH GENERATOR WITH AUTOMATIC CLUSTERING TOPOLOGY
  const { nodes, lines, linesByTier, sourceClusters, factNodes } = useMemo(() => {
    const nodeList: GraphNode[] = [];
    const lineList: GraphLine[] = [];

    const totalFacts = facts.length;
    const isSparse = totalFacts <= 12;
    const isDense = totalFacts > 45;

    // Distinct sources present in current facts
    const activeSources = Array.from(new Set(facts.map((f) => f.source))) as AISource[];
    const sourcesToDisplay = activeSources.length
      ? activeSources
      : (['claude', 'gpt', 'gemini', 'github'] as AISource[]);

    // Adaptive sizing math
    const baseOrbitRadius = isSparse ? 150 : isDense ? 210 : 180;
    const factBaseRadius = isSparse ? 4.8 : isDense ? 2.8 : 3.6;

    // 1. Center Brain Hub
    const centerIdx = 0;
    nodeList.push({
      id: 'center-hub',
      isCenter: true,
      unclusteredBaseX: 0,
      unclusteredBaseY: 0,
      clusterHubX: 0,
      clusterHubY: 0,
      baseX: 0,
      baseY: 0,
      x: 0,
      y: 0,
      r: isSparse ? 9.5 : isDense ? 7.5 : 8.5,
      color: '#ffffff',
      dotColor: '#ffffff',
      amp: 0,
      phase: 0,
      phase2: 0,
      speed: 0,
      twspeed: 0,
      label: brainName.toUpperCase(),
      subtext: `${totalFacts} memories`,
      branchLevel: 0,
    });

    // 2. Source Hubs arranged radially
    const hubIndexBySource: Record<string, number> = {};
    const clusterMetaList: ClusterMeta[] = [];

    // Helper to extract top keywords for cluster summary
    const extractTopTopic = (sourceFacts: Fact[]): string => {
      if (!sourceFacts.length) return 'General Context';
      const text = sourceFacts.map((f) => f.content.toLowerCase()).join(' ');
      if (text.includes('translator') || text.includes('audio') || text.includes('pytorch') || text.includes('ml')) {
        return 'ML & Audio Pipeline';
      }
      if (text.includes('canteen') || text.includes('redis') || text.includes('fastapi') || text.includes('postgres')) {
        return 'Backend & Infrastructure';
      }
      if (text.includes('coding style') || text.includes('typescript') || text.includes('tailwind')) {
        return 'TypeScript & UI Standards';
      }
      if (text.includes('moodle') || text.includes('assignment') || text.includes('paper') || text.includes('sih')) {
        return 'Coursework & Research';
      }
      if (text.includes('ollama') || text.includes('gpu') || text.includes('local')) {
        return 'Local LLM Inference';
      }
      return `${sourceFacts.length} context items`;
    };

    sourcesToDisplay.forEach((src, i) => {
      const angle = (i / sourcesToDisplay.length) * Math.PI * 2 - Math.PI / 2;
      const sourceFacts = facts.filter((f) => f.source === src);
      const countForSource = sourceFacts.length;

      const weightDistBonus = isDense ? Math.min(30, countForSource * 2.5) : 0;
      const hx = Math.cos(angle) * (baseOrbitRadius + weightDistBonus);
      const hy = Math.sin(angle) * (baseOrbitRadius + weightDistBonus);
      const hubIdx = nodeList.length;
      hubIndexBySource[src] = hubIdx;

      const palette = SOURCE_PALETTE[src] || {
        color: '#ffffff',
        dotColor: '#ffffff',
        name: src,
      };

      // Base cluster radius proportional to count
      const estimatedClusterRadius = Math.max(50, Math.min(105, 38 + countForSource * 8));

      clusterMetaList.push({
        source: src,
        name: palette.name,
        count: countForSource,
        x: hx,
        y: hy,
        color: palette.color,
        dotColor: palette.dotColor,
        clusterRadius: estimatedClusterRadius,
        topTopic: extractTopTopic(sourceFacts),
      });

      nodeList.push({
        id: `hub-${src}`,
        isSourceHub: true,
        sourceKey: src,
        unclusteredBaseX: hx,
        unclusteredBaseY: hy,
        clusterHubX: hx,
        clusterHubY: hy,
        baseX: hx,
        baseY: hy,
        x: hx,
        y: hy,
        r: isSparse ? 7.5 : isDense ? 5.5 : 6.5,
        color: palette.color,
        dotColor: palette.dotColor,
        amp: 1.2,
        phase: i * 1.5,
        phase2: i * 0.8,
        speed: 0.00035,
        twspeed: 0.001,
        label: palette.name,
        subtext: `${countForSource} facts`,
        branchLevel: 1,
      });

      // Stem line from center to source hub
      lineList.push({
        a: centerIdx,
        b: hubIdx,
        color: palette.color,
        baseOpacity: 0.45,
        tier: 2,
      });
    });

    // 3. Sub-branches & Fact Nodes clustered adaptively
    const subBranchAnchors: Record<string, number[]> = {};

    sourcesToDisplay.forEach((src) => {
      subBranchAnchors[src] = [];
      const hubIdx = hubIndexBySource[src];
      if (hubIdx === undefined) return;
      const hubNode = nodeList[hubIdx];
      const sourceFacts = facts.filter((f) => f.source === src);

      if (sourceFacts.length >= 6) {
        const subBranchCount = Math.min(4, Math.max(2, Math.floor(sourceFacts.length / 4)));
        for (let s = 0; s < subBranchCount; s++) {
          const stemAngle =
            Math.atan2(hubNode.baseY, hubNode.baseX) +
            (s - (subBranchCount - 1) / 2) * (isDense ? 0.55 : 0.42);
          const stemDist = isDense ? 42 : 36;
          const sx = hubNode.baseX + Math.cos(stemAngle) * stemDist;
          const sy = hubNode.baseY + Math.sin(stemAngle) * stemDist;
          const sIdx = nodeList.length;
          subBranchAnchors[src].push(sIdx);

          const palette = SOURCE_PALETTE[src] || { color: '#9db4ff', dotColor: '#9db4ff' };

          nodeList.push({
            id: `sub-${src}-${s}`,
            unclusteredBaseX: sx,
            unclusteredBaseY: sy,
            clusterHubX: hubNode.baseX,
            clusterHubY: hubNode.baseY,
            baseX: sx,
            baseY: sy,
            x: sx,
            y: sy,
            r: factBaseRadius * 0.9,
            color: palette.color,
            dotColor: palette.dotColor,
            amp: 1.0,
            phase: s * 1.2,
            phase2: s * 0.9,
            speed: 0.0003,
            twspeed: 0.001,
            label: '',
            branchLevel: 2,
          });

          lineList.push({
            a: hubIdx,
            b: sIdx,
            color: palette.color,
            baseOpacity: 0.32,
            tier: 1,
          });
        }
      }
    });

    // Distribute facts hierarchically:
    // 1. Identify document root facts or master facts for files
    // 2. Parent facts attach directly to the source hub (e.g. Node 1, Node 2, Node 3 under Claude!)
    // 3. Child sections (by parentId or sharing fileName) branch outwards from that document root node!
    const factNodeIdxById = new Map<number, number>();
    const docRootIdxByFileName = new Map<string, number>();

    // First sort facts so that document roots / independent facts come first
    const sortedFacts = [...facts].sort((a, b) => {
      const aIsChild = Boolean(a.parentId);
      const bIsChild = Boolean(b.parentId);
      if (aIsChild !== bIsChild) return aIsChild ? 1 : -1;
      return a.id - b.id;
    });

    sortedFacts.forEach((fact, fIdx) => {
      const hubIdx = hubIndexBySource[fact.source];
      if (hubIdx === undefined) return;
      const hubNode = nodeList[hubIdx];

      const palette = SOURCE_PALETTE[fact.source] || {
        color: '#9db4ff',
        dotColor: '#9db4ff',
      };

      // Determine parent node index
      let parentIdx = hubIdx;
      let isChildNode = false;

      // Check explicit parentId
      if (fact.parentId && factNodeIdxById.has(fact.parentId)) {
        parentIdx = factNodeIdxById.get(fact.parentId)!;
        isChildNode = true;
      } else if (fact.fileName && docRootIdxByFileName.has(fact.fileName)) {
        // Child chunk sharing fileName with an already established document root
        parentIdx = docRootIdxByFileName.get(fact.fileName)!;
        isChildNode = true;
      }

      const parentNode = nodeList[parentIdx];
      const isDocumentMaster = Boolean(fact.isDocumentRoot || fact.isUnifiedContextNode || (!isChildNode && fact.fileName));

      // Sizing & spacing:
      // Document root nodes attach directly to the source hub (forming the 3rd node under Claude!)
      // Child turns/sections orbit around their master document node
      const seed = fact.id * 149.3 + fIdx * 23;
      const spreadAngle = (seed * Math.PI) / 180;
      const spreadDist = isChildNode
        ? 18 + (seed % 28)
        : isSparse
        ? 34 + (seed % 42)
        : 26 + (seed % 48);

      const fx = parentNode.baseX + Math.cos(spreadAngle) * spreadDist;
      const fy = parentNode.baseY + Math.sin(spreadAngle) * spreadDist;
      const factNodeIdx = nodeList.length;
      const fileType = fact.fileType || getFactFileType(fact);

      factNodeIdxById.set(fact.id, factNodeIdx);
      if (fact.fileName && !docRootIdxByFileName.has(fact.fileName)) {
        docRootIdxByFileName.set(fact.fileName, factNodeIdx);
      }

      const cleanDocTitle = fact.documentTitle || (fact.fileName ? fact.fileName.replace(/\.[^/.]+$/, '') : '');
      const nodeLabel = isDocumentMaster && cleanDocTitle
        ? cleanDocTitle.length > 18 ? cleanDocTitle.slice(0, 16) + '..' : cleanDocTitle
        : `#${fact.id}`;

      nodeList.push({
        id: `fact-${fact.id}`,
        fact,
        sourceKey: fact.source,
        fileType,
        fileName: fact.fileName,
        factContentLower: fact.content.toLowerCase(),
        unclusteredBaseX: fx,
        unclusteredBaseY: fy,
        clusterHubX: hubNode.baseX,
        clusterHubY: hubNode.baseY,
        baseX: fx,
        baseY: fy,
        x: fx,
        y: fy,
        r: isDocumentMaster ? factBaseRadius * 1.45 : isChildNode ? factBaseRadius * 0.82 : factBaseRadius,
        color: palette.color,
        dotColor: palette.dotColor,
        amp: 1.4 + (fact.id % 3) * 0.6,
        phase: fact.id * 0.73,
        phase2: fact.id * 1.25,
        speed: 0.0003 + (fact.id % 4) * 0.0001,
        twspeed: 0.0008 + (fact.id % 3) * 0.0004,
        label: nodeLabel,
        subtext: fact.fileName || fact.source,
        branchLevel: isChildNode ? 4 : 3,
      });

      lineList.push({
        a: parentIdx,
        b: factNodeIdx,
        color: palette.color,
        baseOpacity: isChildNode ? 0.35 : 0.24,
        tier: 0,
      });
    });

    // 4. Subtle Cross-Source Synaptic Links
    const factNodes = nodeList
      .map((nd, idx) => ({ nd, idx }))
      .filter((item) => Boolean(item.nd.fact));

    const keywords = ['translator', 'audio', 'canteen', 'moodle', 'claude', 'gpt', 'model', 'typescript', 'redis'];
    const addedCrossLinks = new Set<string>();

    for (const kw of keywords) {
      const matches = factNodes.filter(
        (fn) => fn.nd.fact?.content.toLowerCase().includes(kw)
      );
      if (matches.length >= 2) {
        for (let i = 0; i < matches.length - 1; i++) {
          for (let j = i + 1; j < Math.min(i + 3, matches.length); j++) {
            const a = matches[i].idx;
            const b = matches[j].idx;
            const key = a < b ? `${a}-${b}` : `${b}-${a}`;
            if (!addedCrossLinks.has(key)) {
              addedCrossLinks.add(key);
              lineList.push({
                a,
                b,
                color: 'rgba(255, 255, 255, 0.4)',
                baseOpacity: 0.12,
                tier: 0,
                isCrossLink: true,
              });
            }
          }
        }
      }
    }

    // Pre-group lines by tier for zero-redundancy O(1) single-pass rendering
    const tierGroups: GraphLine[][] = [[], [], []];
    lineList.forEach((ln) => {
      if (tierGroups[ln.tier]) tierGroups[ln.tier].push(ln);
      else tierGroups[0].push(ln);
    });

    return {
      nodes: nodeList,
      lines: lineList,
      linesByTier: tierGroups,
      sourceClusters: clusterMetaList,
      factNodes: nodeList.filter((n) => Boolean(n.fact)),
    };
  }, [facts, brainName]);

  // Smooth Pan & Zoom Animator
  const animatePanZoom = (targetX: number, targetY: number, targetZoom: number, duration = 400) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const startX = panRef.current.x;
    const startY = panRef.current.y;
    const startZoom = panRef.current.zoom;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Smooth cubic ease-out
      const ease = 1 - Math.pow(1 - progress, 3);

      panRef.current.x = startX + (targetX - startX) * ease;
      panRef.current.y = startY + (targetY - startY) * ease;
      panRef.current.zoom = startZoom + (targetZoom - startZoom) * ease;
      setCurrentZoomDisplay(Math.round(panRef.current.zoom * 100));

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      }
    };
    animFrameRef.current = requestAnimationFrame(step);
  };

  // Smooth Zoom-to-Fit behavior: When a node is selected and FactPanel opens,
  // pans and zooms smoothly to center that specific fact cluster in the visible viewport.
  const wasFactSelectedRef = useRef(false);
  useEffect(() => {
    if (selectedFactId !== null) {
      const selectedFact = facts.find((f) => f.id === selectedFactId);
      if (!selectedFact) return;
      const cluster = sourceClusters.find((c) => c.source === selectedFact.source);
      if (!cluster) return;

      const canvas = canvasRef.current;
      const width = canvas ? canvas.clientWidth : window.innerWidth;
      const height = canvas ? canvas.clientHeight : window.innerHeight;

      // The inspection FactPanel slides over from the right taking ~360px
      const panelWidth = Math.min(360, width * 0.85);
      const availWidth = Math.max(200, width - panelWidth);
      // Offset so the cluster is centered in the remaining visible area to the left of the open panel
      const shiftX = -panelWidth / 2;

      // Cluster diameter with comfortable breathing padding
      const clusterDiameter = cluster.clusterRadius * 2 + 40;
      const targetZoom = Math.max(1.15, Math.min(2.1, (Math.min(availWidth, height) * 0.72) / clusterDiameter));

      const targetPanX = shiftX - cluster.x * targetZoom;
      const targetPanY = -cluster.y * targetZoom;

      animatePanZoom(targetPanX, targetPanY, targetZoom, 520);
      wasFactSelectedRef.current = true;
    } else if (wasFactSelectedRef.current) {
      // Panel closed: smoothly return to center overview
      animatePanZoom(0, 0, 1.0, 480);
      wasFactSelectedRef.current = false;
    }
  }, [selectedFactId, sourceClusters, facts]);

  // Main Render Loop with Multi-Layer Atmospheric Lighting and Automatic Node Clustering
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

    let cachedRect = canvas.getBoundingClientRect();
    function updateRect() {
      if (canvas) cachedRect = canvas.getBoundingClientRect();
    }
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, { passive: true });

    function handlePointerMove(e: PointerEvent) {
      if (!canvas) return;
      const pan = panRef.current;
      const cx = cachedRect.width / 2 + pan.x;
      const cy = cachedRect.height / 2 + pan.y;
      const radius = Math.min(cachedRect.width, cachedRect.height) * 0.45 * pan.zoom;

      pointerRef.current = {
        x: (e.clientX - cachedRect.left - cx) / radius,
        y: (e.clientY - cachedRect.top - cy) / radius,
      };
    }

    function handlePointerLeave() {
      pointerRef.current = { x: 99, y: 99 };
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave, { passive: true });

    function render(now: number) {
      if (!ctx) return;

      // Active states from refs (blazing fast, eliminates canvas teardown on hover/search)
      const selectedFactId = selectedFactIdRef.current;
      const hoveredFact = hoveredFactRef.current;
      const hoveredCluster = hoveredClusterRef.current;
      const searchQuery = searchQueryRef.current;
      const lowerSearch = searchQuery ? searchQuery.trim().toLowerCase() : '';
      const activeSourceFilter = activeSourceFilterRef.current;

      // Progressive Natural Neural Awakening Clock
      if (revealStartRef.current === null) {
        revealStartRef.current = now;
      }
      const rawRevealSec = (now - revealStartRef.current) / 1000;
      if (rawRevealSec >= 2.6) {
        initialRevealDoneRef.current = true;
      }

      // If initial entrance reveal is complete, subsequent tab/brain/filter switches load IMMEDIATELY (0 delay)!
      let revealSec = rawRevealSec;
      let tabSwitchEase = 1;

      if (initialRevealDoneRef.current) {
        revealSec = 10.0; // fully revealed!
        if (brainSwitchTimeRef.current > 0) {
          const switchElapsed = (now - brainSwitchTimeRef.current) / 1000;
          tabSwitchEase = Math.min(1, switchElapsed / 0.18);
        }
      }

      // Deep void black base
      ctx.fillStyle = '#03040a';
      ctx.fillRect(0, 0, width, height);

      const pan = panRef.current;
      const cx = width / 2 + pan.x;
      const cy = height / 2 + pan.y;
      const zoom = pan.zoom;

      // AUTOMATIC CLUSTERING WEIGHT:
      // When zoom >= 0.85 -> 0.0 (fully unclustered / detailed individual facts)
      // When zoom <= 0.45 -> 1.0 (fully clustered / grouped into cohesive cluster bubbles)
      const clusterWeight = Math.max(0, Math.min(1, (0.85 - zoom) / 0.40));

      // 1. LAYER: 56px Spatial Grid (Gradual emergence)
      const gridReveal = Math.min(1, Math.max(0, (revealSec - 0.15) / 0.9));
      const gridSize = 56 * zoom;
      const startX = cx % gridSize;
      const startY = cy % gridSize;

      ctx.beginPath();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.022 * gridReveal})`;
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

      // 2. LAYER: ATMOSPHERIC RADIAL GRADIENT GLOW (Bounded GPU fill)
      const centerReveal = Math.min(1, Math.max(0, revealSec / 0.8));
      const centralMistRadius = Math.min(width, height) * 0.48 * zoom * (0.6 + 0.4 * centerReveal);
      const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, centralMistRadius);
      centerGlow.addColorStop(0, `rgba(255, 255, 255, ${0.05 * centerReveal})`);
      centerGlow.addColorStop(0.35, `rgba(157, 180, 255, ${0.025 * centerReveal})`);
      centerGlow.addColorStop(0.7, `rgba(10, 14, 28, ${0.01 * centerReveal})`);
      centerGlow.addColorStop(1, 'rgba(3, 4, 10, 0)');

      const gX = Math.max(0, cx - centralMistRadius);
      const gY = Math.max(0, cy - centralMistRadius);
      const gW = Math.min(width - gX, centralMistRadius * 2);
      const gH = Math.min(height - gY, centralMistRadius * 2);
      if (gW > 0 && gH > 0) {
        ctx.fillStyle = centerGlow;
        ctx.fillRect(gX, gY, gW, gH);
      }

      // Per-source atmospheric nebula blooms (Bounded GPU fill)
      sourceClusters.forEach((cluster, cIdx) => {
        const hx = cx + cluster.x * zoom;
        const hy = cy + cluster.y * zoom;
        const nebulaDelay = 0.5 + cIdx * 0.14;
        const nebulaReveal = Math.min(1, Math.max(0, (revealSec - nebulaDelay) / 0.8));
        if (nebulaReveal <= 0.001) return;

        const bloomRadius =
          (90 + Math.min(100, cluster.count * 8)) *
          zoom *
          (1 + clusterWeight * 0.25) *
          (0.5 + 0.5 * nebulaReveal);

        const bX = Math.max(0, hx - bloomRadius);
        const bY = Math.max(0, hy - bloomRadius);
        const bW = Math.min(width - bX, bloomRadius * 2);
        const bH = Math.min(height - bY, bloomRadius * 2);
        if (bW <= 0 || bH <= 0) return;

        const nebula = ctx.createRadialGradient(hx, hy, 0, hx, hy, bloomRadius);
        const baseAlpha = (0x28 + clusterWeight * 0x1a) * nebulaReveal;
        nebula.addColorStop(0, cluster.color + Math.round(baseAlpha).toString(16).padStart(2, '0'));
        nebula.addColorStop(0.5, cluster.color + '0a');
        nebula.addColorStop(1, 'transparent');

        ctx.fillStyle = nebula;
        ctx.fillRect(bX, bY, bW, bH);
      });

      // 2.5 LAYER: D3.JS KNOWLEDGE DENSITY HEAT-MAP OVERLAY (Visualizes high-density knowledge clusters)
      if (showHeatMapRef.current && factNodes.length >= 2) {
        try {
            const cache = heatMapCacheRef.current;
            const timeSinceCalc = now - cache.lastCalcTime;
            const needsRecalc =
              cache.contours.length === 0 ||
              cache.nodeCount !== factNodes.length ||
              Math.abs(zoom - cache.lastZoom) > 0.08 ||
              timeSinceCalc > 180;

            if (needsRecalc) {
              const densityGen = d3
                .contourDensity<GraphNode>()
                .x((d) => d.x)
                .y((d) => d.y)
                .size([width, height])
                .bandwidth(54 * Math.sqrt(zoom))
                .thresholds(9);

              const generated = densityGen(factNodes);
              cache.contours = generated;
              cache.maxVal = Math.max(...generated.map((c) => c.value), 0.0001);
              cache.lastCalcTime = now;
              cache.nodeCount = factNodes.length;
              cache.lastZoom = zoom;
            }

            const contours = cache.contours;
            const maxVal = cache.maxVal;
            if (contours.length > 0) {
              const colorScale = d3.scaleSequential(d3.interpolateInferno).domain([0, maxVal * 1.15]);
              const pathGen = d3.geoPath(null, ctx);

              for (const contour of contours) {
                const ratio = contour.value / maxVal;
                const c = d3.color(colorScale(contour.value));
                if (!c) continue;

                ctx.beginPath();
                pathGen(contour);

                // Thermal glowing fill
                c.opacity = 0.09 + 0.32 * Math.pow(ratio, 0.8);
                ctx.fillStyle = c.formatRgb();
                ctx.fill();

                // Luminous density isobar line
                c.opacity = 0.38 + 0.45 * ratio;
                ctx.strokeStyle = c.formatRgb();
                ctx.lineWidth = 0.9 + 0.9 * ratio;
                ctx.stroke();
              }
            }
          } catch {
            // fallback gracefully
          }
        }

      // 3. LAYER: AUTOMATIC CLUSTER BOUNDARIES & ENCLOSURES (Rendered when zoomed out)
      if (clusterWeight > 0.04) {
        sourceClusters.forEach((cluster) => {
          const clX = cx + cluster.x * zoom;
          const clY = cy + cluster.y * zoom;
          const isThisClusterHovered = hoveredCluster?.source === cluster.source;

          // Clustered boundary radius contracts as nodes pull together
          const clRadius = (cluster.clusterRadius * (1 - clusterWeight * 0.38) + 14) * zoom;

          // Glowing orbital cluster bubble fill
          const bubbleGrad = ctx.createRadialGradient(clX, clY, 0, clX, clY, clRadius);
          const baseAlphaHex = isThisClusterHovered ? '32' : Math.round(0x18 * clusterWeight).toString(16).padStart(2, '0');
          bubbleGrad.addColorStop(0, cluster.color + baseAlphaHex);
          bubbleGrad.addColorStop(0.7, cluster.color + '0a');
          bubbleGrad.addColorStop(1, 'transparent');

          ctx.beginPath();
          ctx.arc(clX, clY, clRadius, 0, Math.PI * 2);
          ctx.fillStyle = bubbleGrad;
          ctx.fill();

          // Luminous dashed boundary ring
          ctx.beginPath();
          ctx.arc(clX, clY, clRadius, 0, Math.PI * 2);
          ctx.strokeStyle = cluster.color;
          ctx.lineWidth = isThisClusterHovered ? 1.8 : 1.2;
          ctx.setLineDash([4, 6]);
          ctx.globalAlpha = isThisClusterHovered
            ? 0.9
            : Math.min(0.65, 0.15 + clusterWeight * 0.5);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;

          // Sleek Cluster Badge (Pill) when zoomed out
          if (clusterWeight > 0.25) {
            const pillAlpha = Math.min(1, (clusterWeight - 0.25) * 1.6);
            const pillY = clY - clRadius - 14;

            ctx.save();
            ctx.globalAlpha = pillAlpha;

            // Pill text
            const labelText = `${cluster.name.toUpperCase()} · ${cluster.count} FACTS`;
            ctx.font = `600 10.5px JetBrains Mono, monospace`;
            const textMetrics = ctx.measureText(labelText);
            const pillW = textMetrics.width + 24;
            const pillH = 22;
            const pillX = clX - pillW / 2;

            // Pill container
            ctx.fillStyle = isThisClusterHovered ? '#0b0f22' : '#070914';
            ctx.strokeStyle = isThisClusterHovered ? cluster.color : cluster.color + '66';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(pillX, pillY - pillH / 2, pillW, pillH, 8);
            ctx.fill();
            ctx.stroke();

            // Source indicator dot
            ctx.beginPath();
            ctx.arc(pillX + 11, pillY, 3, 0, Math.PI * 2);
            ctx.fillStyle = cluster.color;
            ctx.fill();

            // Text
            ctx.fillStyle = '#ffffff';
            ctx.fillText(labelText, pillX + 19, pillY + 3.5);

            // Sub-topic caption below the cluster hub when zoomed out
            if (cluster.topTopic && clusterWeight > 0.45) {
              ctx.font = `400 9px JetBrains Mono, monospace`;
              ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
              const topicMetrics = ctx.measureText(cluster.topTopic);
              ctx.fillText(cluster.topTopic, clX - topicMetrics.width / 2, clY + clRadius + 14);
            }

            ctx.restore();
          }
        });
      }

      // 4. LAYER: Node Positioning with Harmonic Oscillation & Dynamic Clustering Contraction
      const pX = pointerRef.current.x;
      const pY = pointerRef.current.y;
      const isPointerActive = pX < 9;
      const magnetStrength = 0.035;

      for (let i = 0; i < nodes.length; i++) {
        const nd = nodes[i];
        if (nd.isCenter) {
          nd.x = cx;
          nd.y = cy;
        } else {
          // Dynamic positional clustering:
          // Fact nodes smoothly contract toward their parent cluster hub as you zoom out!
          const relX = nd.unclusteredBaseX - nd.clusterHubX;
          const relY = nd.unclusteredBaseY - nd.clusterHubY;
          const contractFactor = nd.isSourceHub ? 1 : 1 - clusterWeight * 0.74;

          const contractedBaseX = nd.clusterHubX + relX * contractFactor;
          const contractedBaseY = nd.clusterHubY + relY * contractFactor;

          const oscX = nd.amp * Math.cos(now * nd.speed + nd.phase) * (1 - clusterWeight * 0.4);
          const oscY = nd.amp * Math.sin(now * nd.speed * 1.3 + nd.phase) * (1 - clusterWeight * 0.4);

          let magX = 0;
          let magY = 0;
          if (isPointerActive) {
            const nodeNormX = nd.baseX / (width * 0.5);
            const nodeNormY = nd.baseY / (height * 0.5);
            const distFromPointer = Math.hypot(nodeNormX - pX, nodeNormY - pY);
            if (distFromPointer < 1.2) {
              const pull = (1.2 - distFromPointer) * magnetStrength * 35;
              magX = pX * pull;
              magY = pY * pull;
            }
          }

          nd.x = cx + (contractedBaseX + oscX + magX) * zoom;
          nd.y = cy + (contractedBaseY + oscY + magY) * zoom;
        }
      }

      // Check search filter match
      const isSearchActive = Boolean(searchQuery.trim() || activeSourceFilter);

      // 6. LAYER: Synaptic Links (Single-pass grouped rendering, intra-cluster lines soften at low zoom)
      for (let tier = 0; tier < 3; tier++) {
        const tierLines = linesByTier[tier];
        if (!tierLines) continue;
        for (let l = 0; l < tierLines.length; l++) {
          const ln = tierLines[l];

          const na = nodes[ln.a];
          const nb = nodes[ln.b];
          if (!na || !nb) continue;

          const isFactLine = Boolean(nb.fact);
          let opacity = ln.baseOpacity;

          // Staggered reveal timing:
          // Tier 2 (center to source hubs) draws first: 0.3s to 1.1s
          // Tier 1 (sub-branches) draws second: 0.8s to 1.6s
          // Tier 0 (fact lines) bloom out in waves: 1.25s to 2.4s
          let lineDelay = 0.35;
          if (ln.tier === 2) {
            lineDelay = 0.3 + (ln.b % 6) * 0.12;
          } else if (ln.tier === 1) {
            lineDelay = 0.8 + (ln.b % 6) * 0.14;
          } else {
            lineDelay = 1.25 + (ln.b % 8) * 0.14;
          }
          const lineAppear = Math.max(0, Math.min(1, (revealSec - lineDelay) / 0.65));
          if (lineAppear <= 0.001) continue;
          const lineEase = 1 - Math.pow(1 - lineAppear, 3);
          opacity *= lineEase * tabSwitchEase;

          // When zoomed out, individual tiny fact lines gently fade to prevent clutter
          if (isFactLine) {
            opacity *= Math.max(0.18, 1 - clusterWeight * 0.65);
          }

          if (selectedFactId && nb.fact) {
            opacity = nb.fact.id === selectedFactId ? 0.9 : 0.04;
          } else if (isSearchActive && nb.fact) {
            const matches =
              (!activeSourceFilter || nb.fact.source === activeSourceFilter) &&
              (!lowerSearch || (nb.factContentLower ? nb.factContentLower.includes(lowerSearch) : false));
            opacity = matches ? 0.8 : 0.05;
          }

          // Spatial culling: skip lines completely offscreen
          if (
            (na.x < -40 && nb.x < -40) ||
            (na.x > width + 40 && nb.x > width + 40) ||
            (na.y < -40 && nb.y < -40) ||
            (na.y > height + 40 && nb.y > height + 40)
          ) {
            continue;
          }

          // Progressive extension from na to nb during appearance
          const targetX = na.x + (nb.x - na.x) * Math.min(1, lineEase * 1.05);
          const targetY = na.y + (nb.y - na.y) * Math.min(1, lineEase * 1.05);

          ctx.beginPath();
          ctx.moveTo(na.x, na.y);
          ctx.lineTo(targetX, targetY);

          if (ln.isCrossLink) {
            ctx.strokeStyle = ln.color;
            ctx.setLineDash([3, 5]);
            ctx.lineWidth = 0.8;
          } else {
            ctx.strokeStyle = ln.color;
            ctx.lineWidth = isFactLine ? 0.85 : 1.4;
          }

          ctx.globalAlpha = opacity;
          ctx.stroke();
          if (ln.isCrossLink) {
            ctx.setLineDash([]);
          }

          // Animated synapsing pulse particle along line (only active when not heavily clustered)
          if (opacity > 0.15 && !ln.isCrossLink && clusterWeight < 0.6) {
            const pulseT = (now * 0.00045 + (l % 7) * 0.14) % 1;
            const px = na.x + (nb.x - na.x) * pulseT;
            const py = na.y + (nb.y - na.y) * pulseT;

            ctx.beginPath();
            ctx.arc(px, py, 1.4 * Math.sqrt(zoom), 0, Math.PI * 2);
            ctx.fillStyle = ln.color;
            ctx.globalAlpha = Math.min(1, opacity * 1.5);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
      }

      // 7. LAYER: Nodes with Halos and Staggered Neural Awakening
      for (let i = 0; i < nodes.length; i++) {
        const nd = nodes[i];

        // Spatial culling: skip drawing nodes completely offscreen
        if (nd.x < -70 || nd.x > width + 70 || nd.y < -70 || nd.y > height + 70) {
          continue;
        }

        const isSelected = nd.fact && nd.fact.id === selectedFactId;
        const isHovered = nd.fact && hoveredFact?.id === nd.fact.id;

        // Progressive Awakening Stagger:
        // Center hub ignites first (0.1s)
        // Source hubs ignite in rotation (0.55s - 1.2s)
        // Sub-branches (0.95s - 1.5s)
        // Fact nodes cascade in waves (1.35s - 2.5s)
        let nodeDelay = 0.1;
        if (nd.isCenter) {
          nodeDelay = 0.1;
        } else if (nd.isSourceHub) {
          nodeDelay = 0.55 + (i % 6) * 0.14;
        } else if (nd.branchLevel === 2) {
          nodeDelay = 0.95 + (i % 5) * 0.14;
        } else {
          const factSeed = nd.fact ? ((nd.fact.id * 19) % 9) : (i % 9);
          nodeDelay = 1.35 + factSeed * 0.14;
        }

        const nodeAppear = Math.max(0, Math.min(1, (revealSec - nodeDelay) / 0.65));
        if (nodeAppear <= 0.001) continue;
        const nodeEase = 1 - Math.pow(1 - nodeAppear, 3);

        let alpha = 0.85;
        if (nd.fact) {
          if (selectedFactId) {
            alpha = isSelected ? 1 : 0.14;
          } else if (isSearchActive) {
            const matches =
              (!activeSourceFilter || nd.fact.source === activeSourceFilter) &&
              (!lowerSearch || (nd.factContentLower ? nd.factContentLower.includes(lowerSearch) : false));
            alpha = matches ? (isHovered ? 1 : 0.92) : 0.14;
          } else {
            alpha = 0.58 + 0.32 * Math.sin(now * nd.twspeed + nd.phase2);
          }
        }
        alpha *= nodeEase * tabSwitchEase;

        // Adaptive node radius (coalesces smoothly into cluster when zoomed out, blooms upon awakening)
        const nodeClusteredScale = nd.fact ? 1 - clusterWeight * 0.25 : 1;
        const radius =
          nd.r *
          Math.sqrt(zoom) *
          nodeClusteredScale *
          (0.25 + 0.75 * nodeEase) *
          (0.85 + 0.15 * tabSwitchEase) *
          (isSelected || isHovered ? 1.45 : 1);

        // Nodal Halo Aura
        if (isSelected || isHovered || nd.isCenter || nd.isSourceHub) {
          ctx.beginPath();
          ctx.arc(nd.x, nd.y, radius + (nd.isCenter ? 12 : 7), 0, Math.PI * 2);
          ctx.fillStyle = nd.color;
          ctx.globalAlpha = nd.isCenter ? 0.12 : isSelected || isHovered ? 0.35 : 0.18;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(nd.x, nd.y, radius + (nd.isCenter ? 6 : 3), 0, Math.PI * 2);
          ctx.strokeStyle = nd.dotColor;
          ctx.lineWidth = nd.isCenter ? 1.6 : 1.2;
          ctx.globalAlpha = isSelected || isHovered ? 0.9 : 0.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (nd.fact && (nd.fact.isUnifiedContextNode || (nd.fact.isDocumentRoot && nd.fact.fileName))) {
          // Unified Coherent Context Node Subtle Harmonic Resonance
          ctx.beginPath();
          ctx.arc(nd.x, nd.y, radius + 3.2, 0, Math.PI * 2);
          ctx.strokeStyle = nd.color;
          ctx.lineWidth = 0.9;
          ctx.globalAlpha = 0.26 + 0.14 * Math.sin(now * 0.002 + nd.phase);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Solid Node Core
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, Math.max(1.8, radius), 0, Math.PI * 2);
        ctx.fillStyle = nd.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;



        // Monospace Typography Labels (Level of Detail: hide small fact labels when clustered or not yet awakened)
        const labelDelay = nd.isCenter ? 0.45 : nd.isSourceHub ? 1.1 : 1.95;
        const labelAppear = Math.max(0, Math.min(1, (revealSec - labelDelay) / 0.5));
        const showLabel =
          labelAppear > 0.05 &&
          (nd.isCenter ||
          (nd.isSourceHub && clusterWeight < 0.6) ||
          ((isSelected || isHovered) && clusterWeight < 0.85));

        if (showLabel) {
          const fontSize = nd.isCenter ? 12.5 : nd.isSourceHub ? 11 : 10;
          ctx.font = `${nd.isCenter ? '600' : '500'} ${fontSize}px JetBrains Mono, monospace`;
          ctx.fillStyle = nd.isCenter ? '#ffffff' : isSelected || isHovered ? '#ffffff' : nd.color;
          ctx.globalAlpha = Math.max(0.65, alpha) * labelAppear;
          ctx.fillText(nd.label, nd.x + radius + 7, nd.y + 3.5);

          if (nd.subtext && (nd.isCenter || nd.isSourceHub) && clusterWeight < 0.4) {
            ctx.font = `400 9.5px JetBrains Mono, monospace`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.fillText(nd.subtext, nd.x + radius + 7, nd.y + fontSize + 4);
          }
          ctx.globalAlpha = 1;
        }
      }

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [nodes, lines, sourceClusters]);

  // Pointer Drag, Hit Testing & Cluster Zoom
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

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoom = panRef.current.zoom;
    const cx = rect.width / 2 + panRef.current.x;
    const cy = rect.height / 2 + panRef.current.y;
    const clusterWeight = Math.max(0, Math.min(1, (0.85 - zoom) / 0.40));

    // When zoomed out: hit test cluster bubbles first
    if (clusterWeight > 0.35) {
      let hitCluster: ClusterMeta | null = null;
      for (const cluster of sourceClusters) {
        const clX = cx + cluster.x * zoom;
        const clY = cy + cluster.y * zoom;
        const clRadius = (cluster.clusterRadius * (1 - clusterWeight * 0.38) + 16) * zoom;
        if (Math.hypot(mouseX - clX, mouseY - clY) <= clRadius) {
          hitCluster = cluster;
          break;
        }
      }

      if (hoveredClusterRef.current?.source !== hitCluster?.source) {
        setHoveredCluster(hitCluster);
      }

      if (hitCluster) {
        if (hoveredFactRef.current) setHoveredFact(null);
        setTooltipPos({ x: e.clientX, y: e.clientY });
        return;
      }
    } else if (hoveredClusterRef.current) {
      setHoveredCluster(null);
    }

    // Hit test individual fact nodes with fast bounding-box pre-filtering
    let hitFact: Fact | null = null;
    for (const nd of nodes) {
      if (!nd.fact) continue;
      const threshold = Math.max(12, nd.r * 2.8);
      if (Math.abs(mouseX - nd.x) > threshold || Math.abs(mouseY - nd.y) > threshold) {
        continue;
      }
      const dist = Math.hypot(mouseX - nd.x, mouseY - nd.y);
      if (dist <= threshold) {
        hitFact = nd.fact;
        break;
      }
    }

    // Only update React state if hovered target actually changed to prevent render storms
    if (hoveredFactRef.current?.id !== hitFact?.id) {
      setHoveredFact(hitFact);
    }

    if (hitFact) {
      setTooltipPos({ x: e.clientX, y: e.clientY });
    } else if (!hoveredClusterRef.current && tooltipPos !== null) {
      setTooltipPos(null);
    }
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
    if (!didDragRef.current) {
      const zoom = panRef.current.zoom;
      const clusterWeight = Math.max(0, Math.min(1, (0.85 - zoom) / 0.40));

      // If user clicked on a cluster bubble when zoomed out -> smoothly zoom into that cluster!
      if (clusterWeight > 0.35 && hoveredCluster) {
        animatePanZoom(-hoveredCluster.x * 1.15, -hoveredCluster.y * 1.15, 1.15);
        return;
      }

      if (hoveredFact) {
        onSelectFact(hoveredFact);
      } else {
        onSelectFact(null);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    panRef.current.zoom = Math.max(0.4, Math.min(3.0, panRef.current.zoom * zoomFactor));
    setCurrentZoomDisplay(Math.round(panRef.current.zoom * 100));
  };

  const resetView = () => {
    animatePanZoom(0, 0, 1.0);
  };

  const toggleClusterOverview = () => {
    // If currently zoomed in, zoom out to overview cluster level
    if (panRef.current.zoom >= 0.75) {
      animatePanZoom(0, 0, 0.52);
    } else {
      // Zoom in to detailed level
      animatePanZoom(0, 0, 1.1);
    }
  };

  const isCurrentlyClustered = currentZoomDisplay < 80;

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

      {/* Floating View Controls with Zoom LOD & Cluster Mode Indicator */}
      <div className="pointer-events-auto absolute bottom-5 left-5 flex items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-md">
        <button
          onClick={() => {
            const newZoom = Math.min(3.0, panRef.current.zoom * 1.2);
            panRef.current.zoom = newZoom;
            setCurrentZoomDisplay(Math.round(newZoom * 100));
          }}
          className="mono text-xs text-white/70 transition hover:text-white"
          title="Zoom In"
        >
          +
        </button>
        <div className="h-3 w-px bg-white/20" />
        <button
          onClick={() => {
            const newZoom = Math.max(0.4, panRef.current.zoom * 0.8);
            panRef.current.zoom = newZoom;
            setCurrentZoomDisplay(Math.round(newZoom * 100));
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

        <div className="h-3 w-px bg-white/20" />

        {/* Quick Automatic Cluster / Detail View Switcher */}
        <button
          onClick={toggleClusterOverview}
          className={`mono flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[10px] transition ${
            isCurrentlyClustered
              ? 'border border-indigo-400/40 bg-indigo-500/20 text-indigo-200'
              : 'text-white/40 hover:text-white'
          }`}
          title="Click to toggle between clustered overview and detailed inspection"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isCurrentlyClustered ? 'bg-indigo-400' : 'bg-white/40'
            }`}
          />
          <span>{isCurrentlyClustered ? `Clustered (${currentZoomDisplay}%)` : `Detail (${currentZoomDisplay}%)`}</span>
        </button>

        <div className="h-3 w-px bg-white/20" />

        {/* D3 Knowledge Density Heat-Map Toggle */}
        <button
          onClick={() => setShowHeatMap((prev) => !prev)}
          className={`mono flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[10px] transition ${
            showHeatMap
              ? 'border border-amber-500/50 bg-amber-500/20 text-amber-200 shadow-md shadow-amber-500/20'
              : 'text-white/40 hover:text-white'
          }`}
          title="Toggle D3.js Knowledge Density Heat-Map Overlay"
        >
          <span className="text-[11px]">{showHeatMap ? '🔥' : '♨'}</span>
          <span>{showHeatMap ? 'Heat Map: ON' : 'Heat Map'}</span>
        </button>

      </div>

      {/* Floating Thermal Density Legend when Heat-Map is active */}
      {showHeatMap && (
        <div className="pointer-events-none absolute bottom-5 right-24 hidden sm:flex items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-md text-[10px] font-mono text-white/70">
          <span>Density:</span>
          <span className="text-white/40">Low</span>
          <div className="h-2 w-16 rounded-full bg-gradient-to-r from-[#000004] via-[#bb3754] to-[#fcffa4]" />
          <span className="text-amber-300">High</span>
        </div>
      )}

      {/* Cluster Hover Tooltip (When zoomed out) */}
      {hoveredCluster && tooltipPos && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-xl border border-white/20 bg-[#070913]/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-xl transition-all duration-75"
          style={{
            left: `${tooltipPos.x + 16}px`,
            top: `${tooltipPos.y + 16}px`,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: hoveredCluster.color }}
            />
            <span className="mono text-xs font-semibold uppercase tracking-wider text-white">
              {hoveredCluster.name} Cluster
            </span>
            <span className="text-white/30">·</span>
            <span className="mono text-[10px] text-white/50">{hoveredCluster.count} facts</span>
          </div>
          <p className="mt-1 text-xs text-white/90 leading-relaxed">
            {hoveredCluster.topTopic}
          </p>
          <p className="mono mt-1 text-[10px] text-indigo-300/80">
            Click cluster bubble to expand and inspect
          </p>
        </div>
      )}

      {/* Individual Fact Hover Tooltip (When inspecting) */}
      {hoveredFact && tooltipPos && !hoveredCluster && (() => {
        const fileType = hoveredFact.fileType || getFactFileType(hoveredFact);
        const fMeta = FILE_TYPE_CONFIG[fileType];
        return (
          <div
            className="pointer-events-none fixed z-50 max-w-sm rounded-xl border border-white/20 bg-[#070913]/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-xl transition-all duration-75"
            style={{
              left: `${tooltipPos.x + 16}px`,
              top: `${tooltipPos.y + 16}px`,
            }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: SOURCE_PALETTE[hoveredFact.source]?.color }}
              />
              <span className="mono text-xs font-semibold uppercase tracking-wider text-white">
                {SOURCE_PALETTE[hoveredFact.source]?.name || hoveredFact.source}
              </span>
              <span className="text-white/30">·</span>
              <span className="mono text-[10px] text-white/50">#{hoveredFact.id}</span>
              <span
                className="mono flex items-center gap-1 rounded px-1.5 py-0.2 text-[9.5px] font-semibold"
                style={{
                  color: fMeta.color,
                  backgroundColor: fMeta.color + '22',
                  border: `1px solid ${fMeta.color}44`,
                }}
              >
                <span>{fMeta.iconSymbol}</span>
                <span>{fMeta.badge}</span>
              </span>
            </div>
            {hoveredFact.fileName && (
              <div className="mt-1 flex items-center justify-between gap-1 mono text-[10px] text-white/70 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">
                <span className="truncate">📄 {hoveredFact.fileName}</span>
                {hoveredFact.isUnifiedContextNode && (
                  <span className="text-amber-300 bg-amber-500/20 px-1 py-0.2 rounded font-semibold text-[9px] shrink-0">
                    Unified Context
                  </span>
                )}
              </div>
            )}
            {hoveredFact.isUnifiedContextNode && !hoveredFact.fileName && (
              <div className="mt-1 flex items-center gap-1 mono text-[9.5px] text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30">
                <span>🌳</span>
                <span>Unified Coherent Context Node</span>
                {hoveredFact.semanticSectionCount ? (
                  <span className="text-white/50">· {hoveredFact.semanticSectionCount} sections</span>
                ) : null}
              </div>
            )}
            <p className="mt-1 line-clamp-2 text-xs text-white/90 leading-relaxed">
              {hoveredFact.content}
            </p>
            <p className="mono mt-1 text-[10px] text-white/40">
              Click node to inspect, tag, or correct
            </p>
          </div>
        );
      })()}
    </div>
  );
};
