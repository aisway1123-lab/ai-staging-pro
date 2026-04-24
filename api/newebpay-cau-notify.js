// api/newebpay-cau-notify.js
// 藍新金流 卡號更新服務 (CAU) — 卡片狀態 / 效期變更通知
// 觸發時機：
//   1. 信用卡到期續卡（效期延展，卡號不變）→ cardStatus=ACTIVE, newExpiry 有值
//   2. 換卡 / 遺失重製 / 停卡 → cardStatus 非 ACTIVE

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HASH_KEY = process.env.NEWEBPAY_HASH_KEY;
const HASH_IV  = process.env.NEWEBPAY_HASH_IV;
const SITE_URL = process.env.SITE_URL || 'https://www.aistaging.pro';

// AES-256-CBC 解密（與 period-notify 相同邏輯）
function aesDecrypt(encryptedHex) {
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(HASH_KEY, 'utf8'),
    Buffer.from(HASH_IV,  'utf8')
  );
  decipher.setAutoPadding(false);
  let decrypted = decipher.update(Buffer.from(encryptedHex, 'hex'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  const pad = decrypted[decrypted.length - 1];
  return decrypted.slice(0, decrypted.length - pad).toString('utf8');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  // 藍新 CAU Notify 的加密欄位名稱待確認，先嘗試 Period / Period_ / CauData 三種
  const rawData = req.body?.Period || req.body?.Period_ || req.body?.CauData;

  if (!rawData) {
    console.error('[cau-notify] 缺少加密欄位，body:', JSON.stringify(req.body));
    return res.status(400).send('Missing data');
  }

  // ── 解密 ──
  let payload;
  try {
    const raw = aesDecrypt(rawData);
    payload = JSON.parse(raw);
  } catch (e) {
    console.error('[cau-notify] 解密失敗:', e.message);
    return res.status(400).send('Decrypt failed');
  }

  console.log('[cau-notify] payload:', JSON.stringify(payload));

  // CAU 回傳欄位（依手冊）
  const {
    MerchantOrderNo, // 商店訂單編號（對應 orders.order_no）
    PeriodNo,        // 藍新定期定額委託單號
    cardStatus,      // ACTIVE / CARD_NOT_ALLOWED / 其他
    newExpiry,       // 最新到期日 YYYY-MM（僅變更時回傳）
    remainingTimes,  // 依新到期日重算的剩餘期數（定期定額專用）
    scheduleDates,   // 依新到期日重算的扣款日期（定期定額專用）
  } = payload?.Result || payload || {};

  if (!MerchantOrderNo) {
    console.error('[cau-notify] 缺少 MerchantOrderNo');
    return res.status(400).send('Missing MerchantOrderNo');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ── 查詢訂單取得 user_id ──
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('user_id, plan_type, status')
    .eq('order_no', MerchantOrderNo)
    .single();

  if (orderErr || !order) {
    console.error('[cau-notify] 找不到訂單:', MerchantOrderNo, orderErr);
    return res.status(400).send('Order not found');
  }

  const { user_id, plan_type } = order;

  // ── 情況一：cardStatus ACTIVE（效期延展，自動續卡成功）──
  if (cardStatus === 'ACTIVE') {
    console.log(`[cau-notify] 效期延展成功 user=${user_id} newExpiry=${newExpiry}`);

    // 記錄到 profiles（備查用，不影響點數）
    const updateData = { cau_updated_at: new Date().toISOString() };
    if (newExpiry) updateData.cau_card_expiry = newExpiry;

    await supabase.from('profiles').update(updateData).eq('id', user_id);

    return res.status(200).send('OK');
  }

  // ── 情況二：cardStatus 非 ACTIVE（換卡 / 停卡 / 遺失重製）──
  console.warn(`[cau-notify] 卡片異常 user=${user_id} cardStatus=${cardStatus}`);

  // 標記訂閱異常
  await supabase.from('profiles').update({
    cau_card_status:    cardStatus,
    cau_updated_at:     new Date().toISOString(),
    subscription_issue: true,
  }).eq('id', user_id);

  // 寄通知信給用戶
  try {
    const { data: userData } = await supabase.auth.admin.getUserById(user_id);
    const email = userData?.user?.email;
    if (email) {
      await fetch(`${SITE_URL}/api/send-email`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type: 'subscription_card_issue',
          to:   email,
          data: {
            planType:   plan_type,
            cardStatus: cardStatus,
          }
        })
      });
    }
  } catch (e) {
    console.warn('[cau-notify] 通知信寄送失敗:', e.message);
  }

  return res.status(200).send('OK');
}
