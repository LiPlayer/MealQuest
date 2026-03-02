const path = require('path');

const session = require('./utils/mini-program-session');

describe('mini-program-session context resolver', () => {
    it('prefers WECHAT_WS_ENDPOINT for connect mode', () => {
        const context = session.resolveE2EContext({
            WECHAT_WS_ENDPOINT: 'ws://127.0.0.1:9420',
        });

        expect(context.runnable).toBe(true);
        expect(context.mode).toBe('connect');
        expect(context.wsEndpoint).toBe('ws://127.0.0.1:9420');
    });

    it('builds ws endpoint from WECHAT_SERVICE_PORT', () => {
        const endpoint = session.resolveWsEndpoint({
            WECHAT_SERVICE_PORT: '33358',
        });

        expect(endpoint).toBe('ws://127.0.0.1:33358');
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

    it('requires explicit auto-launch switch when no ws endpoint is provided', () => {
        const context = session.resolveE2EContext({
            PATH: ''
        });
        expect(context.runnable).toBe(false);
        expect(context.reason).toContain('WECHAT_E2E_AUTO_LAUNCH');
    });
});
