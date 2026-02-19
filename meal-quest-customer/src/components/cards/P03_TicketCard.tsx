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
                <View className='flex flex-row items-center justify-between p-6 box-border shrink-0' style={{ height: '60px' }}>
                    <Text className='font-bold text-base'>口福红包</Text>
                    <View className="bg-red-100 px-1 py-1 rounded">
                        <Text className='text-red-600 font-black tracking-widest' style={{ fontSize: '10px' }}>3 VOUCHERS</Text>
                    </View>
                </View>
            </View>
        </View>
    )
}
