const fs = require('fs');
const path = require('path');
const automator = require('miniprogram-automator');

const { resolveCliPath } = require('./wechat-devtools-cli');

const DEFAULT_LAUNCH_TIMEOUT_MS = 120000;
const DEFAULT_PROJECT_PATH = path.resolve(__dirname, '../../../dist');

const normalize = (value) => String(value || '').trim();

const resolveWsEndpoint = (env = process.env) => {
    const wsEndpoint = normalize(env.WECHAT_WS_ENDPOINT);
    if (wsEndpoint) {
        return wsEndpoint;
    }

    const servicePort = normalize(env.WECHAT_SERVICE_PORT);
    if (servicePort) {
        return `ws://127.0.0.1:${servicePort}`;
    }

    return '';
};

const resolveProjectPath = (env = process.env) => {
    const custom = normalize(env.WECHAT_PROJECT_PATH);
    if (custom) {
        return custom;
    }
    return DEFAULT_PROJECT_PATH;
};

const isAutoLaunchEnabled = (env = process.env) => {
    const value = normalize(env.WECHAT_E2E_AUTO_LAUNCH).toLowerCase();
    return value === '1' || value === 'true';
};

const resolveE2EContext = (env = process.env) => {
    const wsEndpoint = resolveWsEndpoint(env);
    if (wsEndpoint) {
        return {
            runnable: true,
            mode: 'connect',
            wsEndpoint,
            reason: ''
        };
    }

    if (!isAutoLaunchEnabled(env)) {
        return {
            runnable: false,
            mode: 'none',
            reason: 'auto launch disabled (set WECHAT_E2E_AUTO_LAUNCH=1 to enable)'
        };
    }

    const cliPath = resolveCliPath({ env });
    const projectPath = resolveProjectPath(env);
    const projectExists = fs.existsSync(projectPath);

    if (!cliPath) {
        return {
            runnable: false,
            mode: 'none',
            reason: 'wechat cli not found',
            projectPath
        };
    }

    if (!projectExists) {
        return {
            runnable: false,
            mode: 'none',
            reason: `project path not found: ${projectPath}`,
            projectPath,
            cliPath
        };
    }

    return {
        runnable: true,
        mode: 'launch',
        cliPath,
        projectPath,
        reason: ''
    };
};

const launchMiniProgram = async (context) => {
    if (!context || !context.runnable) {
        throw new Error(`e2e context is not runnable: ${context ? context.reason : 'unknown'}`);
    }

    if (context.mode === 'connect') {
        return automator.connect({
            wsEndpoint: context.wsEndpoint
        });
    }

    return automator.launch({
        cliPath: context.cliPath,
        projectPath: context.projectPath,
        timeout: DEFAULT_LAUNCH_TIMEOUT_MS,
        trustProject: true
    });
};

const clearAppStorage = async (miniProgram) => {
    await miniProgram.evaluate(() => {
        wx.clearStorageSync();
    });
};

const waitForSelector = async (page, selector, timeoutMs = 5000) => {
    const startedAt = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const el = await page.$(selector);
        if (el) {
            return el;
        }
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error(`selector not found within timeout: ${selector}`);
        }
        await page.waitFor(100);
    }
};

module.exports = {
    resolveWsEndpoint,
    resolveProjectPath,
    isAutoLaunchEnabled,
    resolveE2EContext,
    launchMiniProgram,
    clearAppStorage,
    waitForSelector
};
