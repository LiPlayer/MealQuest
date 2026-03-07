import { useCallback, useEffect, useMemo, useState } from 'react';

import { getNotificationUnreadSummary } from '../services/apiClient';

type AuthSession = {
  merchantId?: string | null;
  token?: string | null;
};

type DotState = {
  totalUnread: number;
  byCategory: Record<string, number>;
};

const EMPTY_STATE: DotState = {
  totalUnread: 0,
  byCategory: {},
};

function normalizeCategoryKey(value: string): string {
  return String(value || '').trim().toUpperCase();
}

export default function useNotificationDots(authSession: AuthSession | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState<DotState>(EMPTY_STATE);

  const merchantId = String(authSession?.merchantId || '').trim();
  const token = String(authSession?.token || '').trim();

  const refresh = useCallback(async () => {
    if (!merchantId || !token) {
      setState(EMPTY_STATE);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await getNotificationUnreadSummary({
        merchantId,
        token,
      });
      const rows = Array.isArray(result.byCategory) ? result.byCategory : [];
      const nextByCategory: Record<string, number> = {};
      rows.forEach((item) => {
        const key = normalizeCategoryKey(String(item?.category || ''));
        if (!key) {
          return;
        }
        nextByCategory[key] = Number(item?.unreadCount) || 0;
      });
      setState({
        totalUnread: Number(result.totalUnread) || 0,
        byCategory: nextByCategory,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '红点状态加载失败';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [merchantId, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!merchantId || !token) {
      return undefined;
    }
    const timer = setInterval(() => {
      void refresh();
    }, 45000);
    return () => clearInterval(timer);
  }, [merchantId, refresh, token]);

  const dots = useMemo(() => {
    const byCategory = state.byCategory;
    const marketingUnread = (byCategory.APPROVAL_TODO || 0) + (byCategory.GENERAL || 0);
    const auditUnread = byCategory.EXECUTION_RESULT || 0;
    const riskUnread = byCategory.FEEDBACK_TICKET || 0;
    return {
      totalUnread: state.totalUnread,
      marketingUnread,
      auditUnread,
      riskUnread,
      byCategory,
    };
  }, [state]);

  return {
    loading,
    error,
    dots,
    refresh,
  };
}
