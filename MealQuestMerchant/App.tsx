import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Config from 'react-native-config';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  createInitialMerchantState,
  smartCashierVerify,
  toggleKillSwitch,
  triggerCampaigns,
} from './src/domain/merchantEngine';
import {
  AllianceConfig,
  MerchantApi,
  StrategyTemplate,
} from './src/services/merchantApi';
import { AuditLogRow, buildAuditLogRow } from './src/services/auditLogViewModel';
import { createRealtimeClient } from './src/services/merchantRealtime';
import {
  buildRealtimeEventRow,
  buildSystemEventRow,
  RealtimeEventRow,
} from './src/services/realtimeEventViewModel';

type AuditActionFilter =
  | 'ALL'
  | 'PAYMENT_VERIFY'
  | 'PAYMENT_REFUND'
  | 'PRIVACY_CANCEL'
  | 'PROPOSAL_CONFIRM'
  | 'STRATEGY_PROPOSAL_CREATE'
  | 'CAMPAIGN_STATUS_SET'
  | 'FIRE_SALE_CREATE'
  | 'SUPPLIER_VERIFY'
  | 'ALLIANCE_CONFIG_SET'
  | 'ALLIANCE_SYNC_USER'
  | 'SOCIAL_TRANSFER'
  | 'SOCIAL_RED_PACKET_CREATE'
  | 'SOCIAL_RED_PACKET_CLAIM'
  | 'TREAT_SESSION_CREATE'
  | 'TREAT_SESSION_JOIN'
  | 'TREAT_SESSION_CLOSE'
  | 'KILL_SWITCH_SET'
  | 'TCA_TRIGGER';
type AuditStatusFilter = 'ALL' | 'SUCCESS' | 'DENIED' | 'BLOCKED' | 'FAILED';
type AuditTimeRange = '24H' | '7D' | 'ALL';

const AUDIT_ACTION_OPTIONS: { value: AuditActionFilter; label: string }[] = [
  { value: 'ALL', label: '全部动作' },
  { value: 'PAYMENT_VERIFY', label: '支付' },
  { value: 'PAYMENT_REFUND', label: '退款' },
  { value: 'PRIVACY_CANCEL', label: '顾客注销' },
  { value: 'PROPOSAL_CONFIRM', label: '提案确认' },
  { value: 'STRATEGY_PROPOSAL_CREATE', label: '提案生成' },
  { value: 'CAMPAIGN_STATUS_SET', label: '活动启停' },
  { value: 'FIRE_SALE_CREATE', label: '急售' },
  { value: 'SUPPLIER_VERIFY', label: '供应商核验' },
  { value: 'ALLIANCE_CONFIG_SET', label: '联盟配置' },
  { value: 'ALLIANCE_SYNC_USER', label: '联盟同步' },
  { value: 'SOCIAL_TRANSFER', label: '社交转赠' },
  { value: 'SOCIAL_RED_PACKET_CREATE', label: '红包创建' },
  { value: 'SOCIAL_RED_PACKET_CLAIM', label: '红包领取' },
  { value: 'TREAT_SESSION_CREATE', label: '请客创建' },
  { value: 'TREAT_SESSION_JOIN', label: '请客参与' },
  { value: 'TREAT_SESSION_CLOSE', label: '请客结算' },
  { value: 'KILL_SWITCH_SET', label: '熔断' },
  { value: 'TCA_TRIGGER', label: 'TCA' },
];

const AUDIT_STATUS_OPTIONS: { value: AuditStatusFilter; label: string }[] = [
  { value: 'ALL', label: '全部状态' },
  { value: 'SUCCESS', label: '成功' },
  { value: 'DENIED', label: '拒绝' },
  { value: 'BLOCKED', label: '阻断' },
  { value: 'FAILED', label: '失败' },
];

const AUDIT_TIME_OPTIONS: { value: AuditTimeRange; label: string }[] = [
  { value: '24H', label: '24小时' },
  { value: '7D', label: '7天' },
  { value: 'ALL', label: '全部时间' },
];

function buildAuditStartTime(range: AuditTimeRange): string {
  if (range === 'ALL') {
    return '';
  }
  const now = Date.now();
  const hours = range === '24H' ? 24 : 24 * 7;
  return new Date(now - hours * 60 * 60 * 1000).toISOString();
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MerchantConsoleApp() {
  const [merchantState, setMerchantState] = useState(createInitialMerchantState);
  const [lastAction, setLastAction] = useState('正在连接...');
  const [remoteToken, setRemoteToken] = useState<string | null>(null);

  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEventRow[]>([]);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [showOnlyAnomaly, setShowOnlyAnomaly] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditActionFilter, setAuditActionFilter] =
    useState<AuditActionFilter>('ALL');
  const [auditStatusFilter, setAuditStatusFilter] =
    useState<AuditStatusFilter>('ALL');
  const [auditTimeRange, setAuditTimeRange] = useState<AuditTimeRange>('7D');
  const [strategyTemplates, setStrategyTemplates] = useState<StrategyTemplate[]>([]);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [allianceConfig, setAllianceConfig] = useState<AllianceConfig | null>(null);
  const [allianceStores, setAllianceStores] = useState<
    { merchantId: string; name: string }[]
  >([]);
  const [lastRedPacketId, setLastRedPacketId] = useState('');
  const [lastTreatSessionId, setLastTreatSessionId] = useState('');

  const pendingProposals = useMemo(
    () => merchantState.pendingProposals.filter(item => item.status === 'PENDING'),
    [merchantState.pendingProposals],
  );

  const visibleRealtimeEvents = useMemo(
    () =>
      showOnlyAnomaly
        ? realtimeEvents.filter(item => item.isAnomaly)
        : realtimeEvents,
    [realtimeEvents, showOnlyAnomaly],
  );

  const appendRealtimeEvent = (event: RealtimeEventRow) => {
    setRealtimeEvents(prev => [event, ...prev].slice(0, 8));
  };

  const onCopyEventDetail = async (detail: string) => {
    try {
      const clipboard = (globalThis as any)?.navigator?.clipboard;
      if (clipboard?.writeText) {
        await clipboard.writeText(detail);
        setLastAction('已复制详情');
        return;
      }
    } catch {
      // ignore and fallback
    }
    setLastAction('当前环境不支持一键复制，请长按文本复制');
  };

  const refreshRemoteState = async (token: string) => {
    const remoteState = await MerchantApi.getState(token);
    setMerchantState(remoteState);
  };

  const refreshStrategyLibrary = async (token: string) => {
    setStrategyLoading(true);
    try {
      const response = await MerchantApi.getStrategyLibrary(token);
      setStrategyTemplates(response.templates || []);
    } catch {
      setStrategyTemplates([]);
    } finally {
      setStrategyLoading(false);
    }
  };

  const refreshAllianceData = async (token: string) => {
    try {
      const [config, stores] = await Promise.all([
        MerchantApi.getAllianceConfig(token),
        MerchantApi.listStores(token),
      ]);
      setAllianceConfig(config);
      setAllianceStores(stores.stores || []);
    } catch {
      setAllianceConfig(null);
      setAllianceStores([]);
    }
  };

  const refreshAuditLogs = async (
    token: string,
    options: {
      append?: boolean;
      cursor?: string | null;
      forceReset?: boolean;
    } = {},
  ) => {
    const append = Boolean(options.append && !options.forceReset);
    const cursor = append ? options.cursor ?? auditCursor : null;
    const startTime = buildAuditStartTime(auditTimeRange);
    setAuditLoading(true);
    try {
      const page = await MerchantApi.getAuditLogs(token, {
        limit: 6,
        cursor,
        action: auditActionFilter,
        status: auditStatusFilter,
        startTime,
      });
      const rows = (page.items || []).map(buildAuditLogRow);
      setAuditLogs(prev => (append ? [...prev, ...rows] : rows));
      setAuditCursor(page.pageInfo?.nextCursor || null);
      setAuditHasMore(Boolean(page.pageInfo?.hasMore));
      if (!append) {
        setExpandedAuditId(null);
      }
    } catch {
      if (!append) {
        setAuditLogs([]);
        setAuditCursor(null);
        setAuditHasMore(false);
      }
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    let realtimeClient: { close: () => void } | null = null;

    if (!MerchantApi.isConfigured()) {
      return () => {
        active = false;
        realtimeClient?.close();
      };
    }

    const bootstrapRemote = async () => {
      try {
        const token = await MerchantApi.loginAsMerchant();
        if (!active) {
          return;
        }
        setRemoteToken(token);
        setLastAction('已连接服务端驾驶舱');
        await refreshRemoteState(token);

        const wsUrl = MerchantApi.getWsUrl(token);
        if (wsUrl) {
          realtimeClient = createRealtimeClient({
            wsUrl,
            onMessage: message => {
              if (!active) {
                return;
              }
              appendRealtimeEvent(buildRealtimeEventRow(message));
              setLastAction(`实时事件：${message.type}`);
              refreshRemoteState(token).catch(() => { });
            },
            onError: () => {
              if (!active) {
                return;
              }
              appendRealtimeEvent(
                buildSystemEventRow({
                  type: 'SYSTEM_WS_ERROR',
                  detail: '已保持 HTTP 轮询模式',
                }),
              );
            },
          });

          appendRealtimeEvent(
            buildSystemEventRow({
              type: 'SYSTEM_WS_CONNECTED',
              detail: '正在监听 PAYMENT/TCA/KILL_SWITCH 等事件',
            }),
          );
        }
      } catch {
        if (!active) {
          return;
        }
        setRemoteToken(null);
        setLastAction('远程模式连接失败，已切回本地模式');
      }
    };

    bootstrapRemote().catch(() => { });
    return () => {
      active = false;
      realtimeClient?.close();
    };
  }, []);

  useEffect(() => {
    if (!remoteToken) {
      return;
    }
    refreshAuditLogs(remoteToken, { forceReset: true }).catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteToken, auditActionFilter, auditStatusFilter, auditTimeRange]);

  useEffect(() => {
    if (!remoteToken) {
      return;
    }
    refreshStrategyLibrary(remoteToken).catch(() => { });
    refreshAllianceData(remoteToken).catch(() => { });
  }, [remoteToken]);

  const onApproveProposal = async (proposalId: string, title: string) => {
    if (remoteToken) {
      await MerchantApi.approveProposal(remoteToken, proposalId);
      await refreshRemoteState(remoteToken);
      await refreshAuditLogs(remoteToken);
      await refreshStrategyLibrary(remoteToken);
      setLastAction(`已确认策略：${title}`);
      return;
    }
  };

  const onCreateStrategyProposal = async (
    templateId: string,
    branchId: string,
    label: string,
  ) => {
    if (!remoteToken) {
      setLastAction('连接未就绪');
      return;
    }
    await MerchantApi.createStrategyProposal(remoteToken, {
      templateId,
      branchId,
      intent: `生成${label}策略`,
    });
    await refreshRemoteState(remoteToken);
    await refreshAuditLogs(remoteToken);
    await refreshStrategyLibrary(remoteToken);
    setLastAction(`已生成提案：${label}`);
  };

  const onCreateFireSale = async () => {
    if (!remoteToken) {
      setLastAction('连接未就绪');
      return;
    }
    const response = await MerchantApi.createFireSale(remoteToken, {
      targetSku: 'sku_hot_soup',
      ttlMinutes: 30,
      voucherValue: 15,
      maxQty: 20,
    });
    await refreshRemoteState(remoteToken);
    await refreshAuditLogs(remoteToken);
    setLastAction(`急售已上线：${response.campaignId}`);
  };

  const onSetCampaignStatus = async (
    campaignId: string,
    status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED',
  ) => {
    if (!remoteToken) {
      setLastAction('连接未就绪');
      return;
    }
    const response = await MerchantApi.setCampaignStatus(remoteToken, {
      campaignId,
      status,
    });
    await refreshRemoteState(remoteToken);
    await refreshAuditLogs(remoteToken);
    setLastAction(`活动状态已更新：${response.campaignId} -> ${response.status}`);
  };

  const onToggleAllianceWalletShared = async () => {
    if (!remoteToken) {
      setLastAction('连接未就绪');
      return;
    }
    if (!allianceConfig) {
      setLastAction('联盟配置加载中，请稍后');
      return;
    }
    const response = await MerchantApi.setAllianceConfig(remoteToken, {
      clusterId: allianceConfig.clusterId,
      stores: allianceConfig.stores,
      walletShared: !allianceConfig.walletShared,
      tierShared: allianceConfig.tierShared,
    });
    setAllianceConfig(response);
    await refreshAuditLogs(remoteToken);
    setLastAction(`连锁钱包互通已${response.walletShared ? '开启' : '关闭'}`);
  };

  const onSyncAllianceUser = async () => {
    if (!remoteToken) {
      setLastAction('连接未就绪');
      return;
    }
    const response = await MerchantApi.syncAllianceUser(remoteToken, {
      userId: 'u_demo',
    });
    await refreshAllianceData(remoteToken);
    await refreshAuditLogs(remoteToken);
    setLastAction(`跨店用户同步完成：${response.syncedStores.join(', ')}`);
  };

  const onSocialTransferDemo = async () => {
    if (!remoteToken) {
      setLastAction('连接未就绪');
      return;
    }
    const result = await MerchantApi.socialTransfer(remoteToken, {
      fromUserId: 'u_demo',
      toUserId: 'u_friend',
      amount: 10,
      idempotencyKey: `merchant_social_transfer_${Date.now()}`,
    });
    await refreshRemoteState(remoteToken);
    await refreshAuditLogs(remoteToken);
    setLastAction(
      `转赠完成：${result.fromUserId} -> ${result.toUserId} (${result.amount})`,
    );
  };

  const onCreateSocialRedPacket = async () => {
    if (!remoteToken) {
      setLastAction('连接未就绪');
      return;
    }
    const result = await MerchantApi.createSocialRedPacket(remoteToken, {
      senderUserId: 'u_demo',
      totalAmount: 30,
      totalSlots: 3,
      expiresInMinutes: 30,
      idempotencyKey: `merchant_social_packet_${Date.now()}`,
    });
    setLastRedPacketId(result.packetId);
    await refreshRemoteState(remoteToken);
    await refreshAuditLogs(remoteToken);
    setLastAction(`拼手气红包已创建：${result.packetId}`);
  };

  const onClaimSocialRedPacket = async () => {
    if (!remoteToken) {
      setLastAction('连接未就绪');
      return;
    }
    if (!lastRedPacketId) {
      setLastAction('请先创建拼手气红包');
      return;
    }
    const result = await MerchantApi.claimSocialRedPacket(remoteToken, {
      packetId: lastRedPacketId,
      userId: 'u_friend',
      idempotencyKey: `merchant_social_claim_${Date.now()}`,
    });
    const packet = await MerchantApi.getSocialRedPacket(remoteToken, {
      packetId: lastRedPacketId,
    });
    await refreshRemoteState(remoteToken);
    await refreshAuditLogs(remoteToken);
    setLastAction(
      `红包领取成功：${result.claimAmount}，剩余 ${packet.remainingAmount}/${packet.remainingSlots}`,
    );
  };

  const onCreateTreatSession = async () => {
    if (!remoteToken) {
      setLastAction('连接未就绪');
      return;
    }
    const result = await MerchantApi.createTreatSession(remoteToken, {
      initiatorUserId: 'u_demo',
      mode: 'MERCHANT_SUBSIDY',
      orderAmount: 80,
      subsidyRate: 0.2,
      subsidyCap: 20,
      dailySubsidyCap: 60,
      ttlMinutes: 60,
    });
    setLastTreatSessionId(result.sessionId);
    await refreshAuditLogs(remoteToken);
    setLastAction(`请客会话已创建：${result.sessionId}`);
  };

  const onJoinTreatSession = async (userId: string, amount: number) => {
    if (!remoteToken) {
      setLastAction('连接未就绪');
      return;
    }
    if (!lastTreatSessionId) {
      setLastAction('请先创建请客会话');
      return;
    }
    await MerchantApi.joinTreatSession(remoteToken, {
      sessionId: lastTreatSessionId,
      userId,
      amount,
      idempotencyKey: `merchant_treat_join_${userId}_${Date.now()}`,
    });
    await refreshRemoteState(remoteToken);
    await refreshAuditLogs(remoteToken);
    setLastAction(`会话参与成功：${userId} 出资 ${amount}`);
  };

  const onCloseTreatSession = async () => {
    if (!remoteToken) {
      setLastAction('连接未就绪');
      return;
    }
    if (!lastTreatSessionId) {
      setLastAction('请先创建请客会话');
      return;
    }
    const result = await MerchantApi.closeTreatSession(remoteToken, {
      sessionId: lastTreatSessionId,
    });
    await refreshRemoteState(remoteToken);
    await refreshAuditLogs(remoteToken);
    setLastAction(`会话已结算：${result.status}`);
  };

  const onTriggerEvent = async (
    event: string,
    context: Record<string, string | boolean | number>,
    label: string,
  ) => {
    if (remoteToken) {
      const triggerResult = await MerchantApi.triggerEvent(
        remoteToken,
        event,
        context,
      );
      const executed = triggerResult.executed || [];
      await refreshRemoteState(remoteToken);
      await refreshAuditLogs(remoteToken);
      if (triggerResult.blockedByKillSwitch) {
        setLastAction('熔断中，策略未执行');
      } else if (executed.length > 0) {
        setLastAction(`${label}执行：${executed.join(', ')}`);
      } else {
        setLastAction(`${label}无匹配策略`);
      }
      return;
    }

    if (event !== 'WEATHER_CHANGE') {
      setLastAction('本地模式仅支持 WEATHER_CHANGE 演练');
      return;
    }
    setMerchantState(prev => {
      const result = triggerCampaigns(prev, 'WEATHER_CHANGE', {
        weather: context.weather as string,
      });
      if (result.blockedByKillSwitch) {
        setLastAction('熔断中，策略未执行');
      } else if (result.executedIds.length > 0) {
        setLastAction(`已执行策略：${result.executedIds.join(', ')}`);
      } else {
        setLastAction('无匹配策略执行');
      }
      return result.nextState;
    });
  };

  const onToggleKillSwitch = async () => {
    if (remoteToken) {
      const targetEnabled = !merchantState.killSwitchEnabled;
      await MerchantApi.setKillSwitch(remoteToken, targetEnabled);
      await refreshRemoteState(remoteToken);
      await refreshAuditLogs(remoteToken);
      setLastAction(targetEnabled ? '已开启预算熔断' : '已关闭预算熔断');
      return;
    }

    setMerchantState(prev => {
      const nextEnabled = !prev.killSwitchEnabled;
      setLastAction(nextEnabled ? '已开启预算熔断' : '已关闭预算熔断');
      return toggleKillSwitch(prev, nextEnabled);
    });
  };

  const onTriggerRainyEvent = async () => {
    await onTriggerEvent('WEATHER_CHANGE', { weather: 'RAIN' }, '暴雨事件');
  };

  const onVerifyCashier = () => {
    const settlement = smartCashierVerify({
      orderAmount: 52,
      voucherValue: 18,
      bonusBalance: 10,
      principalBalance: 20,
    });
    setLastAction(
      `智能核销完成，外部支付 ¥${settlement.payable.toFixed(2)}（券 ${settlement.deduction.voucher.toFixed(2)}）`,
    );
  };

  const activeCampaignCount = merchantState.activeCampaigns.filter(
    item => (item.status || 'ACTIVE') === 'ACTIVE',
  ).length;
  const budgetRemaining = Math.max(merchantState.budgetCap - merchantState.budgetUsed, 0);
  const budgetUsagePercent = merchantState.budgetCap
    ? Math.min(100, Math.round((merchantState.budgetUsed / merchantState.budgetCap) * 100))
    : 0;

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.heroCard}>
            <View style={styles.heroHead}>
              <View style={styles.heroHeadTextWrap}>
                <Text style={styles.heroKicker}>MealQuest Merchant OS</Text>
                <Text style={styles.appTitle}>有戏掌柜驾驶舱</Text>
                <Text style={styles.appSubtitle}>聚合收银、策略确认、商业洞察一体化</Text>
              </View>
              <View
                style={[
                  styles.modePill,
                  styles.modePillRemote,
                ]}>
                <Text
                  style={[
                    styles.modePillText,
                    styles.modePillTextRemote,
                  ]}>
                  {remoteToken ? '已连接' : '连接中'}
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
              <View style={styles.heroStatCard}>
                <Text style={styles.heroStatLabel}>待办策略</Text>
                <Text style={styles.heroStatValue}>{pendingProposals.length}</Text>
                <Text style={styles.heroStatHint}>
                  {merchantState.killSwitchEnabled ? '熔断保护中' : '系统运行中'}
                </Text>
              </View>
            </View>
          </View>

          <SectionCard title="经营总览">
            <Text style={styles.dataLine}>门店：{merchantState.merchantName}</Text>
            <Text style={styles.dataLine}>
              营销预算：¥{merchantState.budgetUsed.toFixed(2)} / ¥
              {merchantState.budgetCap.toFixed(2)}
            </Text>
            <Text style={styles.dataLine}>
              熔断状态：{merchantState.killSwitchEnabled ? '已开启' : '运行中'}
            </Text>
            <Pressable
              testID="kill-switch-btn"
              style={styles.secondaryButton}
              onPress={onToggleKillSwitch}>
              <Text style={styles.secondaryButtonText}>
                {merchantState.killSwitchEnabled ? '关闭熔断' : '开启熔断'}
              </Text>
            </Pressable>
          </SectionCard>

          <SectionCard title="决策收件箱">
            {pendingProposals.length === 0 ? (
              <Text style={styles.mutedText}>暂无待确认策略</Text>
            ) : (
              pendingProposals.map(item => (
                <View key={item.id} style={styles.listRow}>
                  <Text style={styles.dataLine}>{item.title}</Text>
                  <Pressable
                    testID={`approve-${item.id}`}
                    style={styles.primaryButton}
                    onPress={() => onApproveProposal(item.id, item.title)}>
                    <Text style={styles.primaryButtonText}>确认执行</Text>
                  </Pressable>
                </View>
              ))
            )}
          </SectionCard>

          <SectionCard title="策略库">
            {!remoteToken ? (
              <Text style={styles.mutedText}>正在连接服务端开启策略库...</Text>
            ) : strategyLoading ? (
              <Text style={styles.mutedText}>策略库加载中...</Text>
            ) : strategyTemplates.length === 0 ? (
              <Text style={styles.mutedText}>暂无可用策略模板</Text>
            ) : (
              <>
                {strategyTemplates.map(template => (
                  <View key={template.templateId} style={styles.strategyBlock}>
                    <Text style={styles.dataLine}>
                      [{template.category}] {template.name}
                    </Text>
                    <Text style={styles.mutedText}>{template.description}</Text>
                    <View style={styles.filterRow}>
                      {template.branches.map(branch => (
                        <Pressable
                          key={`${template.templateId}-${branch.branchId}`}
                          style={styles.filterButton}
                          onPress={() =>
                            onCreateStrategyProposal(
                              template.templateId,
                              branch.branchId,
                              `${template.name}-${branch.name}`,
                            )
                          }>
                          <Text style={styles.filterButtonText}>{branch.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
                <Pressable style={styles.secondaryButton} onPress={onCreateFireSale}>
                  <Text style={styles.secondaryButtonText}>一键定向急售</Text>
                </Pressable>
              </>
            )}
          </SectionCard>

          <SectionCard title="活动启停">
            {merchantState.activeCampaigns.length === 0 ? (
              <Text style={styles.mutedText}>暂无已生效活动</Text>
            ) : (
              merchantState.activeCampaigns.map(item => {
                const status = item.status || 'ACTIVE';
                return (
                  <View key={`campaign-${item.id}`} style={styles.listRow}>
                    <Text style={styles.dataLine}>
                      {item.name} ({status})
                    </Text>
                    <View style={styles.filterRow}>
                      <Pressable
                        testID={`campaign-toggle-${item.id}`}
                        style={styles.filterButton}
                        onPress={() =>
                          onSetCampaignStatus(
                            item.id,
                            status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
                          )
                        }>
                        <Text style={styles.filterButtonText}>
                          {status === 'ACTIVE' ? '暂停' : '恢复'}
                        </Text>
                      </Pressable>
                      <Pressable
                        testID={`campaign-archive-${item.id}`}
                        style={styles.filterButton}
                        onPress={() => onSetCampaignStatus(item.id, 'ARCHIVED')}>
                        <Text style={styles.filterButtonText}>归档</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </SectionCard>

          <SectionCard title="多店联盟">
            {!remoteToken ? (
              <Text style={styles.mutedText}>正在连接服务端开启联盟配置...</Text>
            ) : !allianceConfig ? (
              <Text style={styles.mutedText}>联盟配置加载中...</Text>
            ) : (
              <>
                <Text style={styles.dataLine}>集群：{allianceConfig.clusterId}</Text>
                <Text style={styles.dataLine}>
                  钱包互通：{allianceConfig.walletShared ? '已开启' : '未开启'}
                </Text>
                <Text style={styles.mutedText}>
                  门店：{allianceStores.map(item => item.name).join(' / ')}
                </Text>
                <View style={styles.filterRow}>
                  <Pressable
                    testID="alliance-wallet-toggle"
                    style={styles.filterButton}
                    onPress={onToggleAllianceWalletShared}>
                    <Text style={styles.filterButtonText}>
                      {allianceConfig.walletShared ? '关闭钱包互通' : '开启钱包互通'}
                    </Text>
                  </Pressable>
                  <Pressable
                    testID="alliance-sync-user"
                    style={styles.filterButton}
                    onPress={onSyncAllianceUser}>
                    <Text style={styles.filterButtonText}>同步示例用户</Text>
                  </Pressable>
                </View>
              </>
            )}
          </SectionCard>

          <SectionCard title="社交裂变演练">
            <Text style={styles.mutedText}>演练用户：u_demo -&gt; u_friend</Text>
            <View style={styles.filterRow}>
              <Pressable
                testID="social-transfer-demo"
                style={styles.filterButton}
                onPress={onSocialTransferDemo}>
                <Text style={styles.filterButtonText}>转赠 10 碎银</Text>
              </Pressable>
              <Pressable
                testID="social-redpacket-create"
                style={styles.filterButton}
                onPress={onCreateSocialRedPacket}>
                <Text style={styles.filterButtonText}>创建拼手气红包</Text>
              </Pressable>
              <Pressable
                testID="social-redpacket-claim"
                style={styles.filterButton}
                onPress={onClaimSocialRedPacket}>
                <Text style={styles.filterButtonText}>好友领取红包</Text>
              </Pressable>
            </View>
            {lastRedPacketId ? (
              <Text style={styles.mutedText}>最近红包：{lastRedPacketId}</Text>
            ) : null}
          </SectionCard>

          <SectionCard title="请客买单演练">
            <Text style={styles.mutedText}>模式：老板请客（补贴）</Text>
            <View style={styles.filterRow}>
              <Pressable
                testID="treat-create"
                style={styles.filterButton}
                onPress={onCreateTreatSession}>
                <Text style={styles.filterButtonText}>创建会话</Text>
              </Pressable>
              <Pressable
                testID="treat-join-demo"
                style={styles.filterButton}
                onPress={() => onJoinTreatSession('u_demo', 30)}>
                <Text style={styles.filterButtonText}>u_demo 出资 30</Text>
              </Pressable>
              <Pressable
                testID="treat-join-friend"
                style={styles.filterButton}
                onPress={() => onJoinTreatSession('u_friend', 40)}>
                <Text style={styles.filterButtonText}>u_friend 出资 40</Text>
              </Pressable>
              <Pressable
                testID="treat-close"
                style={styles.filterButton}
                onPress={onCloseTreatSession}>
                <Text style={styles.filterButtonText}>结算会话</Text>
              </Pressable>
            </View>
            {lastTreatSessionId ? (
              <Text style={styles.mutedText}>最近会话：{lastTreatSessionId}</Text>
            ) : null}
          </SectionCard>

          <SectionCard title="收银台模拟">
            <Text style={styles.dataLine}>测试账单：¥52.00</Text>
            <Text style={styles.mutedText}>规则：临期券优先 -&gt; 赠送金 -&gt; 本金 -&gt; 外部支付</Text>
            <Pressable
              testID="verify-cashier-btn"
              style={styles.primaryButton}
              onPress={onVerifyCashier}>
              <Text style={styles.primaryButtonText}>执行智能核销</Text>
            </Pressable>
          </SectionCard>

          <SectionCard title="TCA 触发演练">
            <Text style={styles.mutedText}>可触发天气/进店/库存等事件检验策略执行</Text>
            <View style={styles.filterRow}>
              <Pressable
                testID="trigger-rain-event"
                style={styles.primaryButton}
                onPress={onTriggerRainyEvent}>
                <Text style={styles.primaryButtonText}>暴雨事件</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() =>
                  onTriggerEvent('APP_OPEN', { weather: 'RAIN', temperature: 18 }, '开屏触发')
                }>
                <Text style={styles.secondaryButtonText}>开屏触发</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() =>
                  onTriggerEvent(
                    'INVENTORY_ALERT',
                    { targetSku: 'sku_hot_soup', inventoryBacklog: 12 },
                    '库存预警',
                  )
                }>
                <Text style={styles.secondaryButtonText}>库存预警</Text>
              </Pressable>
            </View>
          </SectionCard>

          <SectionCard title="执行日志">
            <Text testID="last-action-text" style={styles.dataLine}>
              {lastAction}
            </Text>
          </SectionCard>

          <SectionCard title="实时事件流">
            <View style={styles.filterRow}>
              <Pressable
                style={[
                  styles.filterButton,
                  !showOnlyAnomaly && styles.filterButtonActive,
                ]}
                onPress={() => setShowOnlyAnomaly(false)}>
                <Text
                  style={[
                    styles.filterButtonText,
                    !showOnlyAnomaly && styles.filterButtonTextActive,
                  ]}>
                  全部
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.filterButton,
                  showOnlyAnomaly && styles.filterButtonWarn,
                ]}
                onPress={() => setShowOnlyAnomaly(true)}>
                <Text
                  style={[
                    styles.filterButtonText,
                    showOnlyAnomaly && styles.filterButtonWarnText,
                  ]}>
                  仅异常
                </Text>
              </Pressable>
            </View>

            {visibleRealtimeEvents.length === 0 ? (
              <Text style={styles.mutedText}>尚未收到实时事件</Text>
            ) : (
              visibleRealtimeEvents.map(item => (
                <Pressable
                  key={item.id}
                  style={styles.eventBlock}
                  onPress={() =>
                    setExpandedEventId(prev => (prev === item.id ? null : item.id))
                  }>
                  <View style={styles.eventHeader}>
                    <View
                      style={[
                        styles.eventBadge,
                        item.severity === 'warn' && styles.eventBadgeWarn,
                        item.severity === 'error' && styles.eventBadgeError,
                      ]}>
                      <Text style={styles.eventBadgeText}>{item.label}</Text>
                    </View>
                    <Text style={styles.eventLine}>{item.summary}</Text>
                  </View>
                  {expandedEventId === item.id && (
                    <View style={styles.eventDetailWrap}>
                      <Text selectable style={styles.eventDetail}>
                        {item.detail}
                      </Text>
                      <Pressable
                        style={styles.copyButton}
                        onPress={() => onCopyEventDetail(item.detail)}>
                        <Text style={styles.copyButtonText}>复制详情</Text>
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              ))
            )}
          </SectionCard>

          <SectionCard title="审计日志">
            {remoteToken && (
              <>
                <View style={styles.auditFilterRow}>
                  {AUDIT_ACTION_OPTIONS.map(item => (
                    <Pressable
                      key={`action-${item.value}`}
                      style={[
                        styles.auditFilterButton,
                        auditActionFilter === item.value && styles.auditFilterButtonActive,
                      ]}
                      onPress={() => setAuditActionFilter(item.value)}>
                      <Text
                        style={[
                          styles.auditFilterButtonText,
                          auditActionFilter === item.value && styles.auditFilterButtonTextActive,
                        ]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.auditFilterRow}>
                  {AUDIT_STATUS_OPTIONS.map(item => (
                    <Pressable
                      key={`status-${item.value}`}
                      style={[
                        styles.auditFilterButton,
                        auditStatusFilter === item.value && styles.auditFilterButtonActive,
                      ]}
                      onPress={() => setAuditStatusFilter(item.value)}>
                      <Text
                        style={[
                          styles.auditFilterButtonText,
                          auditStatusFilter === item.value && styles.auditFilterButtonTextActive,
                        ]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.auditFilterRow}>
                  {AUDIT_TIME_OPTIONS.map(item => (
                    <Pressable
                      key={`time-${item.value}`}
                      style={[
                        styles.auditFilterButton,
                        auditTimeRange === item.value && styles.auditFilterButtonActive,
                      ]}
                      onPress={() => setAuditTimeRange(item.value)}>
                      <Text
                        style={[
                          styles.auditFilterButtonText,
                          auditTimeRange === item.value && styles.auditFilterButtonTextActive,
                        ]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {!remoteToken ? (
              <Text style={styles.mutedText}>正在连接服务端开启审计流水...</Text>
            ) : auditLogs.length === 0 ? (
              <Text style={styles.mutedText}>{auditLoading ? '加载中...' : '暂无审计记录'}</Text>
            ) : (
              <>
                {auditLogs.map(item => (
                  <Pressable
                    key={item.id}
                    style={styles.auditBlock}
                    onPress={() =>
                      setExpandedAuditId(prev => (prev === item.id ? null : item.id))
                    }>
                    <View style={styles.auditHeader}>
                      <View
                        style={[
                          styles.auditBadge,
                          item.severity === 'warn' && styles.auditBadgeWarn,
                          item.severity === 'error' && styles.auditBadgeError,
                        ]}>
                        <Text style={styles.auditBadgeText}>{item.title}</Text>
                      </View>
                      <Text style={styles.eventLine}>{item.summary}</Text>
                    </View>
                    {expandedAuditId === item.id && (
                      <View style={styles.eventDetailWrap}>
                        <Text selectable style={styles.eventDetail}>
                          {item.detail}
                        </Text>
                        <Pressable
                          style={styles.copyButton}
                          onPress={() => onCopyEventDetail(item.detail)}>
                          <Text style={styles.copyButtonText}>复制详情</Text>
                        </Pressable>
                      </View>
                    )}
                  </Pressable>
                ))}
                {auditHasMore && (
                  <Pressable
                    style={styles.loadMoreButton}
                    onPress={() =>
                      remoteToken &&
                      !auditLoading &&
                      refreshAuditLogs(remoteToken, {
                        append: true,
                        cursor: auditCursor,
                      }).catch(() => { })
                    }>
                    <Text style={styles.loadMoreButtonText}>
                      {auditLoading ? '加载中...' : '加载更多'}
                    </Text>
                  </Pressable>
                )}
              </>
            )}
          </SectionCard>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

type MerchantEntryStep = 'PHONE_LOGIN' | 'GUIDE' | 'OPEN_STORE' | 'CONTRACT';

function MerchantEntryFlow({ onComplete }: { onComplete: (merchantId: string) => void }) {
  const [step, setStep] = useState<MerchantEntryStep>('PHONE_LOGIN');
  const [phone, setPhone] = useState('+8613800000000');
  const [code, setCode] = useState('');
  const [merchantId, setMerchantId] = useState('m_my_first_store');
  const [merchantName, setMerchantName] = useState('我的第一家店');
  const [companyName, setCompanyName] = useState('我的餐饮有限公司');
  const [licenseNo, setLicenseNo] = useState('91310000MA1TEST001');
  const [settlementAccount, setSettlementAccount] = useState('6222020202020202');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');

  const onRequestCode = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await MerchantApi.requestMerchantLoginCode(phone);
      setHint(
        result.debugCode
          ? `验证码已发送（测试验证码 ${result.debugCode}）`
          : '验证码已发送，请查看短信',
      );
    } catch (err: any) {
      setError(err?.message || '验证码发送失败');
    } finally {
      setLoading(false);
    }
  };

  const onVerifyPhone = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await MerchantApi.loginByPhone({ phone, code });
      setToken(result.token);
      setStep('GUIDE');
    } catch (err: any) {
      setError(err?.message || '手机号登录失败');
    } finally {
      setLoading(false);
    }
  };

  const onOpenStore = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await MerchantApi.onboardMerchant({
        merchantId,
        name: merchantName,
        budgetCap: 500,
        seedDemoUsers: true,
      });
      const nextMerchantId = result.merchant.merchantId;
      MerchantApi.setMerchantId(nextMerchantId);
      setMerchantId(nextMerchantId);
      setStep('CONTRACT');
    } catch (err: any) {
      setError(err?.message || '开店失败');
    } finally {
      setLoading(false);
    }
  };

  const onSubmitContract = async () => {
    setError('');
    setLoading(true);
    try {
      await MerchantApi.applyContract(token, {
        merchantId,
        companyName,
        licenseNo,
        settlementAccount,
        contactPhone: phone,
        notes: '应用内自助提交流程',
      });
      onComplete(merchantId);
    } catch (err: any) {
      setError(err?.message || '特约商户入驻提交失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.entryContainer}>
          <View style={styles.entryHero}>
            <Text style={styles.entryHeroKicker}>MealQuest Merchant</Text>
            <Text style={styles.entryTitle}>老板开店引导</Text>
            <Text style={styles.entrySubtitle}>手机号登录 - 引导 - 开店 - 特约入驻</Text>
          </View>

          {step === 'PHONE_LOGIN' && (
            <View style={styles.entryCard}>
              <Text style={styles.entryCardTitle}>1. 手机号登录</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="+8613800000000"
                style={styles.entryInput}
                keyboardType="phone-pad"
              />
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="输入验证码"
                style={styles.entryInput}
                keyboardType="number-pad"
              />
              <View style={styles.filterRow}>
                <Pressable style={styles.secondaryButton} onPress={onRequestCode}>
                  <Text style={styles.secondaryButtonText}>获取验证码</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={onVerifyPhone}>
                  <Text style={styles.primaryButtonText}>登录并继续</Text>
                </Pressable>
              </View>
              {hint ? <Text style={styles.entryHint}>{hint}</Text> : null}
            </View>
          )}

          {step === 'GUIDE' && (
            <View style={styles.entryCard}>
              <Text style={styles.entryCardTitle}>2. 新手引导</Text>
              <Text style={styles.dataLine}>• 收银台支持智能核销（券/赠金/本金）</Text>
              <Text style={styles.dataLine}>• 营销策略库可按门店一键生成</Text>
              <Text style={styles.dataLine}>• 审计日志可追溯高风险操作</Text>
              <Pressable style={styles.primaryButton} onPress={() => setStep('OPEN_STORE')}>
                <Text style={styles.primaryButtonText}>进入开店</Text>
              </Pressable>
            </View>
          )}

          {step === 'OPEN_STORE' && (
            <View style={styles.entryCard}>
              <Text style={styles.entryCardTitle}>3. 开店体验</Text>
              <TextInput
                value={merchantId}
                onChangeText={setMerchantId}
                placeholder="门店ID（如 m_my_first_store）"
                style={styles.entryInput}
              />
              <TextInput
                value={merchantName}
                onChangeText={setMerchantName}
                placeholder="门店名称"
                style={styles.entryInput}
              />
              <Pressable style={styles.primaryButton} onPress={onOpenStore}>
                <Text style={styles.primaryButtonText}>创建门店</Text>
              </Pressable>
            </View>
          )}

          {step === 'CONTRACT' && (
            <View style={styles.entryCard}>
              <Text style={styles.entryCardTitle}>4. 特约商户入驻</Text>
              <TextInput
                value={companyName}
                onChangeText={setCompanyName}
                placeholder="企业名称"
                style={styles.entryInput}
              />
              <TextInput
                value={licenseNo}
                onChangeText={setLicenseNo}
                placeholder="营业执照号"
                style={styles.entryInput}
              />
              <TextInput
                value={settlementAccount}
                onChangeText={setSettlementAccount}
                placeholder="结算账户"
                style={styles.entryInput}
              />
              <Pressable style={styles.primaryButton} onPress={onSubmitContract}>
                <Text style={styles.primaryButtonText}>提交入驻并进入驾驶舱</Text>
              </Pressable>
            </View>
          )}

          {error ? <Text style={styles.entryError}>{error}</Text> : null}
          {loading ? <Text style={styles.entryLoading}>处理中...</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const ENABLE_ENTRY_FLOW = (() => {
  const raw = String(Config.MQ_ENABLE_ENTRY_FLOW ?? 'true')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true';
})();

const ENTRY_DONE_KEY = 'mq_merchant_entry_done';
const ENTRY_MERCHANT_ID_KEY = 'mq_merchant_entry_merchant_id';

type SimpleStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const getSimpleStorage = (): SimpleStorage | null => {
  try {
    // Keep dynamic require so app can still run even if the module is not linked in a local dev setup.
    const mod = require('@react-native-async-storage/async-storage');
    return (mod?.default || mod) as SimpleStorage;
  } catch {
    return null;
  }
};

const restoreEntryState = async () => {
  const storage = getSimpleStorage();
  if (!storage) {
    return { done: false, merchantId: null as string | null };
  }
  const [doneRaw, merchantId] = await Promise.all([
    storage.getItem(ENTRY_DONE_KEY),
    storage.getItem(ENTRY_MERCHANT_ID_KEY),
  ]);
  return {
    done: doneRaw === '1',
    merchantId: merchantId ? String(merchantId) : null,
  };
};

const persistEntryState = async (merchantId: string) => {
  const storage = getSimpleStorage();
  if (!storage) {
    return;
  }
  await Promise.all([
    storage.setItem(ENTRY_DONE_KEY, '1'),
    storage.setItem(ENTRY_MERCHANT_ID_KEY, merchantId),
  ]);
};

export default function App() {
  const [entryBootstrapped, setEntryBootstrapped] = useState(!ENABLE_ENTRY_FLOW);
  const [ready, setReady] = useState(!ENABLE_ENTRY_FLOW);
  const [merchantId, setMerchantId] = useState(
    typeof MerchantApi.getMerchantId === 'function'
      ? MerchantApi.getMerchantId()
      : 'm_demo',
  );

  useEffect(() => {
    if (!ENABLE_ENTRY_FLOW) {
      return;
    }

    let active = true;
    const bootstrap = async () => {
      try {
        const state = await restoreEntryState();
        if (!active) {
          return;
        }
        if (state.merchantId && typeof MerchantApi.setMerchantId === 'function') {
          MerchantApi.setMerchantId(state.merchantId);
          setMerchantId(state.merchantId);
        }
        if (state.done) {
          setReady(true);
        }
      } catch {
        // Ignore bootstrap failures and fall back to entry flow.
      } finally {
        if (active) {
          setEntryBootstrapped(true);
        }
      }
    };

    bootstrap().catch(() => {
      if (active) {
        setEntryBootstrapped(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  if (!entryBootstrapped) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          <View style={[styles.entryContainer, { justifyContent: 'center' }]}>
            <Text style={styles.mutedText}>加载中...</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (!ready) {
    return (
      <MerchantEntryFlow
        onComplete={nextMerchantId => {
          if (typeof MerchantApi.setMerchantId === 'function') {
            MerchantApi.setMerchantId(nextMerchantId);
          }
          setMerchantId(nextMerchantId);
          persistEntryState(nextMerchantId).catch(() => { });
          setReady(true);
        }}
      />
    );
  }
  return <MerchantConsoleApp key={`merchant-console-${merchantId}`} />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eaf0f8',
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 34,
    gap: 12,
  },
  entryContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 12,
  },
  entryHero: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 4,
  },
  entryHeroKicker: {
    color: '#94a3b8',
    fontSize: 11,
    letterSpacing: 0.6,
  },
  entryTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800',
  },
  entrySubtitle: {
    color: '#cbd5e1',
    fontSize: 13,
  },
  entryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d9e3f0',
    padding: 14,
    gap: 10,
  },
  entryCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  entryInput: {
    borderWidth: 1,
    borderColor: '#cbd8ea',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f8fbff',
    color: '#0f172a',
    fontSize: 14,
  },
  entryHint: {
    color: '#0f766e',
    fontSize: 12,
  },
  entryError: {
    color: '#b91c1c',
    fontSize: 12,
  },
  entryLoading: {
    color: '#334155',
    fontSize: 12,
  },
  heroCard: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 16,
    gap: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 4,
  },
  heroHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroHeadTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  heroKicker: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f8fafc',
  },
  appSubtitle: {
    fontSize: 14,
    color: '#cbd5e1',
    marginTop: 4,
  },
  modePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  modePillRemote: {
    borderColor: '#14b8a6',
    backgroundColor: '#0f766e',
  },
  modePillLocal: {
    borderColor: '#64748b',
    backgroundColor: '#1e293b',
  },
  modePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modePillTextRemote: {
    color: '#ccfbf1',
  },
  modePillTextLocal: {
    color: '#e2e8f0',
  },
  heroStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroStatCard: {
    minWidth: 94,
    flexGrow: 1,
    backgroundColor: 'rgba(241, 245, 249, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  heroStatLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  heroStatValue: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
  },
  heroStatHint: {
    color: '#cbd5e1',
    fontSize: 11,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d9e3f0',
    gap: 10,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  dataLine: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 20,
  },
  mutedText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  listRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    padding: 10,
    gap: 8,
  },
  strategyBlock: {
    gap: 7,
    backgroundColor: '#f8fbff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe5f2',
    padding: 10,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f766e',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 9,
    shadowColor: '#0f766e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 2,
  },
  primaryButtonText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8eef7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd8ea',
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  eventLine: {
    fontSize: 12,
    color: '#334155',
    flexShrink: 1,
    lineHeight: 17,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventBlock: {
    backgroundColor: '#f8fbff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dde5f1',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  eventBadge: {
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  eventBadgeWarn: {
    backgroundColor: '#fef3c7',
  },
  eventBadgeError: {
    backgroundColor: '#fee2e2',
  },
  eventBadgeText: {
    fontSize: 10,
    color: '#1e293b',
    fontWeight: '700',
  },
  eventDetailWrap: {
    marginTop: 6,
    gap: 6,
  },
  eventDetail: {
    fontSize: 11,
    color: '#0f172a',
    fontFamily: 'monospace',
    lineHeight: 17,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#c7d4e4',
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: '#ffffff',
  },
  filterButtonActive: {
    borderColor: '#0f766e',
    backgroundColor: '#ccfbf1',
  },
  filterButtonWarn: {
    borderColor: '#d97706',
    backgroundColor: '#fef3c7',
  },
  filterButtonText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '700',
  },
  filterButtonTextActive: {
    color: '#115e59',
  },
  filterButtonWarnText: {
    color: '#92400e',
  },
  copyButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: '#ffffff',
  },
  copyButtonText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '700',
  },
  auditFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  auditFilterButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#c7d4e4',
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: '#ffffff',
  },
  auditFilterButtonActive: {
    borderColor: '#0f766e',
    backgroundColor: '#ccfbf1',
  },
  auditFilterButtonText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '700',
  },
  auditFilterButtonTextActive: {
    color: '#115e59',
  },
  auditBlock: {
    backgroundColor: '#f8fbff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dde5f1',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  auditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  auditBadge: {
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  auditBadgeWarn: {
    backgroundColor: '#fef3c7',
  },
  auditBadgeError: {
    backgroundColor: '#fee2e2',
  },
  auditBadgeText: {
    fontSize: 10,
    color: '#1e293b',
    fontWeight: '700',
  },
  loadMoreButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#8da2bf',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: '#ffffff',
  },
  loadMoreButtonText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '700',
  },
});
