"""
Gemini API Service - Translation with glossary support and robust rate limiting.
"""

import google.generativeai as genai
import asyncio
import random
import time
from typing import Optional
from models.requests import GlossaryEntry, Chunk
from models.responses import TranslatedChunk, TermMatch
from routers.keys import get_current_gemini_key, rotate_gemini_key


def log(msg: str):
    """Debug logger with timestamp."""
    import datetime
    ts = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"[{ts}] [Gemini] {msg}")


def find_relevant_terms(text: str, glossary: list[GlossaryEntry]) -> list[GlossaryEntry]:
    """Find glossary terms that appear in the text."""
    text_lower = text.lower()
    return [
        entry for entry in glossary
        if entry.english.lower() in text_lower
    ]


def get_system_instruction(relevant_terms: list[GlossaryEntry]) -> str:
    """
    Generate system instruction for Gemini.
    Uses system_instruction parameter to prevent prompt leakage.
    """
    glossary_section = ""
    if relevant_terms:
        terms_list = "\n".join([f"  - {t.english} → {t.chinese}" for t in relevant_terms])
        glossary_section = f"""

MANDATORY TERMINOLOGY (use these exact translations):
{terms_list}"""
    
    return f"""You are a technical translator (English → Simplified Chinese).

CRITICAL: PRESERVE MARKDOWN STRUCTURE EXACTLY
The input is Markdown. Your output MUST have IDENTICAL structure:
- Same number of lines
- Same markdown syntax in same positions
- Only translate the text content, not the formatting

STRUCTURE PRESERVATION RULES:
1. Headings: Keep # symbols in same positions
   Input:  # Introduction
   Output: # 引言

2. Tables: Keep | separators and structure exactly
   Input:  | Name | Value |
   Output: | 名称 | 值 |

3. Lists: Keep - or * or 1. in same positions
   Input:  - First item
   Output: - 第一项

4. Code blocks: Do NOT translate content inside ```code blocks```

5. Links: Translate display text only, keep URL unchanged
   Input:  [Click here](http://example.com)
   Output: [点击这里](http://example.com)

6. Formatting: Keep **bold**, *italic*, `code` markers around translated text

7. Line breaks: Preserve all blank lines and line breaks exactly

DO NOT:
- Add or remove lines
- Add explanations or notes
- Change markdown syntax
- Translate code, URLs, paths, or standard numbers (EN 13001, ISO 9001)

OUTPUT: Only the translated text with identical structure. No commentary.
{glossary_section}"""


def generate_user_prompt(text: str) -> str:
    """Generate user prompt with just the text to translate."""
    return f"""Translate to Chinese:

{text}"""


def clean_response(text: str) -> str:
    """Clean LLM response and detect prompt leakage."""
    # Remove markdown code blocks
    if text.startswith("```"):
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)
    
    # Detect prompt leakage
    leakage_markers = [
        "# Technical Document",
        "CRITICAL:",
        "ABSOLUTE RULES",
        "## What to Translate",
        "Translate to Chinese:",
        "OUTPUT RULES:"
    ]
    
    for marker in leakage_markers:
        if marker in text:
            log(f"WARNING: Prompt leakage detected: {marker}")
            # Try to extract actual translation after the marker
            if "\n\n" in text:
                parts = text.split("\n\n")
                # Take the last substantial part
                for part in reversed(parts):
                    if len(part.strip()) > 5 and not any(m in part for m in leakage_markers):
                        text = part
                        break
            break
    
    return text.strip()


def identify_terms_in_text(
    text: str,
    glossary: list[GlossaryEntry]
) -> list[TermMatch]:
    """Find and locate glossary terms in translated text."""
    matches = []
    
    for entry in glossary:
        chinese_term = entry.chinese
        start = 0
        while True:
            idx = text.find(chinese_term, start)
            if idx == -1:
                break
            matches.append(TermMatch(
                term=entry.english,
                translation=entry.chinese,
                start_index=idx,
                end_index=idx + len(chinese_term)
            ))
            start = idx + 1
    
    return matches


def calculate_backoff(attempt: int, base_delay: float = 1.0, max_delay: float = 60.0) -> float:
    """
    Calculate exponential backoff delay with jitter.
    
    Formula: min(max_delay, base_delay * 2^attempt) + random_jitter
    
    Examples:
    - Attempt 0: ~1s
    - Attempt 1: ~2s
    - Attempt 2: ~4s
    - Attempt 3: ~8s
    - Attempt 4: ~16s
    """
    delay = min(max_delay, base_delay * (2 ** attempt))
    # Add jitter (±25% randomness) to prevent thundering herd
    jitter = delay * 0.25 * (random.random() * 2 - 1)
    return delay + jitter


async def translate_chunk(
    chunk: Chunk,
    glossary: list[GlossaryEntry],
    on_status: Optional[callable] = None,
    max_retries: int = 5
) -> TranslatedChunk:
    """
    Translate a single chunk with glossary constraints.
    
    Features:
    - Exponential backoff on rate limits (1s → 2s → 4s → 8s → 16s)
    - API key rotation on 429 errors
    - Detailed error logging
    """
    api_key = get_current_gemini_key()
    
    if not api_key:
        raise Exception("No Gemini API key configured")
    
    # Find relevant terms for this chunk
    relevant_terms = find_relevant_terms(chunk.content, glossary)
    
    # Generate system instruction and user prompt separately
    system_instruction = get_system_instruction(relevant_terms)
    user_prompt = generate_user_prompt(chunk.content)
    
    last_error = None
    
    for attempt in range(max_retries):
        try:
            genai.configure(api_key=api_key)
            
            # Create model with system instruction to prevent prompt leakage
            model = genai.GenerativeModel(
                "gemini-2.0-flash",
                system_instruction=system_instruction
            )
            
            if on_status:
                on_status(f"Translating chunk {chunk.id}...")
            
            log(f"Attempt {attempt + 1}/{max_retries} for chunk {chunk.id}")
            
            response = model.generate_content(
                user_prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.3,
                    max_output_tokens=4096
                )
            )
            
            translated_text = clean_response(response.text)
            
            # Find terms used in translation
            terms_used = identify_terms_in_text(translated_text, relevant_terms)
            
            log(f"Chunk {chunk.id} translated successfully ({len(translated_text)} chars)")
            
            return TranslatedChunk(
                id=chunk.id,
                original=chunk.content,
                translated=translated_text,
                terms_used=terms_used,
                tokens_used=None
            )
            
        except Exception as e:
            last_error = e
            error_msg = str(e).lower()
            
            log(f"Error on attempt {attempt + 1}: {e}")
            
            # Check for rate limit error (429)
            is_rate_limit = any(x in error_msg for x in ["429", "rate", "quota", "resource_exhausted"])
            
            if is_rate_limit:
                # Calculate backoff delay
                delay = calculate_backoff(attempt)
                log(f"Rate limited! Backing off for {delay:.1f}s...")
                
                if on_status:
                    on_status(f"Rate limited, waiting {delay:.0f}s...")
                
                # Wait with exponential backoff
                await asyncio.sleep(delay)
                
                # Try rotating to next API key
                if rotate_gemini_key():
                    api_key = get_current_gemini_key()
                    log(f"Rotated to new API key")
                
                continue
            
            # Check for retryable errors
            is_retryable = any(x in error_msg for x in ["timeout", "connection", "unavailable", "500", "502", "503"])
            
            if is_retryable and attempt < max_retries - 1:
                delay = calculate_backoff(attempt, base_delay=0.5)
                log(f"Retryable error, waiting {delay:.1f}s...")
                await asyncio.sleep(delay)
                continue
            
            # Non-retryable error
            log(f"Non-retryable error: {e}")
            break
    
    raise Exception(f"Translation failed after {max_retries} attempts: {last_error}")


async def translate_batch(
    chunks: list[Chunk],
    glossary: list[GlossaryEntry],
    on_progress: Optional[callable] = None
) -> list[TranslatedChunk]:
    """
    Translate multiple chunks sequentially with rate limiting.
    
    Uses conservative pacing to avoid hitting rate limits.
    """
    results = []
    total = len(chunks)
    
    for i, chunk in enumerate(chunks):
        try:
            result = await translate_chunk(chunk, glossary)
            results.append(result)
            
            if on_progress:
                on_progress(i + 1, total, result)
            
            # Small delay between chunks to avoid rate limits
            if i < total - 1:
                await asyncio.sleep(0.5)
                
        except Exception as e:
            log(f"Failed to translate chunk {chunk.id}: {e}")
            # Create failed result
            results.append(TranslatedChunk(
                id=chunk.id,
                original=chunk.content,
                translated=f"[TRANSLATION FAILED: {e}]",
                terms_used=[],
                tokens_used=None
            ))
    
    return results
