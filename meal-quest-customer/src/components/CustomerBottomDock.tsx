import {View, Text, Button} from '@tarojs/components';

import {CheckoutQuote} from '@/domain/smartCheckout';

import './CustomerBottomDock.scss';

interface CustomerBottomDockProps {
    quote?: CheckoutQuote | null;
    onPay?: () => void;
    disabled?: boolean;
}

export default function CustomerBottomDock({
    quote,
    onPay,
    disabled = false,
}: CustomerBottomDockProps) {
    const payText = quote ? `支付 ¥${quote.payable.toFixed(2)}` : '双模收银';

    return (
        <View className="bottom-dock">
            <View className="bottom-dock__container">
                <View className="bottom-dock__quote">
                    <Text className="bottom-dock__quote-title">智能抵扣</Text>
                    {quote ? (
                        <Text className="bottom-dock__quote-text">
                            券 ¥{quote.deduction.voucher.toFixed(2)} · 余额 ¥
                            {(quote.deduction.bonus + quote.deduction.principal).toFixed(2)}
                        </Text>
                    ) : (
                        <Text className="bottom-dock__quote-text">等待账单计算</Text>
                    )}
                </View>

                <Button className="bottom-dock__pay-btn" onClick={onPay} disabled={disabled}>
                    <Text className="bottom-dock__pay-emoji">🤳</Text>
                    <Text className="bottom-dock__pay-text">{payText}</Text>
                </Button>

                <View className="bottom-dock__secondary-btn">
                    <Text className="bottom-dock__secondary-emoji">🪪</Text>
                </View>
            </View>
        </View>
    );
}

