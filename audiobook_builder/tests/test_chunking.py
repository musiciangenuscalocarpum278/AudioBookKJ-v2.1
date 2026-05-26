from text_processor import clean_markdown, chunk_text
from script_generation import safe_process_script_chunk
import os
import sys
sys.stdout.reconfigure(encoding='utf-8')

raw = open(r'f:\AntiGravity\AudioBook-KJ\The_Architects_of_the_Living_Loom\chuong_01_phan_01.md', encoding='utf-8').read()
chunks = chunk_text(clean_markdown(raw))
print(f"Total chunks: {len(chunks)}")
for i in range(2):
    print(f"\n--- CHUNK {i} ---")
    print("Original length:", len(chunks[i]))
    print(chunks[i])
    res = safe_process_script_chunk(chunks[i])
    print("\nScript Output:")
    print(res)
