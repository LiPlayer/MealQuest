import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import P03_TicketCard from '@/components/cards/P03_TicketCard';

const mockVouchers = [
    { id: '1', name: '葱油拌面券', value: 15 },
    { id: '2', name: '酸梅汤券', value: 5 },
    { id: '3', name: '小龙虾券', value: 88 },
    { id: '4', name: '生煎包券', value: 12 },
    { id: '5', name: '红烧肉券', value: 45 },
    { id: '6', name: '大闸蟹券', value: 128 },
];

describe('P03_TicketCard adaptive layout', () => {
    it('renders empty state when no vouchers', () => {
        const onGoToSynthesis = jest.fn();
        render(<P03_TicketCard vouchers={[]} onGoToSynthesis={onGoToSynthesis} />);

        expect(screen.getByText('暂无可兑付资产')).toBeInTheDocument();
        expect(screen.getByText('去合成第一道菜')).toBeInTheDocument();

        fireEvent.click(screen.getByText('暂无可兑付资产').parentElement!);
        expect(onGoToSynthesis).toHaveBeenCalled();
    });

    it('renders single state when count is 1', () => {
        const onUseVoucher = jest.fn();
        render(<P03_TicketCard vouchers={[mockVouchers[0]]} onUseVoucher={onUseVoucher} />);

        expect(screen.getByText('葱油拌面券')).toBeInTheDocument();
        expect(screen.getByText('¥15')).toBeInTheDocument();
        expect(screen.queryByText('1 VOUCHERS')).toBeInTheDocument();

        fireEvent.click(screen.getByText('葱油拌面券').parentElement!.parentElement!);
        expect(onUseVoucher).toHaveBeenCalledWith(mockVouchers[0]);
    });

    it('renders minimal grid state when count is 2 or 3', () => {
        render(<P03_TicketCard vouchers={mockVouchers.slice(0, 3)} />);

        expect(screen.getByText('3 VOUCHERS')).toBeInTheDocument();
        expect(screen.getByText('葱油拌面券')).toBeInTheDocument();
        expect(screen.getByText('酸梅汤券')).toBeInTheDocument();
        expect(screen.getByText('小龙虾券')).toBeInTheDocument();
    });

    it('renders asset grid state when count is 4+', () => {
        render(<P03_TicketCard vouchers={mockVouchers.slice(0, 4)} />);

        expect(screen.getByText('4 VOUCHERS')).toBeInTheDocument();
        const badges = screen.getAllByText('x1');
        expect(badges.length).toBe(4);
    });

    it('shows "more" indicator when count is greater than 5', () => {
        const onMoreClick = jest.fn();
        render(<P03_TicketCard vouchers={mockVouchers} onMoreClick={onMoreClick} />);

        expect(screen.getByText('6 VOUCHERS')).toBeInTheDocument();
        expect(screen.getByText('+1')).toBeInTheDocument();

        fireEvent.click(screen.getByText('+1').parentElement!);
        expect(onMoreClick).toHaveBeenCalled();
    });
});
