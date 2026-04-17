// api/newebpay-period-notify.js
// 藍新金流 信用卡定期定額 — 每期授權完成通知 (NPA-N050)
// 藍新每期扣款後 POST 加密字串 Period= 到此 URL

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HASH_KEY = process.env.NEWEBPAY_HASH_KEY;
const HASH_IV  = process.env.NEWEBPAY_HASH_IV;

// AES-256-CBC 解密
function aesDecrypt(encryptedHex) {
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(HASH_KEY, 'utf8'),
    Buffer.from(HASH_IV,  'utf8')
  );
  decipher.setAutoPadding(false);
  let decrypted = decipher.update(Buffer.from(encryptedHex, 'hex'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  // 去除 PKCS7 padding
  const pad = decrypted[decrypted.length - 1];
  return decrypted.slice(0, decrypted.length - pad).toString('utf8');
}

// 計算訂閱點數到期日
// 月繳：到當月最後一天；年繳：到當年最後一天
function calcExpiresAt(billing) {
  const now = new Date();
  if (billing === 'yearly') {
    return new Date(now.getFullYear(), 11, 31, 23, 59, 59).toISOString();
  }
  // 月繳：取下個月第 0 天 = 本月最後一天
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  const { Period } = req.body || {};
  if (!Period) {
    console.error('[period-notify] 缺少 Period 欄位');
    return res.status(400).send('Missing Period');
  }

  // ── 解密 ──
  let payload;
  try {
    const raw = aesDecrypt(Period);
    payload = JSON.parse(raw);
  } catch (e) {
    console.error('[period-notify] 解密失敗:', e.message);
    return res.status(400).send('Decrypt failed');
  }

  console.log('[period-notify] payload:', JSON.stringify(payload));

  const { Status, Result } = payload;

  // 授權失敗：記錄但不寫 credit_logs
  if (Status !== 'SUCCESS') {
    console.warn('[period-notify] 授權失敗:', Status, Result);
    // 仍回傳 200，避免藍新重複通知
    return res.status(200).send('OK');
  }

  const {
    MerchantOrderNo,  // 商店訂單編號
    PeriodNo,         // 委託單號（藍新產生）
    AlreadyTimes,     // 已授權期數（含本次）
    AuthAmt,          // 本期授權金額
    AuthDate,         // 授權時間
  } = Result;

  if (!MerchantOrderNo || !PeriodNo) {
    console.error('[period-notify] 缺少關鍵欄位');
    return res.status(400).send('Missing fields');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ── 查詢訂單取得 user_id / plan_type ──
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('user_id, plan_type, status')
    .eq('order_no', MerchantOrderNo)
    .single();

  if (orderErr || !order) {
    console.error('[period-notify] 找不到訂單:', MerchantOrderNo, orderErr);
    return res.status(400).send('Order not found');
  }

  const { user_id } = order;
  // plan_type 例如 mini_monthly / standard_yearly
  const planType   = order.plan_type || '';
  const plan_level   = planType.startsWith('standard') ? 'standard' : 'mini';
  const plan_billing = planType.endsWith('yearly') ? 'yearly' : 'monthly';
  const alreadyTimes = parseInt(AlreadyTimes, 10) || 1;

  // ── 冪等保護：用 PeriodNo + AlreadyTimes 防止重複寫入 ──
  const idempotencyKey = `${PeriodNo}_${alreadyTimes}`;
  const { data: existing } = await supabase
    .from('credit_logs')
    .select('id')
    .eq('source_id', idempotencyKey)
    .eq('type', 'subscription')
    .maybeSingle();

  if (existing) {
    console.log('[period-notify] 重複通知，略過:', idempotencyKey);
    return res.status(200).send('OK');
  }

  // ── 計算本期點數與到期日 ──
  const creditsMap = {
    mini_monthly:     300,
    mini_yearly:      3600,
    standard_monthly: 1000,
    standard_yearly:  12000,
  };
  const creditsToAdd = creditsMap[planType] || 0;
  const expiresAt    = calcExpiresAt(plan_billing);

  // ── 寫入 credit_logs ──
  const { error: logErr } = await supabase.from('credit_logs').insert({
    user_id:    user_id,
    type:       'subscription',
    amount:     creditsToAdd,
    expires_at: expiresAt,
    source_id:  idempotencyKey,
    note:       `定期定額授權第 ${alreadyTimes} 期 / ${plan_level} ${plan_billing}`,
  });

  if (logErr) {
    console.error('[period-notify] 寫入 credit_logs 失敗:', logErr);
    return res.status(500).send('DB error');
  }

  // ── 同步 profiles.credits 快取（與 newebpay-webhook.js 邏輯一致）──
  const { data: creditData } = await supabase
    .rpc('get_available_credits', { p_user_id: user_id });
  const newCredits = creditData ?? 0;

  await supabase
    .from('profiles')
    .update({
      credits:          newCredits,
      role:             'subscriber',
      plan_level:       plan_level,
      plan_billing:     plan_billing,
      plan_started_at:  alreadyTimes === 1 ? new Date().toISOString() : undefined,
      period_no:        PeriodNo,   // 儲存委託單號供取消用
    })
    .eq('id', user_id);

  // ── 首期：更新 orders 狀態為 paid ──
  if (alreadyTimes === 1 || order.status === 'pending') {
    await supabase
      .from('orders')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('order_no', MerchantOrderNo);
  }

  console.log(`[period-notify] 完成 user=${user_id} credits+${creditsToAdd} period=${alreadyTimes}`);
  return res.status(200).send('OK');
}
