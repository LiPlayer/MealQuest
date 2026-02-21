import { ActivityItem } from '@/components/ActivityArea';
import { Voucher } from '@/components/cards/P03_TicketCard';
import { buildSmartCheckoutQuote, CheckoutQuote, CustomerWallet } from '@/domain/smartCheckout';

export interface StoreTheme {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
}

export interface StoreData {
    id: string;
    name: string;
    branchName: string;
    slogan: string;
    logo: string; // URL or placeholder
    theme: StoreTheme;
    isOpen: boolean;
}

export interface HomeSnapshot {
    store: StoreData;
    wallet: CustomerWallet;
    fragments: {
        common: number;
        rare: number;
    };
    vouchers: Voucher[];
    activities: ActivityItem[];
    lastPaymentId?: string;
}

export interface PaymentLedgerItem {
    txnId: string;
    merchantId: string;
    userId: string;
    type: 'PAYMENT' | 'REFUND' | 'PAYMENT_PENDING';
    amount: number;
    timestamp: string;
    paymentTxnId?: string;
}

export interface InvoiceItem {
    invoiceNo: string;
    merchantId: string;
    userId: string;
    paymentTxnId: string;
    amount: number;
    status: string;
    issuedAt: string;
    title: string;
}

const MOCK_STORES: Record<string, StoreData> = {
    'store_a': {
        id: 'store_a',
        name: '探味轩',
        branchName: '悦海园路店',
        slogan: '寻千种风味，遇百道好菜',
        logo: 'https://api.dicebear.com/9.x/icons/svg?seed=Felix',
        theme: {
            primaryColor: '#FFB100', // Amber
            secondaryColor: '#FFF8E1',
            backgroundColor: '#FAFAFA'
        },
        isOpen: true
    },
    'store_b': {
        id: 'store_b',
        name: 'Sushi Master',
        branchName: 'Ginza Tokyo',
        slogan: 'Fresh from the Ocean',
        logo: 'https://api.dicebear.com/9.x/icons/svg?seed=Sushi',
        theme: {
            primaryColor: '#FF5252', // Red
            secondaryColor: '#FFEBEE',
            backgroundColor: '#121212' // Dark mode example
        },
        isOpen: true
    },
    'store_closed': {
        id: 'store_closed',
        name: 'Midnight Diner',
        branchName: 'Back Alley',
        slogan: 'Stories and Food',
        logo: 'https://api.dicebear.com/9.x/icons/svg?seed=Moon',
        theme: {
            primaryColor: '#607D8B',
            secondaryColor: '#ECEFF1',
            backgroundColor: '#F5F5F5'
        },
        isOpen: false
    }
};

const CUSTOMER_STATE: Record<string, Omit<HomeSnapshot, 'store'>> = {
    'store_a:u_demo': {
        wallet: {
            principal: 120,
            bonus: 36,
            silver: 12850
        },
        fragments: {
            common: 12,
            rare: 2
        },
        vouchers: [
            {
                id: 'voucher_soon',
                name: '葱油拌面券',
                value: 18,
                minSpend: 0,
                status: 'ACTIVE',
                expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
            },
            {
                id: 'voucher_big',
                name: '无门槛红包',
                value: 30,
                minSpend: 20,
                status: 'ACTIVE',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            }
        ],
        activities: [
            {
                id: 'act_welcome',
                title: '新人进店礼',
                desc: '绑定门店即得口福红包',
                icon: '🎁',
                color: 'bg-rose-50',
                textColor: 'text-rose-600',
                tag: 'NEW'
            },
            {
                id: 'act_rainy',
                title: '雨天热汤补给',
                desc: '天气触发动态福利，暖胃又省钱',
                icon: '🌧️',
                color: 'bg-blue-50',
                textColor: 'text-blue-600',
                tag: 'TCA'
            },
            {
                id: 'act_recharge',
                title: '聚宝金库限时礼',
                desc: '充值立享赠送金与次单抵扣',
                icon: '💰',
                color: 'bg-amber-50',
                textColor: 'text-amber-600',
                tag: 'HOT'
            }
        ]
    }
};

const CUSTOMER_LEDGER: Record<string, PaymentLedgerItem[]> = {};
const CUSTOMER_INVOICES: Record<string, InvoiceItem[]> = {};
const CANCELED_USERS = new Set<string>();

const cloneSnapshotState = (state: Omit<HomeSnapshot, 'store'>): Omit<HomeSnapshot, 'store'> => ({
    wallet: { ...state.wallet },
    fragments: { ...state.fragments },
    vouchers: state.vouchers.map(v => ({ ...v })),
    activities: state.activities.map(a => ({ ...a })),
    lastPaymentId: state.lastPaymentId
});

const getStateKey = (storeId: string, userId: string) => `${storeId}:${userId}`;

export const MockDataService = {
    getStoreById: (id: string): Promise<StoreData | null> => {
        return new Promise((resolve) => {
            const delay = process.env.NODE_ENV === 'test' ? 0 : 500;
            // Simulate network delay
            setTimeout(() => {
                const store = MOCK_STORES[id] || MOCK_STORES['store_a']; // Fallback to A for dev convenience
                resolve(store);
            }, delay);
        });
    },

    getHomeSnapshot: async (storeId: string, userId = 'u_demo'): Promise<HomeSnapshot> => {
        const store = await MockDataService.getStoreById(storeId) ?? MOCK_STORES['store_a'];
        const key = getStateKey(store.id, userId);
        if (CANCELED_USERS.has(key)) {
            throw new Error('account canceled');
        }
        const state = CUSTOMER_STATE[key] ?? cloneSnapshotState(CUSTOMER_STATE['store_a:u_demo']);
        CUSTOMER_STATE[key] = state;

        return {
            store,
            ...cloneSnapshotState(state)
        };
    },

    getCheckoutQuote: async (storeId: string, orderAmount: number, userId = 'u_demo'): Promise<CheckoutQuote> => {
        const snapshot = await MockDataService.getHomeSnapshot(storeId, userId);
        return buildSmartCheckoutQuote(orderAmount, snapshot.wallet, snapshot.vouchers);
    },

    executeCheckout: async (
        storeId: string,
        orderAmount: number,
        userId = 'u_demo'
    ): Promise<{ paymentId: string; quote: CheckoutQuote; snapshot: HomeSnapshot }> => {
        const snapshot = await MockDataService.getHomeSnapshot(storeId, userId);
        const quote = buildSmartCheckoutQuote(orderAmount, snapshot.wallet, snapshot.vouchers);
        const key = getStateKey(storeId, userId);
        const current = CUSTOMER_STATE[key] ?? cloneSnapshotState(CUSTOMER_STATE['store_a:u_demo']);

        current.wallet = { ...quote.remainingWallet };
        if (quote.selectedVoucher) {
            current.vouchers = current.vouchers.map(v =>
                v.id === quote.selectedVoucher?.id ? { ...v, status: 'USED' } : v
            );
        }

        const paymentId = `pay_${Date.now()}`;
        const now = new Date().toISOString();
        current.lastPaymentId = paymentId;
        CUSTOMER_STATE[key] = current;

        const ledger = CUSTOMER_LEDGER[key] ?? [];
        ledger.unshift({
            txnId: `txn_${Date.now()}`,
            merchantId: storeId,
            userId,
            type: 'PAYMENT',
            amount: Number(orderAmount),
            paymentTxnId: paymentId,
            timestamp: now
        });
        CUSTOMER_LEDGER[key] = ledger.slice(0, 100);

        const invoices = CUSTOMER_INVOICES[key] ?? [];
        invoices.unshift({
            invoiceNo: `INV_DEMO_${Date.now()}`,
            merchantId: storeId,
            userId,
            paymentTxnId: paymentId,
            amount: Number(orderAmount),
            status: 'ISSUED',
            issuedAt: now,
            title: 'MealQuest Demo Invoice'
        });
        CUSTOMER_INVOICES[key] = invoices.slice(0, 100);

        return {
            paymentId,
            quote,
            snapshot: {
                store: snapshot.store,
                ...cloneSnapshotState(current)
            }
        };
    },

    getPaymentLedger: async (
        storeId: string,
        userId = 'u_demo',
        limit = 20
    ): Promise<PaymentLedgerItem[]> => {
        const key = getStateKey(storeId, userId);
        if (CANCELED_USERS.has(key)) {
            return [];
        }
        const rows = CUSTOMER_LEDGER[key] ?? [];
        const max = Math.min(Math.max(Number(limit) || 20, 1), 100);
        return rows.slice(0, max).map(item => ({ ...item }));
    },

    getInvoices: async (
        storeId: string,
        userId = 'u_demo',
        limit = 20
    ): Promise<InvoiceItem[]> => {
        const key = getStateKey(storeId, userId);
        if (CANCELED_USERS.has(key)) {
            return [];
        }
        const rows = CUSTOMER_INVOICES[key] ?? [];
        const max = Math.min(Math.max(Number(limit) || 20, 1), 100);
        return rows.slice(0, max).map(item => ({ ...item }));
    },

    cancelAccount: async (
        storeId: string,
        userId = 'u_demo'
    ): Promise<{ deleted: boolean; deletedAt: string; anonymizedUserId: string }> => {
        const key = getStateKey(storeId, userId);
        const deletedAt = new Date().toISOString();
        CANCELED_USERS.add(key);
        delete CUSTOMER_STATE[key];
        delete CUSTOMER_LEDGER[key];
        delete CUSTOMER_INVOICES[key];
        return {
            deleted: true,
            deletedAt,
            anonymizedUserId: `DELETED_${storeId}_${userId}`
        };
    }
};
