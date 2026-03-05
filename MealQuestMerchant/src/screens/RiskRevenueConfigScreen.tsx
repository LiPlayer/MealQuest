import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import ActionButton from '../components/ui/ActionButton';
import AppShell from '../components/ui/AppShell';
import SurfaceCard from '../components/ui/SurfaceCard';
import { useMerchant } from '../context/MerchantContext';
import {
  GovernanceOverviewResponse,
  PolicyRecord,
  RevenueStrategyConfig,
  RevenueStrategyRecommendationResponse,
  getPolicies,
  getPolicyGovernanceOverview,
  getRevenueStrategyConfig,
  pausePolicy,
  recommendRevenueStrategyConfig,
  resumePolicy,
  setMerchantKillSwitch,
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
  const [riskLoading, setRiskLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [draft, setDraft] = useState<RevenueConfigDraft | null>(null);
  const [configError, setConfigError] = useState('');
  const [configNotice, setConfigNotice] = useState('');
  const [riskError, setRiskError] = useState('');
  const [riskNotice, setRiskNotice] = useState('');
  const [riskActionId, setRiskActionId] = useState('');
  const [recommendation, setRecommendation] = useState<RevenueStrategyRecommendationResponse | null>(null);
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [overview, setOverview] = useState<GovernanceOverviewResponse | null>(null);
  const [policyRows, setPolicyRows] = useState<PolicyRecord[]>([]);

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

  const loadRiskSnapshot = useCallback(async () => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      setRiskLoading(false);
      return;
    }
    setRiskLoading(true);
    setRiskError('');
    try {
      const [overviewResult, policiesResult] = await Promise.all([
        getPolicyGovernanceOverview({
          merchantId: authSession.merchantId,
          token: authSession.token,
        }),
        getPolicies({
          merchantId: authSession.merchantId,
          token: authSession.token,
          includeInactive: true,
        }),
      ]);
      setOverview(overviewResult);
      setPolicyRows(Array.isArray(policiesResult.items) ? policiesResult.items : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'load risk snapshot failed';
      setRiskError(message);
    } finally {
      setRiskLoading(false);
    }
  }, [authSession]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    void loadRiskSnapshot();
  }, [loadRiskSnapshot]);

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

  const isOwner = String(authSession?.role || '').toUpperCase() === 'OWNER';

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

  const handleKillSwitch = async (enabled: boolean) => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      return;
    }
    setRiskActionId(enabled ? 'kill-switch-enable' : 'kill-switch-disable');
    setRiskError('');
    setRiskNotice('');
    try {
      await setMerchantKillSwitch({
        merchantId: authSession.merchantId,
        token: authSession.token,
        enabled,
      });
      setRiskNotice(enabled ? '已开启紧急停机，策略执行将被拦截。' : '已关闭紧急停机，策略可恢复执行。');
      await loadRiskSnapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'set kill switch failed';
      setRiskError(message);
    } finally {
      setRiskActionId('');
    }
  };

  const handlePauseResumePolicy = async (policy: PolicyRecord) => {
    if (!authSession || !authSession.token || !authSession.merchantId) {
      return;
    }
    const policyIdValue = String(policy.policy_id || '').trim();
    if (!policyIdValue) {
      return;
    }
    setRiskActionId(policyIdValue);
    setRiskError('');
    setRiskNotice('');
    try {
      const status = String(policy.status || '').trim().toUpperCase();
      if (status === 'PUBLISHED') {
        await pausePolicy({
          merchantId: authSession.merchantId,
          policyId: policyIdValue,
          token: authSession.token,
          reason: 'owner_manual_pause',
        });
        setRiskNotice(`已暂停策略：${policy.policy_key || policyIdValue}`);
      } else if (status === 'PAUSED') {
        await resumePolicy({
          merchantId: authSession.merchantId,
          policyId: policyIdValue,
          token: authSession.token,
        });
        setRiskNotice(`已恢复策略：${policy.policy_key || policyIdValue}`);
      }
      await loadRiskSnapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'policy status update failed';
      setRiskError(message);
    } finally {
      setRiskActionId('');
    }
  };

  return (
    <AppShell scroll>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>Revenue 风控配置</Text>
        <Text style={styles.subtitle}>手动配置慢销加购策略，或先获取 Agent 建议再应用。</Text>
      </View>

      <SurfaceCard>
        <Text style={styles.sectionTitle}>风险治理与紧急停机</Text>
        <Text style={styles.summaryLine}>
          紧急停机：{overview?.killSwitchEnabled ? '已开启（执行拦截）' : '未开启（正常执行）'}
        </Text>
        <View style={styles.grid}>
          <Text style={styles.summaryLine}>待审批：{overview?.pendingApprovalCount ?? 0}</Text>
          <Text style={styles.summaryLine}>待发布：{overview?.approvedAwaitPublishCount ?? 0}</Text>
        </View>
        <View style={styles.grid}>
          <Text style={styles.summaryLine}>活跃策略：{overview?.activePolicyCount ?? 0}</Text>
          <Text style={styles.summaryLine}>暂停策略：{overview?.pausedPolicyCount ?? 0}</Text>
        </View>
        {!isOwner ? <Text style={styles.metaText}>当前角色仅可查看，风控开关与策略启停需 OWNER 权限。</Text> : null}
        {riskError ? <Text style={styles.errorText}>{riskError}</Text> : null}
        {riskNotice ? <Text style={styles.noticeText}>{riskNotice}</Text> : null}
        {riskLoading ? <Text style={styles.metaText}>风险治理数据加载中...</Text> : null}
        <View style={styles.actionWrap}>
          <ActionButton
            label={overview?.killSwitchEnabled ? '关闭紧急停机' : '开启紧急停机'}
            icon={riskActionId.startsWith('kill-switch') ? 'hourglass-top' : 'power-settings-new'}
            variant={overview?.killSwitchEnabled ? 'secondary' : 'danger'}
            onPress={() => {
              void handleKillSwitch(!Boolean(overview?.killSwitchEnabled));
            }}
            disabled={!isOwner || riskLoading || riskActionId.startsWith('kill-switch')}
            busy={riskActionId.startsWith('kill-switch')}
          />
          <ActionButton
            label="刷新治理状态"
            icon="refresh"
            variant="secondary"
            onPress={() => {
              void loadRiskSnapshot();
            }}
            disabled={riskLoading || Boolean(riskActionId)}
          />
        </View>

        <Text style={styles.sectionSubTitle}>策略启停</Text>
        {policyRows.length === 0 ? (
          <Text style={styles.metaText}>当前无可管理策略。</Text>
        ) : (
          policyRows.map((item) => {
            const itemStatus = String(item.status || '').toUpperCase();
            const canToggle = itemStatus === 'PUBLISHED' || itemStatus === 'PAUSED';
            const itemBusy = riskActionId === item.policy_id;
            return (
              <View key={item.policy_id} style={styles.policyRow}>
                <Text style={styles.policyTitle}>{item.name || item.policy_key || item.policy_id}</Text>
                <Text style={styles.metaText}>状态：{itemStatus || '-'}</Text>
                <Text style={styles.metaText}>policyId：{item.policy_id}</Text>
                <Text style={styles.metaText}>更新时间：{item.updated_at || item.published_at || '暂无'}</Text>
                {canToggle ? (
                  <ActionButton
                    label={itemBusy ? '处理中...' : itemStatus === 'PUBLISHED' ? '暂停策略' : '恢复策略'}
                    icon={itemBusy ? 'hourglass-top' : itemStatus === 'PUBLISHED' ? 'pause-circle' : 'play-circle'}
                    variant={itemStatus === 'PUBLISHED' ? 'danger' : 'secondary'}
                    onPress={() => {
                      void handlePauseResumePolicy(item);
                    }}
                    disabled={!isOwner || itemBusy || Boolean(riskActionId && !itemBusy)}
                    busy={itemBusy}
                  />
                ) : null}
              </View>
            );
          })
        )}
      </SurfaceCard>

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
  sectionSubTitle: {
    ...mqTheme.typography.caption,
    color: '#3c5373',
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    gap: mqTheme.spacing.sm,
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
  policyRow: {
    borderWidth: 1,
    borderColor: mqTheme.colors.border,
    borderRadius: mqTheme.radius.md,
    backgroundColor: '#ffffff',
    padding: mqTheme.spacing.sm,
    gap: 4,
  },
  policyTitle: {
    ...mqTheme.typography.body,
    color: mqTheme.colors.ink,
    fontWeight: '700',
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
