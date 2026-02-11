"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Animal, Employee } from '@/types';
import { ZookeeperAssignmentWithDetails, assignmentService } from '@/services/assignment.service';
import {
  User, Leaf, ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2,
  History, X, Undo2, AlertTriangle, Trash2, Plus, Users, PawPrint, Network,
  Circle, ImageIcon, RectangleHorizontal
} from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  forceSimulation, forceLink, forceManyBody, forceCenter,
  forceCollide, forceX, forceY, SimulationNodeDatum, SimulationLinkDatum
} from 'd3-force';

// ─── Types ───────────────────────────────────────────────────────────────────

interface HistoryEntry {
  id: string;
  type: 'create' | 'delete';
  timestamp: Date;
  keeperId: number;
  keeperName: string;
  animalId: number;
  animalName: string;
  assignmentId?: number;
  undone?: boolean;
}

type GroupingMode = 'keeper' | 'animal' | 'cluster';
type NodeStyle = 'minimal' | 'image' | 'card';

interface GraphNode extends SimulationNodeDatum {
  id: string;
  type: 'keeper' | 'animal';
  entityId: number;
  label: string;
  sublabel: string;
  imageUrl?: string;
  healthStatus?: string;
  isVet?: boolean;
  radius: number;
  groupParent?: string; // id of the parent node in grouped modes
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  assignmentId: number;
  keeperId: number;
  animalId: number;
}

interface Props {
  animals: Animal[];
  keepers: Employee[];
  assignments: ZookeeperAssignmentWithDetails[];
  onAssignmentCreated: () => void;
  onAssignmentDeleted: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const KEEPER_RADIUS = 28;
const ANIMAL_RADIUS = 22;
const KEEPER_RADIUS_LARGE = 36;
const ANIMAL_RADIUS_LARGE = 32;

const COLORS = {
  bg: '#ffffff',
  dotGrid: '#e2e8f0',
  keeper: { fill: '#ecfdf5', stroke: '#10b981', text: '#065f46', glow: 'rgba(16,185,129,0.4)' },
  animal: { fill: '#f5f3ff', stroke: '#8b5cf6', text: '#4c1d95', glow: 'rgba(139,92,246,0.4)' },
  link: { normal: '#cbd5e1', highlight: '#f59e0b', create: '#10b981' },
  hover: { dimOpacity: 0.15 },
  health: {
    excellent: '#10b981', good: '#3b82f6', fair: '#f59e0b',
    poor: '#f97316', critical: '#ef4444', unknown: '#94a3b8'
  } as Record<string, string>,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildGraphData(
  animals: Animal[],
  keepers: Employee[],
  assignments: ZookeeperAssignmentWithDetails[],
  mode: GroupingMode
): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  if (mode === 'cluster') {
    // No duplicates — one node per entity
    keepers.forEach(k => {
      nodes.push({
        id: `k-${k.employee_id}`,
        type: 'keeper',
        entityId: k.employee_id,
        label: `${k.first_name} ${k.last_name}`,
        sublabel: k.job_role,
        isVet: k.job_role === 'veterinarian',
        radius: KEEPER_RADIUS,
      });
    });
    animals.forEach(a => {
      nodes.push({
        id: `a-${a.animal_id}`,
        type: 'animal',
        entityId: a.animal_id,
        label: a.name,
        sublabel: a.species,
        imageUrl: a.image_url,
        healthStatus: a.health_status,
        radius: ANIMAL_RADIUS,
      });
    });
    assignments.forEach(asgn => {
      links.push({
        source: `k-${asgn.keeper_id}`,
        target: `a-${asgn.animal_id}`,
        assignmentId: asgn.assignment_id,
        keeperId: asgn.keeper_id,
        animalId: asgn.animal_id,
      });
    });
  } else if (mode === 'keeper') {
    // Keepers are central, animals duplicated per-keeper
    keepers.forEach(k => {
      const kId = `k-${k.employee_id}`;
      nodes.push({
        id: kId, type: 'keeper', entityId: k.employee_id,
        label: `${k.first_name} ${k.last_name}`, sublabel: k.job_role,
        isVet: k.job_role === 'veterinarian', radius: KEEPER_RADIUS_LARGE,
      });
      const assigned = assignments.filter(a => a.keeper_id === k.employee_id);
      assigned.forEach(asgn => {
        const animal = animals.find(an => an.animal_id === asgn.animal_id);
        if (!animal) return;
        const aId = `a-${asgn.animal_id}-k-${k.employee_id}`;
        nodes.push({
          id: aId, type: 'animal', entityId: animal.animal_id,
          label: animal.name, sublabel: animal.species,
          imageUrl: animal.image_url, healthStatus: animal.health_status,
          radius: ANIMAL_RADIUS, groupParent: kId,
        });
        links.push({
          source: kId, target: aId,
          assignmentId: asgn.assignment_id,
          keeperId: k.employee_id, animalId: animal.animal_id,
        });
      });
    });
    // Unassigned animals
    const assignedIds = new Set(assignments.map(a => a.animal_id));
    animals.filter(a => !assignedIds.has(a.animal_id)).forEach(a => {
      nodes.push({
        id: `a-${a.animal_id}`, type: 'animal', entityId: a.animal_id,
        label: a.name, sublabel: a.species,
        imageUrl: a.image_url, healthStatus: a.health_status,
        radius: ANIMAL_RADIUS,
      });
    });
  } else {
    // mode === 'animal': Animals central, keepers duplicated per-animal
    animals.forEach(a => {
      const aId = `a-${a.animal_id}`;
      nodes.push({
        id: aId, type: 'animal', entityId: a.animal_id,
        label: a.name, sublabel: a.species,
        imageUrl: a.image_url, healthStatus: a.health_status,
        radius: ANIMAL_RADIUS_LARGE,
      });
      const assigned = assignments.filter(asgn => asgn.animal_id === a.animal_id);
      assigned.forEach(asgn => {
        const keeper = keepers.find(k => k.employee_id === asgn.keeper_id);
        if (!keeper) return;
        const kId = `k-${keeper.employee_id}-a-${a.animal_id}`;
        nodes.push({
          id: kId, type: 'keeper', entityId: keeper.employee_id,
          label: `${keeper.first_name} ${keeper.last_name}`, sublabel: keeper.job_role,
          isVet: keeper.job_role === 'veterinarian', radius: KEEPER_RADIUS,
          groupParent: aId,
        });
        links.push({
          source: kId, target: aId,
          assignmentId: asgn.assignment_id,
          keeperId: keeper.employee_id, animalId: a.animal_id,
        });
      });
    });
    // Unassigned keepers
    const assignedKeeperIds = new Set(assignments.map(a => a.keeper_id));
    keepers.filter(k => !assignedKeeperIds.has(k.employee_id)).forEach(k => {
      nodes.push({
        id: `k-${k.employee_id}`, type: 'keeper', entityId: k.employee_id,
        label: `${k.first_name} ${k.last_name}`, sublabel: k.job_role,
        isVet: k.job_role === 'veterinarian', radius: KEEPER_RADIUS,
      });
    });
  }
  return { nodes, links };
}

function setupSimulation(
  nodes: GraphNode[],
  links: GraphLink[],
  mode: GroupingMode,
  width: number,
  height: number
) {
  const sim = forceSimulation(nodes)
    .force('charge', forceManyBody().strength(mode === 'cluster' ? -200 : -300))
    .force('center', forceCenter(width / 2, height / 2).strength(0.05))
    .force('collision', forceCollide<GraphNode>().radius(d => d.radius + 12).strength(0.8))
    .force('link', forceLink<GraphNode, GraphLink>(links).id(d => d.id)
      .distance(mode === 'cluster' ? 120 : 80).strength(0.6))
    .alphaDecay(0.02)
    .velocityDecay(0.3);

  // In grouped modes, pull children toward their parent
  if (mode === 'keeper' || mode === 'animal') {
    const parentMap = new Map<string, GraphNode>();
    nodes.forEach(n => { if (!n.groupParent) parentMap.set(n.id, n); });

    sim.force('groupX', forceX<GraphNode>().x(d => {
      if (d.groupParent) {
        const parent = parentMap.get(d.groupParent);
        return parent?.x ?? width / 2;
      }
      return width / 2;
    }).strength(d => d.groupParent ? 0.15 : 0.02));

    sim.force('groupY', forceY<GraphNode>().y(d => {
      if (d.groupParent) {
        const parent = parentMap.get(d.groupParent);
        return parent?.y ?? height / 2;
      }
      return height / 2;
    }).strength(d => d.groupParent ? 0.15 : 0.02));
  }

  return sim;
}

// ─── Image cache for node thumbnails ─────────────────────────────────────────

const imageCache = new Map<string, HTMLImageElement>();

function getImage(url: string): HTMLImageElement | null {
  if (imageCache.has(url)) {
    const img = imageCache.get(url)!;
    return img.complete && img.naturalWidth > 0 ? img : null;
  }
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  imageCache.set(url, img);
  return null;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AssignmentGraphView({
  animals, keepers, assignments, onAssignmentCreated, onAssignmentDeleted
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const animFrameRef = useRef<number>(0);

  const [grouping, setGrouping] = useState<GroupingMode>('keeper');
  const [nodeStyle, setNodeStyle] = useState<NodeStyle>('minimal');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Interaction state
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const draggedNodeRef = useRef<string | null>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const [hoveredLink, setHoveredLink] = useState<number | null>(null);
  const hoveredLinkRef = useRef<number | null>(null);

  // Drop target for assignment creation
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dropTargetRef = useRef<string | null>(null);

  // Assignment CRUD
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    assignmentId: number; keeperName: string; animalName: string;
  } | null>(null);

  // History
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);

  // Escape key for fullscreen
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false); };
    if (isFullscreen) { document.addEventListener('keydown', handleKey); document.body.style.overflow = 'hidden'; }
    else { document.body.style.overflow = ''; }
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = ''; };
  }, [isFullscreen]);

  // ─── Build graph & simulation whenever data/grouping changes ──────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 900;
    const h = rect.height || 600;

    const { nodes, links } = buildGraphData(animals, keepers, assignments, grouping);
    nodesRef.current = nodes;
    linksRef.current = links;

    // Stop old simulation
    if (simRef.current) simRef.current.stop();

    const sim = setupSimulation(nodes, links, grouping, w, h);
    simRef.current = sim;

    // Reset transform
    transformRef.current = { x: 0, y: 0, k: 1 };
    setTransform({ x: 0, y: 0, k: 1 });

    sim.on('tick', () => { /* render loop handles drawing */ });

    return () => { sim.stop(); };
  }, [animals, keepers, assignments, grouping]);

  // ─── Canvas rendering loop ────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const t = transformRef.current;
      const w = rect.width;
      const h = rect.height;

      // Clear
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, w, h);

      // Dot grid
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);
      const dotSpacing = 40;
      const startX = Math.floor(-t.x / t.k / dotSpacing) * dotSpacing - dotSpacing;
      const startY = Math.floor(-t.y / t.k / dotSpacing) * dotSpacing - dotSpacing;
      const endX = startX + w / t.k + dotSpacing * 2;
      const endY = startY + h / t.k + dotSpacing * 2;
      ctx.fillStyle = COLORS.dotGrid;
      for (let gx = startX; gx < endX; gx += dotSpacing) {
        for (let gy = startY; gy < endY; gy += dotSpacing) {
          ctx.beginPath();
          ctx.arc(gx, gy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const nodes = nodesRef.current;
      const links = linksRef.current;
      const hNode = hoveredNodeRef.current;
      const dNode = draggedNodeRef.current;
      const hLink = hoveredLinkRef.current;
      const dTarget = dropTargetRef.current;
      const style = nodeStyle;

      // Determine connected set for dimming
      const getLinkNodeId = (ref: string | number | GraphNode): string =>
        typeof ref === 'object' ? ref.id : String(ref);

      const connectedIds = new Set<string>();
      if (hNode) {
        connectedIds.add(hNode);
        links.forEach(l => {
          const sId = getLinkNodeId(l.source as string | number | GraphNode);
          const tId = getLinkNodeId(l.target as string | number | GraphNode);
          if (sId === hNode) connectedIds.add(tId);
          if (tId === hNode) connectedIds.add(sId);
        });
      }

      // Draw links
      links.forEach(l => {
        const s = l.source as GraphNode;
        const e = l.target as GraphNode;
        if (!s.x || !s.y || !e.x || !e.y) return;

        const isHighlighted = hNode && (connectedIds.has(getLinkNodeId(l.source as string | number | GraphNode)) &&
          connectedIds.has(getLinkNodeId(l.target as string | number | GraphNode)));
        const isLinkHovered = hLink === l.assignmentId;
        const dimmed = hNode && !isHighlighted;

        ctx.beginPath();
        // Curved line
        const mx = (s.x + e.x) / 2;
        const my = (s.y + e.y) / 2;
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const offset = Math.min(Math.sqrt(dx * dx + dy * dy) * 0.15, 30);
        const cx = mx + (dy > 0 ? -offset : offset);
        const cy = my + (dx > 0 ? offset : -offset);
        ctx.moveTo(s.x, s.y);
        ctx.quadraticCurveTo(cx, cy, e.x, e.y);

        ctx.strokeStyle = isLinkHovered ? '#ef4444' : isHighlighted ? COLORS.link.highlight : COLORS.link.normal;
        ctx.lineWidth = isLinkHovered ? 3 : isHighlighted ? 2.5 : 1.5;
        ctx.globalAlpha = dimmed ? 0.1 : 1;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Delete button on hovered link
        if (isLinkHovered && !dNode) {
          ctx.beginPath();
          ctx.arc(cx, cy, 10, 0, Math.PI * 2);
          ctx.fillStyle = '#ef4444';
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('×', cx, cy + 1);
        }
      });

      // Draw nodes
      nodes.forEach(node => {
        if (node.x == null || node.y == null) return;
        const dimmed = hNode && !connectedIds.has(node.id);
        const isHovered = hNode === node.id;
        const isDrop = dTarget === node.id;
        const colors = node.type === 'keeper' ? COLORS.keeper : COLORS.animal;
        const r = node.radius;

        ctx.globalAlpha = dimmed ? COLORS.hover.dimOpacity : 1;

        // Glow for hovered/drop
        if ((isHovered || isDrop) && !dimmed) {
          ctx.save();
          ctx.shadowColor = isDrop ? 'rgba(139,92,246,0.6)' : colors.glow;
          ctx.shadowBlur = isDrop ? 20 : 15;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 2, 0, Math.PI * 2);
          ctx.fillStyle = 'transparent';
          ctx.fill();
          ctx.restore();
        }

        if (style === 'card') {
          // Card style: rounded rect
          const cardW = r * 3.5;
          const cardH = r * 2.2;
          const cx = node.x - cardW / 2;
          const cy = node.y - cardH / 2;
          ctx.beginPath();
          ctx.roundRect(cx, cy, cardW, cardH, 8);
          ctx.fillStyle = colors.fill;
          ctx.fill();
          ctx.strokeStyle = isDrop ? '#8b5cf6' : isHovered ? COLORS.link.highlight : colors.stroke;
          ctx.lineWidth = isDrop ? 3 : isHovered ? 2.5 : 1.5;
          ctx.stroke();

          // Image thumbnail in card
          if (style === 'card' && node.imageUrl) {
            const img = getImage(node.imageUrl);
            if (img) {
              ctx.save();
              ctx.beginPath();
              ctx.roundRect(cx + 4, cy + 4, cardH - 8, cardH - 8, 4);
              ctx.clip();
              ctx.drawImage(img, cx + 4, cy + 4, cardH - 8, cardH - 8);
              ctx.restore();
            }
          }

          // Text
          ctx.fillStyle = colors.text;
          ctx.font = 'bold 11px Inter, system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const textX = node.imageUrl ? cx + cardH : cx + 8;
          ctx.fillText(node.label.slice(0, 14), textX, node.y - 5);
          ctx.font = '10px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#64748b';
          ctx.fillText(node.sublabel.slice(0, 16), textX, node.y + 8);
        } else if (style === 'image') {
          // Circle with image fill
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
          ctx.fillStyle = colors.fill;
          ctx.fill();

          if (node.imageUrl) {
            const img = getImage(node.imageUrl);
            if (img) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(node.x, node.y, r - 2, 0, Math.PI * 2);
              ctx.clip();
              ctx.drawImage(img, node.x - r + 2, node.y - r + 2, (r - 2) * 2, (r - 2) * 2);
              ctx.restore();
            }
          } else {
            // Icon placeholder
            ctx.fillStyle = colors.stroke;
            ctx.font = `${r * 0.8}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.type === 'keeper' ? '👤' : '🐾', node.x, node.y);
          }

          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = isDrop ? '#8b5cf6' : isHovered ? COLORS.link.highlight : colors.stroke;
          ctx.lineWidth = isDrop ? 3 : isHovered ? 2.5 : 1.5;
          ctx.stroke();

          // Label below
          ctx.fillStyle = colors.text;
          ctx.font = 'bold 10px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(node.label.slice(0, 16), node.x, node.y + r + 4);
        } else {
          // Minimal: colored circle with label
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
          ctx.fillStyle = colors.fill;
          ctx.fill();
          ctx.strokeStyle = isDrop ? '#8b5cf6' : isHovered ? COLORS.link.highlight : colors.stroke;
          ctx.lineWidth = isDrop ? 3 : isHovered ? 2.5 : 1.5;
          ctx.stroke();

          // Health dot
          if (node.healthStatus) {
            const hc = COLORS.health[node.healthStatus] || COLORS.health.unknown;
            ctx.beginPath();
            ctx.arc(node.x + r * 0.65, node.y - r * 0.65, 4, 0, Math.PI * 2);
            ctx.fillStyle = hc;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          // Vet badge
          if (node.isVet) {
            ctx.beginPath();
            ctx.arc(node.x + r * 0.65, node.y - r * 0.65, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#a855f7';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          // Initial letter
          ctx.fillStyle = colors.stroke;
          ctx.font = `bold ${r * 0.7}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(node.label.charAt(0).toUpperCase(), node.x, node.y);

          // Label below
          ctx.fillStyle = colors.text;
          ctx.font = 'bold 10px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(node.label.slice(0, 16), node.x, node.y + r + 4);
          ctx.font = '9px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(node.sublabel.slice(0, 18), node.x, node.y + r + 16);
        }

        ctx.globalAlpha = 1;
      });

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
  }, [nodeStyle]);

  // ─── Hit testing ──────────────────────────────────────────────────────
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const t = transformRef.current;
    return { x: (sx - t.x) / t.k, y: (sy - t.y) / t.k };
  }, []);

  const findNodeAt = useCallback((wx: number, wy: number): GraphNode | null => {
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.x == null || n.y == null) continue;
      const dx = wx - n.x, dy = wy - n.y;
      const hitR = nodeStyle === 'card' ? Math.max(n.radius * 1.75, n.radius * 1.1) : n.radius + 4;
      if (dx * dx + dy * dy < hitR * hitR) return n;
    }
    return null;
  }, [nodeStyle]);

  const findLinkAt = useCallback((wx: number, wy: number): GraphLink | null => {
    const links = linksRef.current;
    for (const l of links) {
      const s = l.source as GraphNode;
      const e = l.target as GraphNode;
      if (!s.x || !s.y || !e.x || !e.y) continue;
      const mx = (s.x + e.x) / 2;
      const my = (s.y + e.y) / 2;
      const dx = wx - mx, dy = wy - my;
      if (dx * dx + dy * dy < 15 * 15) return l;
    }
    return null;
  }, []);

  // ─── Mouse handlers ───────────────────────────────────────────────────
  const getCanvasPos = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getCanvasPos(e);
    const world = screenToWorld(pos.x, pos.y);
    const node = findNodeAt(world.x, world.y);

    if (node) {
      draggedNodeRef.current = node.id;
      setDraggedNode(node.id);
      node.fx = node.x;
      node.fy = node.y;
      simRef.current?.alphaTarget(0.3).restart();
    } else {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - transformRef.current.x, y: e.clientY - transformRef.current.y };
    }
  }, [getCanvasPos, screenToWorld, findNodeAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    const world = screenToWorld(pos.x, pos.y);

    if (draggedNodeRef.current) {
      const node = nodesRef.current.find(n => n.id === draggedNodeRef.current);
      if (node) {
        node.fx = world.x;
        node.fy = world.y;

        // Check for drop target (for assignment creation — animal on keeper or vice versa)
        const target = findNodeAt(world.x, world.y);
        if (target && target.id !== draggedNodeRef.current && target.type !== node.type) {
          dropTargetRef.current = target.id;
          setDropTarget(target.id);
        } else {
          dropTargetRef.current = null;
          setDropTarget(null);
        }
      }
      return;
    }

    if (isPanningRef.current) {
      const newT = {
        ...transformRef.current,
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      };
      transformRef.current = newT;
      setTransform(newT);
      return;
    }

    // Hover detection
    const node = findNodeAt(world.x, world.y);
    if (node) {
      hoveredNodeRef.current = node.id;
      setHoveredNode(node.id);
      hoveredLinkRef.current = null;
      setHoveredLink(null);
    } else {
      hoveredNodeRef.current = null;
      setHoveredNode(null);
      const link = findLinkAt(world.x, world.y);
      hoveredLinkRef.current = link?.assignmentId ?? null;
      setHoveredLink(link?.assignmentId ?? null);
    }
  }, [getCanvasPos, screenToWorld, findNodeAt, findLinkAt]);

  const handleMouseUp = useCallback(async () => {
    if (draggedNodeRef.current) {
      const node = nodesRef.current.find(n => n.id === draggedNodeRef.current);
      const targetId = dropTargetRef.current;

      if (node && targetId) {
        const target = nodesRef.current.find(n => n.id === targetId);
        if (target && target.type !== node.type) {
          const keeperId = node.type === 'keeper' ? node.entityId : target.entityId;
          const animalId = node.type === 'animal' ? node.entityId : target.entityId;
          const exists = assignments.some(a => a.keeper_id === keeperId && a.animal_id === animalId);
          if (!exists) {
            setIsCreating(true);
            try {
              await assignmentService.create({ keeper_id: keeperId, animal_id: animalId });
              const keeper = keepers.find(k => k.employee_id === keeperId);
              const animal = animals.find(a => a.animal_id === animalId);
              setHistory(prev => [{
                id: `create-${Date.now()}`, type: 'create' as const, timestamp: new Date(),
                keeperId, keeperName: keeper ? `${keeper.first_name} ${keeper.last_name}` : 'Unknown',
                animalId, animalName: animal?.name || 'Unknown',
              }, ...prev].slice(0, 50));
              onAssignmentCreated();
            } catch (err) { console.error('Failed to create assignment:', err); }
            finally { setIsCreating(false); }
          }
        }
      }

      if (node) { node.fx = null; node.fy = null; }
      simRef.current?.alphaTarget(0);
      draggedNodeRef.current = null;
      setDraggedNode(null);
      dropTargetRef.current = null;
      setDropTarget(null);
    }
    isPanningRef.current = false;
  }, [assignments, keepers, animals, onAssignmentCreated]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const pos = getCanvasPos(e);
    const scaleFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const t = transformRef.current;
    const newK = Math.min(Math.max(t.k * scaleFactor, 0.2), 3);
    const newT = {
      k: newK,
      x: pos.x - (pos.x - t.x) * (newK / t.k),
      y: pos.y - (pos.y - t.y) * (newK / t.k),
    };
    transformRef.current = newT;
    setTransform(newT);
  }, [getCanvasPos]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (draggedNodeRef.current) return;
    const pos = getCanvasPos(e);
    const world = screenToWorld(pos.x, pos.y);
    const link = findLinkAt(world.x, world.y);
    if (link) {
      const keeper = keepers.find(k => k.employee_id === link.keeperId);
      const animal = animals.find(a => a.animal_id === link.animalId);
      setDeleteConfirmation({
        assignmentId: link.assignmentId,
        keeperName: keeper ? `${keeper.first_name} ${keeper.last_name}` : 'Unknown',
        animalName: animal?.name || 'Unknown',
      });
    }
  }, [getCanvasPos, screenToWorld, findLinkAt, keepers, animals]);

  // Delete + undo logic
  const confirmDelete = async () => {
    if (!deleteConfirmation) return;
    const asgn = assignments.find(a => a.assignment_id === deleteConfirmation.assignmentId);
    if (!asgn) { setDeleteConfirmation(null); return; }
    try {
      await assignmentService.delete(deleteConfirmation.assignmentId);
      setHistory(prev => [{
        id: `delete-${Date.now()}`, type: 'delete' as const, timestamp: new Date(),
        keeperId: asgn.keeper_id, keeperName: deleteConfirmation.keeperName,
        animalId: asgn.animal_id, animalName: deleteConfirmation.animalName,
        assignmentId: deleteConfirmation.assignmentId,
      }, ...prev].slice(0, 50));
      onAssignmentDeleted();
    } catch (err) { console.error('Failed to delete:', err); }
    finally { setDeleteConfirmation(null); }
  };

  const undoEntry = async (entry: HistoryEntry) => {
    try {
      if (entry.type === 'create') {
        const cur = assignments.find(a => a.keeper_id === entry.keeperId && a.animal_id === entry.animalId);
        if (cur) { await assignmentService.delete(cur.assignment_id); onAssignmentDeleted(); }
      } else {
        await assignmentService.create({ keeper_id: entry.keeperId, animal_id: entry.animalId });
        onAssignmentCreated();
      }
      setHistory(prev => prev.map(h => h.id === entry.id ? { ...h, undone: true } : h));
    } catch (err) { console.error('Undo failed:', err); }
  };

  const zoomIn = () => {
    const t = transformRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const newK = Math.min(t.k * 1.25, 3);
    const newT = { k: newK, x: cx - (cx - t.x) * (newK / t.k), y: cy - (cy - t.y) * (newK / t.k) };
    transformRef.current = newT;
    setTransform(newT);
  };

  const zoomOut = () => {
    const t = transformRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const newK = Math.max(t.k * 0.8, 0.2);
    const newT = { k: newK, x: cx - (cx - t.x) * (newK / t.k), y: cy - (cy - t.y) * (newK / t.k) };
    transformRef.current = newT;
    setTransform(newT);
  };

  const resetView = () => {
    transformRef.current = { x: 0, y: 0, k: 1 };
    setTransform({ x: 0, y: 0, k: 1 });
  };

  // ─── Render ───────────────────────────────────────────────────────────

  const graphContent = (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${isFullscreen
        ? 'fixed inset-0 z-[99999] bg-white'
        : 'w-full h-[700px] rounded-xl border border-slate-200 shadow-inner bg-white'
        }`}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: draggedNode ? 'grabbing' : hoveredNode ? 'pointer' : isPanningRef.current ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); hoveredNodeRef.current = null; setHoveredNode(null); }}
        onWheel={handleWheel}
        onClick={handleCanvasClick}
      />

      {/* Grouping buttons - top center */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex gap-1 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 p-1.5">
        <Button variant={grouping === 'keeper' ? 'default' : 'ghost'} size="sm"
          onClick={() => setGrouping('keeper')} className={`rounded-lg ${grouping === 'keeper' ? '' : 'hover:bg-slate-100'}`}>
          <Users className="h-4 w-4 mr-1.5" /> By Keeper
        </Button>
        <Button variant={grouping === 'animal' ? 'default' : 'ghost'} size="sm"
          onClick={() => setGrouping('animal')} className={`rounded-lg ${grouping === 'animal' ? '' : 'hover:bg-slate-100'}`}>
          <PawPrint className="h-4 w-4 mr-1.5" /> By Animal
        </Button>
        <Button variant={grouping === 'cluster' ? 'default' : 'ghost'} size="sm"
          onClick={() => setGrouping('cluster')} className={`rounded-lg ${grouping === 'cluster' ? '' : 'hover:bg-slate-100'}`}>
          <Network className="h-4 w-4 mr-1.5" /> Cluster
        </Button>
        <div className="w-px bg-slate-200 mx-1" />
        {/* Node style toggle */}
        <Button variant={nodeStyle === 'minimal' ? 'default' : 'ghost'} size="sm"
          onClick={() => setNodeStyle('minimal')} title="Minimal circles" className={`rounded-lg ${nodeStyle === 'minimal' ? '' : 'hover:bg-slate-100'}`}>
          <Circle className="h-4 w-4" />
        </Button>
        <Button variant={nodeStyle === 'image' ? 'default' : 'ghost'} size="sm"
          onClick={() => setNodeStyle('image')} title="Image circles" className={`rounded-lg ${nodeStyle === 'image' ? '' : 'hover:bg-slate-100'}`}>
          <ImageIcon className="h-4 w-4" />
        </Button>
        <Button variant={nodeStyle === 'card' ? 'default' : 'ghost'} size="sm"
          onClick={() => setNodeStyle('card')} title="Card style" className={`rounded-lg ${nodeStyle === 'card' ? '' : 'hover:bg-slate-100'}`}>
          <RectangleHorizontal className="h-4 w-4" />
        </Button>
      </div>

      {/* Top right controls */}
      <div className="absolute top-4 right-4 z-30 flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => setShowHistory(p => !p)} title="View History"
          className={`bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 hover:bg-slate-100 relative ${showHistory ? 'bg-slate-100 border-slate-300' : ''}`}>
          <History className="h-4 w-4" />
          {history.filter(h => !h.undone).length > 0 && (
            <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-medium">
              {history.filter(h => !h.undone).length > 9 ? '9+' : history.filter(h => !h.undone).length}
            </span>
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(p => !p)}
          title={isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen"}
          className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 hover:bg-slate-100">
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        <div className="flex gap-1 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 p-1.5">
          <Button variant="ghost" size="sm" onClick={zoomOut} title="Zoom Out" className="rounded-lg hover:bg-slate-100"><ZoomOut className="h-4 w-4" /></Button>
          <span className="flex items-center text-sm text-slate-600 px-2 font-medium min-w-[50px] justify-center">{Math.round(transform.k * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={zoomIn} title="Zoom In" className="rounded-lg hover:bg-slate-100"><ZoomIn className="h-4 w-4" /></Button>
          <div className="w-px bg-slate-200 mx-1" />
          <Button variant="ghost" size="sm" onClick={resetView} title="Reset View" className="rounded-lg hover:bg-slate-100"><RotateCcw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-30 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 p-4">
        <h4 className="text-xs font-semibold text-slate-700 mb-3 uppercase tracking-wide">Legend</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500" />
            <span className="text-sm text-slate-600">Keepers / Vets</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-400 to-purple-500" />
            <span className="text-sm text-slate-600">Animals</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-0.5 bg-gradient-to-r from-emerald-500 to-violet-500 rounded" />
            <span className="text-sm text-slate-600">Assignment</span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-200">
          <p className="text-xs text-slate-500">Drag nodes • Scroll to zoom • Click link × to delete</p>
        </div>
      </div>

      {/* Loading overlay */}
      {isCreating && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 flex items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent" />
            <span className="text-slate-700 font-medium">Creating assignment...</span>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmation && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-800">Delete Assignment?</h3>
                <p className="text-slate-600 mt-1">
                  Remove <strong>{deleteConfirmation.animalName}</strong> from <strong>{deleteConfirmation.keeperName}</strong>&apos;s care?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setDeleteConfirmation(null)} className="rounded-lg">Cancel</Button>
              <Button variant="default" onClick={confirmDelete} className="rounded-lg bg-red-600 hover:bg-red-700 text-white">
                <Trash2 className="h-4 w-4 mr-1.5" /> Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* History panel */}
      {showHistory && (
        <div className="absolute top-14 right-4 z-40 w-80 max-h-[500px] bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-slate-600" />
              <h3 className="font-semibold text-slate-800">Recent Changes</h3>
            </div>
            <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-slate-200 rounded-lg transition-colors">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          <div className="overflow-y-auto max-h-[400px]">
            {history.length === 0 ? (
              <div className="p-6 text-center text-slate-500">
                <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No changes yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {history.map(entry => (
                  <div key={entry.id} className={`p-3 flex items-start gap-3 ${entry.undone ? 'opacity-50 bg-slate-50' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${entry.type === 'create' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                      {entry.type === 'create' ? <Plus className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800">
                        <span className={entry.type === 'create' ? 'text-emerald-700' : 'text-red-700'}>
                          {entry.type === 'create' ? 'Assigned' : 'Removed'}
                        </span>{' '}<strong>{entry.animalName}</strong>{' '}{entry.type === 'create' ? 'to' : 'from'}{' '}<strong>{entry.keeperName}</strong>
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {entry.timestamp.toLocaleTimeString()}{entry.undone && <span className="ml-2 text-amber-600">(Undone)</span>}
                      </p>
                    </div>
                    {!entry.undone && (
                      <button onClick={() => undoEntry(entry)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0" title="Undo">
                        <Undo2 className="h-4 w-4 text-slate-500" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom help bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 px-5 py-3 text-sm text-slate-600 flex items-center gap-3 z-20">
        <span>
          <strong>Drag</strong> nodes to move • <strong>Scroll</strong> to zoom • <strong>Drag</strong> animal → keeper to assign • <strong>Click</strong> link to delete
          {isFullscreen && <span className="ml-2 text-slate-400">• <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">Esc</kbd> to exit</span>}
        </span>
      </div>
    </div>
  );

  if (isFullscreen && mounted && typeof document !== 'undefined') {
    return (
      <>
        <div className="w-full h-[700px] rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center">
          <div className="text-slate-500">
            <Maximize2 className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">Viewing in fullscreen mode</p>
            <button onClick={() => setIsFullscreen(false)} className="mt-2 text-xs text-slate-600 underline hover:text-slate-800">Exit fullscreen</button>
          </div>
        </div>
        {createPortal(
          <div className="fixed inset-0" style={{ zIndex: 999999 }}>
            <div className="absolute inset-0 bg-white">{graphContent}</div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return graphContent;
}
