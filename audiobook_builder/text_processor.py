import os
import re
import json
import subprocess
import time
import sys
sys.stdout.reconfigure(encoding='utf-8')

def clean_markdown(md_text):
    """Làm sạch các thẻ Markdown và Metadata không cần thiết."""
    # Xóa dòng metadata kiểu *(Dựa trên...)*
    text = re.sub(r'\*\(Dựa trên sách gốc.*?\)\*', '', md_text)
    # Loại bỏ in đậm, in nghiêng
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    text = re.sub(r'\*(.*?)\*', r'\1', text)
    # Loại bỏ thẻ tiêu đề #
    text = re.sub(r'#+(.*?)\n', r'\1\n', text)
    # Loại bỏ dải phân cách ngang
    text = re.sub(r'---', r'', text)
    
    # Xóa bớt khoảng trắng thừa
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def chunk_text(text):
    """Chia văn bản thành các đoạn (chunk) nhỏ dựa trên dấu xuống dòng đôi."""
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    # Có thể thêm logic gộp các đoạn quá ngắn hoặc cắt các đoạn quá dài ở đây
    return paragraphs

def parse_gemini_json(ai_text: str) -> list:
    """Bóc tách mảng JSON từ kết quả text của Gemini, sửa lỗi markdown block."""
    if ai_text.startswith('```json'):
        ai_text = ai_text.replace('```json\n', '', 1)
        if ai_text.endswith('```'):
            ai_text = ai_text[:-3].strip()
    elif ai_text.startswith('```'):
        ai_text = ai_text.replace('```\n', '', 1)
        if ai_text.endswith('```'):
            ai_text = ai_text[:-3].strip()
            
    return json.loads(ai_text)
