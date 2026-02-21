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

    it('creates ledger and invoice rows after checkout', async () => {
        await MockDataService.executeCheckout('store_a', 20, 'u_demo');

        const ledger = await MockDataService.getPaymentLedger('store_a', 'u_demo', 5);
        const invoices = await MockDataService.getInvoices('store_a', 'u_demo', 5);

        expect(ledger.length).toBeGreaterThan(0);
        expect(ledger[0].type).toBe('PAYMENT');
        expect(invoices.length).toBeGreaterThan(0);
        expect(invoices[0].invoiceNo.startsWith('INV_DEMO_')).toBe(true);
    });

    it('blocks snapshot after cancel account', async () => {
        const result = await MockDataService.cancelAccount('store_a', 'u_cancel_case');
        expect(result.deleted).toBe(true);

        await expect(
            MockDataService.getHomeSnapshot('store_a', 'u_cancel_case')
        ).rejects.toThrow('account canceled');
    });
});
