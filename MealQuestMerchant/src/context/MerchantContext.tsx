import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createInitialMerchantState, MerchantState } from '../domain/merchantEngine';
import {
  completeMerchantOnboard,
  getMerchantDashboard,
  getStateContract,
  getStateModelContract,
  getMerchantStores,
  getApiBaseUrl,
  loginMerchantByPhone,
  requestMerchantPhoneCode,
} from '../services/apiClient';
import type {
  DecisionSummaryResponse,
  StateContractResponse,
  StateModelContractResponse,
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

export type AgentMessage = {
  messageId: string;
  role: 'USER' | 'ASSISTANT';
  text: string;
  isStreaming?: boolean;
};

export type AgentMessageWithStatus = AgentMessage & {
  deliveryStatus?: MessageStatus;
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
  aiIntentDraft: string;
  setAiIntentDraft: (val: string) => void;
  aiIntentSubmitting: boolean;
  chatSendPhase: ChatSendPhase;
  chatSendError: string;
  pendingOutgoingMessages: PendingOutgoingMessage[];
  agentMessages: AgentMessageWithStatus[];
  agentProgressEvents: AgentProgressEvent[];
  activeAgentProgress: AgentProgressEvent | null;

  onTriggerProactiveScan: () => Promise<void>;
  refreshContractVisibility: () => Promise<void>;
  onSendAgentMessage: () => Promise<void>;
  onRetryMessage: (messageId: string) => Promise<void>;
}

const MerchantContext = createContext<MerchantContextType | undefined>(undefined);

const OFFICIAL_AGENT_ID = 'merchant-omni-agent';

function createLocalMessageId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractTokenFromMessagesPayload(payload: unknown): string {
  if (!Array.isArray(payload) || payload.length === 0) {
    return '';
  }
  const first = payload[0] as Record<string, unknown>;
  if (!first || typeof first !== 'object') {
    return '';
  }
  if (typeof first.content === 'string') {
    return first.content;
  }
  if (typeof first.text === 'string') {
    return first.text;
  }
  if (typeof first.delta === 'string') {
    return first.delta;
  }
  return '';
}

function parseSseEvents(raw: string): { event: string; data: unknown }[] {
  const blocks = raw.split(/\n\n+/g).filter(Boolean);
  const events: { event: string; data: unknown }[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim() || 'message';
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim());
      }
    }

    const dataRaw = dataLines.join('\n').trim();
    if (!dataRaw) {
      events.push({ event: eventName, data: null });
      continue;
    }

    try {
      events.push({ event: eventName, data: JSON.parse(dataRaw) });
    } catch {
      events.push({ event: eventName, data: dataRaw });
    }
  }

  return events;
}

function normalizeCustomerEntry(raw: unknown): MerchantState['customerEntry'] {
  const safe = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    totalCustomers: Number(safe.totalCustomers) || 0,
    newCustomersToday: Number(safe.newCustomersToday) || 0,
    checkinsToday: Number(safe.checkinsToday) || 0,
    latestCheckinAt:
      typeof safe.latestCheckinAt === 'string' && safe.latestCheckinAt.trim()
        ? safe.latestCheckinAt
        : null,
  };
}

function normalizeDecisionSummary(raw: DecisionSummaryResponse | unknown): MerchantState['acquisitionWelcomeSummary'] {
  const safe = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawBlockedReasons = Array.isArray(safe.topBlockedReasons) ? safe.topBlockedReasons : [];
  const rawLatestResults = Array.isArray(safe.latestResults) ? safe.latestResults : [];
  return {
    hitCount24h: Number(safe.hitCount24h) || 0,
    blockedCount24h: Number(safe.blockedCount24h) || 0,
    reactivationRate24h: Math.max(0, Number(safe.reactivationRate24h) || 0),
    topBlockedReasons: rawBlockedReasons.map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        reason: typeof row.reason === 'string' ? row.reason : '',
        count: Number(row.count) || 0,
      };
    }),
    latestResults: rawLatestResults.map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        decisionId: typeof row.decisionId === 'string' ? row.decisionId : '',
        event: typeof row.event === 'string' ? row.event : '',
        outcome: typeof row.outcome === 'string' ? row.outcome : '',
        reasonCode: typeof row.reasonCode === 'string' ? row.reasonCode : '',
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      };
    }),
  };
}

function normalizeTraceSummary(raw: unknown): MerchantState['traceSummary'] {
  const safe = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawLast24h =
    safe.last24h && typeof safe.last24h === 'object'
      ? (safe.last24h as Record<string, unknown>)
      : {};
  const rawLatestTrace = Array.isArray(safe.latestTrace) ? safe.latestTrace : [];
  return {
    last24h: {
      payments: Number(rawLast24h.payments) || 0,
      ledgerRows: Number(rawLast24h.ledgerRows) || 0,
      invoices: Number(rawLast24h.invoices) || 0,
      audits: Number(rawLast24h.audits) || 0,
      policyDecisions: Number(rawLast24h.policyDecisions) || 0,
      traceLinkedPayments: Number(rawLast24h.traceLinkedPayments) || 0,
      tracePendingPayments: Number(rawLast24h.tracePendingPayments) || 0,
    },
    latestTrace: rawLatestTrace.map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        paymentTxnId: typeof row.paymentTxnId === 'string' ? row.paymentTxnId : '',
        userId: typeof row.userId === 'string' ? row.userId : '',
        status: typeof row.status === 'string' ? row.status : '',
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
        chainComplete: Boolean(row.chainComplete),
        hasLedger: Boolean(row.hasLedger),
        hasInvoice: Boolean(row.hasInvoice),
        hasAudit: Boolean(row.hasAudit),
      };
    }),
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'contract refresh failed';
}

function normalizeDataContract(raw: StateContractResponse): NonNullable<MerchantState['contractVisibility']['dataContract']> {
  const domains = raw && raw.dataDomains && typeof raw.dataDomains === 'object' ? raw.dataDomains : {};
  const eventsRaw = raw && Array.isArray(raw.events) ? raw.events : [];
  const coverage =
    raw && raw.merchantCoverage && typeof raw.merchantCoverage === 'object'
      ? raw.merchantCoverage
      : null;
  const missingDomainsRaw = coverage && Array.isArray(coverage.missingDomains)
    ? coverage.missingDomains
    : [];
  const missingDomains = missingDomainsRaw
        .map((item) => String(item || '').trim())
        .filter(Boolean);
  const proxyMetricsRaw = raw && Array.isArray(raw.proxyMetrics) ? raw.proxyMetrics : [];
  const proxyMetrics = proxyMetricsRaw.map((item) => String(item || '').trim()).filter(Boolean);
  return {
    version: String(raw && raw.version ? raw.version : ''),
    objective: String(raw && raw.objective ? raw.objective : ''),
    proxyMetrics,
    domainCount: Object.keys(domains).length,
    eventCount: eventsRaw.length,
    missingDomains,
  };
}

function normalizeModelContract(raw: StateModelContractResponse): NonNullable<MerchantState['contractVisibility']['modelContract']> {
  const objective =
    raw && raw.objectiveContract && typeof raw.objectiveContract === 'object'
      ? raw.objectiveContract
      : {};
  const modelSignals = raw && Array.isArray(raw.modelSignals) ? raw.modelSignals : [];
  const formula =
    raw && raw.decisionFormula && typeof raw.decisionFormula === 'object'
      ? raw.decisionFormula
      : {};
  const coverage =
    raw && raw.merchantCoverage && typeof raw.merchantCoverage === 'object'
      ? raw.merchantCoverage
      : null;
  const signalFields = modelSignals
    .map((item) => String(item && item.field ? item.field : '').trim())
    .filter(Boolean);
  const missingSignalPoliciesRaw = coverage && Array.isArray(coverage.missingSignalPolicies)
    ? coverage.missingSignalPolicies
    : [];
  const missingSignalPolicies = missingSignalPoliciesRaw
        .map((item) => String(item || '').trim())
        .filter(Boolean);
  return {
    version: String(raw && raw.version ? raw.version : ''),
    targetMetric: String(objective && objective.targetMetric ? objective.targetMetric : ''),
    windowDays: Number(objective && objective.windowDays) || 0,
    signalFields,
    effectiveProbabilityFormula: String(
      formula && formula.effectiveProbability ? formula.effectiveProbability : '',
    ),
    expectedValueProxyFormula: String(
      formula && formula.expectedValueProxy ? formula.expectedValueProxy : '',
    ),
    missingSignalPolicies,
  };
}

async function runAgentTask(params: {
  merchantId: string;
  token: string;
  text: string;
}): Promise<{ assistantText: string; progressEvents: AgentProgressEvent[] }> {
  const response = await fetch(`${getApiBaseUrl()}/api/agent-os/tasks/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      merchantId: params.merchantId,
      agent_id: OFFICIAL_AGENT_ID,
      input: {
        messages: [
          {
            type: 'human',
            content: params.text,
          },
        ],
      },
      stream_mode: ['messages-tuple', 'values', 'updates', 'custom'],
      metadata: {
        merchantId: params.merchantId,
        source: 'merchant-app',
      },
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      payload && typeof payload.error === 'string'
        ? payload.error
        : `agent task failed (${response.status})`,
    );
  }

  const sseText = await response.text();
  const events = parseSseEvents(sseText);
  let assistantText = '';
  const progressEvents: AgentProgressEvent[] = [];

  for (const event of events) {
    if (event.event === 'messages') {
      assistantText += extractTokenFromMessagesPayload(event.data);
      continue;
    }
    if (event.event === 'custom' && event.data && typeof event.data === 'object') {
      const data = event.data as Record<string, unknown>;
      progressEvents.push({
        phase: typeof data.phase === 'string' ? data.phase : 'AGENT',
        status: typeof data.status === 'string' ? data.status : 'running',
        tokenCount: Number(data.tokenCount) || 0,
        elapsedMs: Number(data.elapsedMs) || 0,
        at: typeof data.at === 'string' ? data.at : new Date().toISOString(),
        resultStatus: typeof data.resultStatus === 'string' ? data.resultStatus : undefined,
        error: typeof data.error === 'string' ? data.error : undefined,
      });
      continue;
    }
    if (event.event === 'error') {
      const data = event.data as Record<string, unknown>;
      const message =
        data && typeof data.message === 'string'
          ? data.message
          : data && typeof data.error === 'string'
            ? data.error
            : 'agent task stream error';
      throw new Error(message);
    }
  }

  return {
    assistantText: assistantText.trim() || 'Received. Please provide more details.',
    progressEvents,
  };
}

export function MerchantProvider({ children }: { children: React.ReactNode }) {
  const [authSession, setAuthSession] = useState<MerchantAuthSession | null>(null);
  const [authHydrating, setAuthHydrating] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [pendingOnboardingSession, setPendingOnboardingSession] = useState<PendingOnboardingSession | null>(null);

  const [merchantState, setMerchantState] = useState<MerchantState>(createInitialMerchantState);
  const [aiIntentDraft, setAiIntentDraft] = useState('');
  const [aiIntentSubmitting, setAiIntentSubmitting] = useState(false);
  const [chatSendPhase, setChatSendPhase] = useState<ChatSendPhase>('idle');
  const [chatSendError, setChatSendError] = useState('');
  const [pendingOutgoingMessages, setPendingOutgoingMessages] = useState<PendingOutgoingMessage[]>([]);
  const [agentMessages, setAgentMessages] = useState<AgentMessageWithStatus[]>([]);
  const [agentProgressEvents, setAgentProgressEvents] = useState<AgentProgressEvent[]>([]);

  const isAuthenticated = Boolean(authSession && authSession.token && authSession.merchantId);
  const activeAgentProgress = useMemo(
    () => (agentProgressEvents.length > 0 ? agentProgressEvents[agentProgressEvents.length - 1] : null),
    [agentProgressEvents],
  );

  const resetSessionScopedState = useCallback(() => {
    setMerchantState(createInitialMerchantState());
    setAiIntentDraft('');
    setAiIntentSubmitting(false);
    setChatSendPhase('idle');
    setChatSendError('');
    setPendingOutgoingMessages([]);
    setAgentMessages([]);
    setAgentProgressEvents([]);
  }, []);

  const applyAuthenticatedSession = useCallback(
    (session: MerchantAuthSession, merchantName: string) => {
      setPendingOnboardingSession(null);
      setAuthSession(session);
      setMerchantState(prev => ({
        ...prev,
        merchantId: session.merchantId,
        merchantName: merchantName || session.merchantId,
      }));
      setAiIntentDraft('');
      setChatSendPhase('idle');
      setChatSendError('');
      setPendingOutgoingMessages([]);
      setAgentMessages([]);
      setAgentProgressEvents([]);
    },
    [],
  );

  const refreshMerchantDashboard = useCallback(
    async (session: MerchantAuthSession) => {
      try {
        const dashboard = await getMerchantDashboard({
          merchantId: session.merchantId,
          token: session.token,
        });
        setMerchantState(prev => ({
          ...prev,
          merchantId: session.merchantId,
          merchantName: String(dashboard.merchantName || prev.merchantName || session.merchantId),
          killSwitchEnabled: Boolean(dashboard.killSwitchEnabled),
          budgetCap: Number(dashboard.budgetCap) || 0,
          budgetUsed: Number(dashboard.budgetUsed) || 0,
          customerEntry: normalizeCustomerEntry(dashboard.customerEntry),
          acquisitionWelcomeSummary: normalizeDecisionSummary(dashboard.acquisitionWelcomeSummary),
          activationRecoverySummary: normalizeDecisionSummary(dashboard.activationRecoverySummary),
          engagementSummary: normalizeDecisionSummary(dashboard.engagementSummary),
          revenueUpsellSummary: normalizeDecisionSummary(dashboard.revenueUpsellSummary),
          retentionWinbackSummary: normalizeDecisionSummary(dashboard.retentionWinbackSummary),
          gameMarketingSummary: normalizeDecisionSummary(dashboard.gameMarketingSummary),
          traceSummary: normalizeTraceSummary(dashboard.traceSummary),
        }));
      } catch (error) {
        console.warn('[MerchantContext] refresh dashboard failed', error);
      }
    },
    [],
  );

  const refreshContractVisibilityBySession = useCallback(
    async (session: MerchantAuthSession) => {
      setMerchantState(prev => ({
        ...prev,
        contractVisibility: {
          ...prev.contractVisibility,
          loading: true,
          errorMessage: '',
        },
      }));

      const [dataContractResult, modelContractResult] = await Promise.allSettled([
        getStateContract({
          merchantId: session.merchantId,
          token: session.token,
        }),
        getStateModelContract({
          merchantId: session.merchantId,
          token: session.token,
        }),
      ]);

      const nextErrorMessages: string[] = [];
      const dataContract =
        dataContractResult.status === 'fulfilled'
          ? normalizeDataContract(dataContractResult.value)
          : null;
      const modelContract =
        modelContractResult.status === 'fulfilled'
          ? normalizeModelContract(modelContractResult.value)
          : null;

      if (dataContractResult.status === 'rejected') {
        nextErrorMessages.push(toErrorMessage(dataContractResult.reason));
      }
      if (modelContractResult.status === 'rejected') {
        nextErrorMessages.push(toErrorMessage(modelContractResult.reason));
      }

      setMerchantState(prev => ({
        ...prev,
        contractVisibility: {
          ...prev.contractVisibility,
          loading: false,
          errorMessage: nextErrorMessages[0] || '',
          lastRefreshedAt: new Date().toISOString(),
          dataContract: dataContract || prev.contractVisibility.dataContract,
          modelContract: modelContract || prev.contractVisibility.modelContract,
        },
      }));
    },
    [],
  );

  const refreshContractVisibility = useCallback(async () => {
    if (!authSession) {
      return;
    }
    await refreshContractVisibilityBySession(authSession);
  }, [authSession, refreshContractVisibilityBySession]);

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
        const resolvedMerchantName =
          (Array.isArray(storesResponse?.stores)
            ? storesResponse.stores.find(store => String(store.merchantId || '') === persisted.merchantId)?.name
            : '') ||
          persisted.merchantName ||
          persisted.merchantId;

        applyAuthenticatedSession(
          {
            token: persisted.token,
            merchantId: persisted.merchantId,
            role: persisted.role,
            phone: persisted.phone,
          },
          resolvedMerchantName,
        );
      } catch {
        await clearMerchantAuthSession().catch(() => undefined);
        if (!cancelled) {
          setAuthSession(null);
          setPendingOnboardingSession(null);
          resetSessionScopedState();
        }
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

  useEffect(() => {
    if (!authSession) {
      return;
    }
    void refreshMerchantDashboard(authSession);
    void refreshContractVisibilityBySession(authSession);
  }, [authSession, refreshContractVisibilityBySession, refreshMerchantDashboard]);

  const requestLoginCode = async (phone: string) => {
    const normalized = String(phone || '').trim();
    if (!normalized) {
      throw new Error('phone is required');
    }
    setAuthSubmitting(true);
    setAuthError('');
    try {
      await requestMerchantPhoneCode(normalized);
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
      const result = await loginMerchantByPhone({ phone, code });
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
        return;
      }

      const resolvedMerchantId = String(result.profile?.merchantId || '').trim();
      if (!resolvedMerchantId || !result.token) {
        throw new Error('login response invalid');
      }
      const resolvedMerchantName = String(result.merchant?.name || resolvedMerchantId).trim();
      const nextSession = {
        token: result.token,
        merchantId: resolvedMerchantId,
        role: String(result.profile?.role || 'OWNER'),
        phone: String(result.profile?.phone || phone),
      };

      applyAuthenticatedSession(nextSession, resolvedMerchantName);
      await saveMerchantAuthSession({
        ...nextSession,
        merchantName: resolvedMerchantName,
      }).catch(() => undefined);
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
      if (!resolvedMerchantId || !result.token) {
        throw new Error('onboarding result invalid');
      }
      const resolvedMerchantName = String(result.merchant?.name || merchantName).trim();
      const nextSession = {
        token: result.token,
        merchantId: resolvedMerchantId,
        role: String(result.profile?.role || 'OWNER'),
        phone: String(result.profile?.phone || pendingOnboardingSession.phone),
      };

      applyAuthenticatedSession(nextSession, resolvedMerchantName);
      await saveMerchantAuthSession({
        ...nextSession,
        merchantName: resolvedMerchantName,
      }).catch(() => undefined);
      setPendingOnboardingSession(null);
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
    void clearMerchantAuthSession().catch(() => undefined);
    setAuthSession(null);
    setPendingOnboardingSession(null);
    resetSessionScopedState();
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
  };

  const onSendAgentMessage = async () => {
    const draft = String(aiIntentDraft || '').trim();
    if (!draft) {
      setChatSendPhase('failed');
      setChatSendError('Please input your intent first.');
      return;
    }
    if (!authSession) {
      setChatSendPhase('failed');
      setChatSendError('Please login first.');
      return;
    }

    const localMessageId = createLocalMessageId();
    const assistantMessageId = `${localMessageId}_assistant`;

    setAiIntentDraft('');
    setChatSendPhase('submitting');
    setChatSendError('');
    setAiIntentSubmitting(true);
    setAgentProgressEvents([]);

    setPendingOutgoingMessages(prev => [
      ...prev.slice(-49),
      {
        messageId: localMessageId,
        text: draft,
        deliveryStatus: 'sending',
        createdAt: new Date().toISOString(),
      },
    ]);

    setAgentMessages(prev => [
      ...prev,
      {
        messageId: localMessageId,
        role: 'USER',
        text: draft,
        deliveryStatus: 'sending',
      },
      {
        messageId: assistantMessageId,
        role: 'ASSISTANT',
        text: '',
        isStreaming: true,
      },
    ]);

    try {
      const result = await runAgentTask({
        merchantId: authSession.merchantId,
        token: authSession.token,
        text: draft,
      });

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

      setAgentMessages(prev =>
        prev.map(item => {
          if (item.messageId === localMessageId && item.role === 'USER') {
            return {
              ...item,
              deliveryStatus: 'sent',
            };
          }
          if (item.messageId === assistantMessageId) {
            return {
              ...item,
              text: result.assistantText,
              isStreaming: false,
            };
          }
          return item;
        }),
      );

      setAgentProgressEvents(result.progressEvents.slice(-30));
      setChatSendPhase('idle');
      setChatSendError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'agent stream failed';

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

      setAgentMessages(prev =>
        prev.map(item => {
          if (item.messageId === localMessageId && item.role === 'USER') {
            return {
              ...item,
              deliveryStatus: 'failed',
            };
          }
          if (item.messageId === assistantMessageId) {
            return {
              ...item,
              text: `Error: ${message}`,
              isStreaming: false,
            };
          }
          return item;
        }),
      );

      setChatSendPhase('failed');
      setChatSendError(message);
    } finally {
      setAiIntentSubmitting(false);
    }
  };

  const onRetryMessage = async (messageId: string) => {
    const target = agentMessages.find(item => item.messageId === messageId && item.role === 'USER');
    if (!target || !target.text) {
      return;
    }
    setChatSendPhase('idle');
    setChatSendError('');
    setAiIntentDraft(target.text);
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
    aiIntentDraft,
    setAiIntentDraft,
    aiIntentSubmitting,
    chatSendPhase,
    chatSendError,
    pendingOutgoingMessages,
    agentMessages,
    agentProgressEvents,
    activeAgentProgress,

    onTriggerProactiveScan,
    refreshContractVisibility,
    onSendAgentMessage,
    onRetryMessage,
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
