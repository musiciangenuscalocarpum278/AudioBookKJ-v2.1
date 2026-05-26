# Agy CLI Best Practices & Gotchas

## 1. Bản chất của Agy CLI
- **Agy không phải là một CLI script tĩnh thông thường**, mà là một **A.I Agent (Antigravity Agent)** có khả năng nhận biết môi trường, quét workspace và sở hữu các Tools (công cụ) riêng để thực hiện hành động.
- Vì mang bản chất Agent, đôi khi Agy sẽ tự quyết định luồng in dữ liệu (bỏ qua `stdout` pipe, in có màu ANSI, hoặc format theo ý nó) nếu nó phát hiện không phải là một Terminal thật sự.

## 2. Lỗi mất/hỏng output JSON khi giao tiếp với Python (FastAPI)
**Vấn đề:** 
Khi dùng `subprocess.Popen` trong Python để gọi lệnh `agy --print` nhằm lấy kết quả JSON, luồng `stdout` thường bị trống hoặc bị dính các ký tự mã màu ANSI (`\x1b[32m...`), làm cho lệnh `json.loads` trong Python bị crash (Lỗi: `Không thể tìm thấy JSON kịch bản hợp lệ trong đầu ra CLI`).

**Cách giải quyết triệt để:**
Không dùng Pipe mặc định của OS để hứng output trực tiếp, mà tận dụng khả năng dùng Tool của Agy Agent.
Thay vì đợi Agy in ra màn hình, hãy **chèn một CRITICAL INSTRUCTION vào cuối Prompt**, ép Agy dùng công cụ `write_to_file` của nó để xuất thẳng kết quả ra một file tĩnh.

**Ví dụ cấu trúc Prompt an toàn:**
```python
temp_out = "absolute_path_to_temp_file.json"

prompt_with_instruction = full_prompt + f"\n\nCRITICAL INSTRUCTION: You MUST use your write_to_file tool to save the EXACT final JSON output to this absolute file path: {temp_out}. Do NOT output the JSON in your conversational response."

cmd = [agy_exe, '--print', prompt_with_instruction, '--dangerously-skip-permissions']
# Lưu ý cờ `--dangerously-skip-permissions` phải nằm cuối cùng để tự động duyệt cho Agy chạy Tool ghi file.
```

## 3. Lưu ý về Workspace
Agy có khả năng tự động scan thư mục hiện hành (cwd) làm workspace. Nếu `cwd` chứa các thư mục khổng lồ như `node_modules` hay `venv`, Agy sẽ quét toàn bộ và gây ra tình trạng "treo lệnh" (timeout) hàng chục phút.
**Cách giải quyết:** Khi gọi `subprocess.Popen` để chạy `agy`, luôn trỏ tham số `cwd` vào một thư mục rỗng (ví dụ: `agy_tmp/`) để ép Agy xử lý siêu tốc.
