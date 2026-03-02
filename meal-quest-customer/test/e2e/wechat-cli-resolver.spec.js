const path = require('path');

const {
    resolveCliPath,
    resolveFromEnvPath,
    WINDOWS_DEFAULT_CLI_PATHS,
    MAC_DEFAULT_CLI_PATHS,
} = require('./utils/wechat-devtools-cli');

describe('WeChat DevTools CLI resolver', () => {
    it('prefers WECHAT_CLI_PATH when it exists', () => {
        const env = {
            WECHAT_CLI_PATH: 'C:/custom/wechat/cli.bat',
            PATH: 'C:/bin;D:/bin',
        };

        const resolved = resolveCliPath({
            env,
            platform: 'win32',
            existsSync: (target) => target === 'C:/custom/wechat/cli.bat',
        });

        expect(resolved).toBe('C:/custom/wechat/cli.bat');
    });

    it('finds cli from PATH on Windows', () => {
        const env = {
            PATH: 'C:/tools;D:/wechat',
        };
        const expected = path.join('D:/wechat', 'cli.bat');

        const resolved = resolveCliPath({
            env,
            platform: 'win32',
            existsSync: (target) => target === expected,
        });

        expect(resolved).toBe(expected);
    });

    it('finds cli from PATH on macOS', () => {
        const env = {
            PATH: '/usr/local/bin:/Applications/wechat/bin',
        };
        const expected = '/Applications/wechat/bin/cli';

        const resolved = resolveCliPath({
            env,
            platform: 'darwin',
            existsSync: (target) => target === expected,
        });

        expect(resolved).toBe(expected);
    });

    it('falls back to known default locations', () => {
        const winDefault = WINDOWS_DEFAULT_CLI_PATHS[0];

        const winResolved = resolveCliPath({
            env: {},
            platform: 'win32',
            existsSync: (target) => target === winDefault,
        });
        expect(winResolved).toBe(winDefault);

        const macDefault = MAC_DEFAULT_CLI_PATHS[0];
        const macResolved = resolveCliPath({
            env: {},
            platform: 'darwin',
            existsSync: (target) => target === macDefault,
        });
        expect(macResolved).toBe(macDefault);
    });

    it('returns null when no cli is discoverable', () => {
        const resolved = resolveCliPath({
            env: { PATH: '' },
            platform: 'win32',
            existsSync: () => false,
        });

        expect(resolved).toBeNull();
    });

    it('supports quoted PATH entries', () => {
        const envPath = '"C:/Program Files (x86)/Tencent/\u5fae\u4fe1web\u5f00\u53d1\u8005\u5de5\u5177";C:/other';
        const expected = path.join(
            'C:/Program Files (x86)/Tencent/\u5fae\u4fe1web\u5f00\u53d1\u8005\u5de5\u5177',
            'cli.bat',
        );

        const resolved = resolveFromEnvPath(
            envPath,
            'win32',
            (target) => target === expected,
        );

        expect(resolved).toBe(expected);
    });
});

