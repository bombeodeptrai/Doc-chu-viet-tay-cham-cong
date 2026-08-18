import os
import json
import io
import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

# Cấu hình Gemini API
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY không được tìm thấy trong môi trường.")
genai.configure(api_key=api_key)

app = FastAPI()

# Cấu hình CORS (cho phép frontend nếu chạy khác cổng)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Phục vụ thư mục static (Frontend)
import os as _os
if not _os.path.exists("static"):
    _os.makedirs("static")
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    # Redirect root to static/index.html
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/static/index.html")

def build_prompt(context_dictionary: str) -> str:
    prompt_text = f"""
Bạn là một chuyên gia nhận diện chữ viết tay tiếng Việt. Nhiệm vụ của bạn là trích xuất thông tin Bảng chấm công từ hình ảnh được cung cấp một cách chính xác tuyệt đối, đặc biệt là cột "Ghi chú" chứa các chữ viết tay nguệch ngoạc.

Cấu trúc bảng trong ảnh thường bao gồm các cột: STT, Họ và tên, Ngày công (thường ghi X hoặc 0), Tăng ca Sáng, Tăng ca Trưa, Tăng ca Chiều, Ghi chú.

Vui lòng trả về định dạng mảng JSON (KHÔNG bọc trong block markdown, CHỈ trả về đúng mảng JSON) với các key sau cho mỗi hàng:
- stt (chuỗi hoặc số)
- ho_ten (chuỗi)
- ngay_cong (chuỗi)
- ca_sang (chuỗi, để rỗng nếu không có)
- ca_trua (chuỗi, để rỗng nếu không có)
- ca_chieu (chuỗi, để rỗng nếu không có)
- ghi_chu (chuỗi: ĐỌC THẬT KỸ TỪNG NÉT CHỮ CỦA CỘT NÀY. Ví dụ một số từ thường gặp: "438", "05 Trà Sơn", "05 Trạm", "K2. 552 MC.", "Thợ máy", "Xúc lật")
- uncertain (boolean): Đặt thành true nếu bạn cảm thấy chữ mờ, nét viết tay quá khó đọc và không chắc chắn, ngược lại false.

LƯU Ý QUAN TRỌNG:
Ưu tiên đối chiếu nét chữ khó với danh sách "Từ điển ngữ cảnh" sau đây (đây là các từ khóa/tên/ghi chú đã được người dùng chỉnh sửa và xác nhận ở những lần trước):
[{context_dictionary}]
"""
    return prompt_text

@app.post("/extract")
async def extract_timesheet(
    file: UploadFile = File(...),
    dictionary: str = Form("")
):
    try:
        # Đọc dữ liệu file ảnh
        image_bytes = await file.read()
        image_part = {
            "mime_type": file.content_type,
            "data": image_bytes
        }

        prompt = build_prompt(dictionary)
        
        # Cấu hình Generation
        generation_config = genai.types.GenerationConfig(
            temperature=0,
            response_mime_type="application/json"
        )

        fallback_used = False
        response_text = ""

        # Danh sách mô hình ưu tiên từ cao xuống thấp (Pro Image -> Pro -> Flash Image -> Flash)
        CANDIDATE_MODELS = [
            "gemini-3-pro-image",
            "gemini-3.1-pro-preview",
            "gemini-2.5-pro",
            "gemini-3.1-flash-image",
            "gemini-3.7-flash",
            "gemini-3.5-flash",
            "gemini-2.5-flash"
        ]

        response_text = ""
        used_model = ""
        errors = []

        for model_name in CANDIDATE_MODELS:
            try:
                # print(f"Đang thử mô hình: {model_name}...") # Không in ra để tránh lỗi charmap trên Windows
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(
                    [prompt, image_part],
                    generation_config=generation_config
                )
                response_text = response.text
                used_model = model_name
                break # Thành công thì thoát vòng lặp
            except Exception as e:
                err_msg = f"{model_name} thất bại: {e}"
                errors.append(err_msg)
                with open("error.log", "a", encoding="utf-8") as f:
                    f.write(err_msg + "\n")
                continue

        if not response_text:
            raise HTTPException(status_code=500, detail="Tất cả mô hình đều thất bại. Hãy kiểm tra lại API Key. Chi tiết trong error.log")
        
        fallback_used = (used_model != CANDIDATE_MODELS[0])

        # Parse JSON
        try:
            parsed_data = json.loads(response_text)
        except json.JSONDecodeError:
            # Nếu JSON bị lỗi format, trả về lỗi 
            raise HTTPException(status_code=500, detail="Mô hình không trả về định dạng JSON hợp lệ.")

        return {
            "success": True,
            "fallback_used": fallback_used,
            "data": parsed_data
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/export")
async def export_excel(data: list[dict]):
    try:
        # Chuyển đổi dữ liệu JSON sang Pandas DataFrame
        # Loại bỏ trường 'uncertain' khi xuất file Excel để dữ liệu sạch
        clean_data = []
        for item in data:
            row = {
                "STT": item.get("stt", ""),
                "Họ và tên": item.get("ho_ten", ""),
                "Ngày công": item.get("ngay_cong", ""),
                "Ca sáng": item.get("ca_sang", ""),
                "Ca trưa": item.get("ca_trua", ""),
                "Ca chiều": item.get("ca_chieu", ""),
                "Ghi chú": item.get("ghi_chu", "")
            }
            clean_data.append(row)
            
        df = pd.DataFrame(clean_data)

        # Ghi ra định dạng Excel (trong bộ nhớ)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='BangChamCong')
        
        output.seek(0)

        headers = {
            'Content-Disposition': 'attachment; filename="timesheet.xlsx"'
        }
        return StreamingResponse(output, headers=headers, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi xuất file Excel: {str(e)}")
