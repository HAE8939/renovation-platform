/**
 * 签约归并纯函数（crm 模块 M3-d1）。
 * 不碰 DB、无外部依赖，可被 scripts/verify-crm.mjs 直接 import 断言。
 * 归并决策全部落在这层，signLead 只负责把决策落到库里。
 */

/**
 * 归一手机号：去空格与连字符、仅保留数字（本地格式，不引国际库）。
 * 结果为空 → 返回 null（避免把空串误当合法号去匹配）。
 */
export function normalizePhone(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const digits = s.replace(/[\s-]/g, "").replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * 在本 org 的 Client 列表里按归一手机号精确匹配。
 * phone 为 null → 直接返回 null（不把空号误配到 phone 为 null 的客户）。
 * 命中返回该 client（含 id 与原始 phone），未命中返回 null。
 */
export function pickClientByPhone(
  clients: { id: string; phone: string | null }[],
  phone: string | null
): { id: string; phone: string | null } | null {
  const norm = normalizePhone(phone);
  if (norm === null) return null;
  for (const c of clients) {
    if (normalizePhone(c.phone) === norm) return c;
  }
  return null;
}
