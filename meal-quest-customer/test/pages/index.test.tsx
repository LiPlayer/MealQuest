import { render, waitFor } from '@testing-library/react';

import IndexPage from '@/pages/index/index';
import { DataService } from '@/services/DataService';
import { storage } from '@/utils/storage';

jest.mock('@/services/DataService', () => ({
  DataService: {
    getHomeSnapshot: jest.fn(),
    executeCheckout: jest.fn(),
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
  };
}

describe('Index page welcome activity visibility', () => {
  const dataServiceMock = DataService as jest.Mocked<typeof DataService>;
  const storageMock = storage as jest.Mocked<typeof storage>;

  beforeEach(() => {
    jest.clearAllMocks();
    storageMock.getLastStoreId.mockReturnValue('m_store_001');
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
});
