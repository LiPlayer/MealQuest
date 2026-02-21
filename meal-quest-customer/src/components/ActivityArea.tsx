import { View, Text } from '@tarojs/components';
import './ActivityArea.scss';

export interface ActivityItem {
    id: string | number;
    title: string;
    desc: string;
    icon: string;
    color: string;
    textColor: string;
    tag: string;
}

const DEFAULT_ACTIVITIES: ActivityItem[] = [
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

interface ActivityAreaProps {
    activities?: ActivityItem[];
}

export default function ActivityArea({ activities = DEFAULT_ACTIVITIES }: ActivityAreaProps) {
    return (
        <View className='activity-area flex flex-col box-border'>
            {/* Header */}
            <View className='activity-area__header'>
                <Text className='activity-area__header-title'>精选特惠</Text>
                <Text className='activity-area__header-more'>查看全部</Text>
            </View>

            {/* Activities List */}
            <View className='activity-area__list'>
                {activities.map((activity) => (
                    <View
                        key={activity.id}
                        className='activity-area__item'
                    >
                        {/* Decorative Background Element */}
                        <View className={`activity-area__decor ${activity.color}`} />

                        {/* Icon Container */}
                        <View className={`activity-area__icon-container ${activity.color}`}>
                            {activity.icon}
                        </View>

                        {/* Content */}
                        <View className='activity-area__content'>
                            <View className='activity-area__title-row'>
                                <Text className='activity-area__title'>{activity.title}</Text>
                                <View className={`activity-area__tag ${activity.color} ${activity.textColor}`}>
                                    {activity.tag}
                                </View>
                            </View>
                            <Text className='activity-area__desc text-ellipsis whitespace-nowrap overflow-hidden'>{activity.desc}</Text>
                        </View>

                        {/* Arrow */}
                        <View className='activity-area__arrow'>→</View>
                    </View>
                ))}
            </View>

            {/* Safety space for the bottom dock and to ensure scrollability */}
            <View style={{ height: '320rpx' }} />
        </View>
    );
}
