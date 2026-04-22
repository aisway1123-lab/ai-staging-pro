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
  const pad = decrypted[decrypted.length - 1];
  return decrypted.slice(0, decrypted.length - pad).toString('utf8');
}

// 計算訂閱點數到期日
function calcExpiresAt(billing) {
  const now = new Date();
  if (billing === 'yearly') {
    return new Date(now.getFullYear(), 11, 31, 23, 59, 59).toISOString();
  }
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

  if (Status !== 'SUCCESS') {
    console.warn('[period-notify] 授權失敗:', Status, Result);
    return res.status(200).send('OK');
  }

  const {
    MerchantOrderNo,
    PeriodNo,
    AlreadyTimes,
    AuthAmt,
    AuthDate,
  } = Result;

  if (!MerchantOrderNo || !PeriodNo) {
    console.error('[period-notify] 缺少關鍵欄位');
    return res.status(400).send('Missing fields');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ── 查詢訂單 ──
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('user_id, plan_type, status, promo_code_id, promo_bonus_credits')
    .eq('order_no', MerchantOrderNo)
    .single();

  if (orderErr || !order) {
    console.error('[period-notify] 找不到訂單:', MerchantOrderNo, orderErr);
    return res.status(400).send('Order not found');
  }

  const { user_id } = order;
  const planType     = order.plan_type || '';
  const plan_level   = planType.startsWith('standard') ? 'standard' : 'mini';
  const plan_billing = planType.endsWith('yearly') ? 'yearly' : 'monthly';
  const alreadyTimes = parseInt(AlreadyTimes, 10) || 1;

  // ── 冪等保護 ──
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

  // ── 同步 profiles.credits 快取 ──
  const { data: creditData } = await supabase
    .rpc('get_available_credits', { p_user_id: user_id });
  const newCredits = creditData ?? 0;

  const profileUpdate = {
    credits:      newCredits,
    role:         'subscriber',
    plan_level:   plan_level,
    plan_billing: plan_billing,
    period_no:    PeriodNo,
  };
  if (alreadyTimes === 1) {
    profileUpdate.plan_started_at = new Date().toISOString();
  }

  await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('id', user_id);

  // ── 首期：更新 orders 狀態為 paid ──
  if (alreadyTimes === 1 || order.status === 'pending') {
    await supabase
      .from('orders')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('order_no', MerchantOrderNo);

    // ── 首期：優惠碼加送點數（bonus_credits）──
    if (order.promo_bonus_credits > 0 && order.promo_code_id) {
      try {
        const bonusExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        await supabase.from('credit_logs').insert({
          user_id:    user_id,
          type:       'coupon',
          amount:     order.promo_bonus_credits,
          expires_at: bonusExpiresAt,
          source_id:  order.promo_code_id,
          note:       `優惠碼加送點數（訂單：${MerchantOrderNo}）`,
        });

        const { data: promoData } = await supabase
          .from('promo_codes')
          .select('used_count')
          .eq('id', order.promo_code_id)
          .single();

        await supabase.from('promo_code_uses').insert({
          promo_code_id: order.promo_code_id,
          user_id:       user_id,
          order_no:      MerchantOrderNo,
        });

        await supabase.from('promo_codes')
          .update({ used_count: (promoData?.used_count || 0) + 1 })
          .eq('id', order.promo_code_id);

        // 清除 profiles.promo_code_id（問卷碼已使用完畢）
        await supabase.from('profiles')
          .update({ promo_code_id: null })
          .eq('id', user_id);

        console.log(`[period-notify] 優惠碼加送：${user_id} +${order.promo_bonus_credits} 點`);
      } catch (e) {
        console.error('[period-notify] 優惠碼加送失敗:', e.message);
      }
    }
  }

  // ── 首期：寄送訂閱成功通知信 ──
  if (alreadyTimes === 1) {
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(user_id);
      const email = userData?.user?.email;
      if (email) {
        const SITE_URL = process.env.SITE_URL || 'https://www.aistaging.pro';
        const planNameMap = {
          mini_monthly:     '迷你方案 月繳',
          mini_yearly:      '迷你方案 年繳',
          standard_monthly: '標準方案 月繳',
          standard_yearly:  '標準方案 年繳',
        };
        await fetch(`${SITE_URL}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'subscription_activated',
            to:   email,
            data: {
              planName: planNameMap[planType] || planType,
              credits:  creditsToAdd,
            }
          })
        });
      }
    } catch (e) {
      console.warn('[period-notify] 訂閱成功信寄送失敗:', e.message);
    }
  }

  // ── 首期：查 survey_rewards，符合資格則給 +100 點 ──
  if (alreadyTimes === 1) {
    try {
      const { data: reward } = await supabase
        .from('survey_rewards')
        .select('id, subscription_bonus_sent, subscription_bonus_expires_at')
        .eq('user_id', user_id)
        .maybeSingle();

      if (
        reward &&
        !reward.subscription_bonus_sent &&
        reward.subscription_bonus_expires_at &&
        new Date(reward.subscription_bonus_expires_at) > new Date() &&
        planType === 'mini_monthly'
      ) {
        const bonusExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        const { error: bonusErr } = await supabase
          .from('credit_logs')
          .insert({
            user_id:    user_id,
            type:       'survey_reward',
            amount:     100,
            expires_at: bonusExpiresAt,
            source_id:  reward.id,
            note:       '試用問卷獎勵：訂閱迷你月付贈點',
          });

        if (!bonusErr) {
          await supabase
            .from('survey_rewards')
            .update({ subscription_bonus_sent: true })
            .eq('id', reward.id);

          // 同步 profiles.credits 快取
          const { data: updatedCredits } = await supabase
            .rpc('get_available_credits', { p_user_id: user_id });
          await supabase
            .from('profiles')
            .update({ credits: updatedCredits ?? 0 })
            .eq('id', user_id);

          console.log(`[period-notify] 問卷獎勵贈點完成：${user_id} +100 點`);
        } else {
          console.error('[period-notify] 問卷獎勵贈點失敗:', bonusErr.message);
        }
      }
    } catch (e) {
      console.warn('[period-notify] 問卷獎勵處理失敗:', e.message);
    }
  }

  console.log(`[period-notify] 完成 user=${user_id} credits+${creditsToAdd} period=${alreadyTimes}`);
  return res.status(200).send('OK');
}
