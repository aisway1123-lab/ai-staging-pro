// api/cron-storage.js
// 每日自動刪除過期檔案（圖片 + 影片）
// 由 Vercel Cron Job 觸發（每天 UTC 01:00，台灣時間 09:00）
// 安全驗證：Vercel 呼叫時會帶 Authorization: Bearer {CRON_SECRET}
//
// 刪除邏輯：
// - generation_logs.expires_at 是前台顯示的到期時間（mini=30天、standard=60天）
// - 實際 Storage 刪除時間 = expires_at + 15 天緩衝
// - 同步將 generation_logs 的 image_url / video_url 清空，避免前台顯示壞連結

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 只接受 GET（Vercel Cron 使用 GET）
  if (req.method !== 'GET') return res.status(405).end();

  // 驗證 CRON_SECRET，防止外部直接呼叫
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn('cron-storage: 未授權呼叫');
    return res.status(401).json({ error: '未授權' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // 實際刪除時間 = expires_at + 15 天緩衝
    const bufferDays = 15;
    const deleteBeforeDate = new Date(
      Date.now() - bufferDays * 24 * 60 * 60 * 1000
    ).toISOString();

    // 查詢已過緩衝期、且還有檔案 URL 的紀錄
    const { data: expiredLogs, error: queryErr } = await supabase
      .from('generation_logs')
      .select('id, user_id, image_url, video_url')
      .lt('expires_at', deleteBeforeDate)
      .or('image_url.not.is.null,video_url.not.is.null');

    if (queryErr) {
      console.error('cron-storage: 查詢失敗', queryErr);
      return res.status(500).json({ error: queryErr.message });
    }

    if (!expiredLogs || expiredLogs.length === 0) {
      console.log('cron-storage: 無需刪除的檔案');
      return res.status(200).json({ success: true, deleted: 0, ran_at: new Date().toISOString() });
    }

    console.log(`cron-storage: 找到 ${expiredLogs.length} 筆待刪除紀錄`);

    let deletedCount = 0;
    const errors = [];

    for (const log of expiredLogs) {
      const pathsToDelete = [];

      // 從 public URL 解析出 Storage 路徑
      // URL 格式：https://{project}.supabase.co/storage/v1/object/public/generations/{userId}/{filename}
      if (log.image_url) {
        const path = extractStoragePath(log.image_url);
        if (path) pathsToDelete.push(path);
      }
      if (log.video_url) {
        const path = extractStoragePath(log.video_url);
        if (path) pathsToDelete.push(path);
      }

      // 刪除 Storage 檔案
      if (pathsToDelete.length > 0) {
        const { error: storageErr } = await supabase.storage
          .from('generations')
          .remove(pathsToDelete);

        if (storageErr) {
          console.error(`cron-storage: Storage 刪除失敗 log ${log.id}:`, storageErr.message);
          errors.push({ logId: log.id, error: storageErr.message });
          continue;
        }
      }

      // 清空 generation_logs 的 URL 欄位（避免前台顯示壞連結）
      const { error: updateErr } = await supabase
        .from('generation_logs')
        .update({
          image_url: null,
          video_url: null
        })
        .eq('id', log.id);

      if (updateErr) {
        console.error(`cron-storage: 更新 log ${log.id} 失敗:`, updateErr.message);
        errors.push({ logId: log.id, error: updateErr.message });
      } else {
        deletedCount++;
      }
    }

    console.log(`cron-storage: 完成，成功刪除 ${deletedCount} 筆，失敗 ${errors.length} 筆`);

    return res.status(200).json({
      success:  true,
      deleted:  deletedCount,
      failed:   errors.length,
      errors:   errors.length > 0 ? errors : undefined,
      ran_at:   new Date().toISOString()
    });

  } catch (err) {
    console.error('cron-storage error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// 從 Supabase public URL 解析出 Storage 相對路徑
// 輸入：https://{project}.supabase.co/storage/v1/object/public/generations/userId/filename.png
// 輸出：userId/filename.png
function extractStoragePath(publicUrl) {
  try {
    const marker = '/object/public/generations/';
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    return publicUrl.substring(idx + marker.length);
  } catch {
    return null;
  }
}
