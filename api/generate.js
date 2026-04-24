// api/generate.js
// 接管所有 fal.ai 生成呼叫，保護 FAL_API_KEY 不外洩

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const FAL_KEY = process.env.FAL_API_KEY;
  if (!FAL_KEY) return res.status(500).json({ error: 'FAL_API_KEY 未設定' });

  const { action } = req.body;

  // ── 上傳圖片（直接回傳 base64 data URL，fal.ai 模型支援直接使用）──
  if (action === 'upload') {
    const { base64DataUrl } = req.body;
    if (!base64DataUrl) return res.status(400).json({ error: '缺少圖片資料' });
    // fal-ai/flux-2-lora-gallery 支援直接使用 data URL 或 https URL
    // 直接回傳，不需要先上傳到 fal storage
    return res.status(200).json({ url: base64DataUrl });
  }

  // ── 圖生圖（效果圖）──
  if (action === 'stageImage') {
    const { imageUrl, styleKey, roomKey, visionFeatures } = req.body;
    const USE_VISION_PROMPT = true;
    if (!imageUrl || !styleKey || !roomKey) return res.status(400).json({ error: '缺少參數' });

    const STYLE_PROMPTS = {
      japanese_muji_wabi_sabi: "Style: Muji-inspired wabi-sabi interior with a quiet morning atmosphere that feels bright yet calm. Floors are hand-scraped or subtly aged natural wood, pale worn stone, or fine linen-textured stone tiles — surfaces that carry a quiet sense of time. Emphasize lived-in stillness through subtle textured walls. Furniture combines pale wood, raw linen or cotton, unbleached hemp, and imperfect handmade ceramics — no single material dominates, each complements the others in an understated, balanced composition. Prioritize spatial emptiness with generous negative space. Lighting uses natural materials such as washi paper, unbleached fiber, or raw wood in warm white or soft amber tones. Windows, if present, are dressed with unbleached linen or cotton sheer panels that filter morning light softly.",
      natural_biophilic: "Style: High-end Natural Biophilic interior with a sunlit, restorative atmosphere. Floors use natural materials appropriate to the space — light stone, pale sand-toned tiles, worn concrete, or warm wood planks with visible grain — earthy but varied, not uniformly terracotta. Palette builds from moss green, warm oat, and soft clay over a soft white base, layered so warm and cool earth tones balance each other rather than match. Greenery and artisan accents in natural materials serve as standalone focal points. Lighting uses organic materials such as rattan, woven fiber, bamboo, or ceramic in warm terracotta, honey, or natural brown tones. Windows, if present, are dressed with soft organic cotton or loosely woven linen curtains that filter warm natural light gently.",
      scandinavian_warm: "Style: High-end Warm Scandinavian urban apartment with a palette of clear whites, warm sand beige, and soft oat neutrals. Floors are pale ash or light oak wood planks, clean and seamless. Layer cool-white surfaces with warm wood and textile accents to create depth, avoiding a flat monotone effect. Lighting uses clean-lined forms in white, warm brass, or natural paper in soft white or warm neutral tones. One high-quality artisanal accent is placed asymmetrically as the sole decorative statement. Windows, if present, are dressed with sheer white or warm linen curtains that soften daylight without adding visual weight.",
      modern_quiet_luxury: "Style: High-end Modern Quiet Luxury interior with a sunlit, aspirational show-home quality. Floors are seamless cool grey stone, large-format warm taupe tiles, or polished concrete — refined and grounded. Palette spans cool greys, warm taupe, and charcoal with subtle metallic undertones — combine matte and polished surfaces for material contrast and visual depth. Lighting uses metal, smoked glass, or frosted glass in matte black, warm brass, or cool grey finishes. Windows, if present, are dressed with floor-to-ceiling sheer curtains in soft grey or warm white that add a layered, editorial quality.",
      retro_modern_tw: "Style: Retro modern with subtle Taiwanese character. Floors are vintage-patterned ceramic tiles, terrazzo with warm aggregate, or aged wood planks — surfaces that carry memory and place. Mix vintage wood, patterned tile, aged metal, and warm textiles so old and new elements contrast each other, creating a layered, story-rich space that still feels livable and uncluttered. Lighting uses aged or vintage-inspired materials such as Edison bulbs, rattan, retro glass, or industrial metal in warm amber or antique brass tones. Windows, if present, are dressed with light-filtering curtains in warm ivory, aged white, or faded warm tones that complete the lived-in softness.",
      korean_instagrammable_adult: "Style: High-end Instagrammable modern adult apartment with a creamy Morandi palette. Floors are seamless warm oat stone, pale micro-cement, or smooth light wood — refined and minimal. Palette of warm milk, oatmeal, and muted blush — layer smooth and softly textured surfaces, combine curved and linear forms so the composition feels visually rich but cohesive rather than flat. Furniture features sculptural, curved silhouettes as a defining characteristic. Lighting uses creamy white or warm off-white tones with slim, curved, or sculptural forms in matte or soft-gloss finishes. Windows, if present, are dressed with soft sheer curtains in warm white or cream that diffuse light with an airy, editorial quality."
    };
    const ROOM_PROMPTS = {
      bedroom: "Room type: Bedroom. Primarily used for sleeping. A bed must be the main focal point. Replace all existing furniture and non-structural cabinetry with a new, realistic layout. Integrate secondary pieces like nightstands, a wardrobe, or a vanity that best fit the room's proportions and circulation.",
      living_room: "Room type: Living Room. Used for relaxing and socializing. A sofa seating area must be clearly defined. Replace all existing furniture and non-structural decor. Integrate supporting furniture such as a coffee table, media unit, or accent chairs based on room size.",
      dining_room: "Room type: Dining Room. Used for dining and gathering. A dining table and chairs are the main focal points. Replace existing furniture and loose decor with a new layout. Include secondary elements like a sideboard or console if space allows. Do not add any curtains or window treatments.",
      kitchen: "Room type: Kitchen. Used for food preparation. Do not redesign the kitchen layout or cabinetry; preserve the existing structural placement. Do not add any new counters, islands, bar structures, or bar stools that do not exist in the original image. Add light styling only, such as small appliances or minimal counter decor. Do not add any curtains or window treatments.",
      study: "Room type: Study. Used for working or reading. A desk and chair must be present and functional. Replace existing furniture with new pieces. Integrate organized storage like bookshelves if space permits.",
      multi_purpose: "Room type: Multi-purpose Room. A flexible space designed for guests, hobbies, or light work — not a dedicated bedroom or office. A compact sofa bed, daybed, or floor cushion seating serves as the focal point, not a full bed. Keep floor space open and uncluttered. Add minimal lightweight storage or a small side table only if space allows. The space should feel versatile and airy."
    };

    const A_Structure = `Stage this empty room with furniture and decor matching the style above. Replace floor surface with a new seamless material appropriate to the selected style — do not preserve the original floor. Replace ceiling fixtures with one single style-appropriate light fixture that best suits the room type — this may be a pendant light, flush mount, track light, recessed light, or other ceiling-mounted fixture. Do not combine multiple different fixture types. Remove all wires, cables, clutter, and non-structural objects from walls. Keep all walls, windows, and doors exactly as shown.`;
    const E_Presentation = `Interior staging visualization. High realism, professional real estate presentation. Designed to look like a model home. Visually appealing, aspirational, and marketable. Ceiling remains clean and simple, appropriate to the selected style.`;
    const F_Negative = `Do not include: people, animals, text, watermark, fantasy, cartoon, new windows, new doors. Do not add any windows that do not exist in the original image. Do not add curtains, drapes, or window treatments to walls, doorways, or openings that are not windows. Do not fill in, block, or alter doorways, corridors, passageways, or any architectural openings.`;

    let dynamicPrompt = '';
    if (USE_VISION_PROMPT && visionFeatures) {
      if (visionFeatures.has_exposed_wires) dynamicPrompt += ' Remove all exposed wires and cables from walls and ceiling.';
      if (visionFeatures.has_builtin_wardrobe) dynamicPrompt += ' If there is an existing built-in wardrobe, retain its position and restyle it to match the selected style.';
    }
    const fullPrompt = `${STYLE_PROMPTS[styleKey]} ${A_Structure} ${ROOM_PROMPTS[roomKey]} ${E_Presentation} ${F_Negative}${dynamicPrompt} 8K resolution, ultra high definition.`;
    const body = { prompt: fullPrompt, image_urls: [imageUrl], lora_scale: 0.75, guidance_scale: 2.1, num_inference_steps: 40, num_images: 1, output_format: "png", enable_safety_checker: true };

    try {
      // 使用 queue.fal.run 非同步提交，立即取得 request_id，不等待生成結果
      // fal.run 是同步等待（會超時），queue.fal.run 是非同步排隊（立即回傳）
      const submitRes = await fetch('https://queue.fal.run/fal-ai/flux-2-lora-gallery/apartment-staging', {
        method: 'POST',
        headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!submitRes.ok) {
        const err = await submitRes.text();
        return res.status(500).json({ error: `效果圖生成失敗：${submitRes.status}` });
      }
      const result = await submitRes.json();
      if (result.request_id) return res.status(200).json({
        requestId:   result.request_id,
        statusUrl:   result.status_url   || null,
        responseUrl: result.response_url || null,
      });
      return res.status(500).json({ error: '效果圖提交未取得 request_id' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── 輪詢圖生圖狀態 ──
  if (action === 'pollStatus') {
    const { requestId, modelPath, statusUrl: clientStatusUrl, responseUrl: clientResponseUrl } = req.body;
    if (!requestId || !modelPath) return res.status(400).json({ error: '缺少參數' });

    try {
      // 優先使用 submit 時回傳的 status_url，否則自己組
      const statusUrl = clientStatusUrl
        || `https://queue.fal.run/${modelPath}/requests/${requestId}/status`;
      const statusRes = await fetch(statusUrl, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
      if (!statusRes.ok) {
        const errText = await statusRes.text();
        console.log('pollStatus - HTTP error:', statusRes.status, errText.slice(0,300));
        return res.status(200).json({ status: 'IN_PROGRESS' });
      }
      const status = await statusRes.json();
      console.log('pollStatus - full status JSON:', JSON.stringify(status));
      const statusVal = status.status?.toUpperCase();

      if (statusVal === 'COMPLETED') {
        // 優先使用 submit 時回傳的 response_url，否則自己組
        const resultUrl = clientResponseUrl
          || `https://queue.fal.run/${modelPath}/requests/${requestId}`;
        const resultRes = await fetch(resultUrl, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
        const resultData = await resultRes.json();
        console.log('pollStatus - resultData:', JSON.stringify(resultData).slice(0, 300));
        const imageUrl = resultData.images?.[0]?.url || resultData.image?.url || null;
        return res.status(200).json({ status: 'COMPLETED', imageUrl });
      }
      if (statusVal === 'FAILED') return res.status(200).json({ status: 'FAILED', error: status.error });
      return res.status(200).json({ status: 'IN_PROGRESS' });
    } catch (err) {
      console.error('pollStatus error:', err.message);
      return res.status(200).json({ status: 'IN_PROGRESS' });
    }
  }

  // ── 影片生成（提交任務）──
  if (action === 'generateVideo') {
    const { startImageUrl, endImageUrl, styleKey } = req.body;
    if (!startImageUrl || !endImageUrl) return res.status(400).json({ error: '缺少參數' });

    const STYLE_LABELS = {
      japanese_muji_wabi_sabi: '日式無印/侘寂', natural_biophilic: '自然系/綠意',
      scandinavian_warm: '溫暖北歐風', modern_quiet_luxury: '現代質感輕奢',
      retro_modern_tw: '台味復古', korean_instagrammable_adult: '韓系網美風'
    };
    const styleLabel = STYLE_LABELS[styleKey] || styleKey;
    const NEGATIVE_PROMPT = "camera movement, zoom, pan, tilt, layout change, structural change, new windows, perspective shift, object floating, object sliding horizontally, ghosting, double exposure, distortion, flickering edges, wall wobbling, room shrinking, camera shake, floor plan change, scaling animation, growing objects, shrinking objects, sliding walls, motion blur, flicker, jitter, frame inconsistency, people, animals, text, watermark, logo, fantasy, surreal, cartoon, stylized, introducing new ceiling elements during transition";

    try {
      // base64 data URL 需要先上傳到 fal.ai storage 取得 https URL
      // Kling Video queue API 不接受 base64，只接受公開的 https URL
      async function uploadBase64ToFal(base64DataUrl) {
        const matches = base64DataUrl.match(/^data:(.+);base64,(.+)$/);
        if (!matches) throw new Error('無效的 base64 格式');
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const ext = mimeType.split('/')[1] || 'png';
        const filename = `upload_${Date.now()}.${ext}`;

        // 取得 fal.ai presigned upload URL
        const initRes = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ file_name: filename, content_type: mimeType })
        });
        if (!initRes.ok) throw new Error('無法取得上傳 URL');
        const { upload_url, file_url } = await initRes.json();

        // 上傳圖片
        const uploadRes = await fetch(upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          body: buffer
        });
        if (!uploadRes.ok) throw new Error('圖片上傳失敗');
        return file_url;
      }

      // 若 startImageUrl 是 base64，先上傳取得 https URL
      let finalStartUrl = startImageUrl;
      if (startImageUrl.startsWith('data:')) {
        finalStartUrl = await uploadBase64ToFal(startImageUrl);
        console.log('startImage 上傳完成:', finalStartUrl);
      }

      // 使用 queue.fal.run 非同步提交，立即取得 request_id，不等待生成結果
      // fal.run 是同步等待（會超時），queue.fal.run 是非同步排隊（立即回傳）
      const submitRes = await fetch('https://queue.fal.run/fal-ai/kling-video/o1/standard/image-to-video', {
        method: 'POST',
        headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Interior staging transformation. Static camera, no camera movement. The space naturally transforms from its original state into a fully staged ${styleLabel} interior. New furniture enters smoothly. High realism, professional real estate visualization. 8K resolution, ultra high definition.`,
          start_image_url: finalStartUrl,
          end_image_url: endImageUrl,
          duration: "5",
          negative_prompt: NEGATIVE_PROMPT
        })
      });

      if (!submitRes.ok) {
        const errText = await submitRes.text();
        console.error('影片提交失敗:', submitRes.status, errText);
        return res.status(500).json({ error: `影片提交失敗：${submitRes.status}` });
      }
      const result = await submitRes.json();
      console.log('generateVideo - submit result:', JSON.stringify(result));
      // queue API 回傳 request_id 和 status_url、response_url
      if (result.request_id) return res.status(200).json({
        requestId:   result.request_id,
        statusUrl:   result.status_url   || null,
        responseUrl: result.response_url || null,
      });
      if (result.video?.url) return res.status(200).json({ videoUrl: result.video.url });
      return res.status(500).json({ error: '影片提交未取得 request_id' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── 輪詢影片狀態 ──
  if (action === 'pollVideoStatus') {
    const { requestId, statusUrl: clientStatusUrl, responseUrl: clientResponseUrl } = req.body;
    if (!requestId) return res.status(400).json({ error: '缺少參數' });

    try {
      // 優先使用 submit 時回傳的 status_url，否則自己組
      const statusUrl = clientStatusUrl
        || `https://queue.fal.run/fal-ai/kling-video/o1/standard/image-to-video/requests/${requestId}/status`;
      const statusRes = await fetch(statusUrl, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
      if (!statusRes.ok) {
        const errText = await statusRes.text();
        console.log('pollVideoStatus - HTTP error:', statusRes.status, errText.slice(0,300));
        return res.status(200).json({ status: 'IN_PROGRESS' });
      }
      const status = await statusRes.json();
      console.log('pollVideoStatus - full status JSON:', JSON.stringify(status));
      const statusVal = status.status?.toUpperCase();

      if (statusVal === 'COMPLETED') {
        // 優先使用 submit 時回傳的 response_url，否則自己組
        const resultUrl = clientResponseUrl
          || `https://queue.fal.run/fal-ai/kling-video/o1/standard/image-to-video/requests/${requestId}`;
        const resultRes = await fetch(resultUrl, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
        const resultData = await resultRes.json();
        console.log('pollVideoStatus - resultData:', JSON.stringify(resultData).slice(0, 300));
        // fal.ai queue REST API 直接回傳 { video: { url: ... } }，不包在 data 裡
        const videoUrl = resultData.video?.url
          || resultData.data?.video?.url
          || resultData.output?.video?.url
          || null;
        console.log('pollVideoStatus - videoUrl:', videoUrl);
        if (!videoUrl) {
          // 有完成但取不到 URL，回傳詳細錯誤讓前台知道
          return res.status(200).json({ status: 'FAILED', error: `取得影片URL失敗，resultData: ${JSON.stringify(resultData).slice(0,200)}` });
        }
        return res.status(200).json({ status: 'COMPLETED', videoUrl });
      }
      if (statusVal === 'FAILED') return res.status(200).json({ status: 'FAILED', error: status.error || status.detail });
      return res.status(200).json({ status: 'IN_PROGRESS' });
    } catch (err) {
      // catch 改成回傳真實錯誤，不再吞掉
      console.error('pollVideoStatus error:', err.message);
      return res.status(200).json({ status: 'FAILED', error: 'pollVideoStatus 發生錯誤：' + err.message });
    }
  }

  return res.status(400).json({ error: '無效的 action' });
}
