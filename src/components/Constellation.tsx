import React, { useEffect, useRef } from 'react';

export type ConstellationMood = 'idle' | 'typing' | 'entering';

interface ConstellationProps {
  mood?: ConstellationMood;
  interactive?: boolean;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function getDimensions(width: number, height: number) {
  const wide = width >= 1024;
  return {
    wide,
    radius: Math.min(width, height) * (wide ? 0.62 : 0.58),
    cx: wide ? 0.64 * width : width / 2,
    cy: height / 2,
  };
}

interface NodePoint {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  delay: number;
  r: number;
  glow: number;
  d: number;
  phase: number;
  rgb: [number, number, number];
}

interface LinkEdge {
  a: number;
  b: number;
  delay: number;
  rgb: [number, number, number];
}

// Multi-source vibrant AI color palette
const AI_PALETTE_RGB: [number, number, number][] = [
  [216, 90, 48],   // Claude terracotta
  [55, 138, 221],  // ChatGPT blue
  [29, 158, 117],  // Gemini teal/emerald
  [127, 119, 221], // GitHub violet
  [212, 83, 126],  // Moodle berry pink
  [61, 155, 184],  // Cursor cyan
  [184, 146, 61],  // Local AI amber gold
  [255, 122, 69],  // Anthropic warm orange
  [74, 157, 236],  // OpenAI electric cyan
  [40, 184, 139],  // Emerald light
];

function generateGraph(totalNodes: number) {
  let seed = 20942;
  const random = () => {
    seed = (1664525 * seed + 0x3c6ef35f) >>> 0;
    return seed / 0x100000000;
  };

  const nodes: NodePoint[] = [];
  const links: LinkEdge[] = [];

  // Root center node (White/Cyan core)
  nodes.push({
    x: 0,
    y: 0,
    fromX: 0,
    fromY: 0,
    delay: 0,
    r: 2.8,
    glow: 1,
    d: 0,
    phase: 0,
    rgb: [255, 255, 255],
  });

  const branchCount = Math.max(6, Math.min(10, Math.round(Math.log2(totalNodes))));
  const perBranch = Math.max(8, Math.floor((totalNodes - 1 - branchCount) / branchCount));

  for (let b = 0; b < branchCount; b++) {
    const angle = (b / branchCount) * Math.PI * 2 + (random() - 0.5) * 0.45;
    const dist = 0.24 + 0.14 * random();
    const nx = Math.cos(angle) * dist;
    const ny = Math.sin(angle) * dist;
    const branchRootIdx = nodes.length;

    // Pick distinct colorful AI palette for this branch
    const branchRgb = AI_PALETTE_RGB[b % AI_PALETTE_RGB.length];

    nodes.push({
      x: nx,
      y: ny,
      fromX: 2.4 * nx,
      fromY: 2.4 * ny,
      delay: 0.1 + 0.1 * random(),
      r: 2.0,
      glow: 0.95,
      d: dist,
      phase: 6.283 * random(),
      rgb: branchRgb,
    });

    links.push({ a: 0, b: branchRootIdx, delay: 0.26, rgb: branchRgb });

    const subCount = 3 + Math.floor(3 * random());
    const subIndices: number[] = [];

    for (let s = 0; s < subCount; s++) {
      const subAngle = angle + (s - (subCount - 1) / 2) * (0.42 + 0.2 * random());
      const subDist = dist + 0.02 + 0.44 * Math.pow(random(), 0.7);
      const sx = Math.cos(subAngle) * subDist;
      const sy = Math.sin(subAngle) * subDist;
      const subIdx = nodes.length;
      subIndices.push(subIdx);

      // Subtle hue shift along the sub-branch
      const subRgb: [number, number, number] = [
        Math.min(255, Math.max(0, branchRgb[0] + Math.round((random() - 0.5) * 30))),
        Math.min(255, Math.max(0, branchRgb[1] + Math.round((random() - 0.5) * 30))),
        Math.min(255, Math.max(0, branchRgb[2] + Math.round((random() - 0.5) * 30))),
      ];

      nodes.push({
        x: sx,
        y: sy,
        fromX: Math.cos(subAngle) * (subDist + 1.4 + random()),
        fromY: Math.sin(subAngle) * (subDist + 1.4 + random()),
        delay: 0.2 + 0.7 * subDist + 0.15 * random(),
        r: 1.35,
        glow: 0.75,
        d: subDist,
        phase: 6.283 * random(),
        rgb: subRgb,
      });

      links.push({ a: branchRootIdx, b: subIdx, delay: 0.34 + 0.6 * subDist, rgb: subRgb });
    }

    const extraCount = perBranch - subCount;
    for (let e = 0; e < extraCount; e++) {
      const parentIdx = subIndices[Math.floor(random() * subIndices.length)] || branchRootIdx;
      const parentNode = nodes[parentIdx];
      const offsetDist = 0.07 + 0.1 * random();
      const offsetAngle = 6.283 * random();
      const spread = Math.pow(random(), 0.55) * offsetDist;
      const stretch = 0.4 + 0.5 * random();
      const hx = parentNode.x * (1 + offsetDist * stretch * 0.6);
      const hy = parentNode.y * (1 + offsetDist * stretch * 0.6);
      const ux = hx + Math.cos(offsetAngle) * spread;
      const uy = hy + Math.sin(offsetAngle) * spread;
      const totalD = Math.hypot(ux, uy);
      const childIdx = nodes.length;

      const childRgb: [number, number, number] = [
        Math.min(255, Math.max(0, branchRgb[0] + Math.round((random() - 0.5) * 45))),
        Math.min(255, Math.max(0, branchRgb[1] + Math.round((random() - 0.5) * 45))),
        Math.min(255, Math.max(0, branchRgb[2] + Math.round((random() - 0.5) * 45))),
      ];

      nodes.push({
        x: ux,
        y: uy,
        fromX: ux * (1 + 1.6 / Math.max(totalD, 0.08)),
        fromY: uy * (1 + 1.6 / Math.max(totalD, 0.08)),
        delay: 0.24 + 0.8 * totalD + 0.2 * random(),
        r: 0.75 + 0.95 * random(),
        glow: 0.5 + 0.4 * random(),
        d: totalD,
        phase: 6.283 * random(),
        rgb: childRgb,
      });

      links.push({ a: parentIdx, b: childIdx, delay: 0.4 + 0.7 * totalD, rgb: childRgb });
      if (random() < 0.22) {
        const altIdx = subIndices[Math.floor(random() * subIndices.length)];
        links.push({ a: childIdx, b: altIdx, delay: 0.6 + 0.7 * totalD, rgb: childRgb });
      }
    }
  }

  // Outer constellation satellites (colorful stars)
  const outerCount = Math.max(24, Math.floor(0.15 * nodes.length));
  for (let o = 0; o < outerCount; o++) {
    const oAngle = 6.283 * random();
    const oDist = 0.02 + 0.3 * Math.pow(random(), 0.7);
    const ox = Math.cos(oAngle) * oDist;
    const oy = Math.sin(oAngle) * oDist;
    const outIdx = nodes.length;

    const satRgb = AI_PALETTE_RGB[Math.floor(random() * AI_PALETTE_RGB.length)];

    nodes.push({
      x: ox,
      y: oy,
      fromX: 6 * ox,
      fromY: 6 * oy,
      delay: 0.06 + 0.7 * oDist + 0.12 * random(),
      r: 0.85 + 1.1 * random(),
      glow: 0.75 + 0.25 * random(),
      d: oDist,
      phase: 6.283 * random(),
      rgb: satRgb,
    });

    let nearest = 0;
    let minDist = oDist;
    for (let k = 1; k <= branchCount; k++) {
      const nodeK = nodes[k];
      if (!nodeK) break;
      const d = Math.hypot(nodeK.x - ox, nodeK.y - oy);
      if (d < minDist) {
        minDist = d;
        nearest = k;
      }
    }
    if (minDist < 0.38) {
      links.push({ a: nearest, b: outIdx, delay: 0.7 + 0.8 * minDist, rgb: satRgb });
    }
  }

  return { nodes, links };
}

export const Constellation: React.FC<ConstellationProps> = ({
  mood = 'idle',
  interactive = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moodRef = useRef(mood);
  moodRef.current = mood;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let animId = 0;
    let width = 0;
    let height = 0;
    let mouseX = 99;
    let mouseY = 99;
    let startTime = performance.now();
    let enterStartTime: number | null = null;

    let graphData: { nodes: NodePoint[]; links: LinkEdge[] } = { nodes: [], links: [] };
    let posX = new Float32Array(0);
    let posY = new Float32Array(0);
    let alphaArray = new Float32Array(0);
    let radiusArray = new Float32Array(0);

    function initGraph(w: number, h: number) {
      const isLarge = w >= 1024;
      const totalNodes = isLarge ? 580 : 360;
      graphData = generateGraph(totalNodes);
      posX = new Float32Array(graphData.nodes.length);
      posY = new Float32Array(graphData.nodes.length);
      alphaArray = new Float32Array(graphData.nodes.length);
      radiusArray = new Float32Array(graphData.nodes.length);
    }

    function resize() {
      if (!canvas || !ctx) return;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (graphData.nodes.length === 0) {
        initGraph(width, height);
      }
    }

    resize();
    window.addEventListener('resize', resize);

    function handlePointerMove(e: PointerEvent) {
      if (!canvas || !interactive) return;
      const rect = canvas.getBoundingClientRect();
      const dims = getDimensions(rect.width, rect.height);
      mouseX = (e.clientX - rect.left - dims.cx) / dims.radius;
      mouseY = (e.clientY - rect.top - dims.cy) / dims.radius;
    }

    function handlePointerLeave() {
      mouseX = 99;
      mouseY = 99;
    }

    if (interactive) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerleave', handlePointerLeave);
    }

    function render(now: number) {
      if (!ctx) return;
      const elapsed = (now - startTime) / 1000;
      const currentMood = moodRef.current;

      if (currentMood === 'entering' && !enterStartTime) {
        enterStartTime = elapsed;
      }

      const enterProgress = enterStartTime ? Math.min(1, (elapsed - enterStartTime) / 1.1) : 0;
      const enterEase = enterProgress * enterProgress * (3 - 2 * enterProgress);
      const blurFactor = easeOutCubic(Math.max(0, (enterProgress - 0.3) / 0.7));

      // Deep void black base
      if (enterEase > 0) {
        const rVal = Math.round(3 + 12 * enterEase);
        const gVal = Math.round(4 + 14 * enterEase);
        const bVal = Math.round(10 + 26 * enterEase);
        ctx.fillStyle = `rgb(${rVal},${gVal},${bVal})`;
      } else {
        ctx.fillStyle = '#03040a';
      }
      ctx.fillRect(0, 0, width, height);

      const isDesktop = width >= 1024 ? 1 : 0.65;
      const dims = getDimensions(width, height);
      const centerX = dims.cx + (width / 2 - dims.cx) * enterEase;
      const centerY = dims.cy;
      const radius = dims.radius * (1 - 0.938 * enterEase);

      // Stop repeating sonar wave cycle ("this round white circle which keeps on going, stop this")
      const pulseWave = prefersReducedMotion || elapsed > 2.6 ? -9 : 0.62 * elapsed;

      const rot = prefersReducedMotion ? 0 : 0.018 * elapsed;
      const offsetX = mouseX < 9 ? 0.045 * mouseX : 0;
      const offsetY = mouseY < 9 ? 0.045 * mouseY : 0;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);

      const nodes = graphData.nodes;
      const links = graphData.links;

      // Compute node positions
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const appear = prefersReducedMotion
          ? 1
          : Math.max(0, Math.min(1, (elapsed - node.delay) / 1.1));
        const appearEase = easeOutCubic(appear);

        let curX = node.fromX + (node.x - node.fromX) * appearEase;
        let curY = node.fromY + (node.y - node.fromY) * appearEase;

        if (!prefersReducedMotion && appear >= 1) {
          const breath = 0.01 * Math.sin(0.55 * elapsed + node.phase);
          curX += curX * breath;
          curY += curY * breath;
        }

        const rotatedX = curX * cosR - curY * sinR + offsetX;
        const rotatedY = curX * sinR + curY * cosR + offsetY;

        posX[i] = centerX + rotatedX * radius;
        posY[i] = centerY + rotatedY * radius;

        // Sonar wave & mouse proximity
        const waveDist = Math.max(0, 1 - 5.5 * Math.abs(node.d - pulseWave));
        const deltaX = rotatedX - (mouseX < 9 ? mouseX : 99);
        const deltaY = rotatedY - (mouseY < 9 ? mouseY : 99);
        const mouseProx = Math.max(0, 1 - 4.2 * Math.hypot(deltaX, deltaY));
        const typingGlow = currentMood === 'typing' ? 0.35 * Math.max(0, 1 - 1.5 * node.d) : 0;

        alphaArray[i] =
          Math.min(
            1,
            (0.88 * node.glow + 0.45 * waveDist + 0.65 * mouseProx + typingGlow) * appear
          ) *
          (1 - 0.92 * blurFactor);

        radiusArray[i] =
          node.r *
          (1 + 0.5 * waveDist + 0.9 * mouseProx) *
          (0.4 + 0.6 * appear) *
          (1 - 0.62 * enterEase);
      }

      // Draw links in colorful tiers
      for (let l = 0; l < links.length; l++) {
        const link = links[l];
        const linkAppear = prefersReducedMotion
          ? 1
          : Math.max(0, Math.min(1, (elapsed - link.delay) / 0.9));
        if (linkAppear <= 0) continue;

        const avgAlpha = (alphaArray[link.a] + alphaArray[link.b]) * 0.5;
        if (avgAlpha < 0.03) continue;

        const [r, g, b] = link.rgb;
        const strokeOpacity =
          (0.045 + 0.14 * avgAlpha) * isDesktop * Math.pow(1 - blurFactor, 1.6);

        ctx.beginPath();
        ctx.moveTo(posX[link.a], posY[link.a]);
        ctx.lineTo(posX[link.b], posY[link.b]);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${strokeOpacity})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      // Draw vibrant colorful nodes
      for (let i = 0; i < nodes.length; i++) {
        if (alphaArray[i] <= 0.01) continue;
        const node = nodes[i];
        const [r, g, b] = node.rgb;
        const nodeR = Math.max(0.4, radiusArray[i]);
        const alpha = Math.min(0.98, 0.94 * alphaArray[i] * isDesktop);

        // Luminous soft halo on larger nodes
        if (nodeR > 1.4) {
          ctx.beginPath();
          ctx.arc(posX[i], posY[i], nodeR + 3.5, 0, 6.2832);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.28})`;
          ctx.fill();
        }

        // Solid colorful core
        ctx.beginPath();
        ctx.arc(posX[i], posY[i], nodeR, 0, 6.2832);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fill();
      }

      // Multi-spectral chromatic central haze
      const hazeFactor =
        Math.min(1, Math.max(0, elapsed - 0.1)) *
        (currentMood === 'typing' ? 1 : 0.75) *
        (1 - blurFactor);
      if (hazeFactor > 0.02) {
        const glowRadius = 0.42 * radius + enterEase * dims.radius * 0.1;
        const glowGrad = ctx.createRadialGradient(
          centerX,
          centerY,
          0,
          centerX,
          centerY,
          glowRadius
        );
        glowGrad.addColorStop(0, `rgba(255, 255, 255, ${0.08 * hazeFactor})`);
        glowGrad.addColorStop(0.3, `rgba(157, 180, 255, ${0.06 * hazeFactor})`);
        glowGrad.addColorStop(0.65, `rgba(216, 90, 48, ${0.03 * hazeFactor})`);
        glowGrad.addColorStop(1, 'rgba(3, 4, 10, 0)');

        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, 0, width, height);
      }

      // Enter warp light burst
      if (enterProgress > 0) {
        const burstT = Math.min(1, 1.15 * easeOutCubic(enterProgress));
        const burstRadius = Math.max(width, height) * 0.95 * (0.12 + 0.88 * enterEase);
        const burstGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, burstRadius);
        burstGrad.addColorStop(0, `rgba(255, 255, 255, ${0.92 * burstT})`);
        burstGrad.addColorStop(0.3, `rgba(157, 180, 255, ${0.65 * burstT})`);
        burstGrad.addColorStop(0.7, `rgba(127, 119, 221, ${0.35 * burstT})`);
        burstGrad.addColorStop(1, 'rgba(3, 4, 10, 0)');
        ctx.fillStyle = burstGrad;
        ctx.fillRect(0, 0, width, height);
      }

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      if (interactive) {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerleave', handlePointerLeave);
      }
    };
  }, [interactive]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
};
