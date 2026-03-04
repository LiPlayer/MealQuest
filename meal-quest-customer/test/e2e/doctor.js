const { resolveCliPath } = require('./utils/wechat-devtools-cli');
const {
    hasLegacyConnectEnv,
    resolveProjectPath,
    resolveAutoPort,
    resolveE2EContext,
} = require('./utils/mini-program-session');

const cliPath = resolveCliPath();
const projectPath = resolveProjectPath(process.env);
const autoPort = resolveAutoPort(process.env);
const context = resolveE2EContext(process.env);
const hasLegacyConnect = hasLegacyConnectEnv(process.env);

console.log('[e2e-doctor] WECHAT_CLI_PATH =', process.env.WECHAT_CLI_PATH || '(unset)');
console.log('[e2e-doctor] resolved cliPath =', cliPath || '(not found)');
console.log('[e2e-doctor] WECHAT_PROJECT_PATH =', process.env.WECHAT_PROJECT_PATH || `(default:${projectPath})`);
console.log('[e2e-doctor] WECHAT_SERVICE_PORT =', process.env.WECHAT_SERVICE_PORT || '(unset)');
console.log('[e2e-doctor] WECHAT_WS_ENDPOINT =', process.env.WECHAT_WS_ENDPOINT || '(unset)');
console.log('[e2e-doctor] WECHAT_AUTO_PORT =', process.env.WECHAT_AUTO_PORT || `(default:${autoPort})`);
console.log('[e2e-doctor] resolved mode =', context.mode);
if (context.wsEndpoint) {
    console.log('[e2e-doctor] resolved wsEndpoint =', context.wsEndpoint);
}

if (hasLegacyConnect) {
    console.error('[e2e-doctor] Legacy connect env is no longer supported.');
    console.error('[e2e-doctor] Remove WECHAT_WS_ENDPOINT and WECHAT_SERVICE_PORT, then use auto-launch only.');
    process.exit(1);
}

if (!context.runnable) {
    console.error('[e2e-doctor] Auto-launch runtime is not runnable:', context.reason);
    console.error('[e2e-doctor] Required: WECHAT_CLI_PATH (or CLI in PATH).');
    process.exit(1);
}

console.log('[e2e-doctor] OK');
