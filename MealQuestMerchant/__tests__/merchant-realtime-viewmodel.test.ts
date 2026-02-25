import {
  buildRealtimeEventRow,
  buildSystemEventRow,
} from '../src/services/realtimeEventViewModel';

describe('realtime event view model', () => {
  it('builds mapped metadata and detail for known payload event', () => {
    const row = buildRealtimeEventRow({
      type: 'PAYMENT_VERIFIED',
      merchantId: 'm_store_001',
      payload: {paymentTxnId: 'txn_1', amount: 52},
      timestamp: '2026-02-21T08:00:00.000Z',
    });

    expect(row.type).toBe('PAYMENT_VERIFIED');
    expect(row.severity).toBe('info');
    expect(row.isAnomaly).toBe(false);
    expect(row.summary).toContain('[');
    expect(row.summary).toContain(']');
    expect(row.detail).toContain('paymentTxnId');
    expect(row.detail).toContain('txn_1');
  });

  it('handles empty payload for anomaly event', () => {
    const row = buildRealtimeEventRow({
      type: 'KILL_SWITCH_CHANGED',
      merchantId: 'm_store_001',
      payload: {},
      timestamp: 'invalid-time',
    });

    expect(row.severity).toBe('warn');
    expect(row.isAnomaly).toBe(true);
    expect(row.summary).toContain('--:--:--');
    expect(row.detail).toContain('payload');
  });

  it('falls back to raw type for unknown event', () => {
    const row = buildRealtimeEventRow({
      type: 'SOME_NEW_EVENT',
      merchantId: 'm_store_001',
      payload: {x: 1},
      timestamp: '2026-02-21T08:00:00.000Z',
    });

    expect(row.label).toBe('SOME_NEW_EVENT');
    expect(row.severity).toBe('info');
    expect(row.isAnomaly).toBe(false);
  });

  it('builds system error event as anomaly', () => {
    const row = buildSystemEventRow({
      type: 'SYSTEM_WS_ERROR',
      detail: 'ws disconnected',
      timestamp: '2026-02-21T08:00:00.000Z',
    });

    expect(row.type).toBe('SYSTEM_WS_ERROR');
    expect(row.severity).toBe('error');
    expect(row.isAnomaly).toBe(true);
    expect(row.detail).toBe('ws disconnected');
  });

});
