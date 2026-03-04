"""
MinerU API Test Script - Debug Version
Tests both polling endpoints to find the correct one.
"""
import requests
import time
import zipfile
import io

# Configuration
TOKEN = "eyJ0eXBlIjoiSldUIiwiYWxnIjoiSFM1MTIifQ.eyJqdGkiOiIzNTQwMDM1NSIsInJvbCI6IlJPTEVfUkVHSVNURVIiLCJpc3MiOiJPcGVuWExhYiIsImlhdCI6MTc2ODY3NTkyMCwiY2xpZW50SWQiOiJsa3pkeDU3bnZ5MjJqa3BxOXgydyIsInBob25lIjoiIiwib3BlbklkIjpudWxsLCJ1dWlkIjoiZGJiNzkzYjktMmEwMy00NDBkLThmNDMtMmFkN2RmZGMyNDIxIiwiZW1haWwiOiIiLCJleHAiOjE3Njk4ODU1MjB9.vAETM8RutHWfk2B8wqZ-SJ8am9HzNRZU3BACsXBYSyrSi54s8MkhCZEG93Aq6EKKqm8t_rLLMwQUlc_BlzJOtg"
API_BASE = "https://mineru.net/api/v4"
FILE_PATH = r"d:\myproject\Guided-Translator\fixtures\EN 12077-2 2024 - foxit.pdf"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}")

def main():
    print("=" * 60)
    print("MinerU API Test - Debug Version")
    print("=" * 60)
    
    # ===== Step 1: Request Upload URL =====
    print("\n=== Step 1: Request Upload URL ===")
    
    response = requests.post(
        f"{API_BASE}/file-urls/batch",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TOKEN}"
        },
        json={
            "files": [{"name": "test.pdf", "data_id": "test001"}],
            "model_version": "vlm"
        }
    )
    
    log(f"Status: {response.status_code}")
    result = response.json()
    log(f"FULL RESPONSE: {result}")
    
    if result["code"] != 0:
        log(f"API Error: {result.get('msg')}")
        return
    
    batch_id = result["data"]["batch_id"]
    upload_url = result["data"]["file_urls"][0]
    log(f"batch_id: {batch_id}")
    
    # ===== Step 2: Upload File =====
    print("\n=== Step 2: Upload File ===")
    
    with open(FILE_PATH, 'rb') as f:
        log(f"Uploading...")
        start = time.time()
        res_upload = requests.put(upload_url, data=f, timeout=600)
        elapsed = time.time() - start
        
    log(f"Upload status: {res_upload.status_code} (took {elapsed:.1f}s)")
    
    if res_upload.status_code != 200:
        log(f"Upload FAILED")
        return
    
    log("Upload SUCCESS!")
    
    # ===== Step 3: Try Both Polling Endpoints =====
    print("\n=== Step 3: Poll Task Status ===")
    
    # Try endpoint 1: /extract-results/batch/{batch_id}
    print("\n--- Trying: /extract-results/batch/{batch_id} ---")
    url1 = f"{API_BASE}/extract-results/batch/{batch_id}"
    res1 = requests.get(url1, headers={"Authorization": f"Bearer {TOKEN}"})
    log(f"URL: {url1}")
    log(f"Status: {res1.status_code}")
    log(f"Response: {res1.json()}")
    
    # Try endpoint 2: /extract/task/{batch_id}
    print("\n--- Trying: /extract/task/{batch_id} ---")
    url2 = f"{API_BASE}/extract/task/{batch_id}"
    res2 = requests.get(url2, headers={"Authorization": f"Bearer {TOKEN}"})
    log(f"URL: {url2}")
    log(f"Status: {res2.status_code}")
    log(f"Response: {res2.json()}")
    
    # Try endpoint 3: /file-urls/batch/{batch_id}/status (guess)
    print("\n--- Trying: /file-urls/batch/{batch_id}/status ---")
    url3 = f"{API_BASE}/file-urls/batch/{batch_id}/status"
    res3 = requests.get(url3, headers={"Authorization": f"Bearer {TOKEN}"})
    log(f"URL: {url3}")
    log(f"Status: {res3.status_code}")
    try:
        log(f"Response: {res3.json()}")
    except:
        log(f"Response: {res3.text[:200]}")
    
    # Now poll the working endpoint
    print("\n=== Polling with /extract-results/batch/ ===")
    max_wait = 300
    elapsed = 0
    poll_interval = 10
    
    while elapsed < max_wait:
        res = requests.get(
            f"{API_BASE}/extract-results/batch/{batch_id}",
            headers={"Authorization": f"Bearer {TOKEN}"}
        )
        
        result = res.json()
        log(f"Response: {result}")
        
        if result.get("code") == 0:
            data = result.get("data", {})
            extract_result = data.get("extract_result", [])
            
            if extract_result:
                log(f"GOT RESULTS!")
                log(f"extract_result keys: {extract_result[0].keys() if extract_result else 'empty'}")
                
                # Try to get markdown
                first = extract_result[0]
                zip_url = first.get("full_zip_url")
                md_url = first.get("full_md_url") or first.get("markdown_url")
                
                log(f"full_zip_url: {zip_url}")
                log(f"full_md_url: {md_url}")
                
                if zip_url:
                    # Download ZIP
                    log("Downloading ZIP...")
                    zip_res = requests.get(zip_url, timeout=120)
                    with zipfile.ZipFile(io.BytesIO(zip_res.content)) as zf:
                        log(f"ZIP contents: {zf.namelist()}")
                        md_files = [f for f in zf.namelist() if f.endswith('.md')]
                        if md_files:
                            content = zf.read(md_files[0]).decode('utf-8')
                            log(f"Markdown ({len(content)} chars):")
                            print(content[:1000])
                
                break
        
        time.sleep(poll_interval)
        elapsed += poll_interval
        log(f"Waiting... ({elapsed}s)")

if __name__ == "__main__":
    main()
    input("\nPress Enter to exit...")
