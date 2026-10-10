-- CreateTable
CREATE TABLE "process_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "tier" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "schedule_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "actualStart" DATETIME,
    "actualEnd" DATETIME,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "schedule_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "schedule_task_deps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "schedule_task_deps_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "schedule_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "schedule_task_deps_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "schedule_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "process_templates_tier_order_key" ON "process_templates"("tier", "order");

-- CreateIndex
CREATE INDEX "schedule_tasks_projectId_idx" ON "schedule_tasks"("projectId");

-- CreateIndex
CREATE INDEX "schedule_tasks_ownerId_idx" ON "schedule_tasks"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_task_deps_taskId_dependsOnId_key" ON "schedule_task_deps"("taskId", "dependsOnId");
