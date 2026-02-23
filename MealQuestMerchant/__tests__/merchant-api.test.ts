describe('merchantApi audit logs', () => {
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
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        merchantId: 'm_store_001',
        items: [],
        pageInfo: {limit: 2, hasMore: false, nextCursor: null},
      }),
    });

    const {MerchantApi} = require('../src/services/merchantApi');
    await MerchantApi.getAuditLogs('token_demo', {
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
    expect(options.headers.Authorization).toBe('Bearer token_demo');
  });

  it('includes action/status/time filters when provided', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        merchantId: 'm_store_001',
        items: [],
        pageInfo: {limit: 5, hasMore: false, nextCursor: null},
      }),
    });

    const {MerchantApi} = require('../src/services/merchantApi');
    await MerchantApi.getAuditLogs('token_demo', {
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

  it('loads strategy library with merchant scope', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        merchantId: 'm_store_001',
        templates: [],
      }),
    });

    const {MerchantApi} = require('../src/services/merchantApi');
    await MerchantApi.getStrategyLibrary('token_demo', 'm_store_001');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/merchant/strategy-library?merchantId=m_store_001');
    expect(options.method).toBe('GET');
    expect(options.headers.Authorization).toBe('Bearer token_demo');
  });

  it('creates strategy proposal with template and branch', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        proposalId: 'proposal_1',
        status: 'PENDING',
      }),
    });

    const {MerchantApi} = require('../src/services/merchantApi');
    await MerchantApi.createStrategyProposal('token_demo', {
      merchantId: 'm_store_001',
      templateId: 'activation_contextual_drop',
      branchId: 'COOLING',
      intent: '高温活动',
      overrides: {budget: {cap: 80}},
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/merchant/strategy-proposals');
    expect(options.method).toBe('POST');
    const payload = JSON.parse(options.body);
    expect(payload.templateId).toBe('activation_contextual_drop');
    expect(payload.branchId).toBe('COOLING');
    expect(payload.overrides.budget.cap).toBe(80);
  });

  it('updates campaign status', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        merchantId: 'm_store_001',
        campaignId: 'campaign_1',
        status: 'PAUSED',
      }),
    });

    const {MerchantApi} = require('../src/services/merchantApi');
    await MerchantApi.setCampaignStatus('token_demo', {
      merchantId: 'm_store_001',
      campaignId: 'campaign_1',
      status: 'PAUSED',
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/merchant/campaigns/campaign_1/status');
    expect(options.method).toBe('POST');
    const payload = JSON.parse(options.body);
    expect(payload.status).toBe('PAUSED');
  });

  it('updates alliance config', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        merchantId: 'm_store_001',
        clusterId: 'cluster_demo_brand',
        stores: ['m_store_001', 'm_bistro'],
        walletShared: true,
        tierShared: false,
      }),
    });

    const {MerchantApi} = require('../src/services/merchantApi');
    await MerchantApi.setAllianceConfig('token_demo', {
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

  it('posts social transfer payload', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        transferId: 'transfer_1',
      }),
    });

    const {MerchantApi} = require('../src/services/merchantApi');
    await MerchantApi.socialTransfer('token_demo', {
      merchantId: 'm_store_001',
      fromUserId: 'u_demo',
      toUserId: 'u_friend',
      amount: 20,
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/social/transfer');
    expect(options.method).toBe('POST');
    const payload = JSON.parse(options.body);
    expect(payload.amount).toBe(20);
    expect(payload.toUserId).toBe('u_friend');
  });

  it('creates treat session payload', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sessionId: 'treat_1',
      }),
    });

    const {MerchantApi} = require('../src/services/merchantApi');
    await MerchantApi.createTreatSession('token_demo', {
      merchantId: 'm_store_001',
      initiatorUserId: 'u_demo',
      mode: 'MERCHANT_SUBSIDY',
      orderAmount: 100,
      subsidyRate: 0.2,
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/social/treat/sessions');
    expect(options.method).toBe('POST');
    const payload = JSON.parse(options.body);
    expect(payload.mode).toBe('MERCHANT_SUBSIDY');
    expect(payload.orderAmount).toBe(100);
  });

  it('queries social red packet by id', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        packetId: 'packet_1',
        status: 'ACTIVE',
      }),
    });

    const {MerchantApi} = require('../src/services/merchantApi');
    await MerchantApi.getSocialRedPacket('token_demo', {
      merchantId: 'm_store_001',
      packetId: 'packet_1',
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/social/red-packets/packet_1?merchantId=m_store_001');
    expect(options.method).toBe('GET');
  });
});

