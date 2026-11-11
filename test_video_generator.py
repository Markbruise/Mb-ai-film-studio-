import http.client
import json
import time

def test_api():
    conn = http.client.HTTPConnection("localhost", 3000)
    payload = json.dumps({
        "clipId": "clip_test_human_1",
        "filmProjectId": "test_proj_online",
        "prompt": "Cinematic close-up portrait of female cybernetic engineer working in neon command center, photorealistic, 8k",
        "duration": 5,
        "aspectRatio": "16:9",
        "provider": "veo3"
    })
    headers = {"Content-Type": "application/json"}
    
    print("Initiating test generation request to /api/generate/video...")
    try:
        conn.request("POST", "/api/generate/video", payload, headers)
        res = conn.getresponse()
        data = json.loads(res.read().decode())
        print(f"Response status: {res.status}, Body: {data}")
        
        job_id = data.get("jobId")
        if not job_id:
            print("Failed to get jobId.")
            return

        print(f"Tracking job {job_id}...")
        for _ in range(15):
            time.sleep(2)
            conn.request("GET", "/api/jobs")
            jobs_res = conn.getresponse()
            jobs = json.loads(jobs_res.read().decode())
            target = next((j for j in jobs if j.get("jobId") == job_id), None)
            if target:
                print(f"Status: {target.get('status')} | Progress: {target.get('progress')}% | Provider: {target.get('provider')}")
                if target.get('status') == 'completed':
                    print("Video generation successfully completed!")
                    print(f"Video URL: {target.get('videoUrl')}")
                    break
    except Exception as e:
        print(f"Connection test note: {e}")

if __name__ == "__main__":
    test_api()
