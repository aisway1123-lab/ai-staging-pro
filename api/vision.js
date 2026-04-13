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
        model: 'claude-sonnet-4-6',
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
              text: `你是一位專業的 AI 虛擬裝潢生成品質評估師。請分析這張室內照片，判斷它是否適合送入 AI 生成系統。

**最重要的評估指標是照片解析度與清晰度**——模糊的輸入圖片會直接導致模糊的生成結果，無法補救。

請用 JSON 格式回應，只輸出 JSON，不要其他文字：
{
  "overall": "pass" | "warn" | "fail",
  "clutter_level": "low" | "medium" | "high",
  "fixed_decor_interference": "none" | "moderate" | "severe",
  "image_quality": "good" | "acceptable" | "poor",
  "summary": "一句話總結（繁體中文，20字以內）",
  "suggestions": ["建議1", "建議2"]
}

評估標準（嚴格執行）：

image_quality 判斷（最優先）：
- good：照片銳利清晰，邊緣分明，光線均勻，細節可見
- acceptable：輕微模糊但空間結構清楚，光線尚可
- poor：明顯模糊、過曝、過暗、或嚴重噪點，細節無法辨認

overall 判斷：
- pass：image_quality 為 good，空間整潔（clutter_level low），適合直接生成
- warn：image_quality 為 acceptable，或有雜物但不嚴重，可生成但建議改善
- fail：image_quality 為 poor（模糊照片直接 fail），或非室內照片，或空間完全雜亂

clutter_level：
- low：空間基本淨空，沒有散落物品
- medium：有部分家具或物品，但不影響空間結構辨認
- high：嚴重雜亂，難以判斷空間輪廓

fixed_decor_interference：壁紙、花磁磚、木作等固定裝潢對 AI 風格覆蓋的干擾
- none：白牆或素色牆面，無干擾
- moderate：有花紋或顏色但不強烈
- severe：強烈花紋、深色木作或複雜磁磚，風格難以覆蓋

suggestions：針對 warn 或 fail 給具體可行的建議，最多2條，繁體中文`
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
