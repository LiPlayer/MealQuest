import { Text, View } from '@tarojs/components';

import { CheckoutQuote } from '@/domain/smartCheckout';

import './CustomerBottomDock.scss';

interface CustomerBottomDockProps {
  quote?: CheckoutQuote | null;
  onPay?: () => void;
  disabled?: boolean;
  payButtonId?: string;
}

export default function CustomerBottomDock({
  quote,
  onPay,
  disabled = false,
  payButtonId,
}: CustomerBottomDockProps) {
  const payable = quote ? quote.payable.toFixed(2) : '0.00';
  const voucherDeduction = quote ? quote.deduction.voucher.toFixed(2) : '0.00';
  const walletDeduction = quote
    ? (quote.deduction.bonus + quote.deduction.principal).toFixed(2)
    : '0.00';

  return (
    <View className='bottom-dock'>
      <View className='bottom-dock__container'>
        <View className='bottom-dock__quote'>
          <Text className='bottom-dock__quote-title'>智能抵扣</Text>
          <Text className='bottom-dock__quote-text'>券 ¥{voucherDeduction} · 余额 ¥{walletDeduction}</Text>
          <Text className='bottom-dock__quote-payable'>待支付 ¥{payable}</Text>
        </View>

        <View
          id={payButtonId}
          className={`bottom-dock__pay-btn ${disabled ? 'bottom-dock__pay-btn--disabled' : ''}`}
          onClick={disabled ? undefined : onPay}
        >
          <Text className='bottom-dock__pay-text'>{disabled ? '支付中...' : `确认支付 ¥${payable}`}</Text>
        </View>
      </View>
    </View>
  );
}
