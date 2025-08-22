// distributor.js
// 物品發放人員專用功能
let allItemsCache = [];

window.addEventListener('load', function() {
  // 檢查登入狀態
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }
  // 顯示使用者資訊
  document.getElementById('user-info').textContent = `${currentUser.name} (${currentUser.department})`;

  // 先載入所有物品清單快取
  firebase.firestore().collection('items').get().then(snapshot => {
    allItemsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // 載入請購單
    loadDistributionRequests();
  });

  // 事件監聽
  document.getElementById('refreshBtn').onclick = loadDistributionRequests;
  document.getElementById('statusFilter').onchange = loadDistributionRequests;
  document.getElementById('searchInput').oninput = loadDistributionRequests;
  document.getElementById('batchIssueBtn').onclick = function() {
    const checked = Array.from(document.querySelectorAll('.row-checkbox:checked'));
    if (checked.length === 0) {
      alert('請先勾選要批量發放的請購單');
      return;
    }
    showConfirmModal({
      title: '批量發放確認',
      body: `共選取 <b>${checked.length}</b> 筆請購單，確定要全部發放嗎？`,
      onConfirm: function() {
        const db = firebase.firestore();
        let finished = 0;
        let total = checked.length;
        let successCount = 0;
        // 先統計每個 itemId 的總扣除數量
        const itemCountMap = {};
        checked.forEach(cb => {
          db.collection('requests').doc(cb.dataset.id).get().then(doc => {
            const data = doc.data();
            const quantity = data?.quantity || 0;
            const itemId = data?.item?.id;
            if (itemId) {
              if (!itemCountMap[itemId]) itemCountMap[itemId] = 0;
              itemCountMap[itemId] += quantity;
            }
            // 標示請購單已發放
            db.collection('requests').doc(cb.dataset.id).update({
              status: '已發放',
              processDate: new Date().toISOString().slice(0, 10)
            }).then(() => {
              successCount++;
              finished++;
              if (finished >= total) {
                // 批量更新庫存
                const updatePromises = Object.entries(itemCountMap).map(([itemId, totalQty]) => {
                  return db.collection('items').doc(itemId).get().then(itemDoc => {
                    const itemData = itemDoc.data();
                    const newQty = (itemData.quantity || 0) - totalQty;
                    const tempHold = itemData.tempHold || 0;
                    const newTempQty = tempHold - totalQty;
                    return db.collection('items').doc(itemId).update({ quantity: newQty, tempHold: newTempQty });
                  });
                });
                Promise.all(updatePromises).then(() => {
                  showConfirmModal({
                    title: '批量發放完成',
                    body: `已成功扣除 <b>${successCount}</b> 筆請購單庫存！`,
                    onConfirm: function() { loadDistributionRequests(); }
                  });
                });
              }
            });
          });
        });
      }
    });
  };
  // 批量發放、刪除可依需求補充
});

function loadDistributionRequests() {
  const tableContainer = document.getElementById('requestTableContainer');
  tableContainer.innerHTML = '<div style="padding:24px;text-align:center;">資料載入中...</div>';

  const db = firebase.firestore();
  const status = document.getElementById('statusFilter').value;
  const keyword = document.getElementById('searchInput').value.trim();

        db.collection('requests')
    .where('status', '==', status === '待處理' ? '待處理' : '已發放')
    .get()
    .then(snapshot => {
      let rows = '';
      snapshot.forEach(doc => {
        const data = doc.data();
        // 關鍵字過濾
        if (keyword && !(
          (data.item?.name || '').includes(keyword) ||
          (data.requester?.name || '').includes(keyword) ||
          (data.requestNo || '').includes(keyword)
        )) return;

        // 依料號查詢物品清單，補齊庫存與安全庫存
        let stock = '-';
        let safetyStock = '-';
        if (data.item?.id) {
          const itemInfo = allItemsCache.find(i => i.id === data.item.id);
          if (itemInfo) {
            stock = itemInfo.quantity !== undefined ? itemInfo.quantity : '-';
            safetyStock = itemInfo.safetyStock !== undefined ? itemInfo.safetyStock : '-';
          }
        }

        rows += `
          <tr>
            <td style='text-align:center;'><input type='checkbox' class='row-checkbox' data-id='${doc.id}'></td>
            <td style='font-size:0.85em;'>${data.requestNo || ''}</td>
            <td style='font-size:0.85em;'>${data.createTime && typeof data.createTime.toDate === 'function' ? data.createTime.toDate().toLocaleDateString('zh-TW') : ''}</td>
            <td style='text-align:center;'>${data.requester?.name || ''}</td>
            <td style='text-align:center;'>${data.requester?.name || ''}</td>
            <td style='text-align:center;'>${data.department || ''}</td>
            <td class='request-item'>${data.item?.name || ''}<br><span style='color:#888;'>(規格: ${data.specification?.name || ''})</span><br><span style='color:#1976d2;'>庫存: ${stock}</span><br><span style='color:#d32f2f;'>安全庫存: ${safetyStock}</span></td>
            <td style='text-align:center;'>${data.quantity || ''}</td>
            <td style='text-align:center;'>${data.location || ''}</td>
            <td style='text-align:center;'>${data.status || ''}</td>
            <td style='text-align:center;'>${data.processDate || ''}</td>
            <td style='text-align:center;'>
  <button class='action-btn issue-btn' onclick="issueRequest('${doc.id}')">發放</button>
  <button class='action-btn delete-btn' onclick="deleteRequest('${doc.id}')">刪除</button>
</td>
          </tr>
        `;
      });
      tableContainer.innerHTML = `
            <style>
              .dist-table { width:100%; border-collapse:collapse; background:#fafbfc; font-size:1em; }
              .dist-table th, .dist-table td { padding:3px 2px; border:1px solid #d0d0d0; min-width:48px; }
              .dist-table th { background:#f5f5f5; font-weight:500; color:#333; text-align:center; font-size:0.95em; }
              .dist-table td { vertical-align:middle; text-align:center; font-size:0.82em; font-weight:400; line-height:1.2; color:#444; }
              .dist-table td.request-item { line-height:1.4; font-size:0.88em; text-align:left; min-width:120px; background:none; }
              .dist-table tr:hover { background:#f0f4fa; }
              .dist-table td.request-actions { text-align:center; border:1px solid #d0d0d0 !important; background:none !important; min-width:48px; height:48px; }
              .dist-table .action-btn {
                display: inline-block;
                width: 36px;
                height: 32px;
                margin: 0 2px;
                border-radius: 6px;
                font-size: 0.95em;
                font-weight: 500;
                border: none;
                box-shadow: 0 1px 4px rgba(0,0,0,0.08);
                cursor: pointer;
                padding: 0;
              }
              .dist-table .issue-btn {
                background: #388e3c;
                color: #fff;
              }
              .dist-table .delete-btn {
                background: #c62828;
                color: #fff;
              }
            </style>
            <table class='dist-table'>
              <thead>
                <tr>
                  <th style='width:36px;'><input type='checkbox' id='selectAllCheckbox'></th>
                  <th style='width:90px;'>請購單號</th>
                  <th style='width:80px;'>申請日期</th>
                  <th style='width:60px;'>申請人</th>
                  <th style='width:60px;'>請購人</th>
                  <th style='width:50px;'>部門</th>
                  <th style='min-width:120px;'>品名</th>
                  <th style='width:50px;'>數量</th>
                  <th style='width:50px;'>庫位</th>
                  <th style='width:60px;'>狀態</th>
                  <th style='width:70px;'>處理日期</th>
                  <th style='width:90px;'>操作</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
        `;
      // 全選功能
      const selectAll = document.getElementById('selectAllCheckbox');
      if (selectAll) {
        selectAll.onclick = function() {
          const checkboxes = tableContainer.querySelectorAll('.row-checkbox');
          checkboxes.forEach(cb => { cb.checked = selectAll.checked; });
        };
      }
    });
}

function showConfirmModal({title, body, onConfirm}) {
  // 移除舊視窗
  document.querySelectorAll('.custom-modal').forEach(m => m.remove());
  const modal = document.createElement('div');
  modal.className = 'custom-modal';
  modal.innerHTML = `
    <div class="custom-modal-content">
      <div class="custom-modal-title" style="color:#1976d2;font-size:1.15em;font-weight:bold;margin-bottom:12px;">${title}</div>
      <div style="margin-bottom:16px;">${body}</div>
      <div style="display:flex;justify-content:center;gap:16px;">
        <button class="custom-modal-btn" style="background:#43a047;color:#fff;padding:8px 32px;border:none;border-radius:6px;font-size:1em;cursor:pointer;" id="modal-confirm-btn">確認</button>
        <button class="custom-modal-btn" style="background:#d32f2f;color:#fff;padding:8px 32px;border:none;border-radius:6px;font-size:1em;cursor:pointer;" id="modal-cancel-btn">取消</button>
      </div>
    </div>
  `;
  Object.assign(modal.style, {
    position: 'fixed',
    top: '0', left: '0', width: '100vw', height: '100vh',
    background: 'rgba(0,0,0,0.28)', zIndex: '9999',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  });
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
  document.getElementById('modal-confirm-btn').onclick = () => {
    modal.remove();
    onConfirm();
  };
  document.getElementById('modal-cancel-btn').onclick = () => {
    modal.remove();
  };
}

function issueRequest(id) {
  const db = firebase.firestore();
  db.collection('requests').doc(id).get().then(doc => {
    const data = doc.data();
    const requestNo = data?.requestNo || '';
    const itemName = data?.item?.name || '';
    const quantity = data?.quantity || 0;
    const itemId = data?.item?.id;
    showConfirmModal({
      title: '確認發放',
      body: `<b>請購單號：</b>${requestNo}<br>` +
            `<b>品名：</b>${itemName}<br>` +
            `<b>數量：</b>${quantity}`,
      onConfirm: function() {
        // 先扣庫存
        if (itemId && quantity > 0) {
          db.collection('items').doc(itemId).get().then(itemDoc => {
            const itemData = itemDoc.data();
            const newQty = (itemData.quantity || 0) - quantity;
            const tempHold = itemData.tempHold || 0;
            const newTempQty = tempHold - quantity;
            db.collection('items').doc(itemId).update({ quantity: newQty, tempQuantity: newTempQty });
          });
        }
        db.collection('requests').doc(id).update({
          status: '已發放',
          processDate: new Date().toISOString().slice(0, 10)
        }).then(() => {
          loadDistributionRequests();
        });
      }
    });
  });
}

function deleteRequest(id) {
  // 取得請購單資料
  const db = firebase.firestore();
  db.collection('requests').doc(id).get().then(doc => {
    const data = doc.data();
    const requestNo = data?.requestNo || '';
    const itemName = data?.item?.name || '';
    const quantity = data?.quantity || '';
    showConfirmModal({
      title: '確認刪除',
      body: `確定要將此請購單標記為已刪除？<br><br>` +
            `<b>請購單號：</b>${requestNo}<br>` +
            `<b>品名：</b>${itemName}<br>` +
            `<b>數量：</b>${quantity}`,
      onConfirm: function() {
        db.collection('requests').doc(id).update({
          status: '已刪除'
        }).then(() => {
          loadDistributionRequests();
        });
      }
    });
  });
}

function logout() {
  localStorage.removeItem('currentUser');
  window.location.href = 'index.html';
}

