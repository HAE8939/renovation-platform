/**
 * 模块契约（AGENTS §3）。
 * 每个模块在 src/modules/<id>/manifest.ts 导出一个 ModuleManifest；
 * 外壳只读 registry，绝不写死任何模块 —— 新增模块 = 新建目录 + registry 加一行。
 */
export interface ModuleManifest {
  /** 稳定标识，用于路由与持久化，不要含空格 */
  id: string;
  /** 中文名，用于导航与首页 */
  name: string;
  description?: string;
  /** 图标名或 emoji；按设计系统，禁用彩色 icon 库 */
  icon?: string;
  /** 导航排序，升序 */
  order: number;
  /** 模块入口路径 */
  entryPath: string;
  /** 默认 false（当前免登录单用户） */
  requiresAuth?: boolean;
  /** 模块内二级导航（可选） */
  nav?: { label: string; href: string }[];
}

/**
 * DEFERRED 占位条目：仅在首页作为"即将上线"展示，
 * 不进入 modules 数组，因此不会出现在外壳导航里（AGENTS §7）。
 */
export interface DeferredModule {
  id: string;
  name: string;
  description: string;
}
