jest.mock('react-native-config', () => ({
    MQ_SERVER_URL: 'http://localhost:3000',
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn(async (key: string) => {
            if (key === 'mq_merchant_entry_done') return '1';
            if (key === 'mq_merchant_entry_merchant_id') return 'm_demo';
            return null;
        }),
        setItem: jest.fn(async () => undefined),
        removeItem: jest.fn(async () => undefined),
    },
}));
