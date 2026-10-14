"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface ProjectSearchOption {
  id: string;
  name: string;
  code: string;
}

export function ProjectSearchFilter({
  projects,
  selectedId,
  basePath,
  preserveParams = {},
}: {
  projects: ProjectSearchOption[];
  selectedId?: string | null;
  basePath: string;
  preserveParams?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const selected = projects.find((project) => project.id === selectedId) ?? null;
  const [query, setQuery] = useState(selected ? `${selected.name} · ${selected.code}` : "");

  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return projects;
    return projects.filter((project) =>
      `${project.name} ${project.code}`.toLocaleLowerCase("zh-CN").includes(normalized),
    );
  }, [projects, query]);

  function hrefFor(projectId?: string) {
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    for (const [key, value] of Object.entries(preserveParams)) {
      if (value) params.set(key, value);
    }
    const queryString = params.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
  }

  function choose(project: ProjectSearchOption | null) {
    setQuery(project ? `${project.name} · ${project.code}` : "");
    router.push(hrefFor(project?.id));
  }

  return (
    <div className="w-full max-w-sm">
      <label className="block text-[13px] text-secondary" htmlFor={`${basePath}-project-search`}>
        项目
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id={`${basePath}-project-search`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入项目名或编号"
          className="min-w-0 flex-1 rounded-inner border border-line bg-surface px-3 py-2 text-[13px] text-primary placeholder:text-muted focus:border-accent focus:outline-none"
          aria-describedby={`${basePath}-project-search-help`}
        />
        {selectedId ? (
          <button
            type="button"
            onClick={() => choose(null)}
            className="shrink-0 text-[13px] text-secondary underline-offset-4 hover:text-primary hover:underline"
          >
            全部
          </button>
        ) : null}
      </div>
      <p id={`${basePath}-project-search-help`} className="mt-1.5 text-xs text-muted">
        {selected ? `当前：${selected.name}` : "输入后从匹配项目中选择"}
      </p>
      {matches.length > 0 && (!selected || query !== `${selected.name} · ${selected.code}`) ? (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-inner border border-line bg-surface p-1">
          {matches.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => choose(project)}
              className="flex w-full items-baseline justify-between gap-3 rounded-inner px-2 py-1.5 text-left text-[13px] hover:bg-canvas"
            >
              <span className="min-w-0 truncate text-primary">{project.name}</span>
              <span className="num shrink-0 text-xs text-secondary">{project.code}</span>
            </button>
          ))}
        </div>
      ) : query.trim() && matches.length === 0 ? (
        <p className="mt-2 text-xs text-muted">没有匹配的项目</p>
      ) : null}
    </div>
  );
}
