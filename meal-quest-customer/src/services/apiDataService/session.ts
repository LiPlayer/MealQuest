import { ensureCustomerSession as ensureSession } from '@/services/customerApp/sessionService';

export const ensureCustomerSession = async (
  merchantId: string,
  _requestedUserId = '',
): Promise<{ token: string; userId: string }> => {
  return ensureSession(merchantId);
};
