import { View, Text } from '@tarojs/components'
import React from 'react'

interface FragmentCardProps {
    style?: React.CSSProperties
}

export default function P04_FragmentCard({ style }: FragmentCardProps) {
    return (
        <View
            style={style}
            className='relative w-full rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800 box-border text-white'
        >
            <View className='h-full flex flex-col box-border'>
                {/* 3.4.1 Header (Fixed) */}
                <View className='card-header'>
                    <Text className='card-title'>食福碎片</Text>
                    <View className='flex flex-row items-center space-x-4'>
                        <View className='card-fragment-stat'>
                            <Text className='card-fragment-emoji'>📦</Text>
                            <Text className='card-fragment-count'>12</Text>
                        </View>
                        <View className='card-fragment-stat'>
                            <Text className='card-fragment-emoji'>💎</Text>
                            <Text className='card-fragment-count'>2</Text>
                        </View>
                    </View>
                </View>
            </View>

            {/* Background Glow */}
            <View className='absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none' style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}></View>
        </View>
    )
}
