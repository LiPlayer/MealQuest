import { View, Text } from '@tarojs/components'
import React from 'react'
import './P03_TicketCard.scss'

interface TicketCardProps {
    style?: React.CSSProperties
    isFocused?: boolean
    onGoToSynthesis?: () => void
}

export default function P03_TicketCard({ style, isFocused, onGoToSynthesis }: TicketCardProps) {
    return (
        <View
            style={{
                ...style,
                backgroundImage: 'linear-gradient(to bottom right, rgba(255,241,242,0.3), #ffffff)',
                borderColor: 'rgba(255,228,230,0.5)'
            }}
            className={`relative w-full rounded-3xl overflow-hidden bg-gradient-to-br to-white border box-border text-slate-900 p03-ticket-card ${isFocused ? 'is-focused' : ''}`}
        >
            <View className='h-full flex flex-col box-border'>
                {/* 3.3.1 Header (Fixed) */}
                <View className='card-header'>
                    <Text className='card-title'>口福红包</Text>
                    <View className="card-badge" style={{ backgroundColor: 'rgba(255,228,230,0.8)' }}>
                        <Text className='text-rose-600 card-badge-text'>3 VOUCHERS</Text>
                    </View>
                </View>

                <View className='card-body'>
                    {/* Asset Preview Area (Compact) */}
                    <View className='asset-preview-area'>
                        <View className='empty-plate-compact'>
                            <View className='plate-inner'></View>
                        </View>
                        <View
                            className='synthesis-btn-compact'
                            onTap={(e) => {
                                e.stopPropagation();
                                onGoToSynthesis?.();
                            }}
                        >
                            <Text>去合成</Text>
                        </View>
                    </View>

                    {/* Full Management Module (Compact) */}
                    <View className='management-module-compact'>
                        <View className='module-section'>
                            <Text className='section-title'>合成工作台 (65%)</Text>
                            <View className='workbench-progress'>
                                <View className='progress-bar' style={{ width: '65%' }}></View>
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    )
}
