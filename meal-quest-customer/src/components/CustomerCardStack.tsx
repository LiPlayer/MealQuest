import { View } from '@tarojs/components';
import type { ITouchEvent } from '@tarojs/components/types/common';
import Taro from '@tarojs/taro';
import React, { useMemo, useRef, useState } from 'react';

import P01_SilverCard from './cards/P01_SilverCard';
import P02_BalanceCard from './cards/P02_BalanceCard';
import P03_TicketCard from './cards/P03_TicketCard';
import P04_FragmentCard from './cards/P04_FragmentCard';

const HEADER_H = 60; // Visible "Forehead" in stacked state (rpx)
const CARD_RATIO = 1.586;
const DRAG_THRESHOLD = 6;
const DISMISS_THRESHOLD = HEADER_H * 1.2;
const EDGE_RESISTANCE = 72;

interface CardItem {
    key: string;
    title: string;
    Component: React.ComponentType<{ style?: React.CSSProperties }>;
}

interface GestureState {
    index: number;
    startX: number;
    startY: number;
    isDragging: boolean;
    didDrag: boolean;
    delegatedToScroll: boolean;
    thresholdFired: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const applyEdgeResistance = (overflow: number) => {
    if (overflow <= 0) {
        return 0;
    }

    return EDGE_RESISTANCE * (1 - Math.exp(-overflow / EDGE_RESISTANCE));
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
    const topCardIndex = totalCards - 1;

    const [offsets, setOffsets] = useState<number[]>(() => new Array(totalCards).fill(0));
    const [isDragging, setIsDragging] = useState(false);
    const gestureRef = useRef<GestureState | null>(null);

    const computeOffsets = (index: number, rawDy: number) => {
        let dy = rawDy;

        if (dy > 0) {
            const overflow = Math.max(0, dy - HEADER_H * (topCardIndex - index));
            if (overflow > 0) {
                dy = dy - overflow + applyEdgeResistance(overflow);
            }
        } else if (dy < 0) {
            const overflow = Math.max(0, -dy - HEADER_H * index);
            if (overflow > 0) {
                dy = dy + overflow - applyEdgeResistance(overflow);
            }
        }

        const next = new Array(totalCards).fill(0);
        next[index] = dy;

        if (dy > 0) {
            for (let i = index + 1; i < totalCards; i += 1) {
                next[i] = Math.max(0, next[i - 1] - HEADER_H);
            }
        } else if (dy < 0) {
            for (let i = index - 1; i >= 0; i -= 1) {
                next[i] = Math.min(0, next[i + 1] + HEADER_H);
            }
        }

        return next.map((value) => clamp(value, -HEADER_H * 2, HEADER_H * 2));
    };

    const onTouchStart = (index: number, e: ITouchEvent) => {
        const touch = e.touches?.[0];
        if (!touch) {
            return;
        }

        gestureRef.current = {
            index,
            startX: touch.clientX,
            startY: touch.clientY,
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

        const dx = touch.clientX - gesture.startX;
        const dy = touch.clientY - gesture.startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (!gesture.isDragging) {
            if (absDy < DRAG_THRESHOLD || absDy < absDx) {
                return;
            }

            // Upward drag on the top card should still feed native page scroll.
            if (dy < 0 && gesture.index === topCardIndex) {
                gesture.delegatedToScroll = true;
                return;
            }

            gesture.isDragging = true;
            gesture.didDrag = true;
            setIsDragging(true);
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

        if (!gesture.thresholdFired && Math.abs(dy) >= DISMISS_THRESHOLD) {
            gesture.thresholdFired = true;
            safeVibrate('medium');
        }
    };

    const resetStack = () => {
        setOffsets(new Array(totalCards).fill(0));
        setIsDragging(false);
    };

    const onTouchEnd = () => {
        const gesture = gestureRef.current;
        if (!gesture) {
            return;
        }

        if (gesture.delegatedToScroll) {
            gestureRef.current = null;
            return;
        }

        resetStack();
        gestureRef.current = null;
    };

    const onCardTap = (index: number) => {
        const gesture = gestureRef.current;
        if (gesture?.didDrag) {
            return;
        }

        const target = cards[index];
        if (!target) {
            return;
        }

        safeVibrate('light');
        void Taro.showToast({
            title: `${target.title}详情开发中`,
            icon: 'none',
            duration: 1200
        });
    };

    return (
        <View
            className='relative select-none box-border customer-card-stack'
            style={{
                height: `calc(${Taro.pxTransform((totalCards - 1) * HEADER_H + 32)} + (100vw - 64rpx) / ${CARD_RATIO})`,
                paddingBottom: Taro.pxTransform(32),
                width: '100%'
            }}
        >
            {cards.map(({ key, Component }, index) => (
                <View
                    key={key}
                    onTap={() => onCardTap(index)}
                    onTouchStart={(e) => onTouchStart(index, e as ITouchEvent)}
                    onTouchMove={(e) => onTouchMove(e as ITouchEvent)}
                    onTouchEnd={onTouchEnd}
                    onTouchCancel={onTouchEnd}
                    style={{
                        position: 'absolute',
                        top: Taro.pxTransform(index * HEADER_H + offsets[index]),
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
            ))}
        </View>
    );
}
