import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { withPlatform } from "./runner.mjs";

const fixture = resolve("_scratch", "qa", "accept", "s1-catalog-final.png");

await withPlatform("s15-evidence", 9415, async ({ br, db, rep, go, shot }) => {
  const node = await db.acceptanceNode.findFirst({
    where: { evidence: { none: {} } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, projectId: true },
  });
  rep.assert(!!node, "PRE", "找到没有证据的验收节点");
  if (!node) return;

  await go(`/quality/nodes/${node.id}`);
  rep.assert(await br.hasText("现场证据"), "UI", "节点页显示现场证据区");
  await br.uploadFiles("input[type=file]", [fixture]);
  await br.clickS("上传证据");
  await br.settle(2600);

  const row = await db.evidence.findFirst({ where: { nodeId: node.id }, orderBy: { createdAt: "desc" } });
  rep.assert(!!row, "DB", "上传后证据元数据写入数据库");
  if (!row) return;
  const stored = resolve("public", "uploads", "evidence", node.id, row.filename);
  rep.assert(existsSync(stored), "FILE", "图片已保存到节点目录", row.filename);
  rep.assert(await br.hasText(row.originalName), "UI", "页面回读图片原文件名", row.originalName);
  rep.assert(await br.hasText("1/9"), "UI", "页面回读节点图片计数");
  rep.assert((await db.operationLog.count({ where: { action: "evidence.upload", entityId: row.id } })) === 1,
    "LOG", "上传动作写入 OperationLog");
  await shot("uploaded");

  await br.clickInRow(row.originalName, "删除");
  await br.settle(500);
  await br.settle(2600);
  rep.eq(await db.evidence.count({ where: { id: row.id } }), 0, "DB", "确认后数据库记录删除");
  rep.eq(existsSync(stored), false, "FILE", "确认后图片文件删除");
  rep.assert((await db.operationLog.count({ where: { action: "evidence.delete", entityId: row.id } })) === 1,
    "LOG", "删除动作写入 OperationLog");
  rep.assert(await br.hasText("尚未上传现场证据"), "UI", "空态随删除恢复");

  const errs = br.consoleErrors();
  rep.assert(errs.length === 0, "CONSOLE", "无控制台错误", errs.slice(0, 4).join(" ;; "));
});
