import { View, Text } from '@tarojs/components'
import React from 'react'

interface TicketCardProps {
    style?: React.CSSProperties
}

export default function P03_TicketCard({ style }: TicketCardProps) {
    return (
        <View
            style={style}
            className='relative w-full rounded-3xl overflow-hidden bg-slate-50 border border-slate-200 box-border text-slate-900'
        >
            <View className='h-full flex flex-col box-border'>
                {/* 3.3.1 Header (Fixed) */}
                <View className='card-header'>
                    <Text className='card-title'>口福红包</Text>
                    <View className="card-badge bg-red-100">
                        <Text className='text-red-600 card-badge-text'>3 VOUCHERS</Text>
                    </View>
                </View>
            </View>
        </View>
    )
}
