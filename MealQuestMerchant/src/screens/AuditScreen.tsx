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
import { Activity, History, Filter, ChevronDown, ChevronUp, Copy, AlertCircle } from 'lucide-react-native';

const AUDIT_ACTION_OPTIONS = [
    { value: 'ALL', label: '全部动作' },
    { value: 'PAYMENT_VERIFY', label: '支付' },
    { value: 'PAYMENT_REFUND', label: '退款' },
    { value: 'STRATEGY_PROPOSAL', label: '策略' },
    { value: 'KILL_SWITCH', label: '熔断' },
] as const;

const AUDIT_STATUS_OPTIONS = [
    { value: 'ALL', label: '全部状态' },
    { value: 'SUCCESS', label: '成功' },
    { value: 'FAILED', label: '失败' },
] as const;

export default function AuditScreen() {
    const {
        visibleRealtimeEvents,
        setExpandedEventId,
        expandedEventId,
        showOnlyAnomaly,
        setShowOnlyAnomaly,
        auditLogs,
        auditLoading,
        auditHasMore,
        auditCursor,
        refreshAuditLogs,
        auditActionFilter,
        setAuditActionFilter,
        auditStatusFilter,
        setAuditStatusFilter,
        expandedAuditId,
        setExpandedAuditId,
        onCopyEventDetail,
    } = useMerchant();

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <SectionCard title="实时监控流">
                <View style={styles.filterRow}>
                    <Pressable
                        style={[styles.miniTab, !showOnlyAnomaly && styles.miniTabActive]}
                        onPress={() => setShowOnlyAnomaly(false)}>
                        <Text style={[styles.miniTabText, !showOnlyAnomaly && styles.miniTabTextActive]}>全部事件</Text>
                    </Pressable>
                    <Pressable
                        style={[styles.miniTab, showOnlyAnomaly && styles.miniTabActive]}
                        onPress={() => setShowOnlyAnomaly(true)}>
                        <Text style={[styles.miniTabText, showOnlyAnomaly && styles.miniTabTextActive]}>仅异常监控</Text>
                    </Pressable>
                </View>

                <View style={styles.listContainer}>
                    {visibleRealtimeEvents.length === 0 ? (
                        <Text style={styles.emptyText}>等待事件上报...</Text>
                    ) : (
                        visibleRealtimeEvents.map(item => (
                            <Pressable
                                key={item.id}
                                style={[styles.logItem, item.id === expandedEventId && styles.logItemExpanded]}
                                onPress={() => setExpandedEventId(expandedEventId === item.id ? null : item.id)}>
                                <View style={styles.logHeader}>
                                    <View style={[styles.severityDot, { backgroundColor: item.severity === 'error' ? '#ef4444' : item.severity === 'warn' ? '#f59e0b' : '#10b981' }]} />
                                    <Text style={styles.logTitle}>{item.label}</Text>
                                    <Text style={styles.logSummary} numberOfLines={1}>{item.summary}</Text>
                                    {item.id === expandedEventId ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
                                </View>
                                {expandedEventId === item.id && (
                                    <View style={styles.detailWrap}>
                                        <Text selectable style={styles.detailText}>{item.detail}</Text>
                                        <Pressable style={styles.copyBtn} onPress={() => onCopyEventDetail(item.detail)}>
                                            <Copy size={12} color="#64748b" />
                                            <Text style={styles.copyBtnText}>复制 Payload</Text>
                                        </Pressable>
                                    </View>
                                )}
                            </Pressable>
                        ))
                    )}
                </View>
            </SectionCard>

            <SectionCard title="审计日志历史">
                <View style={styles.auditFilters}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                        <View style={styles.filterGroup}>
                            {AUDIT_ACTION_OPTIONS.map(opt => (
                                <Pressable
                                    key={opt.value}
                                    style={[styles.filterChip, auditActionFilter === opt.value && styles.filterChipActive]}
                                    onPress={() => setAuditActionFilter(opt.value as any)}>
                                    <Text style={[styles.filterChipText, auditActionFilter === opt.value && styles.filterChipTextActive]}>{opt.label}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </ScrollView>
                    <View style={styles.filterGroup}>
                        {AUDIT_STATUS_OPTIONS.map(opt => (
                            <Pressable
                                key={opt.value}
                                style={[styles.filterChip, auditStatusFilter === opt.value && styles.filterChipActive]}
                                onPress={() => setAuditStatusFilter(opt.value as any)}>
                                <Text style={[styles.filterChipText, auditStatusFilter === opt.value && styles.filterChipTextActive]}>{opt.label}</Text>
                            </Pressable>
                        ))}
                    </View>
                </View>

                <View style={styles.listContainer}>
                    {auditLogs.length === 0 ? (
                        <Text style={styles.emptyText}>{auditLoading ? '加载中...' : '无匹配记录'}</Text>
                    ) : (
                        <>
                            {auditLogs.map(item => (
                                <Pressable
                                    key={item.id}
                                    style={[styles.logItem, item.id === expandedAuditId && styles.logItemExpanded]}
                                    onPress={() => setExpandedAuditId(expandedAuditId === item.id ? null : item.id)}>
                                    <View style={styles.logHeader}>
                                        <AlertCircle size={14} color={item.severity === 'error' ? '#ef4444' : '#64748b'} />
                                        <Text style={styles.logTitle}>{item.title}</Text>
                                        <Text style={styles.logSummary} numberOfLines={1}>{item.summary}</Text>
                                    </View>
                                    {expandedAuditId === item.id && (
                                        <View style={styles.detailWrap}>
                                            <Text selectable style={styles.detailText}>{item.detail}</Text>
                                        </View>
                                    )}
                                </Pressable>
                            ))}
                            {auditHasMore && (
                                <Pressable
                                    style={styles.loadMore}
                                    disabled={auditLoading}
                                    onPress={() => refreshAuditLogs({ append: true, cursor: auditCursor })}>
                                    <Text style={styles.loadMoreText}>{auditLoading ? '正在加载...' : '加载更多记录'}</Text>
                                </Pressable>
                            )}
                        </>
                    )}
                </View>
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
    filterRow: {
        flexDirection: 'row',
        backgroundColor: '#f1f5f9',
        borderRadius: 10,
        padding: 3,
        marginBottom: 8,
    },
    miniTab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 8,
    },
    miniTabActive: {
        backgroundColor: '#ffffff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    miniTabText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748b',
    },
    miniTabTextActive: {
        color: '#0f172a',
    },
    listContainer: {
        gap: 8,
    },
    logItem: {
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        overflow: 'hidden',
    },
    logItemExpanded: {
        borderColor: '#cbd5e1',
        backgroundColor: '#ffffff',
    },
    logHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        gap: 10,
    },
    severityDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    logTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#1e293b',
        width: 60,
    },
    logSummary: {
        flex: 1,
        fontSize: 13,
        color: '#64748b',
    },
    detailWrap: {
        padding: 12,
        paddingTop: 0,
        backgroundColor: '#f8fbff',
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
        gap: 10,
    },
    detailText: {
        fontSize: 11,
        fontFamily: 'monospace',
        color: '#334155',
        lineHeight: 16,
    },
    copyBtn: {
        flexDirection: 'row',
        alignSelf: 'flex-start',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        gap: 4,
    },
    copyBtnText: {
        fontSize: 11,
        color: '#64748b',
        fontWeight: '700',
    },
    auditFilters: {
        gap: 10,
        marginBottom: 4,
    },
    filterScroll: {
        paddingBottom: 4,
    },
    filterGroup: {
        flexDirection: 'row',
        gap: 6,
    },
    filterChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    filterChipActive: {
        backgroundColor: '#eff6ff',
        borderColor: '#3b82f6',
    },
    filterChipText: {
        fontSize: 11,
        color: '#64748b',
        fontWeight: '700',
    },
    filterChipTextActive: {
        color: '#2563eb',
    },
    emptyText: {
        textAlign: 'center',
        paddingVertical: 20,
        fontSize: 13,
        color: '#94a3b8',
        fontStyle: 'italic',
    },
    loadMore: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    loadMoreText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#2563eb',
    }
});
