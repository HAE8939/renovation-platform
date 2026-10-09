# Design Language 审计 —— M1a 实现 vs MT Creator Design System V0.3

> 审计日：2026-10-09 · 审计面：`src/styles/tokens.css`、`globals.css`、`tailwind.config.ts`、全部 `src/**/*.tsx`
> 方法：色值/几何逐 token 对表；字号与间距用 ripgrep 全量扫实际用量，不靠目测抽样。
> 结论先行：**色值零偏差；偏差全部出在「没落成令牌的三类」——字号、间距、动效**，根因是 Tailwind 默认刻度未关闭，组件直接滑进了 `text-sm / py-5 / gap-2.5` 这些 V0.3 阶梯上不存在的档位。

## 1. 完全对齐的部分（不必再动）

| 项 | V0.3 出处 | 实际值 | 判定 |
|---|---|---|---|
| `--canvas` `--surface` `--surface-sunken` | §2.2 | `#F4F1EA` `#FAF8F3` `#EDEAE2` | ✓ 逐字节 |
| `--text-primary/secondary/disabled` | §2.2 | `#2B2A26` `#6E6A5E` `#A8A294` | ✓ |
| `--border` | §2.2 | `#E7E1D6` | ✓ |
| `--success/warning/danger` | §2.2 | `#3E7C5B` `#8A5F1B` `#A32821` | ✓ |
| accent 钴蓝族 | §2.4 插槽 | `#3368A0` / ink `#2A4E7A` / tint `#DCE8F4` | ✓ 三值全对 |
| 圆角 10 / 6 | §4 | `--radius-card` `--radius-inner` + tailwind 同名 | ✓ 无第三档 |
| 中文字体栈含微软雅黑 | §3.1 | Inter→PingFang SC→**Microsoft YaHei**→… | ✓ |
| 正文 15px / 行高 1.75 | §3、§3.1 | `body{font-size:15px;line-height:1.75}` | ✓ |
| 表格数字等宽 + 右对齐 | §3.1、§4 Table | `.num`(tabular-nums + mono) 实用于金额列，`align="right"` | ✓ |
| 焦点环 2px accent-ink 外描边 | §5.1 | `:focus-visible` 用 outline 不用阴影 | ✓ |
| 避头尾 | §3.1 | `line-break: strict` | ✓ |
| 全画面零阴影 | §4 L0 + §6.6 | 无任何 `box-shadow` | ✓（但见 §4 冲突） |

色值这块 M1a 是干净的——"值以 V0.3 为唯一真源、禁止凭感觉改"这条守住了。

## 2. 偏差清单（按严重度）

### 2.1 硬违反：`prefers-reduced-motion` 全仓未出现

V0.3 三处明令（§5.1 无障碍行、§5.2 约束条、§6.9 投喂指令）要求"一律尊重 prefers-reduced-motion，关闭后回落 L0 且信息不缺失"。现在 `transition-colors duration-150` 用在 6 处（`Button.tsx:42`、`Input.tsx:12`、`Nav.tsx:31/36`、`page.tsx:54/66`），系统层设置"减少动效"的用户拿不到任何响应。

修法：`globals.css` 补一段媒体查询把 transition/animation 关掉。一处改动，全局生效。**优先级最高，成本最低。**

顺带：§5.1 规定 hover 为 **120ms**，现在统一 150ms（150 是"选中切换"的上限，不是 hover 值）。改 token 时一并收。

### 2.2 字号阶梯漂移：31 处用了 V0.3 不存在的档

V0.3 §3 阶梯 = `12–13(caption) / 15(body·H3) / 17(H2) / 20(H1) / 28–32(Display)`，`13.5–14` **只给 Code/Prompt**。实际：

| 实际用法 | px | 是否在阶梯 | 处数 |
|---|---|---|---|
| `text-sm` | 14 | ✗（14 仅限代码） | **27** |
| `text-base` | 16 | ✗（阶梯无此档） | 2（`app/page.tsx:52,84`） |
| `text-[22px]` | 22 | ✗（H1=20、Display=28–32，22 是凭空档） | 2（`budget/page.tsx:32`、`QuoteBoard.tsx:68`） |
| `text-xs` / `text-[15px]` / `text-xl` / `text-[28px]` | 12/15/20/28 | ✓ | 38 |

`text-sm` 已经渗进 5 个核心组件（`Button/Input/Nav/Table/Topbar`），意味着它不是个别手滑，而是**默认刻度没有闸门**。违反 §3"不因追求高级随意修改字号 token"与 §6.4"字号阶梯最多 6 档"。

修法（两步，缺一不可）：
1. `tokens.css` 补字号令牌：`--fs-caption:12px --fs-body:15px --fs-h3:15px --fs-h2:17px --fs-h1:20px --fs-display:28px`；`tailwind.config.ts` 用 `theme.fontSize` **覆盖**（不是 extend）默认档，让 `text-sm/base/lg` 这类越界类名直接不存在——**堵住源头比逐个改文件更重要**，否则 M1b 每一轮新代码都会继续引进来。
2. 再按上表把 31 处映射回阶梯（`text-sm`→按语境分给 12 或 15；`text-[22px]`→20；`text-base`→15）。

### 2.3 间距阶梯漂移：28 处不在 `4/8/12/16/24/32/48` 上

实际值集中在 **2 / 6 / 10 / 20 / 40px**，全部来自 Tailwind 默认的 `0.5 / 1.5 / 2.5 / 5 / 10` 档。分布：

```
QuoteBoard.tsx  60,75,89,122,199,203,227,236   pb-5 mt-1.5 py-10 space-y-2.5 py-1.5 mt-0.5 space-y-0.5
app/page.tsx    46,48,66,75,81,82              py-5 pt-0.5 pt-0.5 mt-10 py-5 pt-0.5
layout.tsx      34,38,46,58                    px-5 mt-1.5 px-5 md:px-10 md:py-10
Table.tsx       29,42  py-2.5      Nav.tsx 36  py-2.5      Badge.tsx 25 py-0.5
Button.tsx 41 gap-1.5   Input.tsx 67 mb-1.5 / 69 ml-0.5   Topbar.tsx 23 gap-2.5
budget/page.tsx 48 py-10
```

另：V0.3 §4 的 `64 / 96` 页面级档（§9.12 实测新增）在注释里漏了，只写了到 48。

修法同字号：`tokens.css` 落 `--sp-1..--sp-24` 令牌 + `tailwind.config.ts` **覆盖** `spacing` 只留合法档；然后一次批量替换。注意 `md:px-10 md:py-10`（40px）想表达的多半是 40→48 或 32，逐个判语境，不要机械替换。

### 2.4 中文行长被算错：`max-w-prose = 42ch` 约等于 25 汉字

§3.1 要求中文正文一行 **33–40 汉字**，并特别注明"≤68ch 是西文度量，中文按字计"。`tailwind.config.ts` 的注释写着"中文正文一行约 33–40 字"，但值给了 `42ch`——`ch` 是数字 `0` 的字宽（约 0.5–0.6em），所以 42ch ≈ 21–25 汉字，**只有要求的一半**，段落会过早折行、显得碎。用在 `app/page.tsx:24,29`、`budget/page.tsx:33`。

修法：改成按 em 计（1em ≈ 1 汉字），`maxWidth.prose = "36em"` 即约 36 汉字。

### 2.5 缺令牌（未来会咬人，不是现在的错）

`tokens.css` 目前只有 色/圆角/字体 三类，缺 字号、间距、动效时长与缓动、阴影 L1–L3 四类。§附 里"机器可读 token 源 + 对比度自动校验脚本"本就是 V0.3 的 DEFERRED 项，但**这个仓库是 V0.3 等的首个真实验证面**——字号/间距不落成令牌就没有闸门，M1b 每轮都会重新引入越界档。

## 3. 两处契约冲突（需 HAE 决策，不是实现问题）

**① 「无阴影」被 AGENTS 简化过头了。** AGENTS §6 写"**无阴影**"，V0.3 §4 原文是"默认无阴影；浮层按 L1–L3 取值，受 Shadow Budget 约束"。M1b 的「从科目库选入」几乎一定要做 Modal 或弹层，V0.3 要求它带 **L3**（`0 12px 32px rgba(26,20,14,.16)` + 遮罩），而当前既无 token、AGENTS 又字面禁止 → 下一轮 codebuddy 只能二选一违规（要么硬弹层违反 §4，要么自己造 `shadow-xl` 违反 §6.6 与 Tailwind 默认值污染）。
建议：AGENTS §6 改述为"默认 L0 无阴影；浮层用 `--shadow-1/2/3` 令牌，取值按 V0.3 §4"，并把这 3 个 token 落进 `tokens.css`。

**② accent 族"4 值"的说法与实际不符。** AGENTS §6 与 `docs/REQUIREMENTS.md` R1 都写"换主题只动 `--accent` 一族（4 值）"，V0.3 §2.1 也这么写；但 §2.2/§2.4 浅色模式下实际只给了 **3 个**（accent / ink / tint），第 4 个是暗色专用的 `--accent-text`（§2.3，且仅铁锈有值 `#D9754F`，钴蓝等三套按 §9.14 明确"待真实暗色项目补、不写死"）。R1 的实现者按"4 值"去数会找不到第 4 个 token。
建议：R1 落地按**浅色 3 值 + 暗色预留 1 值**写；同时这条值得回灌给 `MT-Visual-Language`（§9 观察点或 §2.1 措辞修正），因为它是"首个真实项目验证"该反馈的东西。

## 4. 修复顺序建议

1. `prefers-reduced-motion` + hover 120ms（一处 CSS，立即可做）
2. `tokens.css` 补 字号/间距/动效/阴影 四类令牌 → `tailwind.config.ts` **覆盖** `fontSize`/`spacing` 关掉越界档
3. 批量回填 31 处字号 + 28 处间距 + `max-w-prose`
4. AGENTS §6 两处措辞按 §3 修正，并把"token 覆盖即闸门"写进契约，免得后续模块再漂

第 2 步是真正的杠杆：**先关默认刻度，再谈逐个改**，否则 M1b 每轮新页面都在往回漏。
