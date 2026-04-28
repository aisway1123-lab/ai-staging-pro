// api/newebpay-cau-notify.js
// 藍新金流 卡號更新服務 (CAU) — 卡片狀態 / 效期變更通知
// 技術文件：NDNP-1.0.7 / 4.3.4 回應參數-信用卡更新通知（CAU）
//
// 注意：CAU Notify 直接 POST JSON，無外層 Period 加密欄位
// 回傳格式：{ Message, Result: { MerchantID, MerchantOrderNo,
//   remainingTimes, AuthAmt, NextAuthDate, scheduleDates,
//   PeriodNo, AlterType, cardStatus, newExpiry } }
//
// 觸發時機：
//   cardStatus = ACTIVE    → 持卡人續卡成功，效期延展
//   cardStatus 非 ACTIVE   → 換卡/停卡/遺失重製，系統已自動終止委託

import { createClient } from '@supabase/supabase-js';

const SITE_URL = process.env.SITE_URL || 'https://www.aistaging.pro';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  const body = req.body || {};
  console.log('[cau-notify] raw body:', JSON.stringify(body));

  const { Message, Result } = body;

  if (!Result) {
    console.error('[cau-notify] 缺少 Result 欄位，body:', JSON.stringify(body));
    return res.status(400).send('Missing Result');
  }

  const {
    MerchantOrderNo,
    remainingTimes,
    AuthAmt,
    NextAuthDate,
    scheduleDates,
    PeriodNo,
    AlterType,
    cardStatus,
    newExpiry,
  } = Result;

  console.log('[cau-notify] Message:', Message, '| cardStatus:', cardStatus, '| MerchantOrderNo:', MerchantOrderNo);

  if (!MerchantOrderNo) {
    console.error('[cau-notify] 缺少 MerchantOrderNo');
    return res.status(400).send('Missing MerchantOrderNo');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

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

  if (cardStatus === 'ACTIVE') {
    console.log(`[cau-notify] 續卡成功 user=${user_id} newExpiry=${newExpiry} remainingTimes=${remainingTimes}`);
    const updateData = {
      cau_card_status:    cardStatus,
      cau_updated_at:     new Date().toISOString(),
      subscription_issue: false,
    };
    if (newExpiry) updateData.cau_card_expiry = newExpiry;
    await supabase.from('profiles').update(updateData).eq('id', user_id);
    return res.status(200).send('OK');
  }

  // 非 ACTIVE：停卡/換卡，藍新已自動終止委託
  console.warn(`[cau-notify] 卡片異常 user=${user_id} cardStatus=${cardStatus} AlterType=${AlterType}`);
  await supabase.from('profiles').update({
    cau_card_status:    cardStatus,
    cau_updated_at:     new Date().toISOString(),
    subscription_issue: true,
  }).eq('id', user_id);

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
          data: { planType: plan_type, cardStatus }
        })
      });
      console.log(`[cau-notify] 通知信已寄送：${email}`);
    }
  } catch (e) {
    console.warn('[cau-notify] 通知信寄送失敗:', e.message);
  }

  return res.status(200).send('OK');
}
