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

interface ActivityAreaProps {
    activities?: ActivityItem[];
}

export default function ActivityArea({activities = []}: ActivityAreaProps) {
    const list = Array.isArray(activities) ? activities : [];

    return (
        <View className="activity-area">
            <View className="activity-area__header">
                <Text className="activity-area__header-title">精选特惠</Text>
                <Text className="activity-area__header-more">策略驱动 · 实时更新</Text>
            </View>

            <View className="activity-area__list">
                {list.length === 0 ? (
                    <View className="activity-area__item">
                        <View className="activity-area__left">
                            <View className="activity-area__content">
                                <Text className="activity-area__title">暂无活动</Text>
                                <Text className="activity-area__desc">商家发布活动后会在这里展示</Text>
                            </View>
                        </View>
                    </View>
                ) : (
                    list.map((activity, index) => (
                        <View key={activity.id} className="activity-area__item">
                            <View className={`activity-area__decor ${activity.color}`} />
                            <View className="activity-area__left">
                                <View className={`activity-area__icon-container ${activity.color}`}>
                                    {activity.icon}
                                </View>
                                <View className="activity-area__content">
                                    <View className="activity-area__title-row">
                                        <Text className="activity-area__title">{activity.title}</Text>
                                        <View className={`activity-area__tag ${activity.color} ${activity.textColor}`}>
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
                    ))
                )}
            </View>

            <View style={{height: '320rpx'}} />
        </View>
    );
}
