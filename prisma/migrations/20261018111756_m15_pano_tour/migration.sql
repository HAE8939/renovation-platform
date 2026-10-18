-- M15-a 全景管理模块：新增 pano_tours（一条已登记的全景导览）。
-- 纯新增表，不回填、不触碰任何既有行——全景成品文件本来就在磁盘上，库里此前无对应物。
-- 全景成品本身不入这张表（见 schema 上方注释）：这里只记「哪个目录、属于哪个项目、是否上架」。
-- onDelete: SetNull —— 项目被归档不受影响；理论上项目无删除入口，留 SetNull 是为防未来出现
-- 硬删路径时把导览记录带成孤儿（文件还在磁盘，扫描能重新登记，但不该静默丢关联）。

-- CreateTable
CREATE TABLE "pano_tours" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "dirName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sceneCount" INTEGER NOT NULL DEFAULT 0,
    "coverKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "order" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "pano_tours_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "pano_tours_dirName_key" ON "pano_tours"("dirName");

-- CreateIndex
CREATE INDEX "pano_tours_projectId_status_order_idx" ON "pano_tours"("projectId", "status", "order");

-- CreateIndex
CREATE INDEX "pano_tours_status_idx" ON "pano_tours"("status");
