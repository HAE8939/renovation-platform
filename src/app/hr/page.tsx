import { Badge, Card, Field, Select, Table, Td, Th } from "@/core/ui";
import { getHrPageData } from "@/modules/hr/server/people";
import { PROJECT_MEMBER_ROLE, PROJECT_MEMBER_ROLE_LABEL } from "@/modules/hr/roles";
import { addProjectMember, removeProjectMember } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "人员工控" };

function formatDate(value: Date | null) {
  return value ? new Date(value).toLocaleDateString("zh-CN") : "—";
}

export default async function HrPage() {
  const data = await getHrPageData();

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
