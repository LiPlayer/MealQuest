import React, { createContext, useContext, useMemo, useState } from 'react';
import { createInitialMerchantState, MerchantState } from '../domain/merchantEngine';
import {
  loginMerchantByPhone,
  requestMerchantPhoneCode,
  streamMerchantChat,
  type ChatStreamEvent,
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
  requestLoginCode: (phone: string) => Promise<void>;
  loginWithPhone: (params: { phone: string; code: string; merchantId: string }) => Promise<void>;
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

function createDemoMerchantState(): MerchantState {
  return {
    ...createInitialMerchantState(),
    merchantId: 'm_demo_001',
    merchantName: 'Demo Bistro',
    budgetCap: 1200,
    budgetUsed: 180,
    activePolicies: [
      {
        id: 'policy_demo_1',
        name: 'Welcome Gift',
        status: 'ACTIVE',
        triggerEvent: 'USER_ENTER_SHOP',
        condition: { field: 'isNewUser', equals: true },
        budget: { cap: 300, used: 60, costPerHit: 6 },
      },
    ],
  };
}

function extractText(data: unknown): string {
  if (!data || typeof data !== 'object') {
    return '';
  }
  const record = data as Record<string, unknown>;
  const assistant = record.assistant;
  if (assistant && typeof assistant === 'object') {
    const content = (assistant as Record<string, unknown>).content;
    if (typeof content === 'string') {
      return content;
    }
  }
  return '';
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
  const [merchantState, setMerchantState] = useState<MerchantState>(createDemoMerchantState);
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
  const [allianceStores] = useState([{ merchantId: 'm_demo_001', name: 'Demo Bistro' }]);
  const [customerUserId, setCustomerUserId] = useState('u_demo_001');
  const [qrStoreId, setQrStoreId] = useState('m_demo_001');
  const [qrScene, setQrScene] = useState('entry');
  const [qrPayload, setQrPayload] = useState('');
  const [aiIntentDraft, setAiIntentDraft] = useState('');
  const [aiIntentSubmitting, setAiIntentSubmitting] = useState(false);
  const [strategyChatMessages, setStrategyChatMessages] = useState<StrategyChatMessageWithStatus[]>([]);
  const [strategyChatPendingReview, setStrategyChatPendingReview] = useState<StrategyChatPendingReview | null>(null);
  const [strategyChatPendingReviews, setStrategyChatPendingReviews] = useState<StrategyChatPendingReview[]>([]);
  const [strategyChatReviewProgress] = useState<StrategyChatReviewProgress | null>(null);
  const [strategyChatEvaluation, setStrategyChatEvaluation] = useState<PolicyDecisionResult | null>(null);
  const [agentProgressEvents, setAgentProgressEvents] = useState<AgentProgressEvent[]>([]);
  const [contractStatus, setContractStatus] = useState<'LOADING' | 'NOT_SUBMITTED' | 'SUBMITTED'>('NOT_SUBMITTED');

  const isAuthenticated = Boolean(authSession && authSession.token && authSession.merchantId);
  const pendingReviewCount = strategyChatPendingReviews.length;
  const totalReviewCount = Math.max(pendingReviewCount, Number(strategyChatReviewProgress?.totalCandidates || 0));
  const reviewedReviewCount = Math.max(0, Number(strategyChatReviewProgress?.reviewedCandidates || 0));
  const currentReviewIndex = pendingReviewCount > 0 ? Math.min(totalReviewCount, reviewedReviewCount + 1) : 0;
  const strategyChatEvaluationReady = Boolean(strategyChatEvaluation);
  const activeAgentProgress = agentProgressEvents.length > 0 ? agentProgressEvents[agentProgressEvents.length - 1] : null;
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

  const loginWithPhone = async (params: { phone: string; code: string; merchantId: string }) => {
    const phone = String(params.phone || '').trim();
    const code = String(params.code || '').trim();
    const merchantId = String(params.merchantId || '').trim();
    if (!phone || !code || !merchantId) {
      throw new Error('phone, code and merchantId are required');
    }
    setAuthSubmitting(true);
    setAuthError('');
    try {
      const result = await loginMerchantByPhone({ phone, code, merchantId });
      const resolvedMerchantId = String(result.profile?.merchantId || merchantId).trim();
      if (!result.token || !resolvedMerchantId) {
        throw new Error('login response missing token or merchantId');
      }
      setAuthSession({
        token: result.token,
        merchantId: resolvedMerchantId,
        role: String(result.profile?.role || 'OWNER'),
        phone: String(result.profile?.phone || phone),
      });
      setMerchantState(prev => ({
        ...prev,
        merchantId: resolvedMerchantId,
      }));
      setQrStoreId(resolvedMerchantId);
      setLastAction(`Logged in as ${resolvedMerchantId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'login failed';
      setAuthError(message);
      throw error;
    } finally {
      setAuthSubmitting(false);
    }
  };

  const logout = () => {
    setAuthSession(null);
    setStrategyChatMessages([]);
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
    const now = Date.now();
    const userMessageId = `msg_user_${now}`;
    const assistantMessageId = `msg_ai_${now}`;
    setStrategyChatMessages(prev => [
      ...prev,
      {
        messageId: userMessageId,
        role: 'USER',
        type: 'TEXT',
        text: draft,
        deliveryStatus: 'sending',
      },
      {
        messageId: assistantMessageId,
        role: 'ASSISTANT',
        type: 'TEXT',
        text: '',
        isStreaming: true,
      },
    ]);

    let streamError = '';
    try {
      await streamMerchantChat({
        token: authSession.token,
        payload: {
          context: {
            merchantId: authSession.merchantId,
          },
          input: {
            messages: [
              {
                role: 'user',
                content: draft,
              },
            ],
          },
          streamMode: ['messages', 'updates'],
        },
        onEvent: (event: ChatStreamEvent) => {
          if (event.event === 'updates') {
            const progress = toProgress(event.data);
            if (progress) {
              setAgentProgressEvents(prev => [...prev.slice(-29), progress]);
            }
            return;
          }
          if (event.event === 'messages') {
            const assistantText = extractText(event.data);
            if (!assistantText) {
              return;
            }
            setStrategyChatMessages(prev =>
              prev.map(item =>
                item.messageId === assistantMessageId
                  ? { ...item, text: assistantText, isStreaming: true }
                  : item,
              ),
            );
            return;
          }
          if (event.event === 'error') {
            const data = event.data as { error?: { message?: string } };
            streamError =
              data && data.error && typeof data.error.message === 'string'
                ? data.error.message
                : 'chat stream failed';
          }
        },
      });

      if (streamError) {
        throw new Error(streamError);
      }

      setStrategyChatMessages(prev =>
        prev.map(item => {
          if (item.messageId === userMessageId && item.role === 'USER') {
            return { ...item, deliveryStatus: 'sent' };
          }
          if (item.messageId === assistantMessageId && item.role === 'ASSISTANT') {
            return { ...item, isStreaming: false };
          }
          return item;
        }),
      );
      setAiIntentDraft('');
      setLastAction('Chat response received.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'chat stream failed';
      setStrategyChatMessages(prev =>
        prev.map(item => {
          if (item.messageId === userMessageId && item.role === 'USER') {
            return { ...item, deliveryStatus: 'failed' };
          }
          if (item.messageId === assistantMessageId && item.role === 'ASSISTANT') {
            return {
              ...item,
              text: item.text || `Error: ${message}`,
              isStreaming: false,
            };
          }
          return item;
        }),
      );
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
    const storeId = String(qrStoreId || merchantState.merchantId || 'm_demo_001').trim();
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
    requestLoginCode,
    loginWithPhone,
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
    aiIntentSubmitting,
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
