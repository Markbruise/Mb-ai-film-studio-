import json
import time
import subprocess
import urllib.request
import urllib.error
import base64
import os
import sys

BASE_URL = "http://localhost:3000"

def log(msg):
    print(f"[TEST] {msg}")

def request_json(path, data=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode("utf-8"))

def test_health():
    log("Checking backend health...")
    data = request_json("/api/health")
    assert data.get("status") in ("ok", "online"), f"Health status unexpected: {data}"
    log(f"Backend healthy. Gemini Model: {data.get('activeModel')}, Veo Model: {data.get('activeVeoModel')}")

def test_dialogue_synthesis():
    log("Testing dialogue TTS speech synthesis (/api/audio/dialogue/generate)...")
    payload = {
        "dialogueId": "dlg_test_elena_01",
        "text": "The temporal anomaly is stabilizing. We only have three minutes before the gateway closes.",
        "character": "Dr. Elena Vance"
    }
    data = request_json("/api/audio/dialogue/generate", payload)
    assert data.get("audioUrl"), f"No audioUrl in response: {data}"
    assert data.get("duration", 0) > 0, f"Duration is 0: {data}"
    
    # Check that file exists on disk and has size > 0
    rel_path = data["audioUrl"].lstrip("/")
    abs_path = os.path.join("/app/applet/public", rel_path)
    assert os.path.exists(abs_path), f"Audio file not found on disk: {abs_path}"
    file_size = os.path.getsize(abs_path)
    assert file_size > 0, f"Audio file size is 0 bytes: {abs_path}"
    log(f"Dialogue audio generated: {data['audioUrl']} ({file_size} bytes, {data['duration']}s)")

def test_motion_plate_generation():
    log("Testing 1080p motion plate generator (/api/generate/motion-plate)...")
    payload = {
        "clipId": "clip_test_01",
        "duration": 3.0,
        "sceneHeading": "EXT. TITAN RESEARCH COLONY - DUSK",
        "shotType": "WIDE ESTABLISHING",
        "cameraMovement": "SLOW DOLLY FORWARD",
        "prompt": "Vast methane lakes reflecting twin moons of Saturn, high-tech geothermal research modules."
    }
    data = request_json("/api/generate/motion-plate", payload)
    assert data.get("videoUrl"), f"No videoUrl in response: {data}"
    
    rel_path = data["videoUrl"].lstrip("/")
    abs_path = os.path.join("/app/applet/public", rel_path)
    assert os.path.exists(abs_path), f"Plate file not found on disk: {abs_path}"
    file_size = os.path.getsize(abs_path)
    assert file_size > 1000, f"Plate file unexpectedly small: {file_size} bytes"
    
    # ffprobe verification
    probe = subprocess.check_output([
        "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", abs_path
    ]).decode("utf-8")
    probe_data = json.loads(probe)
    v_stream = next(s for s in probe_data["streams"] if s["codec_type"] == "video")
    assert v_stream["codec_name"] == "h264", f"Expected h264, got {v_stream['codec_name']}"
    assert int(v_stream["width"]) == 1920, f"Expected 1920, got {v_stream['width']}"
    assert int(v_stream["height"]) == 1080, f"Expected 1080, got {v_stream['height']}"
    log(f"Motion plate verified: 1920x1080 H.264 MP4 ({file_size} bytes)")
    return data["videoUrl"]

def test_full_mp4_render_pipeline(plate_url):
    log("Testing master MP4 rendering engine (/api/render/mp4)...")
    
    # Build complete test film project
    project = {
        "id": "proj_prod_test_001",
        "title": "Titan Convergence",
        "actualAssembledDuration": 6.0,
        "fps": 24,
        "clips": [
            {
                "clipId": "clip_01",
                "sceneId": "sc_01",
                "shotId": "sh_01",
                "duration": 3.0,
                "timelineStart": 0.0,
                "videoUrl": plate_url,
                "prompt": "Establishing shot of Titan outpost at twilight",
                "provider": "veo2"
            },
            {
                "clipId": "clip_02",
                "sceneId": "sc_01",
                "shotId": "sh_02",
                "duration": 3.0,
                "timelineStart": 3.0,
                "videoUrl": None, # Will be rendered via procedural title plate
                "prompt": "Close-up of holographic sensor console flashing amber",
                "provider": "veo2"
            }
        ],
        "dialogueTracks": [
            {
                "id": "dlg_test_01",
                "character": "Commander Marcus",
                "text": "All stations check in. Signal detected on sub-surface frequency.",
                "startTime": 0.5,
                "duration": 2.2,
                "volume": 90
            }
        ],
        "musicTracks": [
            {
                "id": "mus_test_01",
                "title": "Subsurface Tension",
                "mood": "Atmospheric Drone",
                "bpm": 80,
                "startTime": 0,
                "duration": 6.0,
                "volume": 70,
                "audioUrl": "/assets/audio/music/ambient_drone.mp3"
            }
        ],
        "scenes": [
            {"sceneId": "sc_01", "heading": "EXT. TITAN RESEARCH COLONY - DUSK"}
        ],
        "shots": [
            {"shotId": "sh_01", "shotType": "WIDE ESTABLISHING", "cameraMovement": "DOLLY IN"},
            {"shotId": "sh_02", "shotType": "MEDIUM CLOSE-UP", "cameraMovement": "STATIC"}
        ]
    }
    
    settings = {
        "resolution": "1080p",
        "aspectRatio": "16:9",
        "fps": 24,
        "codec": "H.264",
        "burnSubtitles": True,
        "colorGradeLUT": "Cinematic Teal & Orange",
        "audioMix": {
            "dialogueLevel": 90,
            "musicLevel": 65,
            "sfxLevel": 80,
            "masterGain": 100
        }
    }
    
    render_res = request_json("/api/render/mp4", {"project": project, "settings": settings})
    job_id = render_res.get("jobId")
    assert job_id, f"No jobId returned: {render_res}"
    log(f"Render job started: {job_id}")
    
    # Poll job until completed
    max_wait = 60
    start_time = time.time()
    final_job = None
    
    while time.time() - start_time < max_wait:
        jobs = request_json("/api/jobs")
        current = next((j for j in jobs if j.get("jobId") == job_id), None)
        if current:
            status = current.get("status")
            progress = current.get("progress", 0)
            log(f"Job {job_id}: status={status}, progress={progress}%")
            if status == "completed":
                final_job = current
                break
            elif status == "failed":
                raise AssertionError(f"Render job failed: {current.get('error')}")
        time.sleep(2)
        
    assert final_job, "Render job timed out"
    video_url = final_job.get("videoUrl")
    assert video_url, "No videoUrl in completed job"
    
    mp4_path = os.path.join("/app/applet/public", video_url.lstrip("/"))
    assert os.path.exists(mp4_path), f"Rendered MP4 not found on disk: {mp4_path}"
    file_size = os.path.getsize(mp4_path)
    assert file_size > 50000, f"Rendered MP4 unexpectedly small: {file_size} bytes"
    
    # Direct download endpoint test
    download_url = final_job.get("downloadUrl")
    log(f"Testing download endpoint: {download_url}...")
    req = urllib.request.Request(f"{BASE_URL}{download_url}")
    with urllib.request.urlopen(req) as d_res:
        content_type = d_res.headers.get("Content-Type")
        content_disp = d_res.headers.get("Content-Disposition")
        downloaded_bytes = len(d_res.read())
        assert downloaded_bytes == file_size, f"Size mismatch: {downloaded_bytes} vs {file_size}"
        log(f"Download verified: {downloaded_bytes} bytes, Content-Type: {content_type}, Disposition: {content_disp}")
        
    # Deep ffprobe verification
    probe = subprocess.check_output([
        "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", mp4_path
    ]).decode("utf-8")
    probe_data = json.loads(probe)
    
    streams = probe_data.get("streams", [])
    v_stream = next((s for s in streams if s["codec_type"] == "video"), None)
    a_stream = next((s for s in streams if s["codec_type"] == "audio"), None)
    
    assert v_stream is not None, "No video stream in rendered MP4"
    assert a_stream is not None, "No audio stream in rendered MP4"
    
    assert v_stream["codec_name"] == "h264", f"Video codec is not H.264: {v_stream['codec_name']}"
    assert int(v_stream["width"]) == 1920, f"Width is not 1920: {v_stream['width']}"
    assert int(v_stream["height"]) == 1080, f"Height is not 1080: {v_stream['height']}"
    
    assert a_stream["codec_name"] == "aac", f"Audio codec is not AAC: {a_stream['codec_name']}"
    assert int(a_stream["channels"]) == 2, f"Audio is not stereo: {a_stream['channels']}"
    
    duration = float(probe_data["format"]["duration"])
    assert duration >= 5.5, f"Rendered duration unexpectedly short: {duration}s"
    
    log(f"PASS: Real MP4 Film successfully rendered and verified!")
    log(f"  - File: {mp4_path}")
    log(f"  - Size: {file_size:,} bytes")
    log(f"  - Duration: {duration:.2f} seconds")
    log(f"  - Video: H.264 {v_stream['width']}x{v_stream['height']} @ 24fps")
    log(f"  - Audio: AAC Stereo ({a_stream.get('sample_rate', 44100)} Hz)")

if __name__ == "__main__":
    try:
        test_health()
        test_dialogue_synthesis()
        plate_url = test_motion_plate_generation()
        test_full_mp4_render_pipeline(plate_url)
        print("\n=== ALL PRODUCTION VERIFICATION TESTS PASSED ===")
    except Exception as e:
        print(f"\n[FAIL] Test failure: {e}", file=sys.stderr)
        sys.exit(1)
