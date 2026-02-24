const taroMock = {
    getStorageSync: jest.fn(),
    setStorageSync: jest.fn(),
    removeStorageSync: jest.fn(),
    request: jest.fn(),
    login: jest.fn(async () => ({ code: 'wx_code_demo' })),
    reLaunch: jest.fn(),
    navigateTo: jest.fn(),
    scanCode: jest.fn(),
    showToast: jest.fn(),
    nextTick: (callback) => callback(),
    pxTransform: jest.fn((value) => `${value}px`),
    vibrateShort: jest.fn(),
    getMenuButtonBoundingClientRect: jest.fn(() => ({
        top: 44,
        bottom: 76,
        height: 32
    })),
    useRouter: () => ({ params: {} }),
    // Mock useLoad hook to execute the callback immediately but only once
    useLoad: (callback) => {
        const { useEffect } = require('react');
        useEffect(() => {
            if (callback) {
                callback({}); // Simulate page load with empty options
            }
        }, [callback]);
    },
};

export default taroMock;
export const useLoad = taroMock.useLoad;
export const setStorageSync = taroMock.setStorageSync;
export const getStorageSync = taroMock.getStorageSync;
export const removeStorageSync = taroMock.removeStorageSync;
export const request = taroMock.request;
export const login = taroMock.login;
export const reLaunch = taroMock.reLaunch;
export const navigateTo = taroMock.navigateTo;
export const scanCode = taroMock.scanCode;
export const showToast = taroMock.showToast;
export const nextTick = taroMock.nextTick;
export const pxTransform = taroMock.pxTransform;
export const vibrateShort = taroMock.vibrateShort;
export const getMenuButtonBoundingClientRect = taroMock.getMenuButtonBoundingClientRect;
export const useRouter = taroMock.useRouter;
