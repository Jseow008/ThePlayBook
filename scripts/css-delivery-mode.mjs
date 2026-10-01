/**
 * A build-time experiment; production keeps the reviewed inline-CSS contract.
 * @param {Record<string, string | undefined>} env
 */
export function getCssDeliveryMode(env = process.env) {
  const mode = env.NETFLUX_CSS_DELIVERY_EXPERIMENT ?? 'inline';
  if (mode !== 'inline' && mode !== 'external') {
    throw new Error('Unknown CSS delivery experiment');
  }
  if (mode === 'external' && env.VERCEL_ENV !== 'preview') {
    throw new Error('External CSS experiment is restricted to preview builds');
  }
  return mode;
}
