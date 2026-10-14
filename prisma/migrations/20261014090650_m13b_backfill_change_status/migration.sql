-- 数据回填迁移（无 schema 变更）
--
-- 背景：m13（20261014074812_internal_closure）给 change_orders 引入 status 四段状态机时，
-- SQLite 的 RedefineTables 重建语句 `INSERT INTO new_change_orders (…) SELECT …` 的列清单里
-- **没有 status**，导致所有存量变更单落到 DEFAULT 'draft'。
-- 而读侧口径（core/domain 消费方 projects/server/projectDetail.ts、finance/server/records.ts）
-- 只统计 status='client_confirmed'——于是历史变更金额会从累计变更、毛利、毛利率、
-- 应收分母（paidDenom=contractAmount+changeTotal）与变更预警里同时消失，且界面不给提示。
-- 这违反 AGENTS.md §4.3「钱按事实」：数据没丢但算没了，比数字变小更糟。
--
-- 旧口径下变更单「录入即生效」，其金额已参与过对账，故存量行一律视为已获客户确认。
-- 判据用 createdAt 早于 m13 上线时刻，**绝不误碰上线后员工新建的草稿**（那条路径必须走
-- draft→pending→client_confirmed 的确认流）。confirmedAt 取 createdAt：旧口径的生效时间
-- 即创建时间，这是最贴近事实的取值，同时避免 UI 拿到 null。
--
-- 幂等：只更新 status='draft' 的行，回填后不再命中，可安全重复执行。

UPDATE "change_orders"
SET
    "status" = 'client_confirmed',
    "confirmedAt" = "createdAt",
    "confirmNote" = '历史存量自动确认（m13 迁移未回填 status 的修复，2026-10-14）'
WHERE
    "status" = 'draft'
    AND "createdAt" < CAST(strftime('%s', '2026-10-14 07:48:12') AS INTEGER) * 1000;
