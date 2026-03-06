import { render, waitFor } from '@testing-library/react';

import IndexPage from '@/pages/index/index';
import { DataService } from '@/services/DataService';
import { storage } from '@/utils/storage';

jest.mock('@/services/DataService', () => ({
  DataService: {
    getHomeSnapshot: jest.fn(),
    executeCheckout: jest.fn(),
    getNotificationInbox: jest.fn(),
    getCustomerStabilitySnapshot: jest.fn(),
  },
}));

jest.mock('@/utils/storage', () => ({
  storage: {
    getLastStoreId: jest.fn(),
  },
}));

function createSnapshot(activities: Array<{ id: string; title: string; desc: string; tag: string }>) {
  return {
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
    wallet: { principal: 100, bonus: 20, silver: 5 },
    fragments: { common: 1, rare: 0 },
    vouchers: [],
    activities: activities.map((item) => ({
      id: item.id,
      title: item.title,
      desc: item.desc,
      icon: '*',
      color: 'bg-emerald-50',
      textColor: 'text-emerald-600',
      tag: item.tag,
    })),
    touchpointContract: {
      objectiveLabel: '触达以长期价值为导向，系统会根据行为与规则反馈是否命中权益。',
      behaviorSignals: ['扫码入店', '活动触达', '支付核销', '账票查询'],
      recentTouchpoints: [
        {
          activityId: 'activation_hit_1',
          stage: '激活',
          outcome: 'HIT',
          explanation: '已命中促活连签规则。',
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
  };
}

describe('Index page welcome activity visibility', () => {
  const dataServiceMock = DataService as jest.Mocked<typeof DataService>;
  const storageMock = storage as jest.Mocked<typeof storage>;

  beforeEach(() => {
    jest.clearAllMocks();
    storageMock.getLastStoreId.mockReturnValue('m_store_001');
    dataServiceMock.getNotificationInbox.mockResolvedValue({
      items: [
        {
          notificationId: 'notification_exec_001',
          merchantId: 'm_store_001',
          recipientType: 'CUSTOMER_USER',
          recipientId: 'u_fixture_001',
          category: 'EXECUTION_RESULT',
          title: '权益触达结果',
          body: '事件 PAYMENT_VERIFY 已命中策略',
          status: 'READ',
          createdAt: '2026-03-06T00:00:00.000Z',
          readAt: '2026-03-06T00:10:00.000Z',
          related: {
            outcome: 'HIT',
            event: 'PAYMENT_VERIFY',
            reasonCodes: [],
          },
        },
      ],
      hasMore: false,
      nextCursor: null,
    } as any);
    dataServiceMock.getCustomerStabilitySnapshot.mockResolvedValue({
      version: 'S090-SRV-02.v1',
      merchantId: 'm_store_001',
      objective: 'LONG_TERM_VALUE_MAXIMIZATION',
      evaluatedAt: '2026-03-07T10:00:00.000Z',
      windowDays: 30,
      stabilityLevel: 'STABLE',
      stabilityLabel: '稳定',
      summary: '当前服务稳定，可放心使用。',
      drivers: [
        {
          code: 'TECHNICAL_GATE',
          label: '支付与核心链路',
          status: 'PASS',
        },
      ],
      reasons: [],
    } as any);
  });

  it('renders welcome hit activity card', async () => {
    dataServiceMock.getHomeSnapshot.mockResolvedValue(
      createSnapshot([
        {
          id: 'welcome_hit_1',
          title: '欢迎权益已发放',
          desc: '已命中 Welcome 规则，可前往资产区查看到账变更。',
          tag: 'WELCOME',
        },
      ]) as any,
    );

    render(<IndexPage />);

    await waitFor(() => {
      expect(dataServiceMock.getHomeSnapshot).toHaveBeenCalledWith('m_store_001');
    });
    await waitFor(() => {
      expect(document.body.textContent).toContain('欢迎权益已发放');
    });
  });

  it('renders welcome blocked activity card with reason', async () => {
    dataServiceMock.getHomeSnapshot.mockResolvedValue(
      createSnapshot([
        {
          id: 'welcome_block_1',
          title: '欢迎权益未发放',
          desc: '原因：segment_mismatch',
          tag: 'WELCOME',
        },
      ]) as any,
    );

    render(<IndexPage />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('欢迎权益未发放');
      expect(document.body.textContent).toContain('原因：segment_mismatch');
    });
  });

  it('renders activation hit activity card', async () => {
    dataServiceMock.getHomeSnapshot.mockResolvedValue(
      createSnapshot([
        {
          id: 'activation_hit_1',
          title: '连签激活奖励已到账',
          desc: '已命中促活连签规则，可前往资产区查看到账变更。',
          tag: 'ACTIVATION',
        },
      ]) as any,
    );

    render(<IndexPage />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('连签激活奖励已到账');
    });
  });

  it('renders activation blocked activity card with reason', async () => {
    dataServiceMock.getHomeSnapshot.mockResolvedValue(
      createSnapshot([
        {
          id: 'activation_block_1',
          title: '连签激活奖励未发放',
          desc: '原因：constraint:frequency_exceeded',
          tag: 'ACTIVATION',
        },
      ]) as any,
    );

    render(<IndexPage />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('连签激活奖励未发放');
      expect(document.body.textContent).toContain('原因：constraint:frequency_exceeded');
    });
  });

  it('renders revenue hit activity card', async () => {
    dataServiceMock.getHomeSnapshot.mockResolvedValue(
      createSnapshot([
        {
          id: 'revenue_hit_1',
          title: '加购激励已发放',
          desc: '已命中提客单策略，可前往资产区查看到账券。',
          tag: 'REVENUE',
        },
      ]) as any,
    );

    render(<IndexPage />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('加购激励已发放');
    });
  });

  it('renders revenue blocked activity card with reason', async () => {
    dataServiceMock.getHomeSnapshot.mockResolvedValue(
      createSnapshot([
        {
          id: 'revenue_block_1',
          title: '加购激励未发放',
          desc: '原因：constraint:frequency_exceeded',
          tag: 'REVENUE',
        },
      ]) as any,
    );

    render(<IndexPage />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('加购激励未发放');
      expect(document.body.textContent).toContain('原因：constraint:frequency_exceeded');
    });
  });

  it('renders retention hit activity card', async () => {
    dataServiceMock.getHomeSnapshot.mockResolvedValue(
      createSnapshot([
        {
          id: 'retention_hit_1',
          title: '沉默召回奖励已发放',
          desc: '已命中 14 天沉默召回规则，可前往资产区查看到账券。',
          tag: 'RETENTION',
        },
      ]) as any,
    );

    render(<IndexPage />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('沉默召回奖励已发放');
    });
  });

  it('renders retention blocked activity card with reason', async () => {
    dataServiceMock.getHomeSnapshot.mockResolvedValue(
      createSnapshot([
        {
          id: 'retention_block_1',
          title: '沉默召回奖励未发放',
          desc: '原因：constraint:frequency_exceeded',
          tag: 'RETENTION',
        },
      ]) as any,
    );

    render(<IndexPage />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('沉默召回奖励未发放');
      expect(document.body.textContent).toContain('原因：constraint:frequency_exceeded');
    });
  });

  it('renders friendly explanation and optional reason code', async () => {
    dataServiceMock.getHomeSnapshot.mockResolvedValue(
      {
        ...createSnapshot([
          {
            id: 'welcome_block_2',
            title: '欢迎权益未发放',
            desc: '原因：segment_mismatch',
            tag: 'WELCOME',
          },
        ]),
        activities: [
          {
            id: 'welcome_block_2',
            title: '欢迎权益未发放',
            desc: '原因：segment_mismatch',
            explanation: '当前条件未满足',
            reasonCode: 'segment_mismatch',
            icon: '!',
            color: 'bg-amber-50',
            textColor: 'text-amber-700',
            tag: 'WELCOME',
          },
        ],
      } as any,
    );

    render(<IndexPage />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('欢迎权益未发放');
      expect(document.body.textContent).toContain('当前条件未满足');
      expect(document.body.textContent).toContain('原因码：segment_mismatch');
    });
  });

  it('renders lifecycle progress and game linkage summary', async () => {
    dataServiceMock.getHomeSnapshot.mockResolvedValue(
      createSnapshot([
        {
          id: 'engagement_hit_1',
          title: '活跃互动已命中',
          desc: '已命中活跃互动规则。',
          tag: 'PLAY',
        },
      ]) as any,
    );

    render(<IndexPage />);

    await waitFor(() => {
      expect(document.getElementById('index-lifecycle-title')).toBeInTheDocument();
      expect(document.getElementById('index-stability-guard-title')).toBeInTheDocument();
      expect(document.getElementById('index-execution-consistency-title')).toBeInTheDocument();
      expect(document.getElementById('index-game-linkage-title')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(document.body.textContent).toContain('生命周期进度');
      expect(document.body.textContent).toContain('灰度体验守护');
      expect(document.body.textContent).toContain('当前状态：稳定');
      expect(document.body.textContent).toContain('灰度影响受控，支付与账户主链路可正常使用。');
      expect(document.body.textContent).toContain('最新权益变更说明');
      expect(document.body.textContent).toContain('扩收 · 已命中');
      expect(document.body.textContent).toContain('小游戏联动反馈');
      expect(document.body.textContent).toContain('可收集奖励：2');
      expect(document.body.textContent).toContain('签到小游戏');
      expect(document.body.textContent).toContain('激活');
    });
    expect(dataServiceMock.getCustomerStabilitySnapshot).toHaveBeenCalledWith('m_store_001', '');
  });

  it('renders guard notice in watch mode', async () => {
    dataServiceMock.getCustomerStabilitySnapshot.mockResolvedValue({
      version: 'S090-SRV-02.v1',
      merchantId: 'm_store_001',
      objective: 'LONG_TERM_VALUE_MAXIMIZATION',
      evaluatedAt: '2026-03-07T10:00:00.000Z',
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
      ],
      reasons: [
        {
          code: 'PAYMENT_NO_SAMPLE',
          message: '支付样本不足，稳定性持续观察中',
        },
      ],
    } as any);
    dataServiceMock.getHomeSnapshot.mockResolvedValue(createSnapshot([]) as any);

    render(<IndexPage />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('当前状态：需留意');
      expect(document.body.textContent).toContain('灰度观察中，系统已启用保护提示，支付与账户主链路不受影响。');
      expect(document.body.textContent).toContain('提示 · PAYMENT_NO_SAMPLE');
    });
  });

  it('degrades guard module when stability api fails', async () => {
    dataServiceMock.getCustomerStabilitySnapshot.mockRejectedValue(new Error('stability service down'));
    dataServiceMock.getHomeSnapshot.mockResolvedValue(createSnapshot([]) as any);

    render(<IndexPage />);

    await waitFor(() => {
      expect(document.body.textContent).toContain('守护状态暂不可用，可稍后刷新。');
    });
    expect(document.getElementById('index-pay-button')).toBeInTheDocument();
    expect(document.getElementById('index-execution-consistency-title')).toBeInTheDocument();
  });
});
