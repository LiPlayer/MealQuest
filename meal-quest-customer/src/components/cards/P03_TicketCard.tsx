import { View, Text } from '@tarojs/components'
import React from 'react'

interface TicketCardProps {
    style?: React.CSSProperties
}

export default function P03_TicketCard({ style }: TicketCardProps) {
    return (
        <View
            style={style}
            className="relative w-full rounded-3xl overflow-hidden bg-slate-50 border border-slate-200 box-border text-slate-900"
        >
            <View className="h-full flex flex-col box-border">
                {/* 3.3.1 Header (Fixed) */}
                <View className="flex flex-row items-center justify-between p-6 h-[60px] box-border shrink-0">
                    <Text className="font-bold text-base">口福红包</Text>
                    <View className="px-2 py-0.5 bg-red-100 rounded-md">
                        <Text className="text-[10px] text-red-600 font-black tracking-widest">3 VOUCHERS</Text>
                    </View>
                </View>
            </View>
        </View>
    )
}
