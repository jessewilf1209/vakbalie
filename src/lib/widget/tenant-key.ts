/**
 * Formaat van publieke widget-keys: `wk_` + 16–64 tekens
 * url-safe random. Bewust géén tenant-UUID — de key is roteerbaar en verraadt
 * niets over interne id's. Dit is alleen een vormcheck; of de key bestaat
 * wordt server-side tegen de database gecontroleerd.
 */
export const TENANT_KEY_PATTERN = /^wk_[A-Za-z0-9_-]{16,64}$/;

export function isValidTenantKeyFormat(key: string): boolean {
  return TENANT_KEY_PATTERN.test(key);
}
