import { View, Text, Image } from '@tarojs/components';

interface ShopBrandProps {
    name?: string;
    branchName?: string;
    slogan?: string;
    logo?: string;
    isOpen?: boolean;
}

export default function ShopBrand({
    name = '探味轩',
    branchName = '悦海园路店',
    slogan = '寻千种风味，遇百道好菜',
    logo,
    isOpen = true
}: ShopBrandProps) {
    return (
        <View className='px-0 py-5 flex flex-row items-center gap-4'>
            {/* Shop Logo */}
            <View className='w-16 h-16 rounded-2xl overflow-hidden shadow-lg border-2 border-white flex-shrink-0 bg-orange-100 flex items-center justify-center'>
                {logo ? (
                    <Image src={logo} className='w-full h-full' mode='aspectFill' />
                ) : (
                    <Text className='text-3xl font-bold text-orange-400'>{name.charAt(0)}</Text>
                )}
            </View>

            {/* Shop Info */}
            <View className='flex-1 flex flex-col gap-1'>
                <View className='flex flex-row items-center gap-2'>
                    <Text className='text-2xl font-bold text-gray-900 tracking-tight'>{name}</Text>
                    <View className={`px-2 py-1 rounded-full flex flex-row items-center gap-1 ${isOpen ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                        <View className={`w-1 h-1 rounded-full ${isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                        <Text className={`font-bold uppercase tracking-widest ${isOpen ? 'text-emerald-700' : 'text-gray-500'}`} style={{ fontSize: '10px' }}>
                            {isOpen ? '正在营业' : '休息中'}
                        </Text>
                    </View>
                </View>
                <Text className='text-sm text-gray-500 font-medium'>{slogan} · {branchName}</Text>
            </View>
        </View>
    );
}
