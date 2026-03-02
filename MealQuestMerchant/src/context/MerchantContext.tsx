import React, { createContext, useContext, useMemo, useState } from 'react';
import { useStream } from '@langchain/langgraph-sdk/react';
import { createInitialMerchantState, MerchantState } from '../domain/merchantEngine';
import {
  completeMerchantOnboard,
  getApiBaseUrl,
  loginMerchantByPhone,
  requestMerchantPhoneCode,
} from '../services/apiClient';

export type MessageStatus = 'sending' | 'sent' | 'failed';

export type StrategyChatMessage = {
  messageId: string;
  role: 'USER' | 'ASSISTANT';
  type?: 'TEXT' | 'PROPOSAL_CARD';
  text: string;
  proposalId?: string | null;
  isStreaming?: boolean;
};

export type StrategyChatMessageWithStatus = StrategyChatMessage & {
  deliveryStatus?: MessageStatus;
};

export type StrategyChatPendingReview = {
  proposalId: string;
  title: string;
  templateId?: string;
  branchId?: string;
  evaluation?: {
    evaluatedAt?: string;
    evaluateError?: string;
    recommended?: boolean;
    rank?: number;
    score: number;
    expectedRevenue: number;
    estimatedCost: number;
    riskCount: number;
    rejectedCount: number;
    selectedCount?: number;
  };
};

export type StrategyChatReviewProgress = {
  totalCandidates: number;
  reviewedCandidates: number;
};

export type PolicyDecisionResult = {
  mode: string;
  selected: Array<Record<string, unknown>>;
  rejected: Array<Record<string, unknown>>;
};

export type AgentProgressEvent = {
  phase: string;
  status: string;
  tokenCount: number;
  elapsedMs: number;
  at: string;
  resultStatus?: string;
  error?: string;
};

export type RealtimeEventRow = {
  id: string;
  label: string;
  summary: string;
  detail: string;
  severity: 'info' | 'warn' | 'error';
  isAnomaly: boolean;
};

export type AuditLogRow = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  severity: 'info' | 'warn' | 'error';
};

export type AllianceConfig = {
  clusterId: string;
  walletShared: boolean;
};

export type MerchantAuthSession = {
  token: string;
  merchantId: string;
  role: string;
  phone: string;
};

export type PendingOnboardingSession = {
  phone: string;
  onboardingToken: string;
};

export type AuditActionFilter =
  | 'ALL'
  | 'PAYMENT_VERIFY'
  | 'PAYMENT_REFUND'
  | 'STRATEGY_CHAT_SESSION_CREATE'
  | 'STRATEGY_CHAT_MESSAGE'
  | 'STRATEGY_CHAT_REVIEW'
  | 'STRATEGY_CHAT_EVALUATE'
  | 'STRATEGY_CHAT_PUBLISH'
  | 'POLICY_DRAFT_CREATE'
  | 'POLICY_DRAFT_SUBMIT'
  | 'POLICY_DRAFT_APPROVE'
  | 'POLICY_PUBLISH'
  | 'POLICY_EVALUATE'
  | 'POLICY_EXECUTE'
  | 'SUPPLIER_VERIFY'
  | 'ALLIANCE_CONFIG_SET'
  | 'ALLIANCE_SYNC_USER'
  | 'KILL_SWITCH_SET';

export type AuditStatusFilter = 'ALL' | 'SUCCESS' | 'DENIED' | 'BLOCKED' | 'FAILED';
export type AuditTimeRange = '24H' | '7D' | 'ALL';

interface MerchantContextType {
  authSession: MerchantAuthSession | null;
  isAuthenticated: boolean;
  authSubmitting: boolean;
  authError: string;
  pendingOnboardingSession: PendingOnboardingSession | null;
  requestLoginCode: (phone: string) => Promise<void>;
  loginWithPhone: (params: { phone: string; code: string }) => Promise<void>;
  completeOnboarding: (params: { name: string }) => Promise<void>;
  clearPendingOnboardingSession: () => void;
  logout: () => void;
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
  strategyChatEvaluation: PolicyDecisionResult | null;
  strategyChatEvaluationReady: boolean;
  agentProgressEvents: AgentProgressEvent[];
  activeAgentProgress: AgentProgressEvent | null;
  pendingReviewCount: number;
  totalReviewCount: number;
  currentReviewIndex: number;
  contractStatus: 'LOADING' | 'NOT_SUBMITTED' | 'SUBMITTED';
  setContractStatus: (val: 'LOADING' | 'NOT_SUBMITTED' | 'SUBMITTED') => void;
  wsConnected: boolean;
  onCopyEventDetail: (detail: string) => Promise<void>;
  onTriggerProactiveScan: () => Promise<void>;
  onCreateIntentProposal: () => Promise<void>;
  onRetryMessage: (messageId: string) => Promise<void>;
  onEvaluatePendingStrategy: () => Promise<void>;
  onReviewPendingStrategy: (decision: 'APPROVE' | 'REJECT') => Promise<void>;
  onPublishApprovedProposal: (proposalId: string) => Promise<void>;
  onToggleAllianceWalletShared: () => Promise<void>;
  onSyncAllianceUser: () => Promise<void>;
  onToggleKillSwitch: () => Promise<void>;
  onGenerateMerchantQr: () => void;
  refreshAuditLogs: (_?: { append?: boolean; cursor?: string | null; forceReset?: boolean }) => Promise<void>;
  refreshRemoteState: (_?: { force?: boolean }) => Promise<void>;
}

const MerchantContext = createContext<MerchantContextType | undefined>(undefined);

const OFFICIAL_ASSISTANT_ID = 'merchant-agent';

function readMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    if (!content || typeof content !== 'object') {
      return '';
    }
    const record = content as Record<string, unknown>;
    if (typeof record.text === 'string') {
      return record.text;
    }
    if (typeof record.content === 'string') {
      return record.content;
    }
    if (typeof record.delta === 'string') {
      return record.delta;
    }
    if (typeof record.output_text === 'string') {
      return record.output_text;
    }
    return '';
  }
  return content
    .map(part => {
      if (typeof part === 'string') {
        return part;
      }
      if (!part || typeof part !== 'object') {
        return '';
      }
      const piece = part as Record<string, unknown>;
      if (typeof piece.text === 'string') {
        return piece.text;
      }
      if (typeof piece.content === 'string') {
        return piece.content;
      }
      if (typeof piece.delta === 'string') {
        return piece.delta;
      }
      if (typeof piece.output_text === 'string') {
        return piece.output_text;
      }
      return '';
    })
    .join('');
}

function mapMessageRole(message: Record<string, unknown>): 'USER' | 'ASSISTANT' | null {
  const rawType =
    (typeof message.type === 'string' && message.type) ||
    (typeof message.role === 'string' && message.role) ||
    '';
  const normalized = rawType.trim().toLowerCase();
  if (normalized === 'human' || normalized === 'user') {
    return 'USER';
  }
  if (normalized === 'ai' || normalized === 'assistant') {
    return 'ASSISTANT';
  }
  return null;
}

function toStrategyMessages(
  messages: unknown[],
  isLoading: boolean,
): StrategyChatMessageWithStatus[] {
  const mapped = messages
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const message = item as Record<string, unknown>;
      const role = mapMessageRole(message);
      if (!role) {
        return null;
      }
      return {
        messageId:
          (typeof message.id === 'string' && message.id) || `msg_${index}`,
        role,
        type: 'TEXT' as const,
        text: readMessageText(message.content),
        deliveryStatus: role === 'USER' ? ('sent' as const) : undefined,
        isStreaming: false,
      };
    })
    .filter(Boolean) as StrategyChatMessageWithStatus[];

  if (isLoading) {
    for (let idx = mapped.length - 1; idx >= 0; idx -= 1) {
      if (mapped[idx].role === 'ASSISTANT') {
        mapped[idx] = {
          ...mapped[idx],
          isStreaming: true,
        };
        break;
      }
    }
  }

  return mapped;
}

function assertUseStreamRuntimeSupport() {
  const hasReadableStream = typeof globalThis.ReadableStream === 'function';
  const hasTextDecoder = typeof globalThis.TextDecoder === 'function';
  if (!hasReadableStream || !hasTextDecoder) {
    throw new Error('Current RN runtime does not support official useStream requirements.');
  }
}

function toProgress(data: unknown): AgentProgressEvent | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const record = data as Record<string, unknown>;
  return {
    phase: typeof record.phase === 'string' ? record.phase : 'UNKNOWN',
    status: typeof record.status === 'string' ? record.status : 'running',
    tokenCount: Number(record.tokenCount) || 0,
    elapsedMs: Number(record.elapsedMs) || 0,
    at: typeof record.at === 'string' ? record.at : new Date().toISOString(),
    resultStatus: typeof record.resultStatus === 'string' ? record.resultStatus : undefined,
    error: typeof record.error === 'string' ? record.error : undefined,
  };
}

export function MerchantProvider({ children }: { children: React.ReactNode }) {
  const [authSession, setAuthSession] = useState<MerchantAuthSession | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [pendingOnboardingSession, setPendingOnboardingSession] = useState<PendingOnboardingSession | null>(null);
  const [merchantState, setMerchantState] = useState<MerchantState>(createInitialMerchantState);
  const [lastAction, setLastAction] = useState('Please login before entering chat.');
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEventRow[]>([
    {
      id: 'evt_1',
      label: 'System',
      summary: 'Auth-gated mode active',
      detail: '{"mode":"auth_gated"}',
      severity: 'info',
      isAnomaly: false,
    },
  ]);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [showOnlyAnomaly, setShowOnlyAnomaly] = useState(false);
  const [auditLogs] = useState<AuditLogRow[]>([
    {
      id: 'audit_1',
      title: 'System',
      summary: 'Waiting for backend actions',
      detail: 'Login then start chat to generate runtime records.',
      severity: 'info',
    },
  ]);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [auditActionFilter, setAuditActionFilter] = useState<AuditActionFilter>('ALL');
  const [auditStatusFilter, setAuditStatusFilter] = useState<AuditStatusFilter>('ALL');
  const [auditTimeRange, setAuditTimeRange] = useState<AuditTimeRange>('7D');
  const [allianceConfig, setAllianceConfig] = useState<AllianceConfig | null>({
    clusterId: 'demo-cluster',
    walletShared: false,
  });
  const [allianceStores, setAllianceStores] = useState<{ merchantId: string; name: string }[]>([]);
  const [customerUserId, setCustomerUserId] = useState('u_demo_001');
  const [qrStoreId, setQrStoreId] = useState('');
  const [qrScene, setQrScene] = useState('entry');
  const [qrPayload, setQrPayload] = useState('');
  const [aiIntentDraft, setAiIntentDraft] = useState('');
  const [aiIntentSubmitting, setAiIntentSubmitting] = useState(false);
  const [strategyThreadId, setStrategyThreadId] = useState<string | null>(null);
  const [strategyChatPendingReview, setStrategyChatPendingReview] = useState<StrategyChatPendingReview | null>(null);
  const [strategyChatPendingReviews, setStrategyChatPendingReviews] = useState<StrategyChatPendingReview[]>([]);
  const [strategyChatReviewProgress] = useState<StrategyChatReviewProgress | null>(null);
  const [strategyChatEvaluation, setStrategyChatEvaluation] = useState<PolicyDecisionResult | null>(null);
  const [agentProgressEvents, setAgentProgressEvents] = useState<AgentProgressEvent[]>([]);
  const [contractStatus, setContractStatus] = useState<'LOADING' | 'NOT_SUBMITTED' | 'SUBMITTED'>('NOT_SUBMITTED');
  const streamApiUrl = useMemo(() => `${getApiBaseUrl()}/api/langgraph`, []);
  const streamHeaders = useMemo(
    () => (authSession && authSession.token ? { Authorization: `Bearer ${authSession.token}` } : undefined),
    [authSession?.token],
  );
  const stream = useStream<{ messages: unknown[] }>({
    assistantId: OFFICIAL_ASSISTANT_ID,
    apiUrl: streamApiUrl,
    threadId: strategyThreadId,
    onThreadId: setStrategyThreadId,
    defaultHeaders: streamHeaders,
    fetchStateHistory: true,
    onCustomEvent: data => {
      const progress = toProgress(data);
      if (progress) {
        setAgentProgressEvents(prev => [...prev.slice(-29), progress]);
      }
    },
    onError: error => {
      const message = error instanceof Error ? error.message : 'chat stream failed';
      setLastAction(`Chat failed: ${message}`);
    },
  });
  const strategyChatMessages = useMemo(
    () => toStrategyMessages(Array.isArray(stream.messages) ? stream.messages : [], stream.isLoading),
    [stream.messages, stream.isLoading],
  );

  const isAuthenticated = Boolean(authSession && authSession.token && authSession.merchantId);
  const pendingReviewCount = strategyChatPendingReviews.length;
  const totalReviewCount = Math.max(pendingReviewCount, Number(strategyChatReviewProgress?.totalCandidates || 0));
  const reviewedReviewCount = Math.max(0, Number(strategyChatReviewProgress?.reviewedCandidates || 0));
  const currentReviewIndex = pendingReviewCount > 0 ? Math.min(totalReviewCount, reviewedReviewCount + 1) : 0;
  const strategyChatEvaluationReady = Boolean(strategyChatEvaluation);
  const activeAgentProgress = agentProgressEvents.length > 0 ? agentProgressEvents[agentProgressEvents.length - 1] : null;
  const resolvedAiIntentSubmitting = aiIntentSubmitting || stream.isLoading;
  const visibleRealtimeEvents = useMemo(
    () => (showOnlyAnomaly ? realtimeEvents.filter(item => item.isAnomaly) : realtimeEvents),
    [realtimeEvents, showOnlyAnomaly],
  );

  const requestLoginCode = async (phone: string) => {
    const normalized = String(phone || '').trim();
    if (!normalized) {
      throw new Error('phone is required');
    }
    setAuthSubmitting(true);
    setAuthError('');
    try {
      await requestMerchantPhoneCode(normalized);
      setLastAction('Verification code requested. Check server log output.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'request code failed';
      setAuthError(message);
      throw error;
    } finally {
      setAuthSubmitting(false);
    }
  };

  const loginWithPhone = async (params: { phone: string; code: string }) => {
    const phone = String(params.phone || '').trim();
    const code = String(params.code || '').trim();
    if (!phone || !code) {
      throw new Error('phone and code are required');
    }
    setAuthSubmitting(true);
    setAuthError('');
    try {
      const result = await loginMerchantByPhone({
        phone,
        code,
      });
      if (result.status === 'ONBOARD_REQUIRED') {
        const onboardingToken = String(result.onboardingToken || '').trim();
        if (!onboardingToken) {
          throw new Error('onboarding token missing');
        }
        setAuthSession(null);
        setMerchantState(createInitialMerchantState());
        setAllianceStores([]);
        setQrStoreId('');
        setStrategyThreadId(null);
        setAgentProgressEvents([]);
        setStrategyChatEvaluation(null);
        setStrategyChatPendingReview(null);
        setStrategyChatPendingReviews([]);
        setPendingOnboardingSession({
          phone: String(result.profile?.phone || phone),
          onboardingToken,
        });
        setLastAction('Phone verified. Please complete store registration.');
        return;
      }
      const resolvedMerchantId = String(result.profile?.merchantId || '').trim();
      if (!result.token || !resolvedMerchantId) {
        throw new Error('login response invalid');
      }
      const resolvedMerchantName = String(result.merchant?.name || '').trim();
      setPendingOnboardingSession(null);
      setAuthSession({
        token: result.token,
        merchantId: resolvedMerchantId,
        role: String(result.profile?.role || 'OWNER'),
        phone: String(result.profile?.phone || phone),
      });
      setMerchantState(prev => ({
        ...prev,
        merchantId: resolvedMerchantId,
        merchantName: resolvedMerchantName || resolvedMerchantId,
      }));
      setAllianceStores([{ merchantId: resolvedMerchantId, name: resolvedMerchantName || resolvedMerchantId }]);
      setQrStoreId(resolvedMerchantId);
      setStrategyThreadId(null);
      setAgentProgressEvents([]);
      setStrategyChatEvaluation(null);
      setStrategyChatPendingReview(null);
      setStrategyChatPendingReviews([]);
      setLastAction(`Logged in as ${resolvedMerchantId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'login failed';
      setAuthError(message);
      throw error;
    } finally {
      setAuthSubmitting(false);
    }
  };

  const completeOnboarding = async (params: { name: string }) => {
    const merchantName = String(params.name || '').trim();
    if (!merchantName) {
      throw new Error('store name is required');
    }
    if (!pendingOnboardingSession || !pendingOnboardingSession.onboardingToken) {
      throw new Error('onboarding session missing');
    }
    setAuthSubmitting(true);
    setAuthError('');
    try {
      const result = await completeMerchantOnboard({
        onboardingToken: pendingOnboardingSession.onboardingToken,
        name: merchantName,
      });
      const resolvedMerchantId = String(result.profile?.merchantId || '').trim();
      if (!result.token || !resolvedMerchantId) {
        throw new Error('onboarding result invalid');
      }
      setAuthSession({
        token: result.token,
        merchantId: resolvedMerchantId,
        role: String(result.profile?.role || 'OWNER'),
        phone: String(result.profile?.phone || pendingOnboardingSession.phone),
      });
      setMerchantState(prev => ({
        ...prev,
        merchantId: resolvedMerchantId,
        merchantName: String(result.merchant?.name || merchantName),
      }));
      setAllianceStores([
        {
          merchantId: resolvedMerchantId,
          name: String(result.merchant?.name || merchantName),
        },
      ]);
      setQrStoreId(resolvedMerchantId);
      setStrategyThreadId(null);
      setAgentProgressEvents([]);
      setStrategyChatEvaluation(null);
      setStrategyChatPendingReview(null);
      setStrategyChatPendingReviews([]);
      setPendingOnboardingSession(null);
      setLastAction(`Store ${resolvedMerchantId} created.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'onboarding failed';
      setAuthError(message);
      throw error;
    } finally {
      setAuthSubmitting(false);
    }
  };

  const clearPendingOnboardingSession = () => {
    setPendingOnboardingSession(null);
  };

  const logout = () => {
    void stream.stop();
    setAuthSession(null);
    setPendingOnboardingSession(null);
    setMerchantState(createInitialMerchantState());
    setAllianceStores([]);
    setQrStoreId('');
    setStrategyThreadId(null);
    setAgentProgressEvents([]);
    setStrategyChatPendingReview(null);
    setStrategyChatPendingReviews([]);
    setStrategyChatEvaluation(null);
    setLastAction('Logged out.');
  };

  const onCopyEventDetail = async (_detail: string) => {
    setLastAction('Copy action triggered.');
  };

  const onTriggerProactiveScan = async () => {
    setAgentProgressEvents([
      {
        phase: 'scan',
        status: 'completed',
        tokenCount: 0,
        elapsedMs: 10,
        at: new Date().toISOString(),
      },
    ]);
    setLastAction('Proactive scan simulated.');
  };

  const onCreateIntentProposal = async () => {
    const draft = String(aiIntentDraft || '').trim();
    if (!draft) {
      setLastAction('Please input your intent first.');
      return;
    }
    if (!authSession) {
      setLastAction('Please login first.');
      return;
    }

    setAiIntentSubmitting(true);
    setStrategyChatPendingReview(null);
    setStrategyChatPendingReviews([]);
    setStrategyChatEvaluation(null);
    setAgentProgressEvents([]);
    try {
      assertUseStreamRuntimeSupport();
      await stream.submit(
        {
          messages: [
            {
              type: 'human',
              content: draft,
            },
          ],
        },
        {
          context: {
            merchantId: authSession.merchantId,
          },
          config: {
            configurable: {
              merchantId: authSession.merchantId,
            },
          },
          metadata: {
            merchantId: authSession.merchantId,
            source: 'merchant-app',
          },
          multitaskStrategy: 'interrupt',
          streamMode: ['messages-tuple', 'values', 'updates', 'custom'],
        },
      );
      setAiIntentDraft('');
      setLastAction('Chat response received.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'chat stream failed';
      setLastAction(`Chat failed: ${message}`);
    } finally {
      setAiIntentSubmitting(false);
    }
  };

  const onRetryMessage = async (messageId: string) => {
    const target = strategyChatMessages.find(item => item.messageId === messageId && item.role === 'USER');
    if (!target || !target.text) {
      setLastAction('No retry target found.');
      return;
    }
    setAiIntentDraft(target.text);
    setLastAction('Retry message loaded into input box.');
  };

  const onEvaluatePendingStrategy = async () => {
    setLastAction('No pending proposal in text-only mode.');
  };

  const onReviewPendingStrategy = async (_decision: 'APPROVE' | 'REJECT') => {
    setLastAction('No pending proposal in text-only mode.');
  };

  const onPublishApprovedProposal = async (_proposalId: string) => {
    setLastAction('Publish is disabled in text-only mode.');
  };

  const onToggleAllianceWalletShared = async () => {
    setAllianceConfig(prev => (prev ? { ...prev, walletShared: !prev.walletShared } : prev));
    setLastAction('Alliance wallet switch toggled locally.');
  };

  const onSyncAllianceUser = async () => {
    setLastAction(`Alliance sync simulated for user ${customerUserId || '(empty)'}.`);
  };

  const onToggleKillSwitch = async () => {
    setMerchantState(prev => ({ ...prev, killSwitchEnabled: !prev.killSwitchEnabled }));
    setLastAction('Kill switch toggled locally.');
  };

  const onGenerateMerchantQr = () => {
    const storeId = String(qrStoreId || merchantState.merchantId || '').trim();
    if (!storeId) {
      setLastAction('Store ID is required to generate QR.');
      return;
    }
    const scene = String(qrScene || 'entry').trim();
    const payload = `mealquest://merchant/pay?storeId=${encodeURIComponent(storeId)}&scene=${encodeURIComponent(scene)}`;
    setQrPayload(payload);
    setLastAction('Merchant QR generated locally.');
  };

  const refreshAuditLogs = async () => {
    setLastAction('Audit refresh simulated.');
  };

  const refreshRemoteState = async () => {
    setLastAction('Remote state refresh not implemented in this build.');
  };

  const contextValue: MerchantContextType = {
    authSession,
    isAuthenticated,
    authSubmitting,
    authError,
    pendingOnboardingSession,
    requestLoginCode,
    loginWithPhone,
    completeOnboarding,
    clearPendingOnboardingSession,
    logout,
    merchantState,
    lastAction,
    setLastAction,
    realtimeEvents,
    visibleRealtimeEvents,
    expandedEventId,
    setExpandedEventId,
    showOnlyAnomaly,
    setShowOnlyAnomaly,
    auditLogs,
    expandedAuditId,
    setExpandedAuditId,
    auditCursor: null,
    auditHasMore: false,
    auditLoading: false,
    auditActionFilter,
    setAuditActionFilter,
    auditStatusFilter,
    setAuditStatusFilter,
    auditTimeRange,
    setAuditTimeRange,
    allianceConfig,
    allianceStores,
    customerUserId,
    setCustomerUserId,
    qrStoreId,
    setQrStoreId,
    qrScene,
    setQrScene,
    qrPayload,
    aiIntentDraft,
    setAiIntentDraft,
    aiIntentSubmitting: resolvedAiIntentSubmitting,
    strategyChatMessages,
    strategyChatPendingReview,
    strategyChatEvaluation,
    strategyChatEvaluationReady,
    agentProgressEvents,
    activeAgentProgress,
    pendingReviewCount,
    totalReviewCount,
    currentReviewIndex,
    contractStatus,
    setContractStatus,
    wsConnected: false,
    onCopyEventDetail,
    onTriggerProactiveScan,
    onCreateIntentProposal,
    onRetryMessage,
    onEvaluatePendingStrategy,
    onReviewPendingStrategy,
    onPublishApprovedProposal,
    onToggleAllianceWalletShared,
    onSyncAllianceUser,
    onToggleKillSwitch,
    onGenerateMerchantQr,
    refreshAuditLogs,
    refreshRemoteState,
  };

  return <MerchantContext.Provider value={contextValue}>{children}</MerchantContext.Provider>;
}

export function useMerchant() {
  const context = useContext(MerchantContext);
  if (!context) {
    throw new Error('useMerchant must be used within MerchantProvider');
  }
  return context;
}
