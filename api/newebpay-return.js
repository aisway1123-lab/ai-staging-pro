// api/newebpay-return.js
// 接收藍新金流 ReturnURL 的 POST 跳轉
// 藍新付款完成後以 POST 方式呼叫此 API，再 redirect 到 payment-result.html
// 注意：點數邏輯不在這裡處理，由 newebpay-webhook.js 的 NotifyURL 負責

export default async function handler(req, res) {
  // 只接受 POST（藍新 ReturnURL 固定用 POST）
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // 藍新 POST body 包含 Status 和 TradeInfo（加密）
  // 這裡不解密，只做 redirect，點數處理交給 newebpay-webhook.js
  // 直接 redirect 到 payment-result.html，讓前台輪詢訂單狀態
  return res.redirect(302, '/payment-result.html');
}
