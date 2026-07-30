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
      // 日式：牆壁肌理是與北歐最大的視覺區分點，必須保留
      // 移除 Windows 軟裝句，改由 dynamicPrompt 的窗戶數量約束統一處理
      // 2026-07-31：Ceiling light 句尾補上「switched on + 該風格色溫的glow」，避免完成圖燈具無光造成圖生影最後一幀熄燈
      japanese_muji_wabi_sabi: "Style: Muji-inspired wabi-sabi interior, quiet and bright. Walls must have a subtle handcrafted texture — uneven plaster, pale clay, cool grey plaster, or washi-like surface — tones from warm white to muted grey, never smooth painted white. Floors are hand-scraped natural wood, pale worn stone, or linen-textured stone tiles. Natural wood furniture and organic linen or cotton fabrics ground the space. Spatial emptiness and generous negative space are essential — furniture must be minimal, never crowded. A few imperfect handmade ceramics may accent the space. Ceiling light: a single handcrafted pendant in natural fiber or washi paper — soft organic form, warm white glow, natural cord. The fixture is switched on, its warm white glow visibly diffusing across the ceiling. Never metallic, never geometric, never exposed bulb, never woven rattan, never sculptural.",

      // 自然系：補回 terracotta 色彩錨點和 non-embedded 家具約束
      // 移除 Windows 軟裝句
      natural_biophilic: "Style: High-end Natural Biophilic interior, sunlit and restorative. Palette: terracotta, moss green, and deep oat layered over a soft white base — never bright white, never cool grey. Floors are light stone, sand-toned tiles, worn concrete, or warm wood planks with visible grain. At least one living plant must be present as a standalone focal point — greenery is essential to this style. Artisan accents in natural materials complement the space. Ceiling light: a single open-weave natural material pendant — visibly textured, warm amber or honey tone, substantial as a statement piece. The fixture is switched on, casting a warm amber glow onto the ceiling and surrounding surfaces. Never smooth, never metallic, never washi paper, never geometric, never exposed filament.",

      // 北歐：補回輕盈布料氛圍（改用 fabric / textile 而非 curtains）和軟裝密度
      // 補充 throws / cushions 讓空間不空曠
      // 移除 Windows 軟裝句
      scandinavian_warm: "Style: High-end Warm Scandinavian apartment. White is the dominant base — warm sand beige and soft oat are accents only, never the main tone. Floors are pale ash or light oak wood planks. Warm wood furniture, soft knit or woven throws, and one or two cushions in oat or sand tones must be present to create warmth — the space should feel bright, airy, and softly textured, never earthy, never terracotta, never organic. One artisanal accent placed asymmetrically as the sole decorative statement. Ceiling light: a single clean geometric pendant in matte white or warm brass — minimal, simple cord or thin rod. The fixture is switched on, emitting a soft warm white glow. Never organic, never exposed filament, never woven natural fiber, never sculptural.",

      // Quiet Luxury：補回牆面保護和燈光打材質對比兩句
      // 移除 Windows 軟裝句
      modern_quiet_luxury: "Style: High-end Modern Quiet Luxury, aspirational show-home quality. Wall surfaces may be treated with flat cladding — marble slab, stone panel, dark wood veneer, or mirror — flush with the wall plane, no protruding structure. Floors are polished marble, veined stone, large-format grey stone tiles, or warm taupe tiles. Matte and polished surface contrast is essential — combine both so lighting highlights material quality. Palette: cool greys, warm taupe, and charcoal with subtle metallic undertones. Furniture is standalone with refined proportions. Ceiling light: a single pendant in refined metallic or glass — precise finish, smoked or frosted diffuser. The fixture is switched on, casting a refined soft glow through the diffuser onto the ceiling. Never organic, never woven, never exposed filament, never handmade-looking.",

      // 台味復古：補回新舊平衡指示和 non-embedded 約束
      // 移除 Windows 軟裝句
      retro_modern_tw: "Style: Retro modern with subtle Taiwanese character. Floors are vintage ceramic tiles, terrazzo with warm aggregate, or aged wood planks — essential to this style. Wall surfaces may carry aged character through lime wash, worn paint, bare cement, or a tile waistband — flat surface texture only, no structural protrusion. Balance nostalgic atmosphere with modern cleanliness — story-rich but livable, never dark or oppressive. Ceiling light: a single pendant with nostalgic character — warm amber glow, aged or industrial material, twisted fabric cord. The fixture is switched on, its warm amber glow visible on the ceiling. Never sleek, never modern-minimal, never washi paper, never woven natural fiber.",

      // 韓系：補回 LED coves 和奶油光線質感
      // 移除 Windows 軟裝句，改用光線質感描述傳達霧感氛圍
      korean_instagrammable_adult: "Style: High-end Instagrammable modern adult apartment. Palette: warm milk, oatmeal, and muted blush — creamy Morandi tones are essential, never bright white, never cool grey. Floors are warm oat stone, pale micro-cement, or smooth light wood. Furniture must feature sculptural curved silhouettes — this is the defining visual characteristic. Where ceiling allows, include LED cove strips for soft diffused ambient glow. Ceiling light: a single sculptural pendant in creamy white or warm off-white — smooth matte finish, no visible bulb. The fixture is switched on, diffusing a soft creamy warm glow. Never metallic, never woven natural material, never exposed filament, never geometric-minimal, never rustic."
    };

    const ROOM_PROMPTS = {
      // 床是必須焦點，地毯錨定空間，獨立衣櫃保留，崁入式保護
      bedroom: "Bedroom: bed is the main focal point. Add nightstands, a freestanding wardrobe or clothing rack if space allows, and a small vanity. An area rug under the bed anchors the space. Do not add built-in or wall-embedded storage unless already in the original image.",
      // 沙發區必須清楚，地毯是必要錨點，媒體櫃/矮櫃增加視覺平衡
      living_room: "Living Room: sofa seating area is the main focal point. An area rug under the sofa is essential to anchor the zone. Add a coffee table, side tables, and accent chairs based on room size. Include a media unit or low sideboard for visual balance.",
      // 餐桌吊燈位置是餐廳的視覺焦點指令，矮櫃增加層次
      dining_room: "Dining Room: dining table with chairs is the main focal point. The ceiling light hangs directly above the dining table. Include a sideboard or console along a wall if space allows.",
      // 廚房結構保護最重要，檯面生活感維持
      kitchen: "Kitchen: preserve all existing cabinetry and layout exactly — do not add counters, islands, or bar structures that do not exist in the original. Style countertop with minimal lifestyle objects such as a coffee machine, cutting board, or small plant.",
      // 書桌必須，書架建議，桌面有使用感
      study: "Study: desk and chair are the primary elements. Include a freestanding bookshelf for storage. Add a desk lamp and one or two functional accessories to suggest active use.",
      // 輕量多用途，不要重型家具
      multi_purpose: "Multi-purpose Room: a compact daybed or sofa bed is the primary piece. Keep floor space open. Add one lightweight shelf or storage unit. A floor lamp or small lifestyle object suggests flexible use."
    };

    // 餐廳、廚房不應出現懸掛布料或半透明遮蓋物
    // 這裡用不含 curtain / window 觸發詞的語言覆蓋 style prompt 的軟裝描述
    const NO_FABRIC_ROOMS = new Set(['dining_room', 'kitchen']);

    // 各風格窗簾描述：只在 vision 偵測到有窗戶時才帶入，避免模型腦補不存在的窗戶
    const WINDOW_TREATMENTS = {
      japanese_muji_wabi_sabi: "Window treatment on existing windows only: undyed or pale grey-white sheer in unbleached linen or cotton — soft and understated, barely-there presence. Never patterned, never opaque, never crisp or tailored.",
      natural_biophilic:       "Window treatment on existing windows only: warm oat or terracotta-toned sheer or linen panel — loosely draped with organic texture, light-filtering. Never bright white, never crisp or tailored, never metallic or synthetic-looking.",
      scandinavian_warm:       "Window treatment on existing windows only: clean white or warm sand sheer — lightweight and airy, minimal flat panel, crisp and tidy. Never heavy, never patterned, never loosely draped or organic in character.",
      modern_quiet_luxury:     "Window treatment on existing windows only: floor-to-ceiling panel in cool grey or warm taupe — structured and tailored drape, matte or subtle sheen, refined and hotel-like. Never casual, never sheer-only, never natural fiber texture or loosely hung.",
      retro_modern_tw:         "Window treatment on existing windows only: warm ivory or aged white cotton or linen — slightly relaxed drape with a lived-in, unhurried quality. Never sleek or modern-tailored, never synthetic, never crisp or hotel-like.",
      korean_instagrammable_adult: "Window treatment on existing windows only: creamy white or blush-tinted sheer — smooth and softly light-diffusing, minimal and editorial in quality. Never patterned, never heavy or opaque, never rustic or natural-textured, never loosely draped."
    };

    const A_Structure = `Stage this empty room with furniture and decor matching the style below. Replace floor with style-appropriate material. Replace ceiling fixture with one single style-appropriate light. Remove all wires, cables, clutter, and non-structural objects from walls. Preserve exact camera angle, geometry, and proportions — do not widen, deepen, or enlarge the space. All walls, windows, doors, and openings must match the original exactly in count, position, size, and shape — no additions, removals, or relocations. Do not add openings, doorways, arches, or door-shaped forms of any kind. Do not alter existing openings. Do not add built-in wardrobes or wall-embedded cabinetry unless instructed below. Do not include people, animals, text, watermark, or fantasy. Do not add window treatments to non-window wall surfaces.`;
    const E_Presentation = `Interior staging visualization. High realism, professional real estate presentation. Designed to look like a model home. Visually appealing, aspirational, and marketable. Ceiling remains clean and simple, appropriate to the selected style.`;

    let dynamicPrompt = '';
    if (USE_VISION_PROMPT && visionFeatures) {
      if (visionFeatures.has_exposed_wires) {
        dynamicPrompt += ' Remove all exposed wires and cables from walls and ceiling.';
      }
      if (visionFeatures.has_builtin_wardrobe) {
        dynamicPrompt += ' If there is an existing built-in wardrobe, retain its position and restyle it to match the selected style.';
      }

      // 窗戶數量約束 + 窗簾控制
      const wc = visionFeatures.window_count;
      if (typeof wc === 'number') {
        if (wc === 0) {
          dynamicPrompt += ' The original room has no windows. Do not add any windows, window-shaped openings, curtains, drapes, or any translucent light-diffusing fabric on walls.';
        } else if (wc === 1) {
          dynamicPrompt += ' The original room has exactly 1 window. Keep exactly 1 window in its original position, size, and shape — do not add, remove, or reposition it.';
          if (!NO_FABRIC_ROOMS.has(roomKey) && WINDOW_TREATMENTS[styleKey]) {
            dynamicPrompt += ' ' + WINDOW_TREATMENTS[styleKey];
          }
        } else {
          dynamicPrompt += ` The original room has exactly ${wc} windows. All ${wc} windows must remain in their original positions, sizes, and shapes — do not add, remove, or reposition any of them.`;
          if (!NO_FABRIC_ROOMS.has(roomKey) && WINDOW_TREATMENTS[styleKey]) {
            dynamicPrompt += ' ' + WINDOW_TREATMENTS[styleKey];
          }
        }
      } else {
        // window_count 未知（vision 失敗或未回傳）：保守禁令，只在明確可見的窗戶上允許窗簾
        dynamicPrompt += ' Do not add curtains, drapes, or window treatments to any wall surface that does not have a clearly visible window in the original image.';
      }

      // 通道數量約束
      const pc = visionFeatures.passage_count;
      if (typeof pc === 'number') {
        if (pc === 1) {
          dynamicPrompt += ' The original room has exactly 1 doorway or passage. Keep it open and in its original position — do not block, close, or alter it.';
        } else if (pc >= 2) {
          dynamicPrompt += ` The original room has exactly ${pc} doorways or passages. All ${pc} must remain open and in their original positions — do not block, close, or alter any of them.`;
        }
      }
    }

    // 餐廳、廚房：用不含觸發詞的語言明確排除懸掛布料與半透明遮蓋物
    // 此句放在最後，確保覆蓋 style prompt 裡的軟裝描述
    if (NO_FABRIC_ROOMS.has(roomKey)) {
      dynamicPrompt += ' All wall surfaces and structural openings in this room are bare and unobstructed. Do not place any hanging fabric, sheer panels, or translucent coverings on any surface or opening.';
    }

    const fullPrompt = `${A_Structure}${dynamicPrompt} ${ROOM_PROMPTS[roomKey]} ${STYLE_PROMPTS[styleKey]} ${E_Presentation}`;
    // 2026-07-31：guidance_scale 由 2.1 調整為 2.3（fal 官方預設為 2.5）進行測試。
    // 2.1 低於官方預設，會弱化 A_Structure 裡的「camera angle / geometry 保留」指令，
    // 是完成圖與空屋位置角度不一致的主要疑點。2.3 為折衷測試值，
    // 若位移仍未改善可再往 2.5 調；若軟裝變化度明顯下降，再退回 2.1～2.2。
    const body = { prompt: fullPrompt, image_urls: [imageUrl], lora_scale: 0.75, guidance_scale: 2.3, num_inference_steps: 40, num_images: 1, output_format: "png", enable_safety_checker: true };

    try {
      // 使用 queue.fal.run 非同步提交，立即取得 request_id，不等待生成結果
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
      async function uploadBase64ToFal(base64DataUrl) {
        const matches = base64DataUrl.match(/^data:(.+);base64,(.+)$/);
        if (!matches) throw new Error('無效的 base64 格式');
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const ext = mimeType.split('/')[1] || 'png';
        const filename = `upload_${Date.now()}.${ext}`;

        const initRes = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
          method: 'POST',
          headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_name: filename, content_type: mimeType })
        });
        if (!initRes.ok) throw new Error('無法取得上傳 URL');
        const { upload_url, file_url } = await initRes.json();

        const uploadRes = await fetch(upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          body: buffer
        });
        if (!uploadRes.ok) throw new Error('圖片上傳失敗');
        return file_url;
      }

      let finalStartUrl = startImageUrl;
      if (startImageUrl.startsWith('data:')) {
        finalStartUrl = await uploadBase64ToFal(startImageUrl);
        console.log('startImage 上傳完成:', finalStartUrl);
      }

      const submitRes = await fetch('https://queue.fal.run/fal-ai/kling-video/o1/image-to-video', {
        method: 'POST',
        headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Interior staging transformation. Static camera, no camera movement. The space naturally transforms from its original state into a fully staged ${styleLabel} interior. New furniture enters smoothly. High realism, professional real estate visualization.`,
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
      const statusUrl = clientStatusUrl
        || `https://queue.fal.run/fal-ai/kling-video/o1/image-to-video/requests/${requestId}/status`;
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
        const resultUrl = clientResponseUrl
          || `https://queue.fal.run/fal-ai/kling-video/o1/image-to-video/requests/${requestId}`;
        const resultRes = await fetch(resultUrl, { headers: { 'Authorization': `Key ${FAL_KEY}` } });
        const resultData = await resultRes.json();
        console.log('pollVideoStatus - resultData:', JSON.stringify(resultData).slice(0, 300));
        const videoUrl = resultData.video?.url
          || resultData.data?.video?.url
          || resultData.output?.video?.url
          || null;
        console.log('pollVideoStatus - videoUrl:', videoUrl);
        if (!videoUrl) {
          return res.status(200).json({ status: 'FAILED', error: `取得影片URL失敗，resultData: ${JSON.stringify(resultData).slice(0,200)}` });
        }
        return res.status(200).json({ status: 'COMPLETED', videoUrl });
      }
      if (statusVal === 'FAILED') return res.status(200).json({ status: 'FAILED', error: status.error || status.detail });
      return res.status(200).json({ status: 'IN_PROGRESS' });
    } catch (err) {
      console.error('pollVideoStatus error:', err.message);
      return res.status(200).json({ status: 'FAILED', error: 'pollVideoStatus 發生錯誤：' + err.message });
    }
  }

  return res.status(400).json({ error: '無效的 action' });
}
