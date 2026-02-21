import React, {useEffect, useMemo, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {
  approveProposal,
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
import {AuditLogRow, buildAuditLogRow} from './src/services/auditLogViewModel';
import {createRealtimeClient} from './src/services/merchantRealtime';
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

const AUDIT_ACTION_OPTIONS: {value: AuditActionFilter; label: string}[] = [
  {value: 'ALL', label: '全部动作'},
  {value: 'PAYMENT_VERIFY', label: '支付'},
  {value: 'PAYMENT_REFUND', label: '退款'},
  {value: 'PRIVACY_CANCEL', label: '顾客注销'},
  {value: 'PROPOSAL_CONFIRM', label: '提案确认'},
  {value: 'STRATEGY_PROPOSAL_CREATE', label: '提案生成'},
  {value: 'CAMPAIGN_STATUS_SET', label: '活动启停'},
  {value: 'FIRE_SALE_CREATE', label: '急售'},
  {value: 'SUPPLIER_VERIFY', label: '供应商核验'},
  {value: 'ALLIANCE_CONFIG_SET', label: '联盟配置'},
  {value: 'ALLIANCE_SYNC_USER', label: '联盟同步'},
  {value: 'SOCIAL_TRANSFER', label: '社交转赠'},
  {value: 'SOCIAL_RED_PACKET_CREATE', label: '红包创建'},
  {value: 'SOCIAL_RED_PACKET_CLAIM', label: '红包领取'},
  {value: 'TREAT_SESSION_CREATE', label: '请客创建'},
  {value: 'TREAT_SESSION_JOIN', label: '请客参与'},
  {value: 'TREAT_SESSION_CLOSE', label: '请客结算'},
  {value: 'KILL_SWITCH_SET', label: '熔断'},
  {value: 'TCA_TRIGGER', label: 'TCA'},
];

const AUDIT_STATUS_OPTIONS: {value: AuditStatusFilter; label: string}[] = [
  {value: 'ALL', label: '全部状态'},
  {value: 'SUCCESS', label: '成功'},
  {value: 'DENIED', label: '拒绝'},
  {value: 'BLOCKED', label: '阻断'},
  {value: 'FAILED', label: '失败'},
];

const AUDIT_TIME_OPTIONS: {value: AuditTimeRange; label: string}[] = [
  {value: '24H', label: '24小时'},
  {value: '7D', label: '7天'},
  {value: 'ALL', label: '全部时间'},
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

export default function App() {
  const [merchantState, setMerchantState] = useState(createInitialMerchantState);
  const [lastAction, setLastAction] = useState('待命中');
  const [remoteToken, setRemoteToken] = useState<string | null>(null);
  const [remoteMode, setRemoteMode] = useState(false);

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
    {merchantId: string; name: string}[]
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
    let realtimeClient: {close: () => void} | null = null;

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
        setRemoteMode(true);
        setRemoteToken(token);

        await refreshRemoteState(token);
        await refreshStrategyLibrary(token);
        await refreshAllianceData(token);
        await refreshAuditLogs(token);
        setLastAction('已连接服务端驾驶舱');

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
              void refreshRemoteState(token).catch(() => {});
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
        setLastAction('远程模式连接失败，已切回本地模式');
      }
    };

    void bootstrapRemote();
    return () => {
      active = false;
      realtimeClient?.close();
    };
  }, []);

  useEffect(() => {
    if (!remoteMode || !remoteToken) {
      return;
    }
    void refreshAuditLogs(remoteToken, {forceReset: true});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteMode, remoteToken, auditActionFilter, auditStatusFilter, auditTimeRange]);

  useEffect(() => {
    if (!remoteMode || !remoteToken) {
      return;
    }
    void refreshStrategyLibrary(remoteToken);
    void refreshAllianceData(remoteToken);
  }, [remoteMode, remoteToken]);

  const onApproveProposal = async (proposalId: string, title: string) => {
    if (remoteMode && remoteToken) {
      await MerchantApi.approveProposal(remoteToken, proposalId);
      await refreshRemoteState(remoteToken);
      await refreshAuditLogs(remoteToken);
      await refreshStrategyLibrary(remoteToken);
      setLastAction(`已确认策略：${title}`);
      return;
    }

    setMerchantState(prev => approveProposal(prev, proposalId));
    setLastAction(`已确认策略：${title}`);
  };

  const onCreateStrategyProposal = async (
    templateId: string,
    branchId: string,
    label: string,
  ) => {
    if (!remoteMode || !remoteToken) {
      setLastAction('策略库提案仅在远程联调模式可用');
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
    if (!remoteMode || !remoteToken) {
      setLastAction('紧急急售仅在远程联调模式可用');
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
    if (!remoteMode || !remoteToken) {
      setLastAction('活动启停仅在远程联调模式可用');
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
    if (!remoteMode || !remoteToken) {
      setLastAction('联盟配置仅在远程联调模式可用');
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
    if (!remoteMode || !remoteToken) {
      setLastAction('联盟同步仅在远程联调模式可用');
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
    if (!remoteMode || !remoteToken) {
      setLastAction('社交转赠仅在远程联调模式可用');
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
    if (!remoteMode || !remoteToken) {
      setLastAction('社交红包仅在远程联调模式可用');
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
    if (!remoteMode || !remoteToken) {
      setLastAction('社交红包仅在远程联调模式可用');
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
    if (!remoteMode || !remoteToken) {
      setLastAction('请客买单仅在远程联调模式可用');
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
    if (!remoteMode || !remoteToken) {
      setLastAction('请客买单仅在远程联调模式可用');
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
    if (!remoteMode || !remoteToken) {
      setLastAction('请客买单仅在远程联调模式可用');
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
    if (remoteMode && remoteToken) {
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
    if (remoteMode && remoteToken) {
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
    await onTriggerEvent('WEATHER_CHANGE', {weather: 'RAIN'}, '暴雨事件');
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

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.appTitle}>有戏掌柜驾驶舱</Text>
          <Text style={styles.appSubtitle}>聚合收银、策略确认、预算熔断一体化</Text>
          <Text style={styles.modeTag}>当前模式：{remoteMode ? '远程联调' : '本地演练'}</Text>

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
            {!remoteMode ? (
              <Text style={styles.mutedText}>远程模式下可查看完整营销策略库</Text>
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
            {!remoteMode ? (
              <Text style={styles.mutedText}>远程模式下可配置联盟与跨店同步</Text>
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
                    style={styles.filterButton}
                    onPress={onToggleAllianceWalletShared}>
                    <Text style={styles.filterButtonText}>
                      {allianceConfig.walletShared ? '关闭钱包互通' : '开启钱包互通'}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.filterButton} onPress={onSyncAllianceUser}>
                    <Text style={styles.filterButtonText}>同步示例用户</Text>
                  </Pressable>
                </View>
              </>
            )}
          </SectionCard>

          <SectionCard title="社交裂变演练">
            <Text style={styles.mutedText}>演练用户：u_demo -&gt; u_friend</Text>
            <View style={styles.filterRow}>
              <Pressable style={styles.filterButton} onPress={onSocialTransferDemo}>
                <Text style={styles.filterButtonText}>转赠 10 碎银</Text>
              </Pressable>
              <Pressable style={styles.filterButton} onPress={onCreateSocialRedPacket}>
                <Text style={styles.filterButtonText}>创建拼手气红包</Text>
              </Pressable>
              <Pressable style={styles.filterButton} onPress={onClaimSocialRedPacket}>
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
              <Pressable style={styles.filterButton} onPress={onCreateTreatSession}>
                <Text style={styles.filterButtonText}>创建会话</Text>
              </Pressable>
              <Pressable
                style={styles.filterButton}
                onPress={() => onJoinTreatSession('u_demo', 30)}>
                <Text style={styles.filterButtonText}>u_demo 出资 30</Text>
              </Pressable>
              <Pressable
                style={styles.filterButton}
                onPress={() => onJoinTreatSession('u_friend', 40)}>
                <Text style={styles.filterButtonText}>u_friend 出资 40</Text>
              </Pressable>
              <Pressable style={styles.filterButton} onPress={onCloseTreatSession}>
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
                  onTriggerEvent('APP_OPEN', {weather: 'RAIN', temperature: 18}, '开屏触发')
                }>
                <Text style={styles.secondaryButtonText}>开屏触发</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() =>
                  onTriggerEvent(
                    'INVENTORY_ALERT',
                    {targetSku: 'sku_hot_soup', inventoryBacklog: 12},
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
            {remoteMode && (
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

            {!remoteMode ? (
              <Text style={styles.mutedText}>远程模式下可查看审计流水</Text>
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
                      void refreshAuditLogs(remoteToken, {
                        append: true,
                        cursor: auditCursor,
                      })
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    padding: 16,
    gap: 12,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
  },
  appSubtitle: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 2,
  },
  modeTag: {
    fontSize: 12,
    color: '#0f766e',
    marginBottom: 4,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  dataLine: {
    fontSize: 14,
    color: '#1e293b',
  },
  mutedText: {
    fontSize: 13,
    color: '#64748b',
  },
  listRow: {
    gap: 8,
  },
  strategyBlock: {
    gap: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 8,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f766e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primaryButtonText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  eventLine: {
    fontSize: 12,
    color: '#334155',
    flexShrink: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventBlock: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  eventBadge: {
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
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
    fontWeight: '600',
  },
  eventDetailWrap: {
    marginTop: 6,
    gap: 6,
  },
  eventDetail: {
    fontSize: 11,
    color: '#0f172a',
    fontFamily: 'monospace',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    paddingVertical: 4,
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
    fontWeight: '600',
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
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#ffffff',
  },
  copyButtonText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  auditFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  auditFilterButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#ffffff',
  },
  auditFilterButtonActive: {
    borderColor: '#0f766e',
    backgroundColor: '#ccfbf1',
  },
  auditFilterButtonText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  auditFilterButtonTextActive: {
    color: '#115e59',
  },
  auditBlock: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
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
    fontWeight: '600',
  },
  loadMoreButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#64748b',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  loadMoreButtonText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
});
