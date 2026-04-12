// api/newebpay-webhook.js
// 接收藍新付款結果通知，自動給點
// V7：加點改寫入 credit_logs，不再呼叫 add_credits RPC

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

// 計算訂閱方案下次重置日
function getSubscriptionExpiresAt(billing) {
  const now = new Date();
  if (billing === 'yearly') {
    return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString();
  }
  // monthly：加一個月
  return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();
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
    const { error: updateErr } = await supabase
      .from('orders')
      .update({
        status:            'paid',
        payment_method:    paymentType,
        newebpay_trade_no: tradeNo,
        paid_at:           new Date().toISOString()
      })
      .eq('order_no', orderNo)
      .eq('status', 'pending'); // 雙重確認 pending

    if (updateErr) {
      console.error('訂單更新失敗，可能已處理:', orderNo);
      return res.status(200).send('OK');
    }

    const isSubscription = order.plan_type.includes('monthly') || order.plan_type.includes('yearly');
    const isPack         = order.plan_type.startsWith('credits_');

    // ── 點數包：寫入 credit_logs，type=pack，90天到期 ──
    if (isPack) {
      const packExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

      const { error: logErr } = await supabase
        .from('credit_logs')
        .insert({
          user_id:    order.user_id,
          type:       'pack',
          amount:     order.credits,
          expires_at: packExpiresAt,
          source_id:  orderNo,
          note:       `點數包購買：${order.plan_type}`
        });

      if (logErr) {
        console.error('點數包加點失敗:', logErr);
      } else {
        console.log(`訂單 ${orderNo} 點數包付款成功，加 ${order.credits} 點，到期 ${packExpiresAt}`);
      }
    }

    // ── 訂閱方案：寫入 credit_logs，type=subscription，到期日為下次重置日 ──
    if (isSubscription) {
      const planLevel      = order.plan_type.includes('mini') ? 'mini' : 'standard';
      const planBilling    = order.plan_type.includes('monthly') ? 'monthly' : 'yearly';
      const storageDays    = planLevel === 'standard' ? 60 : 30;
      const subscriptionExpiresAt = getSubscriptionExpiresAt(planBilling);

      // 更新 profiles 方案資訊
      await supabase
        .from('profiles')
        .update({
          role:            'subscriber',
          plan_level:      planLevel,
          plan_billing:    planBilling,
          storage_days:    storageDays,
          plan_started_at: new Date().toISOString(),
          updated_at:      new Date().toISOString()
        })
        .eq('id', order.user_id);

      // 寫入 credit_logs
      const { error: logErr } = await supabase
        .from('credit_logs')
        .insert({
          user_id:    order.user_id,
          type:       'subscription',
          amount:     order.credits,
          expires_at: subscriptionExpiresAt,
          source_id:  orderNo,
          note:       `訂閱方案：${order.plan_type}`
        });

      if (logErr) {
        console.error('訂閱加點失敗:', logErr);
      } else {
        console.log(`訂單 ${orderNo} 訂閱付款成功，加 ${order.credits} 點，重置日 ${subscriptionExpiresAt}`);
      }
    }

    // ── 推薦獎勵：寫入 credit_logs，type=referral，90天到期 ──
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('referred_by')
      .eq('id', order.user_id)
      .single();

    if (userProfile?.referred_by) {
      const { data: referrer } = await supabase
        .from('profiles')
        .select('id')
        .eq('referral_code', userProfile.referred_by)
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
          // 先寫 referral_logs 取得 id
          const { data: referralLog, error: referralLogErr } = await supabase
            .from('referral_logs')
            .insert({
              referrer_id: referrer.id,
              referred_id: order.user_id,
              status:      'rewarded'
            })
            .select('id')
            .single();

          if (!referralLogErr && referralLog) {
            const referralExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

            const { error: logErr } = await supabase
              .from('credit_logs')
              .insert({
                user_id:    referrer.id,
                type:       'referral',
                amount:     200,
                expires_at: referralExpiresAt,
                source_id:  referralLog.id,
                note:       `推薦獎勵（被推薦人：${order.user_id}）`
              });

            if (logErr) {
              console.error('推薦獎勵加點失敗:', logErr);
            } else {
              console.log(`推薦獎勵：給 ${referrer.id} 加 200 點，到期 ${referralExpiresAt}`);
            }
          }
        }
      }
    }

    return res.status(200).send('OK');

  } catch (err) {
    console.error('Webhook 處理錯誤:', err);
    return res.status(200).send('OK');
  }
}
