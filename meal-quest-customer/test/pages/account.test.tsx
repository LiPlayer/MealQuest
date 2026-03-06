import { fireEvent, render, waitFor } from '@testing-library/react';
import Taro from '@tarojs/taro';

import AccountPage from '@/pages/account/index';
import { DataService } from '@/services/DataService';
import { storage } from '@/utils/storage';

jest.mock('@/services/DataService', () => ({
  DataService: {
    getHomeSnapshot: jest.fn(),
    getPaymentLedger: jest.fn(),
    getInvoices: jest.fn(),
    getNotificationInbox: jest.fn(),
    getNotificationUnreadSummary: jest.fn(),
    getNotificationPreferences: jest.fn(),
    setNotificationPreferences: jest.fn(),
    getCustomerStabilitySnapshot: jest.fn(),
    markNotificationsRead: jest.fn(),
    createFeedbackTicket: jest.fn(),
    getFeedbackTickets: jest.fn(),
    getFeedbackTicketDetail: jest.fn(),
    cancelAccount: jest.fn(),
  },
}));

jest.mock('@/utils/storage', () => ({
  storage: {
    getLastStoreId: jest.fn(),
    getCustomerUserId: jest.fn(),
    clearCustomerSession: jest.fn(),
  },
}));

describe('Account page', () => {
  const dataServiceMock = DataService as jest.Mocked<typeof DataService>;
  const storageMock = storage as jest.Mocked<typeof storage>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    storageMock.getLastStoreId.mockReturnValue('m_store_001');
    storageMock.getCustomerUserId.mockReturnValue('u_fixture_001');
    dataServiceMock.getHomeSnapshot.mockResolvedValue({
      store: {
        id: 'm_store_001',
        name: 'Fixture Merchant',
        branchName: 'Main',
        slogan: 'fixture',
        logo: 'fixture',
        theme: {
          primaryColor: '#000',
          secondaryColor: '#111',
          backgroundColor: '#fff',
        },
        isOpen: true,
      },
      wallet: { principal: 100, bonus: 20, silver: 30 },
      fragments: { common: 1, rare: 1 },
      vouchers: [],
      activities: [],
      touchpointContract: {
        objectiveLabel: '触达以长期价值为导向，系统会根据行为与规则反馈是否命中权益。',
        behaviorSignals: ['扫码入店', '活动触达', '支付核销', '账票查询'],
        recentTouchpoints: [
          {
            activityId: 'welcome_block_1',
            stage: '获客',
            outcome: 'BLOCKED',
            explanation: '当前条件未满足',
            reasonCode: 'segment_mismatch',
          },
        ],
      },
      gameSummary: {
        collectibleCount: 2,
        unlockedGameCount: 1,
        touchpointCount: 1,
      },
      gameTouchpoints: [
        {
          touchpointId: 'game_touchpoint_1',
          title: '签到小游戏',
          desc: '完成签到获得碎片奖励。',
          rewardLabel: '碎片 x1',
        },
      ],
    } as any);
    dataServiceMock.getPaymentLedger.mockResolvedValue([
      {
        txnId: 'txn_1',
        merchantId: 'm_store_001',
        userId: 'u_fixture_001',
        type: 'PAYMENT',
        amount: 12,
        timestamp: '2026-02-21T00:00:00.000Z',
      },
    ] as any);
    dataServiceMock.getInvoices.mockResolvedValue([
      {
        invoiceNo: 'INV_1',
        merchantId: 'm_store_001',
        userId: 'u_fixture_001',
        paymentTxnId: 'txn_1',
        amount: 12,
        status: 'ISSUED',
        issuedAt: '2026-02-21T00:00:00.000Z',
        title: 'invoice',
      },
    ] as any);
    dataServiceMock.getNotificationUnreadSummary.mockResolvedValue({
      totalUnread: 1,
      byCategory: [
        { category: 'APPROVAL_TODO', unreadCount: 1 },
        { category: 'EXECUTION_RESULT', unreadCount: 0 },
      ],
    } as any);
    dataServiceMock.getNotificationInbox.mockResolvedValue({
      items: [
        {
          notificationId: 'notification_001',
          merchantId: 'm_store_001',
          recipientType: 'CUSTOMER_USER',
          recipientId: 'u_fixture_001',
          category: 'EXECUTION_RESULT',
          title: '权益触达结果',
          body: '事件 PAYMENT_VERIFY 已命中策略',
          status: 'UNREAD',
          createdAt: '2026-02-21T00:00:00.000Z',
          readAt: null,
          related: {
            event: 'PAYMENT_VERIFY',
            outcome: 'BLOCKED',
            reasonCodes: ['constraint:frequency_exceeded'],
          },
        },
      ],
      hasMore: false,
      nextCursor: null,
    } as any);
    dataServiceMock.markNotificationsRead.mockResolvedValue({
      updatedCount: 1,
    } as any);
    dataServiceMock.getNotificationPreferences.mockResolvedValue({
      version: 'S100-SRV-01.v1',
      merchantId: 'm_store_001',
      recipientType: 'CUSTOMER_USER',
      recipientId: 'u_fixture_001',
      categories: {
        APPROVAL_TODO: true,
        EXECUTION_RESULT: true,
        FEEDBACK_TICKET: true,
        GENERAL: true,
      },
      frequencyCaps: {
        EXECUTION_RESULT: {
          windowSec: 86400,
          maxDeliveries: 3,
        },
      },
      updatedAt: '2026-03-06T10:00:00.000Z',
      updatedBy: 'u_fixture_001',
    } as any);
    dataServiceMock.setNotificationPreferences.mockResolvedValue({
      version: 'S100-SRV-01.v1',
      merchantId: 'm_store_001',
      recipientType: 'CUSTOMER_USER',
      recipientId: 'u_fixture_001',
      categories: {
        APPROVAL_TODO: true,
        EXECUTION_RESULT: false,
        FEEDBACK_TICKET: true,
        GENERAL: true,
      },
      frequencyCaps: {
        EXECUTION_RESULT: {
          windowSec: 86400,
          maxDeliveries: 1,
        },
      },
      updatedAt: '2026-03-06T11:00:00.000Z',
      updatedBy: 'u_fixture_001',
    } as any);
    dataServiceMock.getCustomerStabilitySnapshot.mockResolvedValue({
      version: 'S090-SRV-02.v1',
      merchantId: 'm_store_001',
      objective: 'LONG_TERM_VALUE_MAXIMIZATION',
      evaluatedAt: '2026-03-06T10:00:00.000Z',
      windowDays: 30,
      stabilityLevel: 'WATCH',
      stabilityLabel: '需留意',
      summary: '服务状态需留意，部分能力可能短时波动。',
      drivers: [
        {
          code: 'TECHNICAL_GATE',
          label: '支付与核心链路',
          status: 'REVIEW',
        },
        {
          code: 'COMPLIANCE_GATE',
          label: '隐私与账票合规',
          status: 'PASS',
        },
      ],
      reasons: [
        {
          code: 'PAYMENT_NO_SAMPLE',
          message: '支付样本不足，稳定性持续观察中',
        },
      ],
    } as any);
    dataServiceMock.getFeedbackTickets.mockResolvedValue({
      items: [
        {
          ticketId: 'ticket_001',
          merchantId: 'm_store_001',
          userId: 'u_fixture_001',
          category: 'BENEFIT',
          title: '权益未到账',
          description: '活动奖励未到账',
          contact: '',
          status: 'IN_PROGRESS',
          createdAt: '2026-03-06T08:00:00.000Z',
          updatedAt: '2026-03-06T09:00:00.000Z',
          latestEvent: {
            eventId: 'ticket_001_event_0002',
            fromStatus: 'OPEN',
            toStatus: 'IN_PROGRESS',
            note: '老板已接单处理',
            actorRole: 'OWNER',
            actorId: 'owner_001',
            createdAt: '2026-03-06T09:00:00.000Z',
          },
        },
      ],
      hasMore: false,
      nextCursor: null,
      status: 'ALL',
      category: 'ALL',
    } as any);
    dataServiceMock.getFeedbackTicketDetail.mockResolvedValue({
      ticketId: 'ticket_001',
      merchantId: 'm_store_001',
      userId: 'u_fixture_001',
      category: 'BENEFIT',
      title: '权益未到账',
      description: '活动奖励未到账',
      contact: '',
      status: 'IN_PROGRESS',
      createdAt: '2026-03-06T08:00:00.000Z',
      updatedAt: '2026-03-06T09:00:00.000Z',
      latestEvent: {
        eventId: 'ticket_001_event_0002',
        fromStatus: 'OPEN',
        toStatus: 'IN_PROGRESS',
        note: '老板已接单处理',
        actorRole: 'OWNER',
        actorId: 'owner_001',
        createdAt: '2026-03-06T09:00:00.000Z',
      },
      timeline: [
        {
          eventId: 'ticket_001_event_0001',
          fromStatus: null,
          toStatus: 'OPEN',
          note: '顾客提交问题反馈',
          actorRole: 'CUSTOMER',
          actorId: 'u_fixture_001',
          createdAt: '2026-03-06T08:00:00.000Z',
        },
      ],
    } as any);
    dataServiceMock.createFeedbackTicket.mockResolvedValue({
      ticketId: 'ticket_002',
      merchantId: 'm_store_001',
      userId: 'u_fixture_001',
      category: 'OTHER',
      title: '希望支持更多提醒方式',
      description: '希望支持短信提醒',
      contact: '13800000000',
      status: 'OPEN',
      createdAt: '2026-03-06T10:00:00.000Z',
      updatedAt: '2026-03-06T10:00:00.000Z',
      latestEvent: {
        eventId: 'ticket_002_event_0001',
        fromStatus: null,
        toStatus: 'OPEN',
        note: '顾客提交问题反馈',
        actorRole: 'CUSTOMER',
        actorId: 'u_fixture_001',
        createdAt: '2026-03-06T10:00:00.000Z',
      },
    } as any);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders wallet, ledger and invoices', async () => {
    render(<AccountPage />);

    await waitFor(() => {
      expect(document.getElementById('account-page-title')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(dataServiceMock.getInvoices).toHaveBeenCalledWith('m_store_001', 'u_fixture_001', 20);
    });
    expect(document.getElementById('account-ledger-title')).toBeInTheDocument();
    expect(document.getElementById('account-invoice-title')).toBeInTheDocument();
    expect(document.getElementById('account-stability-title')).toBeInTheDocument();
    expect(document.getElementById('account-touchpoint-title')).toBeInTheDocument();
    expect(document.getElementById('account-notification-title')).toBeInTheDocument();
    expect(document.getElementById('account-notification-preference-title')).toBeInTheDocument();
    expect(document.getElementById('account-feedback-title')).toBeInTheDocument();
    expect(document.body.textContent).toContain('权益触达结果');
    expect(document.body.textContent).toContain('提案执行一致性记录');
    expect(document.body.textContent).toContain('扩收 · 未执行');
    expect(document.body.textContent).toContain('今日触达次数已达上限');
    expect(document.body.textContent).toContain('反馈进展');
    expect(document.body.textContent).toContain('权益未到账');
    expect(document.body.textContent).not.toContain('PAYMENT_VERIFY');
    expect(document.body.textContent).toContain('当前条件未满足');
    expect(document.body.textContent).toContain('服务稳定性');
    expect(document.body.textContent).toContain('需留意');
    expect(document.body.textContent).toContain('当前处于灰度观察阶段，系统已启用守护提示，主链路不受影响。');
    expect(document.body.textContent).toContain('支付样本不足，稳定性持续观察中');
    expect(document.body.textContent).toContain('生命周期阶段记录');
    expect(document.body.textContent).toContain('小游戏联动反馈');
    expect(document.body.textContent).toContain('签到小游戏');
    expect(dataServiceMock.markNotificationsRead).toHaveBeenCalledWith(
      'm_store_001',
      'u_fixture_001',
      { markAll: true },
    );
    expect(dataServiceMock.getCustomerStabilitySnapshot).toHaveBeenCalledWith(
      'm_store_001',
      'u_fixture_001',
    );
  });

  it('requires second click to cancel account and then relaunches', async () => {
    dataServiceMock.cancelAccount.mockResolvedValue({
      deleted: true,
      deletedAt: '2026-02-21T00:00:00.000Z',
      anonymizedUserId: 'DELETED_m_store_001_u_fixture_001',
    });

    render(<AccountPage />);
    await waitFor(() => expect(document.getElementById('account-cancel-button')).toBeInTheDocument());

    const cancelButton = document.getElementById('account-cancel-button');
    expect(cancelButton).not.toBeNull();
    fireEvent.click(cancelButton as Element);
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '再次点击确认注销', icon: 'none' });

    await waitFor(() => {
      expect((document.getElementById('account-cancel-button') as Element).textContent).toContain('确认注销');
    });
    fireEvent.click(document.getElementById('account-cancel-button') as Element);
    await waitFor(() => {
      expect(dataServiceMock.cancelAccount).toHaveBeenCalledWith('m_store_001', 'u_fixture_001');
    });
    expect(storageMock.clearCustomerSession).toHaveBeenCalledWith('m_store_001', 'u_fixture_001');
    expect(Taro.reLaunch).toHaveBeenCalledWith({ url: '/pages/startup/index' });
  });

  it('submits feedback ticket from account page', async () => {
    render(<AccountPage />);
    await waitFor(() => expect(document.getElementById('account-feedback-title-input')).toBeInTheDocument());

    fireEvent.input(document.getElementById('account-feedback-title-input') as Element, {
      target: { value: '希望支持更多提醒方式' },
    });
    fireEvent.input(document.getElementById('account-feedback-description-textarea') as Element, {
      target: { value: '希望支持短信提醒' },
    });
    fireEvent.input(document.getElementById('account-feedback-contact-input') as Element, {
      target: { value: '13800000000' },
    });
    fireEvent.click(document.getElementById('account-feedback-submit-button') as Element);

    await waitFor(() => {
      expect(dataServiceMock.createFeedbackTicket).toHaveBeenCalledWith('m_store_001', 'u_fixture_001', {
        category: 'OTHER',
        title: '希望支持更多提醒方式',
        description: '希望支持短信提醒',
        contact: '13800000000',
      });
    });
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '反馈已提交', icon: 'none' });
  });

  it('degrades notification section when notification api fails', async () => {
    dataServiceMock.getNotificationUnreadSummary.mockRejectedValue(new Error('notification service down'));
    dataServiceMock.getNotificationInbox.mockRejectedValue(new Error('notification service down'));

    render(<AccountPage />);

    await waitFor(() => {
      expect(document.getElementById('account-page-title')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(document.body.textContent).toContain('提醒暂不可用，可稍后刷新');
    });
    expect(document.getElementById('account-ledger-title')).toBeInTheDocument();
    expect(document.getElementById('account-invoice-title')).toBeInTheDocument();
    expect(document.getElementById('account-stability-title')).toBeInTheDocument();
    expect(document.body.textContent).toContain('小游戏联动反馈');
  });

  it('updates notification preference from account page', async () => {
    render(<AccountPage />);
    await waitFor(() =>
      expect(document.getElementById('account-notification-preference-save-button')).toBeInTheDocument(),
    );

    fireEvent.click(document.getElementById('account-notification-toggle-button') as Element);
    fireEvent.click(document.getElementById('account-notification-frequency-low') as Element);
    fireEvent.click(document.getElementById('account-notification-preference-save-button') as Element);

    await waitFor(() => {
      expect(dataServiceMock.setNotificationPreferences).toHaveBeenCalledWith('m_store_001', 'u_fixture_001', {
        categories: {
          EXECUTION_RESULT: false,
        },
        frequencyCaps: {
          EXECUTION_RESULT: {
            windowSec: 86400,
            maxDeliveries: 1,
          },
        },
      });
    });
    await waitFor(() => {
      expect(document.body.textContent).toContain('提醒偏好已更新');
    });
  });

  it('degrades stability module when stability api fails', async () => {
    dataServiceMock.getCustomerStabilitySnapshot.mockRejectedValue(new Error('stability service down'));

    render(<AccountPage />);
    await waitFor(() => expect(document.getElementById('account-stability-title')).toBeInTheDocument());
    await waitFor(() => {
      expect(document.body.textContent).toContain('稳定性暂不可用，可稍后刷新');
    });
    expect(document.getElementById('account-ledger-title')).toBeInTheDocument();
    expect(document.getElementById('account-feedback-title')).toBeInTheDocument();
  });

  it('degrades notification preference module when preference api fails', async () => {
    dataServiceMock.getNotificationPreferences.mockRejectedValue(new Error('preference service down'));

    render(<AccountPage />);
    await waitFor(() => expect(document.getElementById('account-notification-preference-title')).toBeInTheDocument());
    await waitFor(() => {
      expect(document.body.textContent).toContain('提醒偏好暂不可用，可稍后刷新');
    });
    expect(document.getElementById('account-ledger-title')).toBeInTheDocument();
    expect(document.getElementById('account-feedback-title')).toBeInTheDocument();
  });
});
