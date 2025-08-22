// 請購系統主 JS
// 這裡將串接 Firebase，並根據角色顯示不同功能

// 初始化 Firebase（請填入你的 config）
// firebase.initializeApp({
//   apiKey: "",
//   authDomain: "",
//   projectId: "",
//   ...
// });


// 登入
function login() {
  const account = document.getElementById('account').value;
  const password = document.getElementById('password').value;
  firebase.firestore().collection('users').doc(account).get().then(doc => {
    if (!doc.exists) {
      document.getElementById('login-error').innerText = '帳號不存在';
      return;
    }
    const user = doc.data();
    if (user.password !== password) {
      document.getElementById('login-error').innerText = '密碼錯誤';
      return;
    }
    localStorage.setItem('currentUser', JSON.stringify(user));
    // 根據角色分流跳轉
    if (user.position === 'DISTRIBUTOR') {
      window.location.href = 'distributor.html';
    } else if (user.position === 'EMPLOYEE') {
      window.location.href = 'dashboard.html';
    } else if (user.position === 'ADMIN') {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'dashboard.html';
    }
  });
}

// 登出
function logout() {
  firebase.auth().signOut().then(() => {
    document.getElementById('login-section').style.display = '';
    document.getElementById('role-section').style.display = 'none';
    document.getElementById('main-section').innerHTML = '';
  });
}

// 取得使用者角色（已不分流跳轉，保留查詢可用）
function getUserPosition(uid) {
  firebase.firestore().collection('users').doc(uid).get().then(doc => {
    if (doc.exists) {
      window.currentPosition = doc.data().position;
      // 若有需要可在此根據角色執行其他操作
    } else {
      document.getElementById('main-section').innerHTML = '<p>找不到使用者角色，請聯絡管理員。</p>';
    }
  });
}

// ...existing code...

// 申請人請購單填寫
function renderRequester() {
  document.getElementById('main-section').innerHTML = `
    <div class="req-container">
      <div class="req-header">
        <img src="LOGO.png" alt="大姆指" class="logo-small">
        <h2>請購單</h2>
      </div>
      <form id="reqForm">
        <div class="form-group">
          <label>部門：<span id="userDept"></span></label>
        </div>
        <div class="form-group">
          <label for="reqName">請購人：<span class="required">*</span></label>
          <input type="text" id="reqName" readonly>
        </div>
        <div class="form-group">
          <label for="category">類別：<span class="required">*</span></label>
          <select id="category" required>
            <option value="">請選擇類別</option>
            <option value="生產類">生產類</option>
            <!-- 其他類別選項 -->
          </select>
        </div>
        <div class="form-group">
          <label for="itemSelect">品項：<span class="required">*</span></label>
          <select id="itemSelect" required>
            <option value="">請先選擇類別</option>
          </select>
        </div>
        <div class="form-group">
          <label for="specSelect">規格：<span class="required">*</span></label>
          <select id="specSelect" required>
            <option value="">請先選擇品項</option>
          </select>
        </div>
        <div class="form-group">
          <label>物品說明：<span id="itemDesc"></span></label>
        </div>
        <div class="form-group">
          <label for="quantity">數量：<span class="required">*</span></label>
          <input type="number" id="quantity" required min="1">
        </div>
        <div class="form-group">
          <label>單位：<span id="itemUnit"></span></label>
        </div>
        <div class="form-group">
          <label for="remarks">備註：</label>
          <textarea id="remarks" rows="3"></textarea>
        </div>
        <button type="submit" class="submit-button">送出請購單</button>
      </form>
      <div id="reqMsg"></div>
      
      <div class="req-list">
        <h3>我的待處理請購單</h3>
        <table id="myReqTable">
          <thead>
            <tr>
              <th>請購日期</th>
              <th>請購人</th>
              <th>品項</th>
              <th>規格</th>
              <th>數量</th>
              <th>單位</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody id="myReqList"></tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('reqForm').onsubmit = function(e) {
    e.preventDefault();
    submitRequisition();
  };
}

function submitRequisition() {
  const user = firebase.auth().currentUser;
  if (!user) return;
  const itemName = document.getElementById('itemName').value;
  const quantity = parseInt(document.getElementById('quantity').value);
  const unit = document.getElementById('unit').value;
  const remarks = document.getElementById('remarks').value;
  const reqId = `REQ-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`;
  firebase.firestore().collection('requisitions').doc(reqId).set({
    date: new Date().toISOString(),
    account: user.email,
    itemName,
    quantity,
    unit,
    remarks,
    status: 'pending',
    requester: user.email
  }).then(() => {
    document.getElementById('reqMsg').innerText = '請購單已送出！';
    document.getElementById('reqForm').reset();
  });
}

// 審核人員
function renderManager() {
  document.getElementById('main-section').innerHTML = `<h2>審核人員</h2><div id="pendingList">載入中...</div>`;
  firebase.firestore().collection('requisitions').where('status','==','pending').get().then(snapshot => {
    let html = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      html += `<div><b>${data.itemName}</b> x${data.quantity} (${data.unit})<br>
        申請人：${data.requester}<br>
        <button onclick="approveReq('${doc.id}')">批准</button>
        <button onclick="rejectReq('${doc.id}')">拒絕</button>
      </div><hr>`;
    });
    document.getElementById('pendingList').innerHTML = html || '無待審核請購單';
  });
}

function approveReq(id) {
  firebase.firestore().collection('requisitions').doc(id).update({status:'approved',approveDate:new Date().toISOString()});
  renderManager();
}
function rejectReq(id) {
  firebase.firestore().collection('requisitions').doc(id).update({status:'rejected'});
  renderManager();
}

// 發放人員
function renderIssuer() {
  document.getElementById('main-section').innerHTML = `<h2>發放人員</h2><div id="approvedList">載入中...</div>`;
  firebase.firestore().collection('requisitions').where('status','==','approved').get().then(snapshot => {
    let html = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      html += `<div><b>${data.itemName}</b> x${data.quantity} (${data.unit})<br>
        申請人：${data.requester}<br>
        <button onclick="issueReq('${doc.id}')">發放</button>
      </div><hr>`;
    });
    document.getElementById('approvedList').innerHTML = html || '無待發放請購單';
  });
}

function issueReq(id) {
  const user = firebase.auth().currentUser;
  firebase.firestore().collection('requisitions').doc(id).update({status:'issued',issuer:user.email,issueDate:new Date().toISOString()});
  renderIssuer();
}

// 管理員
function renderAdmin() {
  document.getElementById('main-section').innerHTML = `<h2>管理員</h2><p>帳號管理與系統維護（請至 Firebase Console 操作）</p>`;
}

// 監聽登入狀態
firebase.auth().onAuthStateChanged(function(user) {
  if (user) {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('role-section').style.display = '';
    getUserRole(user.uid);
  } else {
    document.getElementById('login-section').style.display = '';
    document.getElementById('role-section').style.display = 'none';
    document.getElementById('main-section').innerHTML = '';
  }
});
