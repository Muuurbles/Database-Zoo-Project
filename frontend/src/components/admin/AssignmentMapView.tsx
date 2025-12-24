"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Animal, Employee } from '@/types';
import { ZookeeperAssignmentWithDetails, assignmentService } from '@/services/assignment.service';
import { User, Leaf, ZoomIn, ZoomOut, RotateCcw, Move, Maximize2, Minimize2 } from 'lucide-react';

interface CardPosition {
    x: number;
    y: number;
}

interface Props {
    animals: Animal[];
    keepers: Employee[];
    assignments: ZookeeperAssignmentWithDetails[];
    onAssignmentCreated: () => void;
    onAssignmentDeleted: () => void;
}

const KEEPER_CARD_WIDTH = 200;
const KEEPER_CARD_HEIGHT = 90;
const ANIMAL_CARD_WIDTH = 150;
const ANIMAL_CARD_HEIGHT = 100;
const GRID_GAP = 20;

export function AssignmentMapView({
    animals,
    keepers,
    assignments,
    onAssignmentCreated,
    onAssignmentDeleted
}: Props) {
    // Card positions
    const [keeperPositions, setKeeperPositions] = useState<Record<number, CardPosition>>({});
    const [animalPositions, setAnimalPositions] = useState<Record<number, CardPosition>>({});

    // Original positions for snap-back
    const [originalPositions, setOriginalPositions] = useState<Record<number, CardPosition>>({});

    // Animating cards for snap-back
    const [animatingCards, setAnimatingCards] = useState<Set<number>>(new Set());

    // Drag state for cards
    const [draggedItem, setDraggedItem] = useState<{ type: 'keeper' | 'animal'; id: number } | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    // Pan state for canvas
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

    const [scale, setScale] = useState(0.8);
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const innerCanvasRef = useRef<HTMLDivElement>(null);
    const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
    const [hoveredConnection, setHoveredConnection] = useState<number | null>(null);
    const [dropTargetKeeper, setDropTargetKeeper] = useState<number | null>(null);
    const [legendOpacity, setLegendOpacity] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Track if we're actively dragging (for text selection prevention)
    const [isDragging, setIsDragging] = useState(false);

    // Calculate canvas dimensions based on content
    const canvasSize = useMemo(() => {
        const allPositions = [...Object.values(keeperPositions), ...Object.values(animalPositions)];
        if (allPositions.length === 0) return { width: 1800, height: 1200 };

        const maxX = Math.max(...allPositions.map(p => p.x)) + 300;
        const maxY = Math.max(...allPositions.map(p => p.y)) + 200;
        return {
            width: Math.max(1800, maxX),
            height: Math.max(1200, maxY)
        };
    }, [keeperPositions, animalPositions]);

    // Calculate original positions for animals (for snap-back)
    const getOriginalAnimalPosition = useCallback((animalId: number, index: number): CardPosition => {
        const startX = 450;
        const columns = 4;
        const col = index % columns;
        const row = Math.floor(index / columns);
        return {
            x: startX + col * (ANIMAL_CARD_WIDTH + GRID_GAP),
            y: 80 + row * (ANIMAL_CARD_HEIGHT + GRID_GAP),
        };
    }, []);

    // Initialize keeper positions (left column)
    useEffect(() => {
        if (keepers.length > 0 && Object.keys(keeperPositions).length === 0) {
            const newPositions: Record<number, CardPosition> = {};
            keepers.forEach((keeper, index) => {
                newPositions[keeper.employee_id] = {
                    x: 80,
                    y: 100 + index * (KEEPER_CARD_HEIGHT + GRID_GAP),
                };
            });
            setKeeperPositions(newPositions);
        }
    }, [keepers]);

    // Initialize animal positions in a multi-column grid and store originals
    useEffect(() => {
        if (animals.length > 0 && Object.keys(animalPositions).length === 0) {
            const newPositions: Record<number, CardPosition> = {};
            const originals: Record<number, CardPosition> = {};

            animals.forEach((animal, index) => {
                const pos = getOriginalAnimalPosition(animal.animal_id, index);
                newPositions[animal.animal_id] = pos;
                originals[animal.animal_id] = pos;
            });
            setAnimalPositions(newPositions);
            setOriginalPositions(originals);
        }
    }, [animals, getOriginalAnimalPosition]);

    // Check if legend should fade based on nearby cards
    useEffect(() => {
        const legendBounds = { x: 0, y: 0, width: 180, height: 120 };
        let nearbyCard = false;

        for (const pos of Object.values(keeperPositions)) {
            if (pos.x < legendBounds.width + 50 && pos.y < legendBounds.height + 50) {
                nearbyCard = true;
                break;
            }
        }

        setLegendOpacity(nearbyCard ? 0.15 : 1);
    }, [keeperPositions]);

    // Animate card back to original position
    const animateSnapBack = useCallback((animalId: number) => {
        const originalPos = originalPositions[animalId];
        if (!originalPos) return;

        // Add to animating set
        setAnimatingCards(prev => new Set([...prev, animalId]));

        // Set position back (CSS transition will animate it)
        setAnimalPositions(prev => ({
            ...prev,
            [animalId]: originalPos,
        }));

        // Remove from animating set after animation completes
        setTimeout(() => {
            setAnimatingCards(prev => {
                const next = new Set(prev);
                next.delete(animalId);
                return next;
            });
        }, 400);
    }, [originalPositions]);

    // Handle card dragging
    const handleCardMouseDown = useCallback((e: React.MouseEvent, type: 'keeper' | 'animal', id: number) => {
        e.preventDefault();
        e.stopPropagation();

        setIsDragging(true);

        const rect = (e.target as HTMLElement).closest('.draggable-card')?.getBoundingClientRect();
        if (rect) {
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        }
        setDraggedItem({ type, id });
    }, []);

    // Handle background panning
    const handleBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
        // Only start panning if clicking on the background (not on a card)
        if ((e.target as HTMLElement).closest('.draggable-card')) return;

        e.preventDefault();
        setIsDragging(true);
        setIsPanning(true);
        setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }, [panOffset]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        // Handle card dragging
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

                // Check if hovering over a keeper for drop target highlighting
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

        // Handle canvas panning
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

        // Check for drop on keeper and create assignment
        if (wasAnimalDrag && targetKeeper !== null && draggedAnimalId !== undefined) {
            await handleCreateAssignment(targetKeeper, draggedAnimalId);
        }

        // Animate snap-back for animal cards after dropping
        if (wasAnimalDrag && draggedAnimalId !== undefined) {
            animateSnapBack(draggedAnimalId);
        }

        setDraggedItem(null);
        setDropTargetKeeper(null);
        setIsPanning(false);
        setIsDragging(false);
    }, [draggedItem, dropTargetKeeper, animateSnapBack]);

    // Create assignment
    const handleCreateAssignment = async (keeperId: number, animalId: number) => {
        // Check if assignment already exists
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

    // Delete assignment
    const handleDeleteAssignment = async (assignmentId: number) => {
        try {
            await assignmentService.delete(assignmentId);
            onAssignmentDeleted();
        } catch (error) {
            console.error('Failed to delete assignment:', error);
        }
    };

    // Zoom controls
    const zoomIn = () => setScale(prev => Math.min(prev + 0.15, 1.5));
    const zoomOut = () => setScale(prev => Math.max(prev - 0.15, 0.3));
    const resetView = () => {
        setScale(0.8);
        setPanOffset({ x: 0, y: 0 });
    };

    // Fullscreen toggle
    const toggleFullscreen = () => setIsFullscreen(prev => !prev);

    // Get center position of a card for drawing connections
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

    // Get health status color
    const getHealthColor = (status: string | undefined) => {
        switch (status) {
            case 'excellent': return 'bg-emerald-100 text-emerald-700 border-emerald-300';
            case 'good': return 'bg-sky-100 text-sky-700 border-sky-300';
            case 'fair': return 'bg-amber-100 text-amber-700 border-amber-300';
            case 'poor': return 'bg-orange-100 text-orange-700 border-orange-300';
            case 'critical': return 'bg-rose-100 text-rose-700 border-rose-300';
            default: return 'bg-slate-100 text-slate-600 border-slate-300';
        }
    };

    return (
        <div
            ref={containerRef}
            className={`relative bg-gradient-to-br from-slate-100 via-slate-50 to-white rounded-xl border border-slate-200 overflow-hidden shadow-inner transition-all duration-300 ${isFullscreen
                    ? 'fixed inset-4 z-50 h-auto'
                    : 'w-full h-[700px]'
                }`}
            style={{
                userSelect: isDragging ? 'none' : 'auto',
                WebkitUserSelect: isDragging ? 'none' : 'auto',
            }}
        >
            {/* Fullscreen backdrop */}
            {isFullscreen && (
                <div
                    className="fixed inset-0 bg-black/20 backdrop-blur-sm -z-10"
                    onClick={toggleFullscreen}
                />
            )}

            {/* Decorative background pattern */}
            <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, #64748b 1px, transparent 0)`,
                backgroundSize: '24px 24px'
            }} />

            {/* Control bar */}
            <div className="absolute top-4 right-4 z-30 flex gap-2">
                {/* Fullscreen toggle */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
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

            {/* Legend - fades when cards nearby */}
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
            </div>

            {/* Canvas with panning */}
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
                    {/* SVG layer for connection lines */}
                    <svg
                        className="absolute pointer-events-none"
                        style={{
                            zIndex: 5,
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
                            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>
                        {assignments.map((assignment) => {
                            const keeperCenter = getCardCenter('keeper', assignment.keeper_id);
                            const animalCenter = getCardCenter('animal', assignment.animal_id);
                            const isHovered = hoveredConnection === assignment.assignment_id;

                            // Calculate control point for smooth bezier curve
                            const midX = (keeperCenter.x + animalCenter.x) / 2;
                            const midY = (keeperCenter.y + animalCenter.y) / 2;
                            const dx = animalCenter.x - keeperCenter.x;
                            const controlOffset = Math.min(Math.abs(dx) * 0.3, 80);

                            return (
                                <g key={assignment.assignment_id}>
                                    {/* Glow effect on hover */}
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
                                    {/* Main connection line */}
                                    <path
                                        d={`M ${keeperCenter.x} ${keeperCenter.y} 
                        C ${keeperCenter.x + controlOffset} ${keeperCenter.y},
                          ${animalCenter.x - controlOffset} ${animalCenter.y},
                          ${animalCenter.x} ${animalCenter.y}`}
                                        fill="none"
                                        stroke={isHovered ? "#ef4444" : "url(#connectionGradient)"}
                                        strokeWidth={isHovered ? 3 : 2.5}
                                        strokeLinecap="round"
                                        className="transition-all duration-200"
                                    />
                                    {/* Delete button on connection */}
                                    <g style={{ pointerEvents: 'auto' }}>
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
                    </svg>

                    {/* Keeper cards */}
                    {keepers.map((keeper) => {
                        const pos = keeperPositions[keeper.employee_id] || { x: 80, y: 100 };
                        const assignedAnimals = assignments.filter(a => a.keeper_id === keeper.employee_id);
                        const isDropTarget = dropTargetKeeper === keeper.employee_id;

                        return (
                            <div
                                key={keeper.employee_id}
                                className={`draggable-card absolute rounded-xl p-4 cursor-grab active:cursor-grabbing select-none ${isDropTarget
                                        ? 'ring-4 ring-violet-400 ring-offset-2 scale-105 shadow-2xl'
                                        : 'shadow-lg hover:shadow-xl'
                                    }`}
                                style={{
                                    left: pos.x,
                                    top: pos.y,
                                    width: KEEPER_CARD_WIDTH,
                                    zIndex: draggedItem?.type === 'keeper' && draggedItem.id === keeper.employee_id ? 100 : 10,
                                    background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
                                    border: isDropTarget ? '2px solid #8b5cf6' : '2px solid #10b981',
                                    transition: 'box-shadow 0.2s, transform 0.2s, border-color 0.2s',
                                }}
                                onMouseDown={(e) => handleCardMouseDown(e, 'keeper', keeper.employee_id)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md">
                                        <User className="h-5 w-5 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-slate-800 truncate">{keeper.first_name} {keeper.last_name}</p>
                                        <p className="text-xs text-slate-500 capitalize">{keeper.job_role}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-3 pt-2 border-t border-emerald-100">
                                    <span className="text-xs text-slate-600 font-medium">
                                        {assignedAnimals.length} animal{assignedAnimals.length !== 1 ? 's' : ''}
                                    </span>
                                    {keeper.job_role === 'veterinarian' && (
                                        <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200">Vet</Badge>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Animal cards */}
                    {animals.map((animal) => {
                        const pos = animalPositions[animal.animal_id] || { x: 450, y: 80 };
                        const isAssigned = assignments.some(a => a.animal_id === animal.animal_id);
                        const isDraggingThis = draggedItem?.type === 'animal' && draggedItem.id === animal.animal_id;
                        const isAnimating = animatingCards.has(animal.animal_id);

                        return (
                            <div
                                key={animal.animal_id}
                                className={`draggable-card absolute rounded-xl p-3 cursor-grab active:cursor-grabbing select-none ${isDraggingThis ? 'scale-110 shadow-2xl rotate-2' : 'hover:shadow-xl'
                                    } ${isAssigned ? 'shadow-lg' : 'shadow-md'}`}
                                style={{
                                    left: pos.x,
                                    top: pos.y,
                                    width: ANIMAL_CARD_WIDTH,
                                    zIndex: isDraggingThis ? 100 : 10,
                                    background: isAssigned
                                        ? 'linear-gradient(135deg, #ffffff 0%, #f5f3ff 100%)'
                                        : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                                    border: isAssigned ? '2px solid #8b5cf6' : '2px dashed #cbd5e1',
                                    // Smooth bezier animation for snap-back
                                    transition: isAnimating
                                        ? 'left 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.2s, box-shadow 0.2s'
                                        : isDraggingThis
                                            ? 'transform 0.1s, box-shadow 0.1s'
                                            : 'transform 0.2s, box-shadow 0.2s',
                                }}
                                onMouseDown={(e) => handleCardMouseDown(e, 'animal', animal.animal_id)}
                            >
                                <div className="flex gap-3">
                                    {animal.image_url ? (
                                        <img
                                            src={animal.image_url}
                                            alt={animal.name}
                                            className="w-11 h-11 rounded-lg object-cover flex-shrink-0 shadow-sm pointer-events-none"
                                            draggable={false}
                                        />
                                    ) : (
                                        <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                                            <Leaf className="h-5 w-5 text-violet-500" />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm text-slate-800 truncate">{animal.name}</p>
                                        <p className="text-xs text-slate-500 truncate">{animal.species}</p>
                                    </div>
                                </div>
                                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                                    <Badge
                                        className={`text-xs border ${getHealthColor(animal.health_status)}`}
                                    >
                                        {animal.health_status || 'Unknown'}
                                    </Badge>
                                    {!isAssigned && (
                                        <span className="text-xs text-slate-400 italic">Unassigned</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Loading overlay */}
            {isCreatingAssignment && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl p-6 flex items-center gap-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent" />
                        <span className="text-slate-700 font-medium">Creating assignment...</span>
                    </div>
                </div>
            )}

            {/* Instructions */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 px-5 py-3 text-sm text-slate-600 flex items-center gap-3 z-20">
                <Move className="h-4 w-4 text-slate-400" />
                <span>
                    <strong>Drag</strong> background to pan • <strong>Drag</strong> animals onto keepers to assign • Click <strong>×</strong> to remove
                </span>
            </div>
        </div>
    );
}
