import { Text, View } from '@tarojs/components';

import './ActivityArea.scss';

export interface ActivityItem {
  id: string | number;
  title: string;
  desc: string;
  explanation?: string;
  reasonCode?: string;
  icon: string;
  color: string;
  textColor: string;
  tag: string;
}

interface ActivityAreaProps {
  activities?: ActivityItem[];
}

const TONES = [
  {
    dot: '#dbe7ff',
    iconBg: '#edf3ff',
    tagBg: '#e2edff',
    tagText: '#224f9c',
  },
  {
    dot: '#d7fbfb',
    iconBg: '#e8ffff',
    tagBg: '#ddfbfb',
    tagText: '#0f6d6d',
  },
  {
    dot: '#ffe9cb',
    iconBg: '#fff3df',
    tagBg: '#ffefdb',
    tagText: '#88510a',
  },
];

export default function ActivityArea({ activities = [] }: ActivityAreaProps) {
  const list = Array.isArray(activities) ? activities : [];

  return (
    <View className='activity-area'>
      <View className='activity-area__header'>
        <Text className='activity-area__header-title'>今日活动</Text>
        <Text className='activity-area__header-more'>长期价值导向 · 策略驱动实时更新</Text>
      </View>

      <View className='activity-area__list'>
        {list.length === 0 ? (
          <View className='activity-area__item'>
            <View className='activity-area__left'>
              <View className='activity-area__icon-container activity-area__icon-container--empty'>
                <Text className='activity-area__icon'>AI</Text>
              </View>
              <View className='activity-area__content'>
                <Text className='activity-area__title'>暂无活动</Text>
                <Text className='activity-area__desc'>系统会按长期价值策略展示与您相关的权益触达。</Text>
              </View>
            </View>
          </View>
        ) : (
          list.map((activity, index) => {
            const tone = TONES[index % TONES.length];
            const explanation = activity.explanation || activity.desc;
            return (
              <View key={activity.id} className='activity-area__item'>
                <View className='activity-area__decor' style={{ backgroundColor: tone.dot }} />
                <View className='activity-area__left'>
                  <View className='activity-area__icon-container' style={{ backgroundColor: tone.iconBg }}>
                    <Text className='activity-area__icon'>{activity.icon || 'A'}</Text>
                  </View>
                  <View className='activity-area__content'>
                    <View className='activity-area__title-row'>
                      <Text className='activity-area__title'>{activity.title}</Text>
                      <View
                        className='activity-area__tag'
                        style={{ backgroundColor: tone.tagBg }}
                      >
                        <Text style={{ color: tone.tagText }}>{activity.tag}</Text>
                      </View>
                    </View>
                    <Text className='activity-area__desc'>{explanation}</Text>
                    {activity.reasonCode ? (
                      <Text className='activity-area__reason'>原因码：{activity.reasonCode}</Text>
                    ) : null}
                  </View>
                </View>
                <View className='activity-area__arrow-wrap'>
                  <Text className='activity-area__arrow'>{index + 1}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}
