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

def chunk_text(text, max_chars=1500):
    """Chia văn bản thành các đoạn (chunk) nhỏ dựa trên dấu xuống dòng đôi.
    Nếu đoạn văn nào quá dài (vượt quá max_chars), tự động tách nhỏ theo dấu câu."""
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    final_paragraphs = []
    
    for p in paragraphs:
        if len(p) <= max_chars:
            final_paragraphs.append(p)
        else:
            # Tách đoạn văn quá dài thành các câu nhỏ dựa trên dấu chấm, hỏi, cảm thán
            sentences = re.split(r'(?<=[.!?])\s+', p)
            current_paragraph = ""
            for s in sentences:
                s = s.strip()
                if not s:
                    continue
                if len(current_paragraph) + len(s) + 1 <= max_chars:
                    if current_paragraph:
                        current_paragraph += " " + s
                    else:
                        current_paragraph = s
                else:
                    if current_paragraph:
                        final_paragraphs.append(current_paragraph)
                    current_paragraph = s
            if current_paragraph:
                final_paragraphs.append(current_paragraph)
                
    return final_paragraphs


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
