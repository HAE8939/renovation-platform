/**
 * verify-evidence-flow.mts —— 验收节点证据图片的隔离库集成门禁。
 *
 * 运行前先把 DATABASE_URL 指向 _scratch/evidence-flow.db，并执行一次
 * `prisma migrate reset --force --skip-generate`。脚本只会写临时库与
 * public/uploads/evidence 下的临时文件，结束时清理自己创建的记录和文件。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/core/db";
import {
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_COUNT,
  deleteEvidence,
  uploadEvidence,
} from "@/modules/quality/server/evidence";

const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const file = (name: string, type: string, bytes: Uint8Array): File =>
  new File([bytes], name, { type });
const png = () => file("现场.png", "image/png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
const jpeg = () => file("现场.jpg", "image/jpeg", new Uint8Array([255, 216, 255, 224]));

async function main() {
  const livePath = join(process.cwd(), "prisma", "dev.db");
  const liveBefore = readFileSync(livePath);
  const node = await prisma.acceptanceNode.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!node) throw new Error("未找到验收节点，请先重置并 seed 隔离库");

  const baseline = await prisma.evidence.count({ where: { nodeId: node.id } });
  check("初态：目标节点没有既有证据", baseline === 0, `已有 ${baseline} 张`);

  const created: string[] = [];
  try {
    const first = await uploadEvidence(node.id, png());
    created.push(first.id);
    const stored = join(process.cwd(), "public", first.url.replace(/^\//, ""));
    check("PNG 通过并写入数据库", first.mimeType === "image/png" && first.size === 8);
    check("PNG 文件实际落盘", existsSync(stored), stored);
    check("落盘内容与上传内容一致", readFileSync(stored).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));

    const second = await uploadEvidence(node.id, jpeg());
    created.push(second.id);
    check("JPG 通过", second.mimeType === "image/jpeg");

    const rejected: Array<[string, File, string]> = [
      ["SVG 拒绝", file("bad.svg", "image/svg+xml", new Uint8Array([60, 115, 118, 103, 62])), "仅支持"],
      ["伪造 MIME 拒绝", file("fake.png", "image/png", new Uint8Array([60, 115, 118, 103, 62])), "内容无效"],
      ["超 5 MB 拒绝", file("large.png", "image/png", new Uint8Array(EVIDENCE_MAX_BYTES + 1).fill(0)), "5 MB"],
    ];
    for (const [name, candidate, expected] of rejected) {
      let message = "";
      try {
        await uploadEvidence(node.id, candidate);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      check(name, message.includes(expected), message || "未拒绝");
    }

    for (let i = created.length; i < EVIDENCE_MAX_COUNT; i += 1) {
      const row = await uploadEvidence(node.id, i % 2 === 0 ? png() : jpeg());
      created.push(row.id);
    }
    check("达到 9 张上限", (await prisma.evidence.count({ where: { nodeId: node.id } })) === EVIDENCE_MAX_COUNT);
    let countMessage = "";
    try {
      await uploadEvidence(node.id, png());
    } catch (error) {
      countMessage = error instanceof Error ? error.message : String(error);
    }
    check("第 10 张拒绝", countMessage.includes("最多上传 9 张"), countMessage || "未拒绝");

    const deleteTarget = created[0];
    const deleteRow = await prisma.evidence.findUniqueOrThrow({ where: { id: deleteTarget } });
    const deletePath = join(process.cwd(), "public", "uploads", "evidence", deleteRow.nodeId, deleteRow.filename);
    await deleteEvidence(deleteTarget);
    check("删除后数据库记录清理", !(await prisma.evidence.findUnique({ where: { id: deleteTarget } })));
    check("删除后文件清理", !existsSync(deletePath), deletePath);
    created.shift();
  } finally {
    for (const id of created) {
      await deleteEvidence(id).catch(() => undefined);
    }
    const remaining = await prisma.evidence.count({ where: { nodeId: node.id } });
    check("收尾：临时证据记录清零", remaining === baseline, `剩余 ${remaining}`);
  }

  const liveAfter = readFileSync(livePath);
  check("隔离库门禁：开发库未变化", Buffer.compare(liveBefore, liveAfter) === 0);

  const failed = results.filter((result) => !result.ok).length;
  console.log(`\n${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
