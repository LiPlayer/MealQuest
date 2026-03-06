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
                        readAt: null,
                        related: {
                            event: 'PAYMENT_VERIFY',
                            outcome: 'HIT',
                            reasonCodes: ['segment_mismatch']
                        }
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
        expect(result.items[0].related?.event).toBe('PAYMENT_VERIFY');
        expect(result.items[0].related?.outcome).toBe('HIT');
        expect(result.items[0].related?.reasonCodes).toEqual(['segment_mismatch']);
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

    it('loads notification preferences', async () => {
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                version: 'S100-SRV-01.v1',
                merchantId: 'm_store_001',
                recipientType: 'CUSTOMER_USER',
                recipientId: 'u_fixture_001',
                categories: {
                    APPROVAL_TODO: true,
                    EXECUTION_RESULT: true,
                    FEEDBACK_TICKET: true,
                    GENERAL: true
                },
                frequencyCaps: {
                    EXECUTION_RESULT: {
                        windowSec: 86400,
                        maxDeliveries: 3
                    }
                },
                updatedAt: '2026-03-06T10:00:00.000Z',
                updatedBy: 'u_fixture_001'
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        const result = await ApiDataService.getNotificationPreferences('m_store_001', 'u_fixture_001');

        expect(result.categories.EXECUTION_RESULT).toBe(true);
        expect(result.frequencyCaps.EXECUTION_RESULT.maxDeliveries).toBe(3);
        expect(requestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'GET',
                url: expect.stringContaining('/api/notifications/preferences?merchantId=m_store_001')
            })
        );
    });

    it('updates notification preferences', async () => {
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                version: 'S100-SRV-01.v1',
                merchantId: 'm_store_001',
                recipientType: 'CUSTOMER_USER',
                recipientId: 'u_fixture_001',
                categories: {
                    APPROVAL_TODO: true,
                    EXECUTION_RESULT: false,
                    FEEDBACK_TICKET: true,
                    GENERAL: true
                },
                frequencyCaps: {
                    EXECUTION_RESULT: {
                        windowSec: 86400,
                        maxDeliveries: 1
                    }
                },
                updatedAt: '2026-03-06T11:00:00.000Z',
                updatedBy: 'u_fixture_001'
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        const result = await ApiDataService.setNotificationPreferences('m_store_001', 'u_fixture_001', {
            categories: {
                EXECUTION_RESULT: false
            },
            frequencyCaps: {
                EXECUTION_RESULT: {
                    windowSec: 86400,
                    maxDeliveries: 1
                }
            }
        });

        expect(result.categories.EXECUTION_RESULT).toBe(false);
        expect(requestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'PUT',
                url: 'http://127.0.0.1:3030/api/notifications/preferences',
                data: expect.objectContaining({
                    merchantId: 'm_store_001',
                    categories: {
                        EXECUTION_RESULT: false
                    }
                })
            })
        );
    });

    it('loads customer stability snapshot', async () => {
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                version: 'S090-SRV-02.v1',
                merchantId: 'm_store_001',
                objective: 'LONG_TERM_VALUE_MAXIMIZATION',
                evaluatedAt: '2026-03-06T10:00:00.000Z',
                windowDays: 30,
                stabilityLevel: 'WATCH',
                stabilityLabel: '需留意',
                summary: '服务状态需留意，部分能力可能短时波动。',
                drivers: [
                    {
                        code: 'TECHNICAL_GATE',
                        label: '支付与核心链路',
                        status: 'REVIEW'
                    }
                ],
                reasons: [
                    {
                        code: 'PAYMENT_NO_SAMPLE',
                        message: '支付样本不足，稳定性持续观察中'
                    }
                ]
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        const snapshot = await ApiDataService.getCustomerStabilitySnapshot('m_store_001', 'u_fixture_001');

        expect(snapshot.stabilityLevel).toBe('WATCH');
        expect(snapshot.stabilityLabel).toBe('需留意');
        expect(snapshot.reasons[0].code).toBe('PAYMENT_NO_SAMPLE');
        expect(requestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'GET',
                url: expect.stringContaining('/api/state/customer-stability?merchantId=m_store_001')
            })
        );
    });

    it('creates feedback ticket', async () => {
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                ticket: {
                    ticketId: 'ticket_m_store_001_00000001',
                    merchantId: 'm_store_001',
                    userId: 'u_fixture_001',
                    category: 'PAYMENT',
                    title: '支付后余额未刷新',
                    description: '点击支付后资产未更新',
                    contact: '13800000000',
                    status: 'OPEN',
                    createdAt: '2026-03-06T08:00:00.000Z',
                    updatedAt: '2026-03-06T08:00:00.000Z',
                    latestEvent: {
                        eventId: 'ticket_m_store_001_00000001_event_0001',
                        fromStatus: null,
                        toStatus: 'OPEN',
                        note: '顾客提交问题反馈',
                        actorRole: 'CUSTOMER',
                        actorId: 'u_fixture_001',
                        createdAt: '2026-03-06T08:00:00.000Z'
                    }
                }
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        const ticket = await ApiDataService.createFeedbackTicket('m_store_001', 'u_fixture_001', {
            category: 'PAYMENT',
            title: '支付后余额未刷新',
            description: '点击支付后资产未更新',
            contact: '13800000000'
        });

        expect(ticket.ticketId).toBe('ticket_m_store_001_00000001');
        expect(ticket.status).toBe('OPEN');
        expect(requestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                url: 'http://127.0.0.1:3030/api/feedback/tickets',
                data: expect.objectContaining({
                    merchantId: 'm_store_001',
                    category: 'PAYMENT'
                })
            })
        );
    });

    it('loads feedback ticket list and detail timeline', async () => {
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                status: 'ALL',
                category: 'ALL',
                items: [
                    {
                        ticketId: 'ticket_m_store_001_00000001',
                        merchantId: 'm_store_001',
                        userId: 'u_fixture_001',
                        category: 'BENEFIT',
                        title: '权益未到账',
                        description: '活动奖励未到账',
                        contact: '',
                        status: 'IN_PROGRESS',
                        createdAt: '2026-03-06T08:00:00.000Z',
                        updatedAt: '2026-03-06T09:00:00.000Z'
                    }
                ],
                pageInfo: {
                    hasMore: false,
                    nextCursor: null
                }
            }
        });
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                ticket: {
                    ticketId: 'ticket_m_store_001_00000001',
                    merchantId: 'm_store_001',
                    userId: 'u_fixture_001',
                    category: 'BENEFIT',
                    title: '权益未到账',
                    description: '活动奖励未到账',
                    contact: '',
                    status: 'IN_PROGRESS',
                    createdAt: '2026-03-06T08:00:00.000Z',
                    updatedAt: '2026-03-06T09:00:00.000Z',
                    timeline: [
                        {
                            eventId: 'ticket_m_store_001_00000001_event_0001',
                            fromStatus: null,
                            toStatus: 'OPEN',
                            note: '顾客提交问题反馈',
                            actorRole: 'CUSTOMER',
                            actorId: 'u_fixture_001',
                            createdAt: '2026-03-06T08:00:00.000Z'
                        },
                        {
                            eventId: 'ticket_m_store_001_00000001_event_0002',
                            fromStatus: 'OPEN',
                            toStatus: 'IN_PROGRESS',
                            note: '老板已接单处理',
                            actorRole: 'OWNER',
                            actorId: 'owner_001',
                            createdAt: '2026-03-06T09:00:00.000Z'
                        }
                    ]
                }
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        const listResult = await ApiDataService.getFeedbackTickets('m_store_001', 'u_fixture_001', {
            status: 'ALL',
            category: 'ALL',
            limit: 10
        });
        const detail = await ApiDataService.getFeedbackTicketDetail(
            'm_store_001',
            'u_fixture_001',
            'ticket_m_store_001_00000001'
        );

        expect(listResult.items.length).toBe(1);
        expect(listResult.items[0].status).toBe('IN_PROGRESS');
        expect(detail.timeline?.length).toBe(2);
        expect(requestMock).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                method: 'GET',
                url: expect.stringContaining('/api/feedback/tickets?merchantId=m_store_001')
            })
        );
        expect(requestMock).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                method: 'GET',
                url: expect.stringContaining('/api/feedback/tickets/ticket_m_store_001_00000001?merchantId=m_store_001')
            })
        );
    });
});
