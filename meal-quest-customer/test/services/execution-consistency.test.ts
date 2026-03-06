import {
  buildExecutionConsistencyRecords,
  hasTouchpointConsistencyConflict,
} from '@/services/customerApp/executionConsistency';
import { CustomerNotificationItem, TouchpointItem } from '@/services/dataTypes';

describe('execution consistency mapping', () => {
  it('maps execution notification to friendly record', () => {
    const notifications: CustomerNotificationItem[] = [
      {
        notificationId: 'notification_1',
        merchantId: 'm_store_001',
        recipientType: 'CUSTOMER_USER',
        recipientId: 'u_fixture_001',
        category: 'EXECUTION_RESULT',
        title: '权益触达结果',
        body: '事件 PAYMENT_VERIFY 未执行，存在阻断条件',
        status: 'READ',
        createdAt: '2026-03-06T01:00:00.000Z',
        readAt: '2026-03-06T01:10:00.000Z',
        related: {
          event: 'PAYMENT_VERIFY',
          outcome: 'BLOCKED',
          reasonCodes: ['constraint:frequency_exceeded'],
        },
      },
    ];

    const rows = buildExecutionConsistencyRecords(notifications, 3);
    expect(rows.length).toBe(1);
    expect(rows[0].stage).toBe('扩收');
    expect(rows[0].outcome).toBe('BLOCKED');
    expect(rows[0].outcomeLabel).toBe('未执行');
    expect(rows[0].explanation).toContain('今日触达次数已达上限');
  });

  it('infers outcome from notification text when related is absent', () => {
    const notifications: CustomerNotificationItem[] = [
      {
        notificationId: 'notification_2',
        merchantId: 'm_store_001',
        recipientType: 'CUSTOMER_USER',
        recipientId: 'u_fixture_001',
        category: 'EXECUTION_RESULT',
        title: '权益触达结果',
        body: '事件 APP_OPEN 已命中策略',
        status: 'READ',
        createdAt: '2026-03-06T02:00:00.000Z',
        readAt: '2026-03-06T02:10:00.000Z',
      },
    ];
    const rows = buildExecutionConsistencyRecords(notifications, 3);
    expect(rows[0].outcome).toBe('HIT');
    expect(rows[0].outcomeLabel).toBe('已命中');
  });

  it('detects conflict between touchpoint and latest execution result', () => {
    const touchpoints: TouchpointItem[] = [
      {
        activityId: 'tp_1',
        stage: '扩收',
        outcome: 'HIT',
        explanation: '已命中',
      },
    ];
    const notifications: CustomerNotificationItem[] = [
      {
        notificationId: 'notification_3',
        merchantId: 'm_store_001',
        recipientType: 'CUSTOMER_USER',
        recipientId: 'u_fixture_001',
        category: 'EXECUTION_RESULT',
        title: '权益触达结果',
        body: '事件 PAYMENT_VERIFY 未执行，存在阻断条件',
        status: 'READ',
        createdAt: '2026-03-06T03:00:00.000Z',
        readAt: '2026-03-06T03:10:00.000Z',
        related: {
          event: 'PAYMENT_VERIFY',
          outcome: 'BLOCKED',
          reasonCodes: ['constraint:frequency_exceeded'],
        },
      },
    ];
    const records = buildExecutionConsistencyRecords(notifications, 3);
    expect(hasTouchpointConsistencyConflict(touchpoints, records)).toBe(true);
  });
});
