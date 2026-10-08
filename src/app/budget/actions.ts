"use server";

import { revalidatePath } from "next/cache";
import { createProject, ValidationError } from "@/modules/budget/server/projects";

/** Server Action 表单状态：客户端用 useFormState 读回。 */
export interface ProjectFormState {
  error?: string;
  ok?: boolean;
  projectId?: string;
}

/** 新建项目。校验失败返回 error 文案，不抛到 UI。 */
export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  try {
    const text = (key: string) => String(formData.get(key) ?? "").trim();
    const areaRaw = text("area");
    const area = areaRaw === "" ? 0 : Number(areaRaw);

    const { id } = await createProject({
      name: text("name"),
      code: text("code"),
      clientName: text("clientName"),
      area,
      address: text("address"),
      designer: text("designer"),
      pm: text("pm"),
    });

    revalidatePath("/budget");
    return { ok: true, projectId: id };
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    console.error("[createProjectAction]", e);
    return { error: "保存失败，请稍后重试" };
  }
}
