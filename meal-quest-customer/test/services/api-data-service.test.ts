const requestMock = jest.fn();
const loginMock = jest.fn();
const getEnvMock = jest.fn();

jest.mock('@tarojs/taro', () => ({
    __esModule: true,
    default: {
        request: requestMock,
        login: loginMock,
        getEnv: getEnvMock
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
    const envBuildPlatform = process.env.TARO_ENV;

    beforeEach(() => {
        jest.resetModules();
        process.env.TARO_APP_SERVER_URL = 'http://127.0.0.1:3030';
        delete process.env.TARO_ENV;
        requestMock.mockReset();
        loginMock.mockReset();
        getEnvMock.mockReset();
        getEnvMock.mockReturnValue('WEAPP');
        loginMock.mockResolvedValue({ code: 'wx_code_demo' });
    });

    afterEach(() => {
        if (typeof envServerBase === 'string') {
            process.env.TARO_APP_SERVER_URL = envServerBase;
        } else {
            delete process.env.TARO_APP_SERVER_URL;
        }
        if (typeof envBuildPlatform === 'string') {
            process.env.TARO_ENV = envBuildPlatform;
        } else {
            delete process.env.TARO_ENV;
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
                        title: 'Campaign',
                        desc: 'Server activity',
                        icon: '*',
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
        expect(snapshot.activities[0].desc).toBe('Server activity');
    });

    it('uses alipay login endpoint when running in alipay env', async () => {
        getEnvMock.mockReturnValue('ALIPAY');
        loginMock.mockResolvedValue({ authCode: 'ali_code_demo' });
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
                activities: []
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        await ApiDataService.getHomeSnapshot('m_store_001', 'u_demo');

        expect(requestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                url: 'http://127.0.0.1:3030/api/auth/customer/alipay-login',
                data: expect.objectContaining({
                    merchantId: 'm_store_001',
                    code: 'ali_code_demo'
                })
            })
        );
    });
});
