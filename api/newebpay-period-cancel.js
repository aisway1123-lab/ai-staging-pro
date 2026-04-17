// api/newebpay-period-cancel.js
// 藍新金流 信用卡定期定額 — 取消委託 (NPA-B051 terminate)
// 呼叫藍新 AlterStatus API，將委託狀態改為終止

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const MERCHANT_ID = process.env.NEWEBPAY_MERCHANT_ID;
const HASH_KEY    = process.env.NEWEBPAY_HASH_KEY;
const HASH_IV     = process.env.NEWEBPAY_HASH_IV;
// 正式端點（個人帳號無測試環境）
const ALTER_URL = 'https://core.newebpay.com/MPG/period/AlterStatus';

// AES-256-CBC 加密
function aesEncrypt(data) {
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(HASH_KEY, 'utf8'),
    Buffer.from(HASH_IV,  'utf8')
  );
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

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
  const pad = decrypted[decrypted.length - 1];
  return decrypted.slice(0, decrypted.length - pad).toString('utf8');
}

function buildQuery(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // ── 驗證 Supabase session（必須登入才能取消） ──
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return res.status(401).json({ success: false, error: '請先登入' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 用 token 驗證用戶身份
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return res.status(401).json({ success: false, error: '身份驗證失敗' });
  }

  // ── 從 profiles 取得 period_no ──
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('period_no, role, plan_level, plan_billing')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile) {
    return res.status(400).json({ success: false, error: '找不到用戶資料' });
  }

  if (profile.role !== 'subscriber') {
    return res.status(400).json({ success: false, error: '目前沒有有效的訂閱方案' });
  }

  if (!profile.period_no) {
    return res.status(400).json({ success: false, error: '找不到委託單號，請聯繫客服' });
  }

  // ── 從 orders 取得 order_no ──
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('order_no')
    .eq('user_id', user.id)
    .eq('status', 'paid')
    .eq('order_type', 'subscription')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (orderErr || !order) {
    return res.status(400).json({ success: false, error: '找不到訂單資料，請聯繫客服' });
  }

  // ── 組合 PostData_ 並加密 ──
  const timestamp = Math.floor(Date.now() / 1000);
  const postDataParams = {
    RespondType: 'JSON',
    TimeStamp:   String(timestamp),
    Version:     '1.0',
    MerOrderNo:  order.order_no,
    PeriodNo:    profile.period_no,
    AlterType:   'terminate',
  };

  const postDataStr = buildQuery(postDataParams);
  const postDataEnc = aesEncrypt(postDataStr);

  // ── 呼叫藍新 AlterStatus API ──
  let newebRes;
  try {
    const formBody = new URLSearchParams({
      MerchantID_: MERCHANT_ID,
      PostData_:   postDataEnc,
    });
    newebRes = await fetch(ALTER_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    formBody.toString(),
    });
  } catch (e) {
    console.error('[period-cancel] 呼叫藍新失敗:', e.message);
    return res.status(502).json({ success: false, error: '連線藍新金流失敗，請稍後再試' });
  }

  // ── 解析藍新回傳 ──
  let result;
  try {
    const body = await newebRes.text();
    // 藍新回傳 period= 加密字串（小寫）
    const params = new URLSearchParams(body);
    const periodEnc = params.get('period') || params.get('Period');
    if (!periodEnc) throw new Error('缺少 period 回傳欄位');
    const decrypted = aesDecrypt(periodEnc);
    result = JSON.parse(decrypted);
  } catch (e) {
    console.error('[period-cancel] 解析藍新回傳失敗:', e.message);
    return res.status(502).json({ success: false, error: '解析藍新回傳失敗' });
  }

  console.log('[period-cancel] 藍新回傳:', JSON.stringify(result));

  if (result.Status !== 'SUCCESS') {
    return res.status(400).json({
      success: false,
      error:   `取消失敗：${result.Message || result.Status}`,
    });
  }

  // ── 取消成功：更新 profiles，不刪點數（服務持續至本期結束）──
  await supabase
    .from('profiles')
    .update({
      role:        'free',        // 下次付款週期不再給點
      period_no:   null,
      plan_level:  null,
      plan_billing: null,
    })
    .eq('id', user.id);

  // ── 寫入 orders 取消記錄 ──
  await supabase
    .from('orders')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('order_no', order.order_no);

  return res.status(200).json({
    success: true,
    message: '訂閱已取消，服務將持續至本期結束。',
  });
}
