import { CheckoutQuote } from '@/domain/smartCheckout';
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
} from '@/services/dataTypes';
import { getServerBaseUrl } from '@/services/apiDataService/env';

import { cancelAccount, getInvoices, getPaymentLedger } from '@/services/customerApp/billingService';
import { executeCheckout, getCheckoutQuote } from '@/services/customerApp/checkoutService';
import {
  createFeedbackTicket,
  getFeedbackTicketDetail,
  getFeedbackTickets,
} from '@/services/customerApp/feedbackService';
import {
  getNotificationInbox,
  getNotificationPreferences,
  getNotificationUnreadSummary,
  markNotificationsRead,
  setNotificationPreferences,
} from '@/services/customerApp/notificationService';
import { getHomeSnapshot, isMerchantAvailable } from '@/services/customerApp/stateService';
import { getCustomerStabilitySnapshot } from '@/services/customerApp/stabilityService';

export const ApiDataService = {
  isConfigured: () => Boolean(getServerBaseUrl()),

  isMerchantAvailable: async (merchantId: string): Promise<boolean> => {
    return isMerchantAvailable(merchantId);
  },

  getHomeSnapshot: async (storeId: string, _userId = ''): Promise<HomeSnapshot> => {
    return getHomeSnapshot(storeId);
  },

  getCheckoutQuote: async (storeId: string, orderAmount: number, _userId = ''): Promise<CheckoutQuote> => {
    return getCheckoutQuote(storeId, orderAmount);
  },

  executeCheckout: async (
    storeId: string,
    orderAmount: number,
    _userId = '',
  ): Promise<{ paymentId: string; quote: CheckoutQuote; snapshot: HomeSnapshot }> => {
    return executeCheckout(storeId, orderAmount);
  },

  getPaymentLedger: async (storeId: string, _userId = '', limit = 20): Promise<PaymentLedgerItem[]> => {
    return getPaymentLedger(storeId, limit);
  },

  getInvoices: async (storeId: string, _userId = '', limit = 20): Promise<InvoiceItem[]> => {
    return getInvoices(storeId, limit);
  },

  cancelAccount: async (
    storeId: string,
    _userId = '',
  ): Promise<{ deleted: boolean; deletedAt: string; anonymizedUserId: string }> => {
    return cancelAccount(storeId);
  },

  getNotificationInbox: async (
    storeId: string,
    _userId = '',
    params: {
      status?: 'ALL' | 'UNREAD' | 'READ';
      category?: 'ALL' | 'APPROVAL_TODO' | 'EXECUTION_RESULT' | 'FEEDBACK_TICKET' | 'GENERAL';
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<{ items: CustomerNotificationItem[]; hasMore: boolean; nextCursor: string | null }> => {
    return getNotificationInbox({
      merchantId: storeId,
      status: params.status,
      category: params.category,
      limit: params.limit,
      cursor: params.cursor,
    });
  },

  getNotificationUnreadSummary: async (
    storeId: string,
    _userId = '',
  ): Promise<CustomerNotificationSummary> => {
    return getNotificationUnreadSummary(storeId);
  },

  getNotificationPreferences: async (
    storeId: string,
    _userId = '',
  ): Promise<CustomerNotificationPreference> => {
    return getNotificationPreferences({
      merchantId: storeId,
    });
  },

  setNotificationPreferences: async (
    storeId: string,
    _userId = '',
    params: {
      categories?: Partial<Record<CustomerNotificationPreferenceCategory, boolean>>;
      frequencyCaps?: Partial<
        Record<CustomerNotificationPreferenceCategory, CustomerNotificationPreferenceFrequencyCap>
      >;
    } = {},
  ): Promise<CustomerNotificationPreference> => {
    return setNotificationPreferences({
      merchantId: storeId,
      categories: params.categories,
      frequencyCaps: params.frequencyCaps,
    });
  },

  getCustomerStabilitySnapshot: async (
    storeId: string,
    _userId = '',
  ): Promise<CustomerStabilitySnapshot> => {
    return getCustomerStabilitySnapshot(storeId);
  },

  markNotificationsRead: async (
    storeId: string,
    _userId = '',
    params: { markAll?: boolean; notificationIds?: string[] } = {},
  ): Promise<{ updatedCount: number }> => {
    return markNotificationsRead({
      merchantId: storeId,
      markAll: params.markAll,
      notificationIds: params.notificationIds,
    });
  },

  createFeedbackTicket: async (
    storeId: string,
    _userId = '',
    params: {
      category: FeedbackTicketCategory;
      title: string;
      description: string;
      contact?: string;
    },
  ): Promise<FeedbackTicket> => {
    return createFeedbackTicket({
      merchantId: storeId,
      category: params.category,
      title: params.title,
      description: params.description,
      contact: params.contact,
    });
  },

  getFeedbackTickets: async (
    storeId: string,
    _userId = '',
    params: {
      status?: 'ALL' | FeedbackTicketStatus;
      category?: 'ALL' | FeedbackTicketCategory;
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<FeedbackTicketListResult> => {
    return getFeedbackTickets({
      merchantId: storeId,
      status: params.status,
      category: params.category,
      limit: params.limit,
      cursor: params.cursor,
    });
  },

  getFeedbackTicketDetail: async (
    storeId: string,
    _userId = '',
    ticketId = '',
  ): Promise<FeedbackTicket> => {
    return getFeedbackTicketDetail({
      merchantId: storeId,
      ticketId,
    });
  },
};
