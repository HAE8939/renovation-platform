import Link from "next/link";
import { Card } from "@/core/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "平台说明" };

export default function AboutPage() {
  return <div className="mx-auto max-w-4xl space-y-8">
    <header className="border-b border-line pb-8"><p className="text-xs font-medium uppercase tracking-[0.14em] text-accent-ink">平台说明</p><h1 className="mt-3 text-[28px] font-semibold">装修经营全流程数字化工作台</h1><p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-secondary">把线索、报价、项目交付和经营事实放在同一个平台里，让每一次记录都能回到对应的项目与客户。</p></header>
    <section className="grid gap-4 md:grid-cols-2"><Card padded><h2 className="text-[17px] font-semibold">平台定位</h2><p className="mt-3 text-[13px] leading-relaxed text-secondary">这是一个模块化单体平台。业务模块共享项目、客户、人员和操作流水，当前已开放预算报价、线索、设计、排程、质量、财务、驾驶舱和人员工控。</p></Card><Card padded><h2 className="text-[17px] font-semibold">当前使用形态</h2><p className="mt-3 text-[13px] leading-relaxed text-secondary">当前为免登录的单用户内测版本，身份使用平台内置人员占位。先在公司 NAS 的 Docker 环境验证流程，再按实际使用情况准备阿里云轻量服务器与 OSS。</p></Card></section>
    <section className="border-t border-line pt-8"><h2 className="text-[20px] font-semibold">数据原则</h2><div className="mt-4 grid gap-4 md:grid-cols-3"><Info title="项目是主脊" text="所有业务记录都挂在同一个项目上，客户与项目保持一致。" /><Info title="钱按事实" text="已收、支出、合同额和已确认变更保留在经营账里。" /><Info title="事按可见性" text="归档项目不再进入待办和风险视野，历史事实仍可追溯。" /></div></section>
    <section className="border-t border-line pt-8"><h2 className="text-[20px] font-semibold">文件与建设路线</h2><p className="mt-3 text-[13px] leading-relaxed text-secondary">设计交付物、变更附件和后续工作记录附件统一登记为文件资产。内测阶段写入应用文件卷，正式部署时切换到 OSS provider，数据库继续保存文件元数据和关联关系。</p></section>
    <div className="flex gap-4 border-t border-line pt-6 text-[13px]"><Link href="/" className="text-accent-ink hover:underline">返回平台首页 →</Link><Link href="/settings" className="text-secondary hover:text-accent-ink">打开平台设置 →</Link></div>
  </div>;
}

function Info({ title, text }: { title: string; text: string }) { return <div className="border-t border-line pt-3"><h3 className="text-[15px] font-medium">{title}</h3><p className="mt-2 text-[13px] leading-relaxed text-secondary">{text}</p></div>; }
