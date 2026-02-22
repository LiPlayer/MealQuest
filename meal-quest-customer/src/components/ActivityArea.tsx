import {View, Text} from '@tarojs/components';

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
        tag: 'NEW',
    },
    {
        id: 2,
        title: '步数挑战赛',
        desc: '用脚步衡量美味，赢取稀有碎片',
        icon: '👟',
        color: 'bg-blue-50',
        textColor: 'text-blue-600',
        tag: 'DAILY',
    },
    {
        id: 3,
        title: '聚宝金库限时礼',
        desc: '充 200 送 20，再享 8 折特权',
        icon: '💰',
        color: 'bg-amber-50',
        textColor: 'text-amber-600',
        tag: 'HOT',
    },
];

interface ActivityAreaProps {
    activities?: ActivityItem[];
}

export default function ActivityArea({activities = DEFAULT_ACTIVITIES}: ActivityAreaProps) {
    return (
        <View className="activity-area">
            <View className="activity-area__header">
                <Text className="activity-area__header-title">精选特惠</Text>
                <Text className="activity-area__header-more">策略驱动 · 实时更新</Text>
            </View>

            <View className="activity-area__list">
                {activities.map((activity, index) => (
                    <View key={activity.id} className="activity-area__item">
                        <View className={`activity-area__decor ${activity.color}`} />
                        <View className="activity-area__left">
                            <View className={`activity-area__icon-container ${activity.color}`}>
                                {activity.icon}
                            </View>
                            <View className="activity-area__content">
                                <View className="activity-area__title-row">
                                    <Text className="activity-area__title">{activity.title}</Text>
                                    <View
                                        className={`activity-area__tag ${activity.color} ${activity.textColor}`}>
                                        <Text>{activity.tag}</Text>
                                    </View>
                                </View>
                                <Text className="activity-area__desc">{activity.desc}</Text>
                            </View>
                        </View>
                        <View className="activity-area__arrow-wrap">
                            <Text className="activity-area__arrow">{index + 1}</Text>
                        </View>
                    </View>
                ))}
            </View>

            <View style={{height: '320rpx'}} />
        </View>
    );
}

