-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'platform',
    "themeKey" TEXT NOT NULL DEFAULT 'cobalt',
    "logoFile" TEXT,
    "updatedAt" DATETIME NOT NULL
);
