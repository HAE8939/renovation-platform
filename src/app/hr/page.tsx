import { Badge, Card, Field, Input, Select, Table, Td, Th } from "@/core/ui";
import { getWorkLogPageData } from "@/modules/hr/server/worklogs";
import { PROJECT_MEMBER_ROLE, PROJECT_MEMBER_ROLE_LABEL } from "@/modules/hr/roles";
import { addProjectMember, removeProjectMember, createWorkLogAction, archiveWorkLogAction } from "./actions";
import { WORKLOG_CATEGORY, WORKLOG_CATEGORY_LABEL } from "@/modules/hr/worklogs";

export const dynamic = "force-dynamic";
export const metadata = { title: "人员工控" };

function formatDate(value: Date | null) {
  return value ? new Date(value).toLocaleDateString("zh-CN") : "—";
}

export default async function HrPage() {
  const data = await getWorkLogPageData();

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent-ink">M12-a · 人员主数据</p>
        <h1 className="mt-3 text-[28px] font-semibold">人员工控</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-secondary">
          先把“谁负责哪个项目”记录清楚，再逐步接入工作记录与绩效汇总。人员信息复用平台 User，项目责任关系挂在 Project 下，后续登录接入时不需要重建这套数据。
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Metric label="人员" value={data.people.length} note="当前组织用户" />
        <Metric label="在用项目" value={data.projects.length} note="已排除归档项目" />
        <Metric label="责任关系" value={data.assignments.length} note="项目 × 人员 × 角色" />
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold">项目责任关系</h2>
            <p className="mt-1 text-[13px] text-secondary">用于项目详情、排程负责人和后续工作记录的统一归属。</p>
          </div>
        </div>
        <Card className="mt-4" padded>
          <form action={addProjectMember} className="grid gap-4 md:grid-cols-4 md:items-end">
            <Field label="项目" required>
              <Select name="projectId" required defaultValue="">
                <option value="" disabled>请选择项目</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </Field>
            <Field label="人员" required>
              <Select name="userId" required defaultValue="">
                <option value="" disabled>请选择人员</option>
                {data.users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.roleLabel}</option>)}
              </Select>
            </Field>
            <Field label="责任角色" required>
              <Select name="role" required defaultValue="">
                <option value="" disabled>请选择角色</option>
                {Object.values(PROJECT_MEMBER_ROLE).map((role) => <option key={role} value={role}>{PROJECT_MEMBER_ROLE_LABEL[role]}</option>)}
              </Select>
            </Field>
            <button type="submit" className="h-9 border border-accent bg-accent px-4 text-[13px] font-medium text-accent-fg transition-colors duration-[120ms] hover:bg-accent-ink">添加责任关系</button>
          </form>
        </Card>

        {data.assignments.length === 0 ? (
          <Card className="mt-4 py-10 text-center text-[15px] text-secondary">还没有项目责任关系，先在上方添加第一条。</Card>
        ) : (
          <Card className="mt-4" padded={false}>
            <Table>
              <thead><tr><Th>项目</Th><Th>人员</Th><Th>责任角色</Th><Th>起止</Th><Th>备注</Th><Th align="right">操作</Th></tr></thead>
              <tbody>
                {data.assignments.map((a) => (
                  <tr key={a.id}>
                    <Td><span className="num text-[13px] text-secondary">{a.projectCode}</span><span className="ml-2">{a.projectName}</span></Td>
                    <Td className="font-medium">{a.userName}</Td>
                    <Td><Badge variant="outline">{a.roleLabel}</Badge></Td>
                    <Td className="text-[13px] text-secondary">{formatDate(a.startDate)} — {formatDate(a.endDate)}</Td>
                    <Td className="text-[13px] text-secondary">{a.note || "—"}</Td>
                    <Td align="right"><form action={removeProjectMember}><input type="hidden" name="id" value={a.id} /><button type="submit" className="text-[13px] text-secondary hover:text-danger">移除</button></form></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold">人员工作记录</h2>
            <p className="mt-1 text-[13px] text-secondary">记录拜访、设计、现场和沟通事实，后续可按项目与人员汇总。</p>
          </div>
          <span className="num text-[13px] text-muted">{data.logs.length} 条</span>
        </div>
        <Card className="mt-4" padded>
          <form action={createWorkLogAction} className="grid gap-4 md:grid-cols-4 md:items-end">
            <Field label="日期" required><Input name="workDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
            <Field label="项目" required><Select name="projectId" required defaultValue=""><option value="" disabled>请选择项目</option>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select></Field>
            <Field label="人员" required><Select name="userId" required defaultValue=""><option value="" disabled>请选择人员</option>{data.users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.roleLabel}</option>)}</Select></Field>
            <Field label="类型" required><Select name="category" defaultValue="site">{Object.values(WORKLOG_CATEGORY).map((c) => <option key={c} value={c}>{WORKLOG_CATEGORY_LABEL[c]}</option>)}</Select></Field>
            <Field label="工作事项" required><Input name="title" required maxLength={120} placeholder="如：现场复核水电点位" /></Field>
            <Field label="工时（分钟）"><Input name="minutes" type="number" min="0" max="1440" step="15" placeholder="可留空" /></Field>
            <Field label="工作说明"><Input name="description" maxLength={240} placeholder="过程记录" /></Field>
            <Field label="产出说明"><Input name="outputNote" maxLength={240} placeholder="形成了什么结果" /></Field>
            <button type="submit" className="h-9 border border-accent bg-accent px-4 text-[13px] font-medium text-accent-fg transition-colors duration-[120ms] hover:bg-accent-ink md:col-span-4 md:justify-self-end">保存工作记录</button>
          </form>
        </Card>
        <Card className="mt-4" padded={false}>
          {data.logs.length === 0 ? <p className="px-5 py-10 text-center text-[15px] text-secondary">还没有工作记录。</p> : <Table><thead><tr><Th>日期</Th><Th>项目</Th><Th>人员</Th><Th>事项</Th><Th>类型</Th><Th>工时</Th><Th align="right">操作</Th></tr></thead><tbody>{data.logs.map((l) => <tr key={l.id}><Td className="num text-[13px] text-secondary">{formatDate(l.workDate)}</Td><Td><span className="num text-[13px] text-secondary">{l.project.code}</span><span className="ml-2">{l.project.name}</span></Td><Td>{l.user.name}</Td><Td><p className="font-medium">{l.title}</p>{l.outputNote && <p className="mt-1 text-[12px] text-secondary">{l.outputNote}</p>}</Td><Td><Badge variant="outline">{l.categoryLabel}</Badge></Td><Td className="num text-[13px] text-secondary">{l.minutes ? `${l.minutes} 分钟` : "—"}</Td><Td align="right"><form action={archiveWorkLogAction}><input type="hidden" name="id" value={l.id} /><button type="submit" className="text-[13px] text-secondary hover:text-danger">归档</button></form></Td></tr>)}</tbody></Table>}
        </Card>
      </section>

      <section>
        <h2 className="text-[17px] font-semibold">人员档案</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.people.map((person) => (
            <Card key={person.id} padded>
              <div className="flex items-start justify-between gap-3"><div><p className="text-[17px] font-semibold">{person.name}</p><p className="mt-1 text-[13px] text-secondary">{person.roleLabel} · {person.departmentLabel}</p></div><span className="num text-[13px] text-muted">{person.projectCount} 项目</span></div>
              <p className="mt-4 border-t border-line pt-3 text-[13px] text-secondary">{person.email}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return <Card padded><p className="text-[13px] text-secondary">{label}</p><p className="mt-2 num text-[28px] font-semibold">{value}</p><p className="mt-1 text-xs text-muted">{note}</p></Card>;
}
