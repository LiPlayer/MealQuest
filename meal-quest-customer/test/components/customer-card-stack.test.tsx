import { fireEvent, render } from '@testing-library/react';
import '@testing-library/jest-dom';
import Taro from '@tarojs/taro';

import CustomerCardStack from '@/components/CustomerCardStack';

const getCard = (container: HTMLElement, index: number) => {
    const card = container.querySelector(`.customer-card-item-${index}`) as HTMLElement | null;
    if (!card) {
        throw new Error(`Missing .customer-card-item-${index}`);
    }
    return card;
};

describe('CustomerCardStack click interaction', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('clicking the same card toggles expand and collapse', () => {
        const { container } = render(<CustomerCardStack />);

        const card2 = getCard(container, 2);
        const card3 = getCard(container, 3);
        const topBefore = card3.style.top;

        fireEvent.click(card2);
        const topExpanded = card3.style.top;
        expect(topExpanded).not.toBe(topBefore);

        fireEvent.click(card2);
        const topCollapsed = card3.style.top;
        expect(topCollapsed).toBe(topBefore);

        expect(Taro.vibrateShort).toHaveBeenCalledTimes(2);
    });

    it('clicking another card switches focus layout', () => {
        const { container } = render(<CustomerCardStack />);

        const card1 = getCard(container, 1);
        const card2 = getCard(container, 2);
        const card3 = getCard(container, 3);
        const top2Before = card2.style.top;
        const top3Before = card3.style.top;

        fireEvent.click(card2);
        const top2FocusedOn2 = card2.style.top;
        const top3FocusedOn2 = card3.style.top;
        expect(top2FocusedOn2).toBe(top2Before);
        expect(top3FocusedOn2).not.toBe(top3Before);

        fireEvent.click(card1);
        const top2FocusedOn1 = card2.style.top;
        const top3FocusedOn1 = card3.style.top;
        expect(top2FocusedOn1).not.toBe(top2Before);
        expect(top3FocusedOn1).not.toBe(top3Before);
    });
});

