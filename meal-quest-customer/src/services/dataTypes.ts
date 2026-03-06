import { CustomerWallet } from '@/domain/smartCheckout';

export interface StoreTheme {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
}

export interface StoreData {
  id: string;
  name: string;
  branchName: string;
  slogan: string;
  logo: string;
  theme: StoreTheme;
  isOpen: boolean;
}

export interface Voucher {
  id: string;
  name: string;
  value: number;
  minSpend: number;
  status: string;
  expiresAt?: string;
  icon?: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  desc: string;
  explanation?: string;
  reasonCode?: string;
  stage?: string;
  outcome?: 'HIT' | 'BLOCKED' | 'INFO';
  icon: string;
  color: string;
  textColor: string;
  tag: string;
}

export interface TouchpointItem {
  activityId: string;
  stage: string;
  outcome: 'HIT' | 'BLOCKED' | 'INFO';
  explanation: string;
  reasonCode?: string;
}

export interface TouchpointContract {
  objectiveLabel: string;
  behaviorSignals: string[];
  recentTouchpoints: TouchpointItem[];
}

export interface GameLinkageSummary {
  collectibleCount: number;
  unlockedGameCount: number;
  touchpointCount: number;
}

export interface GameTouchpointItem {
  touchpointId: string;
  title: string;
  desc: string;
  stage?: string;
  outcome?: 'HIT' | 'BLOCKED' | 'INFO';
  rewardLabel?: string;
  updatedAt?: string;
}

export interface HomeSnapshot {
  store: StoreData;
  wallet: CustomerWallet;
  fragments: {
    common: number;
    rare: number;
  };
  vouchers: Voucher[];
  activities: ActivityItem[];
  touchpointContract?: TouchpointContract;
  gameSummary?: GameLinkageSummary;
  gameTouchpoints?: GameTouchpointItem[];
  lastPaymentId?: string;
}

export interface PaymentLedgerItem {
  txnId: string;
  merchantId: string;
  userId: string;
  type: 'PAYMENT' | 'REFUND' | 'PAYMENT_PENDING';
  amount: number;
  timestamp: string;
  paymentTxnId?: string;
}

export interface InvoiceItem {
  invoiceNo: string;
  merchantId: string;
  userId: string;
  paymentTxnId: string;
  amount: number;
  status: string;
  issuedAt: string;
  title: string;
}

export type CustomerNotificationStatus = 'UNREAD' | 'READ';
export type CustomerNotificationCategory =
  | 'APPROVAL_TODO'
  | 'EXECUTION_RESULT'
  | 'FEEDBACK_TICKET'
  | 'GENERAL'
  | string;

export interface CustomerNotificationRelated {
  decisionId?: string;
  event?: string;
  outcome?: 'HIT' | 'BLOCKED' | 'NO_POLICY' | 'INFO';
  reasonCodes?: string[];
}

export interface CustomerNotificationItem {
  notificationId: string;
  merchantId: string;
  recipientType: 'CUSTOMER_USER' | 'MERCHANT_STAFF';
  recipientId: string;
  category: CustomerNotificationCategory;
  title: string;
  body: string;
  status: CustomerNotificationStatus;
  createdAt: string;
  readAt: string | null;
  related?: CustomerNotificationRelated;
}

export interface CustomerNotificationSummary {
  totalUnread: number;
  byCategory: {
    category: CustomerNotificationCategory;
    unreadCount: number;
  }[];
}

export type CustomerNotificationPreferenceCategory =
  | 'APPROVAL_TODO'
  | 'EXECUTION_RESULT'
  | 'FEEDBACK_TICKET'
  | 'GENERAL';

export interface CustomerNotificationPreferenceFrequencyCap {
  windowSec: number;
  maxDeliveries: number;
}

export interface CustomerNotificationPreference {
  version: string;
  merchantId: string;
  recipientType: 'CUSTOMER_USER' | 'MERCHANT_STAFF';
  recipientId: string;
  categories: Record<CustomerNotificationPreferenceCategory, boolean>;
  frequencyCaps: Partial<
    Record<CustomerNotificationPreferenceCategory, CustomerNotificationPreferenceFrequencyCap>
  >;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface CustomerStabilityDriver {
  code: 'TECHNICAL_GATE' | 'COMPLIANCE_GATE' | string;
  label: string;
  status: 'PASS' | 'FAIL' | 'REVIEW' | string;
}

export interface CustomerStabilityReason {
  code: string;
  message: string;
}

export interface CustomerStabilitySnapshot {
  version: string;
  merchantId: string;
  objective: string;
  evaluatedAt: string;
  windowDays: number;
  stabilityLevel: 'STABLE' | 'WATCH' | 'UNSTABLE' | string;
  stabilityLabel: string;
  summary: string;
  drivers: CustomerStabilityDriver[];
  reasons: CustomerStabilityReason[];
}

export type FeedbackTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type FeedbackTicketCategory = 'PAYMENT' | 'BENEFIT' | 'PRIVACY' | 'ACCOUNT' | 'OTHER';

export interface FeedbackTicketTimelineEvent {
  eventId: string;
  fromStatus: FeedbackTicketStatus | null;
  toStatus: FeedbackTicketStatus;
  note: string;
  actorRole: string;
  actorId: string;
  createdAt: string;
}

export interface FeedbackTicket {
  ticketId: string;
  merchantId: string;
  userId: string;
  category: FeedbackTicketCategory;
  title: string;
  description: string;
  contact: string;
  status: FeedbackTicketStatus;
  createdAt: string;
  updatedAt: string;
  latestEvent: FeedbackTicketTimelineEvent | null;
  timeline?: FeedbackTicketTimelineEvent[];
}

export interface FeedbackTicketListResult {
  items: FeedbackTicket[];
  hasMore: boolean;
  nextCursor: string | null;
  status: 'ALL' | FeedbackTicketStatus;
  category: 'ALL' | FeedbackTicketCategory;
}
