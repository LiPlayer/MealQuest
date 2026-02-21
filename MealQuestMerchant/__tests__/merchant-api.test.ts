describe('merchantApi audit logs', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.MQ_USE_REMOTE_API = 'true';
    process.env.MQ_SERVER_BASE_URL = 'http://127.0.0.1:3030';
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    delete process.env.MQ_USE_REMOTE_API;
    delete process.env.MQ_SERVER_BASE_URL;
  });

  it('requests audit logs with cursor pagination', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        merchantId: 'm_demo',
        items: [],
        pageInfo: {limit: 2, hasMore: false, nextCursor: null},
      }),
    });

    const {MerchantApi} = require('../src/services/merchantApi');
    await MerchantApi.getAuditLogs('token_demo', {
      merchantId: 'm_demo',
      limit: 2,
      cursor: 'cursor_1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/audit/logs?');
    expect(url).toContain('merchantId=m_demo');
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
        merchantId: 'm_demo',
        items: [],
        pageInfo: {limit: 5, hasMore: false, nextCursor: null},
      }),
    });

    const {MerchantApi} = require('../src/services/merchantApi');
    await MerchantApi.getAuditLogs('token_demo', {
      merchantId: 'm_demo',
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
});
