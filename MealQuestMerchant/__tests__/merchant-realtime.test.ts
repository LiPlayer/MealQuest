import {parseRealtimeMessage} from '../src/services/merchantRealtime';

describe('merchantRealtime parser', () => {
  it('parses valid websocket message', () => {
    const parsed = parseRealtimeMessage(
      JSON.stringify({
        type: 'PAYMENT_VERIFIED',
        merchantId: 'm_demo',
        payload: {paymentTxnId: 'txn_1'},
        timestamp: '2026-02-21T00:00:00.000Z',
      }),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('PAYMENT_VERIFIED');
    expect(parsed?.merchantId).toBe('m_demo');
  });

  it('returns null for invalid payload', () => {
    const parsed = parseRealtimeMessage('not-json');
    expect(parsed).toBeNull();
  });
});
