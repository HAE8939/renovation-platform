你是 renovation-platform 的实现工程师。工作目录就是本仓库根。

开工前务必完整读取并按其执行：AGENTS.md、CLAUDE.md、docs/BUILD_SPEC_M1.md（重点看「M1a」段）。凡涉及 UI，另读设计系统真源 `E:\19 Python File\MT-Visual-Language\HAE Creator Design System V0.3.md` 并严格遵守（纸感底、单点 accent=钴蓝 #3368A0、无阴影、层级靠字重与对比度）。

本轮【只做 M1a，不要做 M1b】，交付一个能真正跑起来的平台壳 + 预算可看可建：
1) 用 pnpm 初始化 Next.js（App Router + TypeScript + Tailwind + src/ + ESLint），全程非交互（用命令行 flag，不要卡在交互提问）。
2) 建 src/core/db PrismaClient 单例；prisma/schema.prisma 用 provider=sqlite，.env 配 DATABASE_URL="file:./dev.db"。
3) 从 V0.3 落成 src/styles/tokens.css + globals.css；手写 src/core/ui 最小组件（Button/Card/Input/Table/Badge/Nav），禁 Element/Antd 等组件库，禁 box-shadow。
4) 实现模块注册表 src/modules/registry.ts + budget manifest；src/app/layout.tsx 的左侧导航必须【由 registry 动态渲染】，不得写死；src/app/page.tsx 首页渲染预算入口 + 2 个 DEFERRED 占位卡（项目管理/设计管理，标「即将上线」不可点）。
5) 按 AGENTS §4/§5 建核心域与预算实体，跑 `prisma migrate`；写 prisma/seed.ts 灌默认组织、示例客户/项目/报价明细 + 一批【原创】装修科目模板（不得逐字复制 docs/reference 里的行；参考文件只用于理解领域要素）。
6) /budget 列出项目 + 新建项目（Server Action 落库）；/budget/[projectId] 展示分组明细表 + 右侧实时预算看板（直接费/税/总价/单方造价），改数量即时重算。

完成后【必须自己验证到绿】：pnpm install、prisma migrate dev、prisma db seed、`pnpm build` 通过、`pnpm dev` 能在 http://127.0.0.1:3000 起来。控制台无报错、中文、窄屏不破版、界面不像对参考 HTML 的复制。

纪律：严格遵循 AGENTS.md 契约，不擅自扩大范围、不做 M1b、不引入未要求的依赖；遇到与契约冲突或需长期决策的点，停下来在总结里说明并给建议，不要自己改架构。

最后用中文给我一份简报：新增/修改了哪些文件、关键实现决策、我该如何本地验证、以及遗留/风险点。