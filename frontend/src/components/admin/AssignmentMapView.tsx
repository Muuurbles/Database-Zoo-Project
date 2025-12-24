"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Animal, Employee } from '@/types';
import { ZookeeperAssignmentWithDetails, assignmentService } from '@/services/assignment.service';
import { User, Leaf, X, Link2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

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

export function AssignmentMapView({
    animals,
    keepers,
    assignments,
    onAssignmentCreated,
    onAssignmentDeleted
}: Props) {
    // Card positions - keepers on left, animals on right
    const [keeperPositions, setKeeperPositions] = useState<Record<number, CardPosition>>({});
    const [animalPositions, setAnimalPositions] = useState<Record<number, CardPosition>>({});
    const [draggedItem, setDraggedItem] = useState<{ type: 'keeper' | 'animal'; id: number } | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const canvasRef = useRef<HTMLDivElement>(null);
    const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
    const [hoveredConnection, setHoveredConnection] = useState<number | null>(null);

    // Initialize positions when data loads
    useEffect(() => {
        if (keepers.length > 0 && Object.keys(keeperPositions).length === 0) {
            const newPositions: Record<number, CardPosition> = {};
            keepers.forEach((keeper, index) => {
                newPositions[keeper.employee_id] = {
                    x: 50,
                    y: 50 + index * 120,
                };
            });
            setKeeperPositions(newPositions);
        }
    }, [keepers]);

    useEffect(() => {
        if (animals.length > 0 && Object.keys(animalPositions).length === 0) {
            const newPositions: Record<number, CardPosition> = {};
            animals.forEach((animal, index) => {
                newPositions[animal.animal_id] = {
                    x: 450,
                    y: 50 + index * 100,
                };
            });
            setAnimalPositions(newPositions);
        }
    }, [animals]);

    // Handle dragging
    const handleMouseDown = useCallback((e: React.MouseEvent, type: 'keeper' | 'animal', id: number) => {
        e.preventDefault();
        const rect = (e.target as HTMLElement).closest('.draggable-card')?.getBoundingClientRect();
        if (rect) {
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        }
        setDraggedItem({ type, id });
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!draggedItem || !canvasRef.current) return;

        const canvasRect = canvasRef.current.getBoundingClientRect();
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
        }
    }, [draggedItem, dragOffset, scale]);

    const handleMouseUp = useCallback(() => {
        setDraggedItem(null);
    }, []);

    // Create assignment by dropping animal on keeper
    const handleDrop = async (keeperId: number, animalId: number) => {
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
    const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 2));
    const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.4));
    const resetView = () => setScale(1);

    // Get center position of a card for drawing connections
    const getCardCenter = (type: 'keeper' | 'animal', id: number): { x: number; y: number } => {
        const positions = type === 'keeper' ? keeperPositions : animalPositions;
        const pos = positions[id];
        if (!pos) return { x: 0, y: 0 };
        const cardWidth = type === 'keeper' ? 180 : 160;
        const cardHeight = type === 'keeper' ? 60 : 80;
        return {
            x: pos.x + cardWidth / 2,
            y: pos.y + cardHeight / 2,
        };
    };

    // Get health status color
    const getHealthColor = (status: string | undefined) => {
        switch (status) {
            case 'excellent': return 'bg-green-100 text-green-700 border-green-300';
            case 'good': return 'bg-blue-100 text-blue-700 border-blue-300';
            case 'fair': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
            case 'poor': return 'bg-orange-100 text-orange-700 border-orange-300';
            case 'critical': return 'bg-red-100 text-red-700 border-red-300';
            default: return 'bg-gray-100 text-gray-700 border-gray-300';
        }
    };

    return (
        <div className="relative w-full h-[700px] bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200 overflow-hidden">
            {/* Zoom controls */}
            <div className="absolute top-4 right-4 z-20 flex gap-2 bg-white rounded-lg shadow-md p-2">
                <Button variant="ghost" size="sm" onClick={zoomOut} title="Zoom Out">
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="flex items-center text-sm text-gray-600 px-2">{Math.round(scale * 100)}%</span>
                <Button variant="ghost" size="sm" onClick={zoomIn} title="Zoom In">
                    <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={resetView} title="Reset View">
                    <RotateCcw className="h-4 w-4" />
                </Button>
            </div>

            {/* Legend */}
            <div className="absolute top-4 left-4 z-20 bg-white rounded-lg shadow-md p-3 text-xs">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded bg-dark_spring_green-500"></div>
                    <span>Keepers</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded bg-sea_green-500"></div>
                    <span>Animals</span>
                </div>
                <div className="flex items-center gap-2">
                    <Link2 className="h-3 w-3 text-gray-500" />
                    <span>Assignment</span>
                </div>
            </div>

            {/* Canvas */}
            <div
                ref={canvasRef}
                className="w-full h-full overflow-auto"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <div
                    style={{
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                        width: '1200px',
                        height: '900px',
                        position: 'relative'
                    }}
                >
                    {/* SVG layer for connection lines */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
                        <defs>
                            <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#047857" />
                                <stop offset="100%" stopColor="#059669" />
                            </linearGradient>
                        </defs>
                        {assignments.map((assignment) => {
                            const keeperCenter = getCardCenter('keeper', assignment.keeper_id);
                            const animalCenter = getCardCenter('animal', assignment.animal_id);
                            const isHovered = hoveredConnection === assignment.assignment_id;

                            // Calculate control points for curved line
                            const midX = (keeperCenter.x + animalCenter.x) / 2;
                            const curveOffset = 30;

                            return (
                                <g key={assignment.assignment_id}>
                                    <path
                                        d={`M ${keeperCenter.x} ${keeperCenter.y} 
                        Q ${midX} ${keeperCenter.y - curveOffset}, 
                          ${animalCenter.x} ${animalCenter.y}`}
                                        fill="none"
                                        stroke={isHovered ? "#ef4444" : "url(#connectionGradient)"}
                                        strokeWidth={isHovered ? 3 : 2}
                                        strokeDasharray={isHovered ? "5,5" : "none"}
                                        className="transition-all duration-200"
                                        style={{ pointerEvents: 'none' }}
                                    />
                                    {/* Delete button on connection */}
                                    <circle
                                        cx={midX}
                                        cy={(keeperCenter.y + animalCenter.y) / 2 - curveOffset / 2}
                                        r="12"
                                        fill={isHovered ? "#ef4444" : "#f8fafc"}
                                        stroke={isHovered ? "#ef4444" : "#e2e8f0"}
                                        strokeWidth="2"
                                        className="cursor-pointer transition-all duration-200 hover:fill-red-500 hover:stroke-red-500"
                                        style={{ pointerEvents: 'auto' }}
                                        onMouseEnter={() => setHoveredConnection(assignment.assignment_id)}
                                        onMouseLeave={() => setHoveredConnection(null)}
                                        onClick={() => handleDeleteAssignment(assignment.assignment_id)}
                                    />
                                    <text
                                        x={midX}
                                        y={(keeperCenter.y + animalCenter.y) / 2 - curveOffset / 2 + 4}
                                        textAnchor="middle"
                                        fontSize="14"
                                        fill={isHovered ? "white" : "#64748b"}
                                        className="pointer-events-none select-none"
                                    >
                                        ×
                                    </text>
                                </g>
                            );
                        })}
                    </svg>

                    {/* Keeper cards */}
                    {keepers.map((keeper) => {
                        const pos = keeperPositions[keeper.employee_id] || { x: 50, y: 50 };
                        const assignedAnimals = assignments.filter(a => a.keeper_id === keeper.employee_id);

                        return (
                            <div
                                key={keeper.employee_id}
                                className="draggable-card absolute bg-white rounded-lg shadow-lg border-2 border-dark_spring_green-500 p-3 cursor-grab active:cursor-grabbing transition-shadow hover:shadow-xl"
                                style={{
                                    left: pos.x,
                                    top: pos.y,
                                    width: '180px',
                                    zIndex: draggedItem?.type === 'keeper' && draggedItem.id === keeper.employee_id ? 100 : 10,
                                }}
                                onMouseDown={(e) => handleMouseDown(e, 'keeper', keeper.employee_id)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={() => {
                                    if (draggedItem?.type === 'animal') {
                                        handleDrop(keeper.employee_id, draggedItem.id);
                                    }
                                }}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-8 h-8 rounded-full bg-dark_spring_green-100 flex items-center justify-center">
                                        <User className="h-4 w-4 text-dark_spring_green-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm truncate">{keeper.first_name} {keeper.last_name}</p>
                                        <p className="text-xs text-gray-500 truncate capitalize">{keeper.job_role}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                                    <span>{assignedAnimals.length} animal{assignedAnimals.length !== 1 ? 's' : ''}</span>
                                    {keeper.job_role === 'keeper' && (
                                        <Badge variant="secondary" className="text-xs">Keeper</Badge>
                                    )}
                                    {keeper.job_role === 'veterinarian' && (
                                        <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">Vet</Badge>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Animal cards */}
                    {animals.map((animal) => {
                        const pos = animalPositions[animal.animal_id] || { x: 450, y: 50 };
                        const isAssigned = assignments.some(a => a.animal_id === animal.animal_id);

                        return (
                            <div
                                key={animal.animal_id}
                                className={`draggable-card absolute bg-white rounded-lg shadow-lg border-2 p-3 cursor-grab active:cursor-grabbing transition-all hover:shadow-xl ${isAssigned ? 'border-sea_green-500' : 'border-gray-300 border-dashed'
                                    }`}
                                style={{
                                    left: pos.x,
                                    top: pos.y,
                                    width: '160px',
                                    zIndex: draggedItem?.type === 'animal' && draggedItem.id === animal.animal_id ? 100 : 10,
                                }}
                                draggable
                                onMouseDown={(e) => handleMouseDown(e, 'animal', animal.animal_id)}
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('animalId', animal.animal_id.toString());
                                    setDraggedItem({ type: 'animal', id: animal.animal_id });
                                }}
                            >
                                <div className="flex gap-2">
                                    {animal.image_url ? (
                                        <img
                                            src={animal.image_url}
                                            alt={animal.name}
                                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-lg bg-sea_green-50 flex items-center justify-center flex-shrink-0">
                                            <Leaf className="h-5 w-5 text-sea_green-600" />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm truncate">{animal.name}</p>
                                        <p className="text-xs text-gray-500 truncate">{animal.species}</p>
                                    </div>
                                </div>
                                <div className="mt-2 flex items-center justify-between">
                                    <Badge
                                        variant="secondary"
                                        className={`text-xs ${getHealthColor(animal.health_status)}`}
                                    >
                                        {animal.health_status || 'Unknown'}
                                    </Badge>
                                    {!isAssigned && (
                                        <span className="text-xs text-gray-400">Unassigned</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Loading overlay */}
            {isCreatingAssignment && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-50">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dark_spring_green-600"></div>
                </div>
            )}

            {/* Instructions */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-lg shadow-md px-4 py-2 text-sm text-gray-600">
                <span className="font-medium">Tip:</span> Drag animals onto keepers to create assignments. Click the × on connections to remove.
            </div>
        </div>
    );
}
