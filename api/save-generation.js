// api/save-generation.js
// 負責把 fal.ai 生成的圖片/影片下載後存到 Supabase Storage
// 並更新 generation_logs 的 image_url / video_url / expires_at

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageUrl, videoUrl, userId, style, roomType, logId } = req.body;
  if (!userId) return res.status(400).json({ error: '缺少 userId' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 讀取用戶的 storage_days（沒有設定則預設 30 天）
  const { data: profile } = await supabase
    .from('profiles')
    .select('storage_days')
    .eq('id', userId)
    .single();
  const storageDays = profile?.storage_days || 30;

  const now = new Date();
  const expires = new Date(now.getTime() + storageDays * 24 * 60 * 60 * 1000);
  const timestamp = now.getTime();

  let savedImageUrl = null;
  let savedVideoUrl = null;

  try {
    // ── 存圖片 ──
    if (imageUrl) {
      const imgRes  = await fetch(imageUrl);
      const imgBlob = await imgRes.arrayBuffer();
      const imgPath = `${userId}/${timestamp}_image.png`;

      const { error: imgErr } = await supabase.storage
        .from('generations')
        .upload(imgPath, imgBlob, {
          contentType: 'image/png',
          upsert: true
        });

      if (!imgErr) {
        const { data } = supabase.storage.from('generations').getPublicUrl(imgPath);
        savedImageUrl = data.publicUrl;
      }
    }

    // ── 存影片 ──
    if (videoUrl) {
      const vidRes  = await fetch(videoUrl);
      const vidBlob = await vidRes.arrayBuffer();
      const vidPath = `${userId}/${timestamp}_video.mp4`;

      const { error: vidErr } = await supabase.storage
        .from('generations')
        .upload(vidPath, vidBlob, {
          contentType: 'video/mp4',
          upsert: true
        });

      if (!vidErr) {
        const { data } = supabase.storage.from('generations').getPublicUrl(vidPath);
        savedVideoUrl = data.publicUrl;
      }
    }

    // ── 更新 generation_logs ──
    console.log('save-generation: savedImageUrl=', !!savedImageUrl, 'savedVideoUrl=', !!savedVideoUrl, 'logId=', logId);
    if (logId && (savedImageUrl || savedVideoUrl)) {
      const { error: updateErr } = await supabase.from('generation_logs')
        .update({
          image_url:  savedImageUrl,
          video_url:  savedVideoUrl,
          expires_at: expires.toISOString()
        })
        .eq('id', logId);
      if (updateErr) console.error('generation_logs UPDATE error:', updateErr.message);
      else console.log('generation_logs UPDATE success');
    } else if (savedImageUrl || savedVideoUrl) {
      const { error: insertErr } = await supabase.from('generation_logs').insert({
        user_id:      userId,
        type:         videoUrl ? 'video' : 'image',
        style:        style    || null,
        room_type:    roomType || null,
        credits_used: 20,
        image_url:    savedImageUrl,
        video_url:    savedVideoUrl,
        expires_at:   expires.toISOString()
      });
      if (insertErr) console.error('generation_logs INSERT error:', insertErr.message);
      else console.log('generation_logs INSERT success');
    } else {
      console.warn('save-generation: 沒有可存的 URL，跳過寫入');
    }

    return res.status(200).json({
      success:      true,
      savedImageUrl,
      savedVideoUrl,
      expires:      expires.toISOString(),
      storageDays
    });

  } catch (err) {
    console.error('save-generation error:', err);
    return res.status(500).json({ error: err.message });
  }
}
