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
        current.lastPaymentId = paymentId;
        CUSTOMER_STATE[key] = current;

        return {
            paymentId,
            quote,
            snapshot: {
                store: snapshot.store,
                ...cloneSnapshotState(current)
            }
        };
    }
};
