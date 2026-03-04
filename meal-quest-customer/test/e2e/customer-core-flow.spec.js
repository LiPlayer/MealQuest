const {
    resolveE2EContext,
    launchMiniProgram,
    clearAppStorage,
    waitForSelector,
} = require('./utils/mini-program-session');

const waitForPagePath = async (miniProgram, expectedPath, timeoutMs = 8000) => {
    const startedAt = Date.now();
    let lastPath = '(unknown)';

    while (Date.now() - startedAt <= timeoutMs) {
        const page = await miniProgram.currentPage();
        if (page && page.path === expectedPath) {
            return page;
        }
        if (page && page.path) {
            lastPath = page.path;
            await page.waitFor(120);
        } else {
            await new Promise((resolve) => setTimeout(resolve, 120));
        }
    }

    throw new Error(`page not reached within timeout: ${expectedPath}, current=${lastPath}`);
};

const context = resolveE2EContext();
if (!context.runnable) {
    throw new Error(`[e2e] customer-core-flow blocked: ${context.reason}`);
}

describe('Customer core flow e2e', () => {
    let miniProgram;

    beforeAll(async () => {
        miniProgram = await launchMiniProgram(context);
        await clearAppStorage(miniProgram);
    });

    afterAll(async () => {
        if (miniProgram) {
            await miniProgram.close();
        }
    });

    it('renders startup scan button for first-time user', async () => {
        const startupPage = await miniProgram.reLaunch('/pages/startup/index');
        await startupPage.waitFor(800);

        const scanButton = await waitForSelector(startupPage, '#startup-scan-button', 6000);
        expect(scanButton).not.toBeNull();
    });

    it('navigates from index to account center and arms cancel action', async () => {
        await miniProgram.evaluate(() => {
            wx.setStorageSync('mq_last_store_id', 'm_store_001');
        });

        const indexPage = await miniProgram.reLaunch('/pages/index/index');
        await indexPage.waitFor(1800);

        const accountEntry = await waitForSelector(indexPage, '#index-account-entry', 8000);
        await accountEntry.tap();

        const accountPage = await waitForPagePath(miniProgram, 'pages/account/index', 10000);
        expect(accountPage).not.toBeUndefined();
        await accountPage.waitFor(800);

        const pageTitle = await waitForSelector(accountPage, '#account-page-title', 8000);
        const ledgerTitle = await waitForSelector(accountPage, '#account-ledger-title', 8000);
        const invoiceTitle = await waitForSelector(accountPage, '#account-invoice-title', 8000);
        expect(pageTitle).not.toBeNull();
        expect(ledgerTitle).not.toBeNull();
        expect(invoiceTitle).not.toBeNull();

        const cancelButton = await waitForSelector(accountPage, '#account-cancel-button', 8000);
        await cancelButton.tap();
        await accountPage.waitFor(400);

        const armedText = await cancelButton.text();
        expect(armedText).toContain('确认注销');
    });
});
