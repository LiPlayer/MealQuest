import { View, Text } from '@tarojs/components';

const ACTIVITIES = [
    {
        id: 1,
        title: '新人进店礼',
        desc: '一两碎银开星程',
        icon: '🎁',
        color: 'bg-rose-50',
        textColor: 'text-rose-600',
        tag: 'NEW'
    },
    {
        id: 2,
        title: '步数挑战赛',
        desc: '用脚步衡量美味，赢取稀有碎片',
        icon: '👟',
        color: 'bg-blue-50',
        textColor: 'text-blue-600',
        tag: 'DAILY'
    },
    {
        id: 3,
        title: '聚宝金库限时礼',
        desc: '充 200 送 20，再享 8 折特权',
        icon: '💰',
        color: 'bg-amber-50',
        textColor: 'text-amber-600',
        tag: 'HOT'
    }
];

export default function ActivityArea() {
    return (
        <View className='px-0 pt-2 pb-6 flex flex-col gap-6'>
            {/* Header */}
            <View className='px-4 flex flex-row items-center justify-between'>
                <Text className='text-lg font-bold text-gray-800'>精选特惠</Text>
                <Text className='text-xs text-gray-400 font-medium'>查看全部</Text>
            </View>

            {/* Activities List */}
            <View className='px-4 flex flex-col gap-4'>
                {ACTIVITIES.map((activity) => (
                    <View
                        key={activity.id}
                        className='relative overflow-hidden transition-all duration-200 rounded-2xl bg-white border border-gray-100 p-5 flex flex-row items-center gap-5 shadow-sm'
                    >
                        {/* Decorative Background Element */}
                        <View className={`absolute -right-4 -bottom-4 w-24 h-24 ${activity.color} rounded-full opacity-50 blur-2xl`} />

                        {/* Icon Container */}
                        <View className={`w-14 h-14 rounded-2xl ${activity.color} flex-shrink-0 flex items-center justify-center text-3xl shadow-inner relative z-10`}>
                            {activity.icon}
                        </View>

                        {/* Content */}
                        <View className='flex-1 flex flex-col gap-1 relative z-10 text-ellipsis whitespace-nowrap overflow-hidden'>
                            <View className='flex flex-row items-center gap-2'>
                                <Text className='text-base font-bold text-gray-900'>{activity.title}</Text>
                                <View className={`px-1 py-1 rounded font-black tracking-tighter ${activity.color} ${activity.textColor}`} style={{ fontSize: '10px' }}>
                                    {activity.tag}
                                </View>
                            </View>
                            <Text className='text-xs text-gray-500 font-medium'>{activity.desc}</Text>
                        </View>

                        {/* Arrow */}
                        <View className='text-gray-300 relative z-10 mr-1'>→</View>
                    </View>
                ))}
            </View>

            {/* Safety space for the bottom dock and to ensure scrollability */}
            <View style={{ height: '400px' }} />
        </View>
    );
}
