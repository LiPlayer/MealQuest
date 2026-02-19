import { View, Text } from '@tarojs/components'
import React from 'react'

interface SilverCardProps {
    style?: React.CSSProperties
}

export default function P01_SilverCard({ style }: SilverCardProps) {
    return (
        <View
            style={style}
            className="relative w-full rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 box-border text-indigo-900"
        >
            <View className="h-full flex flex-col box-border">
                {/* 3.1.1 Header (Summary Area / Fixed) */}
                <View className="flex flex-row items-center justify-between p-6 h-[60px] box-border shrink-0">
                    <View className="flex flex-row items-center gap-2">
                        <Text className="text-base font-bold">寻味碎银</Text>
                    </View>

                    {/* Middle: Step Capsule */}
                    <View className="bg-black/10 px-2 py-0.5 rounded-full flex flex-row items-center gap-1">
                        <Text className="text-[10px]">👟</Text>
                        <Text className="text-[10px] font-bold">8,420</Text>
                    </View>

                    {/* Right: Amount */}
                    <View className="flex flex-row items-baseline gap-1">
                        <Text className="text-xl font-black">12,850</Text>
                        <Text className="text-[10px] font-bold opacity-60">两</Text>
                    </View>
                </View>
            </View>

            {/* Background Decor */}
            <View className="absolute -bottom-12 -right-12 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></View>
        </View>
    )
}
