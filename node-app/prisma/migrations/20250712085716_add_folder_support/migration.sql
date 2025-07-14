-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Dokumen" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nama" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,
    "subkategori" TEXT,
    "nama_file" TEXT,
    "path" TEXT NOT NULL,
    "tipe_file" TEXT,
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parent_id" INTEGER,
    CONSTRAINT "Dokumen_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Dokumen" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Dokumen" ("id", "kategori", "nama", "nama_file", "path", "subkategori", "tipe_file", "uploaded_at") SELECT "id", "kategori", "nama", "nama_file", "path", "subkategori", "tipe_file", "uploaded_at" FROM "Dokumen";
DROP TABLE "Dokumen";
ALTER TABLE "new_Dokumen" RENAME TO "Dokumen";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
