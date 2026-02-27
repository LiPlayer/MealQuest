import React, { useRef, useEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useMerchant } from '../context/MerchantContext';
import { SectionCard } from '../components/SectionCard';
import { MessageSquare, Send, Check, X, Info, AlertCircle, Loader2 } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StrategyChatMessage } from '../services/merchantApi/types';

const RichText = ({ text, style, isStreaming }: { text: string; style?: object; isStreaming?: boolean }) => {
    if (!text && !isStreaming) return null;
    if (!text && isStreaming) {
        return (
            <Text style={[style, { color: '#94a3b8' }]}>
                思考中...
            </Text>
        );
    }
    const parts = (text || '').split(/(\*\*.*?\*\*)/g);
    return (
        <Text style={style}>
            {parts.map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return (
                        <Text key={i} style={{ fontWeight: '800' }}>
                            {part.slice(2, -2)}
                        </Text>
                    );
                }
                return part;
            })}
        </Text>
    );
};

export default function StrategyScreen() {
    const {
        aiIntentDraft,
        setAiIntentDraft,
        aiIntentSubmitting,
        onCreateIntentProposal,
        onRetryMessage,
        strategyChatMessages,
        strategyChatPendingReview,
        onReviewPendingStrategy,
        totalReviewCount,
        currentReviewIndex,
        pendingReviewCount,
    } = useMerchant();

    const scrollViewRef = useRef<ScrollView>(null);

    // Auto-scroll when new messages arrive
    useEffect(() => {
        setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
    }, [strategyChatMessages]);

    // Live scroll during typewriter animation (simplified as we removed cursor and specialized typewriter if not needed)
    const lastMessageText = strategyChatMessages[strategyChatMessages.length - 1]?.text;
    useEffect(() => {
        if (strategyChatMessages[strategyChatMessages.length - 1]?.role === 'ASSISTANT') {
            scrollViewRef.current?.scrollToEnd({ animated: false });
        }
    }, [lastMessageText]);

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
            >
                {/* Header Information */}
                <View style={styles.header}>
                    <View style={styles.headerContent}>
                        <MessageSquare size={18} color="#0f766e" />
                        <View style={styles.headerText}>
                            <Text style={styles.headerTitle}>AI 经营助手</Text>
                            <Text style={styles.headerSubtitle}>
                                描述营销目标，AI 为您实时生成策略
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Chat Messages Scrolling Area */}
                <ScrollView
                    ref={scrollViewRef}
                    style={styles.chatScroll}
                    contentContainerStyle={styles.chatContent}
                    keyboardDismissMode="on-drag"
                    keyboardShouldPersistTaps="handled"
                >
                    {strategyChatMessages.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Info size={32} color="#cbd5e1" />
                            <Text style={styles.emptyText}>尚未开始对话。试着告诉 AI 您的目标。</Text>
                        </View>
                    ) : (
                        strategyChatMessages.map((item: any) => (
                            <View key={item.messageId} style={styles.messageRow}>
                                <View
                                    style={[
                                        styles.messageBubble,
                                        item.role === 'USER' ? styles.userBubble : styles.botBubble
                                    ]}
                                >
                                    <Text style={styles.roleLabel}>{item.role === 'USER' ? '您' : 'AI 助手'}</Text>
                                    <RichText
                                        text={item.text}
                                        isStreaming={item.isStreaming}
                                        style={[
                                            styles.messageText,
                                            item.role === 'USER' ? styles.userText : styles.botText
                                        ]}
                                    />
                                    {item.role === 'USER' && item.deliveryStatus === 'sending' && (
                                        <View style={styles.statusIndicator}>
                                            <Text style={styles.statusText}>发送中</Text>
                                        </View>
                                    )}
                                    {item.role === 'USER' && item.deliveryStatus === 'failed' && (
                                        <View style={styles.statusIndicator}>
                                            <AlertCircle size={12} color="#fee2e2" />
                                            <Text style={[styles.statusText, { color: '#fca5a5' }]}>发送失败</Text>
                                            <Pressable onPress={() => onRetryMessage(item.messageId)} style={styles.retryBtn}>
                                                <Text style={styles.retryText}>重试</Text>
                                            </Pressable>
                                        </View>
                                    )}
                                </View>
                            </View>
                        ))
                    )}

                    {strategyChatPendingReview && (
                        <View style={styles.proposalContainer}>
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
                        </View>
                    )}
                </ScrollView>

                {/* Input Area (Fixed at bottom) */}
                <View style={styles.inputArea}>
                    <View style={styles.inputRow}>
                        <TextInput
                            testID="ai-intent-input"
                            value={aiIntentDraft}
                            onChangeText={setAiIntentDraft}
                            placeholder="输入经营需求..."
                            style={[styles.textInput, { maxHeight: 100 }]}
                            multiline
                        />
                        <Pressable
                            testID="ai-intent-submit"
                            style={[
                                styles.sendButton,
                                (aiIntentSubmitting || pendingReviewCount > 0 || !aiIntentDraft.trim()) && styles.disabledButton
                            ]}
                            onPress={onCreateIntentProposal}
                            disabled={aiIntentSubmitting || pendingReviewCount > 0 || !aiIntentDraft.trim()}
                        >
                            <Send size={20} color="#ffffff" />
                        </Pressable>
                    </View>
                    {pendingReviewCount > 0 && (
                        <Text style={styles.inputHint}>请先处理上方的待审核提案</Text>
                    )}
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    header: {
        backgroundColor: '#ffffff',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerText: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0f172a',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#94a3b8',
        marginTop: 2,
    },
    chatScroll: {
        flex: 1,
    },
    chatContent: {
        padding: 16,
        gap: 16,
        paddingBottom: 24,
    },
    messageRow: {
        width: '100%',
    },
    messageBubble: {
        padding: 14,
        borderRadius: 20,
        maxWidth: '85%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    userBubble: {
        alignSelf: 'flex-end',
        backgroundColor: '#0f766e',
        borderBottomRightRadius: 4,
    },
    botBubble: {
        alignSelf: 'flex-start',
        backgroundColor: '#ffffff',
        borderBottomLeftRadius: 4,
    },
    roleLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#94a3b8',
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    messageText: {
        fontSize: 15,
        lineHeight: 22,
    },
    userText: {
        color: '#ffffff',
        fontWeight: '500',
    },
    botText: {
        color: '#1e293b',
    },
    statusIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 4,
    },
    statusText: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.7)',
        fontWeight: '600',
    },
    retryBtn: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 4,
    },
    retryText: {
        fontSize: 10,
        color: '#ffffff',
        fontWeight: '800',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
        gap: 16,
    },
    emptyText: {
        fontSize: 14,
        color: '#94a3b8',
        textAlign: 'center',
        paddingHorizontal: 50,
        lineHeight: 20,
    },
    proposalContainer: {
        marginTop: 8,
    },
    proposalCard: {
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
        borderRadius: 12,
        paddingVertical: 12,
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
    inputArea: {
        backgroundColor: 'transparent',
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
        backgroundColor: '#ffffff',
        borderRadius: 28,
        paddingLeft: 4,
        paddingRight: 6,
        paddingVertical: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
        borderWidth: 1,
        borderColor: 'rgba(226, 232, 240, 0.5)',
    },
    textInput: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 10,
        color: '#1e293b',
        fontSize: 15,
        minHeight: 40,
    },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#0f766e',
        alignItems: 'center',
        justifyContent: 'center',
    },
    disabledButton: {
        backgroundColor: '#e2e8f0',
    },
    inputHint: {
        fontSize: 11,
        color: '#ef4444',
        marginTop: 8,
        textAlign: 'center',
        fontWeight: '600',
    }
});
