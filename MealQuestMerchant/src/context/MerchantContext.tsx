import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MerchantApi } from '../services/merchantApi';
import {
    AuditLogRow,
    buildAuditLogRow,
} from '../services/auditLogViewModel';
import { createRealtimeClient, RealtimeClient } from '../services/merchantRealtime';
import {
    buildRealtimeEventRow,
    buildSystemEventRow,
    RealtimeEventRow,
} from '../services/realtimeEventViewModel';
import {
    AllianceConfig,
    PolicyDecisionResult,
    StrategyChatMessage,
    StrategyChatPendingReview,
    StrategyChatReviewProgress,
    StrategyChatReviewResult,
    StrategyChatSessionResult,
} from '../services/merchantApi/types';
import { createInitialMerchantState, MerchantState } from '../domain/merchantEngine';

export type MessageStatus = 'sending' | 'sent' | 'failed';
export type StrategyChatMessageWithStatus = StrategyChatMessage & {
    deliveryStatus?: MessageStatus;
};

export type AuditActionFilter =
    | 'ALL'
    | 'PAYMENT_VERIFY'
    | 'PAYMENT_REFUND'
    | 'PRIVACY_CANCEL'
    | 'STRATEGY_CHAT_SESSION_CREATE'
    | 'STRATEGY_CHAT_MESSAGE'
    | 'STRATEGY_CHAT_REVIEW'
    | 'STRATEGY_CHAT_SIMULATE'
    | 'STRATEGY_CHAT_PUBLISH'
    | 'POLICY_DRAFT_CREATE'
    | 'POLICY_DRAFT_SUBMIT'
    | 'POLICY_DRAFT_APPROVE'
    | 'POLICY_PUBLISH'
    | 'POLICY_SIMULATE'
    | 'POLICY_EXECUTE'
    | 'SUPPLIER_VERIFY'
    | 'ALLIANCE_CONFIG_SET'
    | 'ALLIANCE_SYNC_USER'
    | 'KILL_SWITCH_SET'
    ;
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
    strategyChatMessages: StrategyChatMessageWithStatus[];
    strategyChatPendingReview: StrategyChatPendingReview | null;
    strategyChatSimulation: PolicyDecisionResult | null;
    pendingReviewCount: number;
    totalReviewCount: number;
    currentReviewIndex: number;
    contractStatus: 'LOADING' | 'NOT_SUBMITTED' | 'SUBMITTED';
    setContractStatus: (val: 'LOADING' | 'NOT_SUBMITTED' | 'SUBMITTED') => void;
    wsConnected: boolean;

    // Handlers
    onCopyEventDetail: (detail: string) => Promise<void>;
    onTriggerProactiveScan: () => Promise<void>;
    onCreateIntentProposal: () => Promise<void>;
    onRetryMessage: (messageId: string) => Promise<void>;
    onSimulatePendingStrategy: () => Promise<void>;
    onReviewPendingStrategy: (decision: 'APPROVE' | 'REJECT') => Promise<void>;
    onPublishApprovedProposal: (proposalId: string) => Promise<void>;
    onToggleAllianceWalletShared: () => Promise<void>;
    onSyncAllianceUser: () => Promise<void>;
    onToggleKillSwitch: () => Promise<void>;
    onGenerateMerchantQr: () => void;
    refreshAuditLogs: (options?: { append?: boolean; cursor?: string | null; forceReset?: boolean }) => Promise<void>;
    refreshRemoteState: (options?: { force?: boolean }) => Promise<void>;
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
    const stateRefreshInFlightRef = useRef<Promise<void> | null>(null);
    const lastStateRefreshAtRef = useRef(0);
    const auditRefreshInFlightRef = useRef<Promise<void> | null>(null);
    const lastAuditRefreshAtRef = useRef(0);

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
    const [strategyChatMessages, setStrategyChatMessages] = useState<StrategyChatMessageWithStatus[]>([]);
    const [strategyChatPendingReview, setStrategyChatPendingReview] = useState<StrategyChatPendingReview | null>(null);
    const [strategyChatPendingReviews, setStrategyChatPendingReviews] = useState<StrategyChatPendingReview[]>([]);
    const [strategyChatReviewProgress, setStrategyChatReviewProgress] = useState<StrategyChatReviewProgress | null>(null);
    const [strategyChatSimulation, setStrategyChatSimulation] = useState<PolicyDecisionResult | null>(null);

    const [contractStatus, setContractStatus] = useState<'LOADING' | 'NOT_SUBMITTED' | 'SUBMITTED'>('LOADING');
    const [wsConnected, setWsConnected] = useState(false);
    const realtimeClientRef = useRef<RealtimeClient | null>(null);

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

    const refreshRemoteState = async (options: { force?: boolean } = {}) => {
        if (!remoteToken) return;
        if (stateRefreshInFlightRef.current) {
            await stateRefreshInFlightRef.current;
            return;
        }
        const force = Boolean(options.force);
        if (!force && Date.now() - lastStateRefreshAtRef.current < 800) {
            return;
        }
        const task = (async () => {
            const remoteState = await MerchantApi.getState(remoteToken);
            setMerchantState(remoteState);
            lastStateRefreshAtRef.current = Date.now();
        })();
        stateRefreshInFlightRef.current = task;
        try {
            await task;
        } finally {
            if (stateRefreshInFlightRef.current === task) {
                stateRefreshInFlightRef.current = null;
            }
        }
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
        setStrategyChatSimulation(null);
    };

    const applyStrategyChatDelta = (delta: StrategyChatDelta) => {
        const pendingReviews = Array.isArray(delta.pendingReviews)
            ? delta.pendingReviews
            : delta.pendingReview ? [delta.pendingReview] : [];
        if (delta.sessionId) setStrategyChatSessionId(String(delta.sessionId).trim());
        if (pendingReviews.length > 0 || delta.pendingReview !== undefined) {
            setStrategyChatPendingReviews(pendingReviews);
            setStrategyChatPendingReview(delta.pendingReview || pendingReviews[0] || null);
            setStrategyChatSimulation(null);
        }
        if (delta.reviewProgress !== undefined) setStrategyChatReviewProgress(delta.reviewProgress || null);

        // full replace (snapshot)
        if (Array.isArray(delta.messages)) {
            setStrategyChatMessages(prev => {
                const finalById = new Map(delta.messages!.map(m => [m.messageId, m]));
                const streamingKept = prev.filter(m => m.isStreaming && !finalById.has(m.messageId));
                const messages = [...delta.messages!, ...streamingKept];
                return messages.map(m => ({ ...m, deliveryStatus: 'sent' }));
            });
            return;
        }
        const incoming = Array.isArray(delta.deltaMessages) ? delta.deltaMessages : [];
        if (incoming.length === 0) return;

        setStrategyChatMessages(prev => {
            let merged = prev.slice();
            const incomingRoles = new Set(incoming.map(m => m.role));

            // Remove optimistic placeholders as soon as a real message of that role arrives
            if (incomingRoles.has('ASSISTANT')) {
                merged = merged.filter(m => !m.messageId.startsWith('opt_ai_'));
            }
            if (incomingRoles.has('USER')) {
                merged = merged.filter(m => !m.messageId.startsWith('opt_user_'));
            }

            const indexById = new Map(merged.map((item, index) => [item.messageId, index]));
            for (const item of incoming) {
                const existing = indexById.get(item.messageId);
                if (existing === undefined) {
                    indexById.set(item.messageId, merged.length);
                    merged.push({ ...item, deliveryStatus: 'sent' });
                } else {
                    // When the final non-streaming message lands, clear isStreaming
                    merged[existing] = { ...merged[existing], ...item, deliveryStatus: 'sent' };
                }
            }
            return merged;
        });
    };

    const ensureStrategyChatSession = async (): Promise<string> => {
        const merchantId = String((MerchantApi.getMerchantId() || merchantState.merchantId) || '').trim();
        const sid = `sc_${merchantId}`;
        setStrategyChatSessionId(sid);
        return sid;
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
        if (auditRefreshInFlightRef.current) {
            await auditRefreshInFlightRef.current;
            return;
        }
        if (!append && !options.forceReset && Date.now() - lastAuditRefreshAtRef.current < 500) {
            return;
        }
        const cursor = append ? options.cursor ?? auditCursor : null;
        const startTime = buildAuditStartTime(auditTimeRange);
        const task = (async () => {
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
                lastAuditRefreshAtRef.current = Date.now();
            } catch {
                if (!append) {
                    setAuditLogs([]);
                    setAuditCursor(null);
                    setAuditHasMore(false);
                }
            } finally {
                setAuditLoading(false);
            }
        })();
        auditRefreshInFlightRef.current = task;
        try {
            await task;
        } finally {
            if (auditRefreshInFlightRef.current === task) {
                auditRefreshInFlightRef.current = null;
            }
        }
    };

    const isTokenExpiredError = (err: any) => {
        const msg = String(err?.message || '').toLowerCase();
        return msg.includes('token') && (msg.includes('expired') || msg.includes('invalid'));
    };

    useEffect(() => {
        let active = true;
        let realtimeClientInstance: RealtimeClient | null = null;
        const bootstrapRemote = async () => {
            if (!MerchantApi.isConfigured() || !remoteToken) {
                return;
            }
            try {
                setLastAction('已连接服务端驾驶舱');
                if (!initialMerchantState) await refreshRemoteState({ force: true });
                const wsUrl = MerchantApi.getWsUrl(remoteToken);

                if (wsUrl) {
                    realtimeClientInstance = createRealtimeClient({
                        wsUrl,
                        onConnect: () => {
                            if (!active) return;
                            setWsConnected(true);
                        },
                        onClose: () => {
                            if (!active) return;
                            setWsConnected(false);
                        },
                        onMessage: message => {
                            if (!active) return;
                            if (message.type === 'STRATEGY_CHAT_DELTA') {
                                const delta = message.payload as StrategyChatDelta;
                                console.log(`[MerchantContext] RECEIVED DELTA: msgs=${delta.deltaMessages?.length || delta.messages?.length || 0}, pendingReview=${Boolean(delta.pendingReview)}`);
                                applyStrategyChatDelta(delta);
                                return;
                            }
                            appendRealtimeEvent(buildRealtimeEventRow(message));
                            setLastAction(`实时事件：${message.type}`);
                            refreshRemoteState().catch(() => { });
                        },
                        onError: () => {
                            if (!active) return;
                            setWsConnected(false);
                        },
                    });
                    realtimeClientRef.current = realtimeClientInstance;
                }
            } catch (err) {
                if (!active) return;
                if (isTokenExpiredError(err)) { onAuthExpired(); return; }
                setLastAction('远程会话失效，请重新登录');
            }
        };
        bootstrapRemote().catch(() => { });
        return () => { active = false; realtimeClientInstance?.close(); realtimeClientRef.current = null; };
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
        setStrategyChatSimulation(null);

        // Static session initialization (local only, no HTTP)
        const merchantId = MerchantApi.getMerchantId();
        if (merchantId) {
            setStrategyChatSessionId(`sc_${merchantId}`);
        }

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
        if (!wsConnected || !realtimeClientRef.current) { setLastAction('实时连接已断开'); return; }
        const intent = aiIntentDraft.trim();
        if (intent.length < 4) { setLastAction('请输入更具体的经营需求（至少4个字）'); return; }
        if (strategyChatPendingReviews.length > 0) { setLastAction('存在待审核策略，请先确认或拒绝'); return; }

        setAiIntentSubmitting(true);
        const optimisticUserMsgId = `opt_user_${Date.now()}`;
        const optimisticAiMsgId = `opt_ai_${Date.now()}`;

        setStrategyChatMessages(prev => [
            ...prev,
            {
                messageId: optimisticUserMsgId,
                role: 'USER',
                type: 'TEXT',
                text: intent,
                isStreaming: false,
                deliveryStatus: 'sending'
            } as any,
            {
                messageId: optimisticAiMsgId,
                role: 'ASSISTANT',
                type: 'TEXT',
                text: '',
                isStreaming: true
            } as any,
        ]);
        setAiIntentDraft('');

        try {
            await ensureStrategyChatSession();
            realtimeClientRef.current.send({
                type: 'STRATEGY_CHAT_SEND_MESSAGE',
                merchantId: MerchantApi.getMerchantId(),
                payload: { content: intent },
                timestamp: new Date().toISOString()
            });

            // Status tracking timeout
            setTimeout(() => {
                setStrategyChatMessages(prev => {
                    const msg = prev.find(m => m.messageId === optimisticUserMsgId);
                    if (msg && msg.deliveryStatus === 'sending') {
                        return prev.map(m => m.messageId === optimisticUserMsgId ? { ...m, deliveryStatus: 'failed' } : m);
                    }
                    return prev;
                });
            }, 8000);

        } catch (err: any) {
            setStrategyChatMessages(prev => prev.map(m => m.messageId === optimisticUserMsgId ? { ...m, deliveryStatus: 'failed' } : m));
            setLastAction(`AI request failed: ${err?.message || 'failed'}`);
        } finally {
            setAiIntentSubmitting(false);
        }
    };

    const onRetryMessage = async (messageId: string) => {
        const msg = strategyChatMessages.find(m => m.messageId === messageId);
        if (!msg || msg.role !== 'USER') return;

        if (!wsConnected || !realtimeClientRef.current) { setLastAction('实时连接已断开'); return; }

        setStrategyChatMessages(prev => prev.map(m => m.messageId === messageId ? { ...m, deliveryStatus: 'sending' } : m));

        try {
            realtimeClientRef.current.send({
                type: 'STRATEGY_CHAT_SEND_MESSAGE',
                merchantId: MerchantApi.getMerchantId(),
                payload: { content: msg.text },
                timestamp: new Date().toISOString()
            });

            setTimeout(() => {
                setStrategyChatMessages(prev => {
                    const current = prev.find(m => m.messageId === messageId);
                    if (current && current.deliveryStatus === 'sending') {
                        return prev.map(m => m.messageId === messageId ? { ...m, deliveryStatus: 'failed' } : m);
                    }
                    return prev;
                });
            }, 8000);
        } catch {
            setStrategyChatMessages(prev => prev.map(m => m.messageId === messageId ? { ...m, deliveryStatus: 'failed' } : m));
        }
    };

    const onSimulatePendingStrategy = async () => {
        if (!remoteToken || !strategyChatPendingReview?.proposalId) {
            setLastAction('No pending proposal to simulate');
            return;
        }
        const currentPending = strategyChatPendingReview;
        const chosenEvent = String(currentPending.triggerEvent || 'APP_OPEN').trim().toUpperCase() || 'APP_OPEN';
        const chosenUserId = customerUserId.trim();
        try {
            const result = await MerchantApi.simulateStrategyChatProposal(remoteToken, {
                proposalId: currentPending.proposalId,
                event: chosenEvent,
                eventId: `evt_sim_${Date.now()}`,
                userId: chosenUserId || undefined,
                context: {
                    source: 'MERCHANT_REVIEW_SIMULATE',
                    proposalId: currentPending.proposalId,
                },
            });
            const simulation = result.simulation;
            setStrategyChatSimulation(simulation);
            const selected = Array.isArray(simulation.selected) ? simulation.selected.length : 0;
            const rejected = Array.isArray(simulation.rejected) ? simulation.rejected.length : 0;
            setLastAction(
                `Simulation ready: selected ${selected}, rejected ${rejected}${chosenUserId ? `, user ${chosenUserId}` : ''}`,
            );
            await refreshAuditLogs();
        } catch (error: any) {
            setLastAction(`Simulation failed: ${error?.message || 'unknown error'}`);
        }
    };

    const onTriggerProactiveScan = async () => {
        if (!remoteToken) { setLastAction('Connection not ready'); return; }
        if (!wsConnected || !realtimeClientRef.current) { setLastAction('Realtime channel disconnected'); return; }
        if (strategyChatPendingReviews.length > 0) { setLastAction('Please finish pending reviews first'); return; }
        const activeCount = merchantState.activePolicies.filter(item => (item.status || 'ACTIVE') === 'ACTIVE').length;
        const budgetUsage = Math.round((merchantState.budgetUsed / Math.max(merchantState.budgetCap, 1)) * 100);
        const proactiveIntent = [
            '主动巡检：请基于以下经营信号自动提案。',
            `预算使用率=${budgetUsage}%`,
            `进行中活动=${activeCount}`,
            `熔断状态=${merchantState.killSwitchEnabled ? 'ON' : 'OFF'}`,
            '如果无需提案请明确说明原因；如需提案请输出可审核策略。',
        ].join('；');

        const optimisticUserMsgId = `opt_user_${Date.now()}`;
        const optimisticAiMsgId = `opt_ai_${Date.now()}`;
        setStrategyChatMessages(prev => [
            ...prev,
            {
                messageId: optimisticUserMsgId,
                role: 'USER',
                type: 'TEXT',
                text: proactiveIntent,
                isStreaming: false,
                deliveryStatus: 'sending'
            } as any,
            {
                messageId: optimisticAiMsgId,
                role: 'ASSISTANT',
                type: 'TEXT',
                text: '',
                isStreaming: true
            } as any,
        ]);
        try {
            await ensureStrategyChatSession();
            realtimeClientRef.current.send({
                type: 'STRATEGY_CHAT_SEND_MESSAGE',
                merchantId: MerchantApi.getMerchantId(),
                payload: { content: proactiveIntent },
                timestamp: new Date().toISOString()
            });
            setLastAction('AI proactive scan triggered');
        } catch (error: any) {
            setStrategyChatMessages(prev => prev.map(m => m.messageId === optimisticUserMsgId ? { ...m, deliveryStatus: 'failed' } : m));
            setLastAction(`AI proactive scan failed: ${error?.message || 'failed'}`);
        }
    };

    const onReviewPendingStrategy = async (decision: 'APPROVE' | 'REJECT') => {
        if (!remoteToken || !strategyChatPendingReview?.proposalId) { setLastAction('No pending proposal to review'); return; }
        if (decision === 'APPROVE' && !strategyChatSimulation) {
            setLastAction('Please run simulation before approve');
            return;
        }
        try {
            const currentPending = strategyChatPendingReview;
            const result = await MerchantApi.reviewStrategyChatProposal(remoteToken, {
                proposalId: currentPending.proposalId,
                decision,
            });
            applyStrategyChatDelta(result);
            if (decision === 'APPROVE' && result.status === 'APPROVED') {
                setStrategyChatSimulation(null);
                setLastAction('Proposal approved. Publish it to activate.');
            } else if (result.status === 'REJECTED') {
                setStrategyChatSimulation(null);
                setLastAction('Proposal rejected');
            }
            await refreshRemoteState({ force: true });
            await refreshAuditLogs();
        } catch {
            setLastAction('Proposal review failed, please retry');
        }
    };

    const onPublishApprovedProposal = async (proposalId: string) => {
        if (!remoteToken) return;
        const target = String(proposalId || '').trim();
        if (!target) {
            setLastAction('Proposal ID is required');
            return;
        }
        try {
            const result = await MerchantApi.publishStrategyChatProposal(remoteToken, {
                proposalId: target,
            });
            await refreshRemoteState({ force: true });
            await refreshAuditLogs();
            setLastAction(`Policy published: ${result.policyId}`);
        } catch (error: any) {
            setLastAction(`Publish failed: ${error?.message || 'unknown error'}`);
        }
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
        await refreshRemoteState({ force: true });
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
        aiIntentSubmitting, strategyChatMessages, strategyChatPendingReview, strategyChatSimulation,
        pendingReviewCount, totalReviewCount, currentReviewIndex, contractStatus, setContractStatus,
        wsConnected,
        onCopyEventDetail, onTriggerProactiveScan, onCreateIntentProposal, onRetryMessage, onSimulatePendingStrategy, onReviewPendingStrategy, onPublishApprovedProposal,
        onToggleAllianceWalletShared, onSyncAllianceUser, onToggleKillSwitch,
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
