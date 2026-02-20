import { View, Text } from '@tarojs/components'
import React from 'react'

interface BalanceCardProps {
    style?: React.CSSProperties
}

export default function P02_BalanceCard({ style }: BalanceCardProps) {
    return (
        <View
            style={style}
            className='relative w-full rounded-3xl overflow-hidden bg-gradient-to-br from-slate-50/50 to-white border border-slate-100 box-border text-slate-900'
        >
            <View className='h-full flex flex-col box-border'>
                {/* 3.2.1 Header (Fixed) */}
                <View className='card-header'>
                    <Text className='card-title'>聚宝金库</Text>
                    <Text className='italic tracking-tight card-amount-value'>¥120.00</Text>
                </View>
            </View>
        </View>
    )
}
