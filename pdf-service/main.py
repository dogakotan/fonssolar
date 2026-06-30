#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fons Solar — PDF Servis
Excel dosyasini alir, gunluk_rapor_generator ile PDF uretir, geri doner.
Calistirmak: uvicorn main:app --port 8001 --reload
"""

import os, sys, tempfile
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

sys.path.insert(0, str(Path(__file__).parent))
from gunluk_rapor_generator import generate_pdf

app = FastAPI(title="Fons Solar PDF Service", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # dev — prod'da domain ile sinirla
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/generate-pdf")
async def pdf_endpoint(
    excel: UploadFile = File(..., description="Doldurulmus Excel raporu (.xlsx)"),
    proje_id: str = Form(default=None),
    tarih: str    = Form(default=None),
):
    excel_path = None
    pdf_path   = None

    try:
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            tmp.write(await excel.read())
            excel_path = tmp.name

        pdf_path = excel_path.replace(".xlsx", ".pdf")

        generate_pdf(
            excel_path,
            output_path=pdf_path,
            proje_id=proje_id,
            tarih=tarih,
        )

        pdf_bytes = Path(pdf_path).read_bytes()
        fname = f"gunluk-rapor-{tarih or 'rapor'}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    finally:
        if excel_path and os.path.exists(excel_path):
            os.unlink(excel_path)
        if pdf_path and os.path.exists(pdf_path):
            os.unlink(pdf_path)
