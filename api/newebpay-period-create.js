// api/newebpay-period-create.js
// 藍新金流 信用卡定期定額 — 建立委託 (NPA-B05)
// 端點：https://core.newebpay.com/MPG/period

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const MERCHANT_ID = process.env.NEWEBPAY_MERCHANT_ID;
const HASH_KEY    = process.env.NEWEBPAY_HASH_KEY;
const HASH_IV     = process.env.NEWEBPAY_HASH_IV;
const SITE_URL    = process.env.SITE_URL;
// 正式端點（個人帳號無測試環境）
const PERIOD_URL = 'https://core.newebpay.com/MPG/period';

// 方案設定
const PLANS = {
  mini_monthly:     { amt: 899,   periodType: 'M', level: 'mini',     billing: 'monthly', credits: 300,   prodDesc: 'AI Staging Pro 迷你方案 月繳' },
  mini_yearly:      { amt: 8990,  periodType: 'Y', level: 'mini',     billing: 'yearly',  credits: 3600,  prodDesc: 'AI Staging Pro 迷你方案 年繳' },
  standard_monthly: { amt: 1980,  periodType: 'M', level: 'standard', billing: 'monthly', credits: 1000,  prodDesc: 'AI Staging Pro 標準方案 月繳' },
  standard_yearly:  { amt: 19800, periodType: 'Y', level: 'standard', billing: 'yearly',  credits: 12000, prodDesc: 'AI Staging Pro 標準方案 年繳' },
};

// AES-256-CBC 加密（與一次付清相同邏輯）
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

// URL 查詢字串組合
function buildQuery(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

// PeriodPoint 計算：
//   月繳 → 當天日期 dd (01~31)
//   年繳 → 當天 MMdd
function calcPeriodPoint(periodType) {
  const now = new Date();
  const mm  = String(now.getMonth() + 1).padStart(2, '0');
  const dd  = String(now.getDate()).padStart(2, '0');
  return periodType === 'Y' ? `${mm}${dd}` : dd;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { planId, userId, userEmail, referralCode } = req.body || {};

  // ── 基本驗證 ──
  if (!planId || !userId || !userEmail) {
    return res.status(400).json({ success: false, error: '缺少必要參數' });
  }
  const plan = PLANS[planId];
  if (!plan) {
    return res.status(400).json({ success: false, error: '無效的方案代碼' });
  }

  // ── 只接受訂閱方案（點數包走 newebpay-create） ──
  if (planId.startsWith('credits_')) {
    return res.status(400).json({ success: false, error: '點數包請使用一次付清流程' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ── 讀取優惠碼（若有，訂閱只支援 bonus_credits）──
  let promoBonusCredits = 0;
  let promoCodeId       = null;

  const { data: subUserProfile } = await supabase
    .from('profiles')
    .select('promo_code_id')
    .eq('id', userId)
    .single();

  if (subUserProfile?.promo_code_id) {
    const now = new Date().toISOString();
    const { data: promo } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('id', subUserProfile.promo_code_id)
      .eq('is_active', true)
      .single();

    if (promo && (!promo.valid_until || promo.valid_until >= now)) {
      const appliesToSub = promo.applicable_to === 'all' || promo.applicable_to === 'subscription_monthly';
      if (appliesToSub && promo.type === 'bonus_credits') {
        promoCodeId       = promo.id;
        promoBonusCredits = promo.credits_amount;
      }
      // discount 類型對訂閱無效，忽略
    } else {
      // 優惠碼過期，自動清除
      await supabase.from('profiles').update({ promo_code_id: null }).eq('id', userId);
    }
  }

  // ── 產生商店訂單編號 ASP + timestamp + 4碼隨機 ──
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const merchantOrderNo = `ASP${Date.now()}${rand}`;

  // ── 寫入 orders 表（pending 狀態），同時儲存 planId / referralCode ──
  const { error: insertErr } = await supabase.from('orders').insert({
    user_id:             userId,
    order_no:            merchantOrderNo,
    amount:              plan.amt,
    plan_type:           planId,
    credits:             plan.credits,
    status:              'pending',
    order_type:          'subscription',
    promo_code_id:       promoCodeId,
    promo_bonus_credits: promoBonusCredits,
  });

  if (insertErr) {
    console.error('[period-create] insert order error:', insertErr);
    return res.status(500).json({ success: false, error: '建立訂單失敗' });
  }

  // ── 組合 PostData_ 明文參數 ──
  const timestamp   = Math.floor(Date.now() / 1000);
  const periodPoint = calcPeriodPoint(plan.periodType);

  const postDataParams = {
    RespondType:     'JSON',
    TimeStamp:       String(timestamp),
    Version:         '1.5',
    LangType:        'zh-Tw',
    MerOrderNo:      merchantOrderNo,
    ProdDesc:        plan.prodDesc,
    PeriodAmt:       String(plan.amt),
    PeriodType:      plan.periodType,
    PeriodPoint:     periodPoint,
    PeriodStartType: '2',              // 立即執行委託金額授權
    PeriodTimes:     '36',             // 36 期（CAU 開通後改為 NE）
    PayerEmail:      userEmail,
    EmailModify:     '0',              // 不允許修改 Email
    PaymentInfo:     'Y',
    OrderInfo:       'N',
    NotifyURL:       `${SITE_URL}/api/newebpay-period-notify`,
    ReturnURL:       `${SITE_URL}/payment-result.html`,
  };

  const postDataStr  = buildQuery(postDataParams);
  const postDataEnc  = aesEncrypt(postDataStr);

  // ── 回傳給前端：讓前端自建隱藏表單 POST 到藍新 ──
  return res.status(200).json({
    success:    true,
    orderNo:    merchantOrderNo,
    periodUrl:  PERIOD_URL,
    formData: {
      MerchantID_: MERCHANT_ID,
      PostData_:   postDataEnc,
    },
  });
}
