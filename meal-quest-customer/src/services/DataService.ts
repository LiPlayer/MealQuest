import { CheckoutQuote } from '@/domain/smartCheckout';
import { storage } from '@/utils/storage';

import { ApiDataService } from './ApiDataService';
import {
    FeedbackTicket,
    FeedbackTicketCategory,
    FeedbackTicketListResult,
    FeedbackTicketStatus,
    CustomerNotificationPreference,
    CustomerNotificationPreferenceCategory,
    CustomerNotificationPreferenceFrequencyCap,
    CustomerNotificationItem,
    CustomerNotificationSummary,
    CustomerStabilitySnapshot,
    HomeSnapshot,
    InvoiceItem,
    PaymentLedgerItem,
} from './dataTypes';

const ensureApiConfigured = () => {
    if (!ApiDataService.isConfigured()) {
        throw new Error('Missing TARO_APP_SERVER_URL');
    }
};

const runRemote = async <T>(
    actionName: string,
    action: () => Promise<T>,
    options: { clearSessionOnError?: boolean } = {},
): Promise<T> => {
    const clearSessionOnError = options.clearSessionOnError !== false;
    ensureApiConfigured();
    try {
        return await action();
    } catch (error) {
        if (clearSessionOnError) {
            storage.setApiToken('');
            storage.setApiTokenMerchantId('');
            storage.setCustomerUserId('');
        }
        console.warn(`[DataService] ${actionName} failed on remote.`, error);
        throw error;
    }
};

export const DataService = {
    getHomeSnapshot: async (storeId: string, userId = ''): Promise<HomeSnapshot> => {
        return runRemote('getHomeSnapshot', () => ApiDataService.getHomeSnapshot(storeId, userId));
    },

    getCheckoutQuote: async (storeId: string, orderAmount: number, userId = ''): Promise<CheckoutQuote> => {
        return runRemote(
            'getCheckoutQuote',
            () => ApiDataService.getCheckoutQuote(storeId, orderAmount, userId),
        );
    },

    executeCheckout: async (
        storeId: string,
        orderAmount: number,
        userId = ''
    ): Promise<{ paymentId: string; quote: CheckoutQuote; snapshot: HomeSnapshot }> => {
        return runRemote(
            'executeCheckout',
            () => ApiDataService.executeCheckout(storeId, orderAmount, userId),
        );
    },

    getPaymentLedger: async (
        storeId: string,
        userId = '',
        limit = 20
    ): Promise<PaymentLedgerItem[]> => {
        return runRemote(
            'getPaymentLedger',
            () => ApiDataService.getPaymentLedger(storeId, userId, limit),
        );
    },

    getInvoices: async (
        storeId: string,
        userId = '',
        limit = 20
    ): Promise<InvoiceItem[]> => {
        return runRemote(
            'getInvoices',
            () => ApiDataService.getInvoices(storeId, userId, limit),
        );
    },

    cancelAccount: async (
        storeId: string,
        userId = ''
    ): Promise<{ deleted: boolean; deletedAt: string; anonymizedUserId: string }> => {
        return runRemote(
            'cancelAccount',
            () => ApiDataService.cancelAccount(storeId, userId),
        );
    },

    getNotificationInbox: async (
        storeId: string,
        userId = '',
        params: {
            status?: 'ALL' | 'UNREAD' | 'READ';
            category?: 'ALL' | 'APPROVAL_TODO' | 'EXECUTION_RESULT' | 'FEEDBACK_TICKET' | 'GENERAL';
            limit?: number;
            cursor?: string;
        } = {}
    ): Promise<{ items: CustomerNotificationItem[]; hasMore: boolean; nextCursor: string | null }> => {
        return runRemote(
            'getNotificationInbox',
            () => ApiDataService.getNotificationInbox(storeId, userId, params),
            { clearSessionOnError: false },
        );
    },

    getNotificationUnreadSummary: async (
        storeId: string,
        userId = '',
    ): Promise<CustomerNotificationSummary> => {
        return runRemote(
            'getNotificationUnreadSummary',
            () => ApiDataService.getNotificationUnreadSummary(storeId, userId),
            { clearSessionOnError: false },
        );
    },

    getNotificationPreferences: async (
        storeId: string,
        userId = '',
    ): Promise<CustomerNotificationPreference> => {
        return runRemote(
            'getNotificationPreferences',
            () => ApiDataService.getNotificationPreferences(storeId, userId),
            { clearSessionOnError: false },
        );
    },

    setNotificationPreferences: async (
        storeId: string,
        userId = '',
        params: {
            categories?: Partial<Record<CustomerNotificationPreferenceCategory, boolean>>;
            frequencyCaps?: Partial<
                Record<CustomerNotificationPreferenceCategory, CustomerNotificationPreferenceFrequencyCap>
            >;
        } = {},
    ): Promise<CustomerNotificationPreference> => {
        return runRemote(
            'setNotificationPreferences',
            () => ApiDataService.setNotificationPreferences(storeId, userId, params),
            { clearSessionOnError: false },
        );
    },

    getCustomerStabilitySnapshot: async (
        storeId: string,
        userId = '',
    ): Promise<CustomerStabilitySnapshot> => {
        return runRemote(
            'getCustomerStabilitySnapshot',
            () => ApiDataService.getCustomerStabilitySnapshot(storeId, userId),
            { clearSessionOnError: false },
        );
    },

    markNotificationsRead: async (
        storeId: string,
        userId = '',
        params: { markAll?: boolean; notificationIds?: string[] } = {},
    ): Promise<{ updatedCount: number }> => {
        return runRemote(
            'markNotificationsRead',
            () => ApiDataService.markNotificationsRead(storeId, userId, params),
            { clearSessionOnError: false },
        );
    },

    createFeedbackTicket: async (
        storeId: string,
        userId = '',
        params: {
            category: FeedbackTicketCategory;
            title: string;
            description: string;
            contact?: string;
        },
    ): Promise<FeedbackTicket> => {
        return runRemote(
            'createFeedbackTicket',
            () => ApiDataService.createFeedbackTicket(storeId, userId, params),
            { clearSessionOnError: false },
        );
    },

    getFeedbackTickets: async (
        storeId: string,
        userId = '',
        params: {
            status?: 'ALL' | FeedbackTicketStatus;
            category?: 'ALL' | FeedbackTicketCategory;
            limit?: number;
            cursor?: string;
        } = {},
    ): Promise<FeedbackTicketListResult> => {
        return runRemote(
            'getFeedbackTickets',
            () => ApiDataService.getFeedbackTickets(storeId, userId, params),
            { clearSessionOnError: false },
        );
    },

    getFeedbackTicketDetail: async (
        storeId: string,
        userId = '',
        ticketId = '',
    ): Promise<FeedbackTicket> => {
        return runRemote(
            'getFeedbackTicketDetail',
            () => ApiDataService.getFeedbackTicketDetail(storeId, userId, ticketId),
            { clearSessionOnError: false },
        );
    },
};
