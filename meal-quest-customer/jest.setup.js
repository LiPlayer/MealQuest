import '@testing-library/jest-dom';

// Global mocks for Taro API
global.wx = {
    getStorageSync: jest.fn(),
    setStorageSync: jest.fn(),
    removeStorageSync: jest.fn(),
    reLaunch: jest.fn(),
    scanCode: jest.fn(),
};
