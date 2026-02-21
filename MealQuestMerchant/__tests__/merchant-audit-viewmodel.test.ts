import {buildAuditLogRow} from '../src/services/auditLogViewModel';

describe('audit log view model', () => {
  it('maps success status and detail payload', () => {
    const row = buildAuditLogRow({
      auditId: 'audit_1',
      timestamp: '2026-02-21T08:00:00.000Z',
      merchantId: 'm_demo',
      action: 'PAYMENT_VERIFY',
      status: 'SUCCESS',
      role: 'CUSTOMER',
      operatorId: 'u_demo',
      details: {paymentTxnId: 'txn_1', orderAmount: 52},
    });

    expect(row.title).toBe('成功');
    expect(row.severity).toBe('info');
    expect(row.summary).toContain('PAYMENT_VERIFY');
    expect(row.detail).toContain('paymentTxnId');
  });

  it('maps denied status as warn', () => {
    const row = buildAuditLogRow({
      auditId: 'audit_2',
      timestamp: 'invalid-time',
      merchantId: 'm_demo',
      action: 'PROPOSAL_CONFIRM',
      status: 'DENIED',
      role: 'CLERK',
      operatorId: 'staff_clerk',
      details: {},
    });

    expect(row.title).toBe('拒绝');
    expect(row.severity).toBe('warn');
    expect(row.summary).toContain('--:--:--');
    expect(row.detail).toContain('details');
  });
});
