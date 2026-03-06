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
        cancelAccount: jest.fn(),
        getNotificationInbox: jest.fn(),
        getNotificationUnreadSummary: jest.fn(),
        getNotificationPreferences: jest.fn(),
        setNotificationPreferences: jest.fn(),
        getCustomerStabilitySnapshot: jest.fn(),
        markNotificationsRead: jest.fn(),
        createFeedbackTicket: jest.fn(),
        getFeedbackTickets: jest.fn(),
        getFeedbackTicketDetail: jest.fn(),
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

    it('does not clear session when notification query fails', async () => {
        api.getNotificationUnreadSummary.mockRejectedValue(new Error('notification failed'));

        await expect(DataService.getNotificationUnreadSummary('store_a', 'u_fixture_001')).rejects.toThrow(
            'notification failed',
        );

        expect(storageMock.setApiToken).not.toHaveBeenCalled();
        expect(storageMock.setApiTokenMerchantId).not.toHaveBeenCalled();
        expect(storageMock.setCustomerUserId).not.toHaveBeenCalled();
    });

    it('does not clear session when customer stability query fails', async () => {
        api.getCustomerStabilitySnapshot.mockRejectedValue(new Error('stability failed'));

        await expect(DataService.getCustomerStabilitySnapshot('store_a', 'u_fixture_001')).rejects.toThrow(
            'stability failed',
        );

        expect(storageMock.setApiToken).not.toHaveBeenCalled();
        expect(storageMock.setApiTokenMerchantId).not.toHaveBeenCalled();
        expect(storageMock.setCustomerUserId).not.toHaveBeenCalled();
    });

    it('does not clear session when notification preference query fails', async () => {
        api.getNotificationPreferences.mockRejectedValue(new Error('preference failed'));

        await expect(DataService.getNotificationPreferences('store_a', 'u_fixture_001')).rejects.toThrow(
            'preference failed',
        );

        expect(storageMock.setApiToken).not.toHaveBeenCalled();
        expect(storageMock.setApiTokenMerchantId).not.toHaveBeenCalled();
        expect(storageMock.setCustomerUserId).not.toHaveBeenCalled();
    });

    it('delegates notification preference update to api service', async () => {
        api.setNotificationPreferences.mockResolvedValue({
            version: 'S100-SRV-01.v1',
            merchantId: 'store_a',
            recipientType: 'CUSTOMER_USER',
            recipientId: 'u_fixture_001',
            categories: {
                APPROVAL_TODO: true,
                EXECUTION_RESULT: false,
                FEEDBACK_TICKET: true,
                GENERAL: true,
            },
            frequencyCaps: {
                EXECUTION_RESULT: {
                    windowSec: 86400,
                    maxDeliveries: 1,
                },
            },
            updatedAt: '2026-03-06T00:00:00.000Z',
            updatedBy: 'u_fixture_001',
        } as any);

        const result = await DataService.setNotificationPreferences('store_a', 'u_fixture_001', {
            categories: {
                EXECUTION_RESULT: false,
            },
            frequencyCaps: {
                EXECUTION_RESULT: {
                    windowSec: 86400,
                    maxDeliveries: 1,
                },
            },
        });

        expect(result.categories.EXECUTION_RESULT).toBe(false);
        expect(api.setNotificationPreferences).toHaveBeenCalledWith('store_a', 'u_fixture_001', {
            categories: {
                EXECUTION_RESULT: false,
            },
            frequencyCaps: {
                EXECUTION_RESULT: {
                    windowSec: 86400,
                    maxDeliveries: 1,
                },
            },
        });
    });

    it('delegates feedback list query to api service', async () => {
        api.getFeedbackTickets.mockResolvedValue({
            items: [],
            hasMore: false,
            nextCursor: null,
            status: 'ALL',
            category: 'ALL',
        } as any);

        const result = await DataService.getFeedbackTickets('store_a', 'u_fixture_001', {
            status: 'ALL',
            category: 'ALL',
            limit: 10,
        });

        expect(result.hasMore).toBe(false);
        expect(api.getFeedbackTickets).toHaveBeenCalledWith('store_a', 'u_fixture_001', {
            status: 'ALL',
            category: 'ALL',
            limit: 10,
        });
    });
});
