import React from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useMerchant } from '../context/MerchantContext';
import { SectionCard } from '../components/SectionCard';
import { Shield, ShieldAlert } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
    const {
        merchantState,
        onToggleKillSwitch,
        contractStatus,
        onReviewPendingStrategy, // Actually not needed here but kept for context if needed
    } = useMerchant();

    const activeCampaignCount = merchantState.activeCampaigns.filter(
        item => (item.status || 'ACTIVE') === 'ACTIVE',
    ).length;
    const budgetRemaining = Math.max(merchantState.budgetCap - merchantState.budgetUsed, 0);
    const budgetUsagePercent = Math.round(
        (merchantState.budgetUsed / Math.max(merchantState.budgetCap, 1)) * 100,
    );

    return (
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
            <ScrollView contentContainerStyle={styles.container}>
                <View style={styles.heroCard}>
                    <View style={styles.heroHead}>
                        <View style={styles.heroHeadTextWrap}>
                            <Text style={styles.heroKicker}>MealQuest Merchant OS</Text>
                            <Text style={styles.appTitle}>有戏掌柜驾驶舱</Text>
                            <Text style={styles.appSubtitle}>聚合收银、策略确认、商业洞察一体化</Text>
                        </View>
                        <View style={[styles.statusBadge, merchantState.killSwitchEnabled ? styles.statusBadgeWarn : styles.statusBadgeSuccess]}>
                            {merchantState.killSwitchEnabled ? <ShieldAlert size={14} color="#fef3c7" /> : <Shield size={14} color="#ccfbf1" />}
                            <Text style={styles.statusBadgeText}>
                                {merchantState.killSwitchEnabled ? '熔断中' : '运行中'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.heroStatsRow}>
                        <View style={styles.heroStatCard}>
                            <Text style={styles.heroStatLabel}>预算使用</Text>
                            <Text style={styles.heroStatValue}>{budgetUsagePercent}%</Text>
                            <Text style={styles.heroStatHint}>剩余 ¥{budgetRemaining.toFixed(2)}</Text>
                        </View>
                        <View style={styles.heroStatCard}>
                            <Text style={styles.heroStatLabel}>进行中活动</Text>
                            <Text style={styles.heroStatValue}>{activeCampaignCount}</Text>
                            <Text style={styles.heroStatHint}>
                                共 {merchantState.activeCampaigns.length} 个活动
                            </Text>
                        </View>
                    </View>
                </View>

                <SectionCard title="经营总览">
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>当前门店</Text>
                        <Text style={styles.infoValue}>{merchantState.merchantName}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>营销预算</Text>
                        <Text style={styles.infoValue}>¥{merchantState.budgetUsed.toFixed(2)} / ¥{merchantState.budgetCap.toFixed(2)}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>风控红线</Text>
                        <Text style={[styles.infoValue, merchantState.killSwitchEnabled ? { color: '#b91c1c', fontWeight: 'bold' } : { color: '#059669' }]}>
                            {merchantState.killSwitchEnabled ? '已开启熔断' : '安全运行中'}
                        </Text>
                    </View>

                    <Pressable
                        testID="kill-switch-btn"
                        style={[styles.actionButton, merchantState.killSwitchEnabled ? styles.btnOutline : styles.btnDanger]}
                        onPress={onToggleKillSwitch}>
                        <Text style={merchantState.killSwitchEnabled ? styles.btnOutlineText : styles.btnDangerText}>
                            {merchantState.killSwitchEnabled ? '关闭熔断' : '开启熔断保护'}
                        </Text>
                    </Pressable>
                </SectionCard>

                {contractStatus === 'NOT_SUBMITTED' && (
                    <SectionCard title="资质核验 (待办)">
                        <Text style={styles.mutedText}>
                            您的门店尚未完成在线经营合同签署，部分营销功能可能受限。
                        </Text>
                        <Pressable style={styles.primaryButton}>
                            <Text style={styles.primaryButtonText}>去签约</Text>
                        </Pressable>
                    </SectionCard>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 16,
        gap: 16,
    },
    heroCard: {
        backgroundColor: '#0f172a',
        borderRadius: 24,
        padding: 20,
        gap: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 8,
    },
    heroHead: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    heroHeadTextWrap: {
        flex: 1,
    },
    heroKicker: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 4,
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    appTitle: {
        fontSize: 28,
        fontWeight: '900',
        color: '#ffffff',
    },
    appSubtitle: {
        fontSize: 14,
        color: '#94a3b8',
        marginTop: 6,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 99,
        gap: 6,
        borderWidth: 1,
    },
    statusBadgeSuccess: {
        backgroundColor: 'rgba(20, 184, 166, 0.1)',
        borderColor: 'rgba(20, 184, 166, 0.4)',
    },
    statusBadgeWarn: {
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderColor: 'rgba(245, 158, 11, 0.4)',
    },
    statusBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#f8fafc',
    },
    heroStatsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    heroStatCard: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    heroStatLabel: {
        color: '#94a3b8',
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 4,
    },
    heroStatValue: {
        color: '#ffffff',
        fontSize: 24,
        fontWeight: '800',
    },
    heroStatHint: {
        color: '#64748b',
        fontSize: 12,
        marginTop: 4,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
    },
    infoLabel: {
        fontSize: 14,
        color: '#64748b',
    },
    infoValue: {
        fontSize: 14,
        color: '#1e293b',
        fontWeight: '600',
    },
    actionButton: {
        marginTop: 8,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    btnDanger: {
        backgroundColor: '#fee2e2',
        borderWidth: 1,
        borderColor: '#fecaca',
    },
    btnDangerText: {
        color: '#b91c1c',
        fontSize: 14,
        fontWeight: '700',
    },
    btnOutline: {
        borderWidth: 1,
        borderColor: '#e2e8f0',
        backgroundColor: '#ffffff',
    },
    btnOutlineText: {
        color: '#475569',
        fontSize: 14,
        fontWeight: '700',
    },
    primaryButton: {
        backgroundColor: '#2563eb',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: '#ffffff',
        fontWeight: '700',
    },
    mutedText: {
        fontSize: 13,
        color: '#64748b',
        lineHeight: 18,
        marginBottom: 8,
    },
});
