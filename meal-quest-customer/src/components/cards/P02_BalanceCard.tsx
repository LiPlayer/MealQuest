import { View, Text } from '@tarojs/components'
import React from 'react'

interface BalanceCardProps {
    style?: React.CSSProperties
    principal?: number
    bonus?: number
}

export default function P02_BalanceCard({ style, principal = 120, bonus = 0 }: BalanceCardProps) {
    const total = principal + bonus;

    return (
        <View
            style={{
                ...style,
                backgroundImage: 'linear-gradient(to bottom right, rgba(248,250,252,0.5), #ffffff)'
            }}
            className='relative w-full rounded-3xl overflow-hidden bg-gradient-to-br to-white border border-slate-100 box-border text-slate-900'
        >
            <View className='h-full flex flex-col box-border'>
                {/* 3.2.1 Header (Fixed) */}
                <View className='card-header'>
                    <Text className='card-title'>聚宝金库</Text>
                    <Text className='italic tracking-tight card-amount-value'>¥{total.toFixed(2)}</Text>
                </View>
                <View style={{ padding: '0 28rpx 24rpx' }}>
                    <Text style={{ fontSize: '24rpx', color: '#475569' }}>本金 ¥{principal.toFixed(2)} / 赠送 ¥{bonus.toFixed(2)}</Text>
                </View>
            </View>
        </View>
    )
}
