-- CreateTable
CREATE TABLE "design_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assigneeId" TEXT,
    "reviewerId" TEXT,
    "requirement" TEXT NOT NULL DEFAULT '',
    "deadline" DATETIME,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "design_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "task_submissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "assetRef" TEXT,
    "submittedBy" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'pending',
    "rejectReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_submissions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "design_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "design_tasks_code_key" ON "design_tasks"("code");

-- CreateIndex
CREATE INDEX "design_tasks_projectId_idx" ON "design_tasks"("projectId");

-- CreateIndex
CREATE INDEX "design_tasks_assigneeId_idx" ON "design_tasks"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "task_submissions_taskId_version_key" ON "task_submissions"("taskId", "version");
