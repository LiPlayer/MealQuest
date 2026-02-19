import { View } from '@tarojs/components';
import Taro from '@tarojs/taro';

import P01_SilverCard from './cards/P01_SilverCard';
import P02_BalanceCard from './cards/P02_BalanceCard';
import P03_TicketCard from './cards/P03_TicketCard';
import P04_FragmentCard from './cards/P04_FragmentCard';

const HEADER_H = 120; // Visible "Forehead" in stacked state (rpx)
const TOTAL_CARDS = 4;

export default function CustomerCardStack() {
    // Pure layout: Cards are simply stacked vertically with absolute positioning
    const CARDS = [P02_BalanceCard, P01_SilverCard, P04_FragmentCard, P03_TicketCard];

    return (
        <View
            className='relative select-none box-border'
            style={{
                height: `calc(${Taro.pxTransform((TOTAL_CARDS - 1) * HEADER_H + 32)} + (100vw - 64rpx) / 1.586)`,
                paddingBottom: Taro.pxTransform(32),
                width: '100%'
            }}
        >
            {CARDS.map((Component, index) => (
                <View
                    key={index}
                    style={{
                        position: 'absolute',
                        top: Taro.pxTransform(index * HEADER_H),
                        left: 0,
                        right: 0,
                        aspectRatio: '1.586',
                        zIndex: 10 + index,
                        borderRadius: Taro.pxTransform(48),
                        backgroundColor: '#fff',
                        border: '1PX solid rgba(0,0,0,0.08)',
                        boxShadow: `0 ${Taro.pxTransform(16)} ${Taro.pxTransform(48)} rgba(0,0,0,0.05)`,
                        overflow: 'hidden'
                    }}
                >
                    <Component style={{ width: '100%', height: '100%' }} />
                </View>
            ))}
        </View>
    );
}
