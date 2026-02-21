import { DataService } from '@/services/DataService';
import { ApiDataService } from '@/services/ApiDataService';
import { MockDataService } from '@/services/MockDataService';
import { storage } from '@/utils/storage';

jest.mock('@/services/ApiDataService', () => ({
    ApiDataService: {
        isConfigured: jest.fn(),
        getHomeSnapshot: jest.fn(),
        getCheckoutQuote: jest.fn(),
        executeCheckout: jest.fn()
    }
}));

jest.mock('@/services/MockDataService', () => ({
    MockDataService: {
        getHomeSnapshot: jest.fn(),
        getCheckoutQuote: jest.fn(),
        executeCheckout: jest.fn()
    }
}));

jest.mock('@/utils/storage', () => ({
    storage: {
        getUseRemoteApi: jest.fn(),
        setApiToken: jest.fn()
    }
}));

const api = ApiDataService as jest.Mocked<typeof ApiDataService>;
const mock = MockDataService as jest.Mocked<typeof MockDataService>;
const storageMock = storage as jest.Mocked<typeof storage>;

describe('DataService remote fallback', () => {
    const envBackup = process.env.TARO_APP_USE_REMOTE_API;
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        delete process.env.TARO_APP_USE_REMOTE_API;
        storageMock.getUseRemoteApi.mockReturnValue(false);
        api.isConfigured.mockReturnValue(false);
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    afterAll(() => {
        if (typeof envBackup === 'string') {
            process.env.TARO_APP_USE_REMOTE_API = envBackup;
        } else {
            delete process.env.TARO_APP_USE_REMOTE_API;
        }
    });

    it('uses mock service when remote mode is disabled', async () => {
        const snapshot = { store: { id: 'store_a' } } as any;
        mock.getHomeSnapshot.mockResolvedValue(snapshot);
        api.isConfigured.mockReturnValue(true);
        storageMock.getUseRemoteApi.mockReturnValue(false);

        const result = await DataService.getHomeSnapshot('store_a', 'u_demo');

        expect(result).toBe(snapshot);
        expect(mock.getHomeSnapshot).toHaveBeenCalledWith('store_a', 'u_demo');
        expect(api.getHomeSnapshot).not.toHaveBeenCalled();
    });

    it('uses api service when remote mode is enabled and configured', async () => {
        process.env.TARO_APP_USE_REMOTE_API = 'true';
        api.isConfigured.mockReturnValue(true);
        api.getCheckoutQuote.mockResolvedValue({
            orderAmount: 52,
            selectedVoucher: null,
            deduction: { voucher: 0, bonus: 0, principal: 0, silver: 0 },
            payable: 52,
            remainingWallet: { principal: 0, bonus: 0, silver: 0 }
        });

        await DataService.getCheckoutQuote('store_a', 52, 'u_demo');

        expect(api.getCheckoutQuote).toHaveBeenCalledWith('store_a', 52, 'u_demo');
        expect(mock.getCheckoutQuote).not.toHaveBeenCalled();
    });

    it('falls back to mock service and clears token when remote call fails', async () => {
        process.env.TARO_APP_USE_REMOTE_API = 'true';
        api.isConfigured.mockReturnValue(true);
        api.executeCheckout.mockRejectedValue(new Error('remote failed'));
        const fallbackResult = {
            paymentId: 'pay_local_1',
            quote: {
                orderAmount: 52,
                selectedVoucher: null,
                deduction: { voucher: 0, bonus: 0, principal: 0, silver: 0 },
                payable: 52,
                remainingWallet: { principal: 0, bonus: 0, silver: 0 }
            },
            snapshot: { store: { id: 'store_a' } }
        } as any;
        mock.executeCheckout.mockResolvedValue(fallbackResult);

        const result = await DataService.executeCheckout('store_a', 52, 'u_demo');

        expect(result).toBe(fallbackResult);
        expect(storageMock.setApiToken).toHaveBeenCalledWith('');
        expect(mock.executeCheckout).toHaveBeenCalledWith('store_a', 52, 'u_demo');
    });
});
