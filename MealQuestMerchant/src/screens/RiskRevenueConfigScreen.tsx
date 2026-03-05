import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import ActionButton from '../components/ui/ActionButton';
import AppShell from '../components/ui/AppShell';
import SurfaceCard from '../components/ui/SurfaceCard';
import { useMerchant } from '../context/MerchantContext';
import {
  RevenueStrategyConfig,
  RevenueStrategyRecommendationResponse,
  getRevenueStrategyConfig,
  recommendRevenueStrategyConfig,
  setRevenueStrategyConfig,
} from '../services/apiClient';
import { mqTheme } from '../theme/tokens';

type RevenueConfigDraft = {
  minOrderAmount: string;
  voucherValue: string;
  voucherCost: string;
  budgetCap: string;
  frequencyWindowSec: string;
  frequencyMaxHits: string;
  inventorySku: string;
  inventoryMaxUnits: string;
};

function toDraft(config: RevenueStrategyConfig): RevenueConfigDraft {
  return {
    minOrderAmount: String(config.minOrderAmount),
    voucherValue: String(config.voucherValue),
    voucherCost: String(config.voucherCost),
    budgetCap: String(config.budgetCap),
    frequencyWindowSec: String(config.frequencyWindowSec),
    frequencyMaxHits: String(config.frequencyMaxHits),
    inventorySku: String(config.inventorySku || ''),
    inventoryMaxUnits: String(config.inventoryMaxUnits),
  };
}

function parsePositiveNumber(value: string, label: string): number {
  const num = Number(String(value || '').trim());
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return Math.round(num * 100) / 100;
}

function parsePositiveInt(value: string, label: string): number {
  const num = Number(String(value || '').trim());
  if (!Number.isFinite(num) || num <= 0 || !Number.isInteger(num)) {
    throw new Error(`${label} must be a positive integer`);
  }
  return num;
}

function toPayload(draft: RevenueConfigDraft): RevenueStrategyConfig {
  const inventorySku = String(draft.inventorySku || '').trim();
  if (!inventorySku) {
    throw new Error('inventorySku is required');
  }
  return {
    minOrderAmount: parsePositiveNumber(draft.minOrderAmount, 'minOrderAmount'),
    voucherValue: parsePositiveNumber(draft.voucherValue, 'voucherValue'),
    voucherCost: parsePositiveNumber(draft.voucherCost, 'voucherCost'),
    budgetCap: parsePositiveNumber(draft.budgetCap, 'budgetCap'),
    frequencyWindowSec: parsePositiveInt(draft.frequencyWindowSec, 'frequencyWindowSec'),
    frequencyMaxHits: parsePositiveInt(draft.frequencyMaxHits, 'frequencyMaxHits'),
    inventorySku,
    inventoryMaxUnits: parsePositiveInt(draft.inventoryMaxUnits, 'inventoryMaxUnits'),
  };
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.input}
        keyboardType={keyboardType}
        placeholderTextColor="#8093ab"
      />
    </View>
  );
}

export default function RiskRevenueConfigScreen() {
  const { authSession, merchantState } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [draft, setDraft] = useState<RevenueConfigDraft | null>(null);
  const [configError, setConfigError] = useState('');
  const [configNotice, setConfigNotice] = useState('');
  const [recommendation, setRecommendation] = useState<RevenueStrategyRecommendationResponse | null>(null);
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setConfigError('');
    try {
      const result = await getRevenueStrategyConfig({
        merchantId: authSession.merchantId,
        token: authSession.token,
      });
      setDraft(toDraft(result.config));
      setPolicyId(result.policyId);
      setUpdatedAt(result.updatedAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'load revenue config failed';
      setConfigError(message);
    } finally {
      setLoading(false);
    }
  }, [authSession]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const revenueTopReason = merchantState.revenueUpsellSummary.topBlockedReasons[0];
  const revenueLatest = merchantState.revenueUpsellSummary.latestResults[0];
  const inventoryConsumed24h = merchantState.revenueUpsellSummary.hitCount24h;

  const recommendationSummary = useMemo(() => {
    if (!recommendation) {
      return null;
    }
    return {
      aov: recommendation.salesSnapshot.aov,
      ordersPaidCount: recommendation.salesSnapshot.ordersPaidCount,
      netRevenue: recommendation.salesSnapshot.netRevenue,
    };
  }, [recommendation]);

  const updateDraftField = (key: keyof RevenueConfigDraft, value: string) => {
    setDraft((prev) => ({
      ...(prev || {
        minOrderAmount: '',
        voucherValue: '',
        voucherCost: '',
        budgetCap: '',
        frequencyWindowSec: '',
        frequencyMaxHits: '',
        inventorySku: '',
        inventoryMaxUnits: '',
      }),
      [key]: value,
    }));
  };

  const handleSave = async () => {
    if (!authSession || !authSession.token || !authSession.merchantId || !draft) {
      return;
    }
    setConfigError('');
    setConfigNotice('');
    setSaving(true);
    try {
      const payload = toPayload(draft);
      const result = await setRevenueStrategyConfig({
        merchantId: authSession.merchantId,
        token: authSession.token,
        config: payload,
      });
      setDraft(toDraft(result.config));
      setPolicyId(result.policyId);
      setUpdatedAt(result.updatedAt);
      setConfigNotice('Revenue strategy config saved and published.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'save revenue config failed';
      setConfigError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleRecommend = async () => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      return;
    }
    setConfigError('');
    setConfigNotice('');
    setRecommending(true);
    try {
      const result = await recommendRevenueStrategyConfig({
        merchantId: authSession.merchantId,
        token: authSession.token,
      });
      setRecommendation(result);
      setConfigNotice('Agent recommendation generated. You can apply and then save.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'recommend revenue config failed';
      setConfigError(message);
    } finally {
      setRecommending(false);
    }
  };

  const handleApplyRecommendation = () => {
    if (!recommendation) {
      return;
    }
    setDraft(toDraft(recommendation.recommendedConfig));
    setConfigNotice('Recommendation applied to draft. Save to publish.');
    setConfigError('');
  };

  return (
    <AppShell scroll>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>Revenue 风控配置</Text>
        <Text style={styles.subtitle}>手动配置慢销加购策略，或先获取 Agent 建议再应用。</Text>
      </View>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>24h 执行摘要</Text>
        <Text style={styles.summaryLine}>命中：{merchantState.revenueUpsellSummary.hitCount24h}</Text>
        <Text style={styles.summaryLine}>拦截：{merchantState.revenueUpsellSummary.blockedCount24h}</Text>
        <Text style={styles.summaryLine}>库存消耗（估算）：{inventoryConsumed24h}</Text>
        <Text style={styles.summaryLine}>
          {revenueTopReason && revenueTopReason.reason
            ? `Top 拦截原因：${revenueTopReason.reason}（${revenueTopReason.count}）`
            : 'Top 拦截原因：暂无'}
        </Text>
        <Text style={styles.summaryLine}>
          {revenueLatest && revenueLatest.outcome
            ? `最近结果：${revenueLatest.outcome}${revenueLatest.reasonCode ? ` · ${revenueLatest.reasonCode}` : ''}`
            : '最近结果：暂无'}
        </Text>
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>策略参数</Text>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading config...</Text>
          </View>
        ) : draft ? (
          <>
            <Field
              label="minOrderAmount"
              value={draft.minOrderAmount}
              onChangeText={(value) => updateDraftField('minOrderAmount', value)}
              keyboardType="decimal-pad"
            />
            <Field
              label="voucherValue"
              value={draft.voucherValue}
              onChangeText={(value) => updateDraftField('voucherValue', value)}
              keyboardType="decimal-pad"
            />
            <Field
              label="voucherCost"
              value={draft.voucherCost}
              onChangeText={(value) => updateDraftField('voucherCost', value)}
              keyboardType="decimal-pad"
            />
            <Field
              label="budgetCap"
              value={draft.budgetCap}
              onChangeText={(value) => updateDraftField('budgetCap', value)}
              keyboardType="decimal-pad"
            />
            <Field
              label="frequencyWindowSec"
              value={draft.frequencyWindowSec}
              onChangeText={(value) => updateDraftField('frequencyWindowSec', value)}
              keyboardType="numeric"
            />
            <Field
              label="frequencyMaxHits"
              value={draft.frequencyMaxHits}
              onChangeText={(value) => updateDraftField('frequencyMaxHits', value)}
              keyboardType="numeric"
            />
            <Field
              label="inventorySku"
              value={draft.inventorySku}
              onChangeText={(value) => updateDraftField('inventorySku', value)}
            />
            <Field
              label="inventoryMaxUnits"
              value={draft.inventoryMaxUnits}
              onChangeText={(value) => updateDraftField('inventoryMaxUnits', value)}
              keyboardType="numeric"
            />
          </>
        ) : (
          <Text style={styles.summaryLine}>Config unavailable.</Text>
        )}

        <Text style={styles.metaText}>policyId: {policyId || 'not published'}</Text>
        <Text style={styles.metaText}>updatedAt: {updatedAt || 'n/a'}</Text>
        {configError ? <Text style={styles.errorText}>{configError}</Text> : null}
        {configNotice ? <Text style={styles.noticeText}>{configNotice}</Text> : null}

        <View style={styles.actionWrap}>
          <ActionButton
            label={saving ? '保存中...' : '保存并发布'}
            icon={saving ? 'hourglass-top' : 'save'}
            onPress={handleSave}
            disabled={loading || !draft || saving}
            busy={saving}
          />
          <ActionButton
            label={recommending ? '生成中...' : 'Agent 建议'}
            icon={recommending ? 'hourglass-top' : 'auto-awesome'}
            variant="secondary"
            onPress={handleRecommend}
            disabled={loading || recommending}
            busy={recommending}
          />
          {recommendation ? (
            <ActionButton
              label="应用建议到草稿"
              icon="tips-and-updates"
              variant="secondary"
              onPress={handleApplyRecommendation}
              disabled={loading}
            />
          ) : null}
          <ActionButton
            label="刷新"
            icon="refresh"
            variant="secondary"
            onPress={() => {
              void loadConfig();
            }}
            disabled={loading}
          />
        </View>
      </SurfaceCard>

      {recommendation ? (
        <SurfaceCard>
          <Text style={styles.sectionTitle}>Agent 推荐参数</Text>
          {recommendationSummary ? (
            <>
              <Text style={styles.summaryLine}>近样本客单价（AOV）：{recommendationSummary.aov}</Text>
              <Text style={styles.summaryLine}>近样本支付单数：{recommendationSummary.ordersPaidCount}</Text>
              <Text style={styles.summaryLine}>近样本净收入：{recommendationSummary.netRevenue}</Text>
            </>
          ) : null}
          {recommendation.rationale.map((reason) => (
            <Text style={styles.summaryLine} key={reason}>
              - {reason}
            </Text>
          ))}
        </SurfaceCard>
      ) : null}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingTop: mqTheme.spacing.sm,
    gap: 4,
  },
  title: {
    ...mqTheme.typography.title,
    fontSize: 22,
  },
  subtitle: {
    ...mqTheme.typography.body,
    color: '#435571',
  },
  sectionTitle: {
    ...mqTheme.typography.sectionTitle,
  },
  summaryLine: {
    ...mqTheme.typography.body,
    color: '#2e425e',
  },
  fieldWrap: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3c5373',
  },
  input: {
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    borderRadius: mqTheme.radius.md,
    backgroundColor: mqTheme.colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    lineHeight: 20,
    color: mqTheme.colors.ink,
  },
  actionWrap: {
    gap: mqTheme.spacing.sm,
    marginTop: 4,
  },
  loadingWrap: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  loadingText: {
    ...mqTheme.typography.caption,
  },
  metaText: {
    ...mqTheme.typography.caption,
    color: '#5b6f8f',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    color: mqTheme.colors.danger,
  },
  noticeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#20624b',
  },
});
