import { View, Text } from '@tarojs/components';

export default function ShopBrand() {
    return (
        <View className='px-0 py-5 flex flex-row items-center gap-4'>
            {/* Shop Logo - Using a high-quality placeholder for now */}
            <View className='w-16 h-16 rounded-2xl overflow-hidden shadow-lg border-2 border-white flex-shrink-0 bg-orange-100 flex items-center justify-center'>
                <Text className='text-3xl font-bold text-orange-400'>探</Text>
            </View>

            {/* Shop Info */}
            <View className='flex-1 flex flex-col gap-1'>
                <View className='flex flex-row items-center gap-2'>
                    <Text className='text-2xl font-bold text-gray-900 tracking-tight'>探味轩</Text>
                    <View className='px-2 py-1 rounded-full bg-emerald-100 flex flex-row items-center gap-1'>
                        <View className='w-1 h-1 rounded-full bg-emerald-500 animate-pulse' />
                        <Text className='font-bold text-emerald-700 uppercase tracking-widest' style={{ fontSize: '10px' }}>正在营业</Text>
                    </View>
                </View>
                <Text className='text-sm text-gray-500 font-medium'>寻千种风味，遇百道好菜 · 悦海园路店</Text>
            </View>
        </View>
    );
}
