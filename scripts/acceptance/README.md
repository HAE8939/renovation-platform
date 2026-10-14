# 交互写回验收台（`scripts/acceptance/`）

## 它解决什么问题

STATUS §4-7 那条缺口：「交互写回路径从没被点过」。纯函数门禁验的是算式，集成门禁验的是服务层，
`qa-shots` 只截图不改数据——**"界面上点了 → 服务端收了 → 库里真变了 → 页面回读一致"这一段
此前没有任何自动化覆盖**。这套工具就是补这一段：用无头 Chrome **真点击**，然后三方对账。

它抓到的东西证明了自己值得存在（都是 build / tsc / 十道门禁全绿状态下漏过去的）：
科目库自 M1b 起没有「新增科目项」入口 · 设置页四套主题卡一直显示同一颜色 ·
恢复归档项目静默落回「草稿」· 桌面端两套导航同时出现 · 归档确认框文案与新口径矛盾。

## 三条硬规矩（都是踩过坑换来的，改这套代码前先读）

1. **绝不打实库**。服务与断言客户端的 `DATABASE_URL` 一律指向 `_scratch/acceptance.db`
   （`prisma/dev.db` 的副本）。平台没有删除入口，写一次就多一批清不掉的数据。
   每个套件开跑前从实库重灌副本（`runner.mjs#resetCopy`），收尾一条**元断言**验实库 md5 未变——
   这条不成立，其余结果全部作废。
2. **端口自动挑空闲 + 阻塞杀进程树**。残留的 `next start` 会应答探活造成假绿（实测截到旧构建）。
3. **必须先 `pnpm build`**。跑的是生产构建，dev 模式的编译遮罩与热更新会掩盖真问题。

## 怎么跑

```bash
pnpm build                                    # 先构建
node scripts/acceptance/s1-catalog.mjs        # 单跑一个套件（约 1~2 分钟）
node scripts/acceptance/report.mjs            # 汇总 results/*.json → docs/ 代验报告
node scripts/acceptance/peek.mjs /crm         # 摸某个页面的控件清单（写新场景前用）
node scripts/acceptance/clickpeek.mjs /budget/catalog "新增科目"   # 点几下再 dump，摸抽屉结构
node scripts/acceptance/labels.mjs modules/finance                 # 从源码抽可见文案与字段名
```

产物落 `_scratch/`（gitignore）：截图 `_scratch/qa/accept/`、逐条结果
`_scratch/accept/results/*.json`、日志 `_scratch/logs/`。

## 套件清单

| 文件 | 钉什么 |
|---|---|
| `smoke.mjs` | 验证台自检：界面点得动 + 只改副本库（**元断言不过就别往下跑**） |
| `s1-catalog` | 科目库增删改排序、编号唯一、删除二次确认与无孤儿 |
| `s2-quote` | 报价编辑器：实时汇总、脏状态、快照选入、行序、**整表替换语义** |
| `s3-settings` | 项目设置（面积→单方、合同额→毛利、客户名连带）+ 四套主题写库 + Logo 全链 |
| `s5-dash-print` | 驾驶舱八个 KPI 与毛利率排行 ↔ 独立复算 + 真 A4 打印导出 |
| `s6-flows2` | 签约建项与手机号归并、跟进、排程进度→验收节点、整改门控、台账增删改 |
| `s8-final` | 线索连推三级后签约、节点通过→付款段派生解锁（含"四缺一不解锁"） |
| `s9-m10a` | 归档/作废与恢复、操作流水内容质量、通知中心、错误日志落盘、六项 UI |
| `s10-splash` | 启动页：入场终态、三种收起、主题随动、reduced-motion、例外不外溢 |
| `s11-dashboard` | 驾驶舱改版：密集表行数=在册项目、不溢出、三灯不竖排、毛利逐行复算 |
| `s12-archive-facts` | 「钱按事实 · 事按可见性」端到端：归档→钱不动事收窄→恢复分毫回来 |
| `s15-evidence` | 验收节点证据图片：上传回读、文件落盘、操作流水、删除清理与实库隔离 |

## 加一个场景

```js
import { withPlatform, moneyNear } from "./runner.mjs";

await withPlatform("s13-xxx", 9377, async ({ br, db, rep, go, shot, srv }) => {
  await rep.scenario("XX1 一句话说明钉什么", async () => {
    await go("/some/page");
    await br.clickInRow("RP-2026-001", "归档");   // 行内按钮
    await br.fillS("金额", "123.45");             // 弹窗内填写
    await br.settle(1500);
    const row = await db.financeRecord.findFirst({ where: { amount: 123.45 } });
    rep.assert(!!row, "DB", "落库了");
    rep.eq(await moneyNear(br, "已收款"), "123.45", "UI↔DB", "页面回读一致");
  });
  const errs = br.consoleErrors();
  rep.assert(errs.length === 0, "CONSOLE", "无控制台报错", errs.join(" ;; "));
});
```

**断言要三方对账**：界面显示的值 ↔ 自己独立复算的值 ↔ 数据库读回的值。
只验"页面跟页面一致"或"库跟库一致"都等于没验。

## 写场景时会踩的坑（详见 `docs/STATUS.md` §5）

- **原生 `confirm` 会卡死无头浏览器**：`cdp.mjs` 已接 `Page.javascriptDialogOpening` 自动应答，
  文案可从 `br.lastDialog.message` 取回来做断言（这是唯一能验"用户实际看到什么"的路子，别浪费）。
- **门控有两种实现**：`disabled` 与 根本不渲染，只查一种会误报。
- **`input[type=number][min=0]` 在浏览器层就挡住负数**，服务端中文分支根本不触发。
- **`sr-only` 单选**（主题选择器）宽高为 0，按可见性筛控件会全丢，用 `pickRadio(name, value)`。
- **一个抽屉里可能有多个提交按钮**（「保存基本信息」/「更新进度」），模糊匹配点错就静默不写。
- **CSS 变量读回可能是 `#FFF` 缩写**，与源码 `#FFFFFF` 字面不等，先归一化再比。
- **Git Bash 会改写 `/path` 型参数**，命令前置 `MSYS_NO_PATHCONV=1`。
- **`cdp.mjs` 的页面侧 helper 装在 `String.raw` 里，内部绝不能再写反引号模板**，
  内层反引号会截断外层，症状是模块加载期语法错。
