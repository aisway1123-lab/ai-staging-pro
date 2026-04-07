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
    const { userId, docBase64, docExt, referralCode } = req.body;
    if (!userId || !docBase64 || !docExt) {
      return res.status(400).json({ error: '缺少必要參數' });
    }

    // 用 service role key，可以繞過 RLS
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 上傳名片到 Storage
    const path = `${userId}/broker-cert-${Date.now()}.${docExt}`;
    const fileBuffer = Buffer.from(docBase64, 'base64');

    const { error: uploadErr } = await supabase.storage
      .from('broker-docs')
      .upload(path, fileBuffer, {
        contentType: docExt === 'pdf' ? 'application/pdf' : `image/${docExt}`,
        upsert: true
      });

    if (uploadErr) {
      console.error('Storage upload error:', uploadErr);
      return res.status(500).json({ error: '文件上傳失敗：' + uploadErr.message });
    }

    // 更新 profile（service role 不受 RLS 限制）
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        broker_doc_url: path,
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
