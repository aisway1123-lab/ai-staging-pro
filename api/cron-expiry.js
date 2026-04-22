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

    // ── 到期前提醒 Email（trial: 2天前，pack: 7天前）──
    const trialReminderTarget = new Date();
    trialReminderTarget.setDate(trialReminderTarget.getDate() + 2);
    const trialReminderStart = new Date(trialReminderTarget);
    trialReminderStart.setHours(0, 0, 0, 0);
    const trialReminderEnd = new Date(trialReminderTarget);
    trialReminderEnd.setHours(23, 59, 59, 999);

    const packReminderTarget = new Date();
    packReminderTarget.setDate(packReminderTarget.getDate() + 7);
    const reminderTarget = packReminderTarget;
    const reminderStart = new Date(reminderTarget);
    reminderStart.setHours(0, 0, 0, 0);
    const reminderEnd = new Date(reminderTarget);
    reminderEnd.setHours(23, 59, 59, 999);

    // trial 2天前提醒
    const { data: trialReminders } = await supabase
      .from('credit_logs')
      .select('id, user_id, type, amount, expires_at')
      .eq('type', 'trial')
      .gte('expires_at', trialReminderStart.toISOString())
      .lte('expires_at', trialReminderEnd.toISOString())
      .is('reminder_sent_at', null)
      .gt('amount', 0);

    // pack 7天前提醒
    const { data: packReminders } = await supabase
      .from('credit_logs')
      .select('id, user_id, type, amount, expires_at')
      .eq('type', 'pack')
      .gte('expires_at', reminderStart.toISOString())
      .lte('expires_at', reminderEnd.toISOString())
      .is('reminder_sent_at', null)
      .gt('amount', 0);

    const pendingReminders = [...(trialReminders || []), ...(packReminders || [])];

    let reminderCount = 0;
    const SITE_URL = process.env.SITE_URL || 'https://www.aistaging.pro';

    for (const log of (pendingReminders || [])) {
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(log.user_id);
        const email = userData?.user?.email;
        if (!email) continue;

        const { data: consumed } = await supabase
          .from('credit_logs')
          .select('amount')
          .eq('source_log_id', log.id)
          .lt('amount', 0);
        const usedAmount = (consumed || []).reduce((sum, c) => sum + Math.abs(c.amount), 0);
        const remainingCredits = Math.max(log.amount - usedAmount, 0);

        const expDate = new Date(log.expires_at);
        const expiresAt = `${expDate.getFullYear()}-${String(expDate.getMonth()+1).padStart(2,'0')}-${String(expDate.getDate()).padStart(2,'0')}`;

        const emailType = log.type === 'trial' ? 'trial_expiring' : 'pack_expiring';
        const emailRes = await fetch(`${SITE_URL}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: emailType,
            to:   email,
            data: {
              daysLeft:  7,
              credits:   remainingCredits,
              expiresAt: expiresAt
            }
          })
        });

        if (emailRes.ok) {
          await supabase
            .from('credit_logs')
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq('id', log.id);
          reminderCount++;
          console.log(`提醒信已寄送：${email}（${log.type}，到期 ${expiresAt}）`);
        } else {
          console.warn(`提醒信寄送失敗：${email}`);
        }
      } catch (e) {
        console.warn(`處理提醒失敗（user: ${log.user_id}）:`, e.message);
      }
    }

    console.log(`到期提醒完成，共發送 ${reminderCount} 封`);

    // ── 訂閱即將到期提醒（cancel_at_period_end=true，7天前）──
    const subReminderTarget = new Date();
    subReminderTarget.setDate(subReminderTarget.getDate() + 7);
    const subReminderStart = new Date(subReminderTarget);
    subReminderStart.setHours(0, 0, 0, 0);
    const subReminderEnd = new Date(subReminderTarget);
    subReminderEnd.setHours(23, 59, 59, 999);

    const { data: subExpiring } = await supabase
      .from('credit_logs')
      .select('id, user_id, type, amount, expires_at')
      .eq('type', 'subscription')
      .gte('expires_at', subReminderStart.toISOString())
      .lte('expires_at', subReminderEnd.toISOString())
      .is('reminder_sent_at', null)
      .gt('amount', 0);

    for (const log of (subExpiring || [])) {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('cancel_at_period_end')
          .eq('id', log.user_id)
          .single();
        if (!prof?.cancel_at_period_end) continue;

        const { data: userData } = await supabase.auth.admin.getUserById(log.user_id);
        const email = userData?.user?.email;
        if (!email) continue;

        const emailRes = await fetch(`${SITE_URL}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'subscription_expiring',
            to:   email,
            data: { daysLeft: 7 }
          })
        });

        if (emailRes.ok) {
          await supabase
            .from('credit_logs')
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq('id', log.id);
          reminderCount++;
          console.log(`訂閱到期提醒已寄送：${email}`);
        }
      } catch (e) {
        console.warn(`訂閱提醒失敗（user: ${log.user_id}）:`, e.message);
      }
    }

    // ── 處理已取消但尚未降級的訂閱用戶 ──
    const { data: cancelPending } = await supabase
      .from('profiles')
      .select('id')
      .eq('cancel_at_period_end', true)
      .eq('role', 'subscriber');

    let cancelledCount = 0;
    for (const p of (cancelPending || [])) {
      const { data: activeCredits } = await supabase
        .from('credit_logs')
        .select('id')
        .eq('user_id', p.id)
        .eq('type', 'subscription')
        .gt('expires_at', new Date().toISOString())
        .gt('amount', 0)
        .limit(1);

      if (!activeCredits || activeCredits.length === 0) {
        await supabase
          .from('profiles')
          .update({
            role:                 'free',
            plan_level:           null,
            plan_billing:         null,
            period_no:            null,
            cancel_at_period_end: false,
          })
          .eq('id', p.id);
        cancelledCount++;
        console.log(`訂閱降級完成：${p.id}`);
      }
    }

    if (cancelledCount > 0) {
      console.log(`共處理 ${cancelledCount} 位取消訂閱用戶降級`);
    }

    // ── 試用到期當天：發送問卷邀請 ──
    // 找出今天到期的 trial credit_logs，且尚未有 survey_tokens 記錄的用戶
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { data: trialExpiredToday } = await supabase
      .from('credit_logs')
      .select('user_id')
      .eq('type', 'trial')
      .gte('expires_at', todayStart.toISOString())
      .lte('expires_at', todayEnd.toISOString())
      .gt('amount', 0);

    let surveyInviteCount = 0;

    for (const log of (trialExpiredToday || [])) {
      try {
        // 防止重複：檢查是否已有 survey_tokens
        const { data: existingToken } = await supabase
          .from('survey_tokens')
          .select('id')
          .eq('user_id', log.user_id)
          .maybeSingle();

        if (existingToken) continue;

        // 建立 survey_token（15天有效）
        const tokenExpiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
        const { data: newToken, error: tokenErr } = await supabase
          .from('survey_tokens')
          .insert({
            user_id:    log.user_id,
            expires_at: tokenExpiresAt,
          })
          .select('token')
          .single();

        if (tokenErr || !newToken) {
          console.warn(`[cron-expiry] survey token 建立失敗 user=${log.user_id}:`, tokenErr?.message);
          continue;
        }

        // 取得用戶 Email
        const { data: userData } = await supabase.auth.admin.getUserById(log.user_id);
        const email = userData?.user?.email;
        if (!email) continue;

        // 寄送問卷邀請信
        const emailRes = await fetch(`${SITE_URL}/api/send-email`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'survey_invite',
            to:   email,
            data: {
              surveyUrl: `${SITE_URL}/survey.html?token=${newToken.token}`,
              expiresAt: tokenExpiresAt.split('T')[0],
            }
          })
        });

        if (emailRes.ok) {
          surveyInviteCount++;
          console.log(`[cron-expiry] 問卷邀請已寄送：${email}`);
        } else {
          console.warn(`[cron-expiry] 問卷邀請寄送失敗：${email}`);
        }
      } catch (e) {
        console.warn(`[cron-expiry] 問卷邀請處理失敗 user=${log.user_id}:`, e.message);
      }
    }

    if (surveyInviteCount > 0) {
      console.log(`問卷邀請完成，共發送 ${surveyInviteCount} 封`);
    }

    return res.status(200).json({
      success:             true,
      result:              expiryResult,
      reminders_sent:      reminderCount,
      cancelled:           cancelledCount,
      survey_invites_sent: surveyInviteCount,
      ran_at:              new Date().toISOString()
    });

  } catch (err) {
    console.error('cron-expiry error:', err);
    return res.status(500).json({ error: err.message });
  }
}
