-- CreateTable
CREATE TABLE "file_assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploaderName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "file_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "work_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDate" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "minutes" INTEGER,
    "outputNote" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "work_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "work_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_change_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" DATETIME,
    "submittedBy" TEXT,
    "confirmedAt" DATETIME,
    "confirmedBy" TEXT,
    "confirmNote" TEXT NOT NULL DEFAULT '',
    "rejectReason" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "change_orders_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "budget_quotes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_change_orders" ("amount", "createdAt", "createdBy", "date", "id", "kind", "note", "quoteId", "title", "updatedAt") SELECT "amount", "createdAt", "createdBy", "date", "id", "kind", "note", "quoteId", "title", "updatedAt" FROM "change_orders";
DROP TABLE "change_orders";
ALTER TABLE "new_change_orders" RENAME TO "change_orders";
CREATE INDEX "change_orders_quoteId_idx" ON "change_orders"("quoteId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "file_assets_ownerType_ownerId_createdAt_idx" ON "file_assets"("ownerType", "ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "file_assets_projectId_category_idx" ON "file_assets"("projectId", "category");

-- CreateIndex
CREATE INDEX "work_logs_projectId_workDate_idx" ON "work_logs"("projectId", "workDate");

-- CreateIndex
CREATE INDEX "work_logs_userId_workDate_idx" ON "work_logs"("userId", "workDate");
