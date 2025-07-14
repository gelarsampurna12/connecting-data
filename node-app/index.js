const fs = require("fs");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const path = require("path");
const XLSX = require("xlsx");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const pathLib = require("path");

const { PrismaClient } = require("@prisma/client");
const authMiddleware = require("./middlewares/auth");

const prisma = new PrismaClient();
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use("/dokumen", express.static(path.join(__dirname, "dokumen")));

// ======================
// 🔧 Setup Multer Upload
// ======================
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      let kategori = req.body.kategori;
      let subkategori = req.body.subkategori;

      // Jika tidak ada kategori, coba ambil dari parent folder
      if (!kategori && req.body.parent_id) {
        const folderParent = await prisma.dokumen.findUnique({
          where: { id: parseInt(req.body.parent_id) },
        });

        if (!folderParent) {
          return cb(new Error("Folder induk tidak ditemukan"));
        }

        kategori = folderParent.kategori;
        subkategori = folderParent.subkategori;
      }

      if (!kategori) {
        return cb(new Error("Kategori tidak boleh kosong"));
      }

      const folder = subkategori ? `${kategori}/${subkategori}` : kategori;
      const uploadPath = path.join("dokumen", folder);

      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({ storage });
// =============================================
// 📤 POST /upload → Upload + AI + Simpan DB
// =============================================
app.post("/upload", upload.single("file"), async (req, res) => {
  const { nama, nilai_psikotes, kehadiran } = req.body;
  const file = req.file;

  if (!nama || !nilai_psikotes || !kehadiran) {
    return res.status(400).json({ error: "Semua field harus diisi." });
  }

  const nilai = parseFloat(nilai_psikotes);
  const hadir = parseFloat(kehadiran);

  if (isNaN(nilai) || isNaN(hadir)) {
    return res.status(400).json({ error: "Nilai dan Kehadiran harus berupa angka." });
  }

  if (nilai < 0 || nilai > 100 || hadir < 0 || hadir > 100) {
    return res.status(400).json({ error: "Nilai dan Kehadiran harus antara 0 - 100." });
  }

  try {
    const siswa = { nama, nilai_psikotes: nilai, kehadiran: hadir };
    const response = await axios.post("http://localhost:8000/prediksi", siswa);
    const hasilPrediksi = response.data;

    const saved = await prisma.siswa.create({
      data: {
        nama,
        nilai: hasilPrediksi.nilai,
        kehadiran: hasilPrediksi.kehadiran,
        potensi: hasilPrediksi.potensi,
        file: file ? file.filename : null,
        uploaded_at: new Date(),
      },
    });

    res.json({ message: "✅ Berhasil upload & prediksi", data: saved });
  } catch (error) {
    console.error("❌ Gagal kirim ke AI:", error.message);
    res.status(500).json({ error: "Gagal proses AI", detail: error.message });
  }
});

// ===========================
// 📄 GET /rekap → Semua data
// ===========================
app.get("/rekap", authMiddleware, async (req, res) => {
  const siswa = await prisma.siswa.findMany({
    orderBy: { uploaded_at: "desc" },
  });
  res.json(siswa);
});

// ====================================
// 📥 GET /export-excel → Unduh Rekap
// ====================================
app.get("/export-excel", authMiddleware, async (req, res) => {
  const siswaData = await prisma.siswa.findMany({
    orderBy: { uploaded_at: "desc" },
  });

  const worksheet = XLSX.utils.json_to_sheet(siswaData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "RekapSiswa");

  const exportPath = "rekap_siswa.xlsx";
  XLSX.writeFile(workbook, exportPath);

  res.download(exportPath);
});

// ==============================
// 📡 POST /kirim-ke-ai → Prediksi
// ==============================
app.post("/kirim-ke-ai", async (req, res) => {
  try {
    const siswa = req.body;
    const response = await axios.post("http://localhost:8000/prediksi", siswa);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: "Gagal konek ke AI", detail: err.message });
  }
});

// ============================
// 🌐 GET / → Halaman Upload
// ============================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "upload.html"));
});

// ============================
// 🌐 GET /rekap-view → Tabel
// ============================
app.get("/rekap-view", (req, res) => {
  res.sendFile(path.join(__dirname, "rekap.html"));
});

// ==========================
// 🔧 PUT /edit/:id
// ==========================
app.put("/edit/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { nama, nilai, kehadiran } = req.body;

  try {
    const response = await axios.post("http://localhost:8000/prediksi", {
      nama,
      nilai_psikotes: parseFloat(nilai),
      kehadiran: parseFloat(kehadiran),
    });

    const hasil = response.data;

    const updated = await prisma.siswa.update({
      where: { id: parseInt(id) },
      data: {
        nama,
        nilai: hasil.nilai,
        kehadiran: hasil.kehadiran,
        potensi: hasil.potensi,
      },
    });

    res.json({ message: "Berhasil update & prediksi ulang", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Gagal update dan prediksi ulang", detail: err.message });
  }
});

// ==============================
// 📤 POST /upload-dokumen → Upload File Tunggal/Folder
// ==============================
app.post("/upload-dokumen", upload.fields([
  { name: "file", maxCount: 1 },
  { name: "files[]", maxCount: 100 },
]), async (req, res) => {
  const { nama, kategori, subkategori } = req.body;
  const singleFile = req.files["file"] ? req.files["file"][0] : null;
  const folderFiles = req.files["files[]"] || [];

  if (!kategori || (!singleFile && folderFiles.length === 0)) {
    return res.status(400).json({ error: "Kategori dan file wajib diisi." });
  }

  const folder = subkategori ? `${kategori}/${subkategori}` : kategori;
  const allFiles = singleFile ? [singleFile] : folderFiles;

  try {
    const savedFiles = [];

    // === 📁 BUAT FOLDER DI DATABASE JIKA UPLOAD FOLDER ===
    let parentFolder = null;

    if (folderFiles.length > 0) {
      // Cek apakah folder sudah ada (berdasarkan nama + kategori + subkategori)
      parentFolder = await prisma.dokumen.findFirst({
        where: {
          nama,
          kategori,
          subkategori,
          tipe_file: "folder",
        },
      });

      // Jika belum ada, buat folder baru
      if (!parentFolder) {
        parentFolder = await prisma.dokumen.create({
          data: {
            nama,
            kategori,
            subkategori,
            tipe_file: "folder",
            path: folder, // opsional, hanya untuk display
            uploaded_at: new Date(),
          },
        });
      }
    }

    // === 💾 SIMPAN SETIAP FILE ===
    for (const file of allFiles) {
      const finalPath = path.join("dokumen", folder, file.filename);
      const tipeFile = path.extname(file.originalname).substring(1).toLowerCase();

      const saved = await prisma.dokumen.create({
        data: {
          nama: file.originalname,
          kategori,
          subkategori,
          nama_file: file.originalname,
          path: finalPath.replace(/\\/g, "/"),
          tipe_file: tipeFile,
          uploaded_at: new Date(),
          parent_id: parentFolder?.id || null,
        },
      });

      savedFiles.push(saved);
    }

    res.json({ message: "✅ Upload berhasil", data: savedFiles });
  } catch (err) {
    console.error("❌ Gagal upload dokumen:", err.message);
    res.status(500).json({ error: "Gagal upload dokumen", detail: err.message });
  }
});


// ============================
// 📤 PUT /edit-dokumen/:id → Edit dokumen
// ============================
app.post("/edit-dokumen/:id", upload.single("file"), async (req, res) => {
  const { id } = req.params;
  const { nama, kategori, subkategori } = req.body;
  const file = req.file;

  try {
    const dokumenLama = await prisma.dokumen.findUnique({ where: { id: parseInt(id) } });

    if (!dokumenLama) {
      return res.status(404).json({ error: "Dokumen tidak ditemukan." });
    }

    let newPath = dokumenLama.path;
    let newNamaFile = dokumenLama.nama_file;
    let tipeFile = dokumenLama.tipe_file;

    if (file) {
      const folder = subkategori ? `${kategori}/${subkategori}` : kategori;
      const newFilePath = path.join("dokumen", folder, file.filename);

      fs.mkdirSync(path.join("dokumen", folder), { recursive: true });

      if (fs.existsSync(path.join(__dirname, dokumenLama.path)) && dokumenLama.path !== newFilePath) {
        fs.unlinkSync(path.join(__dirname, dokumenLama.path));
      }

      newPath = newFilePath.replaceAll("\\", "/");
      newNamaFile = file.originalname;
      tipeFile = path.extname(file.originalname).substring(1).toLowerCase();
    }

    const updated = await prisma.dokumen.update({
      where: { id: parseInt(id) },
      data: {
        nama,
        kategori,
        subkategori,
        nama_file: newNamaFile,
        path: newPath,
        tipe_file: tipeFile,
      },
    });

    res.json({ message: "Dokumen berhasil diperbarui", data: updated });
  } catch (err) {
    console.error("Edit gagal:", err.message);
    res.status(500).json({ error: "Gagal edit dokumen", detail: err.message });
  }
});

// ============================
// 🌐 GET /upload-dokumen → Form Upload Dokumen
// ============================
app.get("/upload-dokumen", (req, res) => {
  res.sendFile(path.join(__dirname, "upload-dokumen.html"));
});

// ============================
// 📄 GET /dokumen → Semua Dokumen
// ============================
app.get("/dokumen", async (req, res) => {
  const list = await prisma.dokumen.findMany({
    where: {
      parent_id: null, // ⬅️ hanya yang bukan isi folder
    },
    orderBy: {
      uploaded_at: "desc",
    },
  });

  const result = list.map(doc => ({
    ...doc,
    is_folder: doc.tipe_file === "folder" || !doc.tipe_file,
  }));

  res.json(result);
});


// ========================
// 🗑️ DELETE /hapus/:id
// ========================
app.delete("/hapus/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.siswa.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ error: "Gagal hapus", detail: err.message });
  }
});

app.delete("/hapus-dokumen/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const dokumen = await prisma.dokumen.findUnique({
      where: { id: parseInt(id) }
    });

    if (!dokumen) return res.status(404).json({ error: "Dokumen tidak ditemukan." });

    const fullPath = path.join(__dirname, dokumen.path);

    // Jika dokumen adalah folder
    if (dokumen.tipe_file === "folder") {
      // 🔁 Hapus semua anak file dalam folder
      await prisma.dokumen.deleteMany({ where: { parent_id: dokumen.id } });

      // ❌ Jangan pakai fs.unlinkSync, tapi opsional bisa hapus folder fisik
      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true }); // opsional
      }

    } else {
      // Jika file biasa
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    // Hapus record folder atau file-nya
    await prisma.dokumen.delete({ where: { id: parseInt(id) } });

    res.json({ message: "✅ Dokumen berhasil dihapus" });
  } catch (err) {
    console.error("Gagal hapus:", err.message);
    res.status(500).json({ error: "Gagal hapus dokumen", detail: err.message });
  }
});


// =============================
// 🔐 Admin Auth - Register
// =============================
app.post("/admin/register", async (req, res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const admin = await prisma.admin.create({ data: { username, password: hash } });
  res.json({ message: "Admin created", admin });
});

// =============================
// 🔐 Admin Auth - Login
// =============================
app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;
  const admin = await prisma.admin.findUnique({ where: { username } });
  if (!admin) return res.status(401).json({ error: "Admin tidak ditemukan" });

  const valid = await bcrypt.compare(password, admin.password);
  if (!valid) return res.status(401).json({ error: "Password salah" });

  const token = jwt.sign(
    { id: admin.id, username: admin.username },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  res.json({ token });
});

app.get("/folder/:id", async (req, res) => {
  const folderId = parseInt(req.params.id);

  if (isNaN(folderId)) {
    return res.status(400).json({ error: "ID folder tidak valid." });
  }

  try {
    const filesInFolder = await prisma.dokumen.findMany({
      where: {
        parent_id: folderId,
      },
      orderBy: {
        uploaded_at: "desc",
      },
    });

    const result = filesInFolder.map(doc => ({
      ...doc,
      is_folder: doc.tipe_file === "folder" || !doc.tipe_file,
    }));

    res.json(result);
  } catch (err) {
    console.error("❌ Gagal mengambil isi folder:", err.message);
    res.status(500).json({ error: "Gagal mengambil isi folder" });
  }
});

app.post("/upload-folder", upload.array("files"), async (req, res) => {
  const { nama, kategori } = req.body;

  try {
    // 1. Buat 1 folder entry
    const folder = await prisma.dokumen.create({
      data: {
        nama,
        kategori,
        tipe_file: "folder",
        uploaded_at: new Date(),
      },
    });

    // 2. Upload semua file sebagai isi folder
    for (const file of req.files) {
      await prisma.dokumen.create({
        data: {
          nama: file.originalname,
          path: file.path.replace(/\\/g, "/"),
          tipe_file: file.mimetype.split("/").pop(),
          kategori,
          uploaded_at: new Date(),
          parent_id: folder.id,
        },
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal upload folder" });
  }
});

// POST /api/folder
app.post("/api/folder", async (req, res) => {
  const { nama, kategori } = req.body;

  if (!nama || !kategori) {
    return res.status(400).json({ error: "Nama dan kategori wajib diisi." });
  }

  try {
    // Buat folder secara fisik
    const folderPath = pathLib.join(__dirname, "dokumen", kategori, nama);
    fs.mkdirSync(folderPath, { recursive: true });

    // Simpan ke database
    const folder = await prisma.dokumen.create({
      data: {
        nama,
        kategori,
        path: `dokumen/${kategori}/${nama}`, // ✅ sesuai struktur fisik
        tipe_file: "folder",
        uploaded_at: new Date(),
      },
    });

    res.json({ folderId: folder.id });
  } catch (err) {
    console.error("❌ Gagal membuat folder:", err);
    res.status(500).json({ error: "Gagal membuat folder", detail: err.message });
  }
});


// POST /api/upload-multiple
app.post("/api/upload-multiple", upload.array("files"), async (req, res) => {
  const { parent_id } = req.body;

  try {
    // ⬇️ Ambil data folder induk
    const parentFolder = await prisma.dokumen.findUnique({
      where: { id: parseInt(parent_id) },
    });

    if (!parentFolder) {
      return res.status(400).json({ error: "Folder induk tidak ditemukan" });
    }

    // ⬇️ Simpan semua file ke database
    for (const file of req.files) {
      const fullPath = file.path.replace(/\\/g, "/");
      const tipeFile = file.mimetype.split("/").pop();

      await prisma.dokumen.create({
        data: {
          nama: file.originalname,
          path: fullPath,
          tipe_file: tipeFile,
          uploaded_at: new Date(),
          parent_id: parentFolder.id,
          kategori: parentFolder.kategori,        // ✅ WAJIB
          subkategori: parentFolder.subkategori || null, // optional
        },
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Upload ke folder gagal:", err.message);
    res.status(500).json({ error: "Upload ke folder gagal", detail: err.message });
  }
});

// ========================
// ▶️ Jalankan Server
// ========================
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
