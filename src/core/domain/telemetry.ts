/**
 * telemetry.ts —— 错误现场留档（M10-a 备料一 · core 平台原语）
 *
 * 为什么存在：平台即将交给内部员工真实使用，逻辑问题只能在真实使用中暴露。
 * 但生产构建会把服务端错误详情隐去、只给一个 digest——员工遇到“点了没反应”时，
 * 我们连他那一刻在哪个页面、点了什么、抛了什么都不知道。这张兜底先把现场留住。
 *
 * 三条设计约束：
 * ① **零依赖、纯追加**：不引 winston/pino，一行 JSONL 落一个文件；本机 `next start` 与
 *    将来 Docker 都能用（stdout 同时保留一份，`docker logs` 天然可见）。
 * ② **绝不再抛错**：记录器本身失败只 console 一句，不能把业务写入带下水。
 * ③ **只写运行期日志目录** `logs/`（已 gitignore）。AGENTS §9 禁止仓库根散落 `.log` 文件，
 *    这条是它唯一的例外：运行期错误日志必须由应用自己落盘，不能等人工搬进 `_scratch/`。
 *
 * 不放客户端可 import 的路径：本模块用 node:fs，只能被服务端调用；
 * 浏览器侧错误经 /api/client-errors 转进来（见 logClientError）。
 */

import { appendFileSync, mkdirSync, statSync, renameSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** 单文件超过这个字节数就滚一份带时间戳的旧档，避免无限膨胀。 */
const MAX_BYTES = 2 * 1024 * 1024;

export const LOG_DIR = resolve(process.cwd(), process.env.APP_LOG_DIR || "logs");
export const LOG_FILE = join(LOG_DIR, "app-errors.jsonl");

export interface AppErrorCtx {
  /** 出错时人在哪：路由或动作涉及的主体，如 { path:'/finance', projectId:'cmi...' } */
  [key: string]: unknown;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: "Unknown", message: String(error), stack: null as string | null };
}

/**
 * 记一条服务端错误。签名与 console.error 同形，可直接替换那一行：
 *   console.error("[saveQuoteItemsAction]", e)   →   logAppError("[saveQuoteItemsAction]", e)
 *   console.error("[x]", e)                      →   logAppError("[x]", e, { projectId })
 * 第二参可以是任意抛出的值（Error 之外也收），第三参是可选上下文。
 */
export function logAppError(
  tag: string,
  error: unknown,
  ctx?: AppErrorCtx & { digest?: string; level?: "error" | "warn" },
): void {
  const ser = serializeError(error);
  const { digest, level, ...rest } = ctx ?? {};
  const line = JSON.stringify({
    at: new Date().toISOString(),
    kind: "server",
    tag: String(tag).replace(/^["']|["']$/g, ""),
    level: level ?? "error",
    digest: digest ?? null,
    message: ser.message,
    name: ser.name,
    stack: ser.stack ?? null,
    ctx: Object.keys(rest).length ? rest : null,
  });
  // stdout 保留一份：Docker / pm2 的日志采集靠它，不能只留文件。
  // eslint-disable-next-line no-console
  console.error(`[app-error] ${line}`);
  writeLine(line);
}

/** 浏览器侧捕获到的渲染错误（带 digest）转存进同一份账。 */
export function logClientError(input: {
  digest?: string;
  message?: string;
  path?: string;
  stack?: string;
}): void {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    kind: "client",
    tag: "client-render",
    level: "error",
    digest: input.digest ?? null,
    message: input.message ?? "(no message)",
    name: null,
    stack: input.stack ?? null,
    ctx: { path: input.path ?? null },
  });
  // eslint-disable-next-line no-console
  console.error(`[app-error] ${line}`);
  writeLine(line);
}

function writeLine(line: string) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    try {
      if (statSync(LOG_FILE).size > MAX_BYTES) {
        renameSync(LOG_FILE, join(LOG_DIR, `app-errors.${Date.now()}.jsonl`));
      }
    } catch {
      /* 文件还不存在，直接写 */
    }
    appendFileSync(LOG_FILE, line + "\n", "utf8");
  } catch (e) {
    // 记录器自身失败绝不影响业务：只吐一句到 stdout。
    // eslint-disable-next-line no-console
    console.error("[telemetry] 写错误日志失败，已跳过：", (e as Error)?.message || e);
  }
}

/** 给运维/自查用：读最近 N 条（倒序）。找不到文件返回空数组，不抛。 */
export function tailAppErrors(limit = 20): Array<Record<string, unknown>> {
  try {
    const raw = readFileSync(LOG_FILE, "utf8") as string;
    return raw
      .split("\n")
      .filter(Boolean)
      .slice(-Math.max(1, limit))
      .reverse()
      .map((l: string) => {
        try {
          return JSON.parse(l);
        } catch {
          return { unparsed: l };
        }
      });
  } catch {
    return [];
  }
}
