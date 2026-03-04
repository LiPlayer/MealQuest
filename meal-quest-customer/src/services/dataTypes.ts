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
  icon: string;
  color: string;
  textColor: string;
  tag: string;
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
