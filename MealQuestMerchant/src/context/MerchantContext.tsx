import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MerchantApi } from '../services/merchantApi';
import {
    AuditLogRow,
    buildAuditLogRow,
} from '../services/auditLogViewModel';
import { createRealtimeClient } from '../services/merchantRealtime';
import {
    buildRealtimeEventRow,
    buildSystemEventRow,
    RealtimeEventRow,
} from '../services/realtimeEventViewModel';
import {
    AllianceConfig,
    StrategyChatMessage,
    StrategyChatPendingReview,
    StrategyChatReviewProgress,
    StrategyChatReviewResult,
    StrategyChatSessionResult,
} from '../services/merchantApi/types';
import { createInitialMerchantState, MerchantState } from '../domain/merchantEngine';

export type AuditActionFilter =
    | 'ALL'
    | 'PAYMENT_VERIFY'
    | 'PAYMENT_REFUND'
    | 'PRIVACY_CANCEL'
    | 'PROPOSAL_CONFIRM'
    | 'STRATEGY_CHAT_SESSION_CREATE'
    | 'STRATEGY_CHAT_MESSAGE'
    | 'STRATEGY_CHAT_REVIEW'
    | 'CAMPAIGN_STATUS_SET'
    | 'FIRE_SALE_CREATE'
    | 'SUPPLIER_VERIFY'
    | 'ALLIANCE_CONFIG_SET'
    | 'ALLIANCE_SYNC_USER'
    | 'KILL_SWITCH_SET'
    | 'TCA_TRIGGER';
export type AuditStatusFilter = 'ALL' | 'SUCCESS' | 'DENIED' | 'BLOCKED' | 'FAILED';
export type AuditTimeRange = '24H' | '7D' | 'ALL';

export type StrategyChatSnapshot = Pick<
    StrategyChatSessionResult,
    'sessionId' | 'messages' | 'pendingReview' | 'reviewProgress'
> & {
    pendingReviews?: StrategyChatPendingReview[];
};
export type StrategyChatDelta = {
    sessionId: string | null;
    pendingReview: StrategyChatPendingReview | null;
    pendingReviews?: StrategyChatPendingReview[];
    reviewProgress?: StrategyChatReviewProgress | null;
    messages?: StrategyChatMessage[];
    deltaMessages?: StrategyChatMessage[];
};

export function buildAuditStartTime(range: AuditTimeRange): string {
    if (range === 'ALL') return '';
    const now = Date.now();
    const hours = range === '24H' ? 24 : 24 * 7;
    return new Date(now - hours * 60 * 60 * 1000).toISOString();
}

interface MerchantContextType {
    merchantState: MerchantState;
    lastAction: string;
    setLastAction: (action: string) => void;
    realtimeEvents: RealtimeEventRow[];
    visibleRealtimeEvents: RealtimeEventRow[];
    expandedEventId: string | null;
    setExpandedEventId: (id: string | null) => void;
    showOnlyAnomaly: boolean;
    setShowOnlyAnomaly: (val: boolean) => void;
    auditLogs: AuditLogRow[];
    expandedAuditId: string | null;
    setExpandedAuditId: (id: string | null) => void;
    auditCursor: string | null;
    auditHasMore: boolean;
    auditLoading: boolean;
    auditActionFilter: AuditActionFilter;
    setAuditActionFilter: (val: AuditActionFilter) => void;
    auditStatusFilter: AuditStatusFilter;
    setAuditStatusFilter: (val: AuditStatusFilter) => void;
    auditTimeRange: AuditTimeRange;
    setAuditTimeRange: (val: AuditTimeRange) => void;
    allianceConfig: AllianceConfig | null;
    allianceStores: { merchantId: string; name: string }[];
    customerUserId: string;
    setCustomerUserId: (val: string) => void;
    qrStoreId: string;
    setQrStoreId: (val: string) => void;
    qrScene: string;
    setQrScene: (val: string) => void;
    qrPayload: string;
    aiIntentDraft: string;
    setAiIntentDraft: (val: string) => void;
    aiIntentSubmitting: boolean;
    strategyChatMessages: StrategyChatMessage[];
    strategyChatPendingReview: StrategyChatPendingReview | null;
    pendingReviewCount: number;
    totalReviewCount: number;
    currentReviewIndex: number;
    contractStatus: 'LOADING' | 'NOT_SUBMITTED' | 'SUBMITTED';
    setContractStatus: (val: 'LOADING' | 'NOT_SUBMITTED' | 'SUBMITTED') => void;

    // Handlers
    onCopyEventDetail: (detail: string) => Promise<void>;
    onCreateIntentProposal: () => Promise<void>;
    onReviewPendingStrategy: (decision: 'APPROVE' | 'REJECT') => Promise<void>;
    onCreateFireSale: () => Promise<void>;
    onSetCampaignStatus: (campaignId: string, status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED') => Promise<void>;
    onToggleAllianceWalletShared: () => Promise<void>;
    onSyncAllianceUser: () => Promise<void>;
    onToggleKillSwitch: () => Promise<void>;
    onGenerateMerchantQr: () => void;
    refreshAuditLogs: (options?: { append?: boolean; cursor?: string | null; forceReset?: boolean }) => Promise<void>;
    refreshRemoteState: () => Promise<void>;
}

const MerchantContext = createContext<MerchantContextType | undefined>(undefined);

export function MerchantProvider({
    children,
    initialToken,
    initialMerchantState,
    onAuthExpired,
}: {
    children: React.ReactNode;
    initialToken: string;
    initialMerchantState?: MerchantState;
    onAuthExpired: () => void;
}) {
    const [merchantState, setMerchantState] = useState<MerchantState>(
        initialMerchantState ?? createInitialMerchantState(),
    );
    const [lastAction, setLastAction] = useState('已连接...');
    const remoteToken = initialToken || null;
    const contractStatusFetchedRef = useRef(false);

    const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEventRow[]>([]);
    const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
    const [showOnlyAnomaly, setShowOnlyAnomaly] = useState(false);

    const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
    const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
    const [auditCursor, setAuditCursor] = useState<string | null>(null);
    const [auditHasMore, setAuditHasMore] = useState(false);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditActionFilter, setAuditActionFilter] = useState<AuditActionFilter>('ALL');
    const [auditStatusFilter, setAuditStatusFilter] = useState<AuditStatusFilter>('ALL');
    const [auditTimeRange, setAuditTimeRange] = useState<AuditTimeRange>('7D');

    const [allianceConfig, setAllianceConfig] = useState<AllianceConfig | null>(null);
    const [allianceStores, setAllianceStores] = useState<{ merchantId: string; name: string }[]>([]);
    const [customerUserId, setCustomerUserId] = useState('');
    const [qrStoreId, setQrStoreId] = useState('');
    const [qrScene, setQrScene] = useState('entry');
    const [qrPayload, setQrPayload] = useState('');

    const [aiIntentDraft, setAiIntentDraft] = useState('');
    const [aiIntentSubmitting, setAiIntentSubmitting] = useState(false);
    const [strategyChatSessionId, setStrategyChatSessionId] = useState('');
    const [strategyChatMessages, setStrategyChatMessages] = useState<StrategyChatMessage[]>([]);
    const [strategyChatPendingReview, setStrategyChatPendingReview] = useState<StrategyChatPendingReview | null>(null);
    const [strategyChatPendingReviews, setStrategyChatPendingReviews] = useState<StrategyChatPendingReview[]>([]);
    const [strategyChatReviewProgress, setStrategyChatReviewProgress] = useState<StrategyChatReviewProgress | null>(null);

    const [contractStatus, setContractStatus] = useState<'LOADING' | 'NOT_SUBMITTED' | 'SUBMITTED'>('LOADING');

    const pendingReviewCount = strategyChatPendingReviews.length;
    const totalReviewCount = Math.max(pendingReviewCount, Number(strategyChatReviewProgress?.totalCandidates || 0));
    const reviewedReviewCount = Math.max(0, Number(strategyChatReviewProgress?.reviewedCandidates || 0));
    const currentReviewIndex = pendingReviewCount > 0 ? Math.min(totalReviewCount, reviewedReviewCount + 1) : 0;

    const visibleRealtimeEvents = useMemo(
        () => (showOnlyAnomaly ? realtimeEvents.filter(item => item.isAnomaly) : realtimeEvents),
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
        } catch { /* fallback */ }
        setLastAction('当前环境不支持一键复制，请长按文本复制');
    };

    const refreshRemoteState = async () => {
        if (!remoteToken) return;
        const remoteState = await MerchantApi.getState(remoteToken);
        setMerchantState(remoteState);
    };

    const applyStrategyChatSnapshot = (snapshot: StrategyChatSnapshot) => {
        const pendingReviews = Array.isArray(snapshot.pendingReviews)
            ? snapshot.pendingReviews
            : snapshot.pendingReview ? [snapshot.pendingReview] : [];
        setStrategyChatSessionId(String(snapshot.sessionId || '').trim());
        setStrategyChatMessages(Array.isArray(snapshot.messages) ? snapshot.messages : []);
        setStrategyChatPendingReviews(pendingReviews);
        setStrategyChatPendingReview(snapshot.pendingReview || pendingReviews[0] || null);
        setStrategyChatReviewProgress(snapshot.reviewProgress || null);
    };

    const applyStrategyChatDelta = (delta: StrategyChatDelta) => {
        const pendingReviews = Array.isArray(delta.pendingReviews)
            ? delta.pendingReviews
            : delta.pendingReview ? [delta.pendingReview] : [];
        setStrategyChatSessionId(String(delta.sessionId || '').trim());
        setStrategyChatPendingReviews(pendingReviews);
        setStrategyChatPendingReview(delta.pendingReview || pendingReviews[0] || null);
        setStrategyChatReviewProgress(delta.reviewProgress || null);

        if (Array.isArray(delta.messages)) {
            setStrategyChatMessages(delta.messages);
            return;
        }
        const incoming = Array.isArray(delta.deltaMessages) ? delta.deltaMessages : [];
        if (incoming.length === 0) return;

        setStrategyChatMessages(prev => {
            const merged = prev.slice();
            const indexById = new Map(merged.map((item, index) => [item.messageId, index]));
            for (const item of incoming) {
                const existing = indexById.get(item.messageId);
                if (existing === undefined) {
                    indexById.set(item.messageId, merged.length);
                    merged.push(item);
                } else {
                    merged[existing] = item;
                }
            }
            return merged;
        });
    };

    const bootstrapStrategyChatSession = async (token: string): Promise<string> => {
        const merchantId = String((MerchantApi.getMerchantId() || merchantState.merchantId) || '').trim();
        if (!merchantId) throw new Error('merchantId missing');
        const response = await MerchantApi.createStrategyChatSession(token, { merchantId });
        const page = await MerchantApi.getStrategyChatMessages(token, { merchantId, limit: 40 });
        applyStrategyChatSnapshot({ ...response, messages: Array.isArray(page.items) ? page.items : [] });
        return String(response.sessionId || '').trim();
    };

    const ensureStrategyChatSession = async (token: string): Promise<string> => {
        if (strategyChatSessionId) return strategyChatSessionId;
        return bootstrapStrategyChatSession(token);
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

    const refreshAuditLogs = async (options: { append?: boolean; cursor?: string | null; forceReset?: boolean } = {}) => {
        if (!remoteToken) return;
        const append = Boolean(options.append && !options.forceReset);
        const cursor = append ? options.cursor ?? auditCursor : null;
        const startTime = buildAuditStartTime(auditTimeRange);
        setAuditLoading(true);
        try {
            const page = await MerchantApi.getAuditLogs(remoteToken, {
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
            if (!append) setExpandedAuditId(null);
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

    const isTokenExpiredError = (err: any) => {
        const msg = String(err?.message || '').toLowerCase();
        return msg.includes('token') && (msg.includes('expired') || msg.includes('invalid'));
    };

    useEffect(() => {
        let active = true;
        let realtimeClient: { close: () => void } | null = null;
        if (!MerchantApi.isConfigured() || !remoteToken) return;

        const bootstrapRemote = async () => {
            try {
                setLastAction('已连接服务端驾驶舱');
                if (!initialMerchantState) await refreshRemoteState();
                const wsUrl = MerchantApi.getWsUrl(remoteToken);
                if (wsUrl) {
                    realtimeClient = createRealtimeClient({
                        wsUrl,
                        onMessage: message => {
                            if (!active) return;
                            appendRealtimeEvent(buildRealtimeEventRow(message));
                            setLastAction(`实时事件：${message.type}`);
                            refreshRemoteState().catch(() => { });
                        },
                        onError: () => {
                            if (!active) return;
                            appendRealtimeEvent(buildSystemEventRow({ type: 'SYSTEM_WS_ERROR', detail: '已保持 HTTP 轮询模式' }));
                        },
                    });
                    appendRealtimeEvent(buildSystemEventRow({ type: 'SYSTEM_WS_CONNECTED', detail: '正在监听 PAYMENT/TCA/KILL_SWITCH 等事件' }));
                }
            } catch (err) {
                if (!active) return;
                if (isTokenExpiredError(err)) { onAuthExpired(); return; }
                setLastAction('远程会话失效，请重新登录');
            }
        };
        bootstrapRemote().catch(() => { });
        return () => { active = false; realtimeClient?.close(); };
    }, [remoteToken]);

    useEffect(() => {
        if (!remoteToken) return;
        refreshAuditLogs({ forceReset: true }).catch(() => { });
    }, [remoteToken, auditActionFilter, auditStatusFilter, auditTimeRange]);

    useEffect(() => {
        if (!remoteToken) return;
        setStrategyChatSessionId('');
        setStrategyChatMessages([]);
        setStrategyChatPendingReview(null);
        setStrategyChatPendingReviews([]);
        setStrategyChatReviewProgress(null);
        bootstrapStrategyChatSession(remoteToken).catch((err: any) => {
            if (isTokenExpiredError(err)) { onAuthExpired(); return; }
            setLastAction(`AI session init failed: ${err?.message || 'failed'}`);
        });
        refreshAllianceData(remoteToken).catch(() => { });
    }, [remoteToken]);

    useEffect(() => {
        if (!qrStoreId && merchantState.merchantId) setQrStoreId(merchantState.merchantId);
    }, [merchantState.merchantId, qrStoreId]);

    useEffect(() => {
        if (!remoteToken || !MerchantApi.isConfigured()) return;
        contractStatusFetchedRef.current = false;
    }, [remoteToken]);

    useEffect(() => {
        if (!remoteToken || !MerchantApi.isConfigured() || contractStatusFetchedRef.current) return;
        const currentMerchantId = MerchantApi.getMerchantId();
        if (!currentMerchantId) return;
        contractStatusFetchedRef.current = true;
        MerchantApi.getContractStatus(remoteToken, currentMerchantId)
            .then(result => setContractStatus(result.status === 'NOT_SUBMITTED' ? 'NOT_SUBMITTED' : 'SUBMITTED'))
            .catch(() => setContractStatus('SUBMITTED'));
    }, [remoteToken]);

    const onCreateIntentProposal = async () => {
        if (!remoteToken) { setLastAction('连接未就绪'); return; }
        const intent = aiIntentDraft.trim();
        if (intent.length < 4) { setLastAction('请输入更具体的经营需求（至少4个字）'); return; }
        if (strategyChatPendingReviews.length > 0) { setLastAction('存在待审核策略，请先确认或拒绝'); return; }
        setAiIntentSubmitting(true);
        try {
            await ensureStrategyChatSession(remoteToken);
            const result = await MerchantApi.sendStrategyChatMessage(remoteToken, { content: intent });
            applyStrategyChatDelta(result);
            await refreshAuditLogs();
            setAiIntentDraft('');
            // ... same logic for setLastAction based on result.status ...
            setLastAction(result.status === 'PENDING_REVIEW' ? 'AI 已生成策略，请确认或拒绝' : 'AI 已回复，请继续对话');
        } catch (err: any) {
            if (isTokenExpiredError(err)) { onAuthExpired(); return; }
            setLastAction(`AI request failed: ${err?.message || 'failed'}`);
        } finally { setAiIntentSubmitting(false); }
    };

    const onReviewPendingStrategy = async (decision: 'APPROVE' | 'REJECT') => {
        if (!remoteToken || !strategyChatPendingReview?.proposalId) { setLastAction('暂无待审核策略'); return; }
        try {
            const result = await MerchantApi.reviewStrategyChatProposal(remoteToken, {
                proposalId: strategyChatPendingReview.proposalId,
                decision,
            });
            applyStrategyChatDelta(result);
            await refreshRemoteState();
            await refreshAuditLogs();
            setLastAction(result.status === 'APPROVED' ? '策略已确认并生效' : '策略已拒绝');
        } catch { setLastAction('策略审核失败，请稍后重试'); }
    };

    const onCreateFireSale = async () => {
        if (!remoteToken) return;
        const response = await MerchantApi.createFireSale(remoteToken, { targetSku: 'sku_hot_soup', ttlMinutes: 30, voucherValue: 15, maxQty: 20 });
        await refreshRemoteState();
        await refreshAuditLogs();
        setLastAction(`急售已上线：${response.campaignId}`);
    };

    const onSetCampaignStatus = async (campaignId: string, status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED') => {
        if (!remoteToken) return;
        const response = await MerchantApi.setCampaignStatus(remoteToken, { campaignId, status });
        await refreshRemoteState();
        await refreshAuditLogs();
        setLastAction(`活动状态已更新：${response.campaignId} -> ${response.status}`);
    };

    const onToggleAllianceWalletShared = async () => {
        if (!remoteToken || !allianceConfig) return;
        const response = await MerchantApi.setAllianceConfig(remoteToken, {
            clusterId: allianceConfig.clusterId,
            stores: allianceConfig.stores,
            walletShared: !allianceConfig.walletShared,
            tierShared: allianceConfig.tierShared,
        });
        setAllianceConfig(response);
        await refreshAuditLogs();
        setLastAction(`连锁钱包互通已${response.walletShared ? '开启' : '关闭'}`);
    };

    const onSyncAllianceUser = async () => {
        if (!remoteToken) return;
        const targetUserId = customerUserId.trim();
        if (!targetUserId) { setLastAction('Please input customer user ID first'); return; }
        const response = await MerchantApi.syncAllianceUser(remoteToken, { userId: targetUserId });
        await refreshAllianceData(remoteToken);
        await refreshAuditLogs();
        setLastAction(`跨店用户同步完成：${response.syncedStores.join(', ')}`);
    };

    const onToggleKillSwitch = async () => {
        if (!remoteToken) return;
        const targetEnabled = !merchantState.killSwitchEnabled;
        await MerchantApi.setKillSwitch(remoteToken, targetEnabled);
        await refreshRemoteState();
        await refreshAuditLogs();
        setLastAction(targetEnabled ? '已开启预算熔断' : '已关闭预算熔断');
    };

    const onGenerateMerchantQr = () => {
        const storeId = qrStoreId.trim();
        if (!/^[a-zA-Z0-9_-]{2,64}$/.test(storeId)) { setLastAction('Store ID invalid'); return; }
        const scene = qrScene.trim();
        let payload = `https://mealquest.app/startup?id=${encodeURIComponent(storeId)}&action=pay`;
        if (scene) payload += `&scene=${encodeURIComponent(scene)}`;
        setQrPayload(payload);
        setLastAction(`QR generated for ${storeId}`);
    };

    const value = {
        merchantState, lastAction, setLastAction, realtimeEvents, visibleRealtimeEvents,
        expandedEventId, setExpandedEventId, showOnlyAnomaly, setShowOnlyAnomaly,
        auditLogs, expandedAuditId, setExpandedAuditId, auditCursor, auditHasMore, auditLoading,
        auditActionFilter, setAuditActionFilter, auditStatusFilter, setAuditStatusFilter,
        auditTimeRange, setAuditTimeRange, allianceConfig, allianceStores, customerUserId, setCustomerUserId,
        qrStoreId, setQrStoreId, qrScene, setQrScene, qrPayload, aiIntentDraft, setAiIntentDraft,
        aiIntentSubmitting, strategyChatMessages, strategyChatPendingReview,
        pendingReviewCount, totalReviewCount, currentReviewIndex, contractStatus, setContractStatus,
        onCopyEventDetail, onCreateIntentProposal, onReviewPendingStrategy, onCreateFireSale,
        onSetCampaignStatus, onToggleAllianceWalletShared, onSyncAllianceUser, onToggleKillSwitch,
        onGenerateMerchantQr, refreshAuditLogs, refreshRemoteState,
    };

    return <MerchantContext.Provider value={value}>{children}</MerchantContext.Provider>;
}

export function useMerchant() {
    const context = useContext(MerchantContext);
    if (context === undefined) {
        throw new Error('useMerchant must be used within a MerchantProvider');
    }
    return context;
}
