import React, { useState, useRef, useCallback } from 'react';

import SilverCard from './cards/SilverCard';
import BalanceCard from './cards/BalanceCard';
import TicketCard from './cards/TicketCard';
import FragmentCard from './cards/FragmentCard';

// ─── Constants ────────────────────────────────────────────────────────────────
// Bank card ratio: 85.60 × 53.98 mm → 1.586 : 1
const CARD_WIDTH = 327;
const CARD_HEIGHT = Math.round(CARD_WIDTH / 1.586); // ≈ 206px
const HEADER_H = 30;    // px — forehead visible in stacked state
const GAP = 4;          // px — breathing gap between stacked headers
const TOTAL_CARDS = 4;

// Gesture config
const TAP_THRESHOLD = 8;          // px — movement below this = tap, not drag
const COMMIT_THRESHOLD = CARD_HEIGHT / 2; // must drag past 1/2 card height to commit
const VELOCITY_THRESHOLD = 0.8;   // px/ms (800px/s)

// Spring easing
const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DURATION = '0.5s';

// ─── Layout helpers ───────────────────────────────────────────────────────────
function getCardBaseTop(i: number, focused: number | null): number {
    if (focused === null) return i * (HEADER_H + GAP);
    if (i < focused) return i * (HEADER_H + GAP);
    if (i === focused) return focused * (HEADER_H + GAP);
    const focusedBottom = focused * (HEADER_H + GAP) + CARD_HEIGHT;
    return focusedBottom + GAP + (i - focused - 1) * (HEADER_H + GAP);
}

function getContainerHeight(focused: number | null): number {
    if (focused === null) return (TOTAL_CARDS - 1) * (HEADER_H + GAP) + CARD_HEIGHT;
    const aboveH = focused * (HEADER_H + GAP);
    const belowCount = TOTAL_CARDS - focused - 1;
    const belowH = belowCount > 0 ? GAP + belowCount * (HEADER_H + GAP) : 0;
    return aboveH + CARD_HEIGHT + belowH;
}

// ─── Haptic Helper ────────────────────────────────────────────────────────────
const vibrate = (pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(pattern);
    }
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function CustomerCardStack() {
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    // Refs — avoid re-renders during active drag
    const dragCardIndex = useRef<number | null>(null);
    const startY = useRef(0);
    const startTime = useRef(0); // For velocity calc
    const maxDelta = useRef(0);
    const dragDir = useRef<1 | -1>(1); // +1 = downward, -1 = upward
    // Track if we've decided to hand off to scroll
    const scrollHandoff = useRef(false);
    // Track if we've crossed threshold to trigger haptic
    const crossedThreshold = useRef(false);

    // ── Identify which card was touched by Y position ─────────────────────────
    const getCardInfoFromTarget = (target: EventTarget | null) => {
        let el = target as HTMLElement | null;
        let isHeader = false;
        let cardIndex: number | null = null;

        while (el) {
            if (el.classList.contains('card-header')) {
                isHeader = true;
            }
            const idx = el.dataset?.cardIndex;
            if (idx !== undefined) {
                cardIndex = parseInt(idx, 10);
                break; // Found the card wrapper
            }
            el = el.parentElement;
        }
        return { cardIndex, isHeader };
    };

    // ── Gesture handlers on the CONTAINER (so move/end never get lost) ────────

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        const { cardIndex, isHeader } = getCardInfoFromTarget(e.target);
        if (cardIndex === null) return;

        // Conflict Resolution:
        // If card is expanded AND user touches content (not header),
        // we generally let native scroll happen depending on overflow.
        // But if touch-action is handled by CSS, we might capture here.
        // STRATEGY: Only "lock" drag if touching Header OR if Stacked.
        if (focusedIndex !== null && !isHeader) {
            // Touching content of expanded card -> let native scroll handle it initially.
            // We do NOT capture pointer here.
            return;
        }

        dragCardIndex.current = cardIndex;
        startY.current = e.clientY;
        startTime.current = Date.now();
        maxDelta.current = 0;
        scrollHandoff.current = false;
        crossedThreshold.current = false;
        setDragOffset(0);
        setIsDragging(false);

        // Haptic: Light tap
        vibrate(10);

        // Capture pointer so move/up fire even outside the element
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }, [focusedIndex]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (dragCardIndex.current === null) return;
        const delta = e.clientY - startY.current;
        const absDelta = Math.abs(delta);
        if (absDelta > maxDelta.current) maxDelta.current = absDelta;

        if (absDelta <= TAP_THRESHOLD) return;

        // In stacked state, upward swipe -> scroll page
        if (focusedIndex === null && delta < 0 && !scrollHandoff.current) {
            scrollHandoff.current = true;
            dragCardIndex.current = null;
            setIsDragging(false);
            setDragOffset(0);
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            return;
        }

        if (scrollHandoff.current) return;

        setIsDragging(true);

        // Track drag direction for commit decision
        dragDir.current = delta > 0 ? 1 : -1;

        // Haptic: Trigger Medium vibration when crossing specific threshold (e.g. 1/3 card height)
        const THRESHOLD_TRIGGER = CARD_HEIGHT / 2;
        if (absDelta >= THRESHOLD_TRIGGER && !crossedThreshold.current) {
            crossedThreshold.current = true;
            vibrate(20); // Medium haptic
        } else if (absDelta < THRESHOLD_TRIGGER && crossedThreshold.current) {
            crossedThreshold.current = false;
        }

        // Apply Damping / Resistance
        let offset = delta;
        const isDown = delta > 0;

        // Edge Resistance: 
        // 1. Dragging Top Card (Index 0) Upward -> Heavy Damping
        // 2. Dragging Bottom Card (Last Index) Downward -> Heavy Damping
        const isTopCardUp = dragCardIndex.current === 0 && !isDown;
        const isBottomCardDown = dragCardIndex.current === TOTAL_CARDS - 1 && isDown;

        if (isTopCardUp || isBottomCardDown) {
            // Cube root damping for "wall" feel
            offset = isDown
                ? Math.pow(delta, 0.7)
                : -Math.pow(Math.abs(delta), 0.7);
        } else if (absDelta > CARD_HEIGHT) {
            // Normal non-linear damping for over-drag
            const sign = delta > 0 ? 1 : -1;
            const overflow = absDelta - CARD_HEIGHT;
            offset = sign * (CARD_HEIGHT + overflow * 0.2);
        }

        setDragOffset(offset);
    }, [focusedIndex]);

    const handlePointerUp = useCallback(() => {
        const endTime = Date.now();
        const duration = endTime - startTime.current;
        const velocity = Math.abs(dragOffset / duration); // px/ms

        const wasDrag = maxDelta.current > TAP_THRESHOLD;
        const cardIndex = dragCardIndex.current;

        if (scrollHandoff.current) {
            dragCardIndex.current = null;
            scrollHandoff.current = false;
            return;
        }

        if (!wasDrag && cardIndex !== null) {
            // Tap → toggle focus
            const newIndex = (focusedIndex === cardIndex) ? null : cardIndex;
            setFocusedIndex(newIndex);
            if (newIndex !== null) vibrate(10); // Feedback on expand
        } else if (wasDrag && cardIndex !== null) {
            // Smart commit logic
            const isMovingDown = dragOffset > 0;
            const dist = Math.abs(dragOffset);

            // Commit Condition:
            // 1. Velocity > 0.8 (Fast Swipe)
            // 2. Distance > 50% Card Height (Slow Drag)
            const isFastSwipe = velocity > VELOCITY_THRESHOLD;
            const isFarEnough = dist >= COMMIT_THRESHOLD;
            const shouldCommit = isFastSwipe || isFarEnough;

            if (shouldCommit) {
                // Determine user intent based on Direction + Context
                if (focusedIndex === null && isMovingDown) {
                    // Stacked -> Swipe Down -> Expand
                    if (cardIndex > 0) {
                        setFocusedIndex(cardIndex - 1);
                        vibrate(20); // Success haptic
                    }
                } else if (focusedIndex !== null) {
                    if (!isMovingDown) {
                        // Expanded -> Swipe Up -> Collapse
                        setFocusedIndex(null);
                        vibrate(10); // Collapse haptic
                    } else {
                        // Expanded -> Swipe Down -> Peek Next
                        if (focusedIndex > 0) {
                            setFocusedIndex(focusedIndex - 1);
                            vibrate(20);
                        }
                    }
                }
            } else {
                // Revert -> Haptic 'bump' when snapping back? 
                // Maybe too noisy, keep it silent or very light.
            }
        }

        dragCardIndex.current = null;
        setIsDragging(false);
        setDragOffset(0);
        crossedThreshold.current = false;
    }, [focusedIndex, dragOffset]);

    // ── Style builder ─────────────────────────────────────────────────────────

    const cardStyle = (index: number): React.CSSProperties => {
        const baseTop = getCardBaseTop(index, focusedIndex);

        // ─────────────────────────────────────────────────────────────────────────────
        // "Baffle" Logic: Find the effective drag offset for the moving block
        // ─────────────────────────────────────────────────────────────────────────────
        let extra = 0;
        let effectiveOffset = 0;

        if (isDragging && dragCardIndex.current !== null) {
            const di = dragCardIndex.current;
            const isUpDrag = dragOffset < 0;

            effectiveOffset = dragOffset;

            // Determine which card is the "Head" of the moving block
            let headIndex = di;
            // If dragging bottom stack (indices > focusedIndex), the head of the block is focusedIndex + 1
            const isBottomStackDrag = focusedIndex !== null && di > focusedIndex;

            if (isBottomStackDrag && focusedIndex !== null) {
                headIndex = focusedIndex + 1;
            }

            // Apply Constraint: The head of the block cannot go higher than (PrevCard.Top + HEADER_H)
            if (isUpDrag && headIndex > 0) {
                const prevIndex = headIndex - 1;
                const prevBase = getCardBaseTop(prevIndex, focusedIndex);

                // Calculate where prev card is (it might have a slight nudge)
                const dist = di - prevIndex;
                // Note: 'di' is the actual dragged card responsible for nudge calculation
                const nudge = dragOffset * (0.08 / Math.max(1, dist));

                const prevCurrentTop = prevBase + nudge;
                const limitTop = prevCurrentTop + HEADER_H;

                const headBase = getCardBaseTop(headIndex, focusedIndex);
                const targetTop = headBase + dragOffset;

                if (targetTop < limitTop) {
                    // We hit the baffle
                    effectiveOffset = limitTop - headBase;
                }
            }

            // Apply effectiveOffset to relevant cards
            const isBottomStackMember = focusedIndex !== null && index > focusedIndex;

            if (isBottomStackDrag && isBottomStackMember && isUpDrag) {
                // Use clamped offset
                extra = effectiveOffset;
            }
            else if (index === headIndex) {
                // If this is the head (or standard drag card), use clamped
                extra = effectiveOffset;
            } else if (index > headIndex) {
                // Cards BELOW the block head
                if (isUpDrag) {
                    // Upward Drag: Cohesive Block Move
                    extra = effectiveOffset;
                } else {
                    // Downward Drag: Card N reveals Card N-1. 
                    extra = dragOffset;
                }
            } else {
                // Cards ABOVE (index < headIndex)
                // Sympathetic nudge
                const dist = di - index;
                extra = dragOffset * (0.08 / dist);
            }
        }

        return {
            position: 'absolute',
            top: `${baseTop + extra}px`,
            left: 0,
            right: 0,
            zIndex: 10 + index,
            transition: isDragging ? 'none' : `top ${DURATION} ${SPRING}`,
        };
    };

    const containerHeight = getContainerHeight(focusedIndex);

    // ── Render ────────────────────────────────────────────────────────────────

    const CARDS = [SilverCard, BalanceCard, TicketCard, FragmentCard] as const;

    return (
        <div
            className="relative mx-6 touch-none select-none"
            style={{
                height: `${containerHeight}px`,
                transition: `height ${DURATION} ${SPRING}`,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            {CARDS.map((Component, index) => (
                <div
                    key={index}
                    data-card-index={index}
                    style={cardStyle(index)}
                >
                    <Component
                        expanded={focusedIndex === index}
                        onExpand={() => { /* focus toggled via pointer events */ }}
                        onReference={React.createRef()}
                    />
                </div>
            ))}

        </div>
    );
}
