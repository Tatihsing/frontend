const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
admin.initializeApp();

// Gmail SMTP 設定
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tatihsing.star@gmail.com',
    pass: 'gkdnfweewmoojcng' // 應用程式密碼
  }
});

// Firestore 請購單新增時自動寄信
exports.sendRequestEmail = functions.firestore
  .document('requests/{id}')
  .onCreate((snap, context) => {
    const data = snap.data();
    const mailOptions = {
      from: 'tatihsing.star@gmail.com',
      to: 'toxin0811@gmail.com',
      subject: `新請購單 待審核 通知：${data.item?.name || data.itemName || ''}`,
      text: `申請人：${data.requester?.name || data.name || ''}\n品項：${data.item?.name || data.itemName || ''}\n數量：${data.quantity || ''}\n備註：${data.note || data.remarks || ''}`
    };
    return transporter.sendMail(mailOptions)
      .then(() => console.log('Email sent!'))
      .catch(err => console.error('Email send error:', err));
  });

// 你可以根據需要再加 onUpdate/onDelete 觸發
