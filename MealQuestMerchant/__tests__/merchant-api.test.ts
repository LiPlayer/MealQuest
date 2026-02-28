describe('merchantApi audit logs', () => {
  const okResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  });

  beforeEach(() => {
    jest.resetModules();
    process.env.MQ_SERVER_URL = 'http://127.0.0.1:3030';
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    delete process.env.MQ_SERVER_URL;
  });

  it('requests audit logs with cursor pagination', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      okResponse({
        merchantId: 'm_store_001',
        items: [],
        pageInfo: {limit: 2, hasMore: false, nextCursor: null},
      }),
    );

    const {MerchantApi} = require('../src/services/merchantApi');
    await MerchantApi.getAuditLogs('token_fixture', {
      merchantId: 'm_store_001',
      limit: 2,
      cursor: 'cursor_1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/audit/logs?');
    expect(url).toContain('merchantId=m_store_001');
    expect(url).toContain('limit=2');
    expect(url).toContain('cursor=cursor_1');
    expect(options.method).toBe('GET');
    expect(options.headers.Authorization).toBe('Bearer token_fixture');
  });

  it('includes action/status/time filters when provided', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      okResponse({
        merchantId: 'm_store_001',
        items: [],
        pageInfo: {limit: 5, hasMore: false, nextCursor: null},
      }),
    );

    const {MerchantApi} = require('../src/services/merchantApi');
    await MerchantApi.getAuditLogs('token_fixture', {
      merchantId: 'm_store_001',
      limit: 5,
      action: 'KILL_SWITCH_SET',
      status: 'SUCCESS',
      startTime: '2026-02-20T00:00:00.000Z',
      endTime: '2026-02-21T00:00:00.000Z',
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('action=KILL_SWITCH_SET');
    expect(url).toContain('status=SUCCESS');
    expect(url).toContain('startTime=2026-02-20T00%3A00%3A00.000Z');
    expect(url).toContain('endTime=2026-02-21T00%3A00%3A00.000Z');
  });

  it('sends strategy chat message to the single chat endpoint', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      okResponse({
        merchantId: 'm_store_001',
        sessionId: 'sc_1',
        status: 'CHAT_REPLY',
        pendingReview: null,
        pendingReviews: [],
        deltaMessages: [],
        activeCampaigns: [],
        approvedStrategies: [],
      }),
    );

    const {MerchantApi} = require('../src/services/merchantApi');
    await MerchantApi.sendStrategyChatMessage('token_fixture', {
      merchantId: 'm_store_001',
      content: 'Need lunch acquisition strategy under budget 200',
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/merchant/strategy-chat/messages');
    expect(options.method).toBe('POST');
    const payload = JSON.parse(options.body);
    expect(payload.sessionId).toBeUndefined();
    expect(payload.content).toContain('lunch acquisition');
  });

  it('updates alliance config', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(
      okResponse({
        merchantId: 'm_store_001',
        clusterId: 'cluster_fixture_brand',
        stores: ['m_store_001', 'm_bistro'],
        walletShared: true,
        tierShared: false,
      }),
    );

    const {MerchantApi} = require('../src/services/merchantApi');
    await MerchantApi.setAllianceConfig('token_fixture', {
      merchantId: 'm_store_001',
      stores: ['m_store_001', 'm_bistro'],
      walletShared: true,
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/merchant/alliance-config');
    expect(options.method).toBe('POST');
    const payload = JSON.parse(options.body);
    expect(payload.walletShared).toBe(true);
    expect(payload.stores).toEqual(['m_store_001', 'm_bistro']);
  });

});
