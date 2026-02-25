import { DataService } from '@/services/DataService';
import { ApiDataService } from '@/services/ApiDataService';
import { storage } from '@/utils/storage';

jest.mock('@/services/ApiDataService', () => ({
    ApiDataService: {
        isConfigured: jest.fn(),
        getHomeSnapshot: jest.fn(),
        getCheckoutQuote: jest.fn(),
        executeCheckout: jest.fn(),
        getPaymentLedger: jest.fn(),
        getInvoices: jest.fn(),
        cancelAccount: jest.fn()
    }
}));

jest.mock('@/utils/storage', () => ({
    storage: {
        setApiToken: jest.fn(),
        setApiTokenMerchantId: jest.fn(),
        setCustomerUserId: jest.fn()
    }
}));

const api = ApiDataService as jest.Mocked<typeof ApiDataService>;
const storageMock = storage as jest.Mocked<typeof storage>;

describe('DataService remote only', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        api.isConfigured.mockReturnValue(true);
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('throws when api base url is not configured', async () => {
        api.isConfigured.mockReturnValue(false);

        await expect(DataService.getHomeSnapshot('store_a', 'u_fixture_001')).rejects.toThrow(
            'Missing TARO_APP_SERVER_URL',
        );
    });

    it('delegates checkout quote to api service', async () => {
        api.getCheckoutQuote.mockResolvedValue({
            orderAmount: 52,
            selectedVoucher: null,
            deduction: { voucher: 0, bonus: 0, principal: 0, silver: 0, external: 52 },
            payable: 52,
            remainingWallet: { principal: 0, bonus: 0, silver: 0 }
        });

        await DataService.getCheckoutQuote('store_a', 52, 'u_fixture_001');

        expect(api.getCheckoutQuote).toHaveBeenCalledWith('store_a', 52, 'u_fixture_001');
    });

    it('clears token and rethrows when remote executeCheckout fails', async () => {
        api.executeCheckout.mockRejectedValue(new Error('remote failed'));

        await expect(DataService.executeCheckout('store_a', 52, 'u_fixture_001')).rejects.toThrow(
            'remote failed',
        );

        expect(storageMock.setApiToken).toHaveBeenCalledWith('');
        expect(storageMock.setApiTokenMerchantId).toHaveBeenCalledWith('');
        expect(storageMock.setCustomerUserId).toHaveBeenCalledWith('');
    });

    it('delegates ledger query to api service', async () => {
        api.getPaymentLedger.mockResolvedValue([
            {
                txnId: 'txn_1',
                merchantId: 'store_a',
                userId: 'u_fixture_001',
                type: 'PAYMENT',
                amount: 10,
                timestamp: new Date().toISOString()
            }
        ] as any);

        const result = await DataService.getPaymentLedger('store_a', 'u_fixture_001', 10);

        expect(result).toHaveLength(1);
        expect(api.getPaymentLedger).toHaveBeenCalledWith('store_a', 'u_fixture_001', 10);
    });
});
