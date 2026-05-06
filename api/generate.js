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
      japanese_muji_wabi_sabi: "Style: Muji-inspired wabi-sabi interior with a quiet morning atmosphere that feels bright yet calm. Walls have a subtle handcrafted texture — uneven plaster, pale clay, cool grey plaster, or washi-like surface — tones ranging from warm white to muted grey, never smooth painted white. Floors are hand-scraped or subtly aged natural wood, pale worn stone, or fine linen-textured stone tiles — surfaces that carry a quiet sense of time. Natural wood furniture and organic linen or cotton fabrics ground the space, while a few imperfect handmade ceramics add a gentle sense of time. No single material dominates; each complements the others in an understated, balanced composition. Prioritize spatial emptiness with generous negative space. Ceiling light: a single handcrafted pendant in natural fiber or washi paper — soft organic form, warm white diffused glow, natural cord. Never metallic, never geometric, never exposed bulb, never woven rattan, never sculptural or editorial in character.",

      // 自然系：補回 terracotta 色彩錨點和 non-embedded 家具約束
      // 移除 Windows 軟裝句
      natural_biophilic: "Style: High-end Natural Biophilic interior with a sunlit, restorative atmosphere. Palette: muted earth tones — terracotta, moss green, and deep oat — layered over a soft white base, so warm and cool earth tones balance each other rather than match. Floors use natural materials appropriate to the space — light stone, pale sand-toned tiles, worn concrete, or warm wood planks with visible grain. Greenery and artisan accents in natural materials serve as standalone, minimalist focal points. All furniture must be non-embedded with realistic depths and functional proportions. Ceiling light: a single pendant in open-weave natural material — visibly textured surface, warm amber or honey tone, substantial presence as a statement piece. Never smooth, never metallic, never washi paper, never geometric, never exposed filament bulb.",

      // 北歐：補回輕盈布料氛圍（改用 fabric / textile 而非 curtains）和軟裝密度
      // 補充 throws / cushions 讓空間不空曠
      // 移除 Windows 軟裝句
      scandinavian_warm: "Style: High-end Warm Scandinavian urban apartment with a palette of clear whites, warm sand beige, and soft oat neutrals. Floors are pale ash or light oak wood planks, clean and seamless. Layer cool-white surfaces with warm wood furniture, soft knit or woven throws, and one or two cushions in oat or sand tones to create warmth and depth without cluttering the space. Fabrics throughout are lightweight, airy, and white or warm neutral in tone — the space feels bright and softly textured. One high-quality artisanal accent is placed asymmetrically as the sole decorative statement. Ceiling light: a single pendant with clean geometric silhouette in matte white or warm brass — minimal surface detail, simple cord or thin rod. Never organic or handmade-looking, never exposed filament, never woven natural fiber, never sculptural or asymmetric.",

      // Quiet Luxury：補回牆面保護和燈光打材質對比兩句
      // 移除 Windows 軟裝句
      modern_quiet_luxury: "Style: High-end Modern Quiet Luxury interior with a sunlit, aspirational show-home glow. Strictly maintain original flat wall structures — do not add panels, cladding, or surface treatments to walls. Floors are seamless cool grey stone, large-format warm taupe tiles, or polished concrete — refined and grounded. Palette spans cool greys, warm taupe, and charcoal with subtle metallic undertones — combine matte and polished surfaces so sophisticated lighting highlights the material contrast. Furniture must be standalone with realistic depths. Ceiling light: a single pendant with refined metallic or glass construction — precise engineered finish, smoked or frosted diffuser, cool or warm metallic tone. Never organic, never woven, never exposed filament, never handmade-looking, never whimsical or asymmetric.",

      // 台味復古：補回新舊平衡指示和 non-embedded 約束
      // 移除 Windows 軟裝句
      retro_modern_tw: "Style: Retro modern with subtle Taiwanese character. Hints of vintage atmosphere through furniture, colors, or textures — not through structural changes. Floors are vintage-patterned ceramic tiles, terrazzo with warm aggregate, or aged wood planks — surfaces that carry memory and place. Balance nostalgic elements with modern cleanliness so the space feels story-rich but still livable and uncluttered. All vintage-inspired furniture must be standalone with realistic depths. Ceiling light: a single pendant with visible nostalgic character — warm amber glow, aged or industrial material quality, twisted fabric cord or period-appropriate hardware. Never sleek, never modern-minimal, never washi paper, never woven natural fiber, never sculptural plaster or resin.",

      // 韓系：補回 LED coves 和奶油光線質感
      // 移除 Windows 軟裝句，改用光線質感描述傳達霧感氛圍
      korean_instagrammable_adult: "Style: High-end Instagrammable modern adult apartment with a creamy Morandi palette of warm milk, oatmeal, and muted blush. Floors are seamless warm oat stone, pale micro-cement, or smooth light wood — refined and minimal. Layer smooth and softly textured surfaces; combine curved and linear forms so the composition feels visually rich but cohesive rather than flat. Furniture features sculptural, curved silhouettes as a defining characteristic. Lighting may include LED cove strips that cast a soft, diffused glow along ceilings or walls, creating the warm, hazy, editorial ambiance characteristic of this style. Ceiling light: a single pendant with sculptural or art-object quality in creamy white or warm off-white — smooth matte finish, soft diffused glow, no visible bulb. Never metallic, never woven or textured natural material, never exposed filament, never geometric-minimal, never handmade or rustic in character."
    };

    const ROOM_PROMPTS = {
      bedroom: "Room type: Bedroom. Primarily used for sleeping. A bed must be the main focal point — sized appropriately for the room. Integrate secondary freestanding pieces: nightstands on each side of the bed, a freestanding wardrobe or clothing rack if floor space allows, and a small vanity or stool. Add a area rug under or in front of the bed to anchor the space. A bed-end bench or low ottoman adds layering if space permits. Do not add any built-in or wall-embedded storage unless it already exists in the original image.",
      living_room: "Room type: Living Room. Used for relaxing and socializing. A sofa seating area must be clearly defined as the main focal point. An area rug must be placed under or in front of the sofa to anchor the seating zone — this is essential. Integrate supporting freestanding furniture: a coffee table, side tables, and accent chairs or a chaise based on room size. Add a media unit, low sideboard, or display shelf along a wall for visual balance. One or two decorative plants or art objects complete the space.",
      // dining_room 和 kitchen 的軟裝禁制已移出 ROOM_PROMPTS
      // 改由下方 NO_FABRIC_ROOMS 機制在 dynamicPrompt 處理，避免觸發詞問題
      dining_room: "Room type: Dining Room. Used for dining and gathering. A dining table with chairs is the main focal point — sized to fit the room comfortably. The ceiling light must hang directly above the dining table as the visual anchor of the space. Include a sideboard, console, or display cabinet along a wall if space allows. A piece of wall art or mirror above the sideboard adds depth. Keep floor space clear and uncluttered.",
      kitchen: "Room type: Kitchen. Used for food preparation. Do not redesign the kitchen layout or cabinetry; preserve the existing structural placement exactly. Do not add any new counters, islands, bar structures, or bar stools that do not exist in the original image. Style the countertop with a small selection of lifestyle objects — such as a coffee machine, cutting board, ceramic canister set, small potted herb, or fruit bowl — to give the space a lived-in, aspirational feel without cluttering the work surface.",
      study: "Room type: Study. Used for working or reading. A desk and chair must be present as the primary functional elements — positioned to make use of natural light if possible. A freestanding bookshelf or open shelving unit should be included for storage and visual richness. Style the desk surface with a small selection of functional objects — a desk lamp, notebook, small plant, or pen holder — to suggest active use. A small side table or reading chair adds comfort if space allows.",
      multi_purpose: "Room type: Multi-purpose Room. A flexible space for guests, hobbies, or light work — not a dedicated bedroom or living room. A compact daybed, sofa bed, or floor cushion seating serves as the primary piece. Keep the floor plan open and adaptable — avoid heavy or space-dominating furniture. Add one lightweight freestanding shelf or low storage unit. Small lifestyle objects such as a yoga mat, folding tray table, or floor lamp suggest flexible use without locking the space into a single function. The overall feeling should be light, versatile, and uncluttered."
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

    const A_Structure = `Stage this empty room with furniture and decor matching the style below. Replace floor with style-appropriate material. Replace ceiling fixture with one single style-appropriate light. Preserve exact architectural geometry, proportions, and camera angle without modification. The field of view, perspective, and room dimensions must remain identical to the original image — do not widen, deepen, or enlarge the space in any way. Keep all walls, windows, and doors exactly as shown — same count, same position, same size, same shape. Do not add any new openings, doorways, arches, or passages of any kind. Do not alter or remove any existing openings. Do not add any built-in wardrobes, recessed shelving, or wall-embedded cabinetry unless explicitly instructed below. Remove all wires, cables, clutter, and non-structural objects from walls.`;
    const E_Presentation = `Interior staging visualization. High realism, professional real estate presentation. Designed to look like a model home. Visually appealing, aspirational, and marketable. Ceiling remains clean and simple, appropriate to the selected style.`;
    const F_Negative = `The number of walls, openings, windows, and doorways must exactly match the original image — no additions, no removals, no relocations. Do not create any new opening or door-shaped form on any wall surface. Do not include: people, animals, text, watermark, fantasy, cartoon. Do not add window treatments to doorways or wall surfaces that are not windows.`;

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

    const fullPrompt = `${A_Structure} ${F_Negative}${dynamicPrompt} ${ROOM_PROMPTS[roomKey]} ${STYLE_PROMPTS[styleKey]} ${E_Presentation}`;
    const body = { prompt: fullPrompt, image_urls: [imageUrl], lora_scale: 0.75, guidance_scale: 2.1, num_inference_steps: 40, num_images: 1, output_format: "png", enable_safety_checker: true };

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
