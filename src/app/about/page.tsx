import Link from "next/link";
import { Card } from "@/core/ui";

export const metadata = { title: "平台说明" };

/**
 * /about —— 公开「门面页」。这是内测口令之外唯一免登录可达的说明入口，
 * 因此只放不含经营数字的定位介绍，完整文档（含架构口径、模块细节、已知边界）在受保护的 /docs。
 * 口径来源 docs/PLATFORM_INTRODUCTION_V1.md 附录 C「官网介绍」档，敏感事实不外露。
 */
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <header className="border-b border-line pb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent-ink">平台说明</p>
        <h1 className="mt-3 text-[28px] font-semibold leading-[1.3]">装修经营全流程数字化工作台</h1>
        <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-secondary">
          把线索、报价、项目交付和经营事实放在同一个平台里，让每一次记录都能回到对应的项目与客户。
          它替代的不是某个软件，而是「Excel 报价单 + 微信群里的现场照片 + 口头汇报的进度 + 月底对不上的账」这套组合。
        </p>
      </header>

      <section>
        <h2 className="text-[20px] font-semibold">这是个什么样的平台</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card padded>
            <h3 className="text-[15px] font-medium">模块化单体</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary">
              一个仓库、一套外壳、共享项目主数据。预算、线索、设计、排程、质量、财务、驾驶舱、人员工控等功能区共用同一份数据与视觉语言，不拼门户、不做微前端。
            </p>
          </Card>
          <Card padded>
            <h3 className="text-[15px] font-medium">口径一致</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary">
              全公司关于「钱」的算法只存在于一处，被脚本反复复算校验，从根上消灭「两个页面同一个指标对不上」。
            </p>
          </Card>
          <Card padded>
            <h3 className="text-[15px] font-medium">跨模块联动</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary">
              排程完工自动生成验收节点、验收通过解锁付款段、审核退回自动创建问题——靠读侧算出来的因果，而不是靠人记得再去录一遍。
            </p>
          </Card>
          <Card padded>
            <h3 className="text-[15px] font-medium">账籍可逆、有据可查</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary">
              核心账没有硬删除，误操作可恢复；关键写操作留操作流水，现场照片与可打印质量档案让纠纷有据可查。
            </p>
          </Card>
        </div>
      </section>

      <section className="border-t border-line pt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-prose text-[13px] leading-relaxed text-secondary">
            完整说明（架构、逐模块能力、业务闭环、发展路线与已知边界）收录在平台文档站。
            当前为内部测试版本，文档站含经营口径，需经口令入口访问。
          </p>
          <Link
            href="/docs"
            className="inline-block shrink-0 rounded-inner bg-accent px-4 py-2 text-[13px] font-medium text-accent-fg transition-opacity duration-[120ms] hover:opacity-90"
          >
            打开完整文档 →
          </Link>
        </div>
      </section>

      <div className="flex gap-4 border-t border-line pt-6 text-[13px]">
        <Link href="/" className="text-accent-ink hover:underline">
          ← 返回平台首页
        </Link>
      </div>
    </div>
  );
}
