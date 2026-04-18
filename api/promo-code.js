// api/promo-code.js
// 優惠碼驗證與兌換
// action: validate — 驗證優惠碼是否有效
// action: redeem   — 兌換優惠碼，instant_credits 立即給點，其他存入 profiles

import { createClient } from '@supabase/supabase-js';

const SITE_URL = process.env.SITE_URL || 'https://www.aistaging.pro';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, code, userId } = req.body || {};
  if (!action || !code || !userId) {
    return res.status(400).json({ success: false, error: '缺少必要參數' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ── 驗證優惠碼 ──
  const normalizedCode = code.trim().toUpperCase();
  const now = new Date().toISOString();

  const { data: promo, error: promoErr } = await supabase
    .from('promo_codes')
    .select('*')
    .eq('code', normalizedCode)
    .eq('is_active', true)
    .single();

  if (promoErr || !promo) {
    return res.status(400).json({ success: false, error: '優惠碼無效或不存在' });
  }

  // 檢查期限
  if (promo.valid_until && promo.valid_until < now) {
    return res.status(400).json({ success: false, error: '優惠碼已過期' });
  }
  if (promo.valid_from && promo.valid_from > now) {
    return res.status(400).json({ success: false, error: '優惠碼尚未開始' });
  }

  // 檢查總使用次數
  if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
    return res.status(400).json({ success: false, error: '優惠碼已達使用上限' });
  }

  // 檢查每人限用次數
  const { count: userUseCount } = await supabase
    .from('promo_code_uses')
    .select('*', { count: 'exact', head: true })
    .eq('promo_code_id', promo.id)
    .eq('user_id', userId);

  if (userUseCount >= (promo.per_user_limit || 1)) {
    return res.status(400).json({ success: false, error: '您已使用過此優惠碼' });
  }

  // ── validate：只驗證，不兌換 ──
  if (action === 'validate') {
    return res.status(200).json({
      success:  true,
      promo: {
        code:           promo.code,
        type:           promo.type,
        discount_type:  promo.discount_type,
        discount_value: promo.discount_value,
        credits_amount: promo.credits_amount,
        applicable_to:  promo.applicable_to,
        note:           promo.note,
      }
    });
  }

  // ── redeem：兌換優惠碼 ──
  if (action === 'redeem') {

    // 檢查是否已有待使用的優惠碼，提示覆蓋
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('promo_code_id')
      .eq('id', userId)
      .single();

    // 若有舊碼且不是本次兌換的碼，前端已確認覆蓋，直接繼續

    // instant_credits：立即給點
    if (promo.type === 'instant_credits') {
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

      const { error: logErr } = await supabase
        .from('credit_logs')
        .insert({
          user_id:    userId,
          type:       'coupon',
          amount:     promo.credits_amount,
          expires_at: expiresAt,
          source_id:  promo.id,
          note:       `優惠碼兌換：${promo.code}`,
        });

      if (logErr) {
        console.error('[promo-code] 寫入 credit_logs 失敗:', logErr);
        return res.status(500).json({ success: false, error: '兌換失敗，請稍後再試' });
      }

      // 同步 profiles.credits 快取
      const { data: newCredits } = await supabase
        .rpc('get_available_credits', { p_user_id: userId });
      await supabase
        .from('profiles')
        .update({ credits: newCredits ?? 0 })
        .eq('id', userId);

      // 寫入使用紀錄
      await supabase.from('promo_code_uses').insert({
        promo_code_id: promo.id,
        user_id:       userId,
        order_no:      null,
      });

      // 更新 used_count
      await supabase
        .from('promo_codes')
        .update({ used_count: promo.used_count + 1 })
        .eq('id', promo.id);

      return res.status(200).json({
        success:        true,
        type:           'instant_credits',
        credits_amount: promo.credits_amount,
        message:        `兌換成功！已獲得 ${promo.credits_amount} 點，90 天內有效。`,
      });
    }

    // bonus_credits / discount：存入 profiles.promo_code_id 等待付款時套用
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ promo_code_id: promo.id })
      .eq('id', userId);

    if (updateErr) {
      console.error('[promo-code] 更新 profiles 失敗:', updateErr);
      return res.status(500).json({ success: false, error: '兌換失敗，請稍後再試' });
    }

    const typeMsg = promo.type === 'bonus_credits'
      ? `付款後加送 ${promo.credits_amount} 點`
      : promo.discount_type === 'percent'
        ? `${promo.discount_value}% 折扣`
        : `折抵 NT$${promo.discount_value}`;

    return res.status(200).json({
      success:  true,
      type:     promo.type,
      message:  `優惠碼已套用：${typeMsg}，於下次付款時自動生效。`,
      promo: {
        code:           promo.code,
        type:           promo.type,
        discount_type:  promo.discount_type,
        discount_value: promo.discount_value,
        credits_amount: promo.credits_amount,
        applicable_to:  promo.applicable_to,
      }
    });
  }

  return res.status(400).json({ success: false, error: '無效的 action' });
}
