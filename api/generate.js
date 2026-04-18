// api/generate.js
// 接管所有 fal.ai 生成呼叫，保護 FAL_API_KEY 不外洩

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
    const { imageUrl, styleKey, roomKey } = req.body;
    if (!imageUrl || !styleKey || !roomKey) return res.status(400).json({ error: '缺少參數' });

    const STYLE_PROMPTS = {
      japanese_muji_wabi_sabi: "Style: Muji-inspired wabi-sabi interior with a quiet morning atmosphere that feels bright yet calm. Emphasize lived-in stillness through subtle textured walls. Natural wood furniture and organic linen or cotton fabrics ground the space, while a few imperfect handmade ceramics add a gentle sense of time. Prioritize spatial emptiness; any additional furniture must have realistic depths and functional proportions.",
      natural_biophilic: "Style: High-end Natural Biophilic interior with a sunlit, restorative atmosphere. Palette: Muted earth tones (terracotta, moss green, deep oat) over a soft white base. Greenery and artisan accents are integrated as standalone, minimalist focal points. All furniture must be non-embedded with realistic depths. Lighting is bright and airy.",
      scandinavian_warm: "Style: High-end Warm Scandinavian urban apartment with a palette of clear whites, warm sand beige, and soft oat neutrals. Lighting is bright and airy, complemented by sheer white curtains or soft linen. Decor features a single high-quality artisanal accent placed asymmetrically.",
      modern_quiet_luxury: "Style: High-end Modern Quiet Luxury interior with a sunlit, aspirational show-home glow. Palette: Refined neutral spectrum of cool greys, warm taupe, and charcoal with subtle metallic undertones. Strictly maintain original flat wall structures. Furniture must be standalone with realistic depths. Sophisticated lighting highlights material contrast.",
      retro_modern_tw: "Style: Retro modern with subtle Taiwanese character. Hints of vintage atmosphere through furniture, colors, or textures. Avoid structural changes. Balance nostalgic elements with modern cleanliness. The space should feel story-rich but still livable. All vintage-inspired furniture must be standalone with realistic depths.",
      korean_instagrammable_adult: "Style: High-end Instagrammable modern adult apartment with a creamy Morandi palette of warm milk and oatmeal. Refined, smooth textures and editorial aesthetic. Lighting may include LED coves. Soft sheer draping curtains diffuse natural light. Furniture features sculptural, curved silhouettes."
    };
    const ROOM_PROMPTS = {
      bedroom: "Room type: Bedroom. Primarily used for sleeping. A bed must be the main focal point. Strictly preserve all original wall positions, window openings, and door locations. Do NOT add any new windows, doors, or openings that do not exist in the original image. Replace all existing furniture and non-structural cabinetry with a new, realistic layout. Integrate secondary pieces like nightstands, a wardrobe, or a vanity that best fit the room's proportions and circulation.",
      living_room: "Room type: Living Room. Used for relaxing and socializing. A sofa seating area must be clearly defined. Strictly preserve all original wall positions, window openings, and door locations. Do NOT add any new windows, doors, or openings that do not exist in the original image. Replace all existing furniture and non-structural decor. Integrate supporting furniture such as a coffee table, media unit, or accent chairs based on room size.",
      dining_room: "Room type: Dining Room. Used for dining and gathering. A dining table and chairs are the main focal points. Strictly preserve all original wall positions, openings, and architectural structure. Do NOT add any new windows, doors, or openings that do not exist in the original image. Replace existing furniture and loose decor with a new layout. Include secondary elements like a sideboard or console if space allows.",
      kitchen: "Room type: Kitchen. Used for food preparation. Do not redesign the kitchen layout or cabinetry; preserve the existing structural placement. Do not add any new counters, islands, bar structures, or bar stools that do not exist in the original image. Add light styling only, such as small appliances or minimal counter decor.",
      study: "Room type: Study. Used for working or reading. A desk and chair must be present and functional. Strictly preserve all original wall positions, window openings, and door locations. Do NOT add any new windows, doors, or openings that do not exist in the original image. Replace existing furniture with new pieces. Integrate organized storage like bookshelves if space permits.",
      multi_purpose: "Room type: Multi-purpose Room. A flexible space for guests or hobbies. Strictly preserve all original wall positions, window openings, and door locations. Do NOT add any new windows, doors, or openings that do not exist in the original image. Replace existing furniture with minimal, functional pieces such as a compact daybed, a light desk, or modular storage."
    };

    const A_Structure = `This image is a virtual staging result for a real estate listing. It represents a realistic, achievable furnished version of the original room. Preserve all original wall structures, doors, windows, room openings, and ceiling exactly. Wall surface color and finish may be updated to match the selected interior style defined below, but wall positions, thickness, and openings must not change. The floor surface must always be completely replaced to match the selected interior style defined below — for example, natural wood or stone for organic styles, light oak for Scandinavian, dark walnut for quiet luxury — regardless of the original floor condition, but must maintain the same floor plan, level, and spatial boundaries. Ceiling light fixtures, pendant lights, ceiling fans, and any exposed wiring or bare wire ends on the ceiling must be replaced with a lighting fixture that matches the selected interior style defined below — for example, a woven rattan pendant for biophilic or wabi-sabi, a sleek minimal pendant for quiet luxury or Scandinavian, a vintage-toned fixture for retro modern; do not alter the ceiling structure or height itself. Remove or ignore any loose furniture, movable decor, and personal belongings. Built-in cabinetry, wardrobes, wall paneling, and fixed woodwork may be updated or replaced to match the selected interior style, but must maintain the same spatial position and footprint. Do not expand the room, do not add new windows or doors, do not change the room layout. Stage the space with new furniture and decor that matches the selected style.`;
    const E_Presentation = `Interior staging visualization. High realism, professional real estate presentation. Designed to look like a model home. Visually appealing, aspirational, and marketable. Ceiling remains clean and simple, appropriate to the selected style.`;
    const F_Negative = `Do not include: camera angle change, perspective shift, window shape change, wall structural modification, distorted geometry, warped perspective, bent lines, adding windows, adding doors, adding openings, architectural redesign, new rooms, new partitions, people, animals, text, watermark, logo, fantasy, surreal, cartoon, stylized.`;

    const fullPrompt = `${A_Structure} ${ROOM_PROMPTS[roomKey]} ${STYLE_PROMPTS[styleKey]} ${E_Presentation} ${F_Negative} 8K resolution, ultra high definition.`;
    const body = { prompt: fullPrompt, image_urls: [imageUrl], lora_scale: 0.75, guidance_scale: 2.1, num_inference_steps: 40, num_images: 1, output_format: "png", enable_safety_checker: true };

    try {
      const submitRes = await fetch('https://fal.run/fal-ai/flux-2-lora-gallery/apartment-staging', {
        method: 'POST',
        headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!submitRes.ok) {
        const err = await submitRes.text();
        return res.status(500).json({ error: `效果圖生成失敗：${submitRes.status}` });
      }
      const result = await submitRes.json();
      if (result.request_id) return res.status(200).json({ requestId: result.request_id });
      return res.status(200).json({ imageUrl: result.images?.[0]?.url });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── 輪詢圖生圖狀態 ──
  if (action === 'pollStatus') {
    const { requestId, modelPath } = req.body;
    if (!requestId || !modelPath) return res.status(400).json({ error: '缺少參數' });

    try {
      const statusUrl = `https://fal.run/${modelPath}/requests/${requestId}/status`;
      const statusRes = await fetch(statusUrl, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
      if (!statusRes.ok) return res.status(200).json({ status: 'IN_PROGRESS' });
      const status = await statusRes.json();

      if (status.status === 'COMPLETED') {
        const resultRes = await fetch(`https://fal.run/${modelPath}/requests/${requestId}`, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
        const resultData = await resultRes.json();
        const imageUrl = resultData.images?.[0]?.url || resultData.image?.url || null;
        return res.status(200).json({ status: 'COMPLETED', imageUrl });
      }
      if (status.status === 'FAILED') return res.status(200).json({ status: 'FAILED', error: status.error });
      return res.status(200).json({ status: 'IN_PROGRESS' });
    } catch (err) {
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
