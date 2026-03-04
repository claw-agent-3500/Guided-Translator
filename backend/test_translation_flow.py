"""
Test Script: Core Translation Flow
===================================
Tests the complete translation pipeline:
1. Upload PDF → MinerU parsing
2. Parsed chunks display
3. Start translation → SSE streaming
4. Translation completion
5. Resume after interruption

Usage:
    python test_translation_flow.py
    
    # Or with options:
    python test_translation_flow.py --pdf path/to/test.pdf
    python test_translation_flow.py --markdown path/to/test.md
    python test_translation_flow.py --skip-parse  # Use sample chunks directly
"""

import asyncio
import httpx
import json
import argparse
from pathlib import Path
from typing import Optional
import sys

# Configuration
BASE_URL = "http://localhost:8001"
API_BASE = f"{BASE_URL}/api"

# Terminal colors (ASCII-compatible for Windows)
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def log_success(msg: str):
    print(f"{Colors.GREEN}[OK]{Colors.RESET} {msg}")

def log_error(msg: str):
    print(f"{Colors.RED}[FAIL]{Colors.RESET} {msg}")

def log_info(msg: str):
    print(f"{Colors.BLUE}[INFO]{Colors.RESET} {msg}")

def log_step(step: int, msg: str):
    print(f"\n{Colors.BOLD}{Colors.CYAN}[Step {step}]{Colors.RESET} {msg}")

def log_sse(event: dict):
    event_type = event.get('event', 'unknown')
    color = Colors.GREEN if event_type == 'chunk_complete' else Colors.YELLOW
    print(f"  {color}-->{Colors.RESET} SSE: {event_type} | chunk: {event.get('chunk_id', 'N/A')} | {event.get('current', 0)}/{event.get('total', 0)}")


# ============ Test 1: Health Check ============
async def test_health_check(client: httpx.AsyncClient) -> bool:
    """Test if the backend is running."""
    try:
        resp = await client.get(f"{BASE_URL}/health")
        if resp.status_code == 200:
            log_success("Backend is healthy")
            return True
        else:
            log_error(f"Health check failed: {resp.status_code}")
            return False
    except Exception as e:
        log_error(f"Cannot connect to backend: {e}")
        return False


# ============ Test 2: API Keys Check ============
async def test_api_keys(client: httpx.AsyncClient) -> dict:
    """Check if API keys are configured."""
    try:
        resp = await client.get(f"{API_BASE}/keys/status")
        status = resp.json()
        
        if status.get('gemini_configured'):
            log_success(f"Gemini configured ({status.get('gemini_key_count', 0)} keys)")
        else:
            log_error("Gemini NOT configured - translation will fail!")
            
        if status.get('mineru_configured'):
            log_success("MinerU configured")
        else:
            log_info("MinerU NOT configured - PDF parsing may not work")
            
        return status
    except Exception as e:
        log_error(f"Failed to check API keys: {e}")
        return {}


# ============ Test 3: Upload & Parse PDF ============
async def test_parse_pdf(client: httpx.AsyncClient, pdf_path: str) -> Optional[dict]:
    """Upload and parse a PDF file via MinerU."""
    try:
        path = Path(pdf_path)
        if not path.exists():
            log_error(f"PDF file not found: {pdf_path}")
            return None
            
        with open(path, 'rb') as f:
            files = {'file': (path.name, f, 'application/pdf')}
            data = {'use_mineru': 'true'}
            
            log_info(f"Uploading {path.name} ({path.stat().st_size / 1024:.1f} KB)...")
            resp = await client.post(
                f"{API_BASE}/parse/pdf",
                files=files,
                data=data,
                timeout=120.0  # MinerU can be slow
            )
            
        if resp.status_code == 200:
            result = resp.json()
            if result.get('success'):
                doc = result.get('document', {})
                log_success(f"PDF parsed successfully!")
                log_info(f"  Pages: {doc.get('pages', 'N/A')}")
                log_info(f"  Words: {doc.get('word_count', 'N/A')}")
                log_info(f"  Language: {doc.get('language', 'N/A')}")
                log_info(f"  Text preview: {doc.get('text', '')[:200]}...")
                return doc
            else:
                log_error(f"Parse failed: {result.get('error', 'Unknown error')}")
                return None
        else:
            log_error(f"Parse request failed: {resp.status_code} - {resp.text}")
            return None
            
    except Exception as e:
        log_error(f"PDF parsing error: {e}")
        return None


# ============ Test 4: Parse Markdown ============
async def test_parse_markdown(client: httpx.AsyncClient, md_path: str) -> Optional[dict]:
    """Parse a Markdown file."""
    try:
        path = Path(md_path)
        if not path.exists():
            log_error(f"Markdown file not found: {md_path}")
            return None
            
        with open(path, 'rb') as f:
            files = {'file': (path.name, f, 'text/markdown')}
            
            log_info(f"Uploading {path.name}...")
            resp = await client.post(
                f"{API_BASE}/parse/markdown",
                files=files,
                timeout=30.0
            )
            
        if resp.status_code == 200:
            result = resp.json()
            if result.get('success'):
                doc = result.get('document', {})
                log_success(f"Markdown parsed successfully!")
                log_info(f"  Words: {doc.get('word_count', 'N/A')}")
                log_info(f"  Language: {doc.get('language', 'N/A')}")
                return doc
            else:
                log_error(f"Parse failed: {result.get('error')}")
                return None
        else:
            log_error(f"Parse request failed: {resp.status_code}")
            return None
            
    except Exception as e:
        log_error(f"Markdown parsing error: {e}")
        return None


# ============ Test 5: Create Test Chunks ============
def create_sample_chunks() -> list:
    """Create sample chunks for testing."""
    return [
        {"id": "chunk_1", "content": "# Introduction\n\nThis document describes the technical requirements for the safety system.", "index": 0},
        {"id": "chunk_2", "content": "## Safety Requirements\n\nAll equipment must comply with international standards.", "index": 1},
        {"id": "chunk_3", "content": "The maximum operating temperature shall not exceed 85°C under normal conditions.", "index": 2},
        {"id": "chunk_4", "content": "Warning: Failure to follow these guidelines may result in equipment damage or personal injury.", "index": 3},
    ]

def text_to_chunks(text: str, chunk_size: int = 500) -> list:
    """Split parsed text into chunks."""
    chunks = []
    paragraphs = text.split('\n\n')
    
    current_chunk = ""
    chunk_idx = 0
    
    for para in paragraphs:
        if len(current_chunk) + len(para) > chunk_size and current_chunk:
            chunks.append({
                "id": f"chunk_{chunk_idx}",
                "content": current_chunk.strip(),
                "index": chunk_idx
            })
            chunk_idx += 1
            current_chunk = para
        else:
            current_chunk += "\n\n" + para if current_chunk else para
    
    if current_chunk.strip():
        chunks.append({
            "id": f"chunk_{chunk_idx}",
            "content": current_chunk.strip(),
            "index": chunk_idx
        })
    
    return chunks


# ============ Test 6: SSE Streaming Translation ============
async def test_sse_translation(client: httpx.AsyncClient, chunks: list, interrupt_at: Optional[int] = None) -> tuple[list, int]:
    """
    Test SSE streaming translation.
    
    Args:
        client: HTTP client
        chunks: List of chunks to translate
        interrupt_at: If set, simulate interruption at this chunk number
        
    Returns:
        Tuple of (translated_chunks, last_completed_index)
    """
    translated = []
    last_completed = 0
    
    try:
        payload = {
            "chunks": chunks,
            "glossary": []  # Optional: add test glossary terms
        }
        
        async with client.stream(
            'POST',
            f"{API_BASE}/translate/batch",
            json=payload,
            timeout=120.0
        ) as resp:
            if resp.status_code != 200:
                log_error(f"Translation request failed: {resp.status_code}")
                return translated, last_completed
                
            log_success("SSE stream connected")
            
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                    
                # Parse SSE format
                if line.startswith('data:'):
                    data = line[5:].strip()
                    try:
                        event = json.loads(data)
                        log_sse(event)
                        
                        if event.get('event') == 'chunk_complete':
                            chunk = event.get('translated_chunk')
                            if chunk:
                                translated.append(chunk)
                                last_completed = event.get('current', last_completed)
                                
                                # Simulate interruption
                                if interrupt_at and last_completed >= interrupt_at:
                                    log_info(f"Simulating interruption at chunk {last_completed}...")
                                    raise InterruptedError("User interrupted")
                                    
                        elif event.get('event') == 'done':
                            log_success(f"Translation complete! {len(translated)} chunks translated")
                            
                        elif event.get('event') == 'error':
                            log_error(f"Translation error: {event.get('error_message')}")
                            
                    except json.JSONDecodeError:
                        pass  # Skip non-JSON lines
                        
    except InterruptedError:
        log_info(f"Interrupted at chunk {last_completed}. Can resume from here.")
    except Exception as e:
        log_error(f"SSE translation error: {e}")
        
    return translated, last_completed


# ============ Test 7: Resume Translation ============
async def test_resume_translation(client: httpx.AsyncClient, all_chunks: list, completed_chunks: list, start_from: int) -> list:
    """
    Resume translation from where it was interrupted.
    
    Args:
        all_chunks: All chunks that need translation
        completed_chunks: Already translated chunks
        start_from: Index to resume from
        
    Returns:
        Combined list of all translated chunks
    """
    remaining_chunks = [c for c in all_chunks if c['index'] >= start_from]
    
    if not remaining_chunks:
        log_info("No remaining chunks to translate")
        return completed_chunks
        
    log_info(f"Resuming translation from chunk {start_from} ({len(remaining_chunks)} remaining)...")
    
    new_translated, _ = await test_sse_translation(client, remaining_chunks)
    
    # Combine results
    all_translated = completed_chunks + new_translated
    log_success(f"Resume complete! Total: {len(all_translated)} chunks")
    
    return all_translated


# ============ Test 8: Display Results ============
def display_translation_results(translated_chunks: list):
    """Display translation results."""
    print(f"\n{Colors.BOLD}{'='*60}{Colors.RESET}")
    print(f"{Colors.BOLD}Translation Results{Colors.RESET}")
    print(f"{'='*60}\n")
    
    for chunk in translated_chunks:
        print(f"{Colors.CYAN}[{chunk.get('id', 'unknown')}]{Colors.RESET}")
        print(f"{Colors.YELLOW}Original:{Colors.RESET}")
        print(f"  {chunk.get('original', 'N/A')[:150]}...")
        print(f"{Colors.GREEN}Translated:{Colors.RESET}")
        print(f"  {chunk.get('translated', 'N/A')[:150]}...")
        print()


# ============ Main Test Runner ============
async def run_tests(args):
    """Run all tests."""
    print(f"\n{Colors.BOLD}{'='*60}{Colors.RESET}")
    print(f"{Colors.BOLD}Core Translation Flow Test Suite{Colors.RESET}")
    print(f"{'='*60}\n")
    
    async with httpx.AsyncClient() as client:
        # Step 1: Health Check
        log_step(1, "Health Check")
        if not await test_health_check(client):
            log_error("Backend not running. Start with: uvicorn main:app --reload")
            return False
            
        # Step 2: API Keys
        log_step(2, "API Keys Check")
        key_status = await test_api_keys(client)
        if not key_status.get('gemini_configured'):
            log_error("Gemini API key required for translation!")
            log_info("Set keys via POST /api/keys or environment variables")
            if not args.skip_translation:
                return False
        
        # Step 3: Parse Document
        log_step(3, "Document Parsing")
        chunks = None
        
        if args.skip_parse:
            log_info("Using sample chunks (--skip-parse)")
            chunks = create_sample_chunks()
        elif args.pdf:
            doc = await test_parse_pdf(client, args.pdf)
            if doc:
                chunks = text_to_chunks(doc.get('text', ''))
        elif args.markdown:
            doc = await test_parse_markdown(client, args.markdown)
            if doc:
                chunks = text_to_chunks(doc.get('text', ''))
        else:
            # Try to find a test file
            test_files = [
                Path("test_output.md"),
                Path("../sample.md"),
                Path("test.md")
            ]
            for tf in test_files:
                if tf.exists():
                    doc = await test_parse_markdown(client, str(tf))
                    if doc:
                        chunks = text_to_chunks(doc.get('text', ''))
                    break
            else:
                log_info("No test file found, using sample chunks")
                chunks = create_sample_chunks()
        
        if chunks:
            log_success(f"Created {len(chunks)} chunks for translation")
            
        # Step 4: Chunks Display
        log_step(4, "Chunks Display")
        for i, chunk in enumerate(chunks[:3]):  # Show first 3
            print(f"  {Colors.CYAN}Chunk {i}:{Colors.RESET} {chunk['content'][:80]}...")
        if len(chunks) > 3:
            print(f"  ... and {len(chunks)-3} more chunks")
        log_success("Chunks ready for translation")
        
        if args.skip_translation:
            log_info("Skipping translation (--skip-translation)")
            return True
        
        # Step 5: SSE Streaming Translation
        log_step(5, "SSE Streaming Translation")
        
        if args.test_interrupt:
            # Test interruption and resume
            interrupt_at = min(2, len(chunks))
            log_info(f"Testing interruption at chunk {interrupt_at}...")
            translated, last_idx = await test_sse_translation(client, chunks, interrupt_at=interrupt_at)
            
            # Step 6: Resume After Interruption
            log_step(6, "Resume After Interruption")
            all_translated = await test_resume_translation(client, chunks, translated, last_idx)
        else:
            # Normal full translation
            translated, _ = await test_sse_translation(client, chunks)
            all_translated = translated
            
        # Step 7: Translation Completion
        log_step(7, "Translation Completion")
        if all_translated:
            log_success(f"Completed translation of {len(all_translated)} chunks")
            display_translation_results(all_translated[:3])  # Show first 3
        else:
            log_error("No chunks were translated")
            return False
            
        print(f"\n{Colors.BOLD}{Colors.GREEN}All tests passed!{Colors.RESET}\n")
        return True


def main():
    parser = argparse.ArgumentParser(description='Test Core Translation Flow')
    parser.add_argument('--pdf', help='Path to PDF file to test')
    parser.add_argument('--markdown', help='Path to Markdown file to test')
    parser.add_argument('--skip-parse', action='store_true', help='Skip parsing, use sample chunks')
    parser.add_argument('--skip-translation', action='store_true', help='Skip translation step')
    parser.add_argument('--test-interrupt', action='store_true', help='Test interruption and resume')
    
    args = parser.parse_args()
    
    try:
        success = asyncio.run(run_tests(args))
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Test interrupted by user{Colors.RESET}")
        sys.exit(130)


if __name__ == "__main__":
    main()
