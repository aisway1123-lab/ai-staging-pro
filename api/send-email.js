// api/send-email.js
// 通用寄信 API，使用 Resend

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, to, data } = req.body;
  if (!type || !to) return res.status(400).json({ error: '缺少必要參數' });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY 未設定' });

  let subject = '';
  let html = '';

  // ── 審核通過歡迎信 ──
  if (type === 'trial_approved') {
    subject = '【AI Staging Pro】您的試用申請已通過審核！';
    html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'DM Sans',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border:1px solid rgba(26,26,24,0.1);">
    <!-- Header -->
    <div style="background:#2C4A3E;padding:32px;text-align:center;">
      <div style="color:#C4A468;font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-bottom:8px;">AI STAGING PRO</div>
      <div style="color:white;font-size:22px;font-weight:500;">試用申請通過 🎉</div>
    </div>
    <!-- Body -->
    <div style="padding:40px 36px;">
      <p style="font-size:15px;color:#1A1A18;line-height:1.8;margin-bottom:20px;">您好，</p>
      <p style="font-size:15px;color:#3D3D3A;line-height:1.8;margin-bottom:20px;">
        感謝您申請 AI Staging Pro 不動產、室內設計等房地產相關行業試用方案。您的資格審核已通過，帳號現已開通 <strong style="color:#2C4A3E;">60 點</strong>免費試用額度。
      </p>
      <!-- 點數說明 -->
      <div style="background:#EBF0EE;border-left:3px solid #2C4A3E;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#2C4A3E;margin-bottom:8px;">試用方案說明</div>
        <div style="font-size:13px;color:#3D3D3A;line-height:1.9;">
          ◆ 試用點數：<strong>60 點</strong>（可生成 3 次）<br>
          ◆ 有效期限：<strong>7 天</strong>（自即日起算）<br>
          ◆ 每次生成：AI 裝潢效果圖 + 5 秒動態影片
        </div>
      </div>
      <!-- CTA -->
      <div style="text-align:center;margin-bottom:32px;">
        <a href="https://www.aistaging.pro" style="display:inline-block;background:#2C4A3E;color:white;padding:14px 36px;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;">
          立即開始生成
        </a>
      </div>
      <!-- 使用說明 -->
      <div style="border:1px solid rgba(26,26,24,0.1);padding:20px;margin-bottom:24px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8A8880;margin-bottom:12px;">快速上手</div>
        <div style="font-size:13px;color:#3D3D3A;line-height:2;">
          1. 登入帳號（使用您申請時的 Email）<br>
          2. 上傳空屋照片<br>
          3. 選擇裝潢風格與空間類型<br>
          4. 點擊「開始生成影片」，約 2-3 分鐘完成
        </div>
      </div>
      <p style="font-size:13px;color:#8A8880;line-height:1.8;">
        如有任何問題，歡迎透過 LINE 或 Email 聯繫我們：<br>
        LINE：<a href="https://line.me/R/ti/p/@536vcequ" style="color:#2C4A3E;">@536vcequ</a><br>
        Email：<a href="mailto:aisway1123@gmail.com" style="color:#2C4A3E;">aisway1123@gmail.com</a>
      </p>
    </div>
    <!-- Footer -->
    <div style="background:#F0EDE6;padding:20px;text-align:center;border-top:1px solid rgba(26,26,24,0.1);">
      <div style="font-size:11px;color:#8A8880;line-height:1.8;">
        AI Staging Pro｜空屋變夢想家<br>
        <a href="https://www.aistaging.pro/terms.html" style="color:#8A8880;">服務條款</a>　|　
        <a href="https://www.aistaging.pro/terms.html#privacy" style="color:#8A8880;">隱私政策</a>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  // ── 試用到期提醒 ──
  else if (type === 'trial_expiring') {
    const daysLeft = data?.daysLeft || 2;
    subject = `【AI Staging Pro】您的試用點數將於 ${daysLeft} 天後到期`;
    html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'DM Sans',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border:1px solid rgba(26,26,24,0.1);">
    <div style="background:#A8844A;padding:32px;text-align:center;">
      <div style="color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-bottom:8px;">AI STAGING PRO</div>
      <div style="color:white;font-size:22px;font-weight:500;">試用點數即將到期 ⏰</div>
    </div>
    <div style="padding:40px 36px;">
      <p style="font-size:15px;color:#3D3D3A;line-height:1.8;margin-bottom:20px;">
        您的 AI Staging Pro 試用點數將於 <strong style="color:#A8844A;">${daysLeft} 天後</strong>到期，剩餘 <strong style="color:#2C4A3E;">${data?.credits || 0} 點</strong>。
      </p>
      <div style="text-align:center;margin-bottom:28px;">
        <a href="https://www.aistaging.pro/pricing.html" style="display:inline-block;background:#2C4A3E;color:white;padding:14px 36px;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;">
          選擇方案繼續使用
        </a>
      </div>
      <p style="font-size:13px;color:#8A8880;line-height:1.8;">
        如有問題請聯繫：LINE <a href="https://line.me/R/ti/p/@536vcequ" style="color:#2C4A3E;">@536vcequ</a>
      </p>
    </div>
    <div style="background:#F0EDE6;padding:20px;text-align:center;border-top:1px solid rgba(26,26,24,0.1);">
      <div style="font-size:11px;color:#8A8880;">AI Staging Pro｜空屋變夢想家</div>
    </div>
  </div>
</body>
</html>`;
  }

  else {
    return res.status(400).json({ error: '不支援的 email 類型' });
  }

  // ── 呼叫 Resend API 寄信 ──
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'AI Staging Pro <no-reply@aistaging.pro>',
        to: [to],
        subject,
        html
      })
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('Resend error:', result);
      return res.status(500).json({ error: result.message || '寄信失敗' });
    }

    return res.status(200).json({ success: true, id: result.id });
  } catch (err) {
    console.error('send-email error:', err);
    return res.status(500).json({ error: err.message });
  }
}
