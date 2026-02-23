import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Taro from '@tarojs/taro';

import AccountPage from '@/pages/account/index';
import { DataService } from '@/services/DataService';
import { storage } from '@/utils/storage';

jest.mock('@/services/DataService', () => ({
    DataService: {
        getHomeSnapshot: jest.fn(),
        getPaymentLedger: jest.fn(),
        getInvoices: jest.fn(),
        cancelAccount: jest.fn()
    }
}));

jest.mock('@/utils/storage', () => ({
    storage: {
        getLastStoreId: jest.fn(),
        clearCustomerSession: jest.fn()
    }
}));

describe('Account page', () => {
    const dataServiceMock = DataService as jest.Mocked<typeof DataService>;
    const storageMock = storage as jest.Mocked<typeof storage>;

    beforeEach(() => {
        jest.clearAllMocks();
        storageMock.getLastStoreId.mockReturnValue('m_store_001');
        dataServiceMock.getHomeSnapshot.mockResolvedValue({
            store: {
                id: 'm_store_001',
                name: 'Demo Merchant',
                branchName: 'Main',
                slogan: 'demo',
                logo: 'demo',
                theme: {
                    primaryColor: '#000',
                    secondaryColor: '#111',
                    backgroundColor: '#fff'
                },
                isOpen: true
            },
            wallet: { principal: 100, bonus: 20, silver: 30 },
            fragments: { common: 1, rare: 1 },
            vouchers: [],
            activities: []
        } as any);
        dataServiceMock.getPaymentLedger.mockResolvedValue([
            {
                txnId: 'txn_1',
                merchantId: 'm_store_001',
                userId: 'u_demo',
                type: 'PAYMENT',
                amount: 12,
                timestamp: '2026-02-21T00:00:00.000Z'
            }
        ] as any);
        dataServiceMock.getInvoices.mockResolvedValue([
            {
                invoiceNo: 'INV_1',
                merchantId: 'm_store_001',
                userId: 'u_demo',
                paymentTxnId: 'txn_1',
                amount: 12,
                status: 'ISSUED',
                issuedAt: '2026-02-21T00:00:00.000Z',
                title: 'invoice'
            }
        ] as any);
    });

    it('renders wallet, ledger and invoices', async () => {
        render(<AccountPage />);

        await waitFor(() => {
            expect(screen.getByText('账户中心')).toBeInTheDocument();
        });
        await waitFor(() => {
            expect(dataServiceMock.getInvoices).toHaveBeenCalledWith('m_store_001', 'u_demo', 20);
        });
        expect(screen.getByText('支付流水')).toBeInTheDocument();
        expect(screen.getByText('电子发票')).toBeInTheDocument();
    });

    it('requires second click to cancel account and then relaunches', async () => {
        dataServiceMock.cancelAccount.mockResolvedValue({
            deleted: true,
            deletedAt: '2026-02-21T00:00:00.000Z',
            anonymizedUserId: 'DELETED_m_store_001_u_demo'
        });

        render(<AccountPage />);
        await waitFor(() => expect(screen.getByText('注销账号')).toBeInTheDocument());

        fireEvent.click(screen.getByText('注销账号'));
        expect(Taro.showToast).toHaveBeenCalledWith({ title: '再次点击确认注销', icon: 'none' });

        fireEvent.click(screen.getByText('确认注销'));
        await waitFor(() => {
            expect(dataServiceMock.cancelAccount).toHaveBeenCalledWith('m_store_001', 'u_demo');
        });
        expect(storageMock.clearCustomerSession).toHaveBeenCalledWith('m_store_001', 'u_demo');
        expect(Taro.reLaunch).toHaveBeenCalledWith({ url: '/pages/startup/index' });
    });
});
