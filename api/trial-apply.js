// api/trial-apply.js
// 兩個功能：
// 1. POST with action='getUploadUrl' → 產生預簽名上傳 URL
// 2. POST with action='confirm' → 確認上傳完成，更新 role + 發 LINE 通知

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { action, userId, docExt, docPath, referralCode } = req.body;

  // ── 步驟一：產生預簽名上傳 URL ──
  if (action === 'getUploadUrl') {
    if (!userId || !docExt) return res.status(400).json({ error: '缺少參數' });

    const path = `${userId}/broker-cert-${Date.now()}.${docExt}`;
    const { data, error } = await supabase.storage
      .from('broker-docs')
      .createSignedUploadUrl(path);

    if (error) return res.status(500).json({ error: '無法產生上傳 URL：' + error.message });

    return res.status(200).json({
      success: true,
      signedUrl: data.signedUrl,
      path: path
    });
  }

  // ── 步驟二：上傳完成，更新 profile ──
  if (action === 'confirm') {
    if (!userId || !docPath) return res.status(400).json({ error: '缺少參數' });

    // 取得申請者 email
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const userEmail = userData?.user?.email || '未知';

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        broker_doc_url: docPath,
        role:           'trial_pending',
        referred_by:    referralCode || null,
        updated_at:     new Date().toISOString()
      })
      .eq('id', userId);

    if (updateErr) return res.status(500).json({ error: '申請提交失敗：' + updateErr.message });

    // ── LINE Messaging API 推播通知 ──
    const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const LINE_UID   = process.env.LINE_USER_ID;
    if (LINE_TOKEN && LINE_UID) {
      try {
        const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LINE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: LINE_UID,
            messages: [{
              type: 'text',
              text: `【AI Staging Pro】新試用申請\n申請者：${userEmail}\n請前往後台審核：\nhttps://www.aistaging.pro/admin.html`
            }]
          })
        });
        const lineData = await lineRes.json();
        console.log('LINE push result:', JSON.stringify(lineData));
      } catch (e) {
        console.warn('LINE 通知失敗:', e);
      }
    }

    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: '無效的 action' });
}
