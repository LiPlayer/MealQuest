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

export interface CustomerNotificationItem {
  notificationId: string;
  merchantId: string;
  recipientType: 'CUSTOMER_USER' | 'MERCHANT_STAFF';
  recipientId: string;
  category: string;
  title: string;
  body: string;
  status: CustomerNotificationStatus;
  createdAt: string;
  readAt: string | null;
}

export interface CustomerNotificationSummary {
  totalUnread: number;
  byCategory: {
    category: string;
    unreadCount: number;
  }[];
}
