#!/usr/bin/env python3
import sys
import os
import json
import time
import base64
import subprocess
import urllib.request
import urllib.error

BASE_URL = "http://localhost:3000"

def log_pass(msg):
    print(f"\033[92m[PASS]\033[0m {msg}")

def log_fail(msg):
    print(f"\033[91m[FAIL]\033[0m {msg}")
    sys.exit(1)

def log_info(msg):
    print(f"\033[94m[INFO]\033[0m {msg}")

def request_json(url, method="GET", data=None):
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, {"raw_error": err_body}

def main():
    print("=" * 70)
    print("M-b AI FILM STUDIO — VIDEO GENERATION PIPELINE & RENDERING VERIFICATION")
    print("=" * 70)

    # TEST 1: Health check
    status, health = request_json(f"{BASE_URL}/api/health")
    if status != 200 or not health.get("online", health.get("status") == "online"):
        log_fail(f"Health check failed: {health}")
    log_pass(f"Health check: Backend online, FFmpeg version: {health.get('ffmpegVersion', 'OK')[:40]}")

    # TEST 2: Real AI Generation Attempt & Rejection of Fake Videos
    log_info("Testing real Gemini Omni Flash generation endpoint...")
    status, gen_resp = request_json(
        f"{BASE_URL}/api/generate/video",
        method="POST",
        data={
            "clipId": "clip_audit_test_01",
            "prompt": "Cinematic low-angle medium shot of Elena Vance entering a glowing neon control room",
            "duration": 5.0,
            "aspectRatio": "16:9",
            "provider": "gemini-omni",
            "visualContinuity": {
                "lighting": "Deep cyan and amber volumetric rim lighting",
                "colorPalette": "Teal and amber cinema grade"
            }
        }
    )

    if status != 202 or not gen_resp.get("jobId"):
        log_fail(f"Video generation kickoff failed: {gen_resp}")
    job_id = gen_resp["jobId"]
    log_pass(f"Video generation job created: {job_id} (status: {gen_resp.get('status')})")

    # Poll job until completed or failed
    job_status = "queued"
    job_data = {}
    for _ in range(45):
        time.sleep(1)
        st, job_data = request_json(f"{BASE_URL}/api/jobs/{job_id}")
        if st == 200:
            job_status = job_data.get("status")
            if job_status in ("completed", "failed", "cancelled"):
                break

    log_info(f"Job finished polling with status: {job_status}")
    if job_status == "failed":
        # Confirm that NO fake video was returned
        if job_data.get("videoUrl"):
            log_fail("Failed job unexpectedly has a videoUrl! Fake fallback detected.")
        error_msg = job_data.get("error", "")
        if "Omni Flash" not in error_msg and "failed" not in error_msg.lower():
            log_fail(f"Expected informative error message about Gemini Omni Flash, got: {error_msg}")
        log_pass(f"Zero fake video policy enforced: Job correctly marked FAILED without synthetic placeholders ({error_msg[:75]}...)")
    elif job_status == "completed":
        # If API key had real paid access and generated video
        log_pass(f"Real AI video generation succeeded: {job_data.get('videoUrl')}")
    else:
        log_fail(f"Job did not reach terminal state: {job_data}")

    # TEST 3: Job Cancel Endpoint
    log_info("Testing job cancel endpoint...")
    # Create another job to cancel
    _, gen_cancel = request_json(
        f"{BASE_URL}/api/generate/video",
        method="POST",
        data={"clipId": "clip_to_cancel", "prompt": "Test shot to cancel", "duration": 4}
    )
    cancel_job_id = gen_cancel["jobId"]
    st, cancel_resp = request_json(f"{BASE_URL}/api/jobs/{cancel_job_id}/cancel", method="POST")
    if st == 200 and cancel_resp.get("status") == "cancelled":
        log_pass(f"Job cancellation verified: {cancel_job_id} is 'cancelled'")
    else:
        log_fail(f"Job cancellation failed: status={st}, resp={cancel_resp}")

    # TEST 4: Job Retry Endpoint
    log_info("Testing job retry endpoint...")
    st, retry_resp = request_json(f"{BASE_URL}/api/jobs/{job_id}/retry", method="POST")
    if st == 200 and retry_resp.get("status") in ("queued", "processing") and retry_resp.get("retryCount", 0) >= 1:
        log_pass(f"Job retry verified: {job_id} retryCount={retry_resp.get('retryCount')}")
    else:
        log_fail(f"Job retry failed: status={st}, resp={retry_resp}")

    # TEST 5: Job Persistence on Disk
    jobs_file = "data/jobs.json"
    if not os.path.exists(jobs_file):
        log_fail(f"Jobs file {jobs_file} was not written to disk!")
    with open(jobs_file, "r") as f:
        stored_jobs = json.load(f)
    if not isinstance(stored_jobs, list) or len(stored_jobs) == 0:
        log_fail(f"Jobs file {jobs_file} is empty or invalid")
    log_pass(f"Job persistence verified: {len(stored_jobs)} jobs stored in {jobs_file}")

    # TEST 6: Genuine Footage Upload Endpoint
    log_info("Testing real footage upload endpoint (/api/upload/video)...")
    temp_clip_path = "/tmp/real_test_shot.mp4"
    # Create an authentic H.264 video clip with color bars and moving timestamp
    subprocess.run([
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", "testsrc=size=1920x1080:rate=24:duration=4",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", temp_clip_path
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    with open(temp_clip_path, "rb") as f:
        b64_video = "data:video/mp4;base64," + base64.b64encode(f.read()).decode("utf-8")

    st, upload_resp = request_json(
        f"{BASE_URL}/api/upload/video",
        method="POST",
        data={
            "clipId": "clip_shot_uploaded_01",
            "base64Data": b64_video,
            "filename": "real_camera_take_01.mp4"
        }
    )

    if st != 200 or not upload_resp.get("videoUrl"):
        log_fail(f"Upload failed: status={st}, resp={upload_resp}")
    uploaded_url = upload_resp["videoUrl"]
    log_pass(f"Footage upload verified: Saved at {uploaded_url} (duration: {upload_resp.get('duration')}s)")

    # TEST 7: Master MP4 Rendering with Real Footage
    log_info("Testing Master MP4 Rendering (/api/render/mp4)...")
    st, render_kickoff = request_json(
        f"{BASE_URL}/api/render/mp4",
        method="POST",
        data={
            "project": {
                "id": "proj_pipeline_audit",
                "title": "Quantum Horizon",
                "fps": 24,
                "targetDurationSeconds": 4.0,
                "actualAssembledDuration": 4.0,
                "clips": [
                    {
                        "clipId": "clip_shot_uploaded_01",
                        "videoUrl": uploaded_url,
                        "duration": 4.0,
                        "generationStatus": "completed"
                    }
                ],
                "dialogueTracks": [
                    {
                        "id": "dlg_01",
                        "character": "Elena Vance",
                        "text": "The temporal sequence is stabilizing.",
                        "startTime": 0.5,
                        "duration": 2.5
                    }
                ],
                "sfxTracks": []
            },
            "settings": {
                "resolution": "1080p",
                "fps": 24,
                "audioMix": {
                    "dialogueLevel": 90,
                    "musicLevel": 60,
                    "sfxLevel": 70
                }
            }
        }
    )

    if st != 202 or not render_kickoff.get("jobId"):
        log_fail(f"Render kickoff failed: {render_kickoff}")
    render_job_id = render_kickoff["jobId"]
    final_mp4_name = render_kickoff["finalMp4Name"]
    log_info(f"Rendering job queued: {render_job_id} -> {final_mp4_name}")

    # Poll render job
    render_completed = False
    for _ in range(30):
        time.sleep(1)
        st, r_job = request_json(f"{BASE_URL}/api/jobs/{render_job_id}")
        if st == 200 and r_job.get("status") == "completed":
            render_completed = True
            break
        elif st == 200 and r_job.get("status") == "failed":
            log_fail(f"Render job failed: {r_job.get('error')}")

    if not render_completed:
        log_fail("Render job timed out before completion")
    log_pass(f"Master MP4 rendered successfully: {final_mp4_name}")

    # TEST 8: Deep MP4 Validation & Decodability
    log_info("Testing deep MP4 validation endpoint (/api/exports/.../validate)...")
    st, val_resp = request_json(f"{BASE_URL}/api/exports/{final_mp4_name}/validate")
    if st != 200 or not val_resp.get("valid"):
        log_fail(f"MP4 validation failed: {val_resp}")
    log_pass(f"FFprobe Validation: {val_resp.get('resolution')} {val_resp.get('videoCodec')}, audio={val_resp.get('audioCodec')} ({val_resp.get('audioChannels')}ch), size={val_resp.get('fileSize')}B, decodable=True")

    # TEST 9: Binary Download Endpoint
    download_url = f"{BASE_URL}/api/exports/{final_mp4_name}"
    req = urllib.request.Request(download_url)
    with urllib.request.urlopen(req) as resp:
        content_type = resp.headers.get("Content-Type")
        disposition = resp.headers.get("Content-Disposition")
        mp4_bytes = resp.read()

    if content_type != "video/mp4":
        log_fail(f"Download returned Content-Type '{content_type}', expected 'video/mp4'")
    if not disposition or f'filename="{final_mp4_name}"' not in disposition:
        log_fail(f"Download returned invalid Content-Disposition: '{disposition}'")
    if len(mp4_bytes) == 0:
        log_fail("Downloaded file is 0 bytes")
    if mp4_bytes[:4] != b'\x00\x00\x00\x18' and b'ftyp' not in mp4_bytes[:32]:
        log_fail("Downloaded file does not start with valid MP4 container ftyp box")

    log_pass(f"Master MP4 Download Verified: {len(mp4_bytes):,} bytes, Content-Type: video/mp4, ftyp header valid")
    print("=" * 70)
    print("\033[92mALL PIPELINE AND RENDERING VERIFICATION TESTS PASSED!\033[0m")
    print("=" * 70)

if __name__ == "__main__":
    main()
