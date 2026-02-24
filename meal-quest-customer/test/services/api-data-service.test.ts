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
        getApiToken: jest.fn(),
        getApiTokenMerchantId: jest.fn(),
        getCustomerUserId: jest.fn(),
        setApiToken: jest.fn(),
        setApiTokenMerchantId: jest.fn(),
        setCustomerUserId: jest.fn(),
        setCachedHomeSnapshot: jest.fn()
    }
}));

describe('ApiDataService activities mapping', () => {
    const envServerBase = process.env.TARO_APP_SERVER_URL;

    beforeEach(() => {
        jest.resetModules();
        process.env.TARO_APP_SERVER_URL = 'http://127.0.0.1:3030';
        requestMock.mockReset();
        loginMock.mockReset();
        loginMock.mockResolvedValue({ code: 'wx_code_demo' });
    });

    afterEach(() => {
        if (typeof envServerBase === 'string') {
            process.env.TARO_APP_SERVER_URL = envServerBase;
        } else {
            delete process.env.TARO_APP_SERVER_URL;
        }
    });

    it('uses server activities when provided', async () => {
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: { token: 'token_demo', profile: { userId: 'u_demo', phone: '+8613900000001' } }
        });
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                merchant: { merchantId: 'm_store_001', name: 'Demo Merchant' },
                user: {
                    wallet: { principal: 120, bonus: 30, silver: 66 },
                    fragments: { noodle: 3, spicy: 1 },
                    vouchers: []
                },
                activities: [
                    {
                        id: 'campaign_1',
                        title: '高温清凉',
                        desc: '服务端动态活动',
                        icon: '🧊',
                        color: 'bg-cyan-50',
                        textColor: 'text-cyan-600',
                        tag: 'TCA'
                    }
                ]
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        const snapshot = await ApiDataService.getHomeSnapshot('m_store_001', 'u_demo');

        expect(snapshot.activities.length).toBe(1);
        expect(snapshot.activities[0].id).toBe('campaign_1');
        expect(snapshot.activities[0].desc).toBe('服务端动态活动');
    });
});
