-- 数据回填迁移（无 schema 变更）
--
-- 背景：M15 断点④——「Project.actualEndDate」此前**只有字段位、没有写入路径**。
-- 排程进度联动只写工序自身的 actualEnd（schedule_tasks.actualEnd），项目层的 actualEndDate
-- 从来不会被自动回填。于是两处消费方各自拿计划日 endDate 兜底：
--   · core/domain/health.scheduleLight：actualEndDate 恒 null → 永远不会走到 red 分支，
--     「计划完工日过了但活没干完」这种典型红灯场景照不出；
--   · modules/finance/server/payments.buildProjectPaymentPlan 的 warrantyBase =
--     actualEndDate ?? endDate ?? today —— 保修金 12 个月锚点永远落在计划日，
--     工程实际晚完工的项目保修金解锁时刻比事实早。
-- 这正是 PLATFORM_INTRODUCTION §8.2 点名的断点。
--
-- 运行时路径已在 M15 补上（core/domain/projectCompletion.syncProjectActualEnd 挂在
-- schedule/server/updates.updateTaskProgress 同一事务里，进度联动即回写）。本迁移**只为
-- 存量数据**补一次，让已经全工序完工、但项目 actualEndDate 还是 null 的历史项目立即归位。
--
-- 回填判据（三条同时成立才写，避免误改）：
--   ① 该项目当前 actualEndDate 为 NULL——只补空、**绝不覆盖已有人工/seed 值**
--     （seed 的 RP-2026-003 已把 actualEndDate 写成 T-5，早于本表口径的最大工序 actualEnd，
--      是有意自洽的演示值，不能被迁移改回去）；
--   ② 该项目至少有一条工序（没排程的项目无从推完工日，保持 null 走既有诚实降级）；
--   ③ 该项目**没有任何非 completed 工序、也没有任何 completed 但缺 actualEnd 的工序**
--     ——任一不满足即视为「未完工」或「数据不自洽」，不猜日期（宁缺毋滥，与
--      core/domain/health.computeProjectActualEnd 的 null 语义逐字一致）。
--
-- 幂等：条件①确保回填后不再命中，可安全重复执行。

UPDATE "projects"
SET "actualEndDate" = (
    SELECT MAX("st"."actualEnd")
    FROM "schedule_tasks" AS "st"
    WHERE "st"."projectId" = "projects"."id"
)
WHERE "projects"."actualEndDate" IS NULL
  AND EXISTS (
    SELECT 1 FROM "schedule_tasks" AS "st"
    WHERE "st"."projectId" = "projects"."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "schedule_tasks" AS "st"
    WHERE "st"."projectId" = "projects"."id"
      AND ("st"."status" <> 'completed' OR "st"."actualEnd" IS NULL)
  );
