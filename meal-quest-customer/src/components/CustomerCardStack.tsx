import { View } from '@tarojs/components';
import type { ITouchEvent } from '@tarojs/components/types/common';
import Taro from '@tarojs/taro';
import React, { useMemo, useRef, useState } from 'react';

import P01_SilverCard from './cards/P01_SilverCard';
import P02_BalanceCard from './cards/P02_BalanceCard';
import P03_TicketCard from './cards/P03_TicketCard';
import P04_FragmentCard from './cards/P04_FragmentCard';

const HEADER_H = 60; // Card header height (rpx)
const CARD_RATIO = 1.586;
const DRAG_THRESHOLD = 6;
const FLING_VELOCITY = 0.6; // Velocity threshold for fling gesture
const EDGE_RESISTANCE = 80;

const PX_TO_RPX = 750 / Taro.getSystemInfoSync().windowWidth;

interface CardItem {
    key: string;
    title: string;
    Component: React.ComponentType<{ style?: React.CSSProperties }>;
}

interface GestureState {
    index: number;
    startX: number; // rpx
    startY: number; // rpx
    startTime: number;
    lastTime: number;
    lastY: number; // rpx
    velocity: number; // rpx/ms
    isDragging: boolean;
    didDrag: boolean;
    delegatedToScroll: boolean;
    thresholdFired: boolean;
}


const applyEdgeResistance = (dy: number, cardHeight: number) => {
    const absDy = Math.abs(dy);
    if (absDy <= cardHeight) {
        return dy;
    }

    const sign = dy > 0 ? 1 : -1;
    const overflow = absDy - cardHeight;
    const resisted = cardHeight + EDGE_RESISTANCE * (1 - Math.exp(-overflow / EDGE_RESISTANCE));
    return resisted * sign;
};

const safeVibrate = (type: 'light' | 'medium') => {
    try {
        Taro.vibrateShort({ type });
    } catch {
        // H5/unsupported environments are expected to fail silently.
    }
};

export default function CustomerCardStack() {
    const cards = useMemo<CardItem[]>(() => [
        { key: 'p02', title: '聚宝金库', Component: P02_BalanceCard },
        { key: 'p01', title: '寻味碎银', Component: P01_SilverCard },
        { key: 'p04', title: '食福碎片', Component: P04_FragmentCard },
        { key: 'p03', title: '口福红包', Component: P03_TicketCard }
    ], []);
    const totalCards = cards.length;

    const [offsets, setOffsets] = useState<number[]>(() => new Array(totalCards).fill(0));
    const [focusIndex, setFocusIndex] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const gestureRef = useRef<GestureState | null>(null);

    // cardHeightInRpx = (750 - 64) / CARD_RATIO (Since aspect ratio is fixed and we have 32rpx margins)
    const CARD_WIDTH_RPX = 750 - 64;
    const CARD_H_RPX = Math.floor(CARD_WIDTH_RPX / CARD_RATIO);
    const FOCUS_SHIFT_RPX = CARD_H_RPX - HEADER_H;

    const computeOffsets = (index: number, rawDy: number) => {
        const dy = applyEdgeResistance(rawDy, CARD_H_RPX);
        const next = new Array(totalCards).fill(0);
        next[index] = dy;

        // Recursive Push logic
        if (dy < 0) {
            // Push towards lower indices (Index - 1)
            for (let i = index; i > 0; i -= 1) {
                if (next[i] < next[i - 1]) {
                    next[i - 1] = next[i];
                }
            }
        } else if (dy > 0) {
            // Push towards higher indices (Index + 1)
            for (let i = index; i < totalCards - 1; i += 1) {
                if (next[i] > next[i + 1]) {
                    next[i + 1] = next[i];
                }
            }
        }

        return next;
    };

    const onTouchStart = (index: number, e: ITouchEvent) => {
        const touch = e.touches?.[0];
        if (!touch) {
            return;
        }

        if (focusIndex !== null) {
            setFocusIndex(null);
        }

        gestureRef.current = {
            index,
            startX: touch.clientX * PX_TO_RPX,
            startY: touch.clientY * PX_TO_RPX,
            startTime: Date.now(),
            lastTime: Date.now(),
            lastY: touch.clientY * PX_TO_RPX,
            velocity: 0,
            isDragging: false,
            didDrag: false,
            delegatedToScroll: false,
            thresholdFired: false
        };
    };

    const onTouchMove = (e: ITouchEvent) => {
        const gesture = gestureRef.current;
        const touch = e.touches?.[0];
        if (!gesture || !touch) {
            return;
        }

        const dx = (touch.clientX * PX_TO_RPX) - gesture.startX;
        const dy = (touch.clientY * PX_TO_RPX) - gesture.startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (!gesture.isDragging) {
            if (absDy < DRAG_THRESHOLD || absDy < absDx) {
                return;
            }

            // Upward drag on any card should still feed native page scroll.
            if (dy < 0) {
                gesture.delegatedToScroll = true;
                return;
            }

            gesture.isDragging = true;
            gesture.didDrag = true;
            setIsDragging(true);
            setFocusIndex(null); // Clear focus on drag
            safeVibrate('light');
        }

        if (gesture.delegatedToScroll) {
            return;
        }

        e.stopPropagation();
        if (typeof e.preventDefault === 'function') {
            e.preventDefault();
        }

        const nextOffsets = computeOffsets(gesture.index, dy);
        setOffsets(nextOffsets);

        // Velocity tracking (rpx/ms)
        const now = Date.now();
        const dt = now - gesture.lastTime;
        if (dt > 10) {
            const currentY = touch.clientY * PX_TO_RPX;
            gesture.velocity = (currentY - gesture.lastY) / dt;
            gesture.lastTime = now;
            gesture.lastY = currentY;
        }

        if (!gesture.thresholdFired && Math.abs(dy) >= CARD_H_RPX) {
            gesture.thresholdFired = true;
            safeVibrate('medium');
        }
    };

    const resetStack = () => {
        setOffsets(new Array(totalCards).fill(0));
        setIsDragging(false);
    };

    const onTouchEnd = (e: ITouchEvent) => {
        const gesture = gestureRef.current;
        if (!gesture) {
            return;
        }

        if (gesture.delegatedToScroll) {
            gestureRef.current = null;
            return;
        }

        if (gesture.isDragging) {
            // Use changedTouches to get the final coordinate accurately
            const touch = e.changedTouches?.[0];
            if (touch) {
                const finalY = touch.clientY * PX_TO_RPX;
                const dy = finalY - gesture.startY;
                const isFlingDown = gesture.velocity > FLING_VELOCITY;
                const isPushDownFar = dy > (CARD_H_RPX * 0.5);

                if (isFlingDown || isPushDownFar) {
                    // Dragging Card N down should peek Card N itself,
                    // so Card N-1 can be revealed behind it.
                    onCardTap(gesture.index, true);
                }
            }
            resetStack();
        } else {
            // It was a tap!
            onCardTap(gesture.index);
        }

        setTimeout(() => {
            gestureRef.current = null;
        }, 100);
    };

    const onCardTap = (index: number, forcePeek = false) => {
        const target = cards[index];
        if (!target) {
            return;
        }

        if (forcePeek) {
            if (focusIndex !== index) {
                safeVibrate('medium');
                setFocusIndex(index);
            }
        } else {
            safeVibrate('light');
            setFocusIndex(prev => (prev === index ? null : index));
        }
    };

    return (
        <View
            className='relative select-none box-border customer-card-stack'
            style={{
                height: `calc(${Taro.pxTransform(Math.round((totalCards - 1) * HEADER_H + (focusIndex !== null ? FOCUS_SHIFT_RPX : 0) + 32))} + (100vw - 64rpx) / ${CARD_RATIO})`,
                paddingBottom: Taro.pxTransform(32),
                width: '100%',
                transition: 'height 260ms cubic-bezier(0.22, 1, 0.36, 1)'
            }}
        >
            {cards.map(({ key, Component }, index) => {
                const isShifted = focusIndex !== null && index > focusIndex;
                const currentShift = isShifted ? FOCUS_SHIFT_RPX : 0;

                return (
                    <View
                        key={key}
                        className={`customer-card-item customer-card-item-${index}`}
                        // Remove onTap to avoid duplicate events now that we handle it in onTouchEnd
                        onTouchStart={(e) => onTouchStart(index, e as ITouchEvent)}
                        onTouchMove={(e) => onTouchMove(e as ITouchEvent)}
                        onTouchEnd={(e) => onTouchEnd(e as ITouchEvent)}
                        onTouchCancel={(e) => onTouchEnd(e as ITouchEvent)}
                        style={{
                            position: 'absolute',
                            top: Taro.pxTransform(Math.round(index * HEADER_H + offsets[index] + currentShift)),
                            left: 0,
                            right: 0,
                            aspectRatio: String(CARD_RATIO),
                            zIndex: 10 + index,
                            borderRadius: Taro.pxTransform(48),
                            backgroundColor: '#fff',
                            border: '1PX solid rgba(0,0,0,0.08)',
                            boxShadow: `0 ${Taro.pxTransform(16)} ${Taro.pxTransform(48)} rgba(0,0,0,0.05)`,
                            overflow: 'hidden',
                            transition: isDragging ? 'none' : 'top 260ms cubic-bezier(0.22, 1, 0.36, 1)'
                        }}
                    >
                        <Component style={{ width: '100%', height: '100%' }} />
                    </View>
                );
            })}
        </View>
    );
}
