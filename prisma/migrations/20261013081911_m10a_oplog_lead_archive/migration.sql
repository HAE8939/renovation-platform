-- CreateTable
CREATE TABLE "operation_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "projectId" TEXT,
    "summary" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'user-local',
    "actorName" TEXT,
    "error" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_leads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "estate" TEXT,
    "area" REAL NOT NULL DEFAULT 0,
    "style" TEXT,
    "budgetRange" TEXT,
    "source" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'leads',
    "intentLevel" TEXT NOT NULL DEFAULT 'medium',
    "assignee" TEXT,
    "lastFollowAt" DATETIME,
    "nextFollowAt" DATETIME,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" DATETIME,
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "leads_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "leads_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_leads" ("area", "assignee", "budgetRange", "code", "createdAt", "estate", "id", "intentLevel", "lastFollowAt", "name", "nextFollowAt", "orgId", "phone", "projectId", "source", "stage", "style", "updatedAt") SELECT "area", "assignee", "budgetRange", "code", "createdAt", "estate", "id", "intentLevel", "lastFollowAt", "name", "nextFollowAt", "orgId", "phone", "projectId", "source", "stage", "style", "updatedAt" FROM "leads";
DROP TABLE "leads";
ALTER TABLE "new_leads" RENAME TO "leads";
CREATE UNIQUE INDEX "leads_code_key" ON "leads"("code");
CREATE UNIQUE INDEX "leads_projectId_key" ON "leads"("projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "operation_logs_projectId_at_idx" ON "operation_logs"("projectId", "at");

-- CreateIndex
CREATE INDEX "operation_logs_entity_entityId_idx" ON "operation_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "operation_logs_at_idx" ON "operation_logs"("at");
