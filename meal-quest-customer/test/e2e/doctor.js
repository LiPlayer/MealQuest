const { resolveCliPath } = require('./utils/wechat-devtools-cli');
const { isAutoLaunchEnabled } = require('./utils/mini-program-session');

const cliPath = resolveCliPath();
const servicePort = process.env.WECHAT_SERVICE_PORT || '';
const wsEndpoint = process.env.WECHAT_WS_ENDPOINT || '';
const autoLaunch = isAutoLaunchEnabled(process.env);

console.log('[e2e-doctor] WECHAT_CLI_PATH =', process.env.WECHAT_CLI_PATH || '(unset)');
console.log('[e2e-doctor] resolved cliPath =', cliPath || '(not found)');
console.log('[e2e-doctor] WECHAT_SERVICE_PORT =', servicePort || '(unset)');
console.log('[e2e-doctor] WECHAT_WS_ENDPOINT =', wsEndpoint || '(unset)');
console.log('[e2e-doctor] WECHAT_E2E_AUTO_LAUNCH =', autoLaunch ? 'enabled' : 'disabled');

const hasConnectMode = Boolean(servicePort || wsEndpoint);
const hasLaunchMode = Boolean(cliPath && autoLaunch);

if (!hasConnectMode && !hasLaunchMode) {
    console.error('[e2e-doctor] No launch/connect entry available.');
    console.error('[e2e-doctor] Use one of:');
    console.error('[e2e-doctor] 1) set WECHAT_WS_ENDPOINT or WECHAT_SERVICE_PORT for connect mode');
    console.error('[e2e-doctor] 2) set WECHAT_E2E_AUTO_LAUNCH=1 and provide WECHAT_CLI_PATH (or put CLI into PATH)');
    process.exit(1);
}

console.log('[e2e-doctor] OK');
