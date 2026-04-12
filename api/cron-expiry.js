// api/cron-expiry.js
// 每日自動執行點數到期清算
// 由 Vercel Cron Job 觸發（每天 UTC 00:00，台灣時間 08:00）
// 安全驗證：Vercel 呼叫時會帶 Authorization: Bearer {CRON_SECRET}

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 只接受 GET（Vercel Cron 使用 GET）
  if (req.method !== 'GET') return res.status(405).end();

  // 驗證 CRON_SECRET，防止外部直接呼叫
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn('cron-expiry: 未授權呼叫');
    return res.status(401).json({ error: '未授權' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // 執行點數到期清算
    const { data: expiryResult, error: expiryErr } = await supabase
      .rpc('run_daily_expiry');

    if (expiryErr) {
      console.error('run_daily_expiry 失敗:', expiryErr);
      return res.status(500).json({ error: expiryErr.message });
    }

    console.log('點數到期清算完成:', expiryResult);

    // TODO：到期前 7 天提醒 Email（V7 後續實作）
    // 目前只做清算，提醒 Email 待 send-email.js 新增 trial_expiring 觸發邏輯後一起接上

    return res.status(200).json({
      success: true,
      result:  expiryResult,
      ran_at:  new Date().toISOString()
    });

  } catch (err) {
    console.error('cron-expiry error:', err);
    return res.status(500).json({ error: err.message });
  }
}
