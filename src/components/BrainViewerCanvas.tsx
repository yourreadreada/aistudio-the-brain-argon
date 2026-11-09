import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import {
  Fact,
  AISource,
  FactFileType,
  GraphRelationshipType,
  SOURCE_PALETTE,
  FILE_TYPE_CONFIG,
  getFactFileType,
} from '../types/brain';
import { brainStore } from '../services/brainStorage';

export type GraphLayoutMode = 'radial' | 'force' | 'timeline';

interface BrainViewerCanvasProps {
  brainName: string;
  facts: Fact[];
  selectedFactId: number | null;
  selectedSource?: AISource | null;
  onSelectFact: (fact: Fact | null) => void;
  onSelectSource?: (source: AISource | null) => void;
  searchQuery: string;
  activeSourceFilter: string | null;
  isInspectorOpen?: boolean;
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
  branchLevel: number;
}

interface GraphLine {
  a: number;
  b: number;
  color: string;
  baseOpacity: number;
  tier: number; // 0, 1, 2 for multi-layer lighting
  isCrossLink?: boolean;
  relationshipType: GraphRelationshipType;
  explanation: string;
  score: number;
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
  selectedSource = null,
  onSelectFact,
  onSelectSource,
  searchQuery,
  activeSourceFilter,
  isInspectorOpen = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredFact, setHoveredFact] = useState<Fact | null>(null);
  const [hoveredSourceHub, setHoveredSourceHub] = useState<AISource | null>(null);
  const [hoveredCluster, setHoveredCluster] = useState<ClusterMeta | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [currentZoomDisplay, setCurrentZoomDisplay] = useState(100);
  const [layoutMode, setLayoutMode] = useState<GraphLayoutMode>('radial');
  const [relationshipFilter, setRelationshipFilter] = useState<'all' | GraphRelationshipType>('all');

  // Timeline Drawer & Controls State
  const [showTimelineLedger, setShowTimelineLedger] = useState(true);
  const [timelineDateRange, setTimelineDateRange] = useState<'all' | '24h' | '7d' | '30d'>('all');
  const [timelineSourceFilter, setTimelineSourceFilter] = useState<AISource | 'all'>('all');
  const [timelineSortDir, setTimelineSortDir] = useState<'desc' | 'asc'>('desc');

  // Performance Optimization Refs
  const selectedFactIdRef = useRef(selectedFactId);
  selectedFactIdRef.current = selectedFactId;

  const selectedSourceRef = useRef(selectedSource);
  selectedSourceRef.current = selectedSource;

  const hoveredFactRef = useRef(hoveredFact);
  hoveredFactRef.current = hoveredFact;

  const hoveredSourceHubRef = useRef(hoveredSourceHub);
  hoveredSourceHubRef.current = hoveredSourceHub;

  const hoveredClusterRef = useRef(hoveredCluster);
  hoveredClusterRef.current = hoveredCluster;

  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  const activeSourceFilterRef = useRef(activeSourceFilter);
  activeSourceFilterRef.current = activeSourceFilter;

  const relationshipFilterRef = useRef(relationshipFilter);
  relationshipFilterRef.current = relationshipFilter;

  const [showHeatMap, setShowHeatMap] = useState(false);
  const showHeatMapRef = useRef(showHeatMap);
  showHeatMapRef.current = showHeatMap;

  // Real Workspace Summary Stats
  const workspaceStats = useMemo(() => {
    const activeSourcesCount = new Set(facts.map((f) => f.source)).size;
    const totalPaletteSources = Object.keys(SOURCE_PALETTE).length;
    let latestMs = 0;
    for (const f of facts) {
      const t = new Date(f.updated_at).getTime();
      if (!Number.isNaN(t) && t > latestMs) {
        latestMs = t;
      }
    }
    let lastSyncLabel = '—';
    if (latestMs > 0) {
      const diffSec = Math.max(0, Math.floor((Date.now() - latestMs) / 1000));
      if (diffSec < 60) lastSyncLabel = 'Just now';
      else if (diffSec < 3600) lastSyncLabel = `${Math.floor(diffSec / 60)}m ago`;
      else if (diffSec < 86400) lastSyncLabel = `${Math.floor(diffSec / 3600)}h ago`;
      else if (diffSec < 86400 * 7) lastSyncLabel = `${Math.floor(diffSec / 86400)}d ago`;
      else {
        lastSyncLabel = new Date(latestMs).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        });
      }
    }
    return {
      memoriesCount: facts.length,
      activeSourcesCount,
      totalPaletteSources,
      lastSyncLabel,
    };
  }, [facts]);

  // Unified Relationship Model shared identically across Radial, Force, and Timeline
  const workspaceRelationships = useMemo(
    () => brainStore.computeWorkspaceRelationships(facts),
    [facts]
  );

  const relationshipCounts = useMemo(() => {
    let sourceEdges = 0;
    let semanticEdges = 0;
    let explicitEdges = 0;
    for (const e of workspaceRelationships) {
      if (e.type === 'source') sourceEdges++;
      else if (e.type === 'semantic') semanticEdges++;
      else if (e.type === 'explicit') explicitEdges++;
    }
    return {
      all: workspaceRelationships.length,
      source: sourceEdges,
      semantic: semanticEdges,
      explicit: explicitEdges,
    };
  }, [workspaceRelationships]);

  // Pan & Zoom
  const panRef = useRef({ x: 0, y: 0, zoom: 1 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const didDragRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 99, y: 99 });

  const initialRevealDoneRef = useRef(false);
  const revealStartRef = useRef<number | null>(null);
  const lastBrainNameRef = useRef<string>(brainName);
  const brainSwitchTimeRef = useRef<number>(0);

  useEffect(() => {
    if (lastBrainNameRef.current !== brainName) {
      lastBrainNameRef.current = brainName;
      brainSwitchTimeRef.current = performance.now();
    }
  }, [searchQuery, activeSourceFilter, brainName]);

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

  // ADAPTIVE GRAPH GENERATOR WITH CONSISTENT RELATIONSHIPS BETWEEN RADIAL & FORCE
  const { nodes, lines, linesByTier, sourceClusters, factNodes, edgesByFactId } = useMemo(() => {
    const nodeList: GraphNode[] = [];
    const lineList: GraphLine[] = [];

    const totalFacts = facts.length;
    const isSparse = totalFacts <= 12;
    const isDense = totalFacts > 45;
    const isLarge = totalFacts > 120;

    // Distinct sources present in current facts (stable canonical ordering)
    const canonicalOrder: AISource[] = [
      'claude',
      'gpt',
      'gemini',
      'github',
      'cursor',
      'local-ai',
      'moodle',
    ];
    const activeSources = canonicalOrder.filter((s) => facts.some((f) => f.source === s));
    const sourcesToDisplay = activeSources.length
      ? activeSources
      : (['claude', 'gpt', 'gemini', 'github'] as AISource[]);

    const baseOrbitRadius = isSparse ? 150 : isLarge ? 235 : isDense ? 210 : 180;
    const factBaseRadius = isSparse ? 4.8 : isLarge ? 2.6 : isDense ? 2.9 : 3.6;

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

    const hubIndexBySource: Record<string, number> = {};
    const clusterMetaList: ClusterMeta[] = [];

    const extractTopTopic = (sourceFacts: Fact[]): string => {
      if (!sourceFacts.length) return 'General Context';
      const topicCounts = new Map<string, number>();
      for (const f of sourceFacts) {
        if (f.topicKey) {
          topicCounts.set(f.topicKey, (topicCounts.get(f.topicKey) || 0) + 1);
        }
      }
      if (topicCounts.size > 0) {
        const top = Array.from(topicCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];
        return `Topic: ${top}`;
      }
      const text = sourceFacts.map((f) => f.content.toLowerCase()).join(' ');
      if (text.includes('translator') || text.includes('audio') || text.includes('pytorch')) {
        return 'ML & Audio Pipeline';
      }
      if (text.includes('redis') || text.includes('fastapi') || text.includes('postgres')) {
        return 'Backend & Infrastructure';
      }
      if (text.includes('typescript') || text.includes('tailwind')) {
        return 'TypeScript & UI Standards';
      }
      return `${sourceFacts.length} context items`;
    };

    // 2. Source Hubs arranged radially with balanced spacing
    sourcesToDisplay.forEach((src, i) => {
      const angle = (i / sourcesToDisplay.length) * Math.PI * 2 - Math.PI / 2;
      const sourceFacts = facts.filter((f) => f.source === src);
      const countForSource = sourceFacts.length;

      const weightDistBonus = isDense ? Math.min(28, Math.sqrt(countForSource) * 4.5) : 0;
      const hx = Math.cos(angle) * (baseOrbitRadius + weightDistBonus);
      const hy = Math.sin(angle) * (baseOrbitRadius + weightDistBonus);
      const hubIdx = nodeList.length;
      hubIndexBySource[src] = hubIdx;

      const palette = SOURCE_PALETTE[src] || {
        color: '#ffffff',
        dotColor: '#ffffff',
        name: src,
      };

      const estimatedClusterRadius = Math.max(
        52,
        Math.min(115, 38 + Math.sqrt(countForSource) * 14)
      );

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
        r: isSparse ? 7.5 : isDense ? 5.8 : 6.5,
        color: palette.color,
        dotColor: palette.dotColor,
        amp: 0.9,
        phase: i * 1.5,
        phase2: i * 0.8,
        speed: 0.00028,
        twspeed: 0.0009,
        label: palette.name,
        subtext: `${countForSource} ${countForSource === 1 ? 'fact' : 'facts'}`,
        branchLevel: 1,
      });

      lineList.push({
        a: centerIdx,
        b: hubIdx,
        color: palette.color,
        baseOpacity: 0.48,
        tier: 2,
        relationshipType: 'source',
        explanation: `${palette.name} Source Hub in ${brainName}`,
        score: 1,
      });
    });

    // 3. Fact Nodes arranged in balanced concentric golden-angle spirals around each Source Hub
    const factNodeIdxById = new Map<number, number>();
    const docRootIdxByFileName = new Map<string, number>();

    const sortedFacts = [...facts].sort((a, b) => {
      const aIsChild = Boolean(a.parentId);
      const bIsChild = Boolean(b.parentId);
      if (aIsChild !== bIsChild) return aIsChild ? 1 : -1;
      return a.id - b.id;
    });

    // Track per-source index for deterministic golden-angle spiral placement
    const perSourceCounter: Record<string, number> = {};

    sortedFacts.forEach((fact) => {
      const hubIdx = hubIndexBySource[fact.source];
      if (hubIdx === undefined) return;
      const hubNode = nodeList[hubIdx];
      const palette = SOURCE_PALETTE[fact.source] || {
        color: '#9db4ff',
        dotColor: '#9db4ff',
      };

      let parentIdx = hubIdx;
      let isChildNode = false;

      if (fact.parentId && factNodeIdxById.has(fact.parentId)) {
        parentIdx = factNodeIdxById.get(fact.parentId)!;
        isChildNode = true;
      } else if (fact.fileName && docRootIdxByFileName.has(fact.fileName)) {
        parentIdx = docRootIdxByFileName.get(fact.fileName)!;
        isChildNode = true;
      }

      const parentNode = nodeList[parentIdx];
      const isDocumentMaster = Boolean(
        fact.isDocumentRoot || fact.isUnifiedContextNode || (!isChildNode && fact.fileName)
      );

      const sIdx = perSourceCounter[fact.source] || 0;
      perSourceCounter[fact.source] = sIdx + 1;

      // Golden angle (137.508 deg) ensures even radial distribution with zero clumping even at 30+ nodes per source
      const goldenAngle = sIdx * 2.399963229728653;
      const ringRadius = isChildNode
        ? 18 + (sIdx % 3) * 8
        : isSparse
        ? 34 + Math.sqrt(sIdx + 1) * 14
        : 26 + Math.sqrt(sIdx + 1) * 12.5;

      const fx = parentNode.baseX + Math.cos(goldenAngle) * ringRadius;
      const fy = parentNode.baseY + Math.sin(goldenAngle) * ringRadius;
      const factNodeIdx = nodeList.length;
      const fileType = fact.fileType || getFactFileType(fact);

      factNodeIdxById.set(fact.id, factNodeIdx);
      if (fact.fileName && !docRootIdxByFileName.has(fact.fileName)) {
        docRootIdxByFileName.set(fact.fileName, factNodeIdx);
      }

      const cleanDocTitle =
        fact.documentTitle || (fact.fileName ? fact.fileName.replace(/\.[^/.]+$/, '') : '');
      const nodeLabel =
        isDocumentMaster && cleanDocTitle
          ? cleanDocTitle.length > 18
            ? cleanDocTitle.slice(0, 16) + '..'
            : cleanDocTitle
          : `#${fact.id}`;

      nodeList.push({
        id: `fact-${fact.id}`,
        fact,
        sourceKey: fact.source,
        fileType,
        fileName: fact.fileName,
        factContentLower: `${fact.content} ${fact.fileName || ''} ${fact.filePath || ''} ${
          fact.fixtureId || ''
        } ${(fact.tags || []).join(' ')}`.toLowerCase(),
        unclusteredBaseX: fx,
        unclusteredBaseY: fy,
        clusterHubX: hubNode.baseX,
        clusterHubY: hubNode.baseY,
        baseX: fx,
        baseY: fy,
        x: fx,
        y: fy,
        r: isDocumentMaster
          ? factBaseRadius * 1.38
          : isChildNode
          ? factBaseRadius * 0.85
          : factBaseRadius,
        color: palette.color,
        dotColor: palette.dotColor,
        amp: 0.75 + (fact.id % 3) * 0.35,
        phase: fact.id * 0.73,
        phase2: fact.id * 1.25,
        speed: 0.00022 + (fact.id % 4) * 0.00006,
        twspeed: 0.0007 + (fact.id % 3) * 0.0003,
        label: nodeLabel,
        subtext: fact.fileName || fact.source,
        branchLevel: isChildNode ? 4 : 3,
      });

      lineList.push({
        a: parentIdx,
        b: factNodeIdx,
        color: palette.color,
        baseOpacity: isChildNode ? 0.36 : 0.26,
        tier: 0,
        relationshipType: isChildNode ? 'explicit' : 'source',
        explanation: isChildNode
          ? `Document section child of Node #${parentNode.fact?.id || ''}`
          : `Primary Source: ${palette.name}`,
        score: 1,
      });
    });

    // 4. Add Semantic & Explicit Cross-Node Edges from Unified Relationship Model
    // Identical edges are added for both Radial and Force modes!
    const edgeListByFact = new Map<
      number,
      { otherFactId?: number; otherSource?: AISource; type: GraphRelationshipType; explanation: string; score: number }[]
    >();

    for (const rel of workspaceRelationships) {
      if (rel.type === 'source') continue; // Already represented by hub-to-fact stem lines

      if (rel.fromId.startsWith('fact-') && rel.toId.startsWith('fact-')) {
        const idA = Number(rel.fromId.replace('fact-', ''));
        const idB = Number(rel.toId.replace('fact-', ''));
        const idxA = factNodeIdxById.get(idA);
        const idxB = factNodeIdxById.get(idB);
        if (idxA !== undefined && idxB !== undefined) {
          lineList.push({
            a: idxA,
            b: idxB,
            color:
              rel.type === 'explicit'
                ? 'rgba(52, 211, 153, 0.65)'
                : 'rgba(157, 180, 255, 0.48)',
            baseOpacity: rel.type === 'explicit' ? 0.28 : 0.16,
            tier: 1,
            isCrossLink: true,
            relationshipType: rel.type,
            explanation: rel.explanation,
            score: rel.score,
          });

          const listA = edgeListByFact.get(idA) || [];
          listA.push({ otherFactId: idB, type: rel.type, explanation: rel.explanation, score: rel.score });
          edgeListByFact.set(idA, listA);

          const listB = edgeListByFact.get(idB) || [];
          listB.push({ otherFactId: idA, type: rel.type, explanation: rel.explanation, score: rel.score });
          edgeListByFact.set(idB, listB);
        }
      } else if (rel.fromId.startsWith('fact-') && rel.toId.startsWith('hub-')) {
        const idA = Number(rel.fromId.replace('fact-', ''));
        const targetSrc = rel.toId.replace('hub-', '') as AISource;
        const idxA = factNodeIdxById.get(idA);
        const hubB = hubIndexBySource[targetSrc];
        if (idxA !== undefined && hubB !== undefined) {
          lineList.push({
            a: idxA,
            b: hubB,
            color: 'rgba(52, 211, 153, 0.55)',
            baseOpacity: 0.2,
            tier: 1,
            isCrossLink: true,
            relationshipType: 'explicit',
            explanation: rel.explanation,
            score: rel.score,
          });
          const listA = edgeListByFact.get(idA) || [];
          listA.push({ otherSource: targetSrc, type: 'explicit', explanation: rel.explanation, score: rel.score });
          edgeListByFact.set(idA, listA);
        }
      }
    }

    // 5. Apply Layout Mode Transformations (Radial vs Force vs Timeline)
    // Both Radial and Force keep the exact same `lineList` relationships!
    if (layoutMode === 'force' && nodeList.length > 1) {
      // Deterministic Force-Directed Layout that settles cleanly in 36 iterations
      const iterations = 36;
      for (let iter = 0; iter < iterations; iter++) {
        const damping = 1 - iter / (iterations * 1.15);
        // Repulsion between nodes to prevent overlap
        for (let i = 1; i < nodeList.length; i++) {
          for (let j = i + 1; j < nodeList.length; j++) {
            const na = nodeList[i];
            const nb = nodeList[j];
            const dx = nb.unclusteredBaseX - na.unclusteredBaseX;
            const dy = nb.unclusteredBaseY - na.unclusteredBaseY;
            const distSq = Math.max(36, dx * dx + dy * dy);
            const minDist = na.isSourceHub || nb.isSourceHub ? 115 : isLarge ? 30 : 38;
            if (distSq < minDist * minDist) {
              const dist = Math.sqrt(distSq);
              const push = ((minDist - dist) / dist) * 0.24 * damping;
              if (!na.isCenter) {
                na.unclusteredBaseX -= dx * push;
                na.unclusteredBaseY -= dy * push;
              }
              if (!nb.isCenter) {
                nb.unclusteredBaseX += dx * push;
                nb.unclusteredBaseY += dy * push;
              }
            }
          }
        }
        // Spring attraction along all relationship edges (Source, Semantic, Explicit)
        for (const ln of lineList) {
          const na = nodeList[ln.a];
          const nb = nodeList[ln.b];
          if (!na || !nb) continue;
          const dx = nb.unclusteredBaseX - na.unclusteredBaseX;
          const dy = nb.unclusteredBaseY - na.unclusteredBaseY;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const targetDist =
            ln.relationshipType === 'explicit'
              ? 85
              : ln.relationshipType === 'semantic'
              ? 110
              : na.isCenter
              ? 175
              : 54;
          const pullStrength =
            ln.relationshipType === 'explicit'
              ? 0.12
              : ln.relationshipType === 'semantic'
              ? 0.08
              : 0.15;
          const pull = ((dist - targetDist) / dist) * pullStrength * damping;
          if (!na.isCenter && !na.isSourceHub) {
            na.unclusteredBaseX += dx * pull;
            na.unclusteredBaseY += dy * pull;
          }
          if (!nb.isCenter && !nb.isSourceHub) {
            nb.unclusteredBaseX -= dx * pull;
            nb.unclusteredBaseY -= dy * pull;
          }
        }
      }
      for (const nd of nodeList) {
        nd.baseX = nd.unclusteredBaseX;
        nd.baseY = nd.unclusteredBaseY;
        nd.x = nd.baseX;
        nd.y = nd.baseY;
        if (nd.isSourceHub && nd.sourceKey) {
          const cl = clusterMetaList.find((c) => c.source === nd.sourceKey);
          if (cl) {
            cl.x = nd.baseX;
            cl.y = nd.baseY;
          }
        }
      }
    } else if (layoutMode === 'timeline') {
      const chronFacts = [...facts].sort(
        (a, b) =>
          new Date(a.created_at || a.updated_at).getTime() -
          new Date(b.created_at || b.updated_at).getTime()
      );
      const rankById = new Map<number, number>();
      chronFacts.forEach((f, idx) => rankById.set(f.id, idx));

      const rowSpan = Math.min(360, Math.max(190, sourcesToDisplay.length * 58));
      const rowYBySource = new Map<AISource, number>();
      sourcesToDisplay.forEach((src, sIdx) => {
        const yPos =
          sourcesToDisplay.length === 1
            ? 0
            : -rowSpan / 2 + (sIdx / (sourcesToDisplay.length - 1)) * rowSpan;
        rowYBySource.set(src, yPos);
      });

      for (const nd of nodeList) {
        if (nd.isCenter) {
          nd.unclusteredBaseX = -290;
          nd.unclusteredBaseY = 0;
        } else if (nd.isSourceHub && nd.sourceKey) {
          const sy = rowYBySource.get(nd.sourceKey) ?? 0;
          nd.unclusteredBaseX = -185;
          nd.unclusteredBaseY = sy;
          nd.clusterHubX = -185;
          nd.clusterHubY = sy;
          const cl = clusterMetaList.find((c) => c.source === nd.sourceKey);
          if (cl) {
            cl.x = -185;
            cl.y = sy;
          }
        } else if (nd.fact) {
          const sy = rowYBySource.get(nd.fact.source) ?? 0;
          const rank = rankById.get(nd.fact.id) ?? 0;
          const tNorm = chronFacts.length <= 1 ? 0.5 : rank / (chronFacts.length - 1);
          const tx = -95 + tNorm * 380;
          const ty = sy + ((nd.fact.id % 5) - 2) * 8;
          nd.unclusteredBaseX = tx;
          nd.unclusteredBaseY = ty;
          nd.clusterHubX = -185;
          nd.clusterHubY = sy;
        }
        nd.baseX = nd.unclusteredBaseX;
        nd.baseY = nd.unclusteredBaseY;
        nd.x = nd.baseX;
        nd.y = nd.baseY;
      }
    }

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
      edgesByFactId: edgeListByFact,
    };
  }, [facts, brainName, layoutMode, workspaceRelationships]);

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

  // True Fit-to-View (Recenter) that computes the bounding box of visible nodes
  const fitAllVisibleNodes = () => {
    const canvas = canvasRef.current;
    const width = canvas ? canvas.clientWidth : window.innerWidth;
    const height = canvas ? canvas.clientHeight : window.innerHeight;

    const visibleNodes = nodes.filter((nd) => {
      if (activeSourceFilter && nd.fact && nd.fact.source !== activeSourceFilter) return false;
      if (activeSourceFilter && nd.isSourceHub && nd.sourceKey !== activeSourceFilter) return false;
      return true;
    });

    if (visibleNodes.length === 0) {
      animatePanZoom(0, 0, 1.0);
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const nd of visibleNodes) {
      const r = nd.r + 24;
      if (nd.baseX - r < minX) minX = nd.baseX - r;
      if (nd.baseX + r > maxX) maxX = nd.baseX + r;
      if (nd.baseY - r < minY) minY = nd.baseY - r;
      if (nd.baseY + r > maxY) maxY = nd.baseY + r;
    }

    const boxW = Math.max(160, maxX - minX);
    const boxH = Math.max(160, maxY - minY);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const rightReserved = isInspectorOpen ? 380 : layoutMode === 'timeline' && showTimelineLedger ? 360 : 0;
    const availW = Math.max(260, width - rightReserved - 80);
    const availH = Math.max(220, height - 140);

    const idealZoom = Math.max(0.48, Math.min(1.65, Math.min(availW / boxW, availH / boxH)));
    const shiftX = -rightReserved / 2;
    animatePanZoom(shiftX - midX * idealZoom, -midY * idealZoom, idealZoom, 420);
  };

  const focusWorkspaceRoot = () => {
    const rightReserved = isInspectorOpen ? 190 : 0;
    animatePanZoom(-rightReserved, 0, 1.05, 380);
  };

  const focusSelectedMemory = () => {
    if (!selectedFactId) return;
    const targetNode = nodes.find((n) => n.fact?.id === selectedFactId);
    if (!targetNode) return;
    const canvas = canvasRef.current;
    const width = canvas ? canvas.clientWidth : window.innerWidth;
    const panelWidth = isInspectorOpen ? Math.min(380, width * 0.85) : 0;
    const shiftX = -panelWidth / 2;
    const targetZoom = 1.55;
    animatePanZoom(
      shiftX - targetNode.baseX * targetZoom,
      -targetNode.baseY * targetZoom,
      targetZoom,
      420
    );
  };

  const wasFactSelectedRef = useRef(false);
  useEffect(() => {
    if (selectedFactId !== null) {
      const targetNode = nodes.find((n) => n.fact?.id === selectedFactId);
      if (!targetNode) return;

      const canvas = canvasRef.current;
      const width = canvas ? canvas.clientWidth : window.innerWidth;
      const panelWidth = Math.min(380, width * 0.85);
      const shiftX = -panelWidth / 2;
      const targetZoom = Math.max(1.15, Math.min(1.65, panRef.current.zoom < 0.9 ? 1.25 : panRef.current.zoom));

      animatePanZoom(
        shiftX - targetNode.baseX * targetZoom,
        -targetNode.baseY * targetZoom,
        targetZoom,
        480
      );
      wasFactSelectedRef.current = true;
    } else if (wasFactSelectedRef.current) {
      animatePanZoom(0, 0, 1.0, 440);
      wasFactSelectedRef.current = false;
    }
  }, [selectedFactId, nodes]);

  // Main Canvas Render Loop
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

      const selectedFactId = selectedFactIdRef.current;
      const hoveredFact = hoveredFactRef.current;
      const hoveredCluster = hoveredClusterRef.current;
      const searchQuery = searchQueryRef.current;
      const lowerSearch = searchQuery ? searchQuery.trim().toLowerCase() : '';
      const activeSourceFilter = activeSourceFilterRef.current;
      const relFilter = relationshipFilterRef.current;

      if (revealStartRef.current === null) {
        revealStartRef.current = now;
      }
      const rawRevealSec = (now - revealStartRef.current) / 1000;
      if (rawRevealSec >= 2.2) {
        initialRevealDoneRef.current = true;
      }

      let revealSec = rawRevealSec;
      let tabSwitchEase = 1;

      if (initialRevealDoneRef.current) {
        revealSec = 10.0;
        if (brainSwitchTimeRef.current > 0) {
          const switchElapsed = (now - brainSwitchTimeRef.current) / 1000;
          tabSwitchEase = Math.min(1, switchElapsed / 0.18);
        }
      }

      ctx.fillStyle = '#03040a';
      ctx.fillRect(0, 0, width, height);

      const pan = panRef.current;
      const cx = width / 2 + pan.x;
      const cy = height / 2 + pan.y;
      const zoom = pan.zoom;

      const clusterWeight = Math.max(0, Math.min(1, (0.82 - zoom) / 0.38));

      // 1. Spatial Grid
      const gridReveal = Math.min(1, Math.max(0, (revealSec - 0.1) / 0.8));
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

      // 2. Central Radial Glow
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

      // Per-source nebula blooms
      sourceClusters.forEach((cluster, cIdx) => {
        const hx = cx + cluster.x * zoom;
        const hy = cy + cluster.y * zoom;
        const nebulaDelay = 0.35 + cIdx * 0.1;
        const nebulaReveal = Math.min(1, Math.max(0, (revealSec - nebulaDelay) / 0.7));
        if (nebulaReveal <= 0.001) return;

        const bloomRadius =
          (90 + Math.min(100, cluster.count * 4)) *
          zoom *
          (1 + clusterWeight * 0.25) *
          (0.5 + 0.5 * nebulaReveal);

        const bX = Math.max(0, hx - bloomRadius);
        const bY = Math.max(0, hy - bloomRadius);
        const bW = Math.min(width - bX, bloomRadius * 2);
        const bH = Math.min(height - bY, bloomRadius * 2);
        if (bW <= 0 || bH <= 0) return;

        const nebula = ctx.createRadialGradient(hx, hy, 0, hx, hy, bloomRadius);
        const baseAlpha = (0x26 + clusterWeight * 0x18) * nebulaReveal;
        nebula.addColorStop(0, cluster.color + Math.round(baseAlpha).toString(16).padStart(2, '0'));
        nebula.addColorStop(0.5, cluster.color + '0a');
        nebula.addColorStop(1, 'transparent');

        ctx.fillStyle = nebula;
        ctx.fillRect(bX, bY, bW, bH);
      });

      // 2.5 Heat-Map Overlay
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

              c.opacity = 0.09 + 0.32 * Math.pow(ratio, 0.8);
              ctx.fillStyle = c.formatRgb();
              ctx.fill();

              c.opacity = 0.38 + 0.45 * ratio;
              ctx.strokeStyle = c.formatRgb();
              ctx.lineWidth = 0.9 + 0.9 * ratio;
              ctx.stroke();
            }
          }
        } catch {
          // ignore
        }
      }

      // 3. Automatic Cluster Enclosures (when zoomed out)
      if (clusterWeight > 0.04) {
        sourceClusters.forEach((cluster) => {
          const clX = cx + cluster.x * zoom;
          const clY = cy + cluster.y * zoom;
          const isThisClusterHovered = hoveredCluster?.source === cluster.source;
          const clRadius = (cluster.clusterRadius * (1 - clusterWeight * 0.38) + 14) * zoom;

          const bubbleGrad = ctx.createRadialGradient(clX, clY, 0, clX, clY, clRadius);
          const baseAlphaHex = isThisClusterHovered
            ? '32'
            : Math.round(0x18 * clusterWeight)
                .toString(16)
                .padStart(2, '0');
          bubbleGrad.addColorStop(0, cluster.color + baseAlphaHex);
          bubbleGrad.addColorStop(0.7, cluster.color + '0a');
          bubbleGrad.addColorStop(1, 'transparent');

          ctx.beginPath();
          ctx.arc(clX, clY, clRadius, 0, Math.PI * 2);
          ctx.fillStyle = bubbleGrad;
          ctx.fill();

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

          if (clusterWeight > 0.25) {
            const pillAlpha = Math.min(1, (clusterWeight - 0.25) * 1.6);
            const pillY = clY - clRadius - 14;

            ctx.save();
            ctx.globalAlpha = pillAlpha;

            const labelText = `${cluster.name.toUpperCase()} · ${cluster.count} FACTS`;
            ctx.font = `600 10.5px JetBrains Mono, monospace`;
            const textMetrics = ctx.measureText(labelText);
            const pillW = textMetrics.width + 24;
            const pillH = 22;
            const pillX = clX - pillW / 2;

            ctx.fillStyle = isThisClusterHovered ? '#0b0f22' : '#070914';
            ctx.strokeStyle = isThisClusterHovered ? cluster.color : cluster.color + '66';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(pillX, pillY - pillH / 2, pillW, pillH, 8);
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(pillX + 11, pillY, 3, 0, Math.PI * 2);
            ctx.fillStyle = cluster.color;
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.fillText(labelText, pillX + 19, pillY + 3.5);

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

      // 4. Node Positioning (Harmonic subtle motion without jitter in Force mode)
      const pX = pointerRef.current.x;
      const pY = pointerRef.current.y;
      const isPointerActive = pX < 9;
      const magnetStrength = 0.025;

      for (let i = 0; i < nodes.length; i++) {
        const nd = nodes[i];
        if (nd.isCenter) {
          nd.x = cx + nd.unclusteredBaseX * zoom;
          nd.y = cy + nd.unclusteredBaseY * zoom;
        } else {
          const relX = nd.unclusteredBaseX - nd.clusterHubX;
          const relY = nd.unclusteredBaseY - nd.clusterHubY;
          const contractFactor = nd.isSourceHub ? 1 : 1 - clusterWeight * 0.74;

          const contractedBaseX = nd.clusterHubX + relX * contractFactor;
          const contractedBaseY = nd.clusterHubY + relY * contractFactor;

          const oscScale = layoutMode === 'force' ? 0.35 : 0.75;
          const oscX =
            nd.amp * oscScale * Math.cos(now * nd.speed + nd.phase) * (1 - clusterWeight * 0.4);
          const oscY =
            nd.amp * oscScale * Math.sin(now * nd.speed * 1.3 + nd.phase) * (1 - clusterWeight * 0.4);

          let magX = 0;
          let magY = 0;
          if (isPointerActive) {
            const nodeNormX = nd.baseX / (width * 0.5);
            const nodeNormY = nd.baseY / (height * 0.5);
            const distFromPointer = Math.hypot(nodeNormX - pX, nodeNormY - pY);
            if (distFromPointer < 1.1) {
              const pull = (1.1 - distFromPointer) * magnetStrength * 30;
              magX = pX * pull;
              magY = pY * pull;
            }
          }

          nd.x = cx + (contractedBaseX + oscX + magX) * zoom;
          nd.y = cy + (contractedBaseY + oscY + magY) * zoom;
        }
      }

      const isSearchActive = Boolean(searchQuery.trim() || activeSourceFilter);
      const focusFactId = hoveredFact?.id || selectedFactId;

      // 6. Synaptic Links (Source, Semantic, Explicit)
      for (let tier = 0; tier < 3; tier++) {
        const tierLines = linesByTier[tier];
        if (!tierLines) continue;
        for (let l = 0; l < tierLines.length; l++) {
          const ln = tierLines[l];
          if (relFilter !== 'all' && ln.relationshipType !== relFilter) continue;

          const na = nodes[ln.a];
          const nb = nodes[ln.b];
          if (!na || !nb) continue;

          const isFactLine = Boolean(nb.fact || na.fact);
          let opacity = ln.baseOpacity;

          const lineDelay = ln.tier === 2 ? 0.05 : ln.tier === 1 ? 0.12 : 0.18;
          const lineAppear = Math.max(0, Math.min(1, (revealSec - lineDelay) / 0.35));
          if (lineAppear <= 0.001) continue;
          const lineEase = 1 - Math.pow(1 - lineAppear, 3);
          opacity *= lineEase * tabSwitchEase;

          if (isFactLine) {
            opacity *= Math.max(0.2, 1 - clusterWeight * 0.65);
          }

          const touchesFocusedFact =
            focusFactId !== null &&
            ((na.fact && na.fact.id === focusFactId) || (nb.fact && nb.fact.id === focusFactId));

          if (focusFactId) {
            opacity = touchesFocusedFact ? 0.92 : ln.tier === 2 ? 0.25 : 0.06;
          } else if (isSearchActive && (nb.fact || na.fact)) {
            const targetFact = nb.fact || na.fact;
            const targetContentLower = nb.factContentLower || na.factContentLower || '';
            const matches =
              (!activeSourceFilter || targetFact?.source === activeSourceFilter) &&
              (!lowerSearch || targetContentLower.includes(lowerSearch));
            opacity = matches ? 0.82 : 0.08;
          } else if (activeSourceFilter && nb.isSourceHub && nb.sourceKey) {
            opacity = nb.sourceKey === activeSourceFilter ? 0.85 : 0.22;
          }

          if (
            (na.x < -40 && nb.x < -40) ||
            (na.x > width + 40 && nb.x > width + 40) ||
            (na.y < -40 && nb.y < -40) ||
            (na.y > height + 40 && nb.y > height + 40)
          ) {
            continue;
          }

          ctx.beginPath();
          ctx.moveTo(na.x, na.y);
          ctx.lineTo(nb.x, nb.y);

          if (ln.relationshipType === 'explicit') {
            ctx.strokeStyle = touchesFocusedFact ? '#34d399' : ln.color;
            ctx.setLineDash([5, 3]);
            ctx.lineWidth = touchesFocusedFact ? 1.6 : 1.05;
          } else if (ln.relationshipType === 'semantic') {
            ctx.strokeStyle = touchesFocusedFact ? '#9db4ff' : ln.color;
            ctx.setLineDash([2, 4]);
            ctx.lineWidth = touchesFocusedFact ? 1.4 : 0.85;
          } else {
            ctx.strokeStyle = ln.color;
            ctx.lineWidth = isFactLine ? (touchesFocusedFact ? 1.4 : 0.85) : 1.4;
          }

          ctx.globalAlpha = opacity;
          ctx.stroke();
          if (ln.isCrossLink || ln.relationshipType !== 'source') {
            ctx.setLineDash([]);
          }

          if (opacity > 0.16 && !ln.isCrossLink && clusterWeight < 0.6) {
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

      // 7. Nodes
      for (let i = 0; i < nodes.length; i++) {
        const nd = nodes[i];
        if (nd.x < -70 || nd.x > width + 70 || nd.y < -70 || nd.y > height + 70) {
          continue;
        }

        const isSelected = nd.fact && nd.fact.id === selectedFactId;
        const isHovered = nd.fact && hoveredFact?.id === nd.fact.id;

        const nodeDelay = nd.isCenter ? 0.02 : nd.isSourceHub ? 0.08 : 0.16;
        const nodeAppear = Math.max(0, Math.min(1, (revealSec - nodeDelay) / 0.35));
        if (nodeAppear <= 0.001) continue;
        const nodeEase = 1 - Math.pow(1 - nodeAppear, 3);

        let alpha = 0.88;
        if (nd.fact) {
          if (selectedFactId) {
            const isNeighbor = edgesByFactId
              .get(selectedFactId)
              ?.some((e) => e.otherFactId === nd.fact?.id);
            alpha = isSelected ? 1 : isNeighbor ? 0.88 : 0.24;
          } else if (isSearchActive) {
            const matches =
              (!activeSourceFilter || nd.fact.source === activeSourceFilter) &&
              (!lowerSearch || (nd.factContentLower ? nd.factContentLower.includes(lowerSearch) : false));
            alpha = matches ? (isHovered ? 1 : 0.95) : 0.22;
          } else {
            alpha = 0.72 + 0.24 * Math.sin(now * nd.twspeed + nd.phase2);
          }
        } else if (nd.isSourceHub && activeSourceFilter) {
          alpha = nd.sourceKey === activeSourceFilter ? 1 : 0.45;
        }
        alpha *= nodeEase * tabSwitchEase;

        const nodeClusteredScale = nd.fact ? 1 - clusterWeight * 0.25 : 1;
        const radius =
          nd.r *
          Math.sqrt(zoom) *
          nodeClusteredScale *
          (0.25 + 0.75 * nodeEase) *
          (0.85 + 0.15 * tabSwitchEase) *
          (isSelected || isHovered ? 1.48 : 1);

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
        }

        ctx.beginPath();
        ctx.arc(nd.x, nd.y, Math.max(1.8, radius), 0, Math.PI * 2);
        ctx.fillStyle = nd.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;

        const showLabel =
          nd.isCenter ||
          (nd.isSourceHub && clusterWeight < 0.6) ||
          ((isSelected || isHovered) && clusterWeight < 0.85);

        if (showLabel) {
          const fontSize = nd.isCenter ? 12.5 : nd.isSourceHub ? 11 : 10;
          ctx.font = `${nd.isCenter ? '600' : '500'} ${fontSize}px JetBrains Mono, monospace`;
          ctx.fillStyle = nd.isCenter ? '#ffffff' : isSelected || isHovered ? '#ffffff' : nd.color;
          ctx.globalAlpha = Math.max(0.68, alpha);
          ctx.fillText(nd.label, nd.x + radius + 7, nd.y + 3.5);

          if (nd.subtext && (nd.isCenter || nd.isSourceHub) && clusterWeight < 0.4) {
            ctx.font = `400 9.5px JetBrains Mono, monospace`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.fillText(nd.subtext, nd.x + radius + 7, nd.y + fontSize + 4);
          }
          ctx.globalAlpha = 1;
        }
      }

      timerId = window.setTimeout(() => {
        animId = requestAnimationFrame(render);
      }, 16);
    }

    let timerId = 0;
    animId = requestAnimationFrame(render);

    return () => {
      window.clearTimeout(timerId);
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [nodes, lines, sourceClusters, layoutMode, edgesByFactId]);

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
    const clusterWeight = Math.max(0, Math.min(1, (0.82 - zoom) / 0.38));

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

    let hitFact: Fact | null = null;
    let hitSourceHub: AISource | null = null;
    for (const nd of nodes) {
      if (nd.isSourceHub && nd.sourceKey) {
        const hubThreshold = Math.max(16, nd.r * 3.0);
        if (
          Math.abs(mouseX - nd.x) <= hubThreshold &&
          Math.abs(mouseY - nd.y) <= hubThreshold &&
          Math.hypot(mouseX - nd.x, mouseY - nd.y) <= hubThreshold
        ) {
          hitSourceHub = nd.sourceKey;
          break;
        }
      }
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

    if (hoveredSourceHubRef.current !== hitSourceHub) {
      setHoveredSourceHub(hitSourceHub);
    }

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
      const clusterWeight = Math.max(0, Math.min(1, (0.82 - zoom) / 0.38));

      if (clusterWeight > 0.35 && hoveredCluster) {
        animatePanZoom(-hoveredCluster.x * 1.15, -hoveredCluster.y * 1.15, 1.15);
        if (onSelectSource) {
          onSelectSource(hoveredCluster.source);
        }
        return;
      }

      if (hoveredSourceHub && onSelectSource) {
        onSelectFact(null);
        onSelectSource(hoveredSourceHub);
        return;
      }

      if (hoveredFact) {
        onSelectFact(hoveredFact);
      } else {
        onSelectFact(null);
        if (onSelectSource) {
          onSelectSource(null);
        }
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    panRef.current.zoom = Math.max(0.4, Math.min(3.0, panRef.current.zoom * zoomFactor));
    setCurrentZoomDisplay(Math.round(panRef.current.zoom * 100));
  };

  const toggleClusterOverview = () => {
    if (panRef.current.zoom >= 0.75) {
      animatePanZoom(0, 0, 0.52);
    } else {
      animatePanZoom(0, 0, 1.1);
    }
  };

  const isCurrentlyClustered = currentZoomDisplay < 80;

  // Filtered and Grouped Chronological Timeline Events (Section 6)
  const timelineGroups = useMemo(() => {
    if (layoutMode !== 'timeline') return [];
    const nowMs = Date.now();
    const filtered = facts.filter((f) => {
      if (timelineSourceFilter !== 'all' && f.source !== timelineSourceFilter) return false;
      if (timelineDateRange !== 'all') {
        const ts = new Date(f.created_at || f.updated_at).getTime();
        if (Number.isNaN(ts)) return true;
        const ageHours = (nowMs - ts) / (1000 * 3600);
        if (timelineDateRange === '24h' && ageHours > 24) return false;
        if (timelineDateRange === '7d' && ageHours > 24 * 7) return false;
        if (timelineDateRange === '30d' && ageHours > 24 * 30) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const ta = new Date(a.created_at || a.updated_at).getTime();
      const tb = new Date(b.created_at || b.updated_at).getTime();
      return timelineSortDir === 'desc' ? tb - ta : ta - tb;
    });

    const groups: { dateLabel: string; items: Fact[] }[] = [];
    const map = new Map<string, Fact[]>();
    for (const f of filtered) {
      const d = new Date(f.created_at || f.updated_at);
      const key = Number.isNaN(d.getTime())
        ? 'Undated'
        : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      const arr = map.get(key) || [];
      arr.push(f);
      map.set(key, arr);
    }
    for (const [dateLabel, items] of map.entries()) {
      groups.push({ dateLabel, items });
    }
    return groups;
  }, [facts, layoutMode, timelineSourceFilter, timelineDateRange, timelineSortDir]);

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

      {/* Top-Left Compact Workspace Statistics + Relationship Edge Filter Pills */}
      <div className="pointer-events-auto absolute top-4 left-5 z-20 flex flex-wrap items-center gap-2">
        <div className="rounded-xl border border-white/10 bg-[#070913]/85 px-3.5 py-2 backdrop-blur-md">
          <div className="mono text-[9.5px] uppercase tracking-wider text-white/40">
            Memories
          </div>
          <div className="mono mt-0.5 text-sm font-semibold tabular-nums text-white">
            {workspaceStats.memoriesCount}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#070913]/85 px-3.5 py-2 backdrop-blur-md">
          <div className="mono text-[9.5px] uppercase tracking-wider text-white/40">
            Sources
          </div>
          <div className="mono mt-0.5 text-sm font-semibold tabular-nums text-white">
            {workspaceStats.activeSourcesCount}
            <span className="text-white/40">/{workspaceStats.totalPaletteSources}</span>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#070913]/85 px-3.5 py-2 backdrop-blur-md">
          <div className="mono text-[9.5px] uppercase tracking-wider text-white/40">
            Last Sync
          </div>
          <div className="mono mt-0.5 text-sm font-semibold tabular-nums text-white">
            {workspaceStats.lastSyncLabel}
          </div>
        </div>

        {/* Relationship Edge Type Filter Bar */}
        <div className="hidden md:flex items-center gap-1 rounded-xl border border-white/10 bg-[#070913]/85 p-1 backdrop-blur-md">
          {(
            [
              { id: 'all', label: 'All Edges', count: relationshipCounts.all },
              { id: 'source', label: 'Source', count: relationshipCounts.source },
              { id: 'semantic', label: 'Semantic', count: relationshipCounts.semantic },
              { id: 'explicit', label: 'Explicit', count: relationshipCounts.explicit },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRelationshipFilter(item.id)}
              className={`mono rounded-lg px-2 py-1 text-[10px] transition ${
                relationshipFilter === item.id
                  ? 'bg-white/15 font-semibold text-white'
                  : 'text-white/50 hover:text-white/85'
              }`}
              title={`Filter graph edges by ${item.label} (identical across Radial & Force layouts)`}
            >
              {item.label} <span className="text-white/40">{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Top-Right Graph Layout Switcher (Radial | Force | Timeline) */}
      <div
        role="group"
        aria-label="Graph layout mode"
        className={`pointer-events-auto absolute top-4 z-20 flex items-center gap-0.5 rounded-xl border border-white/12 bg-[#070913]/88 p-1 backdrop-blur-md transition-[right] duration-200 ${
          isInspectorOpen ? 'right-5 xl:right-[436px]' : 'right-5'
        }`}
      >
        {(['radial', 'force', 'timeline'] as GraphLayoutMode[]).map((mode) => {
          const active = layoutMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setLayoutMode(mode);
                brainSwitchTimeRef.current = performance.now();
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition ${
                active
                  ? 'bg-white/[0.14] text-white shadow-sm'
                  : 'text-white/55 hover:text-white'
              }`}
            >
              {mode}
            </button>
          );
        })}
        {layoutMode === 'timeline' && (
          <button
            type="button"
            onClick={() => setShowTimelineLedger((prev) => !prev)}
            className="ml-1 rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-2 py-1 text-[10px] font-medium text-indigo-200 hover:bg-indigo-500/25"
          >
            {showTimelineLedger ? 'Hide Chronology' : 'Show Chronology'}
          </button>
        )}
      </div>

      {/* Section 6: Chronological Timeline Overlay Drawer when layoutMode === 'timeline' */}
      {layoutMode === 'timeline' && showTimelineLedger && (
        <div
          className={`pointer-events-auto absolute top-16 bottom-16 z-20 w-[350px] flex flex-col rounded-2xl border border-white/12 bg-[#060812]/95 shadow-2xl backdrop-blur-xl transition-[right] duration-200 ${
            isInspectorOpen ? 'right-5 xl:right-[436px]' : 'right-5'
          }`}
        >
          <div className="border-b border-white/10 px-4 py-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
                  Chronological Timeline
                </h3>
                <p className="text-[10.5px] text-white/45">
                  Creation, Original Document, Import & Update timestamps
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTimelineSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                className="mono rounded-lg border border-white/12 bg-white/[0.04] px-2 py-1 text-[10px] text-white/75 hover:text-white"
              >
                {timelineSortDir === 'desc' ? 'Newest → Oldest' : 'Oldest → Newest'}
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={timelineSourceFilter}
                onChange={(e) => setTimelineSourceFilter(e.target.value as AISource | 'all')}
                className="mono flex-1 rounded-lg border border-white/12 bg-black/50 px-2 py-1 text-[10.5px] text-white outline-none"
              >
                <option value="all">All Sources</option>
                {(Object.keys(SOURCE_PALETTE) as AISource[]).map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_PALETTE[s].name}
                  </option>
                ))}
              </select>

              <div className="flex items-center rounded-lg border border-white/12 bg-black/40 p-0.5">
                {(['all', '24h', '7d', '30d'] as const).map((rng) => (
                  <button
                    key={rng}
                    type="button"
                    onClick={() => setTimelineDateRange(rng)}
                    className={`mono rounded px-1.5 py-0.5 text-[9.5px] uppercase ${
                      timelineDateRange === rng
                        ? 'bg-white/15 text-white font-semibold'
                        : 'text-white/45 hover:text-white'
                    }`}
                  >
                    {rng}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-4 scrollbar-thin">
            {timelineGroups.length === 0 ? (
              <div className="py-12 text-center text-xs text-white/45">
                No timeline events match the selected date or source filter.
              </div>
            ) : (
              timelineGroups.map((group) => (
                <div key={group.dateLabel} className="space-y-2">
                  <div className="sticky top-0 z-10 flex items-center justify-between rounded-md bg-[#0b0f1e]/95 px-2.5 py-1 border border-white/10">
                    <span className="mono text-[10px] font-semibold text-indigo-300">
                      {group.dateLabel}
                    </span>
                    <span className="mono text-[9.5px] text-white/45">
                      {group.items.length} {group.items.length === 1 ? 'event' : 'events'}
                    </span>
                  </div>

                  <div className="space-y-2 pl-2 border-l border-white/10">
                    {group.items.map((fact) => {
                      const sMeta = SOURCE_PALETTE[fact.source];
                      const isSelected = selectedFactId === fact.id;
                      const relatedEdges = edgesByFactId.get(fact.id) || [];
                      return (
                        <button
                          key={fact.id}
                          type="button"
                          onClick={() => onSelectFact(fact)}
                          className={`w-full text-left rounded-xl border p-2.5 transition ${
                            isSelected
                              ? 'border-indigo-400/50 bg-indigo-500/15'
                              : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className="mono text-[10px] font-semibold"
                              style={{ color: sMeta?.color || '#fff' }}
                            >
                              {sMeta?.name || fact.source}
                            </span>
                            <span className="mono text-[9.5px] text-white/40">#{fact.id}</span>
                          </div>
                          <div className="mt-1 text-[11px] font-medium text-white truncate">
                            {fact.documentTitle || fact.fileName || fact.content.slice(0, 65)}
                          </div>
                          <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 mono text-[9.5px] text-white/50">
                            <div>
                              Created:{' '}
                              <span className="text-white/75">
                                {fact.created_at ? new Date(fact.created_at).toLocaleDateString() : '—'}
                              </span>
                            </div>
                            <div>
                              Original Doc:{' '}
                              <span className="text-white/75">
                                {fact.originalCreatedAt
                                  ? new Date(fact.originalCreatedAt).toLocaleDateString()
                                  : 'Unknown'}
                              </span>
                            </div>
                            <div>
                              Imported:{' '}
                              <span className="text-white/75">
                                {fact.importedAt ? new Date(fact.importedAt).toLocaleDateString() : '—'}
                              </span>
                            </div>
                            <div>
                              Updated:{' '}
                              <span className="text-white/75">
                                {new Date(fact.updated_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          {relatedEdges.length > 0 && (
                            <div className="mt-1.5 mono text-[9px] text-emerald-300/85">
                              {relatedEdges.length} related graph{' '}
                              {relatedEdges.length === 1 ? 'connection' : 'connections'}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Bottom-Left Graph Legend */}
      <div className="pointer-events-none absolute bottom-5 left-5 hidden lg:flex items-center gap-3 rounded-xl border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-md mono text-[10.5px] text-white/55">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full border border-white/70" />
          <span>Source Line</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 border-t border-dashed border-[#9db4ff]" />
          <span>Semantic</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 border-t border-dashed border-emerald-400" />
          <span>Explicit</span>
        </span>
      </div>

      {/* Bottom-Center Floating View Controls (Section 7: Zoom, Fit-to-View Recenter, Focus Root, Focus Selected, Cluster, Heat-Map) */}
      <div className="pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3.5 py-1.5 backdrop-blur-md">
        <button
          type="button"
          onClick={() => {
            const newZoom = Math.max(0.4, panRef.current.zoom * 0.8);
            panRef.current.zoom = newZoom;
            setCurrentZoomDisplay(Math.round(newZoom * 100));
          }}
          className="mono text-xs text-white/70 transition hover:text-white px-1"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          −
        </button>
        <span className="mono text-[11px] tabular-nums text-white/80 min-w-[36px] text-center">
          {currentZoomDisplay}%
        </span>
        <button
          type="button"
          onClick={() => {
            const newZoom = Math.min(3.0, panRef.current.zoom * 1.2);
            panRef.current.zoom = newZoom;
            setCurrentZoomDisplay(Math.round(newZoom * 100));
          }}
          className="mono text-xs text-white/70 transition hover:text-white px-1"
          title="Zoom In"
          aria-label="Zoom In"
        >
          +
        </button>
        <div className="h-3 w-px bg-white/15" />
        <button
          type="button"
          onClick={fitAllVisibleNodes}
          className="mono text-[11px] text-white/70 transition hover:text-white"
          title="Fit all visible nodes into viewport"
        >
          Recenter
        </button>
        <button
          type="button"
          onClick={focusWorkspaceRoot}
          className="mono hidden sm:inline text-[10.5px] text-white/55 transition hover:text-white"
          title="Center on Workspace Root"
        >
          Root
        </button>
        {selectedFactId && (
          <button
            type="button"
            onClick={focusSelectedMemory}
            className="mono text-[10.5px] text-indigo-300 transition hover:text-white"
            title="Center and zoom on selected memory node"
          >
            Focus #{selectedFactId}
          </button>
        )}

        <div className="h-3 w-px bg-white/15" />

        <button
          type="button"
          onClick={toggleClusterOverview}
          className={`mono flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[10px] transition ${
            isCurrentlyClustered
              ? 'border border-indigo-400/40 bg-indigo-500/20 text-indigo-200'
              : 'text-white/50 hover:text-white'
          }`}
          title="Click to toggle between clustered overview and detailed inspection"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isCurrentlyClustered ? 'bg-indigo-400' : 'bg-white/40'
            }`}
          />
          <span>{isCurrentlyClustered ? 'Clustered' : 'Detail'}</span>
        </button>

        <div className="h-3 w-px bg-white/15" />

        <button
          type="button"
          onClick={() => setShowHeatMap((prev) => !prev)}
          className={`mono flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[10px] transition ${
            showHeatMap
              ? 'border border-amber-500/50 bg-amber-500/20 text-amber-200 shadow-md shadow-amber-500/20'
              : 'text-white/55 hover:text-white'
          }`}
          title="Toggle D3.js Knowledge Density Heat-Map Overlay"
        >
          <span>{showHeatMap ? 'Heat map: ON' : 'Heat map'}</span>
        </button>
      </div>

      {/* Cluster Hover Tooltip */}
      {hoveredCluster && tooltipPos && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-xl border border-white/20 bg-[#070913]/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-xl"
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
          <p className="mt-1 text-xs text-white/90 leading-relaxed">{hoveredCluster.topTopic}</p>
          <p className="mono mt-1 text-[10px] text-indigo-300/80">
            Click cluster bubble to expand and inspect
          </p>
        </div>
      )}

      {/* Individual Fact Hover Tooltip with Relationship Explanations */}
      {hoveredFact &&
        tooltipPos &&
        !hoveredCluster &&
        (() => {
          const fileType = hoveredFact.fileType || getFactFileType(hoveredFact);
          const fMeta = FILE_TYPE_CONFIG[fileType];
          const nodeEdges = edgesByFactId.get(hoveredFact.id) || [];
          return (
            <div
              className="pointer-events-none fixed z-50 max-w-sm rounded-xl border border-white/20 bg-[#070913]/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-xl"
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
                {hoveredFact.fixtureId && (
                  <span className="mono rounded bg-indigo-500/20 px-1.5 py-0.2 text-[9px] text-indigo-200 border border-indigo-400/30">
                    {hoveredFact.fixtureId}
                  </span>
                )}
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
                  <span className="truncate">📄 {hoveredFact.filePath || hoveredFact.fileName}</span>
                </div>
              )}
              <p className="mt-1 line-clamp-2 text-xs text-white/90 leading-relaxed">
                {hoveredFact.content}
              </p>
              {nodeEdges.length > 0 && (
                <div className="mt-1.5 border-t border-white/10 pt-1.5 space-y-0.5">
                  <div className="mono text-[9.5px] uppercase tracking-wider text-indigo-300">
                    Graph Relationships ({nodeEdges.length})
                  </div>
                  {nodeEdges.slice(0, 2).map((e, i) => (
                    <div key={i} className="mono text-[9.5px] text-white/65 truncate">
                      • [{e.type.toUpperCase()}] {e.explanation}
                    </div>
                  ))}
                </div>
              )}
              <p className="mono mt-1 text-[10px] text-white/40">
                Click node to inspect provenance, relationships & format viewer
              </p>
            </div>
          );
        })()}
    </div>
  );
};
