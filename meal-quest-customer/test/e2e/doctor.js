const { resolveCliPath } = require('./utils/wechat-devtools-cli');

const cliPath = resolveCliPath();
const servicePort = process.env.WECHAT_SERVICE_PORT || '';
const wsEndpoint = process.env.WECHAT_WS_ENDPOINT || '';

console.log('[e2e-doctor] WECHAT_CLI_PATH =', process.env.WECHAT_CLI_PATH || '(unset)');
console.log('[e2e-doctor] resolved cliPath =', cliPath || '(not found)');
console.log('[e2e-doctor] WECHAT_SERVICE_PORT =', servicePort || '(unset)');
console.log('[e2e-doctor] WECHAT_WS_ENDPOINT =', wsEndpoint || '(unset)');

if (!cliPath && !servicePort && !wsEndpoint) {
    console.error('[e2e-doctor] No launch/connect entry available.');
    console.error('[e2e-doctor] Set WECHAT_CLI_PATH, or put WeChat DevTools CLI into PATH, or set WECHAT_SERVICE_PORT/WECHAT_WS_ENDPOINT.');
    process.exit(1);
}

console.log('[e2e-doctor] OK');

