// =============================================
// admin-announcement.js — Admin 公告管理模組
// 加入 admin.html，讓 admin/manager 可以管理公告
//
// 使用方式：
//   1. admin.html 加入 <script src="/js/admin-announcement.js"></script>
//   2. 在頁面適當位置加入：<div id="announcement-section"></div>
//   3. initAuth 完成後呼叫：initAnnouncementAdmin()
// =============================================

const ANN_TYPES = {
  info:        { label: '一般公告', icon: '📢', color: '#1a56db' },
  success:     { label: '新功能',   icon: '✅', color: '#059669' },
  warning:     { label: '注意事項', icon: '⚠️', color: '#d97706' },
  maintenance: { label: '維護通知', icon: '🔧', color: '#374151' },
};

// ---- 注入 Admin 公告 CSS ----
function injectAdminAnnCSS() {
  if (document.getElementById('asp-admin-ann-css')) return;
  const style = document.createElement('style');
  style.id = 'asp-admin-ann-css';
  style.textContent = `
    #announcement-section {
      font-family: inherit;
    }
    .ann-section-title {
      font-size: 18px;
      font-weight: 700;
      color: #111827;
      margin: 0 0 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ann-toolbar {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 16px;
    }
    .ann-btn-primary {
      background: #111827;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 9px 18px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .ann-btn-primary:hover { background: #374151; }

    .ann-list { display: flex; flex-direction: column; gap: 10px; }

    .ann-card {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 14px 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: #fff;
      transition: box-shadow 0.2s;
    }
    .ann-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .ann-card.inactive { opacity: 0.5; }

    .ann-card-left { flex: 1; min-width: 0; }
    .ann-card-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 12px;
      background: #f3f4f6;
      color: #374151;
      margin-bottom: 6px;
    }
    .ann-card-title {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      margin: 0 0 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ann-card-meta {
      font-size: 12px;
      color: #9ca3af;
    }
    .ann-card-actions { display: flex; gap: 6px; flex-shrink: 0; }
    .ann-btn-sm {
      border: 1px solid #e5e7eb;
      background: #fff;
      color: #374151;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .ann-btn-sm:hover { background: #f9fafb; border-color: #d1d5db; }
    .ann-btn-sm.danger { color: #dc2626; }
    .ann-btn-sm.danger:hover { background: #fef2f2; border-color: #fca5a5; }
    .ann-btn-sm.activate { color: #059669; }
    .ann-btn-sm.activate:hover { background: #f0fdf4; }

    .ann-empty {
      text-align: center;
      padding: 40px 20px;
      color: #9ca3af;
      font-size: 14px;
    }

    /* Modal 表單 */
    .ann-form-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .ann-form-modal {
      background: #fff;
      border-radius: 12px;
      padding: 28px 24px;
      width: 100%;
      max-width: 500px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    }
    .ann-form-title {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
      margin: 0 0 20px;
    }
    .ann-form-group {
      margin-bottom: 14px;
    }
    .ann-form-group label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 6px;
    }
    .ann-form-group input,
    .ann-form-group textarea,
    .ann-form-group select {
      width: 100%;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 9px 12px;
      font-size: 14px;
      color: #111827;
      outline: none;
      transition: border-color 0.2s;
      box-sizing: border-box;
      font-family: inherit;
    }
    .ann-form-group input:focus,
    .ann-form-group textarea:focus,
    .ann-form-group select:focus {
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
    }
    .ann-form-group textarea { resize: vertical; min-height: 80px; }
    .ann-form-row { display: flex; gap: 10px; }
    .ann-form-row .ann-form-group { flex: 1; }
    .ann-checkbox-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: #374151;
      margin-bottom: 14px;
      cursor: pointer;
    }
    .ann-checkbox-row input { width: auto; }
    .ann-form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
    }
    .ann-btn-cancel {
      background: #f3f4f6;
      color: #374151;
      border: none;
      border-radius: 8px;
      padding: 9px 18px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .ann-btn-cancel:hover { background: #e5e7eb; }
  `;
  document.head.appendChild(style);
}

// ---- 格式化日期 ----
function fmtDate(ts) {
  if (!ts) return '永久';
  return new Date(ts).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

// ---- 主初始化 ----
async function initAnnouncementAdmin() {
  injectAdminAnnCSS();
  const section = document.getElementById('announcement-section');
  if (!section) return;

  section.innerHTML = `
    <h2 class="ann-section-title">📣 公告管理</h2>
    <div class="ann-toolbar">
      <button class="ann-btn-primary" onclick="openAnnForm()">＋ 新增公告</button>
    </div>
    <div class="ann-list" id="ann-list">
      <div class="ann-empty">載入中…</div>
    </div>
  `;

  await renderAnnList();
}

// ---- 渲染公告列表（含非啟用的）----
async function renderAnnList() {
  const listEl = document.getElementById('ann-list');
  if (!listEl) return;

  const { data, error } = await _sb
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data?.length) {
    listEl.innerHTML = `<div class="ann-empty">尚無公告</div>`;
    return;
  }

  listEl.innerHTML = data.map(ann => {
    const typeInfo = ANN_TYPES[ann.type] || ANN_TYPES.info;
    const isActive = ann.is_active &&
      new Date(ann.starts_at) <= new Date() &&
      (!ann.ends_at || new Date(ann.ends_at) > new Date());

    return `
      <div class="ann-card ${isActive ? '' : 'inactive'}" data-id="${ann.id}">
        <div class="ann-card-left">
          <div class="ann-card-badge">${typeInfo.icon} ${typeInfo.label}${ann.show_modal ? ' · 彈窗' : ''}</div>
          <div class="ann-card-title">${escapeHtml(ann.title)}</div>
          <div class="ann-card-meta">
            ${isActive ? '🟢 顯示中' : '⚪ 未啟用'} ·
            開始 ${fmtDate(ann.starts_at)} ·
            結束 ${fmtDate(ann.ends_at)}
          </div>
        </div>
        <div class="ann-card-actions">
          <button class="ann-btn-sm ${ann.is_active ? 'danger' : 'activate'}"
            onclick="toggleAnn('${ann.id}', ${ann.is_active})">
            ${ann.is_active ? '停用' : '啟用'}
          </button>
          <button class="ann-btn-sm" onclick="openAnnForm('${ann.id}')">編輯</button>
          <button class="ann-btn-sm danger" onclick="deleteAnn('${ann.id}')">刪除</button>
        </div>
      </div>
    `;
  }).join('');
}

// ---- 開啟表單（新增或編輯）----
async function openAnnForm(id = null) {
  let ann = { title: '', body: '', type: 'info', is_active: true, show_modal: false, starts_at: '', ends_at: '' };

  if (id) {
    const { data } = await _sb.from('announcements').select('*').eq('id', id).single();
    if (data) ann = data;
  }

  const toLocalDatetime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const overlay = document.createElement('div');
  overlay.className = 'ann-form-overlay';
  overlay.id = 'ann-form-overlay';
  overlay.innerHTML = `
    <div class="ann-form-modal">
      <div class="ann-form-title">${id ? '編輯公告' : '新增公告'}</div>

      <div class="ann-form-group">
        <label>標題 *</label>
        <input id="ann-f-title" type="text" placeholder="公告標題" value="${escapeHtml(ann.title)}">
      </div>

      <div class="ann-form-group">
        <label>內容（選填）</label>
        <textarea id="ann-f-body" placeholder="詳細說明…">${escapeHtml(ann.body || '')}</textarea>
      </div>

      <div class="ann-form-row">
        <div class="ann-form-group">
          <label>類型</label>
          <select id="ann-f-type">
            ${Object.entries(ANN_TYPES).map(([k, v]) =>
              `<option value="${k}" ${ann.type === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`
            ).join('')}
          </select>
        </div>
        <div class="ann-form-group">
          <label>開始時間</label>
          <input id="ann-f-starts" type="datetime-local" value="${toLocalDatetime(ann.starts_at)}">
        </div>
      </div>

      <div class="ann-form-group">
        <label>結束時間（留空 = 永久顯示）</label>
        <input id="ann-f-ends" type="datetime-local" value="${toLocalDatetime(ann.ends_at)}">
      </div>

      <label class="ann-checkbox-row">
        <input id="ann-f-modal" type="checkbox" ${ann.show_modal ? 'checked' : ''}>
        顯示為彈出視窗（重要通知用）
      </label>

      <label class="ann-checkbox-row">
        <input id="ann-f-active" type="checkbox" ${ann.is_active ? 'checked' : ''}>
        立即啟用
      </label>

      <div class="ann-form-actions">
        <button class="ann-btn-cancel" onclick="closeAnnForm()">取消</button>
        <button class="ann-btn-primary" onclick="saveAnn('${id || ''}')">
          ${id ? '儲存變更' : '新增公告'}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

function closeAnnForm() {
  document.getElementById('ann-form-overlay')?.remove();
}

// ---- 儲存公告 ----
async function saveAnn(id) {
  const title = document.getElementById('ann-f-title').value.trim();
  if (!title) { alert('請輸入公告標題'); return; }

  const body = document.getElementById('ann-f-body').value.trim();
  const type = document.getElementById('ann-f-type').value;
  const starts_at = document.getElementById('ann-f-starts').value || new Date().toISOString();
  const ends_at = document.getElementById('ann-f-ends').value || null;
  const show_modal = document.getElementById('ann-f-modal').checked;
  const is_active = document.getElementById('ann-f-active').checked;

  const payload = { title, body: body || null, type, is_active, show_modal, starts_at, ends_at };

  let error;
  if (id) {
    ({ error } = await _sb.from('announcements').update(payload).eq('id', id));
  } else {
    payload.created_by = (await _sb.auth.getUser()).data?.user?.id;
    ({ error } = await _sb.from('announcements').insert(payload));
  }

  if (error) { alert('儲存失敗：' + error.message); return; }

  closeAnnForm();
  await renderAnnList();
}

// ---- 切換啟用/停用 ----
async function toggleAnn(id, currentActive) {
  const { error } = await _sb
    .from('announcements')
    .update({ is_active: !currentActive })
    .eq('id', id);

  if (error) { alert('操作失敗：' + error.message); return; }
  await renderAnnList();
}

// ---- 刪除公告 ----
async function deleteAnn(id) {
  if (!confirm('確定要刪除這則公告？')) return;

  const { error } = await _sb.from('announcements').delete().eq('id', id);
  if (error) { alert('刪除失敗：' + error.message); return; }
  await renderAnnList();
}

// ---- 工具：防 XSS ----
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
