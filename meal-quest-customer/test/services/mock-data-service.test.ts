import { MockDataService } from '@/services/MockDataService';

describe('MockDataService checkout flow', () => {
    it('updates wallet and voucher status after checkout', async () => {
        const before = await MockDataService.getHomeSnapshot('store_a', 'u_demo');
        const result = await MockDataService.executeCheckout('store_a', 52, 'u_demo');
        const after = await MockDataService.getHomeSnapshot('store_a', 'u_demo');

        expect(result.paymentId).toMatch(/^pay_/);
        expect(after.wallet.principal).toBeLessThanOrEqual(before.wallet.principal);
        expect(after.wallet.bonus).toBeLessThanOrEqual(before.wallet.bonus);

        const usedVouchers = after.vouchers.filter(v => v.status === 'USED');
        expect(usedVouchers.length).toBeGreaterThan(0);
    });
});
