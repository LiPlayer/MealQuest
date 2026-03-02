import {View, Text} from '@tarojs/components';
import React from 'react';

interface BalanceCardProps {
    style?: React.CSSProperties;
    principal?: number;
    bonus?: number;
}

export default function P02_BalanceCard({ style, principal = 120, bonus = 0 }: BalanceCardProps) {
    const total = principal + bonus;
    const principalRatio = total > 0 ? principal / total : 0;
    const bonusRatio = total > 0 ? bonus / total : 0;

    return (
        <View
            style={{
                ...style,
                backgroundImage:
                    'radial-gradient(circle at 90% 10%, rgba(14,165,233,0.16), transparent 40%), linear-gradient(150deg, rgba(2,132,199,0.08), rgba(250,250,250,0.96) 52%, #ffffff 100%)'
            }}
            className='relative w-full rounded-3xl overflow-hidden border box-border text-slate-900'
        >
            <View className='h-full flex flex-col box-border card-shell'>
                <View className='card-header'>
                    <Text className='card-title'>聚宝金库</Text>
                    <View className='card-chip card-chip--accent'>
                        <Text className='card-chip__text'>可支付</Text>
                    </View>
                </View>

                <View className='balance-main'>
                    <Text className='balance-total-label'>总资产</Text>
                    <Text className='balance-total-value'>¥{total.toFixed(2)}</Text>
                </View>

                <View className='balance-split'>
                    <View className='balance-split__row'>
                        <Text className='balance-split__label'>本金</Text>
                        <Text className='balance-split__value'>¥{principal.toFixed(2)}</Text>
                    </View>
                    <View className='balance-split__bar'>
                        <View
                            className='balance-split__bar-fill'
                            style={{width: `${Math.max(6, principalRatio * 100)}%`}}
                        />
                    </View>
                </View>

                <View className='balance-split'>
                    <View className='balance-split__row'>
                        <Text className='balance-split__label'>赠送金</Text>
                        <Text className='balance-split__value'>¥{bonus.toFixed(2)}</Text>
                    </View>
                    <View className='balance-split__bar'>
                        <View
                            className='balance-split__bar-fill balance-split__bar-fill--bonus'
                            style={{width: `${Math.max(6, bonusRatio * 100)}%`}}
                        />
                    </View>
                </View>
            </View>
        </View>
    );
}
