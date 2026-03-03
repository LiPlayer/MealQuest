import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetch as expoFetch } from 'expo/fetch';
import { useStream } from '@langchain/langgraph-sdk/react';
import type { StreamMode } from '@langchain/langgraph-sdk';
import { createInitialMerchantState, MerchantState } from '../domain/merchantEngine';
import {
  completeMerchantOnboard,
  getMerchantStores,
  getApiBaseUrl,
  loginMerchantByPhone,
  requestMerchantPhoneCode,
} from '../services/apiClient';
import {
  clearMerchantAuthSession,
  loadMerchantAuthSession,
  saveMerchantAuthSession,
} from '../services/authSessionStorage';

export type MessageStatus = 'sending' | 'sent' | 'failed';
export type ChatSendPhase = 'idle' | 'submitting' | 'failed';

export type PendingOutgoingMessage = {
  messageId: string;
  text: string;
  deliveryStatus: MessageStatus;
  createdAt: string;
};

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
  selected: Record<string, unknown>[];
  rejected: Record<string, unknown>[];
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
  authHydrating: boolean;
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
  chatSendPhase: ChatSendPhase;
  chatSendError: string;
  pendingOutgoingMessages: PendingOutgoingMessage[];
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
const OFFICIAL_STREAM_MODES: StreamMode[] = ['messages-tuple', 'values', 'updates', 'custom'];

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
  if (
    normalized === 'human' ||
    normalized === 'user' ||
    normalized === 'humanmessagechunk' ||
    normalized === 'humanmessage'
  ) {
    return 'USER';
  }
  if (
    normalized === 'ai' ||
    normalized === 'assistant' ||
    normalized === 'aimessagechunk' ||
    normalized === 'aimessage'
  ) {
    return 'ASSISTANT';
  }
  return null;
}

function toStrategyMessages(
  messages: unknown[],
  isLoading: boolean,
  pendingOutgoingMessages: PendingOutgoingMessage[],
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

  const echoedUserTexts = new Set(
    mapped
      .filter(item => item.role === 'USER')
      .map(item => item.text.trim())
      .filter(Boolean),
  );
  const pending = pendingOutgoingMessages.map(item => ({
    messageId: item.messageId,
    role: 'USER' as const,
    type: 'TEXT' as const,
    text: item.text,
    deliveryStatus: item.deliveryStatus,
    isStreaming: false,
  }));
  for (const pendingItem of pending) {
    const normalized = pendingItem.text.trim();
    const isEchoed = Boolean(normalized && echoedUserTexts.has(normalized));
    if (isEchoed && pendingItem.deliveryStatus !== 'failed') {
      continue;
    }
    mapped.push(pendingItem);
  }

  return mapped;
}

function createLocalMessageId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function assertUseStreamRuntimeSupport() {
  const hasReadableStream = typeof globalThis.ReadableStream === 'function';
  const hasTransformStream = typeof globalThis.TransformStream === 'function';
  const hasTextDecoder = typeof globalThis.TextDecoder === 'function';
  if (!hasReadableStream || !hasTransformStream || !hasTextDecoder) {
    throw new Error('Current runtime does not support useStream streaming requirements.');
  }
}

function logMerchantStreamEvent(event: string, payload?: Record<string, unknown>) {
  if (!__DEV__) {
    return;
  }
  if (payload) {
    console.log(`[merchant-stream] ${event}`, payload);
    return;
  }
  console.log(`[merchant-stream] ${event}`);
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

function toPendingReview(data: unknown): StrategyChatPendingReview | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const record = data as Record<string, unknown>;
  const proposalId = typeof record.proposal_id === 'string' ? record.proposal_id.trim() : '';
  if (!proposalId) {
    return null;
  }
  return {
    proposalId,
    title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : 'Generated proposal',
    evaluation: {
      score: Number(record.score) || 0,
      expectedRevenue: 0,
      estimatedCost: 0,
      riskCount: Number(record.risk_count) || 0,
      rejectedCount: 0,
      selectedCount: 0,
    },
  };
}

function toPolicyDecision(data: unknown): PolicyDecisionResult | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const record = data as Record<string, unknown>;
  return {
    mode: typeof record.mode === 'string' ? record.mode : 'EVALUATE',
    selected: Array.isArray(record.selected) ? (record.selected as Record<string, unknown>[]) : [],
    rejected: Array.isArray(record.rejected) ? (record.rejected as Record<string, unknown>[]) : [],
  };
}

function toReviewProgress(data: unknown): StrategyChatReviewProgress | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const record = data as Record<string, unknown>;
  return {
    totalCandidates: Number(record.total) || 0,
    reviewedCandidates: Number(record.reviewed) || 0,
  };
}

function isPendingReviewEqual(
  left: StrategyChatPendingReview | null,
  right: StrategyChatPendingReview | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.proposalId === right.proposalId &&
    left.title === right.title &&
    Number(left.evaluation?.score || 0) === Number(right.evaluation?.score || 0) &&
    Number(left.evaluation?.riskCount || 0) === Number(right.evaluation?.riskCount || 0)
  );
}

function isPendingReviewListEqual(
  left: StrategyChatPendingReview[],
  right: StrategyChatPendingReview[],
): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  if (left.length === 0) {
    return true;
  }
  return left[0].proposalId === right[0].proposalId;
}

function readDecisionId(input: PolicyDecisionResult | null): string {
  if (!input) {
    return '';
  }
  const record = input as unknown as Record<string, unknown>;
  return typeof record.decision_id === 'string' ? record.decision_id : '';
}

function isPolicyDecisionEqual(
  left: PolicyDecisionResult | null,
  right: PolicyDecisionResult | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.mode === right.mode &&
    left.selected.length === right.selected.length &&
    left.rejected.length === right.rejected.length &&
    readDecisionId(left) === readDecisionId(right)
  );
}

function isReviewProgressEqual(
  left: StrategyChatReviewProgress | null,
  right: StrategyChatReviewProgress | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    Number(left.totalCandidates) === Number(right.totalCandidates) &&
    Number(left.reviewedCandidates) === Number(right.reviewedCandidates)
  );
}

export function MerchantProvider({ children }: { children: React.ReactNode }) {
  const [authSession, setAuthSession] = useState<MerchantAuthSession | null>(null);
  const [authHydrating, setAuthHydrating] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [pendingOnboardingSession, setPendingOnboardingSession] = useState<PendingOnboardingSession | null>(null);
  const [merchantState, setMerchantState] = useState<MerchantState>(createInitialMerchantState);
  const [lastAction, setLastAction] = useState('Please login before entering chat.');
  const [realtimeEvents] = useState<RealtimeEventRow[]>([
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
  const [chatSendPhase, setChatSendPhase] = useState<ChatSendPhase>('idle');
  const [chatSendError, setChatSendError] = useState('');
  const [pendingOutgoingMessages, setPendingOutgoingMessages] = useState<PendingOutgoingMessage[]>([]);
  const [strategyThreadId, setStrategyThreadId] = useState<string | null>(null);
  const [strategyChatPendingReview, setStrategyChatPendingReview] = useState<StrategyChatPendingReview | null>(null);
  const [strategyChatPendingReviews, setStrategyChatPendingReviews] = useState<StrategyChatPendingReview[]>([]);
  const [strategyChatReviewProgress, setStrategyChatReviewProgress] = useState<StrategyChatReviewProgress | null>(null);
  const [strategyChatEvaluation, setStrategyChatEvaluation] = useState<PolicyDecisionResult | null>(null);
  const [agentProgressEvents, setAgentProgressEvents] = useState<AgentProgressEvent[]>([]);
  const [contractStatus, setContractStatus] = useState<'LOADING' | 'NOT_SUBMITTED' | 'SUBMITTED'>('NOT_SUBMITTED');
  const streamApiUrl = useMemo(() => `${getApiBaseUrl()}/api/langgraph`, []);
  const authToken = authSession?.token;
  const streamHeaders = useMemo(
    () => (authToken ? { Authorization: `Bearer ${authToken}` } : undefined),
    [authToken],
  );
  const handleStreamError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : 'chat stream failed';
    setChatSendPhase('failed');
    setChatSendError(message);
    setLastAction(`Chat failed: ${message}`);
    logMerchantStreamEvent('onError', { message });
  }, []);
  const handleCustomStreamEvent = useCallback((data: unknown) => {
    const progress = toProgress(data);
    if (progress) {
      setAgentProgressEvents(prev => [...prev.slice(-29), progress]);
      logMerchantStreamEvent('custom_event', {
        phase: progress.phase,
        status: progress.status,
        tokenCount: progress.tokenCount,
      });
    }
  }, []);
  const handleUpdateStreamEvent = useCallback((data: unknown) => {
    if (!__DEV__) {
      return;
    }
    const updateKeys =
      data && typeof data === 'object' ? Object.keys(data as Record<string, unknown>).slice(0, 8) : [];
    logMerchantStreamEvent('update_event', {
      keys: updateKeys,
    });
  }, []);
  const stream = useStream<{ messages: unknown[] }>({
    assistantId: OFFICIAL_ASSISTANT_ID,
    apiUrl: streamApiUrl,
    messagesKey: 'messages',
    callerOptions: {
      fetch: expoFetch,
    },
    threadId: strategyThreadId,
    onThreadId: setStrategyThreadId,
    defaultHeaders: streamHeaders,
    fetchStateHistory: true,
    onCustomEvent: handleCustomStreamEvent,
    onUpdateEvent: handleUpdateStreamEvent,
    onError: handleStreamError,
  });
  const stopStreamRef = useRef(() => {});
  useEffect(() => {
    stopStreamRef.current = () => {
      void stream.stop();
    };
  }, [stream]);
  const streamValues = useMemo(
    () => (stream.values && typeof stream.values === 'object' ? (stream.values as Record<string, unknown>) : {}),
    [stream.values],
  );
  const streamMessages = useMemo(
    () => (Array.isArray(stream.messages) ? stream.messages : []),
    [stream.messages],
  );
  const streamPendingReviewRaw = streamValues.pending_review;
  const streamEvaluationRaw = streamValues.evaluation_result;
  const streamReviewProgressRaw = streamValues.review_progress;
  const streamIsLoading = stream.isLoading;
  const strategyChatMessages = useMemo(
    () =>
      toStrategyMessages(
        streamMessages,
        streamIsLoading,
        pendingOutgoingMessages,
      ),
    [pendingOutgoingMessages, streamIsLoading, streamMessages],
  );
  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const lastRaw = streamMessages.length > 0 ? streamMessages[streamMessages.length - 1] : null;
    const lastMessage =
      lastRaw && typeof lastRaw === 'object' ? (lastRaw as Record<string, unknown>) : null;
    const lastRole = lastMessage ? mapMessageRole(lastMessage) : null;
    const lastText = lastMessage ? readMessageText(lastMessage.content) : '';
    logMerchantStreamEvent('messages_snapshot', {
      count: streamMessages.length,
      isLoading: streamIsLoading,
      lastRole: lastRole || 'NONE',
      lastTextLength: lastText.length,
    });
  }, [streamMessages, streamIsLoading]);

  const isAuthenticated = Boolean(authSession && authSession.token && authSession.merchantId);
  const pendingReviewCount = strategyChatPendingReviews.length;
  const totalReviewCount = Math.max(pendingReviewCount, Number(strategyChatReviewProgress?.totalCandidates || 0));
  const reviewedReviewCount = Math.max(0, Number(strategyChatReviewProgress?.reviewedCandidates || 0));
  const currentReviewIndex = pendingReviewCount > 0 ? Math.min(totalReviewCount, reviewedReviewCount + 1) : 0;
  const strategyChatEvaluationReady = Boolean(strategyChatEvaluation);
  const activeAgentProgress = agentProgressEvents.length > 0 ? agentProgressEvents[agentProgressEvents.length - 1] : null;
  const resolvedAiIntentSubmitting = aiIntentSubmitting || streamIsLoading;
  const visibleRealtimeEvents = useMemo(
    () => (showOnlyAnomaly ? realtimeEvents.filter(item => item.isAnomaly) : realtimeEvents),
    [realtimeEvents, showOnlyAnomaly],
  );

  const resetSessionScopedState = useCallback(() => {
    setMerchantState(createInitialMerchantState());
    setAllianceStores([]);
    setQrStoreId('');
    setAiIntentDraft('');
    setStrategyThreadId(null);
    setAgentProgressEvents([]);
    setChatSendPhase('idle');
    setChatSendError('');
    setPendingOutgoingMessages([]);
    setStrategyChatPendingReview(null);
    setStrategyChatPendingReviews([]);
    setStrategyChatReviewProgress(null);
    setStrategyChatEvaluation(null);
  }, []);

  const applyAuthenticatedSession = useCallback(
    (session: MerchantAuthSession, merchantName: string, stores: { merchantId: string; name: string }[]) => {
      setPendingOnboardingSession(null);
      setAuthSession(session);
      setMerchantState(prev => ({
        ...prev,
        merchantId: session.merchantId,
        merchantName: merchantName || session.merchantId,
      }));
      setAllianceStores(stores.length > 0 ? stores : [{ merchantId: session.merchantId, name: merchantName }]);
      setQrStoreId(session.merchantId);
      setAiIntentDraft('');
      setStrategyThreadId(null);
      setAgentProgressEvents([]);
      setChatSendPhase('idle');
      setChatSendError('');
      setPendingOutgoingMessages([]);
      setStrategyChatPendingReview(null);
      setStrategyChatPendingReviews([]);
      setStrategyChatReviewProgress(null);
      setStrategyChatEvaluation(null);
    },
    [],
  );

  useEffect(() => {
    const streamUserTexts = new Set(
      streamMessages
        .map(item => (item && typeof item === 'object' ? (item as Record<string, unknown>) : null))
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .filter(item => mapMessageRole(item) === 'USER')
        .map(item => readMessageText(item.content).trim())
        .filter(Boolean),
    );
    if (!streamUserTexts.size) {
      return;
    }
    setPendingOutgoingMessages(prev => {
      const next = prev.filter(item => {
        if (item.deliveryStatus === 'failed') {
          return true;
        }
        const normalized = item.text.trim();
        if (!normalized) {
          return true;
        }
        return !streamUserTexts.has(normalized);
      });
      return next.length === prev.length ? prev : next;
    });
  }, [streamMessages]);

  useEffect(() => {
    const pending = toPendingReview(streamPendingReviewRaw);
    const evaluation = toPolicyDecision(streamEvaluationRaw);
    const reviewProgress = toReviewProgress(streamReviewProgressRaw);
    const pendingList = pending ? [pending] : [];
    setStrategyChatPendingReview(prev => (isPendingReviewEqual(prev, pending) ? prev : pending));
    setStrategyChatPendingReviews(prev => (isPendingReviewListEqual(prev, pendingList) ? prev : pendingList));
    setStrategyChatEvaluation(prev => (isPolicyDecisionEqual(prev, evaluation) ? prev : evaluation));
    setStrategyChatReviewProgress(prev => (isReviewProgressEqual(prev, reviewProgress) ? prev : reviewProgress));
  }, [streamPendingReviewRaw, streamEvaluationRaw, streamReviewProgressRaw]);

  useEffect(
    () => () => {
      stopStreamRef.current();
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const hydrateAuthSession = async () => {
      try {
        const persisted = await loadMerchantAuthSession();
        if (!persisted || !persisted.token || !persisted.merchantId) {
          return;
        }
        const storesResponse = await getMerchantStores({
          merchantId: persisted.merchantId,
          token: persisted.token,
        });
        if (cancelled) {
          return;
        }
        const stores = Array.isArray(storesResponse?.stores)
          ? storesResponse.stores
              .map(item => ({
                merchantId: String(item.merchantId || '').trim(),
                name: String(item.name || item.merchantId || '').trim(),
              }))
              .filter(item => item.merchantId)
          : [];
        const merchantName =
          stores.find(item => item.merchantId === persisted.merchantId)?.name ||
          persisted.merchantName ||
          persisted.merchantId;
        applyAuthenticatedSession(
          {
            token: persisted.token,
            merchantId: persisted.merchantId,
            role: persisted.role,
            phone: persisted.phone,
          },
          merchantName,
          stores,
        );
        setLastAction(`Session restored for ${persisted.merchantId}`);
      } catch {
        await clearMerchantAuthSession().catch(() => undefined);
        if (cancelled) {
          return;
        }
        setAuthSession(null);
        setPendingOnboardingSession(null);
        resetSessionScopedState();
        setLastAction('Session expired. Please login again.');
      } finally {
        if (!cancelled) {
          setAuthHydrating(false);
        }
      }
    };
    void hydrateAuthSession();
    return () => {
      cancelled = true;
    };
  }, [applyAuthenticatedSession, resetSessionScopedState]);

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
        await clearMerchantAuthSession().catch(() => undefined);
        setAuthSession(null);
        resetSessionScopedState();
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
      const nextSession = {
        token: result.token,
        merchantId: resolvedMerchantId,
        role: String(result.profile?.role || 'OWNER'),
        phone: String(result.profile?.phone || phone),
      };
      applyAuthenticatedSession(nextSession, resolvedMerchantName || resolvedMerchantId, [
        { merchantId: resolvedMerchantId, name: resolvedMerchantName || resolvedMerchantId },
      ]);
      await saveMerchantAuthSession({
        ...nextSession,
        merchantName: resolvedMerchantName || resolvedMerchantId,
      }).catch(() => undefined);
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
      const resolvedMerchantName = String(result.merchant?.name || merchantName);
      const nextSession = {
        token: result.token,
        merchantId: resolvedMerchantId,
        role: String(result.profile?.role || 'OWNER'),
        phone: String(result.profile?.phone || pendingOnboardingSession.phone),
      };
      applyAuthenticatedSession(nextSession, resolvedMerchantName, [
        {
          merchantId: resolvedMerchantId,
          name: resolvedMerchantName,
        },
      ]);
      await saveMerchantAuthSession({
        ...nextSession,
        merchantName: resolvedMerchantName,
      }).catch(() => undefined);
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
    void clearMerchantAuthSession().catch(() => undefined);
    setAuthSession(null);
    setPendingOnboardingSession(null);
    resetSessionScopedState();
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
      setChatSendPhase('failed');
      setChatSendError('Please input your intent first.');
      setLastAction('Please input your intent first.');
      return;
    }
    if (!authSession) {
      setChatSendPhase('failed');
      setChatSendError('Please login first.');
      setLastAction('Please login first.');
      return;
    }

    const localMessageId = createLocalMessageId();
    const createdAt = new Date().toISOString();
    logMerchantStreamEvent('send_click', {
      merchantId: authSession.merchantId,
      textLength: draft.length,
    });
    setAiIntentDraft('');
    setChatSendPhase('submitting');
    setChatSendError('');
    setPendingOutgoingMessages(prev => [
      ...prev.slice(-49),
      {
        messageId: localMessageId,
        text: draft,
        deliveryStatus: 'sending',
        createdAt,
      },
    ]);
    setAiIntentSubmitting(true);
    setStrategyChatPendingReview(null);
    setStrategyChatPendingReviews([]);
    setStrategyChatEvaluation(null);
    setStrategyChatReviewProgress(null);
    setAgentProgressEvents([]);
    try {
      assertUseStreamRuntimeSupport();
      logMerchantStreamEvent('submit_start', {
        merchantId: authSession.merchantId,
      });
      const inputPayload = {
        messages: [
          {
            type: 'human',
            content: draft,
          },
        ],
      };
      const optionsPayload: {
        context: { merchantId: string };
        config: { configurable: { merchantId: string } };
        metadata: { merchantId: string; source: string };
        streamMode: StreamMode[];
      } = {
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
        streamMode: OFFICIAL_STREAM_MODES,
      };
      await stream.submit(
        inputPayload,
        optionsPayload,
      );
      setPendingOutgoingMessages(prev =>
        prev.map(item =>
          item.messageId === localMessageId
            ? {
                ...item,
                deliveryStatus: 'sent',
              }
            : item,
        ),
      );
      setChatSendPhase('idle');
      setChatSendError('');
      setLastAction('Assistant replied.');
      logMerchantStreamEvent('submit_success', {
        merchantId: authSession.merchantId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'chat stream failed';
      setPendingOutgoingMessages(prev =>
        prev.map(item =>
          item.messageId === localMessageId
            ? {
                ...item,
                deliveryStatus: 'failed',
              }
            : item,
        ),
      );
      setChatSendPhase('failed');
      setChatSendError(message);
      setLastAction(`Chat failed: ${message}`);
      logMerchantStreamEvent('submit_error', {
        merchantId: authSession.merchantId,
        message,
      });
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
    setChatSendPhase('idle');
    setChatSendError('');
    setAiIntentDraft(target.text);
    setLastAction('Retry message loaded into input box.');
  };

  const onEvaluatePendingStrategy = async () => {
    if (!authSession) {
      setLastAction('Please login first.');
      return;
    }
    if (!strategyChatPendingReview) {
      setLastAction('No pending proposal to evaluate.');
      return;
    }
    setChatSendPhase('submitting');
    setChatSendError('');
    try {
      await stream.submit(null, {
        command: {
          resume: {
            action: 'evaluate',
            proposal_id: strategyChatPendingReview.proposalId,
            user_id: customerUserId || undefined,
          },
        },
        streamMode: OFFICIAL_STREAM_MODES,
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
      });
      setChatSendPhase('idle');
      setLastAction('Evaluation completed.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'evaluate failed';
      setChatSendPhase('failed');
      setChatSendError(message);
      setLastAction(`Evaluate failed: ${message}`);
    }
  };

  const onReviewPendingStrategy = async (decision: 'APPROVE' | 'REJECT') => {
    if (!authSession) {
      setLastAction('Please login first.');
      return;
    }
    if (!strategyChatPendingReview) {
      setLastAction('No pending proposal to review.');
      return;
    }
    const action = decision === 'APPROVE' ? 'approve' : 'reject';
    setChatSendPhase('submitting');
    setChatSendError('');
    try {
      await stream.submit(null, {
        command: {
          resume: {
            action,
            proposal_id: strategyChatPendingReview.proposalId,
            user_id: customerUserId || undefined,
          },
        },
        streamMode: OFFICIAL_STREAM_MODES,
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
      });
      setChatSendPhase('idle');
      setLastAction(decision === 'APPROVE' ? 'Proposal approved.' : 'Proposal rejected.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'review failed';
      setChatSendPhase('failed');
      setChatSendError(message);
      setLastAction(`Review failed: ${message}`);
    }
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
    authHydrating,
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
    chatSendPhase,
    chatSendError,
    pendingOutgoingMessages,
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
