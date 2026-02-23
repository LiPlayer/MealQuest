import { buildSmartCheckoutQuote, CheckoutQuote } from '@/domain/smartCheckout';
import { HomeSnapshot, InvoiceItem, PaymentLedgerItem } from './dataTypes';

interface MockUserState {
    wallet: {
        principal: number;
        bonus: number;
        silver: number;
    };
    fragments: {
        common: number;
        rare: number;
    };
    vouchers: Array<{
        id: string;
        name: string;
        value: number;
        minSpend?: number;
        status?: 'ACTIVE' | 'USED' | 'EXPIRED';
        expiresAt?: string;
    }>;
    ledger: PaymentLedgerItem[];
    invoices: InvoiceItem[];
    canceled: boolean;
}

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const userStateMap = new Map<string, MockUserState>();
let paymentSeq = 1;
let invoiceSeq = 1;

const nowIso = () => new Date().toISOString();

const getStateKey = (storeId: string, userId: string) => `${storeId}::${userId}`;

const createDefaultState = (): MockUserState => ({
    wallet: {
        principal: 88,
        bonus: 24,
        silver: 16
    },
    fragments: {
        common: 3,
        rare: 1
    },
    vouchers: [
        {
            id: 'v_demo_1',
            name: '周末口福券',
            value: 12,
            minSpend: 30,
            status: 'ACTIVE',
            expiresAt: '2099-12-31T23:59:59.000Z'
        },
        {
            id: 'v_demo_2',
            name: '新客加餐券',
            value: 6,
            minSpend: 15,
            status: 'ACTIVE',
            expiresAt: '2099-12-31T23:59:59.000Z'
        }
    ],
    ledger: [],
    invoices: [],
    canceled: false
});

const getOrCreateUserState = (storeId: string, userId: string) => {
    const key = getStateKey(storeId, userId);
    const existing = userStateMap.get(key);
    if (existing) {
        return existing;
    }
    const created = createDefaultState();
    userStateMap.set(key, created);
    return created;
};

const assertNotCanceled = (state: MockUserState) => {
    if (state.canceled) {
        throw new Error('account canceled');
    }
};

const buildSnapshot = (storeId: string, state: MockUserState, lastPaymentId?: string): HomeSnapshot => ({
    store: {
        id: storeId,
        name: 'MealQuest 示例门店',
        branchName: 'A 店',
        slogan: '支付不是结束，而是资产关系的开始',
        logo: 'https://api.dicebear.com/9.x/icons/svg?seed=MealQuest',
        theme: {
            primaryColor: '#FFB100',
            secondaryColor: '#FFF8E1',
            backgroundColor: '#FAFAFA'
        },
        isOpen: true
    },
    wallet: deepClone(state.wallet),
    fragments: deepClone(state.fragments),
    vouchers: deepClone(state.vouchers),
    activities: [
        {
            id: 'mock_activity_1',
            title: '本地演示活动',
            desc: 'MockDataService 本地数据',
            icon: '🎯',
            color: 'bg-orange-50',
            textColor: 'text-orange-600',
            tag: 'LOCAL'
        }
    ],
    ...(lastPaymentId ? { lastPaymentId } : {})
});

export const MockDataService = {
    getHomeSnapshot: async (storeId: string, userId = 'u_demo'): Promise<HomeSnapshot> => {
        const state = getOrCreateUserState(storeId, userId);
        assertNotCanceled(state);
        return buildSnapshot(storeId, state);
    },

    getCheckoutQuote: async (storeId: string, orderAmount: number, userId = 'u_demo'): Promise<CheckoutQuote> => {
        const state = getOrCreateUserState(storeId, userId);
        assertNotCanceled(state);
        return buildSmartCheckoutQuote(orderAmount, state.wallet, state.vouchers);
    },

    executeCheckout: async (
        storeId: string,
        orderAmount: number,
        userId = 'u_demo'
    ): Promise<{ paymentId: string; quote: CheckoutQuote; snapshot: HomeSnapshot }> => {
        const state = getOrCreateUserState(storeId, userId);
        assertNotCanceled(state);

        const quote = buildSmartCheckoutQuote(orderAmount, state.wallet, state.vouchers);
        const paymentId = `pay_${Date.now()}_${paymentSeq++}`;
        const timestamp = nowIso();

        state.wallet = deepClone(quote.remainingWallet);
        if (quote.selectedVoucher) {
            state.vouchers = state.vouchers.map(v =>
                v.id === quote.selectedVoucher?.id ? { ...v, status: 'USED' as const } : v
            );
        }

        state.ledger.unshift({
            txnId: `txn_${paymentId}`,
            merchantId: storeId,
            userId,
            type: 'PAYMENT',
            amount: Number(orderAmount),
            timestamp,
            paymentTxnId: paymentId
        });

        state.invoices.unshift({
            invoiceNo: `INV_DEMO_${String(invoiceSeq++).padStart(4, '0')}`,
            merchantId: storeId,
            userId,
            paymentTxnId: paymentId,
            amount: Number(orderAmount),
            status: 'ISSUED',
            issuedAt: timestamp,
            title: 'MealQuest Invoice'
        });

        return {
            paymentId,
            quote,
            snapshot: buildSnapshot(storeId, state, paymentId)
        };
    },

    getPaymentLedger: async (
        storeId: string,
        userId = 'u_demo',
        limit = 20
    ): Promise<PaymentLedgerItem[]> => {
        const state = getOrCreateUserState(storeId, userId);
        assertNotCanceled(state);
        return deepClone(state.ledger.slice(0, limit));
    },

    getInvoices: async (
        storeId: string,
        userId = 'u_demo',
        limit = 20
    ): Promise<InvoiceItem[]> => {
        const state = getOrCreateUserState(storeId, userId);
        assertNotCanceled(state);
        return deepClone(state.invoices.slice(0, limit));
    },

    cancelAccount: async (
        storeId: string,
        userId = 'u_demo'
    ): Promise<{ deleted: boolean; deletedAt: string; anonymizedUserId: string }> => {
        const state = getOrCreateUserState(storeId, userId);
        state.canceled = true;
        return {
            deleted: true,
            deletedAt: nowIso(),
            anonymizedUserId: `DELETED_${storeId}_${userId}`
        };
    }
};

