import { Image, Text, View } from '@tarojs/components';

import './ShopBrand.scss';

interface ShopBrandProps {
  name?: string;
  branchName?: string;
  slogan?: string;
  logo?: string;
  isOpen?: boolean;
}

export default function ShopBrand({
  name = 'MealQuest',
  branchName = '默认门店',
  slogan = '支付不是结束，而是资产关系的开始',
  logo,
  isOpen = true,
}: ShopBrandProps) {
  return (
    <View className='shop-brand'>
      <View className='shop-brand__hero'>
        <View className='shop-brand__logo-container'>
          {logo ? (
            <Image src={logo} className='shop-brand__logo-image' mode='aspectFill' />
          ) : (
            <Text className='shop-brand__logo-text'>{name.charAt(0)}</Text>
          )}
        </View>

        <View className='shop-brand__info'>
          <View className='shop-brand__name-row'>
            <Text className='shop-brand__name'>{name}</Text>
            <View
              className={`shop-brand__status-badge ${
                isOpen ? 'shop-brand__status-badge--open' : 'shop-brand__status-badge--closed'
              }`}
            >
              <View
                className={`shop-brand__status-dot ${
                  isOpen ? 'shop-brand__status-dot--open' : 'shop-brand__status-dot--closed'
                }`}
              />
              <Text
                className={`shop-brand__status-text ${
                  isOpen ? 'shop-brand__status-text--open' : 'shop-brand__status-text--closed'
                }`}
              >
                {isOpen ? '营业中' : '休息中'}
              </Text>
            </View>
          </View>
          <Text className='shop-brand__slogan'>{slogan}</Text>
          <Text className='shop-brand__branch'>门店 · {branchName}</Text>
        </View>
      </View>
    </View>
  );
}
