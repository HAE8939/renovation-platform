-- CreateTable
CREATE TABLE "custom_field_defs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" TEXT NOT NULL DEFAULT '',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "custom_field_values" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fieldId" TEXT NOT NULL,
    "entityKind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" REAL,
    "valueDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "custom_field_values_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "custom_field_defs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_defs_key_key" ON "custom_field_defs"("key");

-- CreateIndex
CREATE INDEX "custom_field_values_entityKind_entityId_idx" ON "custom_field_values"("entityKind", "entityId");

-- CreateIndex
CREATE INDEX "custom_field_values_fieldId_valueNumber_idx" ON "custom_field_values"("fieldId", "valueNumber");

-- CreateIndex
CREATE INDEX "custom_field_values_fieldId_valueDate_idx" ON "custom_field_values"("fieldId", "valueDate");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_values_fieldId_entityKind_entityId_key" ON "custom_field_values"("fieldId", "entityKind", "entityId");
