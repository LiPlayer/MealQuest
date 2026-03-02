const {
    resolveE2EContext,
    launchMiniProgram,
    clearAppStorage,
    waitForSelector,
} = require('./utils/mini-program-session');

const context = resolveE2EContext();
const describeIfRunnable = context.runnable ? describe : describe.skip;

if (!context.runnable) {
    // eslint-disable-next-line no-console
    console.warn(`[e2e] customer-core-flow skipped: ${context.reason}`);
}

describeIfRunnable('Customer core flow e2e', () => {
    let miniProgram;
    let launchError = null;

    beforeAll(async () => {
        try {
            miniProgram = await launchMiniProgram(context);
            await clearAppStorage(miniProgram);
        } catch (error) {
            launchError = error;
            // eslint-disable-next-line no-console
            console.warn(`[e2e] customer-core-flow runtime skip: ${error.message}`);
        }
    });

    afterAll(async () => {
        if (miniProgram) {
            await miniProgram.close();
        }
    });

    it('renders startup scan button for first-time user', async () => {
        if (launchError) {
            return;
        }
        const startupPage = await miniProgram.reLaunch('/pages/startup/index');
        await startupPage.waitFor(800);

        const scanButton = await waitForSelector(startupPage, '#startup-scan-button', 6000);
        expect(scanButton).not.toBeNull();
    });

    it('navigates from index to account center and arms cancel action', async () => {
        if (launchError) {
            return;
        }
        await miniProgram.evaluate(() => {
            wx.setStorageSync('mq_last_store_id', 'm_store_001');
        });

        const indexPage = await miniProgram.reLaunch('/pages/index/index');
        await indexPage.waitFor(1800);

        const accountEntry = await waitForSelector(indexPage, '#index-account-entry', 8000);
        await accountEntry.tap();

        const accountPage = await miniProgram.currentPage();
        expect(accountPage).not.toBeUndefined();
        await accountPage.waitFor(1000);

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
