const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const automator = require('miniprogram-automator');

const { resolveCliPath } = require('./wechat-devtools-cli');

const DEFAULT_LAUNCH_TIMEOUT_MS = 120000;
const DEFAULT_CONNECT_RETRY_INTERVAL_MS = 1000;
const DEFAULT_AUTO_PORT = 9420;
const WINDOWS_PLATFORM = 'win32';
const DEFAULT_PROJECT_PATH = path.resolve(__dirname, '../../../dist');

const normalize = (value) => String(value || '').trim();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hasLegacyConnectEnv = (env = process.env) => {
  return Boolean(normalize(env.WECHAT_WS_ENDPOINT) || normalize(env.WECHAT_SERVICE_PORT));
};

const resolveProjectPath = (env = process.env) => {
  const custom = normalize(env.WECHAT_PROJECT_PATH);
  if (custom) {
    return custom;
  }
  return DEFAULT_PROJECT_PATH;
};

const resolveAutoPort = (env = process.env) => {
  const rawPort = normalize(env.WECHAT_AUTO_PORT);
  if (!rawPort) {
    return DEFAULT_AUTO_PORT;
  }
  const parsed = Number.parseInt(rawPort, 10);
  if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
    return parsed;
  }
  return DEFAULT_AUTO_PORT;
};

const resolveE2EContext = (env = process.env, options = {}) => {
  const platform = options.platform || process.platform;
  const existsSyncFn = options.existsSync || fs.existsSync;
  const cliPathResolver = options.resolveCliPath || resolveCliPath;

  if (hasLegacyConnectEnv(env)) {
    return {
      runnable: false,
      mode: 'none',
      reason: 'legacy connect env is no longer supported (remove WECHAT_WS_ENDPOINT/WECHAT_SERVICE_PORT)'
    };
  }

  const cliPath = cliPathResolver({ env, platform, existsSync: existsSyncFn });
  const projectPath = resolveProjectPath(env);
  const projectExists = existsSyncFn(projectPath);

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

  if (platform === WINDOWS_PLATFORM) {
    const autoPort = resolveAutoPort(env);
    return {
      runnable: true,
      mode: 'auto-connect',
      cliPath,
      projectPath,
      autoPort,
      wsEndpoint: `ws://127.0.0.1:${autoPort}`,
      reason: ''
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

const escapePowerShellLiteral = (value) => String(value || '').replace(/'/g, "''");

const runWindowsCliAuto = (context, timeoutMs = DEFAULT_LAUNCH_TIMEOUT_MS) => new Promise((resolve, reject) => {
  const command = `& '${escapePowerShellLiteral(context.cliPath)}' auto --project '${escapePowerShellLiteral(context.projectPath)}' --auto-port ${context.autoPort} --trust-project`;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const output = [];
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);

  child.stdout.on('data', (chunk) => {
    const text = String(chunk || '').trim();
    if (text) {
      output.push(`stdout: ${text}`);
    }
  });
  child.stderr.on('data', (chunk) => {
    const text = String(chunk || '').trim();
    if (text) {
      output.push(`stderr: ${text}`);
    }
  });
  child.on('error', (error) => {
    clearTimeout(timer);
    reject(new Error(`failed to run wechat cli auto command: ${error.message}`));
  });
  child.on('exit', (code, signal) => {
    clearTimeout(timer);
    if (timedOut) {
      reject(new Error(`wechat cli auto command timed out in ${timeoutMs}ms`));
      return;
    }
    if (code === 0) {
      resolve();
      return;
    }
    const detail = output.join('\n') || '(no output)';
    reject(new Error(`wechat cli auto exited with code ${code} signal ${signal || 'none'}\n${detail}`));
  });
});

const connectWithRetry = async (wsEndpoint, timeoutMs = DEFAULT_LAUNCH_TIMEOUT_MS) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() <= deadline) {
    try {
      return await automator.connect({ wsEndpoint });
    } catch (error) {
      lastError = error;
      await wait(DEFAULT_CONNECT_RETRY_INTERVAL_MS);
    }
  }
  const reason = lastError ? lastError.message : 'unknown connect timeout';
  throw new Error(`failed connecting to ${wsEndpoint}: ${reason}`);
};

const launchMiniProgram = async (context) => {
  if (!context || !context.runnable) {
    throw new Error(`e2e context is not runnable: ${context ? context.reason : 'unknown'}`);
  }

  if (context.mode === 'auto-connect') {
    await runWindowsCliAuto(context, DEFAULT_LAUNCH_TIMEOUT_MS);
    return connectWithRetry(context.wsEndpoint, DEFAULT_LAUNCH_TIMEOUT_MS);
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
  hasLegacyConnectEnv,
  resolveProjectPath,
  resolveAutoPort,
  resolveE2EContext,
  launchMiniProgram,
  clearAppStorage,
  waitForSelector
};
