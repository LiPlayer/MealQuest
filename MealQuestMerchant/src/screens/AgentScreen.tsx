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

import ActionButton from '../components/ui/ActionButton';
import AppShell from '../components/ui/AppShell';
import SurfaceCard from '../components/ui/SurfaceCard';
import StatTile from '../components/ui/StatTile';
import { useMerchant } from '../context/MerchantContext';
import { mqTheme } from '../theme/tokens';

const RichText = ({ text, isStreaming }: { text: string; isStreaming?: boolean }) => {
  if (!text && !isStreaming) {
    return null;
  }
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
    }, 90);
    return () => clearTimeout(timer);
  }, [agentMessages]);

  return (
    <AppShell edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 18}
      >
        <SurfaceCard style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroTitleWrap}>
              <Text style={styles.heroTitle}>AI 经营协作中心</Text>
              <Text style={styles.heroSubtitle}>看板看结果，Agent 负责下一步建议。</Text>
            </View>
            <ActionButton
              testID="ai-proactive-scan"
              label="巡检"
              onPress={onTriggerProactiveScan}
              variant="secondary"
              icon="radar"
            />
          </View>

          <View testID="merchant-customer-entry-card" style={styles.customerEntryCard}>
            <Text style={styles.customerEntryTitle}>顾客入店只读视图</Text>
            <View style={styles.customerEntryGrid}>
              <StatTile label="总顾客" value={merchantState.customerEntry.totalCustomers} />
              <StatTile label="今日新增" value={merchantState.customerEntry.newCustomersToday} />
              <StatTile label="今日入店" value={merchantState.customerEntry.checkinsToday} />
            </View>
          </View>
        </SurfaceCard>

        <ScrollView
          ref={scrollViewRef}
          style={styles.chatScroll}
          contentContainerStyle={styles.chatContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          {activeAgentProgress ? (
            <SurfaceCard style={styles.progressWrap}>
              <Text style={styles.progressTitle}>Agent Progress</Text>
              <Text style={styles.progressText}>
                {activeAgentProgress.phase} | {activeAgentProgress.status}
              </Text>
              <Text style={styles.progressText}>
                Tokens {activeAgentProgress.tokenCount} |{' '}
                {Math.max(0, Math.round(activeAgentProgress.elapsedMs))}ms
              </Text>
              {activeAgentProgress.error ? (
                <Text style={styles.progressError}>{activeAgentProgress.error}</Text>
              ) : null}
            </SurfaceCard>
          ) : null}

          {agentMessages.length === 0 ? (
            <SurfaceCard style={styles.emptyState}>
              <MaterialIcons name="lightbulb-outline" size={30} color="#89a0bd" />
              <Text style={styles.emptyText}>输入经营目标，开始一次可回放的策略协作。</Text>
            </SurfaceCard>
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

        <SurfaceCard style={styles.composerWrap}>
          <TextInput
            testID="agent-intent-input"
            value={aiIntentDraft}
            onChangeText={setAiIntentDraft}
            placeholder="例如：帮我提升本周午餐复购率"
            placeholderTextColor="#8699b2"
            multiline
            style={styles.input}
          />

          {chatSendPhase === 'failed' ? <Text style={styles.errorText}>{chatSendError}</Text> : null}

          <ActionButton
            testID="agent-send"
            label={aiIntentSubmitting ? '发送中...' : '发送'}
            icon={aiIntentSubmitting ? 'hourglass-top' : 'send'}
            disabled={aiIntentSubmitting || !aiIntentDraft.trim()}
            busy={aiIntentSubmitting}
            onPress={onSendAgentMessage}
          />
        </SurfaceCard>
      </KeyboardAvoidingView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: mqTheme.spacing.sm,
  },
  heroCard: {
    marginTop: mqTheme.spacing.sm,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: mqTheme.spacing.sm,
  },
  heroTitleWrap: {
    flex: 1,
    gap: 2,
  },
  heroTitle: {
    ...mqTheme.typography.sectionTitle,
    fontSize: 18,
  },
  heroSubtitle: {
    ...mqTheme.typography.caption,
  },
  customerEntryCard: {
    gap: mqTheme.spacing.sm,
  },
  customerEntryTitle: {
    ...mqTheme.typography.caption,
    color: '#344661',
  },
  customerEntryGrid: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
  },
  chatScroll: {
    flex: 1,
    minHeight: 0,
  },
  chatContent: {
    paddingBottom: mqTheme.spacing.sm,
    gap: mqTheme.spacing.sm,
  },
  progressWrap: {
    backgroundColor: '#edf4ff',
    borderColor: '#c6dbff',
  },
  progressTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1f4fbf',
  },
  progressText: {
    fontSize: 12,
    color: '#325e95',
  },
  progressError: {
    marginTop: 2,
    fontSize: 12,
    color: mqTheme.colors.danger,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: mqTheme.spacing.xl,
  },
  emptyText: {
    ...mqTheme.typography.body,
    color: '#465c79',
    textAlign: 'center',
  },
  messageRow: {
    width: '100%',
  },
  messageBubble: {
    borderRadius: mqTheme.radius.lg,
    borderWidth: 1,
    padding: mqTheme.spacing.sm,
    gap: 4,
  },
  userBubble: {
    backgroundColor: '#e8f0ff',
    borderColor: '#bdd4ff',
    marginLeft: 42,
  },
  botBubble: {
    backgroundColor: '#ffffff',
    borderColor: mqTheme.colors.border,
    marginRight: 42,
  },
  roleLabel: {
    fontSize: 11,
    color: '#5d7390',
    fontWeight: '700',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    color: mqTheme.colors.ink,
  },
  streamingCursor: {
    color: mqTheme.colors.primary,
  },
  failedRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  failedText: {
    fontSize: 12,
    color: mqTheme.colors.danger,
    fontWeight: '700',
  },
  retryBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: mqTheme.radius.pill,
    backgroundColor: '#fff6f7',
    borderWidth: 1,
    borderColor: '#ffd3d9',
  },
  retryText: {
    fontSize: 12,
    color: mqTheme.colors.danger,
    fontWeight: '700',
  },
  composerWrap: {
    marginBottom: mqTheme.spacing.sm,
    gap: mqTheme.spacing.sm,
  },
  input: {
    minHeight: 72,
    maxHeight: 150,
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    borderRadius: mqTheme.radius.md,
    backgroundColor: mqTheme.colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    lineHeight: 20,
    color: mqTheme.colors.ink,
    textAlignVertical: 'top',
  },
  errorText: {
    color: mqTheme.colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
});
