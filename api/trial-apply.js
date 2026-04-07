// api/trial-apply.js
// 處理試用申請：上傳名片 + 更新 profile role
// 使用 service role key 繞過 RLS

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 只接收 userId、docPath、referralCode（不傳檔案內容）
    const { userId, docPath, referralCode } = req.body;
    if (!userId || !docPath) {
      return res.status(400).json({ error: '缺少必要參數' });
    }

    // 用 service role key 繞過 RLS 更新 profile
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        broker_doc_url: docPath,
        role:           'trial_pending',
        referred_by:    referralCode || null,
        updated_at:     new Date().toISOString()
      })
      .eq('id', userId);

    if (updateErr) {
      console.error('Profile update error:', updateErr);
      return res.status(500).json({ error: '申請提交失敗：' + updateErr.message });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('trial-apply error:', err);
    return res.status(500).json({ error: err.message });
  }
}
