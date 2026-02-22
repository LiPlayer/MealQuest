import {View, Text} from '@tarojs/components';
import Taro from '@tarojs/taro';
import React from 'react';

interface SilverCardProps {
    style?: React.CSSProperties;
    silver?: number;
    steps?: number;
}

const formatNumber = (value: number) => value.toLocaleString('zh-CN');

export default function P01_SilverCard({style, silver = 12850, steps = 8420}: SilverCardProps) {
    const stepMilestone = 10000;
    const stepRatio = Math.min(1, steps / stepMilestone);
    const silverToday = Math.floor((steps / 1000) * 10);

    return (
        <View
            style={{
                ...style,
                backgroundImage:
                    'radial-gradient(circle at 12% 0%, rgba(129,140,248,0.25), transparent 35%), linear-gradient(145deg, rgba(238,242,255,0.92), #ffffff 62%)',
                borderColor: 'rgba(165,180,252,0.55)',
            }}
            className="relative w-full rounded-3xl overflow-hidden border box-border text-slate-900">
            <View className="h-full flex flex-col box-border card-shell">
                <View className="card-header">
                    <Text className="card-title">寻味碎银</Text>
                    <View className="card-chip card-chip--dark">
                        <Text className="card-chip__text card-chip__text--light">步数兑银</Text>
                    </View>
                </View>

                <View className="silver-main-row">
                    <View>
                        <Text className="silver-label">当前碎银</Text>
                        <View className="silver-value-wrap">
                            <Text className="silver-value">{formatNumber(silver)}</Text>
                            <Text className="silver-unit">两</Text>
                        </View>
                    </View>
                    <View className="silver-pill">
                        <Text className="silver-pill__emoji">👟</Text>
                        <Text className="silver-pill__value">{formatNumber(steps)}</Text>
                    </View>
                </View>

                <View className="silver-progress">
                    <View className="silver-progress__meta">
                        <Text className="silver-progress__text">今日可兑 {silverToday} 两</Text>
                        <Text className="silver-progress__text">{Math.floor(stepRatio * 100)}%</Text>
                    </View>
                    <View className="silver-progress__track">
                        <View
                            className="silver-progress__fill"
                            style={{width: `${Math.max(5, stepRatio * 100)}%`}}
                        />
                    </View>
                </View>
            </View>

            <View
                className="absolute rounded-full blur-3xl pointer-events-none"
                style={{
                    bottom: Taro.pxTransform(-48),
                    right: Taro.pxTransform(-48),
                    width: Taro.pxTransform(192),
                    height: Taro.pxTransform(192),
                    backgroundColor: 'rgba(99,102,241,0.16)',
                }}
            />
        </View>
    );
}

