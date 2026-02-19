import { View, Text } from '@tarojs/components'
import React from 'react'

interface BalanceCardProps {
    style?: React.CSSProperties
}

export default function P02_BalanceCard({ style }: BalanceCardProps) {
    return (
        <View
            style={style}
            className='relative w-full rounded-3xl overflow-hidden bg-white border border-gray-100 box-border text-gray-900'
        >
            <View className='h-full flex flex-col box-border'>
                {/* 3.2.1 Header (Fixed) */}
                <View className='flex flex-row items-center justify-between p-6 box-border shrink-0' style={{ height: '60px' }}>
                    <Text className='font-bold text-base'>聚宝金库</Text>
                    <Text className='text-xl font-black italic tracking-tight'>¥120.00</Text>
                </View>
            </View>
        </View>
    )
}
