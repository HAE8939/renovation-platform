/**
 * 设计日历纯函数（M5-d）。无 prisma、无客户端 only API，
 * 服务端组件与 scripts/verify-*.mjs 均可安全 import。
 *
 * 周一起始（中文惯例：周一到周日为一周）。
 */

/** 日历单元格：日期 + 日号 + 是否当月。 */
export interface CalendarCell {
  date: Date;
  day: number;
  inMonth: boolean;
}

/** 月份解析结果。month 为 0-based（与 Date 构造一致：0=一月）。 */
export interface ParsedMonth {
  year: number;
  month: number;
  /** "YYYY-MM" 标签，用于深链与标题。 */
  label: string;
}

/**
 * 校验 ?month= 参数：仅接受 YYYY-MM（month 01-12，year 1900-9999），
 * 非法或缺失回退 fallbackNow 当月。返回 ParsedMonth。
 */
export function parseMonthParam(
  s: string | undefined | null,
  fallbackNow: Date = new Date()
): ParsedMonth {
  if (s) {
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]) - 1; // 0-based
      if (month >= 0 && month <= 11 && year >= 1900 && year <= 9999) {
        return { year, month, label: `${m[1]}-${m[2]}` };
      }
    }
  }
  const y = fallbackNow.getFullYear();
  const mo = fallbackNow.getMonth();
  return {
    year: y,
    month: mo,
    label: `${y}-${String(mo + 1).padStart(2, "0")}`,
  };
}

/**
 * 生成 6×7 日历网格（周一起始，含前后月补白）。
 * 从该月 1 号所在周的周一开始，连续 42 天填满 6 行 7 列。
 * 始终返回 6 行，保证布局一致（即便某些月只需 4-5 行也补齐）。
 */
export function monthDays(year: number, month: number): CalendarCell[][] {
  const first = new Date(year, month, 1);
  // 周一起始：Date.getDay() 0=周日 → 转为 周一=0 的列偏移
  // 周一 getDay()=1 → (1+6)%7=0；周日 getDay()=0 → (0+6)%7=6
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);

  const rows: CalendarCell[][] = [];
  for (let r = 0; r < 6; r++) {
    const row: CalendarCell[] = [];
    for (let c = 0; c < 7; c++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + r * 7 + c);
      row.push({
        date: d,
        day: d.getDate(),
        inMonth: d.getMonth() === month,
      });
    }
    rows.push(row);
  }
  return rows;
}

/** 把 Date 截到日的 YYYY-MM-DD 键（本地时区）。 */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 按截止日期（截到日）分组任务。返回 Map<YYYY-MM-DD, Task[]>。
 * deadline 为 null 或非法的任务不进 Map（由调用方单独统计 undatedCount）。
 * deadline 兼容 Date / ISO 字符串 / null。
 */
export function groupByDay<T extends { deadline: Date | string | null }>(
  tasks: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const t of tasks) {
    if (!t.deadline) continue;
    const d = t.deadline instanceof Date ? t.deadline : new Date(t.deadline);
    if (Number.isNaN(d.getTime())) continue;
    const key = dayKey(d);
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);
  }
  return map;
}

/** 上一月 / 下一月的 "YYYY-MM" label（用于翻页深链）。 */
export function shiftMonth(parsed: ParsedMonth, delta: number): string {
  const d = new Date(parsed.year, parsed.month + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
