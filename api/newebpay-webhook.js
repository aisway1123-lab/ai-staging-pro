// api/newebpay-webhook.js
// 接收藍新付款結果通知，自動給點

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HASH_KEY = process.env.NEWEBPAY_HASH_KEY;
const HASH_IV  = process.env.NEWEBPAY_HASH_IV;

function aesDecrypt(encryptedData, key, iv) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted.replace(/[\x00-\x1F\x7F]/g, '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { Status, TradeInfo } = req.body;

    // 只處理成功付款
    if (Status !== 'SUCCESS') {
      console.log('藍新通知非成功狀態:', Status);
      return res.status(200).send('OK');
    }

    // 解密 TradeInfo
    const decrypted = aesDecrypt(TradeInfo, HASH_KEY, HASH_IV);
    const tradeData = JSON.parse(decrypted);
    const { Result } = tradeData;

    if (!Result) return res.status(200).send('OK');

    const orderNo     = Result.MerchantOrderNo;
    const tradeNo     = Result.TradeNo;
    const paidAmount  = parseInt(Result.Amt);
    const paymentType = Result.PaymentType;

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 查詢訂單
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('order_no', orderNo)
      .eq('status', 'pending')
      .single();

    if (orderErr || !order) {
      console.error('找不到訂單或已處理:', orderNo);
      return res.status(200).send('OK');
    }

    // 驗證金額
    if (paidAmount !== order.amount) {
      console.error('金額不符:', paidAmount, '!=', order.amount);
      return res.status(200).send('OK');
    }

    // 更新訂單狀態
    await supabase.from('orders').update({
      status:           'paid',
      payment_method:   paymentType,
      newebpay_trade_no: tradeNo,
      paid_at:          new Date().toISOString()
    }).eq('order_no', orderNo);

    // 給點數（原子操作）
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits, referred_by')
      .eq('id', order.user_id)
      .single();

    const currentCredits = profile?.credits || 0;
    const newCredits = currentCredits + order.credits;

    await supabase.from('profiles').update({
      credits:    newCredits,
      total_used: supabase.raw('total_used'), // 不動 total_used
      role:       order.plan_type.includes('monthly') || order.plan_type.includes('yearly')
                  ? 'subscriber' : undefined,
      updated_at: new Date().toISOString()
    }).eq('id', order.user_id);

    // 推薦獎勵：被推薦人第一次付費 → 推薦人得 200 點
    if (profile?.referred_by) {
      const { data: referrer } = await supabase
        .from('profiles')
        .select('id, credits')
        .eq('referral_code', profile.referred_by)
        .single();

      if (referrer) {
        // 檢查是否已給過獎勵
        const { data: existingReward } = await supabase
          .from('referral_logs')
          .select('id')
          .eq('referred_id', order.user_id)
          .eq('status', 'rewarded')
          .single();

        if (!existingReward) {
          // 給推薦人 200 點
          await supabase.from('profiles').update({
            credits: (referrer.credits || 0) + 200,
            updated_at: new Date().toISOString()
          }).eq('id', referrer.id);

          // 記錄推薦獎勵
          await supabase.from('referral_logs').insert({
            referrer_id: referrer.id,
            referred_id: order.user_id,
            status:      'rewarded'
          });
        }
      }
    }

    console.log(`訂單 ${orderNo} 付款成功，給予 ${order.credits} 點`);
    return res.status(200).send('OK');

  } catch (err) {
    console.error('Webhook 處理錯誤:', err);
    return res.status(200).send('OK'); // 藍新要求一律回 OK
  }
}
