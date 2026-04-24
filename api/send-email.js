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
        如有任何問題，歡迎透過 LINE 聯繫我們：<br>
        LINE：<a href="https://line.me/R/ti/p/@536vcequ" style="color:#2C4A3E;">@536vcequ</a>
      </p>
      <p style="font-size:11px;color:#C4C0B8;line-height:1.8;margin-top:12px;">
        若未收到本信，請檢查垃圾信件匣，並將 no-reply@aistaging.pro 加入聯絡人以確保日後正常收信。
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

  // ── 點數包到期提醒 ──
  else if (type === 'pack_expiring') {
    const daysLeft  = data?.daysLeft || 7;
    const credits   = data?.credits || 0;
    const expiresAt = data?.expiresAt || '';
    subject = `【AI Staging Pro】您的點數包將於 ${daysLeft} 天後到期`;
    html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'DM Sans',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border:1px solid rgba(26,26,24,0.1);">
    <div style="background:#A8844A;padding:32px;text-align:center;">
      <div style="color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-bottom:8px;">AI STAGING PRO</div>
      <div style="color:white;font-size:22px;font-weight:500;">點數包即將到期 ⏰</div>
    </div>
    <div style="padding:40px 36px;">
      <p style="font-size:15px;color:#3D3D3A;line-height:1.8;margin-bottom:20px;">
        您購買的點數包將於 <strong style="color:#A8844A;">${daysLeft} 天後（${expiresAt}）</strong>到期，目前剩餘 <strong style="color:#2C4A3E;">${credits} 點</strong>。
      </p>
      <p style="font-size:13px;color:#3D3D3A;line-height:1.8;margin-bottom:24px;">
        點數到期後將自動歸零，未使用點數恕不退款。如需繼續使用，建議於到期前完成生成或購買新的點數包。
      </p>
      <div style="text-align:center;margin-bottom:28px;">
        <a href="https://www.aistaging.pro" style="display:inline-block;background:#2C4A3E;color:white;padding:14px 36px;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin-right:8px;">
          立即使用點數
        </a>
        <a href="https://www.aistaging.pro/pricing.html" style="display:inline-block;background:transparent;color:#2C4A3E;border:1px solid #2C4A3E;padding:14px 36px;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;">
          購買點數包
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

  // ── 試用拒絕通知 ──
  else if (type === 'trial_rejected') {
    subject = '【AI Staging Pro】關於您的試用申請';
    html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'DM Sans',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border:1px solid rgba(26,26,24,0.1);">
    <div style="background:#2C4A3E;padding:32px;text-align:center;">
      <div style="color:#C4A468;font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-bottom:8px;">AI STAGING PRO</div>
      <div style="color:white;font-size:22px;font-weight:500;">關於您的試用申請</div>
    </div>
    <div style="padding:40px 36px;">
      <p style="font-size:15px;color:#1A1A18;line-height:1.8;margin-bottom:20px;">您好，</p>
      <p style="font-size:15px;color:#3D3D3A;line-height:1.8;margin-bottom:20px;">
        感謝您申請 AI Staging Pro 試用方案。經審核，您的申請目前未能通過資格審查。
      </p>
      <div style="background:#F5EFE4;border-left:3px solid #A8844A;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:13px;color:#3D3D3A;line-height:1.9;">
          本服務目前僅開放不動產業務、室內設計師、建商／代銷等專業人士申請試用。如您認為審核有誤，歡迎透過 LINE 與我們聯繫說明。
        </div>
      </div>
      <p style="font-size:13px;color:#8A8880;line-height:1.8;">
        LINE 官方帳號：<a href="https://line.me/R/ti/p/@536vcequ" style="color:#2C4A3E;">@536vcequ</a>
      </p>
    </div>
    <div style="background:#F0EDE6;padding:20px;text-align:center;border-top:1px solid rgba(26,26,24,0.1);">
      <div style="font-size:11px;color:#8A8880;">AI Staging Pro｜空屋變夢想家</div>
    </div>
  </div>
</body>
</html>`;
  }

  // ── 訂閱成功通知 ──
  else if (type === 'subscription_activated') {
    const planName = data?.planName || '訂閱方案';
    const credits  = data?.credits  || 0;
    subject = '【AI Staging Pro】訂閱成功，開始您的 AI 生成之旅！';
    html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'DM Sans',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border:1px solid rgba(26,26,24,0.1);">
    <div style="background:#2C4A3E;padding:32px;text-align:center;">
      <div style="color:#C4A468;font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-bottom:8px;">AI STAGING PRO</div>
      <div style="color:white;font-size:22px;font-weight:500;">訂閱成功 🎉</div>
    </div>
    <div style="padding:40px 36px;">
      <p style="font-size:15px;color:#1A1A18;line-height:1.8;margin-bottom:20px;">您好，</p>
      <p style="font-size:15px;color:#3D3D3A;line-height:1.8;margin-bottom:20px;">
        感謝您訂閱 AI Staging Pro，您的帳號已正式啟用 <strong style="color:#2C4A3E;">${planName}</strong>，即刻開始快速生成 AI 虛擬裝潢效果圖與動態影片。
      </p>
      <div style="background:#EBF0EE;border-left:3px solid #2C4A3E;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#2C4A3E;margin-bottom:8px;">本期方案說明</div>
        <div style="font-size:13px;color:#3D3D3A;line-height:1.9;">
          ◆ 方案：<strong>${planName}</strong><br>
          ◆ 本期點數：<strong>${credits} 點</strong><br>
          ◆ 每次生成：AI 裝潢效果圖 + 5 秒動態影片（消耗 20 點）
        </div>
      </div>
      <div style="text-align:center;margin-bottom:32px;">
        <a href="https://www.aistaging.pro" style="display:inline-block;background:#2C4A3E;color:white;padding:14px 36px;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;">
          立即開始生成
        </a>
      </div>
      <p style="font-size:13px;color:#8A8880;line-height:1.8;">
        如有任何問題，歡迎透過 LINE 聯繫我們：<a href="https://line.me/R/ti/p/@536vcequ" style="color:#2C4A3E;">@536vcequ</a>
      </p>
    </div>
    <div style="background:#F0EDE6;padding:20px;text-align:center;border-top:1px solid rgba(26,26,24,0.1);">
      <div style="font-size:11px;color:#8A8880;">AI Staging Pro｜空屋變夢想家</div>
    </div>
  </div>
</body>
</html>`;
  }

  // ── 訂閱取消確認 ──
  else if (type === 'subscription_cancelled') {
    subject = '【AI Staging Pro】訂閱取消確認';
    html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'DM Sans',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border:1px solid rgba(26,26,24,0.1);">
    <div style="background:#2C4A3E;padding:32px;text-align:center;">
      <div style="color:#C4A468;font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-bottom:8px;">AI STAGING PRO</div>
      <div style="color:white;font-size:22px;font-weight:500;">訂閱取消確認</div>
    </div>
    <div style="padding:40px 36px;">
      <p style="font-size:15px;color:#1A1A18;line-height:1.8;margin-bottom:20px;">您好，</p>
      <p style="font-size:15px;color:#3D3D3A;line-height:1.8;margin-bottom:20px;">
        您的訂閱取消申請已受理。本期服務將持續至點數到期為止，期間您仍可正常使用所有功能。
      </p>
      <div style="background:#F5EFE4;border-left:3px solid #A8844A;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:13px;color:#3D3D3A;line-height:1.9;">
          感謝您曾經使用 AI Staging Pro。若您日後有需要，歡迎隨時回來，我們隨時為您服務。
        </div>
      </div>
      <div style="text-align:center;margin-bottom:32px;">
        <a href="https://www.aistaging.pro/pricing.html" style="display:inline-block;background:#2C4A3E;color:white;padding:14px 36px;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;">
          重新訂閱
        </a>
      </div>
      <p style="font-size:13px;color:#8A8880;line-height:1.8;">
        如有任何問題，歡迎透過 LINE 聯繫我們：<a href="https://line.me/R/ti/p/@536vcequ" style="color:#2C4A3E;">@536vcequ</a>
      </p>
    </div>
    <div style="background:#F0EDE6;padding:20px;text-align:center;border-top:1px solid rgba(26,26,24,0.1);">
      <div style="font-size:11px;color:#8A8880;">AI Staging Pro｜空屋變夢想家</div>
    </div>
  </div>
</body>
</html>`;
  }

  // ── 訂閱即將到期提醒 ──
  else if (type === 'subscription_expiring') {
    const daysLeft = data?.daysLeft || 7;
    subject = `【AI Staging Pro】您的訂閱點數將於 ${daysLeft} 天後到期`;
    html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'DM Sans',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border:1px solid rgba(26,26,24,0.1);">
    <div style="background:#A8844A;padding:32px;text-align:center;">
      <div style="color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-bottom:8px;">AI STAGING PRO</div>
      <div style="color:white;font-size:22px;font-weight:500;">訂閱即將到期 ⏰</div>
    </div>
    <div style="padding:40px 36px;">
      <p style="font-size:15px;color:#3D3D3A;line-height:1.8;margin-bottom:20px;">
        您已取消 AI Staging Pro 訂閱，本期點數將於 <strong style="color:#A8844A;">${daysLeft} 天後</strong>到期，到期後服務將自動停止。
      </p>
      <p style="font-size:13px;color:#3D3D3A;line-height:1.8;margin-bottom:24px;">
        若您希望繼續使用，歡迎隨時重新訂閱，或購買點數包按需使用。
      </p>
      <div style="text-align:center;margin-bottom:32px;">
        <a href="https://www.aistaging.pro/pricing.html" style="display:inline-block;background:#2C4A3E;color:white;padding:14px 36px;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin-right:8px;">
          重新訂閱
        </a>
        <a href="https://www.aistaging.pro/pricing.html" style="display:inline-block;background:transparent;color:#2C4A3E;border:1px solid #2C4A3E;padding:14px 36px;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;">
          購買點數包
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

  // ── 問卷邀請信 ──
  else if (type === 'survey_invite') {
    const surveyUrl = data?.surveyUrl || 'https://www.aistaging.pro/survey.html';
    const expiresAt = data?.expiresAt || '';
    subject = '【AI Staging Pro】感謝您的試用，填寫問卷領取專屬獎勵';
    html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'DM Sans',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border:1px solid rgba(26,26,24,0.1);">
    <div style="background:#2C4A3E;padding:32px;text-align:center;">
      <div style="color:#C4A468;font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-bottom:8px;">AI STAGING PRO</div>
      <div style="color:white;font-size:22px;font-weight:500;">試用期結束，感謝您的體驗 🙏</div>
    </div>
    <div style="padding:40px 36px;">
      <p style="font-size:15px;color:#1A1A18;line-height:1.8;margin-bottom:20px;">您好，</p>
      <p style="font-size:15px;color:#3D3D3A;line-height:1.8;margin-bottom:24px;">
        感謝您試用 AI Staging Pro。您的寶貴回饋對我們非常重要，只需 2 分鐘填寫問卷，即可解鎖專屬獎勵。
      </p>
      <div style="background:#EBF0EE;border-left:3px solid #2C4A3E;padding:20px 24px;margin-bottom:28px;">
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#2C4A3E;margin-bottom:12px;">🎁 填完問卷，解鎖專屬試用感謝禮</div>
        <div style="font-size:13px;color:#3D3D3A;line-height:2.0;">
          ◆ 訂閱迷你月付方案 → 自動獲得 <strong style="color:#2C4A3E;">100 點</strong>贈點<br>
          ◆ 購買 399 點數包 → 自動加贈 <strong style="color:#2C4A3E;">50 點</strong>（共 150 點）
        </div>
        <div style="font-size:12px;color:#8A8880;margin-top:10px;padding-top:10px;border-top:1px solid rgba(26,26,24,0.1);">
          以上獎勵需於問卷填寫完成後 15 天內使用（期限：${expiresAt}）
        </div>
      </div>
      <div style="text-align:center;margin-bottom:32px;">
        <a href="${surveyUrl}" style="display:inline-block;background:#2C4A3E;color:white;padding:16px 48px;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;">
          立即填寫問卷 →
        </a>
      </div>
      <p style="font-size:12px;color:#C4C0B8;line-height:1.8;">
        此問卷連結為您的專屬連結，每位用戶限填一次。<br>
        如有問題請聯繫：LINE <a href="https://line.me/R/ti/p/@536vcequ" style="color:#2C4A3E;">@536vcequ</a>
      </p>
    </div>
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

  // ── 問卷完成確認信 ──
  else if (type === 'survey_reward') {
    const expiresAt = data?.expiresAt || '';
    subject = '【AI Staging Pro】問卷已完成，您的專屬獎勵已自動生效！';
    html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'DM Sans',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border:1px solid rgba(26,26,24,0.1);">
    <div style="background:#2C4A3E;padding:32px;text-align:center;">
      <div style="color:#C4A468;font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-bottom:8px;">AI STAGING PRO</div>
      <div style="color:white;font-size:22px;font-weight:500;">感謝您的回饋 🎁</div>
    </div>
    <div style="padding:40px 36px;">
      <p style="font-size:15px;color:#1A1A18;line-height:1.8;margin-bottom:20px;">您好，</p>
      <p style="font-size:15px;color:#3D3D3A;line-height:1.8;margin-bottom:24px;">
        您的問卷已成功提交，感謝您的寶貴意見！專屬獎勵已自動綁定至您的帳號，<strong>無需任何操作</strong>。
      </p>
      <div style="background:#EBF0EE;border-left:3px solid #2C4A3E;padding:20px 24px;margin-bottom:24px;">
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#2C4A3E;margin-bottom:12px;">您的專屬獎勵</div>
        <div style="font-size:13px;color:#3D3D3A;line-height:2.0;">
          ◆ 訂閱迷你月付方案 → 自動獲得 <strong style="color:#2C4A3E;">100 點</strong>贈點<br>
          ◆ 購買 399 點數包 → 自動加贈 <strong style="color:#2C4A3E;">50 點</strong>（共 150 點）
        </div>
      </div>
      <div style="background:#F5EFE4;border-left:3px solid #A8844A;padding:16px 20px;margin-bottom:28px;">
        <div style="font-size:12px;color:#6B5B3E;line-height:1.9;">
          ✦ 獎勵已自動綁定，付費時系統將自動套用，無需手動輸入<br>
          ✦ 訂閱贈點與點數包加贈均需於 <strong>${expiresAt}</strong> 前完成付費<br>
          ✦ 每位用戶限領一次
        </div>
      </div>
      <div style="text-align:center;margin-bottom:32px;">
        <a href="https://www.aistaging.pro/pricing.html" style="display:inline-block;background:#2C4A3E;color:white;padding:14px 36px;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin-right:8px;">
          立即訂閱
        </a>
        <a href="https://www.aistaging.pro/pricing.html" style="display:inline-block;background:transparent;color:#2C4A3E;border:1px solid #2C4A3E;padding:14px 36px;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;">
          購買點數包
        </a>
      </div>
      <p style="font-size:13px;color:#8A8880;line-height:1.8;">
        如有任何問題，歡迎透過 LINE 聯繫我們：<a href="https://line.me/R/ti/p/@536vcequ" style="color:#2C4A3E;">@536vcequ</a>
      </p>
    </div>
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

  else if (type === 'subscription_card_issue') {
    subject = '【AI Staging Pro】您的訂閱信用卡需要更新';
    html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'DM Sans',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border:1px solid rgba(26,26,24,0.1);">
    <div style="background:#8A4A3E;padding:32px;text-align:center;">
      <div style="color:#F5C4A0;font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-bottom:8px;">AI STAGING PRO</div>
      <div style="color:white;font-size:22px;font-weight:500;">信用卡狀態異常通知</div>
    </div>
    <div style="padding:40px 36px;">
      <p style="font-size:15px;color:#1A1A18;line-height:1.8;margin-bottom:20px;">您好，</p>
      <p style="font-size:15px;color:#3D3D3A;line-height:1.8;margin-bottom:24px;">
        您的訂閱方案所綁定的信用卡發生狀態異動（換卡、停卡或遺失重製），可能導致後續自動扣款失敗或訂閱中斷。
      </p>
      <div style="background:#FEF0EE;border-left:3px solid #C04B3A;padding:20px 24px;margin-bottom:24px;">
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#C04B3A;margin-bottom:8px;">需要您的操作</div>
        <p style="font-size:13px;color:#3D3D3A;line-height:1.9;margin:0;">
          請盡快透過 LINE 聯繫客服，重新綁定有效的信用卡，以確保訂閱服務不中斷。
        </p>
      </div>
      <div style="text-align:center;margin-bottom:32px;">
        <a href="https://line.me/R/ti/p/@536vcequ" style="display:inline-block;background:#2C4A3E;color:white;padding:14px 36px;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;">
          聯繫客服重新綁卡
        </a>
      </div>
      <p style="font-size:13px;color:#8A8880;line-height:1.8;">
        如有任何問題，歡迎透過 LINE 聯繫我們：<a href="https://line.me/R/ti/p/@536vcequ" style="color:#2C4A3E;">@536vcequ</a>
      </p>
    </div>
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
