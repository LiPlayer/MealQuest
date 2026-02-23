jest.mock('react-native-config', () => ({
    MQ_SERVER_URL: 'http://localhost:3000',
    MQ_ENABLE_ENTRY_FLOW: 'false',
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn(async () => null),
        setItem: jest.fn(async () => undefined),
        removeItem: jest.fn(async () => undefined),
    },
}));
