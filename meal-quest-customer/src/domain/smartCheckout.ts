import { Voucher } from '@/components/cards/P03_TicketCard';

export interface CustomerWallet {
    principal: number;
    bonus: number;
    silver: number;
}

export interface CheckoutQuote {
    orderAmount: number;
    selectedVoucher: Voucher | null;
    deduction: {
        voucher: number;
        bonus: number;
        principal: number;
        silver: number;
        external: number;
    };
    payable: number;
    remainingWallet: CustomerWallet;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const sortVouchers = (vouchers: Voucher[], now: Date) => {
    return [...vouchers]
        .filter(v => {
            const expired = v.expiresAt ? new Date(v.expiresAt).getTime() <= now.getTime() : false;
            return v.status === 'ACTIVE' && !expired;
        })
        .sort((a, b) => {
            const aExpiry = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
            const bExpiry = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
            if (aExpiry !== bExpiry) {
                return aExpiry - bExpiry;
            }
            return b.value - a.value;
        });
};

export const buildSmartCheckoutQuote = (
    orderAmount: number,
    wallet: CustomerWallet,
    vouchers: Voucher[],
    now = new Date()
): CheckoutQuote => {
    if (!Number.isFinite(orderAmount) || orderAmount <= 0) {
        throw new Error('orderAmount must be positive');
    }

    const orderedVouchers = sortVouchers(vouchers, now).filter(v => orderAmount >= (v.minSpend ?? 0));
    const selectedVoucher = orderedVouchers[0] ?? null;
    const voucherDeduction = selectedVoucher ? Math.min(orderAmount, selectedVoucher.value) : 0;

    let remain = roundMoney(orderAmount - voucherDeduction);

    const bonus = Math.min(remain, wallet.bonus);
    remain = roundMoney(remain - bonus);

    const principal = Math.min(remain, wallet.principal);
    remain = roundMoney(remain - principal);

    const silver = Math.min(remain, wallet.silver);
    remain = roundMoney(remain - silver);

    return {
        orderAmount: roundMoney(orderAmount),
        selectedVoucher,
        deduction: {
            voucher: roundMoney(voucherDeduction),
            bonus: roundMoney(bonus),
            principal: roundMoney(principal),
            silver: roundMoney(silver),
            external: roundMoney(Math.max(remain, 0))
        },
        payable: roundMoney(Math.max(remain, 0)),
        remainingWallet: {
            principal: roundMoney(wallet.principal - principal),
            bonus: roundMoney(wallet.bonus - bonus),
            silver: roundMoney(wallet.silver - silver)
        }
    };
};
