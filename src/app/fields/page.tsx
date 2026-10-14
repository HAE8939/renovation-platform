import { redirect } from "next/navigation";

/**
 * 自定义字段定义管理（M9-c）。server component 取数，交互面在 FieldsAdmin（client）。
 * 含停用定义（includeInactive），并带每个定义已填值数——停用不丢历史值，这里要看得见。
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "平台设置" };

export default async function FieldsPage() {
  redirect("/settings#custom-fields");
}
