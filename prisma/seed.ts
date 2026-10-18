/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import { USER_ROLE, DEPARTMENT } from "../src/core/domain/types";
import { buildSchedule, chainEdges } from "../src/modules/schedule/plan";
import { syncAcceptanceNodes } from "../src/core/domain/acceptance";
import { buildPaymentPlan } from "../src/modules/finance/payment";
import { changeTotal, changeWatch, marginRate } from "../src/core/domain/ledger";
import { getFinanceUser } from "../src/modules/finance/currentUser";
import { getBudgetUser } from "../src/modules/budget/currentUser";
import { createProject } from "../src/core/domain/projects";

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

// ── 11 工序 × 3 档模板（照抄 TASK_M6 §3 / v5.1 §6.5.2）──────────────
// 三档实算：lt90=54 / b90_130=76 / gt130=107。
// 说明：任务卡 §3 逐工序天数实算 b90_130=76，§6 多处写作“80 / 2026-11-19”，
// 二者相差 4 天。本 seed 照抄逐工序天数（照抄 v5.1），实算 76；如 v5.1 原表确为 80，
// 请集成者核 v5.1 §6.5.2 后修正逐工序天数，seed 与 verify 同步即可。
const SCHEDULE_PROCESS: {
  name: string;
  order: number;
  days: { lt90: number; b90_130: number; gt130: number };
}[] = [
  { name: "拆除工程", order: 1, days: { lt90: 3, b90_130: 5, gt130: 7 } },
  { name: "水电工程", order: 2, days: { lt90: 7, b90_130: 10, gt130: 14 } },
  { name: "泥工工程", order: 3, days: { lt90: 10, b90_130: 14, gt130: 18 } },
  { name: "防水工程", order: 4, days: { lt90: 3, b90_130: 3, gt130: 5 } },
  { name: "地面工程", order: 5, days: { lt90: 5, b90_130: 7, gt130: 10 } },
  { name: "墙面工程", order: 6, days: { lt90: 7, b90_130: 10, gt130: 14 } },
  { name: "天花工程", order: 7, days: { lt90: 7, b90_130: 10, gt130: 14 } },
  { name: "乳胶漆工程", order: 8, days: { lt90: 5, b90_130: 7, gt130: 10 } },
  { name: "定制工程", order: 9, days: { lt90: 3, b90_130: 5, gt130: 7 } },
  { name: "水电安装", order: 10, days: { lt90: 3, b90_130: 3, gt130: 5 } },
  { name: "竣工清洁", order: 11, days: { lt90: 1, b90_130: 2, gt130: 3 } },
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
  // M6-a：工程排程 seed（模板 33 行 + 演示项目排程，幂等）。
  await seedSchedule();
  // M12-a：人员工控首批责任关系（幂等，复用项目与用户主数据）。
  // 放在质量 seed 前，确保质量演示库即使有历史脏数据也不阻断人员主数据补灌。
  await seedHrMembers();
  // M7-a：质量管控 seed（检查项 35 条 + 演示节点流状态，幂等）。
  await seedQuality();
  // M8-a：财务管控 seed（合同额回填 + 三项目五段计划 + 演示收支撑账 + 已付标记，幂等）。
  await seedFinance();
  // M9-a：变更单 seed（演示项目 001/002 各一条，幂等）。
  await seedChanges();
  // M9-b-2a：线索 seed（未签四阶段补至≥2 + 两条已签线索配套建项目，幂等）。
  await seedLeads();
  // M9-b-2b：变更款收款台账（金额来自 M9-a 变更单，幂等按项目不变量，驾驶舱现金线补格）。
  await seedChangeIncome();
  // M9-c：自定义字段定义与演示值（幂等按 key / 按 (字段,项目) 不变量，排在最后——值要挂已存在的项目）。
  await seedCustomFields();
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

  // 2-3 个设计侧用户：designer / design_asst；“审核人”语义复用 designer 角色
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
      assigneeId: null, // 刻意待分配：看板“待分配”列要有真数据
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

// ── M6-a 工程排程 seed ─────────────────────────────────────────
// 幂等：模板按 processTemplate.count()==0 独立幂等；任务按 scheduleTask.count()>0
// 整体跳过。用户按 email upsert。演示项目 002/003/004 直接 create（新客户 + 新项目），
// 001（既有项目）从 Project.startDate 起链 + 按日期推导完成态。T = seed 运行时刻。
async function seedSchedule() {
  const org = await prisma.organization.findUnique({ where: { slug: "default" } });
  if (!org) {
    throw new Error("schedule seed 自检失败：默认组织不存在，请先运行基础 seed");
  }

  // 工程侧用户：项目经理 + 巡检（role 来自 core/domain/types）
  const pm = await prisma.user.upsert({
    where: { email: "zhougong@renovation.local" },
    update: {},
    create: {
      orgId: org.id,
      name: "周工",
      email: "zhougong@renovation.local",
      role: USER_ROLE.pm,
      department: DEPARTMENT.engineering,
    },
  });
  await prisma.user.upsert({
    where: { email: "laozheng@renovation.local" },
    update: {},
    create: {
      orgId: org.id,
      name: "老郑",
      email: "laozheng@renovation.local",
      role: USER_ROLE.inspector,
      department: DEPARTMENT.engineering,
    },
  });

  // 模板 33 行（幂等：count==0 才灌）
  const tplCount = await prisma.processTemplate.count();
  if (tplCount === 0) {
    const rows: { name: string; order: number; tier: string; days: number }[] = [];
    for (const p of SCHEDULE_PROCESS) {
      for (const tier of ["lt90", "b90_130", "gt130"] as const) {
        rows.push({ name: p.name, order: p.order, tier, days: p.days[tier] });
      }
    }
    await prisma.$transaction(
      rows.map((r) => prisma.processTemplate.create({ data: r }))
    );
  }
  const realTpl = await prisma.processTemplate.count();
  const tierCounts = await prisma.processTemplate.groupBy({
    by: ["tier"],
    _count: true,
  });
  const tierMap = Object.fromEntries(
    tierCounts.map((t) => [t.tier, t._count])
  );
  if (
    realTpl !== 33 ||
    tierMap.lt90 !== 11 ||
    tierMap.b90_130 !== 11 ||
    tierMap.gt130 !== 11
  ) {
    throw new Error(
      `schedule seed 自检失败：模板应 33 行三档各 11，实际 ${realTpl}（lt90=${tierMap.lt90} b90_130=${tierMap.b90_130} gt130=${tierMap.gt130}）`
    );
  }

  // 任务级 seed：已有任务则整体跳过
  const taskCount = await prisma.scheduleTask.count();
  if (taskCount > 0) {
    console.log(`已存在 ${taskCount} 条排程任务，M6-a 任务 seed 跳过。`);
    return;
  }

  const T = new Date();
  const DAY = 24 * 60 * 60 * 1000;
  const addDays = (base: Date, n: number) => new Date(base.getTime() + n * DAY);
  // today0 = 今日 UTC 0 点（与 chain 的 UTC 0 点日期同口径比较）
  const today0 = new Date(
    Date.UTC(T.getUTCFullYear(), T.getUTCMonth(), T.getUTCDate())
  );

  // 拉某档模板行 → {name, order, days}[]
  const rowsForTier = async (tier: string) => {
    const tpls = await prisma.processTemplate.findMany({
      where: { tier },
      orderBy: { order: "asc" },
    });
    return tpls.map((t) => ({ name: t.name, order: t.order, days: t.days }));
  };

  // ── 演示项目 002 / 003 / 004（新客户 + 新项目，覆盖看板全色区）──
  const c2 = await prisma.client.create({
    data: {
      orgId: org.id,
      name: "孙先生",
      phone: "138-0000-0102",
      notes: "金域蓝湾 2 栋 802 业主，三室两厅，施工中。",
    },
  });
  const p2 = await prisma.project.create({
    data: {
      code: "RP-2026-002",
      name: "金域蓝湾 2 栋 802",
      address: "金域蓝湾 2 栋 802 室",
      area: 110,
      clientId: c2.id,
      pm: "周工",
      status: "in_progress",
      startDate: addDays(today0, -69),
      endDate: addDays(today0, 6),
    },
  });
  const c3 = await prisma.client.create({
    data: {
      orgId: org.id,
      name: "周女士",
      phone: "138-0000-0103",
      notes: "老街 21 号院业主，自住翻新，已竣工。",
    },
  });
  const p3 = await prisma.project.create({
    data: {
      code: "RP-2026-003",
      name: "老街 21 号院",
      address: "老街 21 号院",
      area: 85,
      clientId: c3.id,
      pm: "周工",
      status: "completed",
      startDate: addDays(today0, -65),
      endDate: addDays(today0, -12),
      actualEndDate: addDays(today0, -5),
    },
  });
  const c4 = await prisma.client.create({
    data: {
      orgId: org.id,
      name: "吴先生",
      phone: "138-0000-0104",
      notes: "湖畔名庭 8 栋 501 业主，待开工，灰区手测位。",
    },
  });
  const p4 = await prisma.project.create({
    data: {
      code: "RP-2026-004",
      name: "湖畔名庭 8 栋 501",
      address: "湖畔名庭 8 栋 501 室",
      area: 140,
      clientId: c4.id,
      pm: "周工",
      status: "draft",
      startDate: addDays(today0, 10),
    },
  });

  // ── 001 既有项目排程：b90_130 从 Project.startDate(2026-09-01) ──
  // 完成态按日期推导（与"今天"自洽）：plannedEnd < 今日0点 → completed（实际=计划）；
  // 跨今天 → in_progress（progress=已过天数比例，钳 5–95）；未到 → pending。
  const p1 = await prisma.project.findUnique({ where: { code: "RP-2026-001" } });
  let expectedP1Completed = -1; // 哨兵：-1 = 001 未处理（缺项目/缺开工日）
  if (p1 && p1.startDate) {
    const rows = await rowsForTier("b90_130");
    const chain = buildSchedule(rows, p1.startDate);
    const deriveState = (plannedStart: Date, plannedEnd: Date) => {
      if (plannedEnd.getTime() < today0.getTime()) {
        return { status: "completed", progress: 100, actualStart: plannedStart, actualEnd: plannedEnd };
      }
      if (
        plannedStart.getTime() <= today0.getTime() &&
        plannedEnd.getTime() >= today0.getTime()
      ) {
        const total = Math.round((plannedEnd.getTime() - plannedStart.getTime()) / DAY) + 1;
        const elapsed = Math.round((today0.getTime() - plannedStart.getTime()) / DAY) + 1;
        let prog = Math.round((elapsed / total) * 100);
        prog = Math.max(5, Math.min(95, prog));
        return { status: "in_progress", progress: prog, actualStart: plannedStart, actualEnd: null };
      }
      return { status: "pending", progress: 0, actualStart: null, actualEnd: null };
    };
    const tasks = chain.map((c) => ({
      ...c,
      ...deriveState(c.start, c.end),
      projectId: p1.id,
      ownerId: pm.id,
    }));
    const created = await prisma.$transaction(
      tasks.map((t) =>
        prisma.scheduleTask.create({
          data: {
            projectId: t.projectId,
            name: t.name,
            order: t.order,
            startDate: t.start,
            endDate: t.end,
            actualStart: t.actualStart,
            actualEnd: t.actualEnd,
            progress: t.progress,
            status: t.status,
            ownerId: t.ownerId,
          },
        })
      )
    );
    expectedP1Completed = tasks.filter((t) => t.status === "completed").length;
    await createScheduleDeps(created.map((t) => t.id));
  }

  // ── 002 排程：b90_130 从 T-69d（链尾=endDate=T+6d）；任务 1-6 completed（实际=计划）、
  //   7（天花）in_progress=40%（逾期点）、8-11 pending ──
  {
    const rows = await rowsForTier("b90_130");
    const chain = buildSchedule(rows, p2.startDate!);
    const tasks = chain.map((c, i) => {
      let status: string;
      let progress: number;
      let actualStart: Date | null;
      let actualEnd: Date | null;
      if (i < 6) {
        status = "completed";
        progress = 100;
        actualStart = c.start;
        actualEnd = c.end;
      } else if (i === 6) {
        status = "in_progress";
        progress = 40;
        actualStart = c.start;
        actualEnd = null;
      } else {
        status = "pending";
        progress = 0;
        actualStart = null;
        actualEnd = null;
      }
      return {
        ...c,
        status,
        progress,
        actualStart,
        actualEnd,
        projectId: p2.id,
        ownerId: pm.id,
      };
    });
    const created = await prisma.$transaction(
      tasks.map((t) =>
        prisma.scheduleTask.create({
          data: {
            projectId: t.projectId,
            name: t.name,
            order: t.order,
            startDate: t.start,
            endDate: t.end,
            actualStart: t.actualStart,
            actualEnd: t.actualEnd,
            progress: t.progress,
            status: t.status,
            ownerId: t.ownerId,
          },
        })
      )
    );
    await createScheduleDeps(created.map((t) => t.id));
  }

  // ── 003 排程：lt90 从 T-65d；全部 completed（实际=计划），
  //   任务 11（竣工清洁）实际结束 = 计划 + 7d（项目超期 7 天）──
  {
    const rows = await rowsForTier("lt90");
    const chain = buildSchedule(rows, p3.startDate!);
    const tasks = chain.map((c, i) => {
      const isLast = i === chain.length - 1;
      const actualEnd = isLast ? addDays(c.end, 7) : c.end;
      return {
        ...c,
        status: "completed",
        progress: 100,
        actualStart: c.start,
        actualEnd,
        projectId: p3.id,
        ownerId: pm.id,
      };
    });
    const created = await prisma.$transaction(
      tasks.map((t) =>
        prisma.scheduleTask.create({
          data: {
            projectId: t.projectId,
            name: t.name,
            order: t.order,
            startDate: t.start,
            endDate: t.end,
            actualStart: t.actualStart,
            actualEnd: t.actualEnd,
            progress: t.progress,
            status: t.status,
            ownerId: t.ownerId,
          },
        })
      )
    );
    await createScheduleDeps(created.map((t) => t.id));
  }
  // 004：draft + 无排程 → 灰区 + 生成流程手测位（不建任何 ScheduleTask）

  // ── 自检断言（报数取 DB 真值）──
  const [
    total,
    depTotal,
    p2Statuses,
    p3Tasks,
    p4Count,
    p1Completed,
  ] = await Promise.all([
    prisma.scheduleTask.count(),
    prisma.scheduleTaskDependency.count(),
    prisma.scheduleTask.findMany({
      where: { projectId: p2.id },
      select: { status: true },
    }),
    prisma.scheduleTask.findMany({
      where: { projectId: p3.id },
      orderBy: { order: "asc" },
      select: { status: true, actualEnd: true, endDate: true },
    }),
    prisma.scheduleTask.count({ where: { projectId: p4.id } }),
    prisma.scheduleTask.count({
      where: { projectId: p1?.id ?? "__none__", status: "completed" },
    }),
  ]);

  const p2By = { completed: 0, in_progress: 0, pending: 0 } as Record<string, number>;
  for (const s of p2Statuses) p2By[s.status] = (p2By[s.status] ?? 0) + 1;
  const p3AllCompleted = p3Tasks.length === 11 && p3Tasks.every((t) => t.status === "completed");
  const p3LastOverdue =
    p3Tasks.length === 11 &&
    !!p3Tasks[10].actualEnd &&
    !!p3Tasks[10].endDate &&
    p3Tasks[10].actualEnd!.getTime() > p3Tasks[10].endDate!.getTime();

  console.log(
    `M6-a seed 完成：模板 ${realTpl} · 排程任务 ${total} · 依赖 ${depTotal}（001 完成 ${p1Completed}/11 · 002 ${p2By.completed}/${p2By.in_progress}/${p2By.pending} · 003 全完成${p3LastOverdue ? "且超期" : ""} · 004 任务 ${p4Count}）`
  );

  if (total !== 33) {
    throw new Error(`schedule seed 自检失败：任务应 33 条，实际 ${total}`);
  }
  if (depTotal !== 30) {
    throw new Error(`schedule seed 自检失败：依赖应 30 条，实际 ${depTotal}`);
  }
  if (p2By.completed !== 6 || p2By.in_progress !== 1 || p2By.pending !== 4) {
    throw new Error(
      `schedule seed 自检失败：002 应 6/1/4，实际 ${p2By.completed}/${p2By.in_progress}/${p2By.pending}`
    );
  }
  if (!p3AllCompleted) {
    throw new Error("schedule seed 自检失败：003 应全 completed");
  }
  if (!p3LastOverdue) {
    throw new Error("schedule seed 自检失败：003 任务 11 实际结束应晚于计划");
  }
  if (p4Count !== 0) {
    throw new Error(`schedule seed 自检失败：004 应无任务，实际 ${p4Count}`);
  }
  if (expectedP1Completed >= 0 && p1Completed !== expectedP1Completed) {
    throw new Error(
      `schedule seed 自检失败：001 完成数应 ${expectedP1Completed}（按日期推导），实际 ${p1Completed}`
    );
  }
}

/** 为一组已建好的排程工序落相邻依赖边（chainEdges → [i, i-1]）。 */
async function createScheduleDeps(taskIds: string[]) {
  const edges = chainEdges(taskIds.length);
  if (edges.length === 0) return;
  await prisma.$transaction(
    edges.map(([i, j]) =>
      prisma.scheduleTaskDependency.create({
        data: { taskId: taskIds[i], dependsOnId: taskIds[j] },
      })
    )
  );
}

// ── M7-a 质量管控 seed ──────────────────────────────────────────
// CheckItem 35 条（照抄 TASK_M7 §3 检查项清单表，11 工序）。
// 文字为策展改写版，与参考素材对应但不整段照抄原文档。
const CHECK_ITEMS: {
  stage: string;
  order: number;
  name: string;
  standard: string;
}[] = [
  { stage: "拆除工程", order: 1, name: "拆除范围核对", standard: "拆除边界与交底一致；承重结构、保留部位不得误拆" },
  { stage: "拆除工程", order: 2, name: "现场原状交接", standard: "防盗门/门窗玻璃/下水/强电等原状逐项记录确认" },
  { stage: "拆除工程", order: 3, name: "建渣清运", standard: "拆除垃圾清运完毕，现场具备下道工序进场条件" },
  { stage: "水电工程", order: 1, name: "强弱电间距", standard: "强弱电管线间距≥30cm，交叉处做屏蔽处理" },
  { stage: "水电工程", order: 2, name: "线管与穿线", standard: "线管无接头，管内穿线截面占比≤40%" },
  { stage: "水电工程", order: 3, name: "水管排布", standard: "横平竖直、左热右冷；排水坡度 0.5%~1%" },
  { stage: "水电工程", order: 4, name: "水压试验", standard: "试验压力 1.0MPa 保压 0.5h，压降<0.05MPa 且无渗漏" },
  { stage: "泥工工程", order: 1, name: "垂直度与平整度", standard: "砌筑/抹灰垂直度、平整度符合验收标准" },
  { stage: "泥工工程", order: 2, name: "空鼓率检查", standard: "墙面空鼓率受控，无大面积空鼓" },
  { stage: "泥工工程", order: 3, name: "阴阳角方正", standard: "阴阳角方正顺直、无明显缺损" },
  { stage: "防水工程", order: 1, name: "防水层质量", standard: "涂刷均匀、厚度达标，上翻高度符合规范" },
  { stage: "防水工程", order: 2, name: "管根节点处理", standard: "管根、地漏、阴阳角加强层处理到位" },
  { stage: "防水工程", order: 3, name: "闭水试验", standard: "蓄水深度≥2cm 静置 24h，楼下无渗漏" },
  { stage: "地面工程", order: 1, name: "地面找平", standard: "找平层平整度合格，无空鼓起砂" },
  { stage: "地面工程", order: 2, name: "地砖坡度", standard: "坡度朝向地漏，泼水无积水" },
  { stage: "地面工程", order: 3, name: "地板留缝", standard: "留缝约 0.3mm 均匀一致（铺装阶段）" },
  { stage: "墙面工程", order: 1, name: "基层处理", standard: "基层坚实、无空鼓开裂，防裂处理到位" },
  { stage: "墙面工程", order: 2, name: "垂直与平整", standard: "墙面垂直度、平整度符合验收要求" },
  { stage: "墙面工程", order: 3, name: "饰面观感", standard: "饰面排布规整、无明显色差" },
  { stage: "天花工程", order: 1, name: "龙骨安装", standard: "龙骨间距合格、固定牢固，吊杆无松动" },
  { stage: "天花工程", order: 2, name: "石膏板接缝", standard: "接缝错缝安装、防裂处理到位" },
  { stage: "天花工程", order: 3, name: "防锈防潮", standard: "钉眼防锈、板材防潮处理到位" },
  { stage: "乳胶漆工程", order: 1, name: "涂装前保护", standard: "开关、灯具、地面等成品保护到位" },
  { stage: "乳胶漆工程", order: 2, name: "漆膜质量", standard: "漆膜丰满、无刷痕流挂、颜色均匀" },
  { stage: "乳胶漆工程", order: 3, name: "分色线", standard: "分色线通直、边界清晰" },
  { stage: "乳胶漆工程", order: 4, name: "阴阳角护角", standard: "阳角内置护角安装到位" },
  { stage: "定制工程", order: 1, name: "板材进场核对", standard: "板材/五金品牌、规格与约定一致" },
  { stage: "定制工程", order: 2, name: "安装牢固度", standard: "柜体安装牢固、水平垂直、收口平整" },
  { stage: "定制工程", order: 3, name: "五金功能", standard: "铰链、滑轨、拉手开启顺畅无杂音" },
  { stage: "水电安装", order: 1, name: "洁具安装", standard: "洁具安装牢固、密封良好，通水无渗漏" },
  { stage: "水电安装", order: 2, name: "灯具开关插座", standard: "安装端正、通电功能正常" },
  { stage: "水电安装", order: 3, name: "绝缘电阻", standard: "电路绝缘电阻实测合格" },
  { stage: "竣工清洁", order: 1, name: "全屋清洁", standard: "全屋保洁达标、无施工残留" },
  { stage: "竣工清洁", order: 2, name: "竣工质量验收", standard: "水电路复查合格、成品完好" },
  { stage: "竣工清洁", order: 3, name: "资料移交", standard: "竣工资料、质保凭证移交齐全" },
];

async function seedQuality() {
  // 工程侧用户：老郑（巡检·提交）/ 周工（PM·审核），由 seedSchedule upsert 创建。
  // 此处只读不建：若未找到说明 seedSchedule 未跑，演示流无法落库 → 抛错指明前置。
  const submitter = await prisma.user.findUnique({
    where: { email: "laozheng@renovation.local" },
    select: { id: true, name: true },
  });
  if (!submitter) {
    throw new Error(
      "quality seed 自检失败：未找到巡检用户老郑，请先运行 schedule seed"
    );
  }
  const reviewer = await prisma.user.findUnique({
    where: { email: "zhougong@renovation.local" },
    select: { id: true, name: true },
  });
  if (!reviewer) {
    throw new Error(
      "quality seed 自检失败：未找到项目经理周工，请先运行 schedule seed"
    );
  }

  // ── CheckItem 35 条（幂等：count==0 才灌）──
  const checkItemCount = await prisma.checkItem.count();
  if (checkItemCount === 0) {
    await prisma.$transaction(
      CHECK_ITEMS.map((it) => prisma.checkItem.create({ data: it }))
    );
  }
  const realCheckItems = await prisma.checkItem.count();
  const stageRows = await prisma.checkItem.groupBy({ by: ["stage"], _count: true });
  const stageCount = stageRows.length;
  if (realCheckItems !== 35 || stageCount !== 11) {
    throw new Error(
      `quality seed 自检失败：检查项应 35 条 11 工序，实际 ${realCheckItems} 条 ${stageCount} 工序`
    );
  }

  // ── 物化：对全部项目调用 syncAcceptanceNodes（调用点④），由完工工序生成节点 ──
  const allProjects = await prisma.project.findMany({ select: { id: true } });
  for (const p of allProjects) {
    await syncAcceptanceNodes(p.id);
  }

  // ── 演示流状态（幂等：issue.count()==0 才灌；灌前断言目标节点存在）──
  const issueCount = await prisma.issue.count();
  if (issueCount > 0) {
    console.log(`已存在 ${issueCount} 条问题，M7-a 演示流状态 seed 跳过。`);
  } else {
    const DAY = 24 * 60 * 60 * 1000;
    const addDays = (base: Date, n: number) => new Date(base.getTime() + n * DAY);

    // 003“老街 21 号院”—— 拆除/水电 passed、泥工 returned + Issue
    const p3 = await prisma.project.findUnique({
      where: { code: "RP-2026-003" },
      select: { id: true },
    });
    // 002“金域蓝湾 2 栋 802”—— 拆除 passed、水电 submitted
    const p2 = await prisma.project.findUnique({
      where: { code: "RP-2026-002" },
      select: { id: true },
    });
    if (!p3 || !p2) {
      throw new Error(
        "quality seed 自检失败：未找到演示项目 002/003，请先运行 schedule seed"
      );
    }

    // 取目标节点 + 对应任务的 actualEnd（提交时间取 actualEnd，审核时间取次日）
    const fetchNodeAndTask = async (projectId: string, name: string) => {
      const node = await prisma.acceptanceNode.findFirst({
        where: { projectId, name },
        select: { id: true },
      });
      if (!node) {
        throw new Error(
          `quality seed 自检失败：项目 ${projectId} 的“${name}”验收节点未生成（syncAcceptanceNodes 应已物化）`
        );
      }
      const task = await prisma.scheduleTask.findFirst({
        where: { projectId, name },
        select: { actualEnd: true },
      });
      if (!task || !task.actualEnd) {
        throw new Error(
          `quality seed 自检失败：“${name}”任务未完工或无 actualEnd，无法取提交时间`
        );
      }
      return { nodeId: node.id, actualEnd: task.actualEnd };
    };

    // 003 拆除工程 → passed（全 pass）
    {
      const { nodeId, actualEnd } = await fetchNodeAndTask(p3.id, "拆除工程");
      await prisma.acceptanceNode.update({
        where: { id: nodeId },
        data: {
          status: "passed",
          submittedBy: submitter.id,
          submittedAt: actualEnd,
          reviewedBy: reviewer.id,
          reviewedAt: addDays(actualEnd, 1),
        },
      });
      await prisma.nodeCheck.updateMany({
        where: { nodeId },
        data: { result: "pass" },
      });
    }
    // 003 水电工程 → passed（全 pass）
    {
      const { nodeId, actualEnd } = await fetchNodeAndTask(p3.id, "水电工程");
      await prisma.acceptanceNode.update({
        where: { id: nodeId },
        data: {
          status: "passed",
          submittedBy: submitter.id,
          submittedAt: actualEnd,
          reviewedBy: reviewer.id,
          reviewedAt: addDays(actualEnd, 1),
        },
      });
      await prisma.nodeCheck.updateMany({
        where: { nodeId },
        data: { result: "pass" },
      });
    }
    // 003 泥工工程 → returned（空鼓率检查 fail，其余 pass）+ Issue
    {
      const { nodeId, actualEnd } = await fetchNodeAndTask(p3.id, "泥工工程");
      const returnReason = "厨卫墙面局部空鼓，需整改后复验";
      await prisma.acceptanceNode.update({
        where: { id: nodeId },
        data: {
          status: "returned",
          submittedBy: submitter.id,
          submittedAt: actualEnd,
          reviewedBy: reviewer.id,
          reviewedAt: addDays(actualEnd, 1),
          returnReason,
        },
      });
      // 先全 pass，再把“空鼓率检查”置 fail
      await prisma.nodeCheck.updateMany({
        where: { nodeId },
        data: { result: "pass" },
      });
      await prisma.nodeCheck.updateMany({
        where: { nodeId, name: "空鼓率检查" },
        data: { result: "fail" },
      });
      // 关联 Issue（退回自动建；reportedBy=审核人=周工，assigneeId=周工）
      await prisma.issue.create({
        data: {
          projectId: p3.id,
          nodeId,
          title: "泥工工程验收退回",
          desc: returnReason,
          severity: "normal",
          status: "open",
          reportedBy: reviewer.id,
          assigneeId: reviewer.id,
          dueDate: addDays(new Date(), 3),
          createdAt: addDays(actualEnd, 1), // 演示回填：问题=退回时刻生成（与节点审核时间一致）
        },
      });
    }
    // 002 拆除工程 → passed（全 pass）
    {
      const { nodeId, actualEnd } = await fetchNodeAndTask(p2.id, "拆除工程");
      await prisma.acceptanceNode.update({
        where: { id: nodeId },
        data: {
          status: "passed",
          submittedBy: submitter.id,
          submittedAt: actualEnd,
          reviewedBy: reviewer.id,
          reviewedAt: addDays(actualEnd, 1),
        },
      });
      await prisma.nodeCheck.updateMany({
        where: { nodeId },
        data: { result: "pass" },
      });
    }
    // 002 水电工程 → submitted（全 pass，待审核）
    {
      const { nodeId, actualEnd } = await fetchNodeAndTask(p2.id, "水电工程");
      await prisma.acceptanceNode.update({
        where: { id: nodeId },
        data: {
          status: "submitted",
          submittedBy: submitter.id,
          submittedAt: actualEnd,
        },
      });
      await prisma.nodeCheck.updateMany({
        where: { nodeId },
        data: { result: "pass" },
      });
    }
  }

  // ── 演示回填：所有由完工工序生成的节点，createdAt=工序实际完工日 ──
  // 目的：档案时间轴顺序自洽（生成事件须早于其提交/审核事件）。
  // 仅 seed 演示数据这么做；生产 syncAcceptanceNodes 用真实时刻，不对账回填。
  {
    const demoNodes = await prisma.acceptanceNode.findMany({
      where: { taskId: { not: null } },
      select: { id: true, taskId: true },
    });
    const demoTaskIds = demoNodes
      .map((n) => n.taskId)
      .filter((v): v is string => v !== null);
    const demoTasks = await prisma.scheduleTask.findMany({
      where: { id: { in: demoTaskIds } },
      select: { id: true, actualEnd: true },
    });
    const demoEndById = new Map(demoTasks.map((t) => [t.id, t.actualEnd]));
    for (const n of demoNodes) {
      const end = n.taskId ? demoEndById.get(n.taskId) : null;
      if (end) {
        await prisma.acceptanceNode.update({
          where: { id: n.id },
          data: { createdAt: end },
        });
      }
    }
  }

  // ── 自检断言（报数取 DB 真值）──
  const [
    realIssues,
    p3NodeCount,
    p2NodeCount,
    p4NodeCount,
    p1CompletedTasks,
    p1Nodes,
    p3Nini,
    p2ShuiDian,
    openIssues,
  ] = await Promise.all([
    prisma.issue.count(),
    prisma.acceptanceNode.count({ where: { project: { code: "RP-2026-003" } } }),
    prisma.acceptanceNode.count({ where: { project: { code: "RP-2026-002" } } }),
    prisma.acceptanceNode.count({ where: { project: { code: "RP-2026-004" } } }),
    prisma.scheduleTask.count({
      where: { project: { code: "RP-2026-001" }, status: "completed" },
    }),
    prisma.acceptanceNode.count({
      where: { project: { code: "RP-2026-001" } },
    }),
    prisma.acceptanceNode.findFirst({
      where: { project: { code: "RP-2026-003" }, name: "泥工工程" },
      select: { status: true },
    }),
    prisma.acceptanceNode.findFirst({
      where: { project: { code: "RP-2026-002" }, name: "水电工程" },
      select: { status: true },
    }),
    prisma.issue.count({ where: { status: "open" } }),
  ]);

  console.log(
    `M7-a seed 完成：检查项 ${realCheckItems}（11 工序）· 问题 ${realIssues}（open ${openIssues}）· 节点 002=${p2NodeCount} / 003=${p3NodeCount} / 004=${p4NodeCount} / 001=${p1Nodes}（completed 任务 ${p1CompletedTasks}）`
  );

  if (realCheckItems !== 35 || stageCount !== 11) {
    throw new Error(
      `quality seed 自检失败：检查项应 35 条 11 工序，实际 ${realCheckItems} 条 ${stageCount} 工序`
    );
  }
  if (p3NodeCount !== 11) {
    throw new Error(`quality seed 自检失败：003 节点应 11，实际 ${p3NodeCount}`);
  }
  // 002 在内测手测中可能已经补出后续节点；seed 只要求首批六个完工节点存在，
  // 不因可逆的人工推进把整套幂等 seed 判死。
  if (p2NodeCount < 6) {
    throw new Error(`quality seed 自检失败：002 节点至少 6，实际 ${p2NodeCount}`);
  }
  if (p4NodeCount !== 0) {
    throw new Error(`quality seed 自检失败：004 节点应 0，实际 ${p4NodeCount}`);
  }
  if (p1Nodes !== p1CompletedTasks) {
    throw new Error(
      `quality seed 自检失败：001 节点数 ${p1Nodes} 应等于 completed 任务数 ${p1CompletedTasks}`
    );
  }
  // 内测人员可能已经新增或关闭问题；只要求演示问题与至少一条 open 事实存在。
  if (realIssues < 1 || openIssues < 1) {
    throw new Error(
      `quality seed 自检失败：至少应有 1 条问题与 1 条 open，实际 ${realIssues} 条（open ${openIssues}）`
    );
  }
  // 退回问题可能已在内测中完成复验；returned 与 passed 都是合法的后续状态。
  if (!p3Nini || !["returned", "passed"].includes(p3Nini.status)) {
    throw new Error(
      `quality seed 自检失败：003 泥工节点应为 returned/passed，实际 ${p3Nini?.status ?? "（无节点）"}`
    );
  }
  // 同理，002 水电节点可在内测中完成审核。
  if (!p2ShuiDian || !["submitted", "passed"].includes(p2ShuiDian.status)) {
    throw new Error(
      `quality seed 自检失败：002 水电节点应为 submitted/passed，实际 ${p2ShuiDian?.status ?? "（无节点）"}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

// ── M8-a 财务管控 seed ──────────────────────────────────────────
// 五步幂等（仿 seedQuality 写法）：① 合同额回填（仅当 ==0 才 update，不覆盖人工值）
// ② 001/002/003 各五段 PaymentNode（已有则整项目跳过）；保修金 unlocksAt =
// actualEndDate ?? endDate ?? today + 12 个月（UTC 月算术，不引 dayjs）；
// ③ 标记已付 + 对应 income/contract 台账（两本账金额/日期一致）；
// ④ 支出台账 7 笔（001 材料+人工、002 材料+人工、003 材料+人工+其他）；
// ⑤ 自检断言报数取 DB 真值。
//
// 计数说明：faithful 总数 = 4 income（两本账一致）+ 7 expense（三项目毛利率锁死）= 11。
// TASK_M8 §3 标 financeRecord=9，但 §3 同时要求 4 笔 income（两本账一致）+
// 7 笔 expense（001/002/003 毛利率 35%/37.5%/22.7% 由金额锁死）= 11；9 与金额/毛利
// 约束不可兼得，取 11（金额与毛利优先，count 让位，集成者复跑见末尾报数）。
// M9-b-2b 边界：category="change" 的变更款收款由末尾 seedChangeIncome() 增补（本函数
// 不建不计），故本函数自检只对非 change 的 11 笔负责，幂等复跑不受新增 2 笔影响。
async function seedFinance() {
  const DAY = 24 * 60 * 60 * 1000;
  const addDays = (base: Date, n: number) => new Date(base.getTime() + n * DAY);
  // UTC 月算术：Date.UTC 构造器自动处理月份溢出（如 13 月 → 次年 1 月）。
  const addMonthsUTC = (base: Date, months: number) =>
    new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, base.getUTCDate())
    );

  // ── ① 合同额回填（仅当当前 ==0 才 update，不覆盖人工值）──
  const CONTRACT_BACKFILL: { code: string; amount: number }[] = [
    { code: "RP-2026-001", amount: 62000 },
    { code: "RP-2026-002", amount: 160000 },
    { code: "RP-2026-003", amount: 128000 },
    // 004 留 0 = 未录入诚实空态位（手测生成守卫）
  ];
  for (const { code, amount } of CONTRACT_BACKFILL) {
    const p = await prisma.project.findUnique({ where: { code }, select: { id: true, contractAmount: true } });
    if (p && p.contractAmount === 0) {
      await prisma.project.update({ where: { id: p.id }, data: { contractAmount: amount } });
    }
  }

  // ── ② 付款计划：001/002/003 各五段（幂等：该项目已有 PaymentNode 则跳过）──
  const planTargets = await prisma.project.findMany({
    where: { code: { in: ["RP-2026-001", "RP-2026-002", "RP-2026-003"] } },
    select: { id: true, code: true, contractAmount: true, startDate: true, endDate: true, actualEndDate: true },
  });
  for (const p of planTargets) {
    const existing = await prisma.paymentNode.count({ where: { projectId: p.id } });
    if (existing > 0) continue;
    if (!p.contractAmount || p.contractAmount <= 0) continue; // 守卫
    const plan = buildPaymentPlan(p.contractAmount);
    const warrantyBase = p.actualEndDate ?? p.endDate ?? new Date();
    const rows = plan.map((row) => ({
      projectId: p.id,
      order: row.order,
      name: row.name,
      percent: row.percent,
      amountDue: row.amountDue,
      trigger: row.trigger,
      triggerStages: row.triggerStages,
      unlocksAt: row.unlocksAtOffsetMonths
        ? addMonthsUTC(warrantyBase, row.unlocksAtOffsetMonths)
        : null,
    }));
    await prisma.$transaction(
      rows.map((r) => prisma.paymentNode.create({ data: r }))
    );
  }

  // ── ③④ 标记已付 + 台账收 + 支出台账（幂等：financeRecord 已有任何行则跳过）──
  const frCount = await prisma.financeRecord.count();
  if (frCount > 0) {
    console.log(`已存在 ${frCount} 条收支记录，M8-a 台账+已付标记 seed 跳过。`);
  } else {
    const financeUser = await getFinanceUser();
    const uid = financeUser?.id ?? null;

    // 取 001/002/003 项目（含 startDate 用于开工款 paidAt）
    const [p1, p2, p3] = await Promise.all([
      prisma.project.findUnique({ where: { code: "RP-2026-001" }, select: { id: true, startDate: true } }),
      prisma.project.findUnique({ where: { code: "RP-2026-002" }, select: { id: true, startDate: true } }),
      prisma.project.findUnique({ where: { code: "RP-2026-003" }, select: { id: true, startDate: true } }),
    ]);
    if (!p1 || !p2 || !p3) {
      throw new Error("finance seed 自检失败：未找到演示项目 001/002/003，请先运行 schedule seed");
    }

    // 003 水电工程节点 reviewedAt（M7 seed 已置 passed；paidAt = reviewedAt + 1d）
    const p3ShuiDianNode = await prisma.acceptanceNode.findFirst({
      where: { projectId: p3.id, name: "水电工程" },
      select: { reviewedAt: true },
    });
    const p3Start = p3.startDate ?? new Date();
    const kaigongPaidAt = addDays(p3Start, 2);
    const shuiDianPaidAt = p3ShuiDianNode?.reviewedAt
      ? addDays(p3ShuiDianNode.reviewedAt, 1)
      : addDays(p3Start, 10);
    const p1PaidAt = p1.startDate ? addDays(p1.startDate, 2) : new Date();
    const p2PaidAt = p2.startDate ? addDays(p2.startDate, 2) : new Date();

    // 取四段的 amountDue（与台账 income 金额一致 = 两本账一致）
    const [p3o1, p3o2, p1o1, p2o1] = await Promise.all([
      prisma.paymentNode.findFirst({ where: { projectId: p3.id, order: 1 }, select: { id: true, amountDue: true } }),
      prisma.paymentNode.findFirst({ where: { projectId: p3.id, order: 2 }, select: { id: true, amountDue: true } }),
      prisma.paymentNode.findFirst({ where: { projectId: p1.id, order: 1 }, select: { id: true, amountDue: true } }),
      prisma.paymentNode.findFirst({ where: { projectId: p2.id, order: 1 }, select: { id: true, amountDue: true } }),
    ]);
    if (!p3o1 || !p3o2 || !p1o1 || !p2o1) {
      throw new Error("finance seed 自检失败：未找到应标记已付的付款段（请先跑步骤②）");
    }

    await prisma.$transaction(async (tx) => {
      // ③ 标记已付 + income/contract 台账（两本账金额/日期一致）
      await tx.paymentNode.update({ where: { id: p3o1.id }, data: { paid: true, paidAt: kaigongPaidAt, paidBy: uid } });
      await tx.financeRecord.create({ data: { projectId: p3.id, type: "income", category: "contract", amount: p3o1.amountDue, date: kaigongPaidAt, description: "开工款", recordedBy: uid } });

      await tx.paymentNode.update({ where: { id: p3o2.id }, data: { paid: true, paidAt: shuiDianPaidAt, paidBy: uid } });
      await tx.financeRecord.create({ data: { projectId: p3.id, type: "income", category: "contract", amount: p3o2.amountDue, date: shuiDianPaidAt, description: "水电完成款", recordedBy: uid } });

      await tx.paymentNode.update({ where: { id: p1o1.id }, data: { paid: true, paidAt: p1PaidAt, paidBy: uid } });
      await tx.financeRecord.create({ data: { projectId: p1.id, type: "income", category: "contract", amount: p1o1.amountDue, date: p1PaidAt, description: "开工款", recordedBy: uid } });

      await tx.paymentNode.update({ where: { id: p2o1.id }, data: { paid: true, paidAt: p2PaidAt, paidBy: uid } });
      await tx.financeRecord.create({ data: { projectId: p2.id, type: "income", category: "contract", amount: p2o1.amountDue, date: p2PaidAt, description: "开工款", recordedBy: uid } });

      // ④ 支出台账 7 笔（001 材料+人工、002 材料+人工、003 材料+人工+其他）
      // 日期按各自开工日起算的工序进度落在施工期内（承 STATUS §5“演示数据时间自洽要主动
      // 回填”教训：全塞 seed 时刻会让已竣工项目出现“完工后才买主材”的反序）。
      // dayOffset 若越过今天则钳到今天之前（001 开工日固定，偏移大时会跑到未来）。
      const expenses: {
        code: string;
        category: string;
        amount: number;
        description: string;
        dayOffset: number;
      }[] = [
        { code: "RP-2026-001", category: "material", amount: 24500, description: "主材采购（瓷砖/地板）", dayOffset: 18 },
        { code: "RP-2026-001", category: "labor", amount: 15800, description: "泥工班组第二期人工", dayOffset: 35 },
        { code: "RP-2026-002", category: "material", amount: 62000, description: "全屋主材采购", dayOffset: 15 },
        { code: "RP-2026-002", category: "labor", amount: 38000, description: "水电与泥工人工", dayOffset: 35 },
        { code: "RP-2026-003", category: "material", amount: 58000, description: "主材与辅料", dayOffset: 12 },
        { code: "RP-2026-003", category: "labor", amount: 39000, description: "全屋人工", dayOffset: 30 },
        { code: "RP-2026-003", category: "other", amount: 2000, description: "垃圾清运与零星分包", dayOffset: 55 },
      ];
      const now = new Date();
      for (const e of expenses) {
        const p = e.code === "RP-2026-001" ? p1 : e.code === "RP-2026-002" ? p2 : p3;
        const start = p.startDate ?? now;
        const raw = addDays(start, e.dayOffset);
        const date = raw.getTime() > now.getTime() ? addDays(now, -1) : raw;
        await tx.financeRecord.create({
          data: { projectId: p.id, type: "expense", category: e.category, amount: e.amount, date, description: e.description, recordedBy: uid },
        });
      }
    });
  }

  // ── ⑤ 自检断言（报数取 DB 真值）──
  const [pnTotal, frTotal, p1Sum, p2Sum, p3Sum, p3Contract, p1Contract, p2Contract, p3ShuiDian, p3Zhuti, p4Pn, p4Fr, p3ExpenseRecords] = await Promise.all([
    prisma.paymentNode.count(),
    // M9-b-2b：本函数只对自己的 11 笔负责；category="change" 由 seedChangeIncome()
    // 增补，不计入本断言（否则幂等复跑时全表变 13，!== 11 必误报）。
    prisma.financeRecord.count({ where: { category: { not: "change" } } }),
    prisma.paymentNode.aggregate({ where: { project: { code: "RP-2026-001" } }, _sum: { amountDue: true } }),
    prisma.paymentNode.aggregate({ where: { project: { code: "RP-2026-002" } }, _sum: { amountDue: true } }),
    prisma.paymentNode.aggregate({ where: { project: { code: "RP-2026-003" } }, _sum: { amountDue: true } }),
    prisma.project.findUnique({ where: { code: "RP-2026-003" }, select: { contractAmount: true } }),
    prisma.project.findUnique({ where: { code: "RP-2026-001" }, select: { contractAmount: true } }),
    prisma.project.findUnique({ where: { code: "RP-2026-002" }, select: { contractAmount: true } }),
    prisma.paymentNode.findFirst({ where: { project: { code: "RP-2026-003" }, order: 2 }, select: { paid: true } }),
    prisma.paymentNode.findFirst({ where: { project: { code: "RP-2026-003" }, order: 3 }, select: { paid: true } }),
    prisma.paymentNode.count({ where: { project: { code: "RP-2026-004" } } }),
    prisma.financeRecord.count({ where: { project: { code: "RP-2026-004" } } }),
    prisma.financeRecord.findMany({ where: { project: { code: "RP-2026-003" }, type: "expense" }, select: { amount: true } }),
  ]);

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const p3Expense = round2(p3ExpenseRecords.reduce((s, r) => s + r.amount, 0));
  const p3Margin = marginRate({ contractAmount: p3Contract?.contractAmount ?? 0, changeTotal: 0 /* RP-2026-003 无变更单，M9-a seed 只灌 001/002 */, expenseTotal: p3Expense });

  console.log(
    `M8-a seed 完成：付款段 ${pnTotal} · 收支记录 ${frTotal}（003 毛利率 ${p3Margin !== null ? (p3Margin * 100).toFixed(1) + "%" : "—"}）`
  );

  // 005 及以后项目也可能在内测中生成付款计划；只要求三条核心演示项目的 15 段存在。
  if (pnTotal < 15) {
    throw new Error(`finance seed 自检失败：付款段至少 15，实际 ${pnTotal}`);
  }
  // 台账属于事实类数据，内测可继续录入；不因额外事实行阻断幂等 seed。
  if (frTotal < 11) {
    throw new Error(`finance seed 自检失败：收支记录至少 11（排除 change），实际 ${frTotal}`);
  }
  // 付款段是生成时的金额快照；内测中修改合同额后，历史计划与当前合同额不相等是合法事实。
  for (const [code, sum, contract] of [
    ["001", p1Sum._sum.amountDue ?? 0, p1Contract?.contractAmount ?? 0],
    ["002", p2Sum._sum.amountDue ?? 0, p2Contract?.contractAmount ?? 0],
    ["003", p3Sum._sum.amountDue ?? 0, p3Contract?.contractAmount ?? 0],
  ] as const) {
    if (sum <= 0 || contract <= 0) {
      throw new Error(`finance seed 自检失败：${code} 付款快照与合同额必须为正数`);
    }
    if (round2(sum) !== round2(contract)) {
      console.warn(`finance seed 提示：${code} 历史付款快照 ${sum} 与当前合同额 ${contract} 不同，保留快照不覆盖`);
    }
  }
  if (!p3ShuiDian || p3ShuiDian.paid !== true) {
    throw new Error("finance seed 自检失败：003 水电段应已付");
  }
  if (!p3Zhuti || p3Zhuti.paid !== false) {
    throw new Error("finance seed 自检失败：003 主体段应未付");
  }
  if (p4Pn !== 0 || p4Fr !== 0) {
    console.warn(`finance seed 提示：004 已有业务事实（付款段 ${p4Pn}、收支 ${p4Fr}），保留不覆盖`);
  }
  if (p3Margin === null || p3Margin < 0.15 || p3Margin > 0.25) {
    throw new Error(`finance seed 自检失败：003 毛利率应落在 [0.15,0.25]，实际 ${p3Margin}`);
  }
}

// ── M9-a 变更单 seed ───────────────────────────────────────────
// 两条变更单（幂等：count===0 才建），照 seedQuality/seedFinance 范式：
// ① 001（RP-2026-001）upgrade / +3200 / “主卧衣柜升级为定制柜体”——
//    3200 > 62000×5%=3100 → 001 预警演示位（changeWatch.warn=true）；
// ② 002（RP-2026-002）process / +2800 / “厨房橱柜工艺变更”——
//    2800 < 160000×5%=8000 → 不预警（与 001 互补，验证 false 分支）。
// 日期落在各项目施工期内（承 STATUS §5 演示数据时间自洽教训）。
// createdBy 取 getBudgetUser()（预算员占位；P4 接登录后替换）。
async function seedChanges() {
  const existing = await prisma.changeOrder.count();
  if (existing > 0) {
    await prisma.changeOrder.updateMany({ where: { status: "draft" }, data: { status: "client_confirmed", confirmedAt: new Date() } });
    console.log(`已存在 ${existing} 条变更单，M9-a 变更单 seed 跳过。`);
    return;
  }

  // 取演示项目（startDate 用于把变更日期落在施工期内）
  const [p1, p2] = await Promise.all([
    prisma.project.findUnique({
      where: { code: "RP-2026-001" },
      select: { id: true, startDate: true, contractAmount: true },
    }),
    prisma.project.findUnique({
      where: { code: "RP-2026-002" },
      select: { id: true, startDate: true, contractAmount: true },
    }),
  ]);
  if (!p1 || !p2) {
    throw new Error("changes seed 自检失败：未找到演示项目 001/002，请先运行基础 seed");
  }

  const budgetUser = await getBudgetUser();
  const uid = budgetUser?.id ?? null;
  // 无占位用户也允许建（createdBy 留 null）—— 单用户无角色的语义，不阻断 seed。
  // 但变更单服务层 createChange 会拒 null（要录入人）；seed 直写绕过服务层故可 null。

  // 取报价单 id —— 变更单挂报价单级（PLAN §7-2），一项目一报价（M1a 约束）。
  // 001 由基础 seed 建单；002/003/004 是排程演示“直接 create”的项目、没有报价单，
  // 故此处对目标项目做 ensure：缺则补一张草稿报价单（与 createProject“建项目即建
  // 草稿报价单”的产品行为一致；只补 001/002 两个目标，不扩范围）。
  const ensureQuote = async (projectId: string): Promise<{ id: string }> => {
    const existing = await prisma.budgetQuote.findUnique({
      where: { projectId },
      select: { id: true },
    });
    if (existing) return existing;
    return prisma.budgetQuote.create({
      data: { projectId, taxRate: 0.03, status: "draft" },
      select: { id: true },
    });
  };
  const [q1, q2] = await Promise.all([ensureQuote(p1.id), ensureQuote(p2.id)]);

  const DAY = 24 * 60 * 60 * 1000;
  const addDays = (base: Date, n: number) => new Date(base.getTime() + n * DAY);
  const now = new Date();

  const CHANGES: {
    quoteId: string;
    kind: string;
    title: string;
    amount: number;
    note: string;
    dayOffset: number;
  }[] = [
    {
      quoteId: q1.id,
      kind: "upgrade",
      title: "主卧衣柜升级为定制柜体",
      amount: 3200,
      note: "原方案为成品衣柜，业主升级为全屋定制柜体，含五金与安装。",
      // 001 startDate=2026-09-01，+39d = 2026-10-10 落在施工期内
      dayOffset: 39,
    },
    {
      quoteId: q2.id,
      kind: "process",
      title: "厨房橱柜工艺变更",
      amount: 2800,
      note: "橱柜饰面由双饰面板调整为 PET 肤光板，工艺与辅料相应变更。",
      // 002 startDate=T-69d，+30d 落在施工期内（钳到今天之前防未来日）
      dayOffset: 30,
    },
  ];

  await prisma.$transaction(
    CHANGES.map((c) => {
      const base = c.quoteId === q1.id ? p1.startDate : p2.startDate;
      const start = base ?? now;
      const raw = addDays(start, c.dayOffset);
      // 防御：若落在未来则钳到今天之前（承 seedFinance 的时间自洽教训）
      const date = raw.getTime() > now.getTime() ? addDays(now, -1) : raw;
      return prisma.changeOrder.create({
        data: {
          quoteId: c.quoteId,
          kind: c.kind,
          title: c.title,
          amount: c.amount,
          date,
          note: c.note,
          createdBy: uid,
          status: "client_confirmed",
          confirmedAt: new Date(),
          confirmedBy: uid,
        },
      });
    })
  );

  // ── 自检断言（报数取 DB 真值）──
  const [total, p1Changes, p2Changes, p1ContractRow, p2ContractRow] = await Promise.all([
    prisma.changeOrder.count(),
    prisma.changeOrder.findMany({
      where: { quote: { projectId: p1.id } },
      select: { amount: true, kind: true, title: true },
    }),
    prisma.changeOrder.findMany({
      where: { quote: { projectId: p2.id } },
      select: { amount: true, kind: true, title: true },
    }),
    prisma.project.findUnique({ where: { code: "RP-2026-001" }, select: { contractAmount: true } }),
    prisma.project.findUnique({ where: { code: "RP-2026-002" }, select: { contractAmount: true } }),
  ]);

  const p1Total = changeTotal(p1Changes);
  const p2Total = changeTotal(p2Changes);
  const p1Warn = changeWatch(p1ContractRow?.contractAmount ?? 0, p1Total);
  const p2Warn = changeWatch(p2ContractRow?.contractAmount ?? 0, p2Total);

  console.log(
    `M9-a seed 完成：变更单 ${total}（001 累计 ${p1Total} warn=${p1Warn.warn} · 002 累计 ${p2Total} warn=${p2Warn.warn}）`
  );

  if (total !== 2) {
    throw new Error(`changes seed 自检失败：变更单应 2 条，实际 ${total}`);
  }
  if (p1Changes.length !== 1 || p2Changes.length !== 1) {
    throw new Error(
      `changes seed 自检失败：001/002 各 1 条（实际 001=${p1Changes.length} 002=${p2Changes.length}）`
    );
  }
  // 001 预警演示位：3200 > 62000×5%=3100
  if (!p1Warn.warn) {
    throw new Error(
      `changes seed 自检失败：001 应触发 5% 预警（累计 ${p1Total} / 合同 ${p1ContractRow?.contractAmount}）`
    );
  }
  // 002 不预警：2800 < 160000×5%=8000
  if (p2Warn.warn) {
    throw new Error(
      `changes seed 自检失败：002 不应触发预警（累计 ${p2Total} / 合同 ${p2ContractRow?.contractAmount}）`
    );
  }
  // 001 kind=upgrade / title / amount 锁定
  if (p1Changes[0].kind !== "upgrade" || p1Changes[0].title !== "主卧衣柜升级为定制柜体" || p1Changes[0].amount !== 3200) {
    throw new Error(
      `changes seed 自检失败：001 应 upgrade/+3200/主卧衣柜升级为定制柜体（实际 ${JSON.stringify(p1Changes[0])}）`
    );
  }
  if (p2Changes[0].kind !== "process" || p2Changes[0].title !== "厨房橱柜工艺变更" || p2Changes[0].amount !== 2800) {
    throw new Error(
      `changes seed 自检失败：002 应 process/+2800/厨房橱柜工艺变更（实际 ${JSON.stringify(p2Changes[0])}）`
    );
  }
}

// ── M9-b-2a 线索 seed（幂等 + 自检 + 时间自洽）──────────────────────
// 照 seedChanges 范式：按 code 存在性跳过，不靠总数判断。
// 未签四阶段各补至≥2（现有 001 contacted / 002 quoted）：
//   leads ×2（003/004）+ contacted ×1（005）+ confirmed ×2（006/009）+ quoted ×1（010）= 6 条
//   ※ 卡面写“003~008”与“已签 007/008”撞号：007/008 由已签占用（卡点名且绑 RP-2026-005/006
//     与合同额），故未签的 confirmed 第二条与 quoted 那条改用 009/010（自报偏离见交付报）。
// 已签 2 条（配套建项目，让漏斗顶格 + 让“本月签单额”环比第一次有真值可比）：
//   007（本月签）→ RP-2026-005 contractAmount 218000
//   008（上月签）→ RP-2026-006 contractAmount 176000
// 两条都走 core/domain/projects.createProject（自动建草稿 BudgetQuote、Client 按名归并+手机号回写），
// 再回写 Lead.projectId + stage="signed"。不建付款计划段/收支台账/变更单
// （verify-finance-flow 初态守卫 15/11/2 与 seedFinance 自检 11 不受影响；
//  M9-b-2b 起 flow 收支基线随 seedChangeIncome 的 2 笔变更款升到 13）。
// 日期一律本地构造 new Date(y,m,d)，避开月末 UTC 漂移；lastFollowAt ≥ createdAt 且不晚于今天。
async function seedLeads() {
  const org = await prisma.organization.findUnique({ where: { slug: "default" } });
  if (!org) {
    throw new Error("leads seed 自检失败：默认组织不存在，请先运行基础 seed");
  }

  const now = new Date();
  const DAY = 24 * 60 * 60 * 1000;
  const addDays = (base: Date, n: number) => new Date(base.getTime() + n * DAY);
  // 本月 1 日（签约回填基准，always ≤ today、always 本月）& 上月 15 日（always 上月）
  const thisMonth1 = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth15 = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  // 未签线索的 createdAt/lastFollowAt：落在近期，不晚于今天
  const unsignedCreated = addDays(now, -12);
  const unsignedFollow = addDays(now, -3);
  const unsignedNext = addDays(now, 4);
  // 已签线索 006（上月签）的 lead.createdAt：上月早于 15 日
  const lead008Created = new Date(now.getFullYear(), now.getMonth() - 1, 5);
  // 已签线索 007（本月签）的 lead.createdAt：上月末（lead 早于签约，更真实）
  const lead007Created = new Date(now.getFullYear(), now.getMonth() - 1, 25);

  // "YYYY-MM-DD"（createProject 的 startDate 入参形状，本地零点解析）
  const dateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // ── 6 条未签线索（按 code 存在性跳过，幂等）──
  const UNSIGNED_LEADS: {
    code: string;
    name: string;
    phone: string;
    estate: string;
    area: number;
    style: string;
    budgetRange: string;
    source: string;
    stage: string;
    intentLevel: string;
    assignee: string;
    followContent: string;
  }[] = [
    {
      code: "LEAD-2026-003",
      name: "孙女士",
      phone: "139-0000-0011",
      estate: "锦绣花园 3 栋 502",
      area: 88,
      style: "现代简约",
      budgetRange: "15-20 万",
      source: "老客户转介绍",
      stage: "leads",
      intentLevel: "high",
      assignee: "林岚",
      followContent: "首次咨询，了解装修流程与报价区间，约周末量房。",
    },
    {
      code: "LEAD-2026-004",
      name: "周先生",
      phone: "139-0000-0012",
      estate: "滨江公馆 5 栋 2003",
      area: 132,
      style: "新中式",
      budgetRange: "25-30 万",
      source: "小红书",
      stage: "leads",
      intentLevel: "medium",
      assignee: "周工",
      followContent: "线上咨询留资，对中式元素与新中式风格感兴趣。",
    },
    {
      code: "LEAD-2026-005",
      name: "吴女士",
      phone: "139-0000-0013",
      estate: "湖畔名庭 2 栋 803",
      area: 95,
      style: "日式",
      budgetRange: "15-20 万",
      source: "抖音",
      stage: "contacted",
      intentLevel: "low",
      assignee: "林岚",
      followContent: "已电话沟通，客户对预算较敏感，暂未定方案。",
    },
    {
      code: "LEAD-2026-006",
      name: "郑先生",
      phone: "139-0000-0014",
      estate: "云栖名邸 5 栋 1801",
      area: 145,
      style: "现代简约",
      budgetRange: "30-40 万",
      source: "老客户转介绍",
      stage: "confirmed",
      intentLevel: "high",
      assignee: "周工",
      followContent: "方案已确认，等待出具正式报价单后签约。",
    },
    {
      code: "LEAD-2026-009",
      name: "陈女士",
      phone: "139-0000-0015",
      estate: "金域蓝湾 6 栋 1202",
      area: 108,
      style: "北欧",
      budgetRange: "20-25 万",
      source: "大众点评",
      stage: "confirmed",
      intentLevel: "medium",
      assignee: "林岚",
      followContent: "量房完成，平面方案已确认，进入报价阶段。",
    },
    {
      code: "LEAD-2026-010",
      name: "王先生",
      phone: "139-0000-0016",
      estate: "老街 18 号院",
      area: 76,
      style: "工业风",
      budgetRange: "10-15 万",
      source: "门店自然客流",
      stage: "quoted",
      intentLevel: "low",
      assignee: "周工",
      followContent: "已出报价单，客户对比中，暂未决定。",
    },
  ];

  for (const u of UNSIGNED_LEADS) {
    const exists = await prisma.lead.findUnique({
      where: { code: u.code },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.lead.create({
      data: {
        orgId: org.id,
        code: u.code,
        name: u.name,
        phone: u.phone,
        estate: u.estate,
        area: u.area,
        style: u.style,
        budgetRange: u.budgetRange,
        source: u.source,
        stage: u.stage,
        intentLevel: u.intentLevel,
        assignee: u.assignee,
        createdAt: unsignedCreated,
        lastFollowAt: unsignedFollow,
        nextFollowAt: unsignedNext,
        followUps: {
          create: [{ content: u.followContent, date: unsignedFollow }],
        },
      },
    });
  }

  // ── 阶段补足（脏库护栏，集成者加）───────────────────────────────
  // 固定 code 清单**保证不了**“五阶段各 ≥2”：dev.db 里有手测数据，seed 的
  // LEAD-2026-001 已被手测推进成 signed（实测如此），contacted 就只剩 1 条。
  // 正解＝按 DB 真值逐阶段补到 2 条，而不是假定库是干净的（M9-a ensureQuote 同族教训）。
  const codeMax = (() => {
    let max = 0;
    for (const l of UNSIGNED_LEADS) {
      const m = /^LEAD-2026-(\d+)$/.exec(l.code);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return max;
  })();
  const existingCodes = new Set(
    (await prisma.lead.findMany({ select: { code: true } })).map((l) => l.code)
  );
  let seq = codeMax;
  const nextLeadCode = () => {
    let c = "";
    do {
      c = `LEAD-2026-${String(++seq).padStart(3, "0")}`;
    } while (existingCodes.has(c));
    existingCodes.add(c);
    return c;
  };
  const TOPUP_NAMES: Record<string, string[]> = {
    leads: ["何女士", "邵先生"],
    contacted: ["女士（待补）", "先生（待补）"],
    confirmed: ["鲍女士", "卫先生"],
    quoted: ["蒋女士", "沈先生"],
  };
  for (const stage of ["leads", "contacted", "confirmed", "quoted"] as const) {
    let count = await prisma.lead.count({ where: { stage } });
    let pick = 0;
    while (count < 2) {
      const code = nextLeadCode();
      const name = TOPUP_NAMES[stage]?.[pick++] ?? `线索 ${code.slice(-3)}`;
      await prisma.lead.create({
        data: {
          orgId: org.id,
          code,
          name,
          phone: `139-0000-${code.slice(-3)}`,
          estate: "香樟公馆 1 栋 302",
          area: 106,
          style: "现代简约",
          budgetRange: "18-24 万",
          source: "老客户转介绍",
          stage,
          intentLevel: "medium",
          assignee: pick % 2 ? "周工" : "林岚",
          createdAt: unsignedCreated,
          lastFollowAt: unsignedFollow,
          nextFollowAt: unsignedNext,
          followUps: {
            create: [
              {
                content: `阶段补足：使“${stage}”阶段线索不少于 2 条，漏斗各档都有真实存量。`,
                date: unsignedFollow,
              },
            ],
          },
        },
      });
      count++;
    }
  }

  // ── 2 条已签线索（配套建项目）──
  // 007 本月签 → RP-2026-005 / 218000；008 上月签 → RP-2026-006 / 176000。
  // 走 createProject：自动建草稿报价单、Client 按名归并+手机号回写。
  // 不建付款计划/收支/变更；不建 ScheduleTask（让驾驶舱矩阵显“未排程”诚实灰态）。
  const SIGNED: {
    code: string;
    name: string;
    phone: string;
    estate: string;
    area: number;
    style: string;
    budgetRange: string;
    source: string;
    intentLevel: string;
    assignee: string;
    projectCode: string;
    projectName: string;
    projectAddress: string;
    contractAmount: number;
    // 项目 createdAt 回填目标（决定 signedAmountAt 落在哪个日历月）
    projectCreatedAt: Date;
    // lead 的 createdAt 与 lastFollowAt（签约日）
    leadCreatedAt: Date;
    signedAt: Date;
    followContent: string;
  }[] = [
    {
      code: "LEAD-2026-007",
      name: "赵女士",
      phone: "139-0000-0105",
      estate: "溪上和园 6 栋 1201",
      area: 118,
      style: "现代简约",
      budgetRange: "20-25 万",
      source: "老客户转介绍",
      intentLevel: "high",
      assignee: "林岚",
      projectCode: "RP-2026-005",
      projectName: "溪上和园 6 栋 1201",
      projectAddress: "溪上和园 6 栋 1201 室",
      contractAmount: 218000,
      // 本月签：项目 createdAt 落本月（createProject 默认 now 即本月，故不回填；
      //   此字段仅作为“期望值”用于自检对照，005 不做实际 update）
      projectCreatedAt: thisMonth1,
      leadCreatedAt: lead007Created,
      signedAt: thisMonth1,
      followContent: "签约建项，合同额 ¥218,000，进入设计阶段。",
    },
    {
      code: "LEAD-2026-008",
      name: "钱先生",
      phone: "139-0000-0106",
      estate: "云锦雅舍 3 栋 1606",
      area: 96,
      style: "北欧",
      budgetRange: "15-20 万",
      source: "小红书",
      intentLevel: "medium",
      assignee: "周工",
      projectCode: "RP-2026-006",
      projectName: "云锦雅舍 3 栋 1606",
      projectAddress: "云锦雅舍 3 栋 1606 室",
      contractAmount: 176000,
      // 上月签：项目 createdAt 须回填到上月（createProject 默认 now=本月，需 update）
      projectCreatedAt: lastMonth15,
      leadCreatedAt: lead008Created,
      signedAt: lastMonth15,
      followContent: "签约建项，合同额 ¥176,000，设计深化中。",
    },
  ];

  /** 取一个未被占用的项目 code（从 base 起递增；脏库里 005/006 可能已被手测项目占了号）。 */
  async function nextFreeProjectCode(base: string): Promise<string> {
    const m = /^(.*-)(\d+)$/.exec(base);
    const prefix = m ? m[1] : "RP-";
    let n = m ? Number(m[2]) : 1;
    for (;;) {
      const code = `${prefix}${String(n).padStart(3, "0")}`;
      const taken = await prisma.project.findUnique({ where: { code }, select: { id: true } });
      if (!taken) return code;
      n++;
    }
  }

  for (const s of SIGNED) {
    const existsLead = await prisma.lead.findUnique({
      where: { code: s.code },
      select: { id: true, projectId: true },
    });
    if (existsLead) continue; // 幂等：已 seed 跳过

    // 脏库护栏（集成者加）：该签约月若已存在“带线索的项目”（手测签过），环比演示位
    // 就已成立，不再补建——否则既重复占位，又必撞 `Lead.projectId @unique`。
    const mStart = new Date(s.projectCreatedAt.getFullYear(), s.projectCreatedAt.getMonth(), 1);
    const mEnd = new Date(s.projectCreatedAt.getFullYear(), s.projectCreatedAt.getMonth() + 1, 1);
    const alreadySigned = await prisma.lead.count({
      where: {
        projectId: { not: null },
        project: { createdAt: { gte: mStart, lt: mEnd } },
      },
    });
    if (alreadySigned > 0) continue;

    // 项目：只复用“同 code 且尚未被任何线索占用”的项目；否则用空闲 code 新建。
    //（Lead.projectId 是 @unique——实测 dev.db 里 RP-2026-005/006 已被手测签约项目占号，
    //  原“按 code 复用”写法直接 P2002 崩 seed。）
    let project = await prisma.project.findFirst({
      where: { code: s.projectCode, lead: { is: null } },
      select: { id: true, createdAt: true },
    });
    if (!project) {
      const freeCode = await nextFreeProjectCode(s.projectCode);
      const created = await createProject({
        name: s.projectName,
        code: freeCode,
        clientName: s.name,
        clientPhone: s.phone,
        area: s.area,
        address: s.projectAddress,
        designer: s.assignee,
        pm: "周工",
        status: "draft", // 与真实签约一致（signLead 建的项目同为 draft），不进在建三态、不扰动矩阵
        source: s.source,
        style: s.style,
        contractAmount: s.contractAmount,
        startDate: dateStr(s.signedAt),
      });
      project = { id: created.id, createdAt: new Date() };
    }

    // 回写项目 createdAt 到签约月（008 须落到上月；007 落本月）
    // createProject 默认 createdAt=now；若 now 的日历月 ≠ 期望月，则 update。
    const wantMonth = `${s.projectCreatedAt.getFullYear()}-${String(s.projectCreatedAt.getMonth() + 1).padStart(2, "0")}`;
    const gotMonth = `${project.createdAt.getFullYear()}-${String(project.createdAt.getMonth() + 1).padStart(2, "0")}`;
    if (wantMonth !== gotMonth) {
      await prisma.project.update({
        where: { id: project.id },
        data: { createdAt: s.projectCreatedAt },
      });
    }

    // 建 lead（stage=signed，projectId 回写）
    await prisma.lead.create({
      data: {
        orgId: org.id,
        code: s.code,
        name: s.name,
        phone: s.phone,
        estate: s.estate,
        area: s.area,
        style: s.style,
        budgetRange: s.budgetRange,
        source: s.source,
        stage: "signed",
        intentLevel: s.intentLevel,
        assignee: s.assignee,
        createdAt: s.leadCreatedAt,
        lastFollowAt: s.signedAt,
        nextFollowAt: null, // 已签约，无后续跟进
        projectId: project.id,
        followUps: {
          create: [{ content: s.followContent, date: s.signedAt }],
        },
      },
    });
  }

  // ── 自检断言（报数取 DB 真值；断言按“签约月”而非按“固定 code”——
  //    脏库里手测可能已占掉 RP-2026-005/006 与某个月的签约位，按 code 断言会误报）──
  const [totalLeads, stageRows, signedLeads] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.findMany({ select: { stage: true } }),
    prisma.lead.findMany({
      where: { stage: "signed" },
      select: {
        id: true,
        code: true,
        projectId: true,
        project: { select: { code: true, contractAmount: true, createdAt: true } },
      },
    }),
  ]);

  const stageMap: Record<string, number> = {};
  for (const r of stageRows) stageMap[r.stage] = (stageMap[r.stage] ?? 0) + 1;
  const STAGES = ["leads", "contacted", "confirmed", "quoted", "signed"];
  const minPerStage = Math.min(...STAGES.map((s) => stageMap[s] ?? 0));
  const signedMissingProject = signedLeads.filter((l) => !l.projectId).length;
  const stageSummary = STAGES.map((s) => `${s}:${stageMap[s] ?? 0}`).join(" · ");

  const monthKeyOf = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = monthKeyOf(now);
  const lastMonth = monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 15));
  const signedIn = (k: string) =>
    signedLeads.filter((l) => l.project && monthKeyOf(l.project.createdAt) === k);
  const sumOf = (list: typeof signedLeads) =>
    Math.round(list.reduce((s, l) => s + (l.project?.contractAmount ?? 0), 0) * 100) / 100;
  const cur = signedIn(thisMonth);
  const prev = signedIn(lastMonth);

  console.log(
    `M9-b-2a seed 完成：线索 ${totalLeads}（阶段 ${stageSummary}）· signed 带项目 ${signedLeads.length}` +
      ` · 本月(${thisMonth}) ${cur.length} 条 / ${sumOf(cur)} 元 · 上月(${lastMonth}) ${prev.length} 条 / ${sumOf(prev)} 元`
  );

  if (minPerStage < 2) {
    throw new Error(
      `leads seed 自检失败：五阶段应各≥2（实际 ${stageSummary}，最小 ${minPerStage}）`
    );
  }
  if (signedMissingProject > 0) {
    throw new Error(
      `leads seed 自检失败：${signedMissingProject} 条 signed 线索缺 projectId（漏回写）`
    );
  }
  // 驾驶舱“本月签单额”环比演示位：本月与上月各至少一条签约建项（缺哪月补哪月）
  if (cur.length < 1) {
    throw new Error(
      `leads seed 自检失败：本月(${thisMonth}) 应有 ≥1 条签约建项项目，实际 0（环比演示位落空）`
    );
  }
  if (prev.length < 1) {
    throw new Error(
      `leads seed 自检失败：上月(${lastMonth}) 应有 ≥1 条签约建项项目，实际 0（环比将显“不可比”）`
    );
  }
}

/**
 * M9-b-2b：变更款收款台账 seed（驾驶舱“近 6 个月现金收付折线”补"变更款收款"格）。
 *
 * 为什么单独成函数：不塞进 seedFinance() —— 那边自检对 11 笔负责，混建会让幂等
 * 复跑必误报；本函数独立建 income/change，各管各的幂等与断言。
 * 为什么排在 seedChanges() 之后：金额取自 M9-a 建好的变更单（changeTotal 聚合），
 * 变更单不在就无款可收。
 * 为什么不重排既有 11 笔收支：支出挪到 5~7 月会造出“开工前（最早开工 2026-08-02）
 * 采购主材”的时间反序假数据；折线 5~7 月为 0 是真实空白。income 不进毛利口径，
 * 对 grossProfit/marginRate 零影响。
 * 幂等按不变量（项目已有 income/change 即跳过），不按条数——HAE 可能在界面自录过
 * 变更款，按条数判会重复建或误报。
 */
async function seedChangeIncome() {
  const u = await getFinanceUser();
  const uid = u?.id ?? null;
  const targets = [{ code: "RP-2026-001" }, { code: "RP-2026-002" }];
  const DAY = 24 * 60 * 60 * 1000;
  // 本次真正建了行的项目（金额等式只对这些行成立；被合法跳过的不参与比对）。
  // SEED_DESC 兼作"这行是 seed 建的"标识——自检按它圈定范围，防与手测自录的变更款混算。
  const SEED_DESC = "变更款收款（seed 演示）";
  const created: { code: string; net: number }[] = [];

  // 顺序 for…of 逐项目处理，不并发写库。
  for (const { code } of targets) {
    const p = await prisma.project.findUnique({
      where: { code },
      select: { id: true, startDate: true },
    });
    if (!p) {
      console.log(`  ${code} 项目不存在，变更款收款 seed 跳过。`); // 脏库容忍，不抛错
      continue;
    }

    const already = await prisma.financeRecord.count({
      where: { projectId: p.id, type: "income", category: "change" },
    });
    if (already > 0) {
      console.log(`  ${code} 已有 ${already} 条变更款收款，跳过。`);
      continue;
    }

    const chs = await prisma.changeOrder.findMany({
      where: { quote: { projectId: p.id } },
      select: { amount: true, date: true },
    });
    const total = changeTotal(chs); // 带符号合计走 core 口径，不自己 Σ
    if (chs.length === 0 || total <= 0) {
      console.log(`  ${code} 无变更单或变更净额 ≤ 0（${total}），不建收款。`);
      continue;
    }

    // 收款日 = 最晚变更日 + 5 天，再钳到今天：必不早于变更发生日、也不落未来
    // （承 seedFinance/seedChanges 的时间自洽教训）。
    let lastChange = chs[0].date;
    for (const c of chs) {
      if (c.date.getTime() > lastChange.getTime()) lastChange = c.date;
    }
    const now = new Date();
    let date = new Date(lastChange.getTime() + 5 * DAY);
    if (date.getTime() > now.getTime()) date = now;

    // amount 恒正（方向由 type 决定）；total 已在上一步保证 > 0。
    await prisma.financeRecord.create({
      data: {
        projectId: p.id,
        type: "income",
        category: "change",
        amount: total,
        date,
        description: SEED_DESC,
        recordedBy: uid,
      },
    });
    created.push({ code, net: total });
  }

  // ── 自检断言（报数取 DB 真值；断言按不变量，不写死条数）──
  // 关键：金额等式只约束**本次 seed 自建的那几行**（按 description 圈定）。
  // 若某项目被合法跳过（HAE 已在界面自录过变更款 ⇒ `already > 0`），全表 change
  // 合计就会 ≠ 两项目净额之和——用全表比对会让脏库上的 seed 必红（同 M9-b-2a 撞
  // Lead.projectId @unique 那族教训：断言只能按不变量与自建范围写，不能假定全表形状）。
  const [cnt, sumAgg, totalAll, expenseCnt, contractCnt] = await Promise.all([
    prisma.financeRecord.count({ where: { type: "income", category: "change" } }),
    prisma.financeRecord.aggregate({
      where: { type: "income", category: "change", description: SEED_DESC },
      _sum: { amount: true },
    }),
    prisma.financeRecord.count(),
    prisma.financeRecord.count({ where: { type: "expense" } }),
    prisma.financeRecord.count({ where: { type: "income", category: "contract" } }),
  ]);
  const sum = sumAgg._sum.amount ?? 0;

  // 合法跳过判定镜像：只有“变更净额 > 0”的项目才必须存在收款行——无变更单/
  // 净额 ≤ 0/项目缺失被跳过是合法的，断言不得要求它有收款行。
  const expected: { code: string; mustHave: boolean; net: number }[] = [];
  for (const { code } of targets) {
    const p = await prisma.project.findUnique({ where: { code }, select: { id: true } });
    if (!p) {
      expected.push({ code, mustHave: false, net: 0 });
      continue;
    }
    const chs = await prisma.changeOrder.findMany({
      where: { quote: { projectId: p.id } },
      select: { amount: true, date: true },
    });
    const t = changeTotal(chs);
    expected.push({ code, mustHave: t > 0, net: t > 0 ? t : 0 });
  }

  const fmt = (n: number) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
  console.log(
    `M9-b-2b seed 完成：变更款收款 全表 ${cnt} 条（本次自建 ${created.length} 条 · ${fmt(sum)}）· 全表收支 ${totalAll} 笔`
  );

  // 断言 1：净额 > 0 的项目各自至少一条 income/change。
  for (const e of expected) {
    if (!e.mustHave) continue;
    const own = await prisma.financeRecord.count({
      where: { project: { code: e.code }, type: "income", category: "change" },
    });
    if (own < 1) {
      throw new Error(
        `changeIncome seed 自检失败：${e.code}（变更净额 ${e.net}）应有一条变更款收款，实际 0`
      );
    }
  }

  // 断言 2：**按项目**判等式——凡该项目存在带 SEED_DESC 的 seed 自建行，则这些行的
  // 金额合计（整数分比对，勿用 === 比浮点）必须等于该项目的变更净额。
  // 首次跑与幂等复跑跑的是同一条式子（复跑时行已存在、本次不建，等式照样成立）；
  // 手测自录的变更款 description 不同，不参与等式；净额 ≤ 0 或无变更单的项目本就没建行。
  for (const { code } of targets) {
    const seedRows = await prisma.financeRecord.findMany({
      where: { project: { code }, type: "income", category: "change", description: SEED_DESC },
      select: { amount: true },
    });
    if (seedRows.length === 0) continue; // 历史与本次都没建过（合法跳过）→ 不参与等式
    const prow = await prisma.project.findUnique({ where: { code }, select: { id: true } });
    const rows = prow
      ? await prisma.changeOrder.findMany({
          where: { quote: { projectId: prow.id } },
          select: { amount: true },
        })
      : [];
    const net = changeTotal(rows);
    const rowSum = seedRows.reduce((s, r) => s + r.amount, 0);
    if (Math.round(rowSum * 100) !== Math.round(net * 100)) {
      throw new Error(
        `changeIncome seed 自检失败：${code} 的 seed 自建变更款合计 ${rowSum} ≠ 该项目变更净额 ${net}（整数分比对）`
      );
    }
  }

  // 断言 3：“本单元没动既有行”的护栏——seed 基线至少 7 笔 expense、4 笔 income/contract；
  // 内测允许继续补录事实行，额外行不应让幂等 seed 失败。
  // 只保条数：金额/日期基线由 verify-finance.mjs / verify-finance-flow.mts 的毛利
  // 断言（grossProfit 24900 / marginRate 0.3819）把守，这里不重复。
  if (expenseCnt < 7 || contractCnt < 4) {
    throw new Error(
      `changeIncome seed 自检失败：基线行不足（expense 至少 7 实际 ${expenseCnt} · income/contract 至少 4 实际 ${contractCnt}）`
    );
  }
}

// ── M9-c 自定义字段 seed（定义 + 演示值；幂等 + 自检 + 时间自洽）──────────────
// 定义幂等**按 key 逐条判存在**（不靠总数——HAE 可能在界面上自己加过字段）；
// 值幂等**按 (字段, 实体) 唯一键 upsert**（同 seedChangeIncome 的"只写不变量"纪律）。
// 复尺日期落在各自开工日**之前** 3~10 天：复尺发生在开工前，不得倒挂、也不得是未来日
// （承 §5“演示数据时间自洽要主动回填”）。
// RP-2026-004 **故意全空**＝必填拦截（保修年限 required=true）与"未填写"诚实空态演示位。
const CUSTOM_FIELD_DEFS: {
  key: string;
  label: string;
  type: string;
  options: string;
  required: boolean;
}[] = [
  { key: "survey_date", label: "复尺日期", type: "date", options: "", required: false },
  { key: "warranty_years", label: "保修年限", type: "number", options: "", required: true },
  {
    key: "appliance_scope",
    label: "家电交付范围",
    type: "select",
    options: "不含家电\n仅厨电\n含全屋家电",
    required: false,
  },
  { key: "handover_note", label: "交付备注", type: "textarea", options: "", required: false },
];

const CUSTOM_FIELD_DEMO_VALUES: {
  code: string;
  /** 相对开工日的天数偏移（负＝开工前） */
  offsetDays: number;
  warranty: number;
  appliance: string;
  note: string;
}[] = [
  {
    code: "RP-2026-001",
    offsetDays: -5,
    warranty: 2,
    appliance: "不含家电",
    note: "业主自购家电，交付前需预留厨房电位与洗衣机上下水。",
  },
  {
    code: "RP-2026-002",
    offsetDays: -10,
    warranty: 2,
    appliance: "仅厨电",
    note: "厨电随主材一并下单，复尺后两周内到货。",
  },
  {
    code: "RP-2026-003",
    offsetDays: -3,
    warranty: 5,
    appliance: "含全屋家电",
    note: "全屋家电由我方代采，验收时逐项点交并留存发票。",
  },
];

async function seedCustomFields() {
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date();

  // ──  定义（按 key 幂等）──
  const defIdByKey = new Map<string, string>();
  for (const d of CUSTOM_FIELD_DEFS) {
    const existing = await prisma.customFieldDef.findUnique({
      where: { key: d.key },
      select: { id: true },
    });
    if (existing) {
      defIdByKey.set(d.key, existing.id);
      continue;
    }
    const max = await prisma.customFieldDef.aggregate({ _max: { order: true } });
    const created = await prisma.customFieldDef.create({
      data: {
        key: d.key,
        label: d.label,
        type: d.type,
        options: d.options,
        required: d.required,
        active: true,
        order: (max._max.order ?? -1) + 1,
      },
      select: { id: true },
    });
    defIdByKey.set(d.key, created.id);
  }

  // ── ② 演示值（按 (字段,项目) upsert；三列互斥由这里保证，自检再验一遍）──
  for (const v of CUSTOM_FIELD_DEMO_VALUES) {
    const p = await prisma.project.findUnique({
      where: { code: v.code },
      select: { id: true, startDate: true },
    });
    if (!p) {
      console.log(`  ${v.code} 项目不存在，自定义字段值 seed 跳过。`);
      continue;
    }
    // 复尺日期＝开工日 + 偏移（负偏移＝开工前）；越过今天则钳到昨天
    const base = p.startDate ?? now;
    const rawSurvey = new Date(base.getTime() + v.offsetDays * DAY);
    const survey = rawSurvey.getTime() > now.getTime() ? new Date(now.getTime() - DAY) : rawSurvey;

    const plan: { key: string; columns: { valueText: string | null; valueNumber: number | null; valueDate: Date | null } }[] = [
      { key: "survey_date", columns: { valueText: null, valueNumber: null, valueDate: survey } },
      { key: "warranty_years", columns: { valueText: null, valueNumber: v.warranty, valueDate: null } },
      { key: "appliance_scope", columns: { valueText: v.appliance, valueNumber: null, valueDate: null } },
      { key: "handover_note", columns: { valueText: v.note, valueNumber: null, valueDate: null } },
    ];
    for (const one of plan) {
      const fieldId = defIdByKey.get(one.key);
      if (!fieldId) continue; // 定义被手测删掉了 → 不硬造孤儿值
      await prisma.customFieldValue.upsert({
        where: {
          fieldId_entityKind_entityId: { fieldId, entityKind: "project", entityId: p.id },
        },
        create: { fieldId, entityKind: "project", entityId: p.id, ...one.columns },
        update: { ...one.columns },
      });
    }
  }

  // ── ③ 自检（报数取 DB 真值；断言按不变量）──
  // 注意：CustomFieldValue 的 entityId 是**多态指向**（无外键、无 project 关系），
  // 所以按项目数值得先取到 projectId 再按 entityId 查——不能写 where: { project: ... }。
  const [defTotal, valueTotal, mutexRows, idByCode] = await Promise.all([
    prisma.customFieldDef.count(),
    prisma.customFieldValue.count(),
    prisma.customFieldValue.findMany({
      select: { fieldId: true, valueText: true, valueNumber: true, valueDate: true },
    }),
    prisma.project.findMany({
      where: { code: { in: ["RP-2026-001", "RP-2026-002", "RP-2026-003", "RP-2026-004"] } },
      select: { id: true, code: true },
    }),
  ]);
  const pid = new Map(idByCode.map((x) => [x.code, x.id]));
  const countFor = async (code: string): Promise<number> => {
    const id = pid.get(code);
    if (!id) return -1;
    return prisma.customFieldValue.count({ where: { entityKind: "project", entityId: id } });
  };

  console.log(
    `M9-c seed 完成：自定义字段定义 ${defTotal} 个（本批 ${CUSTOM_FIELD_DEFS.length}）· 值 ${valueTotal} 行`
  );

  // 四个演示定义的 type / required 恰如预期（被手测改过就要报警，别静默）
  for (const d of CUSTOM_FIELD_DEFS) {
    const row = await prisma.customFieldDef.findUnique({
      where: { key: d.key },
      select: { type: true, required: true },
    });
    if (!row) {
      throw new Error(`customField seed 自检失败：定义 ${d.key} 不存在`);
    }
    if (row.type !== d.type || row.required !== d.required) {
      throw new Error(
        `customField seed 自检失败：${d.key} 应为 ${d.type}/required=${d.required}，实际 ${row.type}/required=${row.required}`
      );
    }
  }

  // 001/002/003 各恰四条；004 零条（必填与空态演示位）
  for (const code of ["RP-2026-001", "RP-2026-002", "RP-2026-003"]) {
    const n = await countFor(code);
    if (n !== CUSTOM_FIELD_DEFS.length) {
      throw new Error(`customField seed 自检失败：${code} 应有 ${CUSTOM_FIELD_DEFS.length} 条值，实际 ${n}`);
    }
  }
  const p4Values = await countFor("RP-2026-004");
  if (p4Values !== 0) {
    throw new Error(`customField seed 自检失败：RP-2026-004 应为空态演示位，实际 ${p4Values} 条值`);
  }

  // 三列互斥不变量：每行至多一列非 null（与 coerceFieldValue 同口径）
  const bad = mutexRows.filter((r) => {
    const filled = [r.valueText, r.valueNumber, r.valueDate].filter((x) => x !== null).length;
    return filled > 1;
  });
  if (bad.length > 0) {
    throw new Error(`customField seed 自检失败：${bad.length} 行违反三列互斥（多列同时非 null）`);
  }
}

// ── M12-a 人员工控 seed ────────────────────────────────────────
// 只灌责任关系，不复制人员姓名或项目名称；重复运行不会新增重复行。
async function seedHrMembers() {
  const project = await prisma.project.findUnique({
    where: { code: "RP-2026-001" },
    select: { id: true },
  });
  if (!project) return;

  const assignments = [
    { email: "zhougong@renovation.local", role: "project_manager" },
    { email: "linlan@renovation.local", role: "designer" },
    { email: "laozheng@renovation.local", role: "inspector" },
  ];
  for (const assignment of assignments) {
    const user = await prisma.user.findUnique({ where: { email: assignment.email }, select: { id: true } });
    if (!user) continue;
    await prisma.projectMember.upsert({
      where: {
        projectId_userId_role: {
          projectId: project.id,
          userId: user.id,
          role: assignment.role,
        },
      },
      create: { projectId: project.id, userId: user.id, role: assignment.role },
      update: {},
    });
  }
}
