// api/newebpay-webhook.js
// 接收藍新付款結果通知，自動給點（使用原子 RPC 防止並發問題）

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

    if (Status !== 'SUCCESS') {
      console.log('藍新通知非成功狀態:', Status);
      return res.status(200).send('OK');
    }

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

    // 查詢訂單（只處理 pending 狀態，防止重複給點）
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

    // 更新訂單狀態（先更新，防止 Webhook 重複觸發）
    const { error: updateErr } = await supabase.from('orders').update({
      status:            'paid',
      payment_method:    paymentType,
      newebpay_trade_no: tradeNo,
      paid_at:           new Date().toISOString()
    }).eq('order_no', orderNo).eq('status', 'pending'); // 雙重確認 pending

    if (updateErr) {
      console.error('訂單更新失敗，可能已處理:', orderNo);
      return res.status(200).send('OK');
    }

    // ── 原子加點（防止並發覆蓋）──
    const { data: addResult, error: addErr } = await supabase
      .rpc('add_credits', {
        p_user_id: order.user_id,
        p_amount:  order.credits
      });

    if (addErr) {
      console.error('加點失敗:', addErr);
    } else {
      console.log(`訂單 ${orderNo} 付款成功，加 ${order.credits} 點，剩餘 ${addResult?.new_credits} 點`);
    }

    // 訂閱方案 → 更新角色與方案資訊
    if (order.plan_type.includes('monthly') || order.plan_type.includes('yearly')) {
      const planLevel   = order.plan_type.includes('mini') ? 'mini' : 'standard';
      const planBilling = order.plan_type.includes('monthly') ? 'monthly' : 'yearly';
      const storageDays = planLevel === 'standard' ? 60 : 30;

      await supabase.from('profiles').update({
        role:             'subscriber',
        plan_level:       planLevel,
        plan_billing:     planBilling,
        storage_days:     storageDays,
        plan_started_at:  new Date().toISOString(),
        updated_at:       new Date().toISOString()
      }).eq('id', order.user_id);

      console.log(`方案更新：${order.user_id} → ${planLevel} ${planBilling}，保存 ${storageDays} 天`);
    }

    // ── 推薦獎勵（原子加點）──
    const { data: profile } = await supabase
      .from('profiles')
      .select('referred_by')
      .eq('id', order.user_id)
      .single();

    if (profile?.referred_by) {
      const { data: referrer } = await supabase
        .from('profiles')
        .select('id')
        .eq('referral_code', profile.referred_by)
        .single();

      if (referrer) {
        // 確認未給過推薦獎勵
        const { data: existing } = await supabase
          .from('referral_logs')
          .select('id')
          .eq('referred_id', order.user_id)
          .eq('status', 'rewarded')
          .maybeSingle();

        if (!existing) {
          // 原子加 200 點給推薦人
          await supabase.rpc('add_credits', {
            p_user_id: referrer.id,
            p_amount:  200
          });

          // 記錄推薦獎勵
          await supabase.from('referral_logs').insert({
            referrer_id: referrer.id,
            referred_id: order.user_id,
            status:      'rewarded'
          });

          console.log(`推薦獎勵：給 ${referrer.id} 加 200 點`);
        }
      }
    }

    return res.status(200).send('OK');

  } catch (err) {
    console.error('Webhook 處理錯誤:', err);
    return res.status(200).send('OK');
  }
}
