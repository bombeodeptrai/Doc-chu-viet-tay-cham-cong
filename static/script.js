// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadSection = document.getElementById('upload-section');
const previewArea = document.getElementById('preview-area');
const imagePreview = document.getElementById('image-preview');
const btnRemoveImage = document.getElementById('btn-remove-image');
const btnExtract = document.getElementById('btn-extract');
const loadingOverlay = document.getElementById('loading-overlay');
const resultSection = document.getElementById('result-section');
const resultTbody = document.getElementById('result-tbody');
const btnExport = document.getElementById('btn-export');
const toastContainer = document.getElementById('toast-container');

// State
let selectedFile = null;
let extractedData = [];
let contextDictionary = JSON.parse(localStorage.getItem('timesheet_dict')) || [];

// Constants
const API_URL = 'http://127.0.0.1:8000'; // Sửa lại nếu triển khai thực tế

// --- Upload Logic ---

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
        showToast('Vui lòng chỉ tải lên file hình ảnh.', 'error');
        return;
    }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
        dropZone.classList.add('hidden');
        previewArea.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

btnRemoveImage.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    imagePreview.src = '';
    previewArea.classList.add('hidden');
    dropZone.classList.remove('hidden');
    resultSection.classList.add('hidden');
});

// --- API Logic ---

btnExtract.addEventListener('click', async () => {
    if (!selectedFile) return;

    loadingOverlay.classList.remove('hidden');
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    // Join dictionary to string
    formData.append('dictionary', contextDictionary.join(', '));

    try {
        const response = await fetch(`${API_URL}/extract`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || 'Lỗi không xác định từ server');
        }

        const resData = await response.json();
        
        if (resData.fallback_used) {
            showToast('Hệ thống đang quá tải, tạm dùng mô hình tốc độ cao (độ chính xác có thể giảm).', 'warning');
        } else {
            showToast('Trích xuất thành công!', 'success');
        }

        extractedData = resData.data;
        renderTable(extractedData);
        
        // Hide upload, show results
        uploadSection.classList.add('hidden');
        resultSection.classList.remove('hidden');

    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    } finally {
        loadingOverlay.classList.add('hidden');
    }
});

// --- Table Rendering & Edit Logic ---

function renderTable(data) {
    resultTbody.innerHTML = '';
    
    data.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        
        const fields = ['stt', 'ho_ten', 'ngay_cong', 'ca_sang', 'ca_trua', 'ca_chieu', 'ghi_chu'];
        
        fields.forEach(field => {
            const td = document.createElement('td');
            td.textContent = row[field] || '';
            td.setAttribute('contenteditable', 'true');
            td.dataset.rowIndex = rowIndex;
            td.dataset.field = field;
            
            // Đánh dấu uncertain
            if (row.uncertain) {
                td.classList.add('uncertain-cell');
            }

            // Lắng nghe sự kiện sửa đổi
            td.addEventListener('blur', handleCellEdit);
            
            // Xóa highlight nếu người dùng click vào
            td.addEventListener('focus', () => {
                td.classList.remove('uncertain-cell');
                row.uncertain = false; // Đã xem qua
            });

            tr.appendChild(td);
        });
        
        resultTbody.appendChild(tr);
    });
}

function handleCellEdit(e) {
    const td = e.target;
    const rowIndex = td.dataset.rowIndex;
    const field = td.dataset.field;
    const newValue = td.textContent.trim();
    const oldValue = extractedData[rowIndex][field];

    if (newValue !== oldValue) {
        extractedData[rowIndex][field] = newValue;
        
        // Học từ mới (Dynamic Dictionary)
        // Chỉ lưu các trường text có ý nghĩa như tên, ghi chú
        if (field === 'ho_ten' || field === 'ghi_chu') {
            addToDictionary(newValue);
        }
    }
}

function addToDictionary(word) {
    if (!word || word.length < 2) return;
    
    if (!contextDictionary.includes(word)) {
        contextDictionary.push(word);
        // Giới hạn dictionary 100 từ mới nhất
        if (contextDictionary.length > 100) {
            contextDictionary.shift();
        }
        localStorage.setItem('timesheet_dict', JSON.stringify(contextDictionary));
        console.log("Đã cập nhật từ điển:", contextDictionary);
    }
}

// --- Export Logic ---

btnExport.addEventListener('click', async () => {
    try {
        btnExport.disabled = true;
        btnExport.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0;"></div> Đang xuất...';
        
        const response = await fetch(`${API_URL}/export`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(extractedData)
        });

        if (!response.ok) throw new Error('Không thể xuất file Excel.');

        // Download Blob
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'timesheet.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        
        showToast('Xuất file thành công!', 'success');

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btnExport.disabled = false;
        btnExport.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Xuất Excel
        `;
    }
});

// --- Utilities ---

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}
