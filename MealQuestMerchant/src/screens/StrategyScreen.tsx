import React from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useMerchant } from '../context/MerchantContext';
import { SectionCard } from '../components/SectionCard';
import { MessageSquare, Send, Flame, Check, X, Info } from 'lucide-react-native';

export default function StrategyScreen() {
    const {
        strategyChatMessages,
        strategyChatPendingReview,
        aiIntentDraft,
        setAiIntentDraft,
        aiIntentSubmitting,
        onCreateIntentProposal,
        onReviewPendingStrategy,
        onCreateFireSale,
        pendingReviewCount,
        currentReviewIndex,
        totalReviewCount,
    } = useMerchant();

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <SectionCard title="AI 经营助手">
                <View style={styles.chatHeader}>
                    <MessageSquare size={18} color="#64748b" />
                    <Text style={styles.chatSubtitle}>
                        描述您的经营目标（如：提升明天午市客流），AI 将为您生成营销策略。
                    </Text>
                </View>

                <View style={styles.messageList}>
                    {strategyChatMessages.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Info size={32} color="#cbd5e1" />
                            <Text style={styles.emptyText}>尚未开始对话。试着告诉 AI 您的目标和预算。</Text>
                        </View>
                    ) : (
                        strategyChatMessages.slice(-10).map(item => (
                            <View
                                key={item.messageId}
                                style={[
                                    styles.messageBubble,
                                    item.role === 'USER' ? styles.userBubble : styles.botBubble
                                ]}
                            >
                                <Text style={styles.roleLabel}>{item.role === 'USER' ? '您' : 'AI 助手'}</Text>
                                <Text style={styles.messageText}>{item.text}</Text>
                            </View>
                        ))
                    )}
                </View>

                <View style={styles.inputArea}>
                    <TextInput
                        testID="ai-intent-input"
                        value={aiIntentDraft}
                        onChangeText={setAiIntentDraft}
                        placeholder="例如：明天午市拉新20桌，预算控制在200元以内。"
                        style={styles.textInput}
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                    />
                    <Pressable
                        testID="ai-intent-submit"
                        style={[styles.sendButton, (aiIntentSubmitting || pendingReviewCount > 0) && styles.disabledButton]}
                        onPress={onCreateIntentProposal}
                        disabled={aiIntentSubmitting || pendingReviewCount > 0}
                    >
                        <Send size={18} color="#ffffff" />
                        <Text style={styles.sendButtonText}>
                            {aiIntentSubmitting ? '发送中...' : '提交需求'}
                        </Text>
                    </Pressable>
                </View>
            </SectionCard>

            {strategyChatPendingReview && (
                <SectionCard title="待审核提案">
                    <View style={styles.proposalCard}>
                        <View style={styles.proposalBadge}>
                            <Text style={styles.proposalBadgeText}>PROPOSAL</Text>
                        </View>
                        <Text style={styles.proposalTitle}>{strategyChatPendingReview.title}</Text>
                        <View style={styles.proposalMeta}>
                            <Text style={styles.metaLabel}>序列: </Text>
                            <Text style={styles.metaValue}>{currentReviewIndex} / {totalReviewCount}</Text>
                        </View>

                        <View style={styles.actionRow}>
                            <Pressable
                                testID="ai-review-approve"
                                style={[styles.opButton, styles.approveBtn]}
                                onPress={() => onReviewPendingStrategy('APPROVE')}
                            >
                                <Check size={18} color="#ffffff" />
                                <Text style={styles.opButtonText}>确认执行</Text>
                            </Pressable>
                            <Pressable
                                testID="ai-review-reject"
                                style={[styles.opButton, styles.rejectBtn]}
                                onPress={() => onReviewPendingStrategy('REJECT')}
                            >
                                <X size={18} color="#ffffff" />
                                <Text style={styles.opButtonText}>拒绝</Text>
                            </Pressable>
                        </View>
                    </View>
                </SectionCard>
            )}

            <SectionCard title="快捷工具">
                <Pressable
                    style={styles.fireSaleButton}
                    onPress={onCreateFireSale}
                >
                    <View style={styles.fireIconCircle}>
                        <Flame size={20} color="#ffffff" />
                    </View>
                    <View>
                        <Text style={styles.fireTitle}>一键开启急售</Text>
                        <Text style={styles.fireDesc}>针对积压库存开启暴力掉落模式</Text>
                    </View>
                </Pressable>
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
    chatHeader: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 12,
        alignItems: 'flex-start',
    },
    chatSubtitle: {
        flex: 1,
        fontSize: 13,
        color: '#64748b',
        lineHeight: 18,
    },
    messageList: {
        gap: 12,
        marginBottom: 16,
        minHeight: 120,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 30,
        gap: 10,
    },
    emptyText: {
        fontSize: 13,
        color: '#94a3b8',
        textAlign: 'center',
    },
    messageBubble: {
        padding: 12,
        borderRadius: 16,
        maxWidth: '85%',
    },
    userBubble: {
        alignSelf: 'flex-end',
        backgroundColor: '#eff6ff',
        borderBottomRightRadius: 4,
    },
    botBubble: {
        alignSelf: 'flex-start',
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderBottomLeftRadius: 4,
    },
    roleLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: '#94a3b8',
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    messageText: {
        fontSize: 14,
        color: '#1e293b',
        lineHeight: 20,
    },
    inputArea: {
        gap: 10,
    },
    textInput: {
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: '#f8fafc',
        color: '#0f172a',
        fontSize: 14,
        minHeight: 80,
    },
    sendButton: {
        flexDirection: 'row',
        backgroundColor: '#0f766e',
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    sendButtonText: {
        color: '#ffffff',
        fontWeight: '700',
        fontSize: 14,
    },
    disabledButton: {
        backgroundColor: '#cbd5e1',
    },
    proposalCard: {
        backgroundColor: '#ffffff',
        padding: 2,
        gap: 12,
    },
    proposalBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#fef3c7',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    proposalBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#92400e',
    },
    proposalTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0f172a',
    },
    proposalMeta: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    metaLabel: {
        fontSize: 13,
        color: '#64748b',
    },
    metaValue: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1e293b',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 4,
    },
    opButton: {
        flex: 1,
        flexDirection: 'row',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    approveBtn: {
        backgroundColor: '#059669',
    },
    rejectBtn: {
        backgroundColor: '#ef4444',
    },
    opButtonText: {
        color: '#ffffff',
        fontWeight: '700',
        fontSize: 13,
    },
    fireSaleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 16,
        padding: 14,
        gap: 14,
    },
    fireIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#ef4444',
        alignItems: 'center',
        justifyContent: 'center',
    },
    fireTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0f172a',
    },
    fireDesc: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2,
    }
});
