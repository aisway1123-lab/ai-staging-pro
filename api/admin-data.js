// api/admin-data.js
// 後端 admin 資料查詢，使用 service role key 繞過 RLS

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, adminId } = req.body;
  if (!adminId) return res.status(400).json({ error: '缺少 adminId' });

  // 用 service role key
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 驗證是否為 admin 或 manager
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single();

  if (!profile || !['admin', 'manager'].includes(profile.role)) {
    return res.status(403).json({ error: '無權限' });
  }

  try {
    // ── 核准試用申請 ──
    if (action === 'approveTrial') {
      const { userId, email } = req.body;
      if (!userId || !email) return res.status(400).json({ error: '缺少參數' });

      // 只有 admin 可以核准
      if (profile.role !== 'admin') return res.status(403).json({ error: '只有 admin 可以核准' });

      // 更新 role 和 trial_expires_at
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          role:             'trial',
          trial_expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
          updated_at:       new Date().toISOString()
        })
        .eq('id', userId);

      if (updateErr) return res.status(500).json({ error: '更新失敗：' + updateErr.message });

      // 用 atomic RPC 加 60 點（不直接覆蓋，防止清掉既有點數）
      const { error: creditsErr } = await supabase.rpc('add_credits', {
        p_user_id: userId,
        p_amount:  60
      });

      if (creditsErr) return res.status(500).json({ error: '加點失敗：' + creditsErr.message });

      console.log(`核准試用：${email}，加 60 點，到期 ${new Date(Date.now() + 7*24*60*60*1000).toISOString()}`);
      return res.status(200).json({ success: true });
    }

    // ── 取得統計 ──
    if (action === 'getStats') {
      const { data: profiles } = await supabase.from('profiles').select('role');
      const { count: logCount } = await supabase
        .from('generation_logs')
        .select('*', { count: 'exact', head: true });
      return res.status(200).json({ profiles: profiles || [], logCount: logCount || 0 });
    }

    // ── 取得所有會員 ──
    if (action === 'getMembers') {
      const { data } = await supabase
        .from('profiles')
        .select('id, email, role, credits, total_used, created_at, referral_code, referred_by, trial_expires_at, plan_level, plan_billing, storage_days, plan_started_at')
        .order('created_at', { ascending: false });
      return res.status(200).json({ members: data || [] });
    }

    // ── 取得試用申請 ──
    if (action === 'getPending') {
      const { data } = await supabase
        .from('profiles')
        .select('id, email, role, created_at, broker_doc_url')
        .eq('role', 'trial_pending')
        .order('created_at', { ascending: false });
      return res.status(200).json({ pending: data || [] });
    }

    // ── 取得生成紀錄 ──
    if (action === 'getLogs') {
      const { data } = await supabase
        .from('generation_logs')
        .select('id, user_id, type, style, room_type, credits_used, created_at, profiles(email)')
        .order('created_at', { ascending: false })
        .limit(100);
      return res.status(200).json({ logs: data || [] });
    }

    return res.status(400).json({ error: '無效的 action' });

  } catch (err) {
    console.error('admin-data error:', err);
    return res.status(500).json({ error: err.message });
  }
}
