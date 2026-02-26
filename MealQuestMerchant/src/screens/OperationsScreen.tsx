import React from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useMerchant } from '../context/MerchantContext';
import { SectionCard } from '../components/SectionCard';
import { Play, Pause, Archive, Users, QrCode, Clipboard } from 'lucide-react-native';

export default function OperationsScreen() {
    const {
        merchantState,
        onSetCampaignStatus,
        allianceConfig,
        allianceStores,
        customerUserId,
        setCustomerUserId,
        onToggleAllianceWalletShared,
        onSyncAllianceUser,
        qrStoreId,
        setQrStoreId,
        qrScene,
        setQrScene,
        qrPayload,
        onGenerateMerchantQr,
        onCopyEventDetail,
    } = useMerchant();

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <SectionCard title="活动管理">
                {merchantState.activeCampaigns.length === 0 ? (
                    <Text style={styles.mutedText}>暂无已生效活动</Text>
                ) : (
                    merchantState.activeCampaigns.map(item => {
                        const status = item.status || 'ACTIVE';
                        return (
                            <View key={`campaign-${item.id}`} style={styles.campaignRow}>
                                <View style={styles.campaignInfo}>
                                    <Text style={styles.campaignName}>{item.name}</Text>
                                    <View style={[styles.statusTag, status === 'ACTIVE' ? styles.statusTagActive : styles.statusTagPaused]}>
                                        <Text style={styles.statusTagText}>{status === 'ACTIVE' ? '投放中' : '已暂停'}</Text>
                                    </View>
                                </View>

                                <View style={styles.campaignActions}>
                                    <Pressable
                                        testID={`campaign-toggle-${item.id}`}
                                        style={styles.circleBtn}
                                        onPress={() =>
                                            onSetCampaignStatus(
                                                item.id,
                                                status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
                                            )
                                        }>
                                        {status === 'ACTIVE' ? <Pause size={16} color="#64748b" /> : <Play size={16} color="#059669" />}
                                    </Pressable>
                                    <Pressable
                                        testID={`campaign-archive-${item.id}`}
                                        style={styles.circleBtn}
                                        onPress={() => onSetCampaignStatus(item.id, 'ARCHIVED')}>
                                        <Archive size={16} color="#94a3b8" />
                                    </Pressable>
                                </View>
                            </View>
                        );
                    })
                )}
            </SectionCard>

            <SectionCard title="连锁联盟">
                {!allianceConfig ? (
                    <Text style={styles.mutedText}>未加入或正在加载联盟配置...</Text>
                ) : (
                    <View style={styles.allianceView}>
                        <View style={styles.allianceHeader}>
                            <Users size={18} color="#2563eb" />
                            <Text style={styles.allianceTitle}>集群：{allianceConfig.clusterId || '未命名'}</Text>
                        </View>

                        <View style={styles.allianceStores}>
                            <Text style={styles.storeListLabel}>参与门店：</Text>
                            <Text style={styles.storeListText}>
                                {allianceStores.map(item => item.name).join(' · ')}
                            </Text>
                        </View>

                        <View style={styles.toggleRow}>
                            <View>
                                <Text style={styles.toggleLabel}>共享钱包状态</Text>
                                <Text style={styles.toggleDesc}>{allianceConfig.walletShared ? '已开启跨店余额互通' : '仅限本店消费'}</Text>
                            </View>
                            <Pressable
                                testID="alliance-wallet-toggle"
                                style={[styles.switchBtn, allianceConfig.walletShared ? styles.switchBtnOn : styles.switchBtnOff]}
                                onPress={onToggleAllianceWalletShared}>
                                <Text style={styles.switchBtnText}>{allianceConfig.walletShared ? '已开启' : '去开启'}</Text>
                            </Pressable>
                        </View>

                        <View style={styles.syncSection}>
                            <Text style={styles.inputLabel}>跨店用户同步</Text>
                            <View style={styles.inputRow}>
                                <TextInput
                                    testID="alliance-user-id-input"
                                    value={customerUserId}
                                    onChangeText={setCustomerUserId}
                                    placeholder="输入顾客 ID"
                                    style={styles.compactInput}
                                />
                                <Pressable
                                    testID="alliance-sync-user"
                                    style={styles.inlineActionBtn}
                                    onPress={onSyncAllianceUser}>
                                    <Text style={styles.inlineActionBtnText}>同步</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                )}
            </SectionCard>

            <SectionCard title="商户付款码">
                <View style={styles.qrHeader}>
                    <QrCode size={18} color="#64748b" />
                    <Text style={styles.qrSubtitle}>生成专属聚合支付二维码，支持微信/支付宝扫码即付。</Text>
                </View>

                <TextInput
                    testID="merchant-qr-store-id-input"
                    value={qrStoreId}
                    onChangeText={setQrStoreId}
                    placeholder="门店 ID (m_xxx)"
                    style={styles.textInput}
                />
                <TextInput
                    testID="merchant-qr-scene-input"
                    value={qrScene}
                    onChangeText={setQrScene}
                    placeholder="场景 (如：A1桌)"
                    style={styles.textInput}
                />

                <View style={styles.buttonRow}>
                    <Pressable
                        testID="merchant-qr-generate"
                        style={styles.primaryButton}
                        onPress={onGenerateMerchantQr}>
                        <Text style={styles.primaryButtonText}>一键生成二维码</Text>
                    </Pressable>
                    {qrPayload ? (
                        <Pressable
                            testID="merchant-qr-copy"
                            style={styles.secondaryButton}
                            onPress={() => onCopyEventDetail(qrPayload)}>
                            <Clipboard size={16} color="#334155" />
                            <Text style={styles.secondaryButtonText}>复制链接</Text>
                        </Pressable>
                    ) : null}
                </View>

                {qrPayload ? (
                    <View style={styles.qrDisplay}>
                        <View style={styles.qrFrame}>
                            <QRCode
                                testID="merchant-qr-native"
                                value={qrPayload}
                                size={180}
                                backgroundColor="#ffffff"
                                color="#0f172a"
                            />
                        </View>
                        <Text style={styles.qrPayload} numberOfLines={2}>{qrPayload}</Text>
                    </View>
                ) : null}
            </SectionCard>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 34,
        gap: 16,
    },
    campaignRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        paddingBottom: 10,
        marginBottom: 4,
    },
    campaignInfo: {
        flex: 1,
        gap: 6,
    },
    campaignName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1e293b',
    },
    statusTag: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    statusTagActive: {
        backgroundColor: '#ccfbf1',
    },
    statusTagPaused: {
        backgroundColor: '#f1f5f9',
    },
    statusTagText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#115e59',
    },
    campaignActions: {
        flexDirection: 'row',
        gap: 10,
    },
    circleBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    allianceView: {
        gap: 14,
    },
    allianceHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    allianceTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#0f172a',
    },
    allianceStores: {
        backgroundColor: '#f8fbff',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#dbeafe',
    },
    storeListLabel: {
        fontSize: 11,
        color: '#64748b',
        fontWeight: '600',
        marginBottom: 2,
    },
    storeListText: {
        fontSize: 13,
        color: '#1e293b',
        lineHeight: 18,
    },
    toggleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 4,
    },
    toggleLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1e293b',
    },
    toggleDesc: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2,
    },
    switchBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
    },
    switchBtnOn: {
        backgroundColor: '#eff6ff',
        borderColor: '#3b82f6',
    },
    switchBtnOff: {
        backgroundColor: '#ffffff',
        borderColor: '#cbd5e1',
    },
    switchBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#3b82f6',
    },
    syncSection: {
        gap: 8,
        marginTop: 4,
    },
    inputLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748b',
    },
    inputRow: {
        flexDirection: 'row',
        gap: 8,
    },
    compactInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        backgroundColor: '#f8fafc',
    },
    inlineActionBtn: {
        backgroundColor: '#2563eb',
        borderRadius: 10,
        paddingHorizontal: 16,
        justifyContent: 'center',
    },
    inlineActionBtnText: {
        color: '#ffffff',
        fontWeight: '700',
        fontSize: 13,
    },
    qrHeader: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    qrSubtitle: {
        flex: 1,
        fontSize: 13,
        color: '#64748b',
        lineHeight: 18,
    },
    textInput: {
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 14,
        backgroundColor: '#f8fafc',
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 10,
    },
    primaryButton: {
        backgroundColor: '#0f172a',
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        justifyContent: 'center',
    },
    primaryButtonText: {
        color: '#ffffff',
        fontWeight: '700',
        fontSize: 13,
    },
    secondaryButton: {
        flexDirection: 'row',
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        gap: 8,
        alignItems: 'center',
    },
    secondaryButtonText: {
        color: '#334155',
        fontWeight: '700',
        fontSize: 13,
    },
    qrDisplay: {
        alignItems: 'center',
        gap: 12,
        marginVertical: 10,
    },
    qrFrame: {
        padding: 16,
        backgroundColor: '#ffffff',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 3,
    },
    qrPayload: {
        fontSize: 11,
        color: '#94a3b8',
        fontFamily: 'monospace',
        textAlign: 'center',
    },
    mutedText: {
        fontSize: 13,
        color: '#64748b',
        textAlign: 'center',
        paddingVertical: 10,
    }
});
