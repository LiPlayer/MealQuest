import { View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useMemo, useState } from 'react';

import P01_SilverCard from './cards/P01_SilverCard';
import P02_BalanceCard from './cards/P02_BalanceCard';
import P03_TicketCard, { Voucher } from './cards/P03_TicketCard';
import P04_FragmentCard from './cards/P04_FragmentCard';

const HEADER_H = 60; // Card header height (rpx)
const CARD_RATIO = 1.586;

interface CardItem {
    key: string;
    title: string;
}

interface CustomerCardStackProps {
    wallet?: {
        principal: number;
        bonus: number;
        silver: number;
    };
    vouchers?: Voucher[];
    fragments?: {
        common: number;
        rare: number;
    };
}

const safeVibrate = (type: 'light' | 'medium') => {
    try {
        Taro.vibrateShort({ type });
    } catch {
        // H5/unsupported environments are expected to fail silently.
    }
};

export default function CustomerCardStack({
    wallet = { principal: 120, bonus: 0, silver: 12850 },
    vouchers = [],
    fragments = { common: 12, rare: 2 }
}: CustomerCardStackProps) {
    const cards = useMemo<CardItem[]>(() => [
        { key: 'p02', title: '聚宝金库' },
        { key: 'p01', title: '寻味碎银' },
        { key: 'p04', title: '食福碎片' },
        { key: 'p03', title: '口福红包' }
    ], []);

    const totalCards = cards.length;
    const [focusIndex, setFocusIndex] = useState<number | null>(null);

    // cardHeightInRpx = (750 - 64) / CARD_RATIO (Since aspect ratio is fixed and we have 32rpx margins)
    const CARD_WIDTH_RPX = 750 - 64;
    const CARD_H_RPX = Math.floor(CARD_WIDTH_RPX / CARD_RATIO);
    const FOCUS_SHIFT_RPX = CARD_H_RPX - HEADER_H;

    const onCardTap = (index: number) => {
        const target = cards[index];
        if (!target) {
            return;
        }
        safeVibrate('light');
        setFocusIndex(prev => (prev === index ? null : index));
    };

    const handleCollapseP03AndExpandP04 = () => {
        setFocusIndex(2); // P04 is index 2
    };

    const focusLayout = useMemo(() => {
        const shifts = new Array(totalCards).fill(0);
        if (focusIndex === null) {
            return shifts;
        }

        for (let i = 0; i < totalCards; i += 1) {
            // Click-to-peek only moves covering upper-layer cards away.
            if (i > focusIndex) {
                shifts[i] = FOCUS_SHIFT_RPX;
            }
        }

        return shifts;
    }, [FOCUS_SHIFT_RPX, focusIndex, totalCards]);

    const cardTops = useMemo(
        () => cards.map((_, index) => (index * HEADER_H) + focusLayout[index]),
        [cards, focusLayout]
    );

    const stackHeight = useMemo(
        () => Math.max(...cardTops) + CARD_H_RPX + 32,
        [CARD_H_RPX, cardTops]
    );

    return (
        <View
            className='relative select-none box-border customer-card-stack'
            style={{
                height: Taro.pxTransform(Math.round(stackHeight)),
                paddingBottom: Taro.pxTransform(32),
                width: '100%',
                transition: 'height 400ms cubic-bezier(0.22, 1, 0.36, 1)'
            }}
        >
            {cards.map(({ key }, index) => {
                const isFocused = focusIndex === index;
                const shouldDim = focusIndex !== null && !isFocused;
                return (
                    <View
                        key={key}
                        className={`customer-card-item customer-card-item-${index} ${isFocused ? 'is-focused' : ''}`}
                        onTap={() => onCardTap(index)}
                        style={{
                            position: 'absolute',
                            top: Taro.pxTransform(Math.round(cardTops[index])),
                            left: 0,
                            right: 0,
                            aspectRatio: String(CARD_RATIO),
                            zIndex: 10 + index,
                            borderRadius: Taro.pxTransform(48),
                            backgroundColor: '#fff',
                            border: isFocused
                                ? '1PX solid rgba(14,165,233,0.34)'
                                : '1PX solid rgba(15,23,42,0.08)',
                            boxShadow: isFocused
                                ? `0 ${Taro.pxTransform(28)} ${Taro.pxTransform(74)} rgba(15,23,42,0.18)`
                                : `0 ${Taro.pxTransform(16)} ${Taro.pxTransform(46)} rgba(15,23,42,0.08)`,
                            transform: `scale(${isFocused ? 1.01 : 1})`,
                            opacity: shouldDim ? 0.92 : 1,
                            overflow: 'hidden',
                            transition: 'all 400ms cubic-bezier(0.22, 1, 0.36, 1)'
                        }}
                    >
                        {key === 'p03' && (
                            <P03_TicketCard
                                style={{ width: '100%', height: '100%' }}
                                isFocused={isFocused}
                                vouchers={vouchers}
                                onGoToSynthesis={handleCollapseP03AndExpandP04}
                            />
                        )}
                        {key === 'p02' && (
                            <P02_BalanceCard
                                style={{ width: '100%', height: '100%' }}
                                principal={wallet.principal}
                                bonus={wallet.bonus}
                            />
                        )}
                        {key === 'p01' && (
                            <P01_SilverCard
                                style={{ width: '100%', height: '100%' }}
                                silver={wallet.silver}
                            />
                        )}
                        {key === 'p04' && (
                            <P04_FragmentCard
                                style={{ width: '100%', height: '100%' }}
                                commonCount={fragments.common}
                                rareCount={fragments.rare}
                            />
                        )}
                    </View>
                );
            })}
        </View>
    );
}
