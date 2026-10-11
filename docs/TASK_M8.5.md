# TASK_M8.5 — 小修复单元 · 执行记录与集成者裁定

> 版本：2026-10-11 · 维护：QwenWork（集成者）· 决策人：HAE（"按照你的建议来" = 采纳方案 A：收缺陷 + 理念落纸 → 再开 M9 讨论）
> 来源：2026-10-11 外部审查（`docs/REVIEW_EXTERNAL_2026-10-11.md`）× 集成者逐条核验后的**净增量清单**；插件化相关裁定入册 `docs/PLATFORM_EVOLUTION_V0.1.md`。
> 范围纪律：**只收小修复，零新功能、零新范围**；不做 M9、不做插件化 Phase 2-4。

## 1. 修复清单（6 项，全部小改）

| 项 | 内容 | 文件 |
|---|---|---|
| F1 | 质量页过期文案：「将在后续单元上线」→「均已上线」 | `src/app/quality/page.tsx` |
| F2 | CRM 服务端**相邻推进校验**（末态/回退/跳阶拒）+ 三处入口**失败回显**（卡/表格内联、拖拽看板顶条；失败仍 revalidate 自愈）+ 新组件 | `modules/crm/server/leads.ts`、`modules/crm/actions.ts`、`app/crm/AdvanceStageForm.tsx`（新）、`LeadBoard.tsx`、`LeadDrawer.tsx` |
| F3 | `createProject`/`updateProject` **状态白名单**（`isProjectStatus`） | `core/domain/types.ts`、`core/domain/projects.ts` |
| F4 | 交付物链接 **http(s) 协议白名单**（写侧）+ 表单 placeholder 提示 | `modules/design/server/submissions.ts`、`app/design/[id]/SubmitTaskForm.tsx` |
| F5 | 根级 `loading`/`error`/`not-found` 边界页 | `app/loading.tsx`、`not-found.tsx`、`error.tsx`（均新） |
| F8 | 付款模板工序名**护栏断言**（triggerStages 全部命中工序模板名，防「按名字匹配」链路改名静默失配） | `scripts/verify-finance-flow.mts`（54→55） |

**同批复核关闭**：状态 §4-1（375px 预算详情溢出）——生产构建 + 真 375 视口 + 同源 iframe 探针 v2 实测**不复现**（`scrollWidth≤375`、`trueOffenders=0`、「草稿」徽章 right=124/338 在视口内），原观察系截图裁剪 / 淡边框假象。

## 2. 执行与验收（集成者工作流，固化第五遍）

1. **预探查**：探针 v1（7 页）+ v2（加「越界元素是否被 overflow 容器裁切」判定 + 徽章定点）→ 缺陷关闭定案。
2. **派工卡**：`_scratch/logs/cb_m85_prompt.md` → codebuddy 无头执行（`custom-local:glm-5.2` 走 **8787 池**，会话日志核验 `url=http://127.0.0.1:8787/…`，session `4e58a088-b73e-4a8c-add9-ab4a33232550`）。
3. **逐文件审**：14 处 diff 全量对照卡规格 + 残留检查（引用点/裸绑定/过期文案/导入可用性）——**零偏离**。
4. **独立复跑**：`pnpm build` 绿 + `npx tsc --noEmit` 0 + 七纯函数门禁零回退（37/11/20/28/55/108/115）+ **四隔离库集成门禁全过**（sign 12 / schedule-gen 27 / quality-flow 94 / finance-flow **55**；因动 `core/domain`，四个均先 reset 重跑）。
5. **守卫行为验收**（临时脚本 `_scratch/m85_guards_check.mts`，隔离库真跑生产服务层）**10/10**：跳阶/回退/末态拒 · 相邻推进成功 · 非法状态拒（update+create）· 合法状态写入 · `javascript:` 链接拒 · https 提交成功。
6. **页面面**：`qa-shots` 31 页全 200 + 目检四件（质量页新文案 / CRM 卡按钮 / 设计表单 placeholder / 404 页）。
7. **探针复核**：`/crm`、`/quality`、`/budget/[id]`、404 页——`pageOverflow=NO`、`trueOffenders=0`；404 实测状态码 404 + 文案 + 截图。

## 3. 裁定记录

- codebuddy 自报偏离：无；集成者复核：**零偏离**（其"docs 旧文案字面命中"说明无误，属审查报告原文，非源码问题）。
- `public/__probe.html` 用毕已 `host_safe_delete`（不入库）；`_scratch/m85_guards_check.mts` 留档不入库。
- **观察项（候 M9 决定）**：`quoted→signed` 通用「下一阶段」推进与「签约建项」（`signLead`）双路径语义重叠——前者可把线索标为已签约而**不建项目**（表格仍可补签、抽屉在 signed 态会隐藏签约入口）。本单元**维持现状不改语义**，登记为状态 §4-14。
- 插件化裁定（3 处修正 / 2 处校准 / 拒绝清单）见 `docs/PLATFORM_EVOLUTION_V0.1.md`。

## 4. 结论

M8.5 关闭：**外部审查净增量 6 项修复 + 1 项缺陷复查关闭 + 1 项观察登记**；零回退、零扩范围。下一步 = **M9 边界讨论**（候 HAE 逐项确认；先用 `PLATFORM_EVOLUTION_V0.1.md` 的三问体检）。
