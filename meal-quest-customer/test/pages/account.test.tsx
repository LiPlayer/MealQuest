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
    markNotificationsRead: jest.fn(),
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
        },
      ],
      hasMore: false,
      nextCursor: null,
    } as any);
    dataServiceMock.markNotificationsRead.mockResolvedValue({
      updatedCount: 1,
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
    expect(document.getElementById('account-touchpoint-title')).toBeInTheDocument();
    expect(document.getElementById('account-notification-title')).toBeInTheDocument();
    expect(document.body.textContent).toContain('权益触达结果');
    expect(document.body.textContent).toContain('当前条件未满足');
    expect(dataServiceMock.markNotificationsRead).toHaveBeenCalledWith(
      'm_store_001',
      'u_fixture_001',
      { markAll: true },
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
  });
});
