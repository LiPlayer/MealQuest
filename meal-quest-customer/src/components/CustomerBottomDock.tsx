import { View, Text, Button } from '@tarojs/components'

const styles = {
    dock: {
        backgroundColor: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(24px)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'rgba(255,255,255,0.4)',
        borderRadius: '1rem',
        padding: '8px',
        display: 'flex',
        flexDirection: 'row' as const,
        alignItems: 'center',
        gap: '12px',
        boxSizing: 'border-box' as const,
    },
    secondaryBtn: {
        width: '56px',
        height: '56px',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: '9999px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'rgba(255,255,255,0.4)',
    }
}

export default function CustomerBottomDock() {
    return (
        <View className='fixed bottom-6 left-6 right-6 z-50 max-w-md mx-auto pointer-events-none'>
            {/* Crystal Dock Container */}
            <View style={styles.dock} className='shadow-xl pointer-events-auto'>

                {/* Payment Main Button */}
                <Button className='flex-1 bg-gradient-to-r from-gray-900 to-black text-white h-12 rounded-xl flex flex-row items-center justify-center gap-2 shadow-lg transition-transform m-0'>
                    <Text className='w-5 h-5 text-orange-400'>🤳</Text>
                    <Text className='font-bold tracking-wide'>双模收银</Text>
                </Button>

                {/* Secondary Action */}
                <View style={styles.secondaryBtn} className='shadow-lg transition-transform'>
                    <Text className='w-6 h-6 text-gray-700 text-center' style={{ lineHeight: '3rem' }}>📱</Text>
                </View>
            </View>
        </View>
    )
}
