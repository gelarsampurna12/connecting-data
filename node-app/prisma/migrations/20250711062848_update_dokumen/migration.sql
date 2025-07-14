/*
  Warnings:

  - Added the required column `nama` to the `Dokumen` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Dokumen" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nama" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,
    "subkategori" TEXT,
    "nama_file" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Dokumen" ("id", "kategori", "nama_file", "path", "subkategori", "uploaded_at") SELECT "id", "kategori", "nama_file", "path", "subkategori", "uploaded_at" FROM "Dokumen";
DROP TABLE "Dokumen";
ALTER TABLE "new_Dokumen" RENAME TO "Dokumen";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
