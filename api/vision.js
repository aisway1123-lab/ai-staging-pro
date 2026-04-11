// api/vision.js
// Vercel Serverless Function — Claude Vision 品質判斷
// 放置路徑：repo 根目錄的 api/vision.js

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageBase64, mimeType } = req.body;

  if (!imageBase64 || !mimeType) {
    return res.status(400).json({ error: '缺少圖片資料' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key 未設定' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: imageBase64
              }
            },
            {
              type: 'text',
              text: `你是一位專業的房地產空屋照品質評估師。請分析這張室內照片，評估是否適合 AI 虛擬裝潢生成。

請用 JSON 格式回應，只輸出 JSON，不要其他文字：
{
  "overall": "pass" | "warn" | "fail",
  "clutter_level": "low" | "medium" | "high",
  "fixed_decor_interference": "none" | "moderate" | "severe",
  "image_quality": "good" | "acceptable" | "poor",
  "summary": "一句話總結（繁體中文，20字以內）",
  "suggestions": ["建議1", "建議2"]
}

評估標準：
- overall pass：照片清晰，空間整潔，非常適合 AI 生成
- overall warn：有雜物或固定裝潢，可以生成但效果可能受影響
- overall fail：嚴重雜亂、圖片模糊、非室內照片、或完全無法辨識空間
- clutter_level：散落物品、雜亂家具的程度（low/medium/high）
- fixed_decor_interference：壁紙、磁磚、木作等固定裝潢對生成風格的干擾（none/moderate/severe）
- image_quality：照片清晰度與光線條件（good/acceptable/poor）
- suggestions：給用戶的具體改善建議，最多2條，用繁體中文`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return res.status(502).json({ error: `Vision API 錯誤：${response.status}` });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '{}';

    let result;
    try {
      result = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error('JSON parse error:', rawText);
      return res.status(500).json({ error: '無法解析 Vision 回應' });
    }

    return res.status(200).json(result);

  } catch (err) {
    console.error('Vision handler error:', err);
    return res.status(500).json({ error: err.message || '伺服器錯誤' });
  }
}
