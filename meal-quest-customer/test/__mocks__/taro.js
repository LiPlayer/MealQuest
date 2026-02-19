const taroMock = {
    getStorageSync: jest.fn(),
    setStorageSync: jest.fn(),
    removeStorageSync: jest.fn(),
    reLaunch: jest.fn(),
    scanCode: jest.fn(),
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
export const reLaunch = taroMock.reLaunch;
export const scanCode = taroMock.scanCode;
