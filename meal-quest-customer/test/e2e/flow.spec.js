const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');
const automator = require('miniprogram-automator');

const E2E_TIMEOUT = 120000;

const resolveCliPath = () => {
    if (process.env.WECHAT_CLI_PATH && fs.existsSync(process.env.WECHAT_CLI_PATH)) {
        return process.env.WECHAT_CLI_PATH;
    }

    const candidates = [
        'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat',
        'C:/Program Files/Tencent/微信web开发者工具/cli.bat',
        'C:/Program Files/Tencent/微信开发者工具/cli.bat',
        'D:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat',
        'D:/Program Files/Tencent/微信web开发者工具/cli.bat',
        '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    ];

    return candidates.find((candidate) => fs.existsSync(candidate));
};

const parseCssNumber = (value) => {
    const raw = String(value ?? '');
    const match = raw.match(/-?\d+(\.\d+)?/);
    if (!match) {
        throw new Error(`Unable to parse numeric CSS value: ${raw}`);
    }
    return Number(match[0]);
};

const getTop = async (element) => {
    const offset = await element.offset();
    if (offset?.top !== undefined && offset?.top !== null) {
        return parseCssNumber(offset.top);
    }
    return parseCssNumber(await element.style('top'));
};

const dragDown = async (element, deltaY) => {
    const offset = await element.offset();
    const size = await element.size();
    const left = parseCssNumber(offset.left);
    const top = parseCssNumber(offset.top);
    const width = parseCssNumber(size.width);
    const startX = left + (width / 2);
    const startY = top + 24;
    const middleY = startY + (deltaY / 2);
    const endY = startY + deltaY;

    const touch = (x, y) => ({
        identifier: 0,
        pageX: x,
        pageY: y,
        clientX: x,
        clientY: y,
    });

    const startTouch = touch(startX, startY);
    const middleTouch = touch(startX, middleY);
    const endTouch = touch(startX, endY);

    await element.touchstart({ touches: [startTouch], changeTouches: [startTouch] });
    await element.touchmove({ touches: [middleTouch], changeTouches: [middleTouch] });
    await element.touchmove({ touches: [endTouch], changeTouches: [endTouch] });
    await element.touchend({ touches: [], changeTouches: [endTouch] });
};

const resolveWsEndpointFromServicePort = async (servicePort) => {
    const port = Number(servicePort);
    if (!Number.isFinite(port) || port <= 0) {
        throw new Error(`Invalid WECHAT_SERVICE_PORT: ${servicePort}`);
    }

    const payload = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/upgrade?cli=1`, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk.toString();
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    reject(new Error(`Invalid /upgrade response: ${data}`));
                }
            });
        }).on('error', (error) => reject(error));
    });

    if (!payload?.port) {
        throw new Error(`Missing ws port in /upgrade response: ${JSON.stringify(payload)}`);
    }

    return `ws://127.0.0.1:${payload.port}`;
};

const connectWithTimeout = async (wsEndpoint, timeoutMs = 10000) => {
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error(`automator.connect timeout after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    return Promise.race([
        automator.connect({ wsEndpoint }),
        timeoutPromise,
    ]);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseWsPort = (wsEndpoint) => {
    try {
        const url = new URL(wsEndpoint);
        const port = Number(url.port);
        return Number.isFinite(port) && port > 0 ? port : null;
    } catch {
        return null;
    }
};

const startAutoWithCli = (cliPath, projectPath, autoPort) => {
    const psQuote = (value) => String(value).replace(/'/g, "''");
    const command =
        `& '${psQuote(cliPath)}' auto --project '${psQuote(projectPath)}' ` +
        `--auto-port ${Number(autoPort)} --trust-project`;

    const run = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
        encoding: 'utf8',
        stdio: 'pipe',
        windowsHide: true,
    });

    if (run.error) {
        throw run.error;
    }
    if (run.status !== 0) {
        const output = [run.stdout, run.stderr].filter(Boolean).join('\n');
        throw new Error(`cli auto failed with code ${run.status}: ${output}`);
    }
};

const connectWithBootstrap = async (wsEndpoint, projectPath) => {
    try {
        return await connectWithTimeout(wsEndpoint, 6000);
    } catch (firstError) {
        const cliPath = resolveCliPath();
        const autoPort = parseWsPort(wsEndpoint);
        if (!cliPath || !autoPort) {
            throw firstError;
        }

        startAutoWithCli(cliPath, projectPath, autoPort);
        await sleep(1500);
        return connectWithTimeout(wsEndpoint, 10000);
    }
};

describe('Customer Card Stack Drag Regression', () => {
    let miniProgram;

    beforeAll(async () => {
        const projectPath = path.resolve(__dirname, '../..');

        const servicePort = process.env.WECHAT_SERVICE_PORT;
        if (servicePort) {
            const wsEndpoint = await resolveWsEndpointFromServicePort(servicePort);
            try {
                miniProgram = await connectWithBootstrap(wsEndpoint, projectPath);
                return;
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                throw new Error(
                    `Connected service port ${servicePort}, resolved ws endpoint ${wsEndpoint}, ` +
                    `but automator connection failed: ${detail}. ` +
                    'Use WECHAT_WS_ENDPOINT only when you already know a valid automator websocket endpoint.',
                );
            }
        }

        const wsEndpoint = process.env.WECHAT_WS_ENDPOINT || 'ws://127.0.0.1:9420';
        if (process.env.WECHAT_WS_ENDPOINT) {
            miniProgram = await connectWithBootstrap(wsEndpoint, projectPath);
            return;
        }

        const cliPath = resolveCliPath();
        if (!cliPath) {
            throw new Error(
                'WeChat DevTools CLI not found. Set WECHAT_CLI_PATH or install DevTools to default path.',
            );
        }

        try {
            miniProgram = await automator.launch({
                cliPath,
                projectPath,
            });
        } catch (error) {
            try {
                miniProgram = await connectWithBootstrap(wsEndpoint, projectPath);
            } catch {
                const detail = error instanceof Error ? error.message : String(error);
                throw new Error(
                    `${detail}. You can manually open DevTools and set WECHAT_SERVICE_PORT or WECHAT_WS_ENDPOINT to run via connect mode.`,
                );
            }
        }
    }, E2E_TIMEOUT);

    afterAll(async () => {
        if (miniProgram) {
            await miniProgram.close();
        }
    });

    it('dragging Card N downward peeks Card N (not Card N-1)', async () => {
        const page = await miniProgram.reLaunch('/pages/index/index');
        await page.waitFor('.customer-card-stack');
        await page.waitFor('.customer-card-item-2');
        await page.waitFor(1500);

        const card2 = await page.$('.customer-card-item-2');
        const card3 = await page.$('.customer-card-item-3');

        expect(card2).not.toBeNull();
        expect(card3).not.toBeNull();
        if (!card2 || !card3) {
            throw new Error('Target cards are missing in current page.');
        }

        const card2TopBefore = await getTop(card2);
        const card3TopBefore = await getTop(card3);

        await dragDown(card2, 320);
        await page.waitFor(500);

        const card2TopAfter = await getTop(card2);
        const card3TopAfter = await getTop(card3);

        expect(Math.abs(card2TopAfter - card2TopBefore)).toBeLessThan(2);
        expect(card3TopAfter).toBeGreaterThan(card3TopBefore + 20);
    }, E2E_TIMEOUT);
});
