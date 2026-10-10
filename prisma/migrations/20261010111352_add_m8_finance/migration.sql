-- CreateTable
CREATE TABLE "finance_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "recordedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "finance_records_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payment_nodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "percent" REAL NOT NULL,
    "amountDue" REAL NOT NULL,
    "trigger" TEXT NOT NULL,
    "triggerStages" TEXT NOT NULL DEFAULT '',
    "unlocksAt" DATETIME,
    "note" TEXT NOT NULL DEFAULT '',
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" DATETIME,
    "paidBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "payment_nodes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "finance_records_projectId_idx" ON "finance_records"("projectId");

-- CreateIndex
CREATE INDEX "finance_records_type_idx" ON "finance_records"("type");

-- CreateIndex
CREATE INDEX "finance_records_date_idx" ON "finance_records"("date");

-- CreateIndex
CREATE INDEX "payment_nodes_projectId_idx" ON "payment_nodes"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_nodes_projectId_order_key" ON "payment_nodes"("projectId", "order");
