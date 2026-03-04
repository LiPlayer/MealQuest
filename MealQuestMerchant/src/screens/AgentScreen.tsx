import React, { useEffect, useRef } from 'react';
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
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMerchant } from '../context/MerchantContext';

const RichText = ({ text, isStreaming }: { text: string; isStreaming?: boolean }) => {
  if (!text && !isStreaming) return null;
  return (
    <Text style={styles.messageText}>
      {text || ''}
      {isStreaming ? <Text style={styles.streamingCursor}>▍</Text> : null}
    </Text>
  );
};

export default function AgentScreen() {
  const {
    merchantState,
    aiIntentDraft,
    setAiIntentDraft,
    aiIntentSubmitting,
    chatSendPhase,
    chatSendError,
    onTriggerProactiveScan,
    onSendAgentMessage,
    onRetryMessage,
    agentMessages,
    activeAgentProgress,
  } = useMerchant();

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [agentMessages]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
      >
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <MaterialIcons name="chat-bubble-outline" size={18} color="#0f766e" />
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>AI数字运营官</Text>
              <Text style={styles.headerSubtitle}>当前模式: 登录 + 开店 + 全能Agent</Text>
            </View>
            <Pressable testID="ai-proactive-scan" style={styles.proactiveBtn} onPress={onTriggerProactiveScan}>
              <Text style={styles.proactiveBtnText}>巡检</Text>
            </Pressable>
          </View>
        </View>

        <View testID="merchant-customer-entry-card" style={styles.customerEntryCard}>
          <Text style={styles.customerEntryTitle}>顾客入店只读视图</Text>
          <View style={styles.customerEntryGrid}>
            <View style={styles.customerEntryItem}>
              <Text style={styles.customerEntryLabel}>总顾客</Text>
              <Text style={styles.customerEntryValue}>{merchantState.customerEntry.totalCustomers}</Text>
            </View>
            <View style={styles.customerEntryItem}>
              <Text style={styles.customerEntryLabel}>今日新增</Text>
              <Text style={styles.customerEntryValue}>{merchantState.customerEntry.newCustomersToday}</Text>
            </View>
            <View style={styles.customerEntryItem}>
              <Text style={styles.customerEntryLabel}>今日入店</Text>
              <Text style={styles.customerEntryValue}>{merchantState.customerEntry.checkinsToday}</Text>
            </View>
          </View>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.chatScroll}
          contentContainerStyle={styles.chatContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          {activeAgentProgress ? (
            <View style={styles.progressWrap}>
              <Text style={styles.progressTitle}>Agent Progress</Text>
              <Text style={styles.progressText}>
                {activeAgentProgress.phase} | {activeAgentProgress.status}
              </Text>
              <Text style={styles.progressText}>
                Tokens {activeAgentProgress.tokenCount} | {Math.max(0, Math.round(activeAgentProgress.elapsedMs))}ms
              </Text>
              {activeAgentProgress.error ? (
                <Text style={styles.progressError}>{activeAgentProgress.error}</Text>
              ) : null}
            </View>
          ) : null}

          {agentMessages.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="info-outline" size={32} color="#cbd5e1" />
              <Text style={styles.emptyText}>还没有对话，输入你的经营目标开始。</Text>
            </View>
          ) : (
            agentMessages.map((item: any) => (
              <View key={item.messageId} style={styles.messageRow}>
                <View
                  style={[
                    styles.messageBubble,
                    item.role === 'USER' ? styles.userBubble : styles.botBubble,
                  ]}
                >
                  <Text style={styles.roleLabel}>{item.role === 'USER' ? '您' : 'AI 助手'}</Text>
                  <RichText text={item.text} isStreaming={item.isStreaming} />
                  {item.role === 'USER' && item.deliveryStatus === 'failed' ? (
                    <View style={styles.failedRow}>
                      <Text style={styles.failedText}>发送失败</Text>
                      <Pressable onPress={() => onRetryMessage(item.messageId)} style={styles.retryBtn}>
                        <Text style={styles.retryText}>重试</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.composerWrap}>
          <TextInput
            testID="agent-intent-input"
            value={aiIntentDraft}
            onChangeText={setAiIntentDraft}
            placeholder="例如：帮我提升本周午餐复购率"
            multiline
            style={styles.input}
          />

          {chatSendPhase === 'failed' ? <Text style={styles.errorText}>{chatSendError}</Text> : null}

          <Pressable
            testID="agent-send"
            style={[styles.sendBtn, (aiIntentSubmitting || !aiIntentDraft.trim()) && styles.sendBtnDisabled]}
            disabled={aiIntentSubmitting || !aiIntentDraft.trim()}
            onPress={onSendAgentMessage}
          >
            <MaterialIcons name={aiIntentSubmitting ? 'hourglass-top' : 'send'} size={16} color="#ffffff" />
            <Text style={styles.sendBtnText}>{aiIntentSubmitting ? '发送中...' : '发送'}</Text>
          </Pressable>
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
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  customerEntryCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  customerEntryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  customerEntryGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  customerEntryItem: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  customerEntryLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  customerEntryValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  proactiveBtn: {
    backgroundColor: '#0f766e',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  proactiveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  chatScroll: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  progressWrap: {
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    padding: 10,
  },
  progressTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3730a3',
    marginBottom: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#4338ca',
  },
  progressError: {
    marginTop: 4,
    fontSize: 12,
    color: '#b91c1c',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 18,
    backgroundColor: '#ffffff',
  },
  emptyText: {
    marginTop: 8,
    color: '#64748b',
    fontSize: 13,
  },
  messageRow: {
    width: '100%',
  },
  messageBubble: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  botBubble: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  roleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#0f172a',
  },
  streamingCursor: {
    opacity: 0.65,
  },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  failedText: {
    fontSize: 12,
    color: '#fca5a5',
  },
  retryBtn: {
    backgroundColor: '#fee2e2',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  retryText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
  },
  composerWrap: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  input: {
    minHeight: 64,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    textAlignVertical: 'top',
    backgroundColor: '#ffffff',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 12,
  },
  sendBtn: {
    height: 42,
    borderRadius: 10,
    backgroundColor: '#0f766e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  sendBtnDisabled: {
    backgroundColor: '#94a3b8',
  },
  sendBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
