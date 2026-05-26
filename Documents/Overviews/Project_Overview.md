# 📖 AudioBook-KJ V2 - Master Overview

**Tài liệu này là "Kim chỉ nam" (Master Document) dành cho bất kỳ ai (User, AI Agents, Developers) tiếp quản dự án này. Hãy đọc kỹ tài liệu này trước khi bắt đầu code hoặc sửa lỗi.**

---

## 1. Tóm tắt Dự án (Project Summary)
**AudioBook-KJ V2** là một ứng dụng Web App "Human-in-the-Loop" dùng để tự động hóa quá trình sản xuất Sách nói (Audiobooks) và Video truyện (Visual Novels / Story Videos). 
Ứng dụng cho phép người dùng nạp một kịch bản chữ (Markdown), tự động phân vai, lồng tiếng ảo (Synthetic Voice), tạo hình ảnh/video bằng AI, xếp chúng lên Timeline và xuất bản thành video hoàn chỉnh.

---

## 2. Kiến trúc Hệ thống (Architecture)
Dự án được xây dựng theo mô hình **Monorepo** với Frontend và Backend tách biệt nhưng chạy song song:

### 🖥️ Frontend (Thư mục: `frontend/`)
- **Tech Stack:** React, Vite, TypeScript, TailwindCSS, Zustand (State Management), React Flow (cho Video Graph/Storyboard).
- **Trách nhiệm:** Giao diện người dùng Dark Mode trực quan. Quản lý trạng thái dự án (IndexedDB qua `localforage` & Zustand), gọi API xuống Backend. Giao diện chia làm 3 màn hình chính (Tabs):
  - **Audio Studio:** Quản lý kịch bản, chỉnh sửa Text, thiết lập giọng đọc (Voice Casting), Render Audio.
  - **Video Studio:** Quản lý hình ảnh nhân vật (Assets), Sinh kịch bản phân cảnh (AI Director Storyboard), Generate Video (kết nối FlowKit).
  - **Post-Production:** Bàn làm việc Timeline (DAW) cắt ghép, đồng bộ Audio & Video, chỉnh âm lượng và xuất file cuối.

### ⚙️ Backend (Thư mục: `audiobook_builder/`)
- **Tech Stack:** Python, FastAPI, SQLite (`audiobook.db`), FFmpeg, Pydub, OmniVoice (Local Voice Synthesis).
- **Trách nhiệm:** Lưu trữ Database tập trung cho các Project, định tuyến đường dẫn thư mục Media. Giao tiếp với các mô hình AI (Gemini, OmniVoice) để tạo âm thanh và hình ảnh. Ghép nối Video/Audio lúc Export.
- **Lưu trữ Media:** Mỗi Project có một thư mục riêng trong `audiobook_builder/projects/` chứa file `media/` (audio, video, images, exports).

---

## 3. Quy trình làm việc cốt lõi (Core Workflow)

### Bước 1: Quản lý Project (Project Setup)
1. User tạo Project mới qua Menu File -> "New Project".
2. Backend tự động tạo một Workspace riêng rẽ trong thư mục `projects/`. Tất cả DB record (`projects`, `script_lines`, `voice_params`, v.v) đều gắn với `project_id`.

### Bước 2: Xử lý Kịch Bản & Âm Thanh (Audio Studio)
1. **Import Script:** Upload file `.md`. Backend (qua `text_processor.py`) sẽ bóc tách văn bản, gán Speaker cho từng dòng.
2. **Voice Casting:** Trong giao diện Audio, user chọn Nhân vật, cấu hình Giọng (Gender, Age, Pitch). Sau đó bấm "Create Synthetic Voice" để backend tạo và lưu mẫu giọng vào cache (`Voice_ref`).
3. **Render Audio:** User bấm "Render All". Frontend sẽ gửi vòng lặp từng câu thoại xuống Backend (API `/api/render-line`). Backend dùng `audio_gen.generate` để kết xuất file `.wav` lẻ và lưu vào thư mục Project.

### Bước 3: Đạo diễn Hình Ảnh (Video Studio)
1. **Assets Management:** User upload hình ảnh mẫu của nhân vật hoặc sinh bằng AI. Đánh dấu làm "Reference".
2. **AI Director:** Chạy công cụ Đạo diễn AI để phân tích các đoạn hội thoại (Scene) và vẽ ra một sơ đồ khối (Node Graph bằng React Flow).
3. **Generate Video:** Bấm tạo Video cho từng Node. Hệ thống có thể gọi FlowKit Extension để render video `.mp4`. Sau khi hoàn tất, ấn "Sync to Timeline" để đẩy clip sang bước 4.

### Bước 4: Hậu kỳ & Xuất bản (Post-Production)
1. **Timeline Editor:** Giao diện kéo thả tương tự Premiere/CapCut. User có thể di chuyển clip Audio/Video, cắt gọt (trim), chỉnh volume.
2. **Export:** Chọn tỷ lệ khung hình (16:9 hoặc 9:16). Nhấn Export. Backend dùng `ffmpeg` và `pydub` kết hợp các file lẻ lại theo đúng mốc thời gian `startTime` để ra file MP4 cuối cùng cho phép tải xuống.

---

## 4. Cách khởi động Dự án (Quick Start)

Dự án yêu cầu chạy song song 2 Terminal:

**Terminal 1 (Backend - FastAPI):**
```bash
cd audiobook_builder
# Kích hoạt môi trường ảo (Venv)
venv\Scripts\Activate.ps1
# Chạy server
python server.py
# Server sẽ chạy tại http://localhost:8000
```

**Terminal 2 (Frontend - Vite):**
```bash
cd frontend
npm run dev
# Mở trình duyệt tại http://localhost:5173
```

---

## 5. Lưu ý quan trọng cho các Agent/Developer
- **Database (SQLite):** Nằm tại `audiobook_builder/audiobook.db`. Tuyệt đối không xóa file này nếu không muốn mất toàn bộ dữ liệu dự án. Hãy xem logic trong `database.py`.
- **Đồng bộ State:** Frontend dùng Zustand, Backend dùng SQLite. Mỗi khi có thay đổi (Script, Timeline), Frontend dùng cơ chế "Debounced Save" (lưu tự động sau 1.5s) đẩy lên API để Backend cập nhật vào SQLite.
- **Quản lý Đường Dẫn (File Paths):** Luôn dùng hàm `getMediaUrl` trong Frontend để render đường dẫn hình ảnh/âm thanh từ backend. Backend có nhiệm vụ ánh xạ (map) các đường dẫn an toàn vào đúng thư mục `project_root`.

***Chúc bạn phát triển AudioBook-KJ V2 thành công!***
