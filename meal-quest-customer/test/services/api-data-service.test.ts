export {};

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
        Reflect.deleteProperty(process.env, 'TARO_ENV');
        requestMock.mockReset();
        loginMock.mockReset();
        getEnvMock.mockReset();
        getEnvMock.mockReturnValue('WEAPP');
        loginMock.mockResolvedValue({ code: 'wx_code_fixture' });
    });

    afterEach(() => {
        if (typeof envServerBase === 'string') {
            process.env.TARO_APP_SERVER_URL = envServerBase;
        } else {
            process.env.TARO_APP_SERVER_URL = undefined;
        }
        if (typeof envBuildPlatform === 'string') {
            process.env.TARO_ENV = envBuildPlatform;
        } else {
            Reflect.deleteProperty(process.env, 'TARO_ENV');
        }
    });

    it('uses server activities when provided', async () => {
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: { token: 'token_fixture', profile: { userId: 'u_fixture_001', phone: '+8613900000001' } }
        });
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                merchant: { merchantId: 'm_store_001', name: 'Fixture Merchant' },
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
                        tag: 'POLICY'
                    }
                ]
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        const snapshot = await ApiDataService.getHomeSnapshot('m_store_001', 'u_fixture_001');

        expect(snapshot.activities.length).toBe(1);
        expect(snapshot.activities[0].id).toBe('campaign_1');
        expect(snapshot.activities[0].desc).toBe('Server activity');
        expect(requestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'GET',
                url: 'http://127.0.0.1:3030/api/state?merchantId=m_store_001&userId=u_fixture_001'
            })
        );
    });

    it('uses alipay login endpoint when running in alipay env', async () => {
        getEnvMock.mockReturnValue('ALIPAY');
        loginMock.mockResolvedValue({ authCode: 'ali_code_fixture' });
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: { token: 'token_fixture', profile: { userId: 'u_fixture_001', phone: '+8613900000001' } }
        });
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                merchant: { merchantId: 'm_store_001', name: 'Fixture Merchant' },
                user: {
                    wallet: { principal: 120, bonus: 30, silver: 66 },
                    fragments: { noodle: 3, spicy: 1 },
                    vouchers: []
                },
                activities: []
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        await ApiDataService.getHomeSnapshot('m_store_001', 'u_fixture_001');

        expect(requestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                url: 'http://127.0.0.1:3030/api/auth/customer/alipay-login',
                data: expect.objectContaining({
                    merchantId: 'm_store_001',
                    code: 'ali_code_fixture'
                })
            })
        );
    });

    it('maps blocked touchpoint reason to friendly explanation and keeps reason code', async () => {
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: { token: 'token_fixture', profile: { userId: 'u_fixture_001', phone: '+8613900000001' } }
        });
        requestMock.mockResolvedValueOnce({
            statusCode: 200,
            data: {
                merchant: { merchantId: 'm_store_001', name: 'Fixture Merchant' },
                user: {
                    wallet: { principal: 120, bonus: 30, silver: 66 },
                    fragments: { noodle: 3, spicy: 1 },
                    vouchers: []
                },
                activities: [
                    {
                        id: 'welcome_block_1',
                        title: '欢迎权益未发放',
                        desc: '原因：segment_mismatch',
                        icon: '!',
                        color: 'bg-amber-50',
                        textColor: 'text-amber-700',
                        tag: 'WELCOME'
                    }
                ]
            }
        });

        const { ApiDataService } = require('@/services/ApiDataService');
        const snapshot = await ApiDataService.getHomeSnapshot('m_store_001', 'u_fixture_001');

        expect(snapshot.activities.length).toBe(1);
        expect(snapshot.activities[0].reasonCode).toBe('segment_mismatch');
        expect(snapshot.activities[0].explanation).toBe('当前条件未满足');
        expect(snapshot.touchpointContract.recentTouchpoints[0].stage).toBe('获客');
        expect(snapshot.touchpointContract.recentTouchpoints[0].outcome).toBe('BLOCKED');
    });
});
