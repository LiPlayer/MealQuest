import { View, Text, Button } from '@tarojs/components';
import './CustomerBottomDock.scss';
import { CheckoutQuote } from '@/domain/smartCheckout';

interface CustomerBottomDockProps {
    quote?: CheckoutQuote | null;
    onPay?: () => void;
    disabled?: boolean;
}

export default function CustomerBottomDock({ quote, onPay, disabled = false }: CustomerBottomDockProps) {
    const payText = quote ? `支付 ¥${quote.payable.toFixed(2)}` : '双模收银';

    return (
        <View className='bottom-dock'>
            {/* Crystal Dock Container */}
            <View className='bottom-dock__container'>
                {/* Payment Main Button */}
                <Button className='bottom-dock__pay-btn' onClick={onPay} disabled={disabled}>
                    <Text className='bottom-dock__pay-emoji'>🤳</Text>
                    <Text className='bottom-dock__pay-text'>{payText}</Text>
                </Button>

                {/* Secondary Action */}
                <View className='bottom-dock__secondary-btn'>
                    <Text className='bottom-dock__secondary-emoji'>📱</Text>
                </View>
            </View>
            {quote && (
                <View style={{ marginTop: '12rpx', textAlign: 'center' }}>
                    <Text style={{ fontSize: '22rpx', color: '#475569' }}>
                        券抵扣 ¥{quote.deduction.voucher.toFixed(2)} / 余额抵扣 ¥{(quote.deduction.bonus + quote.deduction.principal).toFixed(2)}
                    </Text>
                </View>
            )}
        </View>
    );
}
