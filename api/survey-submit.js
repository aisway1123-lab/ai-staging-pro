// api/survey-submit.js
// 問卷提交：驗證 token → 寫回應 → 建立獎勵優惠碼 → 發確認信

import { createClient } from '@supabase/supabase-js';

const SITE_URL = process.env.SITE_URL || 'https://www.aistaging.pro';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, q1, q2, q3, q4, q5, q6 } = req.body || {};

  if (!token) return res.status(400).json({ error: '缺少 token' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ── 1. 驗證 token ──
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('survey_tokens')
    .select('id, user_id, used, expires_at')
    .eq('token', token)
    .single();

  if (tokenErr || !tokenRow) {
    return res.status(404).json({ error: '無效的問卷連結' });
  }
  if (tokenRow.used) {
    return res.status(409).json({ error: '此問卷已填寫過' });
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return res.status(410).json({ error: '問卷連結已過期' });
  }

  const user_id = tokenRow.user_id;

  // ── 2. 防止重複提交（同一用戶） ──
  const { data: existingReward } = await supabase
    .from('survey_rewards')
    .select('id')
    .eq('user_id', user_id)
    .maybeSingle();

  if (existingReward) {
    return res.status(409).json({ error: '此帳號已填寫過問卷' });
  }

  // ── 3. 寫入 survey_responses ──
  const { error: responseErr } = await supabase
    .from('survey_responses')
    .insert({
      user_id,
      token_id:                tokenRow.id,
      q1_role:                 q1 || null,
      q2_usefulness:           q2 || null,
      q3_quality:              q3 ? parseInt(q3, 10) : null,
      q4_difficulties:         Array.isArray(q4) ? q4 : (q4 ? [q4] : null),
      q5_subscription_barrier: q5 || null,
      q6_feedback:             q6 || null,
    });

  if (responseErr) {
    console.error('[survey-submit] 寫入回應失敗:', responseErr);
    return res.status(500).json({ error: '提交失敗，請稍後再試' });
  }

  // ── 4. 標記 token 已使用 ──
  await supabase
    .from('survey_tokens')
    .update({ used: true })
    .eq('id', tokenRow.id);

  // ── 5. 建立點數包優惠碼（bonus_credits +50，15天有效）──
  const validUntil = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
  // 訂閱獎勵到期時間（15天內訂閱才給）
  const subscriptionBonusExpiresAt = validUntil;

  // 產生唯一碼：SURVEY + user_id 前6碼 + 時間戳後4碼
  const shortId   = user_id.replace(/-/g, '').substring(0, 6).toUpperCase();
  const shortTime = Date.now().toString().slice(-4);
  const promoCode = `SURVEY${shortId}${shortTime}`;

  let packPromoCodeId = null;

  try {
    const { data: newCode, error: codeErr } = await supabase
      .from('promo_codes')
      .insert({
        code:           promoCode,
        type:           'bonus_credits',
        discount_type:  null,
        discount_value: 0,
        credits_amount: 50,
        applicable_to:  'all',
        max_uses:       1,
        per_user_limit: 1,
        valid_from:     new Date().toISOString(),
        valid_until:    validUntil,
        is_active:      true,
        note:           `試用問卷獎勵（user: ${user_id}）`,
        used_count:     0,
      })
      .select('id')
      .single();

    if (codeErr) throw codeErr;
    packPromoCodeId = newCode.id;

    // 存入 profiles.promo_code_id（覆蓋現有值）
    await supabase
      .from('profiles')
      .update({ promo_code_id: packPromoCodeId })
      .eq('id', user_id);

  } catch (e) {
    // 優惠碼建立失敗不阻斷流程，記錄即可
    console.error('[survey-submit] 優惠碼建立失敗:', e.message);
  }

  // ── 6. 寫入 survey_rewards ──
  const { error: rewardErr } = await supabase
    .from('survey_rewards')
    .insert({
      user_id,
      subscription_bonus_sent:       false,
      subscription_bonus_expires_at: subscriptionBonusExpiresAt,
      pack_promo_code_id:            packPromoCodeId,
    });

  if (rewardErr) {
    console.error('[survey-submit] 寫入 survey_rewards 失敗:', rewardErr);
    // 不阻斷，繼續寄信
  }

  // ── 7. 取得用戶 Email 並寄確認信 ──
  try {
    const { data: userData } = await supabase.auth.admin.getUserById(user_id);
    const email = userData?.user?.email;
    if (email) {
      await fetch(`${SITE_URL}/api/send-email`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'survey_reward',
          to:   email,
          data: { validUntil: validUntil.split('T')[0] }
        })
      });
    }
  } catch (e) {
    console.warn('[survey-submit] 確認信寄送失敗:', e.message);
  }

  console.log(`[survey-submit] 完成 user=${user_id}`);
  return res.status(200).json({ success: true });
}
