module.exports = {
    testEnvironment: 'jsdom',
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    moduleNameMapper: {
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '^@tarojs/components$': '<rootDir>/test/__mocks__/taro-components.js',
        '^@tarojs/taro$': '<rootDir>/test/__mocks__/taro.js',
        '^src/(.*)$': '<rootDir>/src/$1',
        '^@/(.*)$': '<rootDir>/src/$1', // Support @/ alias
    },
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
            tsconfig: 'tsconfig.json',
            diagnostics: false,
            isolatedModules: true,
        }],
        '^.+\\.(js|jsx)$': 'babel-jest',
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
    testPathIgnorePatterns: ['<rootDir>/test/e2e/'],
};
