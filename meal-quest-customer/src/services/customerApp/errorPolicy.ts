export function shouldClearSession(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  if (!message) {
    return false;
  }
  return (
    message.includes('authorization') ||
    message.includes('token') ||
    message.includes('scope denied') ||
    message.includes('invalid wechat identity') ||
    message.includes('invalid alipay identity')
  );
}
