const path = require('path');

const session = require('./utils/mini-program-session');

describe('mini-program-session context resolver', () => {
    it('detects legacy connect env as unsupported', () => {
        expect(session.hasLegacyConnectEnv({
            WECHAT_WS_ENDPOINT: 'ws://127.0.0.1:9420',
        })).toBe(true);
        expect(session.hasLegacyConnectEnv({
            WECHAT_SERVICE_PORT: '33358',
        })).toBe(true);
        expect(session.hasLegacyConnectEnv({
            WECHAT_WS_ENDPOINT: '',
            WECHAT_SERVICE_PORT: '',
        })).toBe(false);
    });

    it('returns blocked context when legacy connect env exists', () => {
        const context = session.resolveE2EContext({
            WECHAT_WS_ENDPOINT: 'ws://127.0.0.1:9420',
        });

        expect(context.runnable).toBe(false);
        expect(context.mode).toBe('none');
        expect(context.reason).toContain('legacy connect env');
    });

    it('uses WECHAT_AUTO_PORT when valid', () => {
        const autoPort = session.resolveAutoPort({
            WECHAT_AUTO_PORT: '9527',
        });

        expect(autoPort).toBe(9527);
    });

    it('falls back to default auto port on invalid value', () => {
        const autoPort = session.resolveAutoPort({
            WECHAT_AUTO_PORT: 'invalid',
        });

        expect(autoPort).toBe(9420);
    });

    it('uses WECHAT_PROJECT_PATH when provided', () => {
        const projectPath = session.resolveProjectPath({
            WECHAT_PROJECT_PATH: '/tmp/custom-weapp',
        });

        expect(projectPath).toBe('/tmp/custom-weapp');
    });

    it('falls back to default dist project path', () => {
        const projectPath = session.resolveProjectPath({});
        expect(projectPath).toBe(path.resolve(__dirname, '../../dist'));
    });

    it('blocks context when cli is not discoverable', () => {
        const context = session.resolveE2EContext(
            { PATH: '' },
            {
                platform: 'win32',
                existsSync: () => false,
                resolveCliPath: () => null,
            }
        );

        expect(context.runnable).toBe(false);
        expect(context.reason).toContain('cli not found');
    });

    it('uses auto-connect mode on Windows auto-launch path', () => {
        const context = session.resolveE2EContext(
            {
                WECHAT_CLI_PATH: 'C:/wechat/cli.bat',
                WECHAT_PROJECT_PATH: '/tmp/project',
                WECHAT_AUTO_PORT: '9527',
            },
            {
                platform: 'win32',
                existsSync: (target) => target === '/tmp/project' || target === 'C:/wechat/cli.bat',
            }
        );

        expect(context.runnable).toBe(true);
        expect(context.mode).toBe('auto-connect');
        expect(context.autoPort).toBe(9527);
        expect(context.wsEndpoint).toBe('ws://127.0.0.1:9527');
    });
});
