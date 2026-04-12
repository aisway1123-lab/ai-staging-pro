// api/deduct-credits.js
// 前台扣點的後端端點，呼叫 deduct_credits_v2 RPC
// V7：取代前台直接呼叫 Supabase deduct_credits RPC

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, cost, generationLogId } = req.body;
  if (!userId || !cost) return res.status(400).json({ error: '缺少參數' });

  // 用 service role key，讓後端有權限呼叫 deduct_credits_v2
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 驗證用戶存在且有資格扣點（非 free / trial_pending）
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, trial_expires_at')
    .eq('id', userId)
    .single();

  if (!profile) return res.status(403).json({ error: '找不到用戶' });

  // admin 不扣點
  if (profile.role === 'admin') {
    return res.status(200).json({ success: true, remaining: null });
  }

  // 試用已到期則擋住
  if (profile.role === 'trial' && profile.trial_expires_at) {
    if (new Date(profile.trial_expires_at) < new Date()) {
      return res.status(403).json({ error: '試用期已到期' });
    }
  }

  // 呼叫 deduct_credits_v2，依消耗順序從 credit_logs 扣點
  const { data: result, error } = await supabase.rpc('deduct_credits_v2', {
    p_user_id:           userId,
    p_amount:            cost,
    p_generation_log_id: generationLogId || null
  });

  if (error) {
    console.error('deduct_credits_v2 error:', error);
    return res.status(500).json({ error: '扣點失敗：' + error.message });
  }

  if (!result?.success) {
    return res.status(400).json({ error: result?.error || '點數不足', available: result?.available });
  }

  return res.status(200).json({
    success:   true,
    remaining: result.remaining_credits
  });
}
