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

// ─── Component ────────────────────────────────────────────────────────────────
export default function CustomerCardStack() {
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    // Refs — avoid re-renders during active drag
    const dragCardIndex = useRef<number | null>(null);
    const startY = useRef(0);
    const maxDelta = useRef(0);
    const dragDir = useRef<1 | -1>(1); // +1 = downward, -1 = upward
    // Track if we've decided to hand off to scroll
    const scrollHandoff = useRef(false);

    // ── Identify which card was touched by Y position ─────────────────────────
    const getCardIndexFromTarget = (target: EventTarget | null): number | null => {
        let el = target as HTMLElement | null;
        while (el) {
            const idx = el.dataset?.cardIndex;
            if (idx !== undefined) return parseInt(idx, 10);
            el = el.parentElement;
        }
        return null;
    };

    // ── Gesture handlers on the CONTAINER (so move/end never get lost) ────────

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        const cardIndex = getCardIndexFromTarget(e.target);
        if (cardIndex === null) return;
        dragCardIndex.current = cardIndex;
        startY.current = e.clientY;
        maxDelta.current = 0;
        scrollHandoff.current = false;
        setDragOffset(0);
        setIsDragging(false);
        // Capture pointer so move/up fire even outside the element
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (dragCardIndex.current === null) return;
        const delta = e.clientY - startY.current;
        const absDelta = Math.abs(delta);
        if (absDelta > maxDelta.current) maxDelta.current = absDelta;

        if (absDelta <= TAP_THRESHOLD) return;

        // In stacked state, upward swipe → release pointer capture so the browser
        // handles native scroll natively. No React state changes needed — avoids
        // the flicker caused by onScroll → setScrollY → re-render loop.
        if (focusedIndex === null && delta < 0 && !scrollHandoff.current) {
            scrollHandoff.current = true;
            dragCardIndex.current = null;
            setIsDragging(false);
            setDragOffset(0);
            // Releasing capture lets pointer events flow to the scroll container
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            return;
        }

        if (scrollHandoff.current) return;

        setIsDragging(true);

        // Track drag direction for commit decision
        dragDir.current = delta > 0 ? 1 : -1;

        // Non-linear damping: 1:1 up to CARD_HEIGHT, then 0.2 damping
        let offset = delta;
        if (absDelta > CARD_HEIGHT) {
            const sign = delta > 0 ? 1 : -1;
            const overflow = absDelta - CARD_HEIGHT;
            offset = sign * (CARD_HEIGHT + overflow * 0.2);
        }

        setDragOffset(offset);
    }, [focusedIndex]);

    const handlePointerUp = useCallback(() => {
        const wasDrag = maxDelta.current > TAP_THRESHOLD;
        const cardIndex = dragCardIndex.current;

        if (scrollHandoff.current) {
            dragCardIndex.current = null;
            scrollHandoff.current = false;
            return;
        }

        if (!wasDrag && cardIndex !== null) {
            // Tap → toggle focus
            setFocusedIndex(prev => (prev === cardIndex ? null : cardIndex));
        } else if (wasDrag && cardIndex !== null) {
            // Smart commit: if dragged past COMMIT_THRESHOLD, commit new position
            if (maxDelta.current >= COMMIT_THRESHOLD) {
                const expandingDown = dragDir.current > 0;
                if (focusedIndex === null && expandingDown) {
                    // Stacked state, dragged down → expand that card
                    setFocusedIndex(cardIndex);
                } else if (focusedIndex !== null && !expandingDown) {
                    // Expanded state, dragged up → collapse
                    setFocusedIndex(null);
                }
            }
            // else: spring back (do nothing, offset resets to 0 below)
        }

        dragCardIndex.current = null;
        setIsDragging(false);
        setDragOffset(0);
    }, [focusedIndex]);

    // ── Style builder ─────────────────────────────────────────────────────────

    const cardStyle = (index: number): React.CSSProperties => {
        const baseTop = getCardBaseTop(index, focusedIndex);

        let extra = 0;
        if (isDragging && dragCardIndex.current !== null) {
            const di = dragCardIndex.current;
            if (index >= di) {
                // Card N and all higher-z cards on top move together.
                // This reveals Card N-1 (the one behind/below in z-order).
                extra = dragOffset;
            } else {
                // Cards behind (lower z) get a small sympathetic nudge.
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
            className="relative mx-6 touch-none"
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
