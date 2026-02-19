import { View, Text, Button } from '@tarojs/components';
import './CustomerBottomDock.scss';

export default function CustomerBottomDock() {
    return (
        <View className='bottom-dock'>
            {/* Crystal Dock Container */}
            <View className='bottom-dock__container'>
                {/* Payment Main Button */}
                <Button className='bottom-dock__pay-btn'>
                    <Text className='bottom-dock__pay-emoji'>🤳</Text>
                    <Text className='bottom-dock__pay-text'>双模收银</Text>
                </Button>

                {/* Secondary Action */}
                <View className='bottom-dock__secondary-btn'>
                    <Text className='bottom-dock__secondary-emoji'>📱</Text>
                </View>
            </View>
        </View>
    );
}
