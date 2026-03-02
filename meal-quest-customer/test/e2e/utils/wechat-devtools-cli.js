const fs = require('fs');
const path = require('path');

const WINDOWS_DEFAULT_CLI_PATHS = [
    'C:/Program Files (x86)/Tencent/\u5fae\u4fe1web\u5f00\u53d1\u8005\u5de5\u5177/cli.bat',
    'C:/Program Files/Tencent/\u5fae\u4fe1web\u5f00\u53d1\u8005\u5de5\u5177/cli.bat',
    'C:/Program Files/Tencent/\u5fae\u4fe1\u5f00\u53d1\u8005\u5de5\u5177/cli.bat',
    'D:/Program Files (x86)/Tencent/\u5fae\u4fe1web\u5f00\u53d1\u8005\u5de5\u5177/cli.bat',
    'D:/Program Files/Tencent/\u5fae\u4fe1web\u5f00\u53d1\u8005\u5de5\u5177/cli.bat',
];

const MAC_DEFAULT_CLI_PATHS = [
    '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
];

const normalize = (value) => String(value || '').trim().replace(/^"+|"+$/g, '');

const pathDelimiterOf = (platform) => (platform === 'win32' ? ';' : ':');

const joinByPlatform = (platform, base, name) => (
    platform === 'win32'
        ? path.win32.join(base, name)
        : path.posix.join(base, name)
);

const cliBasenamesOf = (platform) => (
    platform === 'win32'
        ? ['cli.bat', 'cli.cmd', 'cli.exe']
        : ['cli']
);

const defaultCandidatesOf = (platform) => {
    if (platform === 'win32') {
        return WINDOWS_DEFAULT_CLI_PATHS;
    }
    if (platform === 'darwin') {
        return MAC_DEFAULT_CLI_PATHS;
    }
    return [];
};

const resolveFromEnvPath = (envPath, platform, existsSyncFn) => {
    const normalizedPath = normalize(envPath);
    if (!normalizedPath) {
        return null;
    }

    const entries = normalizedPath
        .split(pathDelimiterOf(platform))
        .map((entry) => normalize(entry))
        .filter(Boolean);
    const basenames = cliBasenamesOf(platform);

    for (const entry of entries) {
        for (const basename of basenames) {
            const candidate = joinByPlatform(platform, entry, basename);
            if (existsSyncFn(candidate)) {
                return candidate;
            }
        }
    }

    return null;
};

const resolveCliPath = (options = {}) => {
    const env = options.env || process.env;
    const platform = options.platform || process.platform;
    const existsSyncFn = options.existsSync || fs.existsSync;

    const envCliPath = normalize(env.WECHAT_CLI_PATH);
    if (envCliPath && existsSyncFn(envCliPath)) {
        return envCliPath;
    }

    const pathHit = resolveFromEnvPath(env.PATH, platform, existsSyncFn);
    if (pathHit) {
        return pathHit;
    }

    const defaultCandidates = defaultCandidatesOf(platform);
    return defaultCandidates.find((candidate) => existsSyncFn(candidate)) || null;
};

module.exports = {
    resolveCliPath,
    resolveFromEnvPath,
    WINDOWS_DEFAULT_CLI_PATHS,
    MAC_DEFAULT_CLI_PATHS,
};
