import { View, Text, Button } from '@tarojs/components'
import React from 'react'

export default function CustomerBottomDock() {
    return (
        <View className="fixed bottom-6 left-6 right-6 z-50 max-w-md mx-auto pointer-events-none">
            {/* Crystal Dock Container - pointer-events-auto for children */}
            <View className="bg-white/70 backdrop-blur-xl border border-white/40 shadow-xl rounded-2xl p-2 flex flex-row items-center gap-3 ring-1 ring-black/5 pointer-events-auto box-border">

                {/* Payment Main Button */}
                <Button className="flex-1 bg-gradient-to-r from-gray-900 to-black text-white h-12 rounded-xl flex flex-row items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform m-0">
                    <Text className="w-5 h-5 text-orange-400">🤳</Text>
                    <Text className="font-bold tracking-wide">双模收银</Text>
                </Button>

                {/* Secondary Action */}
                <View className="w-12 h-12 bg-white/50 rounded-xl flex items-center justify-center active:scale-95 transition-transform">
                    <Text className="w-6 h-6 text-gray-700 text-center leading-[3rem]">📱</Text>
                </View>
            </View>
        </View>
    )
}
