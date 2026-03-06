const { resolveCliPath } = require('./utils/wechat-devtools-cli');
const {
    resolveProjectPath,
    resolveAutoPort,
    resolveE2EContext,
} = require('./utils/mini-program-session');

const cliPath = resolveCliPath();
const projectPath = resolveProjectPath(process.env);
const autoPort = resolveAutoPort(process.env);
const context = resolveE2EContext(process.env);

console.log('[e2e-doctor] WECHAT_CLI_PATH =', process.env.WECHAT_CLI_PATH || '(unset)');
console.log('[e2e-doctor] resolved cliPath =', cliPath || '(not found)');
console.log('[e2e-doctor] WECHAT_PROJECT_PATH =', process.env.WECHAT_PROJECT_PATH || `(default:${projectPath})`);
console.log('[e2e-doctor] WECHAT_AUTO_PORT =', process.env.WECHAT_AUTO_PORT || `(default:${autoPort})`);
console.log('[e2e-doctor] resolved mode =', context.mode);
if (context.wsEndpoint) {
    console.log('[e2e-doctor] resolved wsEndpoint =', context.wsEndpoint);
}

if (!context.runnable) {
    console.error('[e2e-doctor] Auto-launch runtime is not runnable:', context.reason);
    console.error('[e2e-doctor] Required: WECHAT_CLI_PATH (or CLI in PATH).');
    process.exit(1);
}

console.log('[e2e-doctor] OK');
