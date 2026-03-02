import { buildSmartCheckoutQuote } from '@/domain/smartCheckout';
import { Voucher } from '@/components/cards/P03_TicketCard';

describe('buildSmartCheckoutQuote', () => {
    const vouchers: Voucher[] = [
        {
            id: 'v_later',
            name: '晚到期券',
            value: 8,
            status: 'ACTIVE',
            minSpend: 0,
            expiresAt: '2026-03-10T00:00:00.000Z'
        },
        {
            id: 'v_soon',
            name: '临期券',
            value: 15,
            status: 'ACTIVE',
            minSpend: 0,
            expiresAt: '2026-02-22T00:00:00.000Z'
        }
    ];

    it('uses expiring voucher first and then consumes bonus/principal/silver', () => {
        const quote = buildSmartCheckoutQuote(
            40,
            { principal: 10, bonus: 9, silver: 4 },
            vouchers,
            new Date('2026-02-21T00:00:00.000Z')
        );

        expect(quote.selectedVoucher?.id).toBe('v_soon');
        expect(quote.deduction).toEqual({
            voucher: 15,
            bonus: 9,
            principal: 10,
            silver: 4,
            external: 2
        });
    });

    it('falls back to external payment when internal assets are insufficient', () => {
        const quote = buildSmartCheckoutQuote(
            30,
            { principal: 1, bonus: 0, silver: 0 },
            [],
            new Date('2026-02-21T00:00:00.000Z')
        );

        expect(quote.payable).toBe(29);
        expect(quote.remainingWallet).toEqual({ principal: 0, bonus: 0, silver: 0 });
    });
});
