"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Animal, Employee } from '@/types';
import { ZookeeperAssignmentWithDetails, assignmentService } from '@/services/assignment.service';
import { User, Leaf, ZoomIn, ZoomOut, RotateCcw, Move, Maximize2, Minimize2, LayoutGrid, GitBranch, Rows3, Image, ImageOff, History, X, Undo2, AlertTriangle, Trash2, Plus, Sparkles } from 'lucide-react';
import { createPortal } from 'react-dom';

// History entry for tracking connection changes
interface HistoryEntry {
    id: string;
    type: 'create' | 'delete';
    timestamp: Date;
    keeperId: number;
    keeperName: string;
    animalId: number;
    animalName: string;
    assignmentId?: number; // For delete actions, to potentially recreate
    undone?: boolean;
}

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

    // Animation states
    const [returningCardId, setReturningCardId] = useState<number | null>(null);
    const [rippleCardIds, setRippleCardIds] = useState<Set<number>>(new Set());
    const [keeperPulseId, setKeeperPulseId] = useState<number | null>(null);

    // Interactive dot background states
    const [showDots, setShowDots] = useState(true);
    const [canvasMousePos, setCanvasMousePos] = useState<{ x: number; y: number } | null>(null);
    const [connectionPulse, setConnectionPulse] = useState<{ x: number; y: number; startTime: number } | null>(null);

    // Delete confirmation modal state
    const [deleteConfirmation, setDeleteConfirmation] = useState<{
        assignmentId: number;
        keeperName: string;
        animalName: string;
    } | null>(null);

    // History tracking
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    // Track if component is mounted (for portal)
    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Animation frame loop for connection pulse effect
    const [, forceUpdate] = useState(0);
    useEffect(() => {
        if (!connectionPulse) return;
        let animationId: number;
        const animate = () => {
            forceUpdate(n => n + 1);
            animationId = requestAnimationFrame(animate);
        };
        animationId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationId);
    }, [connectionPulse]);

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
        if (allPositions.length === 0) return { width: 8000, height: 6000 };

        const maxX = Math.max(...allPositions.map(p => p.x)) + 2000;
        const maxY = Math.max(...allPositions.map(p => p.y)) + 1500;
        return {
            width: Math.max(8000, maxX),
            height: Math.max(6000, maxY)
        };
    }, [keeperPositions, animalPositions]);

    const isConnectionHighlighted = useCallback((assignment: ZookeeperAssignmentWithDetails) => {
        // Disable hover highlighting during drag - drag animation takes priority
        if (isDragging || !hoveredCard) return false;
        if (hoveredCard.type === 'keeper') {
            return assignment.keeper_id === hoveredCard.id;
        } else {
            return assignment.animal_id === hoveredCard.id;
        }
    }, [hoveredCard, isDragging]);

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
        const legendBounds = { x: 16, y: 16, width: 200, height: 220 }; // Account for legend position (top-4 left-4 = 16px)
        let overlappingCard = false;

        // Transform canvas coordinates to screen coordinates
        // Screen position = (canvas position * scale) + panOffset
        const checkCardOverlap = (pos: CardPosition, cardWidth: number, cardHeight: number) => {
            const screenX = (pos.x * scale) + panOffset.x;
            const screenY = (pos.y * scale) + panOffset.y;
            const screenWidth = cardWidth * scale;
            const screenHeight = cardHeight * scale;

            // Check if card rectangle actually overlaps legend rectangle (no buffer)
            const cardLeft = screenX;
            const cardRight = screenX + screenWidth;
            const cardTop = screenY;
            const cardBottom = screenY + screenHeight;

            const legendLeft = legendBounds.x;
            const legendRight = legendBounds.x + legendBounds.width;
            const legendTop = legendBounds.y;
            const legendBottom = legendBounds.y + legendBounds.height;

            // Check for actual overlap (not just proximity)
            return cardLeft < legendRight && cardRight > legendLeft &&
                cardTop < legendBottom && cardBottom > legendTop;
        };

        // Check keeper positions
        for (const pos of Object.values(keeperPositions)) {
            if (checkCardOverlap(pos, KEEPER_CARD_WIDTH, KEEPER_CARD_HEIGHT)) {
                overlappingCard = true;
                break;
            }
        }

        // Also check animal positions
        if (!overlappingCard) {
            for (const pos of Object.values(animalPositions)) {
                if (checkCardOverlap(pos, ANIMAL_CARD_WIDTH, ANIMAL_CARD_HEIGHT)) {
                    overlappingCard = true;
                    break;
                }
            }
        }

        setLegendOpacity(overlappingCard ? 0.15 : 1);
    }, [keeperPositions, animalPositions, panOffset, scale]);

    const handleCardMouseEnter = useCallback((type: 'keeper' | 'animal', id: number) => {
        // Disable hover effects during drag
        if (isDragging) return;

        if (hoverTimeout) clearTimeout(hoverTimeout);

        const timeout = setTimeout(() => {
            setHoveredCard({ type, id });
            // Trigger pulse effect when hovering keeper
            if (type === 'keeper') {
                setKeeperPulseId(id);
                // Clear pulse after animation
                setTimeout(() => setKeeperPulseId(null), 600);
            }
        }, 250);

        setHoverTimeout(timeout);
    }, [hoverTimeout, isDragging]);

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
        // Track mouse position on canvas for dot background effect
        if (innerCanvasRef.current) {
            const canvasRect = innerCanvasRef.current.getBoundingClientRect();
            const canvasX = (e.clientX - canvasRect.left) / scale;
            const canvasY = (e.clientY - canvasRect.top) / scale;
            setCanvasMousePos({ x: canvasX, y: canvasY });
        }

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

    // Utility function to trigger cascade ripple effect on nearby/connected cards
    const triggerRippleEffect = useCallback((keeperId: number, animalId: number) => {
        // Find all animals connected to this keeper
        const connectedAnimalIds = assignments
            .filter(a => a.keeper_id === keeperId)
            .map(a => a.animal_id);

        // Find nearby animals (within a radius)
        const droppedPos = animalPositions[animalId];
        const nearbyAnimalIds = droppedPos ? animals
            .filter(a => {
                const pos = animalPositions[a.animal_id];
                if (!pos || a.animal_id === animalId) return false;
                const dx = pos.x - droppedPos.x;
                const dy = pos.y - droppedPos.y;
                return Math.sqrt(dx * dx + dy * dy) < 400;
            })
            .map(a => a.animal_id) : [];

        // Combine and dedupe
        const rippleIds = new Set([...connectedAnimalIds, ...nearbyAnimalIds]);
        rippleIds.delete(animalId); // Don't ripple the card that was just dropped

        // Apply staggered ripple
        setRippleCardIds(rippleIds);
        setTimeout(() => setRippleCardIds(new Set()), 600);
    }, [assignments, animals, animalPositions]);

    const handleMouseUp = useCallback(async () => {
        const wasAnimalDrag = draggedItem?.type === 'animal';
        const draggedAnimalId = draggedItem?.id;
        const targetKeeper = dropTargetKeeper;

        if (wasAnimalDrag && targetKeeper !== null && draggedAnimalId !== undefined) {
            // Mark card as returning for smooth animation
            setReturningCardId(draggedAnimalId);

            await handleCreateAssignment(targetKeeper, draggedAnimalId);

            // Smooth return to original layout position (works for all layouts)
            const layout = layoutMode === 'grid'
                ? getGridLayout()
                : layoutMode === 'cluster'
                    ? getClusterLayout()
                    : getRowsLayout();
            if (layout.animalPos[draggedAnimalId]) {
                setAnimalPositions(prev => ({
                    ...prev,
                    [draggedAnimalId]: layout.animalPos[draggedAnimalId],
                }));
            }

            // Trigger cascade ripple effect
            triggerRippleEffect(targetKeeper, draggedAnimalId);

            // Clear returning state after animation
            setTimeout(() => setReturningCardId(null), 400);
        }

        setDraggedItem(null);
        setDropTargetKeeper(null);
        setIsPanning(false);
        setIsDragging(false);
    }, [draggedItem, dropTargetKeeper, layoutMode, getGridLayout, getClusterLayout, getRowsLayout, triggerRippleEffect]);

    const handleCreateAssignment = async (keeperId: number, animalId: number) => {
        const exists = assignments.some(a => a.keeper_id === keeperId && a.animal_id === animalId);
        if (exists) return;

        const keeper = keepers.find(k => k.employee_id === keeperId);
        const animal = animals.find(a => a.animal_id === animalId);

        setIsCreatingAssignment(true);
        try {
            await assignmentService.create({ keeper_id: keeperId, animal_id: animalId });

            // Trigger connection pulse at midpoint between keeper and animal
            const keeperPos = keeperPositions[keeperId];
            const animalPos = animalPositions[animalId];
            if (keeperPos && animalPos) {
                const midX = (keeperPos.x + KEEPER_CARD_WIDTH / 2 + animalPos.x + ANIMAL_CARD_WIDTH / 2) / 2;
                const midY = (keeperPos.y + KEEPER_CARD_HEIGHT / 2 + animalPos.y + ANIMAL_CARD_HEIGHT / 2) / 2;
                setConnectionPulse({ x: midX, y: midY, startTime: Date.now() });
                // Clear pulse after animation (longer duration for smoother effect)
                setTimeout(() => setConnectionPulse(null), 1200);
            }

            // Add to history
            setHistory(prev => [{
                id: `create-${Date.now()}`,
                type: 'create' as const,
                timestamp: new Date(),
                keeperId,
                keeperName: keeper ? `${keeper.first_name} ${keeper.last_name}` : 'Unknown',
                animalId,
                animalName: animal?.name || 'Unknown',
            }, ...prev].slice(0, 50)); // Keep last 50 entries

            onAssignmentCreated();
        } catch (error) {
            console.error('Failed to create assignment:', error);
        } finally {
            setIsCreatingAssignment(false);
        }
    };

    // Show delete confirmation modal
    const requestDeleteAssignment = (assignment: ZookeeperAssignmentWithDetails) => {
        const keeper = keepers.find(k => k.employee_id === assignment.keeper_id);
        const animal = animals.find(a => a.animal_id === assignment.animal_id);

        setDeleteConfirmation({
            assignmentId: assignment.assignment_id,
            keeperName: keeper ? `${keeper.first_name} ${keeper.last_name}` : 'Unknown',
            animalName: animal?.name || 'Unknown',
        });
    };

    // Confirm and execute delete
    const confirmDeleteAssignment = async () => {
        if (!deleteConfirmation) return;

        const assignment = assignments.find(a => a.assignment_id === deleteConfirmation.assignmentId);
        if (!assignment) {
            setDeleteConfirmation(null);
            return;
        }

        try {
            await assignmentService.delete(deleteConfirmation.assignmentId);

            // Add to history
            setHistory(prev => [{
                id: `delete-${Date.now()}`,
                type: 'delete' as const,
                timestamp: new Date(),
                keeperId: assignment.keeper_id,
                keeperName: deleteConfirmation.keeperName,
                animalId: assignment.animal_id,
                animalName: deleteConfirmation.animalName,
                assignmentId: deleteConfirmation.assignmentId,
            }, ...prev].slice(0, 50));

            onAssignmentDeleted();
        } catch (error) {
            console.error('Failed to delete assignment:', error);
        } finally {
            setDeleteConfirmation(null);
        }
    };

    // Legacy direct delete (keeping for internal use)
    const handleDeleteAssignment = async (assignmentId: number) => {
        const assignment = assignments.find(a => a.assignment_id === assignmentId);
        if (assignment) {
            requestDeleteAssignment(assignment);
        }
    };

    // Undo a history entry
    const undoHistoryEntry = async (entry: HistoryEntry) => {
        try {
            if (entry.type === 'create') {
                // Find current assignment and delete it
                const current = assignments.find(a =>
                    a.keeper_id === entry.keeperId && a.animal_id === entry.animalId
                );
                if (current) {
                    await assignmentService.delete(current.assignment_id);
                    onAssignmentDeleted();
                }
            } else {
                // Recreate the deleted assignment
                await assignmentService.create({ keeper_id: entry.keeperId, animal_id: entry.animalId });
                onAssignmentCreated();
            }

            // Mark as undone
            setHistory(prev => prev.map(h =>
                h.id === entry.id ? { ...h, undone: true } : h
            ));
        } catch (error) {
            console.error('Failed to undo:', error);
        }
    };

    const zoomIn = () => setScale(prev => Math.min(prev + 0.15, 1.5));
    const zoomOut = () => setScale(prev => Math.max(prev - 0.15, 0.25));
    const resetView = () => {
        setScale(0.65);
        setPanOffset({ x: 0, y: 0 });
    };

    const toggleFullscreen = () => setIsFullscreen(prev => !prev);

    // Get the center point of a card (used for calculating midpoints)
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

    // Get the optimal connection point on a card edge based on target position
    const getConnectionPoint = (
        sourceType: 'keeper' | 'animal',
        sourceId: number,
        targetType: 'keeper' | 'animal',
        targetId: number
    ): { x: number; y: number } => {
        const sourcePositions = sourceType === 'keeper' ? keeperPositions : animalPositions;
        const targetPositions = targetType === 'keeper' ? keeperPositions : animalPositions;

        const sourcePos = sourcePositions[sourceId];
        const targetPos = targetPositions[targetId];

        if (!sourcePos || !targetPos) return { x: 0, y: 0 };

        const sourceWidth = sourceType === 'keeper' ? KEEPER_CARD_WIDTH : ANIMAL_CARD_WIDTH;
        const sourceHeight = sourceType === 'keeper' ? KEEPER_CARD_HEIGHT : ANIMAL_CARD_HEIGHT;
        const targetWidth = targetType === 'keeper' ? KEEPER_CARD_WIDTH : ANIMAL_CARD_WIDTH;
        const targetHeight = targetType === 'keeper' ? KEEPER_CARD_HEIGHT : ANIMAL_CARD_HEIGHT;

        // Calculate centers
        const sourceCenterX = sourcePos.x + sourceWidth / 2;
        const sourceCenterY = sourcePos.y + sourceHeight / 2;
        const targetCenterX = targetPos.x + targetWidth / 2;
        const targetCenterY = targetPos.y + targetHeight / 2;

        // Calculate the difference
        const dx = targetCenterX - sourceCenterX;
        const dy = targetCenterY - sourceCenterY;

        // Determine which edge to use based on the direction to target
        // Use the edge that faces the target most directly
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        // Use a balanced threshold - if truly more horizontal, use left/right edges
        // Otherwise use top/bottom for vertical alignments
        if (absX > absY) {
            // Use left or right edge
            if (dx > 0) {
                // Target is to the right, connect from right edge
                return { x: sourcePos.x + sourceWidth, y: sourceCenterY };
            } else {
                // Target is to the left, connect from left edge
                return { x: sourcePos.x, y: sourceCenterY };
            }
        } else {
            // Use top or bottom edge (for vertically stacked cards)
            if (dy > 0) {
                // Target is below, connect from bottom edge
                return { x: sourceCenterX, y: sourcePos.y + sourceHeight };
            } else {
                // Target is above, connect from top edge
                return { x: sourceCenterX, y: sourcePos.y };
            }
        }
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

    // Larger spacing = fewer dots = better performance
    const DOT_SPACING = 70;
    const dots = useMemo(() => {
        if (!showDots) return [];
        const dotArray: { x: number; y: number; key: string }[] = [];
        const cols = Math.ceil(canvasSize.width / DOT_SPACING);
        const rows = Math.ceil(canvasSize.height / DOT_SPACING);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                dotArray.push({
                    x: col * DOT_SPACING + DOT_SPACING / 2,
                    y: row * DOT_SPACING + DOT_SPACING / 2,
                    key: `${col}-${row}`,
                });
            }
        }
        return dotArray;
    }, [canvasSize.width, canvasSize.height, showDots]);

    // Calculate dot visual properties based on interactions
    const getDotStyle = useCallback((dot: { x: number; y: number }) => {
        // Base visibility - dots always slightly visible
        let radius = 2;
        let opacity = 0.15;
        let color = '#94a3b8';

        // Hover effect - dots near cursor brighten and enlarge
        if (canvasMousePos && !isDragging) {
            const dx = dot.x - canvasMousePos.x;
            const dy = dot.y - canvasMousePos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const hoverRadius = 150;
            if (dist < hoverRadius) {
                const intensity = 1 - (dist / hoverRadius);
                // Additive: build on base values
                radius = 2 + intensity * 4;
                opacity = 0.15 + intensity * 0.5;
                // Subtle color shift toward teal
                const r = Math.round(148 - intensity * 60);
                const g = Math.round(163 + intensity * 50);
                const b = Math.round(184 + intensity * 30);
                color = `rgb(${r}, ${g}, ${b})`;
            }
        }

        // Drag effect - ripple wave from dragged card position
        if (isDragging && draggedItem) {
            const dragPos = draggedItem.type === 'keeper'
                ? keeperPositions[draggedItem.id]
                : animalPositions[draggedItem.id];
            if (dragPos) {
                const cardCenterX = dragPos.x + (draggedItem.type === 'keeper' ? KEEPER_CARD_WIDTH / 2 : ANIMAL_CARD_WIDTH / 2);
                const cardCenterY = dragPos.y + (draggedItem.type === 'keeper' ? KEEPER_CARD_HEIGHT / 2 : ANIMAL_CARD_HEIGHT / 2);
                const dx = dot.x - cardCenterX;
                const dy = dot.y - cardCenterY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const waveRadius = 250;
                if (dist < waveRadius) {
                    const wave = Math.sin((dist / waveRadius) * Math.PI * 2);
                    // Additive: build on base values
                    radius = 2 + Math.abs(wave) * 3;
                    opacity = 0.15 + Math.abs(wave) * 0.4;
                    color = '#3b82f6'; // Blue for drag
                }
            }
        }

        // Connection pulse effect - smooth radial wave from new connection
        if (connectionPulse) {
            const elapsed = Date.now() - connectionPulse.startTime;
            const pulseRadius = elapsed * 0.6; // Slower expansion for smoother effect
            const dx = dot.x - connectionPulse.x;
            const dy = dot.y - connectionPulse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const waveWidth = 150; // Wider wave for smoother transition
            if (dist < pulseRadius && dist > pulseRadius - waveWidth) {
                const wavePosition = (pulseRadius - dist) / waveWidth;
                // Smooth easing function for gentler rise and fall
                const eased = Math.sin(wavePosition * Math.PI) * (1 - wavePosition * 0.3);
                radius = Math.max(radius, 2 + eased * 4);
                opacity = Math.max(opacity, 0.25 + eased * 0.45);
                color = '#10b981'; // Emerald for new connection
            }
        }

        return { radius, opacity, color };
    }, [canvasMousePos, isDragging, draggedItem, keeperPositions, animalPositions, connectionPulse]);

    // Filter dots to only render those in/near visible viewport
    // Using larger bounds to ensure dots are ready before scrolling into view
    const visibleDots = useMemo(() => {
        if (!showDots) return [];
        // Approximate visible area with generous buffer (container is ~700-1000px typically)
        const viewportWidth = 1500 / scale;
        const viewportHeight = 1000 / scale;
        const left = -panOffset.x / scale - 200;
        const top = -panOffset.y / scale - 200;
        const right = left + viewportWidth + 400;
        const bottom = top + viewportHeight + 400;

        return dots.filter(dot =>
            dot.x >= left && dot.x <= right &&
            dot.y >= top && dot.y <= bottom
        );
    }, [dots, showDots, panOffset, scale]);

    // Check if a point (e.g., × button position) is underneath any card
    const isPointUnderCard = useCallback((pointX: number, pointY: number, buttonRadius: number = 14): boolean => {
        // Check all keeper positions
        for (const [id, pos] of Object.entries(keeperPositions)) {
            if (pointX >= pos.x - buttonRadius &&
                pointX <= pos.x + KEEPER_CARD_WIDTH + buttonRadius &&
                pointY >= pos.y - buttonRadius &&
                pointY <= pos.y + KEEPER_CARD_HEIGHT + buttonRadius) {
                return true;
            }
        }
        // Check all animal positions
        for (const [id, pos] of Object.entries(animalPositions)) {
            if (pointX >= pos.x - buttonRadius &&
                pointX <= pos.x + ANIMAL_CARD_WIDTH + buttonRadius &&
                pointY >= pos.y - buttonRadius &&
                pointY <= pos.y + ANIMAL_CARD_HEIGHT + buttonRadius) {
                return true;
            }
        }
        return false;
    }, [keeperPositions, animalPositions]);

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
            {/* Top right controls */}
            <div className="absolute top-4 right-4 z-30 flex gap-2">
                {/* History toggle */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowHistory(prev => !prev)}
                    title="View History"
                    className={`bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 hover:bg-slate-100 ${showHistory ? 'bg-slate-100 border-slate-300' : ''
                        } ${history.length > 0 ? 'relative' : ''}`}
                >
                    <History className="h-4 w-4" />
                    {history.filter(h => !h.undone).length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-medium">
                            {history.filter(h => !h.undone).length > 9 ? '9+' : history.filter(h => !h.undone).length}
                        </span>
                    )}
                </Button>

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
                <div className="w-px bg-slate-200 mx-1" />
                <Button
                    variant={showDots ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setShowDots(prev => !prev)}
                    title={showDots ? "Hide Interactive Dots" : "Show Interactive Dots"}
                    className={`rounded-lg ${showDots ? '' : 'hover:bg-slate-100'}`}
                >
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    Dots
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
                onMouseLeave={() => {
                    handleMouseUp();
                    setCanvasMousePos(null);
                }}
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
                    {/* Interactive dotted background */}
                    {showDots && (
                        <svg
                            className="absolute"
                            style={{
                                zIndex: 1,
                                width: canvasSize.width,
                                height: canvasSize.height,
                                pointerEvents: 'none',
                            }}
                        >
                            {visibleDots.map((dot) => {
                                const style = getDotStyle(dot);
                                return (
                                    <circle
                                        key={dot.key}
                                        cx={dot.x}
                                        cy={dot.y}
                                        r={style.radius}
                                        fill={style.color}
                                        opacity={style.opacity}
                                        style={{ transition: 'all 0.12s ease-out' }}
                                    />
                                );
                            })}
                        </svg>
                    )}

                    {/* SVG connections - z-index higher when highlighting */}
                    <svg
                        className="absolute"
                        style={{
                            zIndex: hoveredCard ? 200 : 5,
                            width: canvasSize.width,
                            height: canvasSize.height,
                            overflow: 'visible',
                            pointerEvents: 'none'
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
                            <linearGradient id="dragGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#3b82f6" />
                                <stop offset="100%" stopColor="#8b5cf6" />
                            </linearGradient>
                            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                            <filter id="highlightGlow" x="-50%" y="-50%" width="200%" height="200%">
                                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                            <filter id="dragGlow" x="-50%" y="-50%" width="200%" height="200%">
                                <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                            {/* Animated dash pattern for dragging */}
                            <style>{`
                                @keyframes dashMove {
                                    0% { stroke-dashoffset: 0; }
                                    100% { stroke-dashoffset: -20; }
                                }
                                .animated-dash {
                                    animation: dashMove 0.5s linear infinite;
                                }
                                @keyframes connectionPulse {
                                    0% { stroke-width: 4; opacity: 1; }
                                    50% { stroke-width: 8; opacity: 0.8; }
                                    100% { stroke-width: 4; opacity: 1; }
                                }
                                .connection-pulse {
                                    animation: connectionPulse 0.6s ease-out;
                                }
                                @keyframes cardWiggle {
                                    0%, 100% { transform: translate(0, 0) rotate(0deg); }
                                    20% { transform: translate(-2px, -1px) rotate(-0.5deg); }
                                    40% { transform: translate(2px, 1px) rotate(0.5deg); }
                                    60% { transform: translate(-1px, 1px) rotate(-0.3deg); }
                                    80% { transform: translate(1px, -1px) rotate(0.3deg); }
                                }
                                .card-wiggle {
                                    animation: cardWiggle 0.5s ease-out;
                                }
                                @keyframes cardReturn {
                                    0% { transform: scale(1.05) rotate(1deg); }
                                    100% { transform: scale(1) rotate(0deg); }
                                }
                                .card-return {
                                    animation: cardReturn 0.4s ease-out;
                                }
                            `}</style>
                        </defs>

                        {/* Non-highlighted connections */}
                        {assignments.filter(a => !isConnectionHighlighted(a)).map((assignment) => {
                            // Edge connection points for the line
                            const keeperPoint = getConnectionPoint('keeper', assignment.keeper_id, 'animal', assignment.animal_id);
                            const animalPoint = getConnectionPoint('animal', assignment.animal_id, 'keeper', assignment.keeper_id);
                            // Centers for midpoint calculation (× button position)
                            const keeperCenter = getCardCenter('keeper', assignment.keeper_id);
                            const animalCenter = getCardCenter('animal', assignment.animal_id);
                            const isHovered = hoveredConnection === assignment.assignment_id;

                            // Check if this connection involves the dragged card
                            const isDraggedConnection = draggedItem && (
                                (draggedItem.type === 'keeper' && draggedItem.id === assignment.keeper_id) ||
                                (draggedItem.type === 'animal' && draggedItem.id === assignment.animal_id)
                            );

                            const midX = (keeperCenter.x + animalCenter.x) / 2;
                            const midY = (keeperCenter.y + animalCenter.y) / 2;
                            const dx = animalPoint.x - keeperPoint.x;
                            const dy = animalPoint.y - keeperPoint.y;
                            // Adjust control offset based on whether connection is more horizontal or vertical
                            // Ensure minimum offset of 40 for visibility
                            const isHorizontal = Math.abs(dx) > Math.abs(dy);
                            const controlOffset = isHorizontal
                                ? Math.max(Math.min(Math.abs(dx) * 0.3, 80), 40)
                                : Math.max(Math.min(Math.abs(dy) * 0.3, 80), 40);

                            return (
                                <g key={assignment.assignment_id}>
                                    {isHovered && (
                                        <path
                                            d={isHorizontal
                                                ? `M ${keeperPoint.x} ${keeperPoint.y} 
                                                   C ${keeperPoint.x + controlOffset} ${keeperPoint.y},
                                                     ${animalPoint.x - controlOffset} ${animalPoint.y},
                                                     ${animalPoint.x} ${animalPoint.y}`
                                                : `M ${keeperPoint.x} ${keeperPoint.y} 
                                                   C ${keeperPoint.x} ${keeperPoint.y + (dy > 0 ? controlOffset : -controlOffset)},
                                                     ${animalPoint.x} ${animalPoint.y + (dy > 0 ? -controlOffset : controlOffset)},
                                                     ${animalPoint.x} ${animalPoint.y}`}
                                            fill="none"
                                            stroke="#ef4444"
                                            strokeWidth={8}
                                            strokeOpacity={0.3}
                                            filter="url(#glow)"
                                        />
                                    )}
                                    <path
                                        d={isHorizontal
                                            ? `M ${keeperPoint.x} ${keeperPoint.y} 
                                               C ${keeperPoint.x + controlOffset} ${keeperPoint.y},
                                                 ${animalPoint.x - controlOffset} ${animalPoint.y},
                                                 ${animalPoint.x} ${animalPoint.y}`
                                            : `M ${keeperPoint.x} ${keeperPoint.y} 
                                               C ${keeperPoint.x} ${keeperPoint.y + (dy > 0 ? controlOffset : -controlOffset)},
                                                 ${animalPoint.x} ${animalPoint.y + (dy > 0 ? -controlOffset : controlOffset)},
                                                 ${animalPoint.x} ${animalPoint.y}`}
                                        fill="none"
                                        stroke={isDraggedConnection ? "url(#dragGradient)" : isHovered ? "#ef4444" : "url(#connectionGradient)"}
                                        strokeWidth={isDraggedConnection ? 4 : isHovered ? 3 : 2.5}
                                        strokeLinecap="round"
                                        strokeOpacity={isDraggedConnection ? 1 : hoveredCard ? 0.3 : 1}
                                        strokeDasharray={isDraggedConnection ? "8 4" : "none"}
                                        className={isDraggedConnection ? "animated-dash" : ""}
                                        filter={isDraggedConnection ? "url(#dragGlow)" : undefined}
                                    />
                                    <g
                                        style={{
                                            pointerEvents: isDragging || isPointUnderCard(midX, midY) ? 'none' : 'auto',
                                            opacity: isDragging || isPointUnderCard(midX, midY) ? 0 : 1,
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
                            // Edge connection points for the line
                            const keeperPoint = getConnectionPoint('keeper', assignment.keeper_id, 'animal', assignment.animal_id);
                            const animalPoint = getConnectionPoint('animal', assignment.animal_id, 'keeper', assignment.keeper_id);
                            // Centers for midpoint calculation (× button position)
                            const keeperCenter = getCardCenter('keeper', assignment.keeper_id);
                            const animalCenter = getCardCenter('animal', assignment.animal_id);
                            const isPulsing = keeperPulseId === assignment.keeper_id;

                            const midX = (keeperCenter.x + animalCenter.x) / 2;
                            const midY = (keeperCenter.y + animalCenter.y) / 2;
                            const dx = animalPoint.x - keeperPoint.x;
                            const dy = animalPoint.y - keeperPoint.y;
                            const isHorizontal = Math.abs(dx) > Math.abs(dy);
                            const controlOffset = isHorizontal
                                ? Math.max(Math.min(Math.abs(dx) * 0.3, 80), 40)
                                : Math.max(Math.min(Math.abs(dy) * 0.3, 80), 40);

                            return (
                                <g key={`highlighted-${assignment.assignment_id}`}>
                                    <path
                                        d={isHorizontal
                                            ? `M ${keeperPoint.x} ${keeperPoint.y} 
                                               C ${keeperPoint.x + controlOffset} ${keeperPoint.y},
                                                 ${animalPoint.x - controlOffset} ${animalPoint.y},
                                                 ${animalPoint.x} ${animalPoint.y}`
                                            : `M ${keeperPoint.x} ${keeperPoint.y} 
                                               C ${keeperPoint.x} ${keeperPoint.y + (dy > 0 ? controlOffset : -controlOffset)},
                                                 ${animalPoint.x} ${animalPoint.y + (dy > 0 ? -controlOffset : controlOffset)},
                                                 ${animalPoint.x} ${animalPoint.y}`}
                                        fill="none"
                                        stroke="url(#highlightGradient)"
                                        strokeWidth={isPulsing ? 12 : 10}
                                        strokeOpacity={isPulsing ? 0.6 : 0.4}
                                        filter="url(#highlightGlow)"
                                        className={isPulsing ? 'connection-pulse' : ''}
                                    />
                                    <path
                                        d={isHorizontal
                                            ? `M ${keeperPoint.x} ${keeperPoint.y} 
                                               C ${keeperPoint.x + controlOffset} ${keeperPoint.y},
                                                 ${animalPoint.x - controlOffset} ${animalPoint.y},
                                                 ${animalPoint.x} ${animalPoint.y}`
                                            : `M ${keeperPoint.x} ${keeperPoint.y} 
                                               C ${keeperPoint.x} ${keeperPoint.y + (dy > 0 ? controlOffset : -controlOffset)},
                                                 ${animalPoint.x} ${animalPoint.y + (dy > 0 ? -controlOffset : controlOffset)},
                                                 ${animalPoint.x} ${animalPoint.y}`}
                                        fill="none"
                                        stroke="url(#highlightGradient)"
                                        strokeWidth={isPulsing ? 6 : 4}
                                        strokeLinecap="round"
                                        className={isPulsing ? 'connection-pulse' : ''}
                                    />
                                    <g
                                        style={{
                                            pointerEvents: isDragging || isPointUnderCard(midX, midY) ? 'none' : 'auto',
                                            opacity: isDragging || isPointUnderCard(midX, midY) ? 0 : 1,
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
                                    : (isHighlighted || hasHighlightedConnection) && !isDragging
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
                        const isReturning = returningCardId === animal.animal_id;
                        const isRippling = rippleCardIds.has(animal.animal_id);

                        return (
                            <div
                                key={animal.animal_id}
                                className={`draggable-card absolute rounded-2xl cursor-grab active:cursor-grabbing select-none overflow-hidden bg-white ${isDraggingThis ? 'scale-105 shadow-2xl rotate-1' :
                                    (isHighlighted || hasHighlightedConnection) && !isDragging ? 'ring-2 ring-amber-400 shadow-2xl' :
                                        'hover:shadow-xl'
                                    } ${isAssigned ? 'shadow-lg' : 'shadow-md'} ${isReturning ? 'card-return' : ''} ${isRippling ? 'card-wiggle' : ''}`}
                                style={{
                                    left: pos.x,
                                    top: pos.y,
                                    width: ANIMAL_CARD_WIDTH,
                                    height: ANIMAL_CARD_HEIGHT,
                                    zIndex: isDraggingThis ? 100 :
                                        isHighlighted || hasHighlightedConnection ? 50 : 10,
                                    border: (isHighlighted || hasHighlightedConnection) && !isDragging ? '3px solid #f59e0b' :
                                        isAssigned ? '3px solid #8b5cf6' : '3px dashed #cbd5e1',
                                    transition: isLayoutAnimating
                                        ? 'left 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.2s, box-shadow 0.2s'
                                        : isReturning
                                            ? 'left 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.2s, box-shadow 0.2s'
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

            {/* Delete confirmation modal */}
            {deleteConfirmation && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100]">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 animate-in fade-in zoom-in-95">
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
                            <Button
                                variant="outline"
                                onClick={() => setDeleteConfirmation(null)}
                                className="rounded-lg"
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="default"
                                onClick={confirmDeleteAssignment}
                                className="rounded-lg bg-red-600 hover:bg-red-700 text-white"
                            >
                                <Trash2 className="h-4 w-4 mr-1.5" />
                                Delete
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* History panel */}
            {showHistory && (
                <div className="absolute top-4 right-4 z-40 w-80 max-h-[500px] bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                        <div className="flex items-center gap-2">
                            <History className="h-4 w-4 text-slate-600" />
                            <h3 className="font-semibold text-slate-800">Recent Changes</h3>
                        </div>
                        <button
                            onClick={() => setShowHistory(false)}
                            className="p-1 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                            <X className="h-4 w-4 text-slate-500" />
                        </button>
                    </div>
                    <div className="overflow-y-auto max-h-[400px]">
                        {history.length === 0 ? (
                            <div className="p-6 text-center text-slate-500">
                                <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                <p className="text-sm">No changes yet</p>
                                <p className="text-xs text-slate-400 mt-1">Drag animals onto keepers to create assignments</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {history.map((entry) => (
                                    <div
                                        key={entry.id}
                                        className={`p-3 flex items-start gap-3 ${entry.undone ? 'opacity-50 bg-slate-50' : ''}`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${entry.type === 'create'
                                            ? 'bg-emerald-100 text-emerald-600'
                                            : 'bg-red-100 text-red-600'
                                            }`}>
                                            {entry.type === 'create' ? <Plus className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-slate-800">
                                                <span className={entry.type === 'create' ? 'text-emerald-700' : 'text-red-700'}>
                                                    {entry.type === 'create' ? 'Assigned' : 'Removed'}
                                                </span>
                                                {' '}<strong className="truncate">{entry.animalName}</strong>
                                                {' '}{entry.type === 'create' ? 'to' : 'from'}{' '}
                                                <strong className="truncate">{entry.keeperName}</strong>
                                            </p>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                {entry.timestamp.toLocaleTimeString()}
                                                {entry.undone && <span className="ml-2 text-amber-600">(Undone)</span>}
                                            </p>
                                        </div>
                                        {!entry.undone && (
                                            <button
                                                onClick={() => undoHistoryEntry(entry)}
                                                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
                                                title="Undo this change"
                                            >
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
                {/* Portal to document.body - flush with edges */}
                {createPortal(
                    <div className="fixed inset-0" style={{ zIndex: 999999 }}>
                        {/* Background */}
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-slate-50 to-white">
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
