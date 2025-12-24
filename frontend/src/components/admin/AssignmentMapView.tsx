"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Animal, Employee } from '@/types';
import { ZookeeperAssignmentWithDetails, assignmentService } from '@/services/assignment.service';
import { User, Leaf, ZoomIn, ZoomOut, RotateCcw, Move, Maximize2, Minimize2, LayoutGrid, GitBranch, Rows3, Image, ImageOff } from 'lucide-react';
import { createPortal } from 'react-dom';

interface CardPosition {
    x: number;
    y: number;
}

type LayoutMode = 'grid' | 'cluster' | 'rows';

interface Props {
    animals: Animal[];
    keepers: Employee[];
    assignments: ZookeeperAssignmentWithDetails[];
    onAssignmentCreated: () => void;
    onAssignmentDeleted: () => void;
}

const KEEPER_CARD_WIDTH = 240;
const KEEPER_CARD_HEIGHT = 110;
const ANIMAL_CARD_WIDTH = 260;
const ANIMAL_CARD_HEIGHT = 100;
const GRID_GAP = 50;

export function AssignmentMapView({
    animals,
    keepers,
    assignments,
    onAssignmentCreated,
    onAssignmentDeleted
}: Props) {
    const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid');
    const [showImages, setShowImages] = useState(true);
    const [keeperPositions, setKeeperPositions] = useState<Record<number, CardPosition>>({});
    const [animalPositions, setAnimalPositions] = useState<Record<number, CardPosition>>({});
    const [isLayoutAnimating, setIsLayoutAnimating] = useState(false);
    const [draggedItem, setDraggedItem] = useState<{ type: 'keeper' | 'animal'; id: number } | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [hoveredCard, setHoveredCard] = useState<{ type: 'keeper' | 'animal'; id: number } | null>(null);
    const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);
    const [scale, setScale] = useState(0.65);
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const innerCanvasRef = useRef<HTMLDivElement>(null);
    const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
    const [hoveredConnection, setHoveredConnection] = useState<number | null>(null);
    const [dropTargetKeeper, setDropTargetKeeper] = useState<number | null>(null);
    const [legendOpacity, setLegendOpacity] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Track if component is mounted (for portal)
    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Handle escape key to exit fullscreen
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullscreen) {
                setIsFullscreen(false);
            }
        };

        if (isFullscreen) {
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isFullscreen]);

    const canvasSize = useMemo(() => {
        const allPositions = [...Object.values(keeperPositions), ...Object.values(animalPositions)];
        if (allPositions.length === 0) return { width: 2200, height: 1800 };

        const maxX = Math.max(...allPositions.map(p => p.x)) + 500;
        const maxY = Math.max(...allPositions.map(p => p.y)) + 400;
        return {
            width: Math.max(2200, maxX),
            height: Math.max(1800, maxY)
        };
    }, [keeperPositions, animalPositions]);

    const isConnectionHighlighted = useCallback((assignment: ZookeeperAssignmentWithDetails) => {
        if (!hoveredCard) return false;
        if (hoveredCard.type === 'keeper') {
            return assignment.keeper_id === hoveredCard.id;
        } else {
            return assignment.animal_id === hoveredCard.id;
        }
    }, [hoveredCard]);

    // Grid layout with more spacing
    const getGridLayout = useCallback(() => {
        const keeperPos: Record<number, CardPosition> = {};
        const animalPos: Record<number, CardPosition> = {};

        keepers.forEach((keeper, index) => {
            keeperPos[keeper.employee_id] = {
                x: 100,
                y: 140 + index * (KEEPER_CARD_HEIGHT + GRID_GAP),
            };
        });

        const columns = 3;
        animals.forEach((animal, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);
            animalPos[animal.animal_id] = {
                x: 550 + col * (ANIMAL_CARD_WIDTH + GRID_GAP),
                y: 120 + row * (ANIMAL_CARD_HEIGHT + GRID_GAP),
            };
        });

        return { keeperPos, animalPos };
    }, [keepers, animals]);

    // Cluster layout with more spacing
    const getClusterLayout = useCallback(() => {
        const keeperPos: Record<number, CardPosition> = {};
        const animalPos: Record<number, CardPosition> = {};

        const keeperColumns = 2;
        const keeperSpacingX = 900;
        const keeperSpacingY = 700;

        keepers.forEach((keeper, index) => {
            const col = index % keeperColumns;
            const row = Math.floor(index / keeperColumns);
            keeperPos[keeper.employee_id] = {
                x: 400 + col * keeperSpacingX,
                y: 350 + row * keeperSpacingY,
            };
        });

        const assignedAnimals = new Set<number>();

        keepers.forEach((keeper) => {
            const keeperCenter = keeperPos[keeper.employee_id];
            const assignedToKeeper = assignments.filter(a => a.keeper_id === keeper.employee_id);

            assignedToKeeper.forEach((assignment, i) => {
                assignedAnimals.add(assignment.animal_id);
                const angle = (i / Math.max(assignedToKeeper.length, 1)) * 2 * Math.PI - Math.PI / 2;
                const radius = 280 + (i % 2) * 70;

                animalPos[assignment.animal_id] = {
                    x: keeperCenter.x + Math.cos(angle) * radius - ANIMAL_CARD_WIDTH / 2 + KEEPER_CARD_WIDTH / 2,
                    y: keeperCenter.y + Math.sin(angle) * radius + 40,
                };
            });
        });

        const unassigned = animals.filter(a => !assignedAnimals.has(a.animal_id));
        const maxKeeperY = Math.max(...Object.values(keeperPos).map(p => p.y), 0);
        unassigned.forEach((animal, index) => {
            const col = index % 4;
            const row = Math.floor(index / 4);
            animalPos[animal.animal_id] = {
                x: 150 + col * (ANIMAL_CARD_WIDTH + GRID_GAP),
                y: maxKeeperY + 550 + row * (ANIMAL_CARD_HEIGHT + GRID_GAP),
            };
        });

        return { keeperPos, animalPos };
    }, [keepers, animals, assignments]);

    // Rows layout with more spacing
    const getRowsLayout = useCallback(() => {
        const keeperPos: Record<number, CardPosition> = {};
        const animalPos: Record<number, CardPosition> = {};

        let currentY = 120;
        const assignedAnimals = new Set<number>();

        keepers.forEach((keeper) => {
            keeperPos[keeper.employee_id] = {
                x: 100,
                y: currentY,
            };

            const assignedToKeeper = assignments.filter(a => a.keeper_id === keeper.employee_id);

            assignedToKeeper.forEach((assignment, i) => {
                assignedAnimals.add(assignment.animal_id);
                animalPos[assignment.animal_id] = {
                    x: 450 + i * (ANIMAL_CARD_WIDTH + 30),
                    y: currentY - 5,
                };
            });

            currentY += Math.max(KEEPER_CARD_HEIGHT, ANIMAL_CARD_HEIGHT) + 80;
        });

        const unassigned = animals.filter(a => !assignedAnimals.has(a.animal_id));
        if (unassigned.length > 0) {
            currentY += 60;
            unassigned.forEach((animal, index) => {
                const col = index % 5;
                const row = Math.floor(index / 5);
                animalPos[animal.animal_id] = {
                    x: 100 + col * (ANIMAL_CARD_WIDTH + 30),
                    y: currentY + row * (ANIMAL_CARD_HEIGHT + 40),
                };
            });
        }

        return { keeperPos, animalPos };
    }, [keepers, animals, assignments]);

    const applyLayout = useCallback((mode: LayoutMode) => {
        setIsLayoutAnimating(true);
        setLayoutMode(mode);

        let layout;
        switch (mode) {
            case 'cluster':
                layout = getClusterLayout();
                break;
            case 'rows':
                layout = getRowsLayout();
                break;
            default:
                layout = getGridLayout();
        }

        setKeeperPositions(layout.keeperPos);
        setAnimalPositions(layout.animalPos);

        setTimeout(() => setIsLayoutAnimating(false), 500);
    }, [getGridLayout, getClusterLayout, getRowsLayout]);

    useEffect(() => {
        if (keepers.length > 0 && animals.length > 0 && Object.keys(keeperPositions).length === 0) {
            const layout = getGridLayout();
            setKeeperPositions(layout.keeperPos);
            setAnimalPositions(layout.animalPos);
        }
    }, [keepers, animals, getGridLayout]);

    useEffect(() => {
        const legendBounds = { x: 0, y: 0, width: 200, height: 220 };
        let nearbyCard = false;

        for (const pos of Object.values(keeperPositions)) {
            if (pos.x < legendBounds.width + 50 && pos.y < legendBounds.height + 50) {
                nearbyCard = true;
                break;
            }
        }

        setLegendOpacity(nearbyCard ? 0.15 : 1);
    }, [keeperPositions]);

    const handleCardMouseEnter = useCallback((type: 'keeper' | 'animal', id: number) => {
        if (hoverTimeout) clearTimeout(hoverTimeout);

        const timeout = setTimeout(() => {
            setHoveredCard({ type, id });
        }, 200);

        setHoverTimeout(timeout);
    }, [hoverTimeout]);

    const handleCardMouseLeave = useCallback(() => {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        setHoverTimeout(null);
        setHoveredCard(null);
    }, [hoverTimeout]);

    const handleCardMouseDown = useCallback((e: React.MouseEvent, type: 'keeper' | 'animal', id: number) => {
        e.preventDefault();
        e.stopPropagation();

        if (hoverTimeout) clearTimeout(hoverTimeout);
        setHoveredCard(null);

        setIsDragging(true);

        const rect = (e.target as HTMLElement).closest('.draggable-card')?.getBoundingClientRect();
        if (rect) {
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        }
        setDraggedItem({ type, id });
    }, [hoverTimeout]);

    const handleBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.draggable-card')) return;

        e.preventDefault();
        setIsDragging(true);
        setIsPanning(true);
        setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }, [panOffset]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (draggedItem && innerCanvasRef.current) {
            e.preventDefault();
            const canvasRect = innerCanvasRef.current.getBoundingClientRect();
            const newX = (e.clientX - canvasRect.left - dragOffset.x) / scale;
            const newY = (e.clientY - canvasRect.top - dragOffset.y) / scale;

            if (draggedItem.type === 'keeper') {
                setKeeperPositions(prev => ({
                    ...prev,
                    [draggedItem.id]: { x: Math.max(0, newX), y: Math.max(0, newY) },
                }));
            } else {
                setAnimalPositions(prev => ({
                    ...prev,
                    [draggedItem.id]: { x: Math.max(0, newX), y: Math.max(0, newY) },
                }));

                const animalPos = { x: newX, y: newY };
                let foundTarget = false;
                for (const [keeperId, keeperPos] of Object.entries(keeperPositions)) {
                    if (
                        animalPos.x > keeperPos.x - 50 &&
                        animalPos.x < keeperPos.x + KEEPER_CARD_WIDTH + 50 &&
                        animalPos.y > keeperPos.y - 50 &&
                        animalPos.y < keeperPos.y + KEEPER_CARD_HEIGHT + 50
                    ) {
                        setDropTargetKeeper(parseInt(keeperId));
                        foundTarget = true;
                        break;
                    }
                }
                if (!foundTarget) setDropTargetKeeper(null);
            }
            return;
        }

        if (isPanning) {
            e.preventDefault();
            setPanOffset({
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y,
            });
        }
    }, [draggedItem, dragOffset, scale, keeperPositions, isPanning, panStart]);

    const handleMouseUp = useCallback(async () => {
        const wasAnimalDrag = draggedItem?.type === 'animal';
        const draggedAnimalId = draggedItem?.id;
        const targetKeeper = dropTargetKeeper;

        if (wasAnimalDrag && targetKeeper !== null && draggedAnimalId !== undefined) {
            await handleCreateAssignment(targetKeeper, draggedAnimalId);
            if (layoutMode === 'grid') {
                const layout = getGridLayout();
                setAnimalPositions(prev => ({
                    ...prev,
                    [draggedAnimalId]: layout.animalPos[draggedAnimalId],
                }));
            }
        }

        setDraggedItem(null);
        setDropTargetKeeper(null);
        setIsPanning(false);
        setIsDragging(false);
    }, [draggedItem, dropTargetKeeper, layoutMode, getGridLayout]);

    const handleCreateAssignment = async (keeperId: number, animalId: number) => {
        const exists = assignments.some(a => a.keeper_id === keeperId && a.animal_id === animalId);
        if (exists) return;

        setIsCreatingAssignment(true);
        try {
            await assignmentService.create({ keeper_id: keeperId, animal_id: animalId });
            onAssignmentCreated();
        } catch (error) {
            console.error('Failed to create assignment:', error);
        } finally {
            setIsCreatingAssignment(false);
        }
    };

    const handleDeleteAssignment = async (assignmentId: number) => {
        try {
            await assignmentService.delete(assignmentId);
            onAssignmentDeleted();
        } catch (error) {
            console.error('Failed to delete assignment:', error);
        }
    };

    const zoomIn = () => setScale(prev => Math.min(prev + 0.15, 1.5));
    const zoomOut = () => setScale(prev => Math.max(prev - 0.15, 0.25));
    const resetView = () => {
        setScale(0.65);
        setPanOffset({ x: 0, y: 0 });
    };

    const toggleFullscreen = () => setIsFullscreen(prev => !prev);

    const getCardCenter = (type: 'keeper' | 'animal', id: number): { x: number; y: number } => {
        const positions = type === 'keeper' ? keeperPositions : animalPositions;
        const pos = positions[id];
        if (!pos) return { x: 0, y: 0 };
        const cardWidth = type === 'keeper' ? KEEPER_CARD_WIDTH : ANIMAL_CARD_WIDTH;
        const cardHeight = type === 'keeper' ? KEEPER_CARD_HEIGHT : ANIMAL_CARD_HEIGHT;
        return {
            x: pos.x + cardWidth / 2,
            y: pos.y + cardHeight / 2,
        };
    };

    const getHealthColor = (status: string | undefined) => {
        switch (status) {
            case 'excellent': return 'bg-emerald-500 text-white';
            case 'good': return 'bg-sky-500 text-white';
            case 'fair': return 'bg-amber-500 text-white';
            case 'poor': return 'bg-orange-500 text-white';
            case 'critical': return 'bg-rose-500 text-white';
            default: return 'bg-slate-400 text-white';
        }
    };

    // The map content (used both inline and in portal)
    const mapContent = (
        <div
            ref={containerRef}
            className={`relative bg-gradient-to-br from-slate-100 via-slate-50 to-white overflow-hidden shadow-inner ${isFullscreen
                ? 'fixed inset-0 z-[99999] rounded-none bg-white'
                : 'w-full h-[700px] rounded-xl border border-slate-200'
                }`}
            style={{
                userSelect: isDragging ? 'none' : 'auto',
                WebkitUserSelect: isDragging ? 'none' : 'auto',
            }}
        >
            <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, #64748b 1px, transparent 0)`,
                backgroundSize: '24px 24px'
            }} />

            {/* Top right controls */}
            <div className="absolute top-4 right-4 z-30 flex gap-2">
                {/* Image toggle */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowImages(prev => !prev)}
                    title={showImages ? "Hide Images" : "Show Images"}
                    className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 hover:bg-slate-100"
                >
                    {showImages ? <Image className="h-4 w-4" /> : <ImageOff className="h-4 w-4" />}
                </Button>

                {/* Fullscreen toggle */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen"}
                    className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 hover:bg-slate-100"
                >
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>

                {/* Zoom controls */}
                <div className="flex gap-1 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 p-1.5">
                    <Button variant="ghost" size="sm" onClick={zoomOut} title="Zoom Out" className="rounded-lg hover:bg-slate-100">
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="flex items-center text-sm text-slate-600 px-2 font-medium min-w-[50px] justify-center">
                        {Math.round(scale * 100)}%
                    </span>
                    <Button variant="ghost" size="sm" onClick={zoomIn} title="Zoom In" className="rounded-lg hover:bg-slate-100">
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                    <div className="w-px bg-slate-200 mx-1" />
                    <Button variant="ghost" size="sm" onClick={resetView} title="Reset View" className="rounded-lg hover:bg-slate-100">
                        <RotateCcw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Layout buttons */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex gap-1 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 p-1.5">
                <Button
                    variant={layoutMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => applyLayout('grid')}
                    title="Grid Layout"
                    className={`rounded-lg ${layoutMode === 'grid' ? '' : 'hover:bg-slate-100'}`}
                >
                    <LayoutGrid className="h-4 w-4 mr-1.5" />
                    Grid
                </Button>
                <Button
                    variant={layoutMode === 'cluster' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => applyLayout('cluster')}
                    title="Cluster Around Keepers"
                    className={`rounded-lg ${layoutMode === 'cluster' ? '' : 'hover:bg-slate-100'}`}
                >
                    <GitBranch className="h-4 w-4 mr-1.5" />
                    Cluster
                </Button>
                <Button
                    variant={layoutMode === 'rows' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => applyLayout('rows')}
                    title="Rows by Keeper"
                    className={`rounded-lg ${layoutMode === 'rows' ? '' : 'hover:bg-slate-100'}`}
                >
                    <Rows3 className="h-4 w-4 mr-1.5" />
                    Rows
                </Button>
            </div>

            {/* Legend */}
            <div
                className="absolute top-4 left-4 z-30 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 p-4 transition-opacity duration-300"
                style={{ opacity: legendOpacity }}
            >
                <h4 className="text-xs font-semibold text-slate-700 mb-3 uppercase tracking-wide">Legend</h4>
                <div className="space-y-2.5">
                    <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm" />
                        <span className="text-sm text-slate-600">Keepers / Vets</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 shadow-sm" />
                        <span className="text-sm text-slate-600">Animals</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-0.5 bg-gradient-to-r from-emerald-500 to-violet-500 rounded" />
                        <span className="text-sm text-slate-600">Assignment</span>
                    </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-200">
                    <p className="text-xs text-slate-500">Hover to highlight</p>
                </div>
            </div>

            {/* Canvas */}
            <div
                ref={canvasRef}
                className={`w-full h-full overflow-hidden ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
                onMouseDown={handleBackgroundMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <div
                    ref={innerCanvasRef}
                    style={{
                        transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
                        transformOrigin: 'top left',
                        width: canvasSize.width,
                        height: canvasSize.height,
                        position: 'relative'
                    }}
                >
                    {/* SVG connections - z-index higher when highlighting */}
                    <svg
                        className="absolute pointer-events-none"
                        style={{
                            zIndex: hoveredCard ? 200 : 5,
                            width: canvasSize.width,
                            height: canvasSize.height,
                            overflow: 'visible'
                        }}
                    >
                        <defs>
                            <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#10b981" />
                                <stop offset="100%" stopColor="#8b5cf6" />
                            </linearGradient>
                            <linearGradient id="highlightGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#f59e0b" />
                                <stop offset="100%" stopColor="#ef4444" />
                            </linearGradient>
                            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                            <filter id="highlightGlow" x="-50%" y="-50%" width="200%" height="200%">
                                <feGaussianBlur stdDeviation="5" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>

                        {/* Non-highlighted connections */}
                        {assignments.filter(a => !isConnectionHighlighted(a)).map((assignment) => {
                            const keeperCenter = getCardCenter('keeper', assignment.keeper_id);
                            const animalCenter = getCardCenter('animal', assignment.animal_id);
                            const isHovered = hoveredConnection === assignment.assignment_id;

                            const midX = (keeperCenter.x + animalCenter.x) / 2;
                            const midY = (keeperCenter.y + animalCenter.y) / 2;
                            const dx = animalCenter.x - keeperCenter.x;
                            const controlOffset = Math.min(Math.abs(dx) * 0.3, 80);

                            return (
                                <g key={assignment.assignment_id}>
                                    {isHovered && (
                                        <path
                                            d={`M ${keeperCenter.x} ${keeperCenter.y} 
                          C ${keeperCenter.x + controlOffset} ${keeperCenter.y},
                            ${animalCenter.x - controlOffset} ${animalCenter.y},
                            ${animalCenter.x} ${animalCenter.y}`}
                                            fill="none"
                                            stroke="#ef4444"
                                            strokeWidth={8}
                                            strokeOpacity={0.3}
                                            filter="url(#glow)"
                                        />
                                    )}
                                    <path
                                        d={`M ${keeperCenter.x} ${keeperCenter.y} 
                        C ${keeperCenter.x + controlOffset} ${keeperCenter.y},
                          ${animalCenter.x - controlOffset} ${animalCenter.y},
                          ${animalCenter.x} ${animalCenter.y}`}
                                        fill="none"
                                        stroke={isHovered ? "#ef4444" : "url(#connectionGradient)"}
                                        strokeWidth={isHovered ? 3 : 2.5}
                                        strokeLinecap="round"
                                        strokeOpacity={hoveredCard ? 0.3 : 1}
                                    />
                                    <g
                                        style={{
                                            pointerEvents: isDragging ? 'none' : 'auto',
                                            opacity: isDragging ? 0 : 1,
                                            transition: 'opacity 0.2s'
                                        }}
                                    >
                                        <circle
                                            cx={midX}
                                            cy={midY}
                                            r="14"
                                            fill={isHovered ? "#ef4444" : "white"}
                                            stroke={isHovered ? "#dc2626" : "#e2e8f0"}
                                            strokeWidth="2"
                                            className="cursor-pointer transition-all duration-200 hover:fill-red-500 hover:stroke-red-600"
                                            onMouseEnter={() => setHoveredConnection(assignment.assignment_id)}
                                            onMouseLeave={() => setHoveredConnection(null)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteAssignment(assignment.assignment_id);
                                            }}
                                            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
                                        />
                                        <text
                                            x={midX}
                                            y={midY + 5}
                                            textAnchor="middle"
                                            fontSize="16"
                                            fontWeight="bold"
                                            fill={isHovered ? "white" : "#94a3b8"}
                                            className="pointer-events-none select-none"
                                        >
                                            ×
                                        </text>
                                    </g>
                                </g>
                            );
                        })}

                        {/* Highlighted connections */}
                        {assignments.filter(a => isConnectionHighlighted(a)).map((assignment) => {
                            const keeperCenter = getCardCenter('keeper', assignment.keeper_id);
                            const animalCenter = getCardCenter('animal', assignment.animal_id);

                            const midX = (keeperCenter.x + animalCenter.x) / 2;
                            const midY = (keeperCenter.y + animalCenter.y) / 2;
                            const dx = animalCenter.x - keeperCenter.x;
                            const controlOffset = Math.min(Math.abs(dx) * 0.3, 80);

                            return (
                                <g key={`highlighted-${assignment.assignment_id}`}>
                                    <path
                                        d={`M ${keeperCenter.x} ${keeperCenter.y} 
                        C ${keeperCenter.x + controlOffset} ${keeperCenter.y},
                          ${animalCenter.x - controlOffset} ${animalCenter.y},
                          ${animalCenter.x} ${animalCenter.y}`}
                                        fill="none"
                                        stroke="url(#highlightGradient)"
                                        strokeWidth={10}
                                        strokeOpacity={0.4}
                                        filter="url(#highlightGlow)"
                                    />
                                    <path
                                        d={`M ${keeperCenter.x} ${keeperCenter.y} 
                        C ${keeperCenter.x + controlOffset} ${keeperCenter.y},
                          ${animalCenter.x - controlOffset} ${animalCenter.y},
                          ${animalCenter.x} ${animalCenter.y}`}
                                        fill="none"
                                        stroke="url(#highlightGradient)"
                                        strokeWidth={4}
                                        strokeLinecap="round"
                                    />
                                    <g
                                        style={{
                                            pointerEvents: isDragging ? 'none' : 'auto',
                                            opacity: isDragging ? 0 : 1,
                                            transition: 'opacity 0.2s'
                                        }}
                                    >
                                        <circle
                                            cx={midX}
                                            cy={midY}
                                            r="14"
                                            fill="#f59e0b"
                                            stroke="#d97706"
                                            strokeWidth="2"
                                            className="cursor-pointer transition-all duration-200 hover:fill-red-500 hover:stroke-red-600"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteAssignment(assignment.assignment_id);
                                            }}
                                            style={{ filter: 'drop-shadow(0 2px 8px rgba(245,158,11,0.5))' }}
                                        />
                                        <text
                                            x={midX}
                                            y={midY + 5}
                                            textAnchor="middle"
                                            fontSize="16"
                                            fontWeight="bold"
                                            fill="white"
                                            className="pointer-events-none select-none"
                                        >
                                            ×
                                        </text>
                                    </g>
                                </g>
                            );
                        })}
                    </svg>

                    {/* Keeper cards */}
                    {keepers.map((keeper) => {
                        const pos = keeperPositions[keeper.employee_id] || { x: 100, y: 140 };
                        const assignedAnimals = assignments.filter(a => a.keeper_id === keeper.employee_id);
                        const isDropTarget = dropTargetKeeper === keeper.employee_id;
                        const isHighlighted = hoveredCard?.type === 'keeper' && hoveredCard.id === keeper.employee_id;
                        const hasHighlightedConnection = hoveredCard?.type === 'animal' &&
                            assignments.some(a => a.animal_id === hoveredCard.id && a.keeper_id === keeper.employee_id);

                        return (
                            <div
                                key={keeper.employee_id}
                                className={`draggable-card absolute rounded-2xl p-4 cursor-grab active:cursor-grabbing select-none ${isDropTarget
                                    ? 'ring-4 ring-violet-400 ring-offset-2 scale-105 shadow-2xl'
                                    : isHighlighted || hasHighlightedConnection
                                        ? 'ring-2 ring-amber-400 shadow-2xl'
                                        : 'shadow-lg hover:shadow-xl'
                                    }`}
                                style={{
                                    left: pos.x,
                                    top: pos.y,
                                    width: KEEPER_CARD_WIDTH,
                                    zIndex: isHighlighted || hasHighlightedConnection ? 50 :
                                        draggedItem?.type === 'keeper' && draggedItem.id === keeper.employee_id ? 100 : 10,
                                    background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
                                    border: isDropTarget ? '2px solid #8b5cf6' :
                                        isHighlighted || hasHighlightedConnection ? '2px solid #f59e0b' : '2px solid #10b981',
                                    transition: isLayoutAnimating
                                        ? 'left 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s, transform 0.2s'
                                        : 'box-shadow 0.2s, transform 0.2s',
                                }}
                                onMouseDown={(e) => handleCardMouseDown(e, 'keeper', keeper.employee_id)}
                                onMouseEnter={() => handleCardMouseEnter('keeper', keeper.employee_id)}
                                onMouseLeave={handleCardMouseLeave}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg">
                                        <User className="h-6 w-6 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-800 truncate">{keeper.first_name} {keeper.last_name}</p>
                                        <p className="text-sm text-slate-500 capitalize">{keeper.job_role}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-emerald-100">
                                    <span className="text-sm text-slate-600 font-medium">
                                        {assignedAnimals.length} animal{assignedAnimals.length !== 1 ? 's' : ''}
                                    </span>
                                    {keeper.job_role === 'veterinarian' && (
                                        <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200">Vet</Badge>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Animal cards - image on left, fading to white on right */}
                    {animals.map((animal) => {
                        const pos = animalPositions[animal.animal_id] || { x: 550, y: 120 };
                        const isAssigned = assignments.some(a => a.animal_id === animal.animal_id);
                        const isDraggingThis = draggedItem?.type === 'animal' && draggedItem.id === animal.animal_id;
                        const isHighlighted = hoveredCard?.type === 'animal' && hoveredCard.id === animal.animal_id;
                        const hasHighlightedConnection = hoveredCard?.type === 'keeper' &&
                            assignments.some(a => a.keeper_id === hoveredCard.id && a.animal_id === animal.animal_id);

                        return (
                            <div
                                key={animal.animal_id}
                                className={`draggable-card absolute rounded-2xl cursor-grab active:cursor-grabbing select-none overflow-hidden bg-white ${isDraggingThis ? 'scale-105 shadow-2xl rotate-1' :
                                    isHighlighted || hasHighlightedConnection ? 'ring-2 ring-amber-400 shadow-2xl' :
                                        'hover:shadow-xl'
                                    } ${isAssigned ? 'shadow-lg' : 'shadow-md'}`}
                                style={{
                                    left: pos.x,
                                    top: pos.y,
                                    width: ANIMAL_CARD_WIDTH,
                                    height: ANIMAL_CARD_HEIGHT,
                                    zIndex: isDraggingThis ? 100 :
                                        isHighlighted || hasHighlightedConnection ? 50 : 10,
                                    border: isHighlighted || hasHighlightedConnection ? '3px solid #f59e0b' :
                                        isAssigned ? '3px solid #8b5cf6' : '3px dashed #cbd5e1',
                                    transition: isLayoutAnimating
                                        ? 'left 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.2s, box-shadow 0.2s'
                                        : isDraggingThis
                                            ? 'transform 0.1s, box-shadow 0.1s'
                                            : 'transform 0.2s, box-shadow 0.2s',
                                }}
                                onMouseDown={(e) => handleCardMouseDown(e, 'animal', animal.animal_id)}
                                onMouseEnter={() => handleCardMouseEnter('animal', animal.animal_id)}
                                onMouseLeave={handleCardMouseLeave}
                            >
                                <div className="flex h-full">
                                    {/* Left side - Image with fade */}
                                    {showImages && (
                                        <div className="relative w-24 h-full flex-shrink-0">
                                            {animal.image_url ? (
                                                <img
                                                    src={animal.image_url}
                                                    alt={animal.name}
                                                    className="w-full h-full object-cover pointer-events-none"
                                                    draggable={false}
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-violet-200 via-purple-200 to-fuchsia-200 flex items-center justify-center">
                                                    <Leaf className="h-10 w-10 text-violet-400/60" />
                                                </div>
                                            )}
                                            {/* Fade gradient from image to white */}
                                            <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-r from-transparent to-white" />
                                        </div>
                                    )}

                                    {/* Right side - Text content on white */}
                                    <div className={`flex-1 p-3 flex flex-col justify-between ${!showImages ? 'pl-4' : ''}`}>
                                        <div>
                                            <p className="font-bold text-slate-800 text-base leading-tight truncate">
                                                {animal.name}
                                            </p>
                                            <p className="text-slate-500 text-sm truncate mt-0.5">
                                                {animal.species}
                                            </p>
                                        </div>
                                        <div className="flex items-center justify-between mt-2">
                                            <Badge
                                                className={`text-xs ${getHealthColor(animal.health_status)}`}
                                            >
                                                {animal.health_status || 'Unknown'}
                                            </Badge>
                                            {!isAssigned && (
                                                <span className="text-xs text-slate-400 italic">Unassigned</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {isCreatingAssignment && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl p-6 flex items-center gap-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent" />
                        <span className="text-slate-700 font-medium">Creating assignment...</span>
                    </div>
                </div>
            )}

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 px-5 py-3 text-sm text-slate-600 flex items-center gap-3 z-20">
                <Move className="h-4 w-4 text-slate-400" />
                <span>
                    <strong>Drag</strong> to pan • <strong>Drag</strong> animals onto keepers • <strong>Hover</strong> to highlight
                    {isFullscreen && <span className="ml-2 text-slate-400">• Press <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">Esc</kbd> to exit</span>}
                </span>
            </div>
        </div>
    );

    // When fullscreen, show placeholder in original location and render content via portal
    if (isFullscreen && mounted && typeof document !== 'undefined') {
        return (
            <>
                {/* Placeholder in original location */}
                <div className="w-full h-[700px] rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center">
                    <div className="text-slate-500">
                        <Maximize2 className="h-8 w-8 mx-auto mb-2" />
                        <p className="text-sm">Viewing in fullscreen mode</p>
                        <button
                            onClick={toggleFullscreen}
                            className="mt-2 text-xs text-slate-600 underline hover:text-slate-800"
                        >
                            Exit fullscreen
                        </button>
                    </div>
                </div>
                {/* Portal to document.body with backdrop */}
                {createPortal(
                    <div className="fixed inset-0" style={{ zIndex: 999999 }}>
                        {/* Dark backdrop */}
                        <div className="absolute inset-0 bg-black/50" onClick={toggleFullscreen} />
                        {/* Map content */}
                        <div className="absolute inset-4 bg-gradient-to-br from-slate-100 via-slate-50 to-white rounded-xl overflow-hidden shadow-2xl">
                            {mapContent}
                        </div>
                    </div>,
                    document.body
                )}
            </>
        );
    }

    return mapContent;
}
