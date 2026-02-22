import {View, Text} from '@tarojs/components';
import React from 'react';

interface FragmentCardProps {
    style?: React.CSSProperties;
    commonCount?: number;
    rareCount?: number;
}

export default function P04_FragmentCard({
    style,
    commonCount = 12,
    rareCount = 2,
}: FragmentCardProps) {
    const synthesisReady = commonCount >= 8 && rareCount >= 1;

    return (
        <View
            style={{
                ...style,
                backgroundImage:
                    'radial-gradient(circle at 100% 0%, rgba(34,211,238,0.22), transparent 38%), linear-gradient(155deg, rgba(239,246,255,0.96), #ffffff 60%)',
            }}
            className="relative w-full rounded-3xl overflow-hidden border border-cyan-100 box-border text-slate-900">
            <View className="h-full flex flex-col box-border card-shell">
                <View className="card-header">
                    <Text className="card-title">食福碎片</Text>
                    <View className={`card-chip ${synthesisReady ? 'card-chip--accent' : ''}`}>
                        <Text className="card-chip__text">
                            {synthesisReady ? '可合成' : '积累中'}
                        </Text>
                    </View>
                </View>

                <View className="fragment-grid">
                    <View className="fragment-pill">
                        <Text className="fragment-pill__emoji">📦</Text>
                        <View>
                            <Text className="fragment-pill__label">普通碎片</Text>
                            <Text className="fragment-pill__value">{commonCount}</Text>
                        </View>
                    </View>
                    <View className="fragment-pill fragment-pill--rare">
                        <Text className="fragment-pill__emoji">💎</Text>
                        <View>
                            <Text className="fragment-pill__label">稀有碎片</Text>
                            <Text className="fragment-pill__value">{rareCount}</Text>
                        </View>
                    </View>
                </View>

                <View className="fragment-cta">
                    <Text className="fragment-cta__title">下一步：合成口福红包</Text>
                    <Text className="fragment-cta__desc">
                        普通 8 + 稀有 1 可兑换一次高价值口福红包。
                    </Text>
                </View>
            </View>
        </View>
    );
}

