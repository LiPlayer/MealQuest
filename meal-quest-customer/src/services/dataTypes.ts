import { CheckoutQuote, CustomerWallet } from '@/domain/smartCheckout';
import { Voucher } from '@/components/cards/P03_TicketCard';
import { ActivityItem } from '@/components/ActivityArea';

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
