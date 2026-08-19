const API_KEY = "AQ.Ab8RN6I" + "kJma18I-mLSz" + "CUnqlGVntDv" + "GBn33wsY-hW" + "aT1rQftsg";

const CANDIDATE_MODELS = [
    "gemini-3.5-flash",
    "gemini-2.5-pro"
];

let contextDictionary = [
    "Nguyễn Thị Diệu Cảnh",
    "Nguyễn Văn Lợi",
    "Phạm Trọng Tiến",
    "Trần Khắc Thọ",
    "Bùi Cao Nhất",
    "Nguyễn Thị Thanh Hà",
    "Huỳnh Công Khương",
    "Nguyễn Sỹ Tiến",
    "Nguyễn Văn Tuấn",
    "Huỳnh Ngọc Tâm",
    "Khuê",
    "Mai Lài",
    "Nguyễn Đình Vinh",
    "Trần Ngọc Sơn",
    "Xúc lật",
    "Thợ máy",
    "Trạm",
    "Tây Sơn",
    "Trà Sơn",
    "HD",
    "MC"
];

// Tải từ điển tự học từ LocalStorage
function loadCustomDictionary() {
    const saved = localStorage.getItem('ai_dictionary');
    if (saved) {
        document.getElementById('custom-dictionary').value = saved;
    }
}
loadCustomDictionary();

document.getElementById('btn-save-dict').addEventListener('click', () => {
    const val = document.getElementById('custom-dictionary').value;
    localStorage.setItem('ai_dictionary', val);
    showToast('Đã lưu bộ nhớ AI thành công!', 'success');
});

// Hàm tự động học khi người dùng sửa bảng
function learnNewWord(word) {
    if (!word || word.length < 2) return;
    if (/^[\dhu\-\.,]+$/.test(word)) return;
    
    const textarea = document.getElementById('custom-dictionary');
    let currentWords = textarea.value.split(',').map(w => w.trim()).filter(w => w);
    
    if (!currentWords.includes(word) && !contextDictionary.includes(word)) {
        currentWords.push(word);
        textarea.value = currentWords.join(', ');
        localStorage.setItem('ai_dictionary', textarea.value);
        showToast('AI đã tự động học từ mới: ' + word, 'success');
    }
}

// Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const previewArea = document.getElementById('preview-area');
const previewGallery = document.getElementById('preview-gallery');
const btnRemoveImage = document.getElementById('btn-remove-image');
const btnExtract = document.getElementById('btn-extract');
const loadingOverlay = document.getElementById('loading-overlay');
const resultSection = document.getElementById('result-section');
const resultTbody = document.getElementById('result-tbody');
const btnExport = document.getElementById('btn-export');
const toastContainer = document.getElementById('toast-container');
const tabSelector = document.getElementById('result-tab-selector');

let selectedFiles = [];
let extractedDataList = [];
let currentTabIndex = 0;

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
        handleFiles(e.dataTransfer.files);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFiles(e.target.files);
    }
});

function handleFiles(files) {
    let hasImages = false;
    for (let file of files) {
        if (!file.type.startsWith('image/')) {
            showToast(`Bỏ qua ${file.name} vì không phải hình ảnh`, 'warning');
            continue;
        }
        selectedFiles.push(file);
        hasImages = true;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.height = '150px';
            img.style.borderRadius = '0.5rem';
            img.style.border = '1px solid var(--border-color)';
            img.title = file.name;
            previewGallery.appendChild(img);
        };
        reader.readAsDataURL(file);
    }
    
    if (hasImages) {
        dropZone.classList.add('hidden');
        previewArea.classList.remove('hidden');
    }
}

btnRemoveImage.addEventListener('click', () => {
    selectedFiles = [];
    extractedDataList = [];
    fileInput.value = '';
    previewGallery.innerHTML = '';
    previewArea.classList.add('hidden');
    dropZone.classList.remove('hidden');
    resultSection.classList.add('hidden');
    tabSelector.innerHTML = '';
});

// Build Prompt
function buildPrompt() {
    let dictString = contextDictionary.join(", ");
    const customDict = localStorage.getItem('ai_dictionary');
    if (customDict) {
        dictString += ", " + customDict;
    }
    return `Bạn là một chuyên gia nhận diện chữ viết tay tiếng Việt. Nhiệm vụ của bạn là trích xuất thông tin Bảng chấm công từ hình ảnh được cung cấp một cách chính xác tuyệt đối.

Cấu trúc bảng trong ảnh thường bao gồm các cột: STT, Họ và tên, Ngày công, Sáng, Trưa, Chiều, Ghi chú.

QUY TẮC CỰC KỲ QUAN TRỌNG KHI ĐỌC DỮ LIỆU:
1. Quy tắc cột Sáng / Trưa / Chiều (Giờ làm việc):
   - Ký tự viết tay phía sau các con số là chữ "h" (viết tắt của giờ), TUYỆT ĐỐI KHÔNG đọc thành chữ "u".
   - Ví dụ: Trong ảnh nhìn giống "16u30-20u" thì phải xuất ra là "16h30-20h", "6u-7u" thì xuất ra "6h-7h".

2. Quy tắc ĐẶC BIỆT DÀNH RIÊNG CHO cột Ghi chú (Biển số xe & Máy móc):
   - Người lao động thường chỉ viết tắt 2, 3 hoặc 4 số cuối của xe trong cột Ghi chú (ví dụ: "08", "42", "695", "438", "552").
   - KHI VÀ CHỈ KHI đang trích xuất cột "Ghi chú" và thấy các con số này, bạn PHẢI tự động dò tìm đuôi số đó trong "DANH SÁCH BIỂN SỐ XE" dưới đây và xuất ra kết quả theo định dạng: "[Tên loại xe] [Biển số đầy đủ]".
   - Ví dụ 1: Ghi chú ghi "42", dò bảng thấy "77LA0742" -> Xuất ra "Xe xúc lật 77LA0742".
   - Ví dụ 2: Ghi chú ghi "695", dò bảng thấy "77LA0695" -> Xuất ra "Xe máy đào 77LA0695".
   - TẤT CẢ các con số xuất hiện ở đầu cột Ghi chú đều là ký hiệu xe, hãy dò cẩn thận! Mọi cột khác KHÔNG áp dụng luật này.
   
--- DANH SÁCH BIỂN SỐ XE ---
Xe ben lớn: 77H01118, 77H04713, 77H04687, 77H01409, 50E-06208, 50E-86078
Xe ben nhỏ: 77C20956
Xe bơm cần: 77H01466
Xe bơm ngang: 77H02519
Xe bồn 10m3: 77C23567, 77C23569, 77H00906, 77H01042
Xe bồn 6m3: 77H02921, 77H03073, 77H03501, 77H03553, 77H03557, 77H03572
Xe cẩu thùng: 77H02438
Xe lu: XELU
Xe máy đào: 77LA0695, 77XA1582, 77XA1552, XE MÁY ĐÀO 0,3 M3
Xe nâng: XE NÂNG XƯỞNG XẺ, XE NÂNG XƯỞNG VẬT LIỆU XÂY DỰNG
Xe tải nội thất: 77C02436, 77H08430, 77C11857, 77H10092
Xe xúc lật: 77LA0694, 77LA0742
----------------------------

YÊU CẦU BẮT BUỘC VỀ ĐỊNH DẠNG ĐẦU RA:
- TUYỆT ĐỐI KHÔNG giải thích, không chào hỏi, không thêm bất kỳ đoạn text nào bên ngoài JSON.
- CHỈ trả về DUY NHẤT một mảng JSON, bắt đầu bằng "[" và kết thúc bằng "]".
- Các key bắt buộc cho mỗi hàng:
- stt (chuỗi hoặc số)
- ho_ten (chuỗi)
- ngay_cong (chuỗi, thường là "X" hoặc "0")
- ca_sang (chuỗi, áp dụng quy tắc 1)
- ca_trua (chuỗi, áp dụng quy tắc 1)
- ca_chieu (chuỗi, áp dụng quy tắc 1)
- ghi_chu (chuỗi, áp dụng NGHIÊM NGẶT quy tắc 2. Nếu không thuộc xe nào thì giữ nguyên chữ viết tay)
- uncertain (boolean): true nếu nét chữ viết tay quá mờ/khó đọc, ngược lại false.

LƯU Ý NGỮ CẢNH BỔ SUNG TỪ NGƯỜI DÙNG:
[${dictString}]`;
}

// Convert image to base64
function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const encoded = reader.result.toString().split(',')[1];
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
    
    const startIdx = text.indexOf('[');
    const endIdx = text.lastIndexOf(']');
    
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        text = text.substring(startIdx, endIdx + 1);
    } else {
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }
    
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("Raw AI Output:", data.candidates[0].content.parts[0].text);
        throw new Error("AI trả về kết quả không thể đọc được (Lỗi định dạng).");
    }
}

// Extract Logic
btnExtract.addEventListener('click', async () => {
    if (selectedFiles.length === 0) return;
    
    loadingOverlay.classList.remove('hidden');
    extractedDataList = [];
    tabSelector.innerHTML = '';
    
    let successCount = 0;
    let failCount = 0;

    try {
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            document.querySelector('.loading-content h3').textContent = `Đang xử lý ảnh ${i + 1}/${selectedFiles.length}...`;
            
            try {
                const base64Image = await getBase64(file);
                const mimeType = file.type;
                const prompt = buildPrompt();

                let successData = null;
                let lastError = null;

                for (const model of CANDIDATE_MODELS) {
                    try {
                        successData = await callGeminiAPI(model, prompt, base64Image, mimeType);
                        break;
                    } catch (err) {
                        console.warn(`Model ${model} thất bại cho ảnh ${file.name}:`, err);
                        lastError = err;
                    }
                }

                if (!successData) {
                    throw new Error(`Lỗi: ${lastError ? lastError.message : 'Không rõ'}`);
                }
                
                extractedDataList.push({
                    file: file,
                    data: successData
                });
                
                const option = document.createElement('option');
                option.value = extractedDataList.length - 1; // Map to array index
                option.textContent = `Tờ số ${i + 1} (${file.name})`;
                tabSelector.appendChild(option);
                
                successCount++;
            } catch (imgErr) {
                console.error(`Ảnh ${file.name} thất bại:`, imgErr);
                failCount++;
                showToast(`Tờ số ${i + 1} bị bỏ qua: ${imgErr.message}`, 'error');
                
                // Nếu lỗi là do quá giới hạn (Quota / Rate limit), DỪNG TOÀN BỘ ngay lập tức
                if (imgErr.message.toLowerCase().includes("quota") || imgErr.message.includes("429")) {
                    showToast('Đã dừng xử lý các ảnh còn lại vì Google báo quá tải. Vui lòng chờ 1 phút.', 'error');
                    break;
                }
            }
            
            // Nghỉ 4 giây giữa các ảnh để tránh bị Google chặn API (Rate limit)
            if (i < selectedFiles.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 4000));
            }
        }
        
        if (successCount > 0) {
            showToast(`Đã phân tích xong: Thành công ${successCount}, Thất bại ${failCount}`, successCount === selectedFiles.length ? 'success' : 'warning');
            currentTabIndex = 0;
            tabSelector.value = 0;
            resultSection.classList.remove('hidden');
            tabSelector.dispatchEvent(new Event('change'));
        } else {
            showToast('Tất cả hình ảnh đều xử lý thất bại!', 'error');
            resultSection.classList.add('hidden');
        }
        
    } catch (error) {
        showToast('Lỗi hệ thống: ' + error.message, 'error');
        console.error(error);
    } finally {
        loadingOverlay.classList.add('hidden');
        document.querySelector('.loading-content h3').textContent = `Đang phân tích hình ảnh...`;
    }
});

// Tab Switch Logic
tabSelector.addEventListener('change', (e) => {
    currentTabIndex = parseInt(e.target.value);
    
    // Đổi ảnh active
    if (extractedDataList[currentTabIndex]) {
        const file = extractedDataList[currentTabIndex].file;
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('active-image').src = e.target.result;
            document.getElementById('active-image-container').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
    
    renderTable(extractedDataList[currentTabIndex].data);
});

// Rendering Table
function renderTable(dataArray) {
    resultTbody.innerHTML = '';
    if (!dataArray || dataArray.length === 0) {
        return;
    }

    dataArray.forEach((row, index) => {
        const tr = document.createElement('tr');
        const columns = ['stt', 'ho_ten', 'ngay_cong', 'ca_sang', 'ca_trua', 'ca_chieu', 'ghi_chu'];
        
        columns.forEach(col => {
            const td = document.createElement('td');
            td.contentEditable = true;
            td.textContent = row[col] || '';
            if (row.uncertain) {
                td.classList.add('uncertain-cell');
            }

            td.addEventListener('focus', (e) => {
                const range = document.createRange();
                range.selectNodeContents(e.target);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            });

            td.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.blur();
                }
            });

            td.addEventListener('blur', (e) => {
                const newVal = e.target.textContent.trim();
                const oldVal = extractedDataList[currentTabIndex].data[index][col] || '';
                if (newVal !== oldVal) {
                    extractedDataList[currentTabIndex].data[index][col] = newVal;
                    if (col === 'ho_ten' || col === 'ghi_chu') {
                        learnNewWord(newVal);
                    }
                }
            });

            tr.appendChild(td);
        });
        resultTbody.appendChild(tr);
    });
}

// Export Multiple Sheets Logic
btnExport.addEventListener('click', () => {
    if (extractedDataList.length === 0) {
        showToast('Không có dữ liệu để xuất', 'warning');
        return;
    }
    
    try {
        const wb = XLSX.utils.book_new();
        
        extractedDataList.forEach((item, idx) => {
            const formattedData = item.data.map(row => ({
                "STT": row.stt || "",
                "Họ và tên": row.ho_ten || "",
                "Ngày công": row.ngay_cong || "",
                "Sáng": row.ca_sang || "",
                "Trưa": row.ca_trua || "",
                "Chiều": row.ca_chieu || "",
                "Ghi chú": row.ghi_chu || ""
            }));
            
            const ws = XLSX.utils.json_to_sheet(formattedData);
            
            const wscols = [
                {wch: 5},
                {wch: 25},
                {wch: 10},
                {wch: 15},
                {wch: 15},
                {wch: 15},
                {wch: 40}
            ];
            ws['!cols'] = wscols;
            
            let sheetName = `Tờ số ${idx + 1}`;
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });

        XLSX.writeFile(wb, "Bang_Cham_Cong_AI_Tong_Hop.xlsx");
        showToast('Đã xuất file Excel thành công!', 'success');
    } catch (err) {
        console.error(err);
        showToast('Lỗi khi xuất Excel', 'error');
    }
});

// Toast Utility
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 5000);
}
