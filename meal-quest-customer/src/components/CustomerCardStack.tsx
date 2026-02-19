import { View } from '@tarojs/components';

import P01_SilverCard from './cards/P01_SilverCard';
import P02_BalanceCard from './cards/P02_BalanceCard';
import P03_TicketCard from './cards/P03_TicketCard';
import P04_FragmentCard from './cards/P04_FragmentCard';

const HEADER_H = 48; // Visible "Forehead" in stacked state
const CARD_HEIGHT = 220;
const TOTAL_CARDS = 4;

export default function CustomerCardStack() {
    // Pure layout: Cards are simply stacked vertically with absolute positioning
    const containerHeight = (TOTAL_CARDS - 1) * HEADER_H + CARD_HEIGHT;
    const CARDS = [P02_BalanceCard, P01_SilverCard, P04_FragmentCard, P03_TicketCard];

    return (
        <View
          className='relative select-none box-border'
          style={{ height: `${containerHeight + 8}px`, paddingBottom: '8px' }}
        >
            {CARDS.map((Component, index) => (
                <View
                  key={index}
                  style={{
                        position: 'absolute',
                        top: `${index * HEADER_H}px`,
                        left: 0,
                        right: 0,
                        height: `${CARD_HEIGHT}px`,
                        zIndex: 10 + index,
                        borderRadius: '24px',
                        backgroundColor: '#fff',
                        border: '1px solid rgba(0,0,0,0.08)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                    }}
                >
                    <Component style={{ width: '100%', height: '100%' }} />
                </View>
            ))}
        </View>
    );
}
