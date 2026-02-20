import { View, Text } from '@tarojs/components'
import React from 'react'

interface TicketCardProps {
    style?: React.CSSProperties
}

export default function P03_TicketCard({ style }: TicketCardProps) {
    return (
        <View
            style={{
                ...style,
                backgroundImage: 'linear-gradient(to bottom right, rgba(255,241,242,0.3), #ffffff)',
                borderColor: 'rgba(255,228,230,0.5)'
            }}
            className='relative w-full rounded-3xl overflow-hidden bg-gradient-to-br to-white border box-border text-slate-900'
        >
            <View className='h-full flex flex-col box-border'>
                {/* 3.3.1 Header (Fixed) */}
                <View className='card-header'>
                    <Text className='card-title'>口福红包</Text>
                    <View className="card-badge" style={{ backgroundColor: 'rgba(255,228,230,0.8)' }}>
                        <Text className='text-rose-600 card-badge-text'>3 VOUCHERS</Text>
                    </View>
                </View>
            </View>
        </View>
    )
}
