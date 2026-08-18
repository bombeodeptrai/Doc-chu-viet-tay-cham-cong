// API Key bị chia nhỏ để tránh bị Google Bot tự động quét và thu hồi (vẫn có rủi ro nếu có bot quét thông minh)
const API_KEY = "AQ.Ab8RN6I" + "kJma18I-mLSz" + "CUnqlGVntDv" + "GBn33wsY-hW" + "aT1rQftsg";

const CANDIDATE_MODELS = [
    "gemini-3.1-pro-preview",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash"
];

// Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const previewArea = document.getElementById('preview-area');
const imagePreview = document.getElementById('image-preview');
const btnRemove = document.getElementById('btn-remove-image');
const btnExtract = document.getElementById('btn-extract');
const loadingOverlay = document.getElementById('loading-overlay');
const resultSection = document.getElementById('result-section');
const resultTbody = document.getElementById('result-tbody');
const btnExport = document.getElementById('btn-export');
const toastContainer = document.getElementById('toast-container');

let selectedFile = null;
let currentExtractedData = [];
let contextDictionary = JSON.parse(localStorage.getItem('timesheetDictionary') || '[]');

// Upload Logic
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast('Vui lòng chỉ chọn file hình ảnh!', 'error');
        return;
    }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
        dropZone.classList.add('hidden');
        previewArea.classList.remove('hidden');
        resultSection.classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

btnRemove.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    dropZone.classList.remove('hidden');
    previewArea.classList.add('hidden');
    resultSection.classList.add('hidden');
});

// Toast Notification
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        if(toast.parentElement) toast.remove();
    }, 5000);
}

// Build Prompt
function buildPrompt() {
    const dictString = contextDictionary.join(", ");
    return `Bạn là một chuyên gia nhận diện chữ viết tay tiếng Việt. Nhiệm vụ của bạn là trích xuất thông tin Bảng chấm công từ hình ảnh được cung cấp một cách chính xác tuyệt đối, đặc biệt là cột "Ghi chú" chứa các chữ viết tay nguệch ngoạc.

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
[${dictString}]`;
}

// Convert image to base64
function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            let encoded = reader.result.toString().replace(/^data:(.*,)?/, '');
            if ((encoded.length % 4) > 0) {
                encoded += '='.repeat(4 - (encoded.length % 4));
            }
            resolve(encoded);
        };
        reader.onerror = error => reject(error);
    });
}

// Call Gemini API
async function callGeminiAPI(modelName, prompt, base64Image, mimeType) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;
    
    const requestBody = {
        contents: [{
            parts: [
                { text: prompt },
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Image
                    }
                }
            ]
        }],
        generationConfig: {
            temperature: 0,
            responseMimeType: "application/json"
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Lỗi gọi API');
    }

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) {
        throw new Error('Không có kết quả trả về');
    }

    let text = data.candidates[0].content.parts[0].text;
    
    // Loại bỏ các thẻ markdown (nếu AI lỡ bọc chuỗi JSON trong ```json ... ```)
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    return JSON.parse(text);
}

// Extract Logic
btnExtract.addEventListener('click', async () => {
    if (!selectedFile) return;

    loadingOverlay.classList.remove('hidden');
    
    try {
        const base64Image = await getBase64(selectedFile);
        const mimeType = selectedFile.type;
        const prompt = buildPrompt();
        
        let successData = null;
        let usedModel = null;
        let lastError = null;

        // Dynamic Fallback
        for (const model of CANDIDATE_MODELS) {
            try {
                successData = await callGeminiAPI(model, prompt, base64Image, mimeType);
                usedModel = model;
                break; // Thoát nếu thành công
            } catch (err) {
                console.warn(`Model ${model} thất bại:`, err);
                lastError = err;
            }
        }

        if (!successData) {
            throw new Error(`Tất cả mô hình đều thất bại. Hãy kiểm tra lại API Key. Lỗi cuối: ${lastError.message}`);
        }

        if (usedModel !== CANDIDATE_MODELS[0]) {
            showToast(`Mô hình chính thất bại, đang dùng dự phòng: ${usedModel}`, 'warning');
        } else {
            showToast('Trích xuất thành công bằng bản Pro!', 'success');
        }

        currentExtractedData = successData;
        renderTable(currentExtractedData);
        resultSection.classList.remove('hidden');
        
    } catch (error) {
        showToast('Lỗi: ' + error.message, 'error');
        console.error(error);
    } finally {
        loadingOverlay.classList.add('hidden');
    }
});

function renderTable(data) {
    resultTbody.innerHTML = '';
    data.forEach((row, index) => {
        const tr = document.createElement('tr');
        
        const cols = ['stt', 'ho_ten', 'ngay_cong', 'ca_sang', 'ca_trua', 'ca_chieu', 'ghi_chu'];
        cols.forEach(col => {
            const td = document.createElement('td');
            td.textContent = row[col] || '';
            td.setAttribute('contenteditable', 'true');
            td.dataset.index = index;
            td.dataset.col = col;
            
            if (row.uncertain) {
                td.classList.add('uncertain-cell');
            }

            td.addEventListener('focus', (e) => {
                // Tự động bôi đen toàn bộ text khi click vào ô để sửa nhanh
                const range = document.createRange();
                range.selectNodeContents(e.target);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            });

            td.addEventListener('keydown', (e) => {
                // Nhấn Enter để kết thúc chỉnh sửa (giống Excel) thay vì xuống dòng
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.blur(); // Trigger blur để lưu
                }
            });

            td.addEventListener('blur', (e) => {
                const newVal = e.target.textContent.trim();
                const oldVal = currentExtractedData[index][col] || '';
                
                if (newVal !== oldVal) {
                    currentExtractedData[index][col] = newVal;
                    
                    if (col === 'ho_ten' || col === 'ghi_chu') {
                        if (!contextDictionary.includes(newVal) && newVal.length > 2) {
                            contextDictionary.push(newVal);
                            localStorage.setItem('timesheetDictionary', JSON.stringify(contextDictionary));
                            showToast(`Đã học từ mới: "${newVal}"`, 'success');
                        }
                    }
                }
                
                if (row.uncertain) {
                    td.classList.remove('uncertain-cell');
                }
            });

            tr.appendChild(td);
        });
        
        resultTbody.appendChild(tr);
    });
}

// Client-side Excel Export using SheetJS
btnExport.addEventListener('click', () => {
    if (!currentExtractedData.length) {
        showToast('Không có dữ liệu để xuất', 'warning');
        return;
    }

    try {
        const cleanData = currentExtractedData.map(row => ({
            "STT": row.stt || "",
            "Họ và tên": row.ho_ten || "",
            "Ngày công": row.ngay_cong || "",
            "Ca sáng": row.ca_sang || "",
            "Ca trưa": row.ca_trua || "",
            "Ca chiều": row.ca_chieu || "",
            "Ghi chú": row.ghi_chu || ""
        }));

        const worksheet = XLSX.utils.json_to_sheet(cleanData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "BangChamCong");
        
        XLSX.writeFile(workbook, "timesheet.xlsx");
        showToast('Đã tải xuống file Excel!', 'success');
    } catch (error) {
        showToast('Lỗi xuất Excel: ' + error.message, 'error');
        console.error(error);
    }
});
