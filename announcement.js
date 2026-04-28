// =============================================
// announcement.js — 公告系統前端模組
// 加入所有頁面：index.html, library.html
// (admin.html 另有管理介面，見 admin-announcement.js)
//
// 使用方式：
//   <script src="/js/announcement.js"></script>
//   在 initAuth() 完成後呼叫：loadAnnouncements()
// =============================================

// ---- CSS 樣式（動態注入）----
const ANNOUNCEMENT_CSS = `
  #asp-announcements {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 0;
    pointer-events: none;
  }

  .asp-banner {
    width: 100%;
    padding: 10px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 13.5px;
    font-family: inherit;
    line-height: 1.4;
    pointer-events: all;
    animation: asp-slide-down 0.35s ease;
  }

  @keyframes asp-slide-down {
    from { transform: translateY(-100%); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }

  .asp-banner.info        { background: #1a56db; color: #fff; }
  .asp-banner.warning     { background: #f59e0b; color: #1c1a10; }
  .asp-banner.maintenance { background: #374151; color: #f9fafb; }
  .asp-banner.success     { background: #059669; color: #fff; }

  .asp-banner-icon { font-size: 16px; flex-shrink: 0; }

  .asp-banner-content { flex: 1; }
  .asp-banner-title   { font-weight: 600; margin-right: 6px; }
  .asp-banner-body    { opacity: 0.9; }

  .asp-banner-close {
    background: none;
    border: none;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 2px 6px;
    flex-shrink: 0;
    transition: opacity 0.2s;
  }
  .asp-banner-close:hover { opacity: 1; }

  /* Modal */
  .asp-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: asp-fade-in 0.25s ease;
  }

  @keyframes asp-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .asp-modal {
    background: #fff;
    border-radius: 12px;
    padding: 32px 28px 24px;
    max-width: 460px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    animation: asp-modal-up 0.3s ease;
    position: relative;
  }

  @keyframes asp-modal-up {
    from { transform: translateY(16px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }

  .asp-modal-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 4px 10px;
    border-radius: 20px;
    margin-bottom: 14px;
  }
  .asp-modal-badge.info        { background: #dbeafe; color: #1d4ed8; }
  .asp-modal-badge.warning     { background: #fef3c7; color: #92400e; }
  .asp-modal-badge.maintenance { background: #f3f4f6; color: #374151; }
  .asp-modal-badge.success     { background: #d1fae5; color: #065f46; }

  .asp-modal-title {
    font-size: 18px;
    font-weight: 700;
    color: #111827;
    margin: 0 0 10px;
  }
  .asp-modal-body {
    font-size: 14px;
    color: #4b5563;
    line-height: 1.65;
    margin: 0 0 24px;
  }
  .asp-modal-btn {
    width: 100%;
    padding: 11px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    background: #111827;
    color: #fff;
    transition: background 0.2s;
  }
  .asp-modal-btn:hover { background: #374151; }

  /* 推播內容區塊往下移（如果有 banner）*/
  body.has-asp-banner { padding-top: var(--asp-banner-height, 0px); }
`;

// ---- 圖示對應 ----
const ICONS = {
  info: '📢',
  warning: '⚠️',
  maintenance: '🔧',
  success: '✅'
};

const LABELS = {
  info: '公告',
  warning: '注意',
  maintenance: '維護通知',
  success: '新功能'
};

// ---- 已關閉的公告（session 層級，不跨頁持久）----
const dismissedIds = new Set(
  JSON.parse(sessionStorage.getItem('asp_dismissed_announcements') || '[]')
);

function saveDismissed() {
  sessionStorage.setItem('asp_dismissed_announcements', JSON.stringify([...dismissedIds]));
}

// ---- 注入 CSS ----
function injectStyles() {
  if (document.getElementById('asp-announcement-styles')) return;
  const style = document.createElement('style');
  style.id = 'asp-announcement-styles';
  style.textContent = ANNOUNCEMENT_CSS;
  document.head.appendChild(style);
}

// ---- 建立 Banner 容器 ----
function ensureContainer() {
  let container = document.getElementById('asp-announcements');
  if (!container) {
    container = document.createElement('div');
    container.id = 'asp-announcements';
    document.body.prepend(container);
  }
  return container;
}

// ---- 更新 body padding（讓內容不被 banner 擋住）----
function updateBodyPadding() {
  const container = document.getElementById('asp-announcements');
  if (!container) return;
  const height = container.offsetHeight;
  document.documentElement.style.setProperty('--asp-banner-height', height + 'px');
  if (height > 0) {
    document.body.classList.add('has-asp-banner');
  } else {
    document.body.classList.remove('has-asp-banner');
  }
}

// ---- 顯示單一 Banner ----
function showBanner(announcement) {
  if (dismissedIds.has(announcement.id)) return;
  const container = ensureContainer();
  const icon = ICONS[announcement.type] || '📢';

  const banner = document.createElement('div');
  banner.className = `asp-banner ${announcement.type}`;
  banner.dataset.id = announcement.id;
  banner.innerHTML = `
    <span class="asp-banner-icon">${icon}</span>
    <span class="asp-banner-content">
      <span class="asp-banner-title">${escapeHtml(announcement.title)}</span>
      ${announcement.body ? `<span class="asp-banner-body">${escapeHtml(announcement.body)}</span>` : ''}
    </span>
    <button class="asp-banner-close" aria-label="關閉">✕</button>
  `;

  banner.querySelector('.asp-banner-close').addEventListener('click', () => {
    dismissedIds.add(announcement.id);
    saveDismissed();
    banner.style.transition = 'opacity 0.25s, max-height 0.3s';
    banner.style.opacity = '0';
    banner.style.maxHeight = '0';
    banner.style.overflow = 'hidden';
    setTimeout(() => { banner.remove(); updateBodyPadding(); }, 320);
  });

  container.appendChild(banner);
  setTimeout(updateBodyPadding, 50);
}

// ---- 顯示 Modal ----
function showModal(announcement) {
  const storageKey = `asp_modal_dismissed_${announcement.id}`;
  if (localStorage.getItem(storageKey)) return; // modal 關閉後跨 session 不再顯示

  const icon = ICONS[announcement.type] || '📢';
  const label = LABELS[announcement.type] || '公告';

  const overlay = document.createElement('div');
  overlay.className = 'asp-modal-overlay';
  overlay.innerHTML = `
    <div class="asp-modal" role="dialog" aria-modal="true">
      <div class="asp-modal-badge ${announcement.type}">${icon} ${label}</div>
      <h2 class="asp-modal-title">${escapeHtml(announcement.title)}</h2>
      ${announcement.body ? `<p class="asp-modal-body">${escapeHtml(announcement.body).replace(/\n/g, '<br>')}</p>` : ''}
      <button class="asp-modal-btn">我知道了</button>
    </div>
  `;

  overlay.querySelector('.asp-modal-btn').addEventListener('click', () => {
    localStorage.setItem(storageKey, '1');
    overlay.style.transition = 'opacity 0.2s';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 220);
  });

  // 點 overlay 背景關閉
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.querySelector('.asp-modal-btn').click();
  });

  document.body.appendChild(overlay);
}

// ---- 工具：防 XSS ----
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- 主入口：載入公告 ----
async function loadAnnouncements() {
  try {
    injectStyles();

    const { data: announcements, error } = await _sb.rpc('get_active_announcements');
    if (error || !announcements?.length) return;

    // Modal 優先顯示（取第一個 show_modal=true 的）
    const modalAnn = announcements.find(a => a.show_modal);
    if (modalAnn) showModal(modalAnn);

    // Banner 顯示所有非 modal（或 modal 的也在 banner 顯示）
    announcements.forEach(ann => {
      if (!ann.show_modal) showBanner(ann);
    });

  } catch (err) {
    console.warn('[Announcement] 載入公告失敗', err);
  }
}

// 視窗 resize 時重算 padding
window.addEventListener('resize', updateBodyPadding);
