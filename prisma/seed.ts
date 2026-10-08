/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";

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
    console.log("已存在默认组织，seed 跳过（如需重置请删除 prisma/dev.db 后重跑）。");
    return;
  }

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

  // 先灌科目模板，再按 code 快照成报价明细
  const catalog = await prisma.$transaction(
    CATALOG.map((c) =>
      prisma.catalogCategory.create({ data: { name: c.name, order: c.order } })
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

  console.log(
    `seed 完成：组织 1 · 用户 1 · 客户 1 · 项目 1 · 科目 ${catalog.length} · 模板 ${
      CATALOG.reduce((n, c) => n + c.items.length, 0)
    } 项 · 报价明细 ${quoteItems.count} 条`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
