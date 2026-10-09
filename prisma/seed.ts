/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import { USER_ROLE, DEPARTMENT } from "../src/core/domain/types";

const prisma = new PrismaClient();

/**
 * M1a 演示数据：1 个默认组织 + 1 个客户 + 1 个演示项目 + 1 张报价单，
 * 外加一套原创装修科目模板（4 科目 × 4 项 = 16 项）。
 *
 * 科目内容自拟，仅借鉴"装修预算"的领域要素（科目/单位/材料/施工要求/计算口径），
 * 不复制 docs/reference 里的任何名称或文案。
 *
 * 幂等：默认组织已存在则直接跳过，避免重复灌数。
 * 想重置：删掉 prisma/dev.db 后重跑 seed。
 */

// ── 科目模板（原创） ────────────────────────────────────────────
const CATALOG: {
  name: string;
  order: number;
  items: {
    code: string;
    name: string;
    unit: string;
    defaultPrice: number;
    defaultQty: number;
    materials: string;
    sop: string;
    order: number;
  }[];
}[] = [
  {
    name: "前期准备",
    order: 1,
    items: [
      {
        code: "01.01",
        name: "现场勘查与施工交底",
        unit: "项",
        defaultPrice: 800,
        defaultQty: 1,
        materials: "测量仪器、平面草图、交底记录表",
        sop: "入户量房，复核图纸与实际尺寸的偏差\n业主、施工方、设计方三方书面交底\n变更范围现场确认并签字留档",
        order: 1,
      },
      {
        code: "01.02",
        name: "全屋成品保护",
        unit: "㎡",
        defaultPrice: 12,
        defaultQty: 1,
        materials: "地面保护膜、墙柱阳角硬质护条",
        sop: "入户门与电梯轿厢优先保护\n阳角加装硬质护条防磕碰\n保护膜每日巡查并及时修补",
        order: 2,
      },
      {
        code: "01.03",
        name: "临时水电接驳",
        unit: "项",
        defaultPrice: 450,
        defaultQty: 1,
        materials: "临时配电箱、PE 护套线、防水插座",
        sop: "临时用电单独回路并装漏电保护\n潮湿区域插座选用防水型号\n每日收工前断电核查",
        order: 3,
      },
      {
        code: "01.04",
        name: "垃圾清运方案报备",
        unit: "项",
        defaultPrice: 1200,
        defaultQty: 1,
        materials: "清运合同、袋装垃圾袋",
        sop: "提前与物业确认清运时段与路线\n夜间作业避开住户休息时段\n清运单据逐次留档备查",
        order: 4,
      },
    ],
  },
  {
    name: "拆除与清运",
    order: 2,
    items: [
      {
        code: "02.01",
        name: "非承重墙体拆除",
        unit: "㎡",
        defaultPrice: 55,
        defaultQty: 1,
        materials: "电镐、切割机、防尘膜",
        sop: "拆除前复核结构属性，确认非承重\n分段切割，严禁扰动梁柱与管线\n拆后基层及时清理",
        order: 1,
      },
      {
        code: "02.02",
        name: "原门窗拆除",
        unit: "樘",
        defaultPrice: 95,
        defaultQty: 1,
        materials: "手动工具、洞口护板",
        sop: "洞口结构加护防塌陷\n高层窗体拆除系安全绳作业\n拆除后洞口临时封堵",
        order: 2,
      },
      {
        code: "02.03",
        name: "旧地面面层铲除",
        unit: "㎡",
        defaultPrice: 32,
        defaultQty: 1,
        materials: "电镐、铲刀、编织袋",
        sop: "面层与抹灰层同步铲除\n铲至结构面并清理浮灰\n破损区域单独标记返修",
        order: 3,
      },
      {
        code: "02.04",
        name: "现场垃圾外运",
        unit: "车",
        defaultPrice: 600,
        defaultQty: 1,
        materials: "清运车辆、袋装垃圾袋",
        sop: "按垃圾类别袋装分类\n每车次过磅留单据\n车走场清，保持通道畅通",
        order: 4,
      },
    ],
  },
  {
    name: "水电改造",
    order: 3,
    items: [
      {
        code: "03.01",
        name: "强电线路敷设",
        unit: "m",
        defaultPrice: 38,
        defaultQty: 1,
        materials: "BV 导线、PVC 穿线管、管卡",
        sop: "强弱电分管分槽，间距不小于 300mm\n转角处整管弯弧，不做直角硬折\n线管固定间距不超过 1 米",
        order: 1,
      },
      {
        code: "03.02",
        name: "弱电与网络布线",
        unit: "m",
        defaultPrice: 45,
        defaultQty: 1,
        materials: "CAT6 网线、HDMI 线、信息面板",
        sop: "每个房间预留双位网口\n线缆两端做标签标识\n与强电分槽走线避免干扰",
        order: 2,
      },
      {
        code: "03.03",
        name: "给排水点位改造",
        unit: "项",
        defaultPrice: 260,
        defaultQty: 1,
        materials: "PPR 管、角阀、生料带",
        sop: "打压试验 0.8MPa 保压 30 分钟\n出水口按设备位置复核高度\n检修口预留足够操作空间",
        order: 3,
      },
      {
        code: "03.04",
        name: "开关插座面板安装",
        unit: "位",
        defaultPrice: 28,
        defaultQty: 1,
        materials: "品牌面板、底盒、固定辅料",
        sop: "面板统一品牌与色系\n水平线用尺校准齐平\n通断与接地逐一测试",
        order: 4,
      },
    ],
  },
  {
    name: "泥瓦与防水",
    order: 4,
    items: [
      {
        code: "04.01",
        name: "卫生间墙面防水",
        unit: "㎡",
        defaultPrice: 46,
        defaultQty: 1,
        materials: "聚氨酯防水涂料、附加增强网",
        sop: "基层清理后先做阴阳角附加层\n淋浴区墙面涂刷两遍\n管根与地漏口重点收头",
        order: 1,
      },
      {
        code: "04.02",
        name: "卫生间地面防水",
        unit: "㎡",
        defaultPrice: 46,
        defaultQty: 1,
        materials: "聚氨酯防水涂料、密封材料",
        sop: "地面满刷三遍，向地漏方向找坡\n门槛石处上翻不低于 200mm\n48 小时闭水试验并拍照留痕",
        order: 2,
      },
      {
        code: "04.03",
        name: "客餐厅地砖铺贴",
        unit: "㎡",
        defaultPrice: 138,
        defaultQty: 1,
        materials: "大板地砖、瓷砖胶、找平器",
        sop: "干排预排后再正式铺贴\n砖缝统一控制 2mm 并十字定位\n铺完 24 小时内禁止踩踏",
        order: 3,
      },
      {
        code: "04.04",
        name: "厨卫墙砖铺贴",
        unit: "㎡",
        defaultPrice: 116,
        defaultQty: 1,
        materials: "墙砖、瓷砖胶、十字卡",
        sop: "通缝对缝排版，门洞处整砖优先\n阴阳角收边齐直\n留待勾缝的美缝提前定位",
        order: 4,
      },
    ],
  },
];

// ── 演示项目报价明细：从科目模板快照，数量按本项目现场情况调整 ──
const DEMO_QUOTE: { code: string; quantity: number }[] = [
  { code: "01.01", quantity: 1 },
  { code: "01.02", quantity: 128.6 },
  { code: "01.03", quantity: 1 },
  { code: "02.01", quantity: 36 },
  { code: "02.02", quantity: 12 },
  { code: "02.03", quantity: 96 },
  { code: "02.04", quantity: 5 },
  { code: "03.01", quantity: 420 },
  { code: "03.02", quantity: 160 },
  { code: "03.03", quantity: 8 },
  { code: "03.04", quantity: 88 },
  { code: "04.01", quantity: 58 },
  { code: "04.02", quantity: 16 },
  { code: "04.03", quantity: 58 },
  { code: "04.04", quantity: 68 },
];

async function main() {
  const existing = await prisma.organization.findUnique({ where: { slug: "default" } });
  if (existing) {
    console.log("已存在默认组织，基础数据 seed 跳过（如需重置请删除 prisma/dev.db 后重跑）。");
  } else {
    await seedBaseData();
  }

  // M5-a：设计任务 seed（幂等，独立于基础数据块 —— 老库也能补灌）。
  await seedDesignTasks();
  // M5-b：提交记录 seed（幂等，给 revisions/submitted/approved 任务补版本历史）。
  await seedTaskSubmissions();
}

/** M1a/M2-A 基础数据：组织 + 用户 + 客户 + 项目 + 报价 + 科目模板 + 线索。 */
async function seedBaseData() {
  const org = await prisma.organization.create({
    data: { name: "默认工作室", slug: "default" },
  });

  // 占位用户：P4 接入登录时使用，当前仅落表验证迁移
  await prisma.user.create({
    data: {
      orgId: org.id,
      name: "管理员",
      email: "admin@renovation.local",
      role: "owner",
    },
  });

  const client = await prisma.client.create({
    data: {
      orgId: org.id,
      name: "陈女士",
      phone: "138-0000-0000",
      email: "chen@example.com",
      notes: "三口之家，两孩一宠，对环保与静音有要求。",
    },
  });

  const project = await prisma.project.create({
    data: {
      code: "RP-2026-001",
      name: "云栖名邸 3 栋 1602",
      address: "云栖名邸 3 栋 1602 室",
      area: 128.6,
      clientId: client.id,
      designer: "林岚",
      pm: "周工",
      status: "in_progress",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-11-30T00:00:00.000Z"),
    },
  });

  const quote = await prisma.budgetQuote.create({
    data: {
      projectId: project.id,
      taxRate: 0.03,
      status: "draft",
      note: "M1a 演示报价：数量为现场预估，正式报价以实测为准。",
    },
  });

  // ── M2-A 演示线索（2 条不同 stage）+ 跟进，不建 project（那是 M3）──
  // Lead.projectId 留 null（未签约）。本期只落表，供后续线索管理模块消费。
  await prisma.lead.create({
    data: {
      orgId: org.id,
      code: "LEAD-2026-001",
      name: "王先生",
      phone: "139-0000-0001",
      estate: "锦绣花园 5 栋 901",
      area: 89.5,
      style: "现代简约",
      budgetRange: "15-20 万",
      source: "老客户转介绍",
      stage: "contacted",
      intentLevel: "high",
      assignee: "林岚",
      lastFollowAt: new Date("2026-10-05T00:00:00.000Z"),
      nextFollowAt: new Date("2026-10-12T00:00:00.000Z"),
      followUps: {
        create: [
          {
            content: "首次电话沟通，了解户型与装修意向，约定周末上门量房。",
            date: new Date("2026-10-05T00:00:00.000Z"),
          },
        ],
      },
    },
  });

  await prisma.lead.create({
    data: {
      orgId: org.id,
      code: "LEAD-2026-002",
      name: "李女士",
      phone: "139-0000-0002",
      estate: "滨江公馆 2 栋 1802",
      area: 142.0,
      style: "新中式",
      budgetRange: "30-40 万",
      source: "小红书",
      stage: "quoted",
      intentLevel: "medium",
      assignee: "周工",
      lastFollowAt: new Date("2026-10-08T00:00:00.000Z"),
      nextFollowAt: new Date("2026-10-15T00:00:00.000Z"),
      followUps: {
        create: [
          {
            content: "完成量房，已出初步方案，电子报价单已发送客户。",
            date: new Date("2026-10-08T00:00:00.000Z"),
          },
          {
            content: "客户反馈希望调整主卧布局，待二次沟通确认。",
            date: new Date("2026-10-10T00:00:00.000Z"),
          },
        ],
      },
    },
  });

  // 先灌科目模板（科目与其下的科目项一起写），再按 code 快照成报价明细。
  // 教训：M1a 曾在此只创建了 catalogCategory，CatalogItem 一条没写，
  // 而完成日志按源数组常量算数，把漏项盖住了 —— 故下面改为按真实入库行数报数并加断言。
  await prisma.$transaction(
    CATALOG.map((c) =>
      prisma.catalogCategory.create({
        data: {
          name: c.name,
          order: c.order,
          items: {
            create: c.items.map((it) => ({
              code: it.code,
              name: it.name,
              unit: it.unit,
              defaultPrice: it.defaultPrice,
              defaultQty: it.defaultQty,
              materials: it.materials,
              sop: it.sop,
              order: it.order,
            })),
          },
        },
      })
    )
  );

  const quoteItems = await prisma.quoteItem.createMany({
    data: CATALOG.flatMap((cat, ci) =>
      cat.items.map((it) => {
        const q = DEMO_QUOTE.find((d) => d.code === it.code);
        return {
          quoteId: quote.id,
          categoryName: cat.name,
          code: it.code,
          name: it.name,
          unit: it.unit,
          unitPrice: it.defaultPrice,
          quantity: q?.quantity ?? it.defaultQty,
          materials: it.materials,
          sop: it.sop,
          order: cat.order * 100 + it.order,
        };
      })
    ),
  });

  // 报数一律取数据库真实行数，不取源数组长度 —— 否则漏写会被日志掩盖。
  const [catCount, itemCount, leadCount, followUpCount] = await Promise.all([
    prisma.catalogCategory.count(),
    prisma.catalogItem.count(),
    prisma.lead.count(),
    prisma.followUp.count(),
  ]);

  console.log(
    `seed 完成：组织 1 · 用户 1 · 客户 1 · 项目 1 · 科目 ${catCount} · 模板 ${itemCount} 项 · 报价明细 ${quoteItems.count} 条 · 线索 ${leadCount} · 跟进 ${followUpCount}`
  );

  if (itemCount === 0) {
    throw new Error("seed 自检失败：CatalogItem 实际写入 0 条，科目库页会是空壳");
  }
  if (itemCount !== CATALOG.reduce((n, c) => n + c.items.length, 0)) {
    throw new Error(
      `seed 自检失败：模板应 ${CATALOG.reduce((n, c) => n + c.items.length, 0)} 项，实际入库 ${itemCount} 项`
    );
  }
  // 线索 / 跟进同样按真实入库行数自检（曾经的"日志抄常量掩盖空入库"教训）。
  if (leadCount < 2) {
    throw new Error(`seed 自检失败：Lead 实际写入不足 2 条（实际 ${leadCount} 条）`);
  }
  if (followUpCount < 3) {
    throw new Error(`seed 自检失败：FollowUp 实际写入不足 3 条（实际 ${followUpCount} 条）`);
  }
}

// ── M5-a 设计任务 seed ─────────────────────────────────────────
// 幂等：已有 DesignTask 则只报数不重灌。
// 用户按 email upsert（复用已 seed 的 User），任务挂在库里已有项目上。
// TaskSubmission 不在本函数创建，由下方 seedTaskSubmissions（M5-b）补。
async function seedDesignTasks() {
  const org = await prisma.organization.findUnique({ where: { slug: "default" } });
  if (!org) {
    throw new Error("design seed 自检失败：默认组织不存在，请先运行基础 seed");
  }

  // 2-3 个设计侧用户：designer / design_asst；「审核人」语义复用 designer 角色
  //（USER_ROLE 无独立 reviewer 值，v5.1 11 角色里审核即由设计师承担）。
  const designer = await prisma.user.upsert({
    where: { email: "linlan@renovation.local" },
    update: {},
    create: {
      orgId: org.id,
      name: "林岚",
      email: "linlan@renovation.local",
      role: USER_ROLE.designer,
      department: DEPARTMENT.design,
    },
  });
  const designAsst = await prisma.user.upsert({
    where: { email: "suxiao@renovation.local" },
    update: {},
    create: {
      orgId: org.id,
      name: "苏晓",
      email: "suxiao@renovation.local",
      role: USER_ROLE.design_asst,
      department: DEPARTMENT.design,
    },
  });
  const reviewer = await prisma.user.upsert({
    where: { email: "hemin@renovation.local" },
    update: {},
    create: {
      orgId: org.id,
      name: "何铭",
      email: "hemin@renovation.local",
      role: USER_ROLE.designer, // 审核人语义：资深设计师复核
      department: DEPARTMENT.design,
    },
  });

  const existingCount = await prisma.designTask.count();
  if (existingCount > 0) {
    console.log(`已存在 ${existingCount} 条设计任务，M5-a 任务 seed 跳过。`);
    return;
  }

  const projects = await prisma.project.findMany({ orderBy: { code: "asc" } });
  if (projects.length === 0) {
    throw new Error("design seed 自检失败：库里没有任何项目，设计任务无主脊可挂");
  }

  const year = new Date().getFullYear();
  const day = 24 * 60 * 60 * 1000;
  // 5 条任务：覆盖全部 5 种 status 与 5 种 type；1 条 deadline 已逾期、
  // 1 条待分配（assigneeId=null）、其余指向上面的 seed 用户。
  const TASKS = [
    {
      code: `DES-${year}-001`,
      title: "全案概念方案",
      type: "scheme",
      status: "approved",
      assigneeId: designer.id,
      reviewerId: reviewer.id,
      requirement: "三版概念方向供业主比选，需含风格意向与动线示意。",
      deadline: new Date(Date.now() - 20 * day),
      priority: "medium",
    },
    {
      code: `DES-${year}-002`,
      title: "平面布置深化",
      type: "floorplan",
      status: "submitted",
      assigneeId: designAsst.id,
      reviewerId: designer.id,
      requirement: "按确认概念深化平面，复核家具尺度与过道宽度。",
      deadline: new Date(Date.now() + 10 * day),
      priority: "high",
    },
    {
      code: `DES-${year}-003`,
      title: "客餐厅效果图",
      type: "rendering",
      status: "assigned",
      assigneeId: designer.id,
      reviewerId: reviewer.id,
      requirement: "主视角 + 两个辅助视角，材质贴图需与选型单一致。",
      deadline: new Date(Date.now() - 3 * day), // 刻意已逾期：看板/统计要能标红
      priority: "high",
    },
    {
      code: `DES-${year}-004`,
      title: "全屋施工图深化",
      type: "construction_drawing",
      status: "revisions",
      assigneeId: designAsst.id,
      reviewerId: reviewer.id,
      requirement: "水电点位图与大样节点图待按审核意见返修。",
      deadline: new Date(Date.now() + 5 * day),
      priority: "medium",
    },
    {
      code: `DES-${year}-005`,
      title: "现场复核量房",
      type: "measurement",
      status: "pending",
      assigneeId: null, // 刻意待分配：看板「待分配」列要有真数据
      reviewerId: null,
      requirement: "开工前复核实际尺寸与图纸偏差，出水点位逐一定位。",
      deadline: new Date(Date.now() + 14 * day),
      priority: "low",
    },
  ];

  await prisma.$transaction(
    TASKS.map((t, i) =>
      prisma.designTask.create({
        data: {
          projectId: projects[i % projects.length].id,
          code: t.code,
          title: t.title,
          type: t.type,
          status: t.status,
          assigneeId: t.assigneeId,
          reviewerId: t.reviewerId,
          requirement: t.requirement,
          deadline: t.deadline,
          priority: t.priority,
        },
      })
    )
  );

  // 报数一律取数据库真实行数 + 自检断言（勿抄源数组常量 —— M1a 踩过坑）。
  const [taskCount, userCount, statuses, overdue, unassigned] = await Promise.all([
    prisma.designTask.count(),
    prisma.user.count(),
    prisma.designTask.findMany({ select: { status: true } }),
    prisma.designTask.count({
      where: { deadline: { lt: new Date() }, NOT: { status: "approved" } },
    }),
    prisma.designTask.count({ where: { assigneeId: null } }),
  ]);
  const distinctStatuses = new Set(statuses.map((s) => s.status)).size;

  console.log(
    `M5-a seed 完成：设计用户 ${userCount} · 设计任务 ${taskCount} 条（状态 ${distinctStatuses} 种 · 逾期 ${overdue} · 待分配 ${unassigned}）`
  );

  if (taskCount < 3) {
    throw new Error(`design seed 自检失败：DesignTask 实际写入不足 3 条（实际 ${taskCount} 条）`);
  }
  if (distinctStatuses < 3) {
    throw new Error(`design seed 自检失败：任务状态应至少覆盖 3 种（实际 ${distinctStatuses} 种）`);
  }
  if (overdue < 1) {
    throw new Error(`design seed 自检失败：应至少 1 条已逾期任务（实际 ${overdue} 条）`);
  }
  if (unassigned < 1) {
    throw new Error(`design seed 自检失败：应至少 1 条待分配任务（实际 ${unassigned} 条）`);
  }
}

// ── M5-b：设计任务提交记录（TaskSubmission）seed ──────────────────
// 给 revisions / submitted / approved 三种状态的任务各补版本历史；
// 刻意不给 pending / assigned 任务造提交（它们还没派工/没提交，不造假数据）。
async function seedTaskSubmissions() {
  const existing = await prisma.taskSubmission.count();
  if (existing > 0) {
    console.log(`已存在 ${existing} 条提交记录，M5-b 提交 seed 跳过。`);
    return;
  }

  // 三种状态各取最早一条任务（M5-a seed 按时间升序建，第一条即演示任务）
  const [revisionsTask, submittedTask, approvedTask] = await Promise.all([
    prisma.designTask.findFirst({ where: { status: "revisions" }, orderBy: { createdAt: "asc" } }),
    prisma.designTask.findFirst({ where: { status: "submitted" }, orderBy: { createdAt: "asc" } }),
    prisma.designTask.findFirst({ where: { status: "approved" }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!revisionsTask || !submittedTask || !approvedTask) {
    console.log("库中缺 revisions/submitted/approved 任务，M5-b 提交 seed 跳过（请先跑 M5-a seed）。");
    return;
  }

  const submissionsData = [
    // revisions 任务：v1 被退回（带原因）→ v2 待审核（返修后再提交）
    {
      taskId: revisionsTask.id,
      version: 1,
      note: "全屋施工图初版：水电点位图与卫生间大样节点图，请审核。",
      assetRef: "https://example.com/files/cd-v1",
      submittedBy: revisionsTask.assigneeId,
      result: "rejected",
      rejectReason: "水电点位图与现场管线走向冲突；卫生间大样节点标注深度不足，请按批注返修。",
      reviewedBy: revisionsTask.reviewerId,
      reviewedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    },
    {
      taskId: revisionsTask.id,
      version: 2,
      note: "按批注返修：调整水电点位走向、补齐卫生间大样节点标注。",
      assetRef: "https://example.com/files/cd-v2",
      submittedBy: revisionsTask.assigneeId,
      result: "pending",
      rejectReason: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
    // submitted 任务：v1 待审核
    {
      taskId: submittedTask.id,
      version: 1,
      note: "平面布置深化完成：双卫干湿分区、主卧衣柜与飘窗关系已复核。",
      assetRef: "https://example.com/files/floorplan-v1",
      submittedBy: submittedTask.assigneeId,
      result: "pending",
      rejectReason: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    // approved 任务：v1 已通过（审核人与审核时间指向演示 reviewer）
    {
      taskId: approvedTask.id,
      version: 1,
      note: "全案概念方案三版：现代简约、温暖木质、静谧东方，含风格意向与动线示意。",
      assetRef: null,
      submittedBy: approvedTask.assigneeId,
      result: "approved",
      rejectReason: null,
      reviewedBy: approvedTask.reviewerId,
      reviewedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    },
  ];

  // assigneeId 为 null 的任务不应出现在这三种状态里，但防御性过滤一下
  type SubmissionSeed = (typeof submissionsData)[number] & { submittedBy: string };
  const creatable = submissionsData.filter(
    (s): s is SubmissionSeed => s.submittedBy !== null
  );
  if (creatable.length !== submissionsData.length) {
    throw new Error("M5-b 提交 seed 失败：演示任务的负责人为空，无法确定提交人");
  }

  await prisma.$transaction(
    creatable.map((s) =>
      prisma.taskSubmission.create({
        data: {
          taskId: s.taskId,
          version: s.version,
          note: s.note,
          assetRef: s.assetRef,
          submittedBy: s.submittedBy,
          result: s.result,
          rejectReason: s.rejectReason,
          reviewedBy: s.reviewedBy,
          reviewedAt: s.reviewedAt,
          createdAt: s.createdAt,
        },
      })
    )
  );

  // ── 自检断言（报数一律取 DB 真值，勿抄源数组常量） ──
  const total = await prisma.taskSubmission.count();
  if (total !== 4) {
    throw new Error(`M5-b 提交 seed 自检失败：提交记录应为 4 条，实际 ${total} 条`);
  }

  // revisions 任务版本应连续 [1, 2]
  const revisionsVersions = await prisma.taskSubmission.findMany({
    where: { taskId: revisionsTask.id },
    orderBy: { version: "asc" },
    select: { version: true },
  });
  if (
    revisionsVersions.length !== 2 ||
    revisionsVersions[0].version !== 1 ||
    revisionsVersions[1].version !== 2
  ) {
    throw new Error("M5-b 提交 seed 自检失败：revisions 任务版本应连续为 [1, 2]");
  }

  // pending / assigned 任务不应有任何提交（不造假数据）
  const forbidden = await prisma.designTask.count({
    where: { status: { in: ["pending", "assigned"] }, submissions: { some: {} } },
  });
  if (forbidden > 0) {
    throw new Error(`M5-b 提交 seed 自检失败：pending/assigned 任务不应有提交（实际 ${forbidden} 条）`);
  }

  // rejected 提交必须有退回原因
  const rejectedWithoutReason = await prisma.taskSubmission.count({
    where: { result: "rejected", OR: [{ rejectReason: null }, { rejectReason: "" }] },
  });
  if (rejectedWithoutReason > 0) {
    throw new Error(`M5-b 提交 seed 自检失败：rejected 提交缺少退回原因（实际 ${rejectedWithoutReason} 条）`);
  }

  console.log(`M5-b 提交 seed 完成：TaskSubmission 共 ${total} 条（revisions 任务 v1 已退回 + v2 待审核、submitted 任务 v1 待审核、approved 任务 v1 已通过）。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
