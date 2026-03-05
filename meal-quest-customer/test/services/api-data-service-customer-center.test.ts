export {};

const requestMock = jest.fn();
const loginMock = jest.fn();

jest.mock('@tarojs/taro', () => ({
    __esModule: true,
    default: {
        request: requestMock,
        login: loginMock
    }
}));

jest.mock('@/utils/storage', () => ({
    storage: {
        getApiToken: jest.fn(() => 'token_fixture'),
        getApiTokenMerchantId: jest.fn(() => 'm_store_001'),
        getCustomerUserId: jest.fn(() => 'u_fixture_001'),
        setApiToken: jest.fn(),
        setApiTokenMerchantId: jest.fn(),
        setCustomerUserId: jest.fn(),
        setCachedHomeSnapshot: jest.fn()
    }
}));

describe('ApiDataService customer center', () => {
    const envServerBase = process.env.TARO_APP_SERVER_URL;

    beforeEach(() => {
        jest.resetModules();
        process.env.TARO_APP_SERVER_URL = 'http://127.0.0.1:3030';
        requestMock.mockReset();
        loginMock.mockReset();
        loginMock.mockResolvedValue({ code: 'wx_code_fixture' });
    });

    afterEach(() => {
        if (typeof envServerBase === 'string') {
            process.env.TARO_APP_SERVER_URL = envServerBase;
        } else {
            process.env.TARO_APP_SERVER_URL = undefined;
        }
    });

    it('loads payment ledger rows', async () => {
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                items: [
                    {
                        txnId: 'txn_1',
                        merchantId: 'm_store_001',
                        userId: 'u_fixture_001',
                        type: 'PAYMENT',
                        amount: 12.5,
                        timestamp: '2026-02-21T00:00:00.000Z'
                    }
                ]
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        const rows = await ApiDataService.getPaymentLedger('m_store_001', 'u_fixture_001', 10);

        expect(rows.length).toBe(1);
        expect(rows[0].txnId).toBe('txn_1');
        expect(requestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'GET',
                url: expect.stringContaining('/api/payment/ledger?merchantId=m_store_001')
            })
        );
    });

    it('maps createdAt as fallback ledger timestamp', async () => {
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                items: [
                    {
                        txnId: 'txn_created_at',
                        merchantId: 'm_store_001',
                        userId: 'u_fixture_001',
                        type: 'POLICYOS_GRANT',
                        amount: 0,
                        createdAt: '2026-02-22T00:00:00.000Z'
                    }
                ]
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        const rows = await ApiDataService.getPaymentLedger('m_store_001', 'u_fixture_001', 10);

        expect(rows.length).toBe(1);
        expect(rows[0].timestamp).toBe('2026-02-22T00:00:00.000Z');
    });

    it('loads invoice rows', async () => {
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                items: [
                    {
                        invoiceNo: 'INV_1',
                        merchantId: 'm_store_001',
                        userId: 'u_fixture_001',
                        paymentTxnId: 'txn_1',
                        amount: 12.5,
                        status: 'ISSUED',
                        issuedAt: '2026-02-21T00:00:00.000Z',
                        title: 'MealQuest Invoice'
                    }
                ]
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        const rows = await ApiDataService.getInvoices('m_store_001', 'u_fixture_001', 10);

        expect(rows.length).toBe(1);
        expect(rows[0].invoiceNo).toBe('INV_1');
        expect(requestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'GET',
                url: expect.stringContaining('/api/invoice/list?merchantId=m_store_001')
            })
        );
    });

    it('calls cancel account endpoint', async () => {
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                deleted: true,
                deletedAt: '2026-02-21T00:00:00.000Z',
                anonymizedUserId: 'DELETED_m_store_001_u_fixture_001'
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        const result = await ApiDataService.cancelAccount('m_store_001', 'u_fixture_001');

        expect(result.deleted).toBe(true);
        expect(requestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                url: 'http://127.0.0.1:3030/api/privacy/cancel-account'
            })
        );
    });

    it('loads notification inbox rows', async () => {
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                items: [
                    {
                        notificationId: 'notification_001',
                        merchantId: 'm_store_001',
                        recipientType: 'CUSTOMER_USER',
                        recipientId: 'u_fixture_001',
                        category: 'EXECUTION_RESULT',
                        title: '权益触达结果',
                        body: '事件 PAYMENT_VERIFY 已命中策略',
                        status: 'UNREAD',
                        createdAt: '2026-02-21T00:00:00.000Z',
                        readAt: null
                    }
                ],
                pageInfo: {
                    hasMore: false,
                    nextCursor: null
                }
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        const result = await ApiDataService.getNotificationInbox('m_store_001', 'u_fixture_001', {
            status: 'ALL',
            category: 'ALL',
            limit: 20
        });

        expect(result.items.length).toBe(1);
        expect(result.items[0].notificationId).toBe('notification_001');
        expect(requestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'GET',
                url: expect.stringContaining('/api/notifications/inbox?merchantId=m_store_001')
            })
        );
    });

    it('marks notifications as read', async () => {
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                updatedCount: 2
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        const result = await ApiDataService.markNotificationsRead('m_store_001', 'u_fixture_001', {
            markAll: true
        });

        expect(result.updatedCount).toBe(2);
        expect(requestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                url: 'http://127.0.0.1:3030/api/notifications/read',
                data: expect.objectContaining({
                    merchantId: 'm_store_001',
                    markAll: true
                })
            })
        );
    });
});
