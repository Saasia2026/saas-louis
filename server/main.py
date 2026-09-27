"""
Serveur de face swap local — InsightFace (inswapper_128) + GFPGAN.

Aucun filtre de contenu : le visage source remplace chaque visage détecté dans
la vidéo, image par image.  Le résultat est servi depuis /results/{job_id}.mp4
et un webhook est appelé à la fin du traitement si fourni.

Lancer :
    pip install -r requirements.txt
    python main.py                       # GPU 0, port 7860
    GPU_ID=-1 python main.py             # CPU (lent)

Variables d'environnement :
    API_KEY   — clé partagée avec le site (header Authorization: Bearer <key>)
    GPU_ID    — index du GPU (0) ou -1 pour CPU
    PORT      — port d'écoute (7860)
    ENHANCE   — true/false, amélioration GFPGAN après swap
"""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from enum import Enum
from pathlib import Path
from typing import Optional

import cv2
import httpx
import insightface
import numpy as np
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

API_KEY = os.getenv("API_KEY", "")
GPU_ID = int(os.getenv("GPU_ID", "0"))
PORT = int(os.getenv("PORT", "7860"))
ENHANCE = os.getenv("ENHANCE", "true").lower() in ("true", "1", "yes")

RESULTS_DIR = Path("results")
RESULTS_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# Modèles (chargés une seule fois)
# ---------------------------------------------------------------------------

providers = (
    [("CUDAExecutionProvider", {"device_id": GPU_ID})]
    if GPU_ID >= 0
    else ["CPUExecutionProvider"]
)

print("Chargement des modèles…")
analyzer = insightface.app.FaceAnalysis(
    name="buffalo_l", providers=providers
)
analyzer.prepare(ctx_id=max(GPU_ID, 0), det_size=(640, 640))

swapper = insightface.model_zoo.get_model(
    "inswapper_128.onnx", providers=providers
)

enhancer = None
if ENHANCE:
    try:
        from gfpgan import GFPGANer

        enhancer = GFPGANer(
            model_path="GFPGANv1.4.pth",
            upscale=1,
            arch="clean",
            channel_multiplier=2,
            bg_upsampler=None,
        )
        print("GFPGAN activé")
    except Exception as exc:
        print(f"GFPGAN indisponible ({exc}), swap sans amélioration")

print("Modèles chargés ✓")

# ---------------------------------------------------------------------------
# File de traitement
# ---------------------------------------------------------------------------


class Status(str, Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Job(BaseModel):
    id: str
    status: Status = Status.queued
    progress: int = 0
    error: Optional[str] = None
    webhook_url: Optional[str] = None


jobs: dict[str, Job] = {}
executor = ThreadPoolExecutor(max_workers=1)


# ---------------------------------------------------------------------------
# Face swap — traitement d'une vidéo
# ---------------------------------------------------------------------------


def download(url: str, dest: Path) -> None:
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        with client.stream("GET", url) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_bytes(65536):
                    f.write(chunk)


def swap_video(
    video_path: Path,
    face_path: Path,
    output_path: Path,
    job: Job,
) -> None:
    source_img = cv2.imread(str(face_path))
    if source_img is None:
        raise ValueError("Image du visage source illisible")
    source_faces = analyzer.get(source_img)
    if not source_faces:
        raise ValueError("Aucun visage détecté dans l'image source")
    source_face = max(source_faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError("Vidéo source illisible")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

    tmp_video = output_path.with_suffix(".tmp.mp4")
    fourcc = cv2.VideoWriter.fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(tmp_video), fourcc, fps, (width, height))

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        faces = analyzer.get(frame)
        for face in faces:
            frame = swapper.get(frame, face, source_face, paste_back=True)
        if enhancer is not None:
            try:
                _, _, restored = enhancer.enhance(
                    frame, has_aligned=False, only_center_face=False, paste_back=True
                )
                if restored is not None:
                    frame = restored
            except Exception:
                pass
        writer.write(frame)
        frame_idx += 1
        job.progress = int(frame_idx / total * 90)

    cap.release()
    writer.release()

    # Remettre le son d'origine avec ffmpeg.
    job.progress = 95
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        final = output_path
        subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel", "error",
                "-y",
                "-i", str(tmp_video),
                "-i", str(video_path),
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "18",
                "-map", "0:v:0",
                "-map", "1:a?",
                "-c:a", "aac",
                "-movflags", "+faststart",
                "-shortest",
                str(final),
            ],
            timeout=300,
            check=True,
        )
        tmp_video.unlink(missing_ok=True)
    else:
        tmp_video.rename(output_path)


def process_job(job: Job, video_url: str, face_url: str) -> None:
    tmp = Path(tempfile.mkdtemp(prefix="faceswap-"))
    try:
        job.status = Status.processing
        job.progress = 0

        video_path = tmp / "input.mp4"
        face_path = tmp / "face.png"
        download(video_url, video_path)
        download(face_url, face_path)
        job.progress = 5

        output_path = RESULTS_DIR / f"{job.id}.mp4"
        swap_video(video_path, face_path, output_path, job)

        job.status = Status.completed
        job.progress = 100
    except Exception as exc:
        job.status = Status.failed
        job.error = str(exc)[:500]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if job.webhook_url:
        try:
            httpx.post(
                job.webhook_url,
                json={"job_id": job.id, "status": job.status.value},
                timeout=10,
            )
        except Exception:
            pass


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

app = FastAPI(title="FaceFusion local swap server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def check_auth(authorization: str | None = Header(None)):
    if not API_KEY:
        return
    if not authorization or not authorization.removeprefix("Bearer ").strip() == API_KEY:
        raise HTTPException(401, "Clé invalide")


class SwapRequest(BaseModel):
    video_url: str
    face_url: str
    webhook_url: Optional[str] = None


class SwapResponse(BaseModel):
    job_id: str


class JobStatus(BaseModel):
    id: str
    status: Status
    progress: int
    error: Optional[str] = None
    result_url: Optional[str] = None


@app.post("/api/swap", response_model=SwapResponse)
async def create_swap(
    body: SwapRequest,
    authorization: str | None = Header(None),
):
    check_auth(authorization)
    job_id = uuid.uuid4().hex[:16]
    job = Job(id=job_id, webhook_url=body.webhook_url)
    jobs[job_id] = job
    loop = asyncio.get_running_loop()
    loop.run_in_executor(executor, process_job, job, body.video_url, body.face_url)
    return SwapResponse(job_id=job_id)


@app.get("/api/jobs/{job_id}", response_model=JobStatus)
async def get_job(job_id: str, authorization: str | None = Header(None)):
    check_auth(authorization)
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job introuvable")
    result_url = None
    if job.status == Status.completed:
        result_url = f"/results/{job.id}.mp4"
    return JobStatus(
        id=job.id,
        status=job.status,
        progress=job.progress,
        error=job.error,
        result_url=result_url,
    )


app.mount("/results", StaticFiles(directory=str(RESULTS_DIR)), name="results")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
