// dashboard.js
// 全域物品清單快取
let allItemsCache = [];


// 檢查登入狀態
window.addEventListener('load', function() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) {
        // 如果未登入，重定向到登入頁面
        window.location.href = 'index.html';
        return;
    }
    
    // ...existing code...
    // 頁面載入時自動顯示請購紀錄
    loadRequestList();
    // 1. 先載入所有物品清單
    firebase.firestore().collection('items').get().then(snapshot => {
        allItemsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setupNewRequestForm();
    });
});

// 根據角色設置選單
// ...existing code...

// 載入內容
// ...existing code...

// 載入請購紀錄（整合於新增請購頁面下方）
function loadRequestList() {
    const requestList = document.getElementById('requestList');
    if (!requestList) return;
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser || !currentUser.account) {
        requestList.innerHTML = '<div class="error-message">請重新登入</div>';
        return;
    }
    firebase.firestore().collection('requests')
        .where('requester.id', '==', currentUser.account)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                requestList.innerHTML = '<div class="empty-message">尚無請購紀錄</div>';
                return;
            }
            // 只顯示登入者的請購紀錄，統一卡片樣式
            const allRequests = snapshot.docs.map(doc => doc.data());
            // 狀態過濾
            const filtered = allRequests.filter(r => r.status === '待處理' || r.status === '待審核');
            let html = '';
            filtered.forEach(data => {
                let dateStr = '';
                if (data.createTime && typeof data.createTime.toDate === 'function') {
                    dateStr = data.createTime.toDate().toLocaleDateString('zh-TW');
                }
                html += `
                <div class="request-card ${data.status}" style="margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.08);border-radius:8px;padding:18px 24px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <span style="font-size:1.1em;color:#333;">${dateStr}</span>
                        <span style="color:#d32f2f;font-weight:bold;">${data.status}</span>
                    </div>
                    <div style="font-size:1.15em;font-weight:bold;margin-bottom:8px;">${data.item?.name || ''}</div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span>規格：${data.specification?.name || ''}</span>
                        <span style="color:#1976d2;font-weight:bold;">${data.quantity || ''} ${data.unit || ''}</span>
                    </div>
                    ${data.note ? `<div style='margin-top:8px;color:#888;'>備註：${data.note}</div>` : ''}
                </div>
                `;
            });
            requestList.innerHTML = html;
        })
        .catch(error => {
            requestList.innerHTML = `<div class="error-message">載入失敗，請稍後再試<br>${error.message}</div>`;
            console.error('Firestore 載入請購紀錄失敗:', error);
        });
}

// EMPLOYEE 相關函數
function setupNewRequestForm() {
    const categorySelect = document.getElementById('category');
    const itemSelect = document.getElementById('item');
    const specificationSelect = document.getElementById('specification');
    const form = document.getElementById('newRequestForm');

    // 載入類別
    setTimeout(() => {
        loadCategories();
    }, 500);

    // 當類別改變時載入對應品項
    categorySelect.onchange = () => {
        console.log('類別改變:', categorySelect.value);
        itemSelect.disabled = false;
        loadItems(categorySelect.value);
    };

    // 當品項改變時載入對應規格
    itemSelect.onchange = () => {
        console.log('品項改變:', itemSelect.value);
        specificationSelect.disabled = false;
        loadSpecifications(itemSelect.value);
    };

    // 當規格改變時更新單位
    specificationSelect.onchange = () => {
        console.log('規格改變:', specificationSelect.value);
        updateItemInfo(itemSelect.value, specificationSelect.value);
    };

    // 表單提交
    form.onsubmit = async (e) => {
        e.preventDefault();
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        // 獲取表單數據
        const department = document.getElementById('department').textContent;
        const requesterName = document.getElementById('requesterName').value;
        const quantity = parseInt(document.getElementById('quantity').value);
        // 驗證必填欄位
        if (!requesterName) {
            alert('請填寫請購人姓名！');
            return;
        }
        try {
            // 檢查庫存
            const itemRef = firebase.firestore().collection('items').doc(itemSelect.value);
            const itemDoc = await itemRef.get();
            if (!itemDoc.exists) {
                alert('找不到該品項資料！');
                return;
            }
            const itemData = itemDoc.data();
            const currentStock = itemData.quantity || 0;
            const tempHold = itemData.tempHold || 0;
            const itemLocation = itemData.location || '';
            const availableStock = currentStock - tempHold;
                        if (availableStock < quantity) {
                            // 美化彈跳視窗（背景提升不透明度）
                            const modal = document.createElement('div');
                            modal.className = 'custom-modal';
                            modal.innerHTML = `
                                <div class="custom-modal-content">
                                    <div class="custom-modal-title" style="color:#d32f2f;font-size:1.3em;font-weight:bold;margin-bottom:12px;">庫存不足待採購</div>
                                    <div style="margin-bottom:8px;"><strong>品項：</strong>${itemSelect.options[itemSelect.selectedIndex].text}</div>
                                    <div style="margin-bottom:8px;"><strong>目前可用庫存：</strong>${availableStock} ${itemData.unit || '個'}</div>
                                    <div style="margin-bottom:8px;"><strong>請購數量：</strong>${quantity} ${itemData.unit || '個'}</div>
                                    <div style="color:#d32f2f;margin-bottom:8px;">如有急用請洽管理部人員。</div>
                                    <div id="modal-process-tip" style="color:#1976d2;margin-bottom:16px;">正在處理您的請求...</div>
                                    <button class="custom-modal-btn" style="background:#43a047;color:#fff;padding:8px 32px;border:none;border-radius:6px;font-size:1em;cursor:pointer;" onclick="this.closest('.custom-modal').remove()">確認</button>
                                </div>
                            `;
                            Object.assign(modal.style, {
                                position: 'fixed',
                                top: '0', left: '0', width: '100vw', height: '100vh',
                                background: 'rgba(0,0,0,0.28)', zIndex: '9999',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            });
                            // 內容區塊美化（白色、圓角、陰影、寬度限制）
                            const modalContent = modal.querySelector('.custom-modal-content');
                            if (modalContent) {
                                Object.assign(modalContent.style, {
                                    background: '#fff',
                                    borderRadius: '12px',
                                    boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                                    padding: '32px 28px',
                                    maxWidth: '340px',
                                    width: '90%',
                                    textAlign: 'center'
                                });
                            }
                            document.body.appendChild(modal);
                            // 等待暫扣數量更新後，改提示文字
                            setTimeout(() => {
                                const tip = modal.querySelector('#modal-process-tip');
                                if (tip) {
                                    tip.textContent = '處理已完成，請點擊確認';
                                    tip.style.color = '#43a047';
                                }
                            }, 800);
                        }
            // 產生請購單號：yyyyMMdd+三碼流水號
            const todayStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
            const requestsRef = firebase.firestore().collection('requests');
            // 查詢今日已存在的請購單數量
            const todayStart = new Date();
            todayStart.setHours(0,0,0,0);
            const todayEnd = new Date();
            todayEnd.setHours(23,59,59,999);
            const snapshot = await requestsRef
                .where('createTime', '>=', todayStart)
                .where('createTime', '<=', todayEnd)
                .get();
            const serial = (snapshot.size + 1).toString().padStart(3, '0');
            const requestNo = todayStr + serial;

            // 建立請購單數據
            const request = {
                requestNo: requestNo,
                department: department,
                requester: {
                    id: currentUser.account,
                    name: requesterName
                },
                category: categorySelect.value,
                item: {
                    id: itemSelect.value,
                    name: itemSelect.options[itemSelect.selectedIndex].text
                },
                specification: {
                    id: specificationSelect.value,
                    name: specificationSelect.options[specificationSelect.selectedIndex].text
                },
                quantity: quantity,
                unit: document.getElementById('unit').textContent,
                location: itemLocation,
                note: document.getElementById('note').value,
                status: '待審核',
                createTime: firebase.firestore.FieldValue.serverTimestamp(),
                updateTime: firebase.firestore.FieldValue.serverTimestamp()
            };
            // 更新暫扣數量
            await itemRef.update({
                tempHold: firebase.firestore.FieldValue.increment(quantity)
            });
            // 保存請購單
            await requestsRef.add(request);
            // 清空表單
            form.reset();
            loadCategories();
            // 顯示成功訊息
            const successMessage = document.createElement('div');
            successMessage.className = 'success-message';
            successMessage.textContent = '請購單提交成功！';
            form.insertBefore(successMessage, form.firstChild);
            setTimeout(() => { successMessage.remove(); }, 3000);
            // 送出後執行一次請購紀錄刷新
            loadRequestList();
        } catch (error) {
            console.error('提交失敗:', error);
            alert('提交失敗：' + error.message);
        }
    };
// 載入請購紀錄（整合於新增請購頁面下方）
function loadRequestList() {
    const requestList = document.getElementById('requestList');
    if (!requestList) return;
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser || !currentUser.account) {
        requestList.innerHTML = '<div class="error-message">請重新登入</div>';
        return;
    }
    firebase.firestore().collection('requests')
        .where('requester.id', '==', currentUser.account)
        .limit(10)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                requestList.innerHTML = '<div class="empty-message">尚無請購紀錄</div>';
                return;
            }
            const requestsHtml = snapshot.docs.map(doc => {
                const data = doc.data();
                let dateStr = '';
                if (data.createTime) {
                    if (typeof data.createTime.toDate === 'function') {
                        dateStr = data.createTime.toDate().toLocaleDateString('zh-TW');
                    } else if (data.createTime instanceof Date) {
                        dateStr = data.createTime.toLocaleDateString('zh-TW');
                    }
                }
                return `
                    <div class="request-card ${data.status}">
                        <div class="request-header">
                            <div class="request-date">${dateStr}</div>
                            <div class="request-status">${data.status}</div>
                        </div>
                        <div class="request-details">
                            <div class="request-item">
                                <strong>${data.item?.name || '無品項名稱'}</strong>
                                <span class="quantity">${data.quantity} ${data.unit}</span>
                            </div>
                            <div class="request-info">
                                ${data.specification?.name ? `<span class="spec">規格：${data.specification.name}</span>` : ''}
                                ${data.note ? `<span class="note">備註：${data.note}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            requestList.innerHTML = requestsHtml;
        })
        .catch(error => {
            requestList.innerHTML = '<div class="error-message">載入失敗，請稍後再試</div>';
        });
}
    
}

// 載入類別列表
function loadCategories() {
    console.log('開始載入類別...');
    const categorySelect = document.getElementById('category');
    categorySelect.innerHTML = '<option value="">載入中...</option>';

    const db = firebase.firestore();
    console.log('取得 Firestore 實例');

    const defaultCategories = [
        { id: '生產類', name: '生產類' },
        { id: '文具類', name: '文具類' },
        { id: '耗材類', name: '耗材類' },
        { id: '清潔類', name: '清潔類' }
    ];

    Promise.all([
        // 1. 先嘗試從 Firestore 載入
        db.collection('categories').get(),
        // 2. 確保默認類別存在
        ...defaultCategories.map(category => 
            db.collection('categories').doc(category.id).set({
                name: category.name
            }, { merge: true })
        )
    ])
    .then(([snapshot]) => {
        console.log('成功連接到 Firestore');
        
        categorySelect.innerHTML = '<option value="">請選擇類別</option>';
        let productionOption;
        let hasCategories = false;

        snapshot.forEach(doc => {
            hasCategories = true;
            const categoryData = doc.data();
            console.log('載入類別:', doc.id, categoryData);
            
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = categoryData.name || doc.id;
            categorySelect.appendChild(option);
            
            // 儲存生產類的選項
            if (doc.id === '生產類' || categoryData.name === '生產類') {
                productionOption = option;
            }
        });

        // 如果沒有從 Firestore 載入任何類別，使用默認類別
        if (!hasCategories) {
            console.log('使用默認類別');
            defaultCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                categorySelect.appendChild(option);
                
                if (category.id === '生產類') {
                    productionOption = option;
                }
            });
        }

        // 選擇默認類別
        if (productionOption) {
            console.log('選擇生產類');
            productionOption.selected = true;
            categorySelect.dispatchEvent(new Event('change'));
        } else {
            console.log('未找到生產類選項');
        }
    })
    .catch(error => {
        console.error('載入類別失敗:', error);
        categorySelect.innerHTML = '<option value="">載入失敗</option>';
        alert('載入類別失敗: ' + error.message);
    });
}

// 載入品項列表
function loadItems(category) {
    console.log('載入品項（本機快取），類別:', category);
    const itemSelect = document.getElementById('item');
    itemSelect.innerHTML = '<option value="">載入中...</option>';
    // 用本機快取篩選
    const filteredItems = allItemsCache.filter(item => item.category === category && item.name);
    const uniqueItems = new Map();
    filteredItems.forEach(item => {
        if (!uniqueItems.has(item.name)) {
            uniqueItems.set(item.name, item);
        }
    });
    itemSelect.innerHTML = '<option value="">請選擇品項</option>';
    Array.from(uniqueItems.values())
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'))
        .forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            itemSelect.appendChild(option);
        });
    // 如果有品項，自動選擇第一個
    if (itemSelect.options.length > 1) {
        itemSelect.selectedIndex = 1;
        itemSelect.dispatchEvent(new Event('change'));
    }
}

// 載入規格列表
function loadSpecifications(itemId) {
    console.log('載入規格（本機快取），品項ID:', itemId);
    const specSelect = document.getElementById('specification');
    specSelect.innerHTML = '<option value="">載入中...</option>';
    if (!itemId) {
        console.error('未提供品項ID');
        specSelect.innerHTML = '<option value="">請先選擇品項</option>';
        return;
    }
    // 用本機快取找品項
    const item = allItemsCache.find(i => i.id === itemId);
    if (!item) {
        specSelect.innerHTML = '<option value="">找不到此品項</option>';
        document.getElementById('unit').textContent = '無法取得';
        return;
    }
    specSelect.innerHTML = '<option value="">請選擇規格</option>';
    if (item.name && item.spec) {
        const option = document.createElement('option');
        option.value = item.spec;
        option.textContent = item.spec;
        specSelect.appendChild(option);
        specSelect.selectedIndex = 1;
        document.getElementById('unit').textContent = item.unit || '個';
        updateItemInfo(itemId, item.spec);
    } else {
        specSelect.innerHTML = '<option value="">無法取得規格資料</option>';
        document.getElementById('unit').textContent = item.unit || '個';
    }
}


// 更新物品資訊
function updateItemInfo(itemId, specId) {
    console.log('更新物品資訊:', itemId, specId);
    
    // 獲取所有需要更新的元素
    const unitElement = document.getElementById('unit');
    const stockElement = document.getElementById('stock');
    const safetyStockElement = document.getElementById('safetyStock');
    
    // 檢查元素是否存在
    if (!unitElement || !stockElement || !safetyStockElement) {
        console.error('找不到必要的 DOM 元素');
        return;
    }
    
    // 用本機快取找品項
    const item = allItemsCache.find(i => i.id === itemId);
    if (item) {
        unitElement.textContent = item.unit || '個';
        stockElement.textContent = item.quantity !== undefined ? item.quantity : '-';
        safetyStockElement.textContent = item.safetyStock !== undefined ? item.safetyStock : '-';
    } else {
        unitElement.textContent = '無法取得';
        stockElement.textContent = '-';
        safetyStockElement.textContent = '-';
    }
}

async function loadMyRequests() {
    console.log('開始執行 loadMyRequests 函數');

    // 添加樣式
    const style = document.createElement('style');
    style.textContent = `
        .loading-spinner {
            text-align: center;
            padding: 20px;
            font-size: 16px;
            color: #666;
        }
        .loading-spinner::after {
            content: '...';
            animation: dots 1.5s steps(4, end) infinite;
        }
        @keyframes dots {
            0%, 20% { content: '.'; }
            40% { content: '..'; }
            60% { content: '...'; }
            80%, 100% { content: ''; }
        }

        .alert-dialog {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
        }

        .alert-content {
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
            max-width: 400px;
            width: 90%;
            animation: modalFadeIn 0.3s ease-out;
            position: relative;
        }

        @keyframes modalFadeIn {
            from {
                opacity: 0;
                transform: translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .alert-title {
            color: #dc3545;
            text-align: center;
            margin-bottom: 20px;
            font-size: 1.5em;
            font-weight: bold;
        }

        .alert-body {
            margin-bottom: 20px;
        }

        .alert-body p {
            margin-bottom: 10px;
            line-height: 1.5;
        }

        .alert-actions {
            text-align: center;
            margin-top: 20px;
        }

        .confirm-btn {
            background-color: #4CAF50 !important;
            color: white;
            padding: 10px 30px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            transition: background-color 0.3s ease;
        }

        .confirm-btn:hover {
            background-color: #45a049 !important;
        }
    `;
    document.head.appendChild(style);
    
    // 檢查 Firebase 初始化狀態
    if (!firebase.apps.length) {
        console.error('Firebase 尚未初始化！');
        return;
    }
    
    const contentArea = document.getElementById('content-area');
    const requestListId = 'requestList-' + Date.now(); // 產生唯一的 ID
    console.log('生成的 requestListId:', requestListId);
    
    contentArea.innerHTML = `
        <h2>我的請購清單</h2>
        <div id="${requestListId}" class="request-list">
            <div class="loading-spinner">資料載入中...</div>
        </div>
    `;
    
    try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (!currentUser || !currentUser.account) {
            throw new Error('未登入或使用者資訊不完整');
        }
        
        console.log('當前使用者資訊:', {
            account: currentUser.account,
            name: currentUser.name,
            department: currentUser.department,
            position: currentUser.position
        });
        
        if (!currentUser || !currentUser.account) {
            const requestList = document.getElementById(requestListId);
            if (requestList) {
                requestList.innerHTML = '<div class="error-message">無法載入使用者資料，請重新登入</div>';
            }
            return;
        }

        // 使用實時監聽來獲取請購單資料
        console.log('開始設置 Firestore 查詢，使用者帳號:', currentUser.account);
        
        const db = firebase.firestore();
        console.log('取得 Firestore 實例');
        
        console.log('準備查詢 Firestore，條件：', {
            collection: 'requests',
            requesterId: currentUser.account
        });

        // 設置查詢監聽
        const unsubscribe = db.collection('requests')
            .orderBy('createTime', 'desc')
            .onSnapshot(snapshot => {
                console.log('onSnapshot 被觸發');
                console.log('資料庫中總共有', snapshot.size, '筆請購單');
                
                // 顯示所有文件的內容以便偵錯
                snapshot.forEach(doc => {
                    console.log('文件ID:', doc.id, '內容:', doc.data());
                });

                const requestList = document.getElementById(requestListId);
                
                if (!requestList) {
                    console.error('找不到 requestList 元素:', requestListId);
                    return;
                }

                console.log('查詢結果:', snapshot.size, '筆資料'); // 偵錯用
                
                // 檢視每一筆資料的內容
                snapshot.forEach(doc => {
                    const data = doc.data();
                    console.log('請購單詳細資料:', {
                        文件ID: doc.id,
                        請購人: data.requester,
                        狀態: data.status,
                        建立時間: data.createTime?.toDate(),
                        部門: data.department,
                        品項: data.item
                    });
                });
        
                if (snapshot.empty) {
                    console.log('沒有找到任何請購紀錄');
                    requestList.innerHTML = `
                        <div class="empty-message">
                            <p>尚無待處理的請購紀錄</p>
                            <p class="debug-info">使用者帳號: ${currentUser.account}</p>
                        </div>
                    `;
                    return;
                }

                const requestsHtml = snapshot.docs.map(doc => {
                    const data = doc.data();
                    console.log('文件資料:', doc.id, data); // 偵錯用
                    return `
                        <div class="request-card ${data.status}">
                            <div class="request-header">
                                <div class="request-info">
                                    <p>申請日期：${data.createTime?.toDate().toLocaleDateString('zh-TW') || '無'}</p>
                                </div>
                            </div>
                            <div class="request-body">
                                <div class="request-details">
                                    <p><strong>部門：</strong>${data.department || '未指定'}</p>
                                    <p><strong>請購人：</strong>${data.requester?.name || '未指定'}</p>
                                    <p><strong>料號：</strong>${data.item?.id || '無'}</p>
                                    <p><strong>品項：</strong>${data.item?.name || '無'}</p>
                                    <p><strong>規格：</strong>${data.specification?.name || '無'}</p>
                                    <p><strong>數量：</strong>${data.quantity || 0} ${data.unit || '個'}</p>
                                    ${data.note ? `<p><strong>備註：</strong>${data.note}</p>` : ''}
                                    <p><strong>處理狀態：</strong><span class="request-status">${data.status}</span></p>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                requestList.innerHTML = requestsHtml;
            }, error => {
                console.error('載入請購單時發生錯誤:', error);
                const requestList = document.getElementById(requestListId);
                if (requestList) {
                    requestList.innerHTML = '<div class="error-message">載入資料時發生錯誤，請稍後再試</div>';
                }
            });

        // 清理監聽器
        return () => unsubscribe();
    } catch (error) {
        console.error('初始化請購單載入時發生錯誤:', error);
        const requestList = document.getElementById(requestListId);
        if (requestList) {
            requestList.innerHTML = '<div class="error-message">系統錯誤，請重新整理頁面</div>';
        }
    }
}

// ADMIN 相關函數
function loadPendingRequests() {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = '<h2>待審核請購</h2><div id="pendingList" class="request-list">載入中...</div>';
    
    firebase.firestore().collection('requests')
        .where('status', '==', 'pending')
        .orderBy('createTime', 'desc')
        .get()
        .then(snapshot => {
            const pendingList = document.getElementById('pendingList');
            if (snapshot.empty) {
                pendingList.innerHTML = '<p>目前無待審核項目</p>';
                return;
            }

            pendingList.innerHTML = snapshot.docs.map(doc => {
                const data = doc.data();
                return `
                    <div class="request-card">
                        <div class="request-header">
                            <span class="request-id">#${doc.id}</span>
                            <span class="request-date">${data.createTime.toDate().toLocaleDateString()}</span>
                        </div>
                        <div class="request-body">
                            <p>申請人：${data.userId}</p>
                            <p>品項：${data.itemName}</p>
                            <p>數量：${data.quantity}</p>
                            <p>原因：${data.reason}</p>
                        </div>
                        <div class="request-actions">
                            <button onclick="approveRequest('${doc.id}')" class="approve-btn">核准</button>
                            <button onclick="rejectRequest('${doc.id}')" class="reject-btn">拒絕</button>
                        </div>
                    </div>
                `;
            }).join('');
        });
}

// DISTRIBUTOR 相關函數
function loadPendingDistribution() {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = '<h2>待發放清單</h2><div id="distributionList" class="request-list">載入中...</div>';
    
    firebase.firestore().collection('requests')
        .where('status', '==', 'approved')
        .orderBy('createTime', 'desc')
        .get()
        .then(snapshot => {
            const distributionList = document.getElementById('distributionList');
            if (snapshot.empty) {
                distributionList.innerHTML = '<p>目前無待發放項目</p>';
                return;
            }

            distributionList.innerHTML = snapshot.docs.map(doc => {
                const data = doc.data();
                return `
                    <div class="request-card">
                        <div class="request-header">
                            <span class="request-id">#${doc.id}</span>
                            <span class="request-date">${data.createTime.toDate().toLocaleDateString()}</span>
                        </div>
                        <div class="request-body">
                            <p>申請人：${data.userId}</p>
                            <p>品項：${data.itemName}</p>
                            <p>數量：${data.quantity}</p>
                        </div>
                        <div class="request-actions">
                            <button onclick="completeDistribution('${doc.id}')" class="complete-btn">完成發放</button>
                        </div>
                    </div>
                `;
            }).join('');
        });
}


// 登出函數
function logout() {
    // 清除儲存的用戶資訊
    localStorage.removeItem('currentUser');
    // 返回登入頁面
    window.location.href = 'index.html';
}


