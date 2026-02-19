import { View, Text } from '@tarojs/components'
import React from 'react'

interface SilverCardProps {
    style?: React.CSSProperties
}

export default function P01_SilverCard({ style }: SilverCardProps) {
    return (
        <View
            style={style}
            className='relative w-full rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 box-border text-indigo-900'
        >
            <View className='h-full flex flex-col box-border'>
                {/* 3.1.1 Header (Summary Area / Fixed) */}
                <View className='flex flex-row items-center justify-between p-6 box-border shrink-0' style={{ height: '60px' }}>
                    <View className='flex flex-row items-center gap-2'>
                        <Text className='text-base font-bold'>寻味碎银</Text>
                    </View>

                    {/* Middle: Step Capsule */}
                    <View className="bg-gradient-to-r from-gray-900 to-black px-2 py-1 rounded-full flex flex-row items-center gap-1">
                        <Text style={{ fontSize: '10px' }}>👟</Text>
                        <Text className='font-bold' style={{ fontSize: '10px' }}>8,420</Text>
                    </View>

                    {/* Right: Amount */}
                    <View className='flex flex-row items-baseline gap-1'>
                        <Text className='text-xl font-black'>12,850</Text>
                        <Text className='font-bold opacity-60' style={{ fontSize: '10px' }}>两</Text>
                    </View>
                </View>
            </View>

            {/* Background Decor */}
            <View className='absolute -bottom-12 -right-12 w-48 h-48 rounded-full blur-3xl pointer-events-none' style={{ backgroundColor: 'rgba(99,102,241,0.05)' }}></View>
        </View>
    )
}
