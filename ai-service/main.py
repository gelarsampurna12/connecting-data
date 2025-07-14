from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

# Struktur data input siswa
class SiswaData(BaseModel):
    nama: str
    nilai_psikotes: float
    kehadiran: float

# Endpoint prediksi potensi siswa
@app.post("/prediksi")
def prediksi(data: SiswaData):
    if data.nilai_psikotes >= 80 and data.kehadiran >= 85:
        potensi = "Akademik"
    elif data.nilai_psikotes < 80 and data.kehadiran >= 85:
        potensi = "Kreatif-Non Akademik"
    else:
        potensi = "Perlu Bimbingan"

    return {
        "nama": data.nama,
        "potensi": potensi,
        "nilai": data.nilai_psikotes,
        "kehadiran": data.kehadiran
    }

