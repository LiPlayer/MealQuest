import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import React from 'react'

interface SilverCardProps {
    style?: React.CSSProperties
    silver?: number
    steps?: number
}

const formatNumber = (value: number) => value.toLocaleString('zh-CN');

export default function P01_SilverCard({ style, silver = 12850, steps = 8420 }: SilverCardProps) {
    return (
        <View
            style={{
                ...style,
                backgroundImage: 'linear-gradient(to bottom right, rgba(238,242,255,0.5), #ffffff)',
                borderColor: 'rgba(224,231,255,0.5)'
            }}
            className='relative w-full rounded-3xl overflow-hidden bg-gradient-to-br to-white border box-border text-slate-900'
        >
            <View className='h-full flex flex-col box-border'>
                <View className='card-header'>
                    <View className='flex flex-row items-center space-x-2'>
                        <Text className='card-title'>寻味碎银</Text>
                    </View>

                    {/* Middle: Step Capsule */}
                    <View className="card-step-capsule bg-gradient-to-r from-gray-900 to-black">
                        <Text className='card-step-emoji'>👟</Text>
                        <Text className='card-step-value' style={{ color: 'white' }}>{formatNumber(steps)}</Text>
                    </View>

                    {/* Right: Amount */}
                    <View className='flex flex-row items-baseline space-x-2'>
                        <Text className='card-amount-value'>{formatNumber(silver)}</Text>
                        <Text className='card-amount-unit'>两</Text>
                    </View>
                </View>
            </View>

            {/* Background Decor */}
            <View
                className='absolute rounded-full blur-3xl pointer-events-none'
                style={{
                    bottom: Taro.pxTransform(-48),
                    right: Taro.pxTransform(-48),
                    width: Taro.pxTransform(192),
                    height: Taro.pxTransform(192),
                    backgroundColor: 'rgba(99,102,241,0.05)'
                }}
            />
        </View>
    )
}
