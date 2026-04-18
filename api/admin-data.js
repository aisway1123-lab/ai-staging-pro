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
    // ── 調整點數（V7：寫入 credit_logs，type=promo，永不到期）──
    if (action === 'updateCredits') {
      const { userId, adjustAmount, note } = req.body;
      if (!userId || adjustAmount === undefined) return res.status(400).json({ error: '缺少參數' });
      if (profile.role !== 'admin') return res.status(403).json({ error: '只有 admin 可以調整點數' });
      if (adjustAmount === 0) return res.status(400).json({ error: '調整量不能為 0' });

      const { error: logErr } = await supabase
        .from('credit_logs')
        .insert({
          user_id:    userId,
          type:       'promo',
          amount:     adjustAmount,
          expires_at: null,
          note:       note || `後台手動調整（admin: ${adminId}）`
        });

      if (logErr) return res.status(500).json({ error: '調整失敗：' + logErr.message });

      // 同步更新 profiles.credits 快取
      const { data: newCredits } = await supabase
        .rpc('get_available_credits', { p_user_id: userId });
      await supabase
        .from('profiles')
        .update({ credits: newCredits ?? 0, updated_at: new Date().toISOString() })
        .eq('id', userId);

      return res.status(200).json({ success: true });
    }

    // ── 改角色 ──
    if (action === 'updateRole') {
      const { userId, newRole } = req.body;
      const validRoles = ['free','trial','subscriber','manager','admin'];
      if (!userId || !newRole) return res.status(400).json({ error: '缺少參數' });
      if (!validRoles.includes(newRole)) return res.status(400).json({ error: '無效的角色' });
      if (profile.role !== 'admin') return res.status(403).json({ error: '只有 admin 可以改角色' });
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (updateErr) return res.status(500).json({ error: '更新失敗：' + updateErr.message });
      return res.status(200).json({ success: true });
    }

    // ── 拒絕試用申請 ──
    if (action === 'rejectTrial') {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: '缺少參數' });
      if (profile.role !== 'admin') return res.status(403).json({ error: '只有 admin 可以拒絕' });
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ role: 'free', updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (updateErr) return res.status(500).json({ error: '操作失敗：' + updateErr.message });

      // 寄送拒絕通知信
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(userId);
        const email = userData?.user?.email;
        if (email) {
          const SITE_URL = process.env.SITE_URL || 'https://www.aistaging.pro';
          await fetch(`${SITE_URL}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'trial_rejected', to: email })
          });
        }
      } catch (e) {
        console.warn('拒絕通知信寄送失敗:', e.message);
      }

      return res.status(200).json({ success: true });
    }

    // ── 核准試用申請（V7：寫入 credit_logs，type=trial，7天到期）──
    if (action === 'approveTrial') {
      const { userId, email } = req.body;
      if (!userId || !email) return res.status(400).json({ error: '缺少參數' });
      if (profile.role !== 'admin') return res.status(403).json({ error: '只有 admin 可以核准' });

      const trialExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      // 更新 role（trial_expires_at 已不再使用，點數到期由 credit_logs 管理）
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          role:       'trial',
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateErr) return res.status(500).json({ error: '更新失敗：' + updateErr.message });

      // V7：寫入 credit_logs trial 類型紀錄（冪等保護：避免重複核准產生重複點數）
      const { data: existingLog } = await supabase
        .from('credit_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'trial')
        .maybeSingle();

      if (!existingLog) {
        const { error: logErr } = await supabase
          .from('credit_logs')
          .insert({
            user_id:    userId,
            type:       'trial',
            amount:     60,
            expires_at: trialExpiresAt,
            note:       `試用核准（admin: ${adminId}）`
          });

        if (logErr) return res.status(500).json({ error: '加點失敗：' + logErr.message });
      }

      // 同步更新 profiles.credits 快取
      const { data: newCredits } = await supabase
        .rpc('get_available_credits', { p_user_id: userId });
      await supabase
        .from('profiles')
        .update({ credits: newCredits ?? 0, updated_at: new Date().toISOString() })
        .eq('id', userId);

      console.log(`核准試用：${email}，加 60 點，到期 ${trialExpiresAt}`);
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

    // ── 取得所有會員（V7：credits 改用 get_available_credits 即時計算）──
    if (action === 'getMembers') {
      const { data: members } = await supabase
        .from('profiles')
        .select('id, email, role, total_used, created_at, referral_code, referred_by, trial_expires_at, plan_level, plan_billing, storage_days, plan_started_at')
        .order('created_at', { ascending: false });

      if (!members || members.length === 0) return res.status(200).json({ members: [] });

      // 逐一取得有效點數（用戶數少時可接受，日後可改 batch 查詢）
      const membersWithCredits = await Promise.all(
        members.map(async (m) => {
          const { data: creditsData } = await supabase
            .rpc('get_available_credits', { p_user_id: m.id });
          return { ...m, credits: creditsData ?? 0 };
        })
      );

      return res.status(200).json({ members: membersWithCredits });
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
      const { data: logs } = await supabase
        .from('generation_logs')
        .select('id, user_id, type, style, room_type, credits_used, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!logs || logs.length === 0) return res.status(200).json({ logs: [] });

      const userIds = [...new Set(logs.map(l => l.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds);

      const emailMap = {};
      (profiles || []).forEach(p => { emailMap[p.id] = p.email; });

      const logsWithEmail = logs.map(l => ({
        ...l,
        profiles: { email: emailMap[l.user_id] || null }
      }));

      return res.status(200).json({ logs: logsWithEmail });
    }

    // ── 取得最近訂單（含 email，供 ops.html 使用）──
    if (action === 'getRecentOrders') {
      const [paidRes, pendingRes] = await Promise.all([
        supabase.from('orders').select('order_no, user_id, plan_type, amount, status, created_at, paid_at')
          .eq('status', 'paid').order('paid_at', { ascending: false }).limit(10),
        supabase.from('orders').select('order_no, user_id, plan_type, amount, status, created_at, paid_at')
          .eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
      ]);

      const orders = [...(paidRes.data || []), ...(pendingRes.data || [])];
      const userIds = [...new Set(orders.map(o => o.user_id))];

      const { data: profiles } = await supabase.from('profiles').select('id, email').in('id', userIds);
      const emailMap = {};
      (profiles || []).forEach(p => { emailMap[p.id] = p.email; });

      const ordersWithEmail = orders.map(o => ({ ...o, email: emailMap[o.user_id] || null }));
      return res.status(200).json({ orders: ordersWithEmail });
    }

    // ── 訂單搜尋（用訂單號或 email，供 ops.html 使用）──
    if (action === 'searchOrder') {
      const { query } = req.body;
      if (!query) return res.status(400).json({ error: '缺少查詢參數' });

      if (query.includes('@')) {
        // 用 email 查
        const { data: p } = await supabase.from('profiles')
          .select('id, email, role, credits').eq('email', query).single();
        if (!p) return res.status(200).json({ message: '找不到此 Email 的用戶。' });

        const { data: orders } = await supabase.from('orders')
          .select('*').eq('user_id', p.id).order('created_at', { ascending: false }).limit(5);
        return res.status(200).json({ type: 'email', profile: p, orders: orders || [] });
      } else {
        // 用訂單號查
        const { data: o } = await supabase.from('orders').select('*').eq('order_no', query).single();
        if (!o) return res.status(200).json({ message: '找不到此訂單號，請確認是否完整。' });

        const { data: p } = await supabase.from('profiles')
          .select('email, role, credits').eq('id', o.user_id).single();
        return res.status(200).json({ type: 'order', order: o, profile: p });
      }
    }

    return res.status(400).json({ error: '無效的 action' });

  } catch (err) {
    console.error('admin-data error:', err);
    return res.status(500).json({ error: err.message });
  }
}
