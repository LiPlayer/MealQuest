import { View, Text } from '@tarojs/components'
import React from 'react'

interface FragmentCardProps {
    style?: React.CSSProperties
}

export default function P04_FragmentCard({ style }: FragmentCardProps) {
    return (
        <View
            style={style}
            className="relative w-full rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800 box-border text-white"
        >
            <View className="h-full flex flex-col box-border">
                {/* 3.4.1 Header (Fixed) */}
                <View className="flex flex-row items-center justify-between p-6 h-[60px] box-border shrink-0">
                    <Text className="font-bold text-base">食福碎片</Text>
                    <View className="flex flex-row items-center gap-3">
                        <View className="flex flex-row items-center gap-1">
                            <Text className="text-[10px] opacity-40">📦</Text>
                            <Text className="text-[10px] font-bold">12</Text>
                        </View>
                        <View className="flex flex-row items-center gap-1">
                            <Text className="text-[10px] opacity-40">💎</Text>
                            <Text className="text-[10px] font-bold">2</Text>
                        </View>
                    </View>
                </View>
            </View>

            {/* Background Glow */}
            <View className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></View>
        </View>
    )
}
