'use strict';

/* ── API CLIENT ── */
const API_BASE_URL = window.GEO_CONFIG.API_BASE_URL;
const API_PATH_PREFIX = '/api/v1/geo';

function buildApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const apiPath = normalizedPath.startsWith(API_PATH_PREFIX)
    ? normalizedPath
    : `${API_PATH_PREFIX}${normalizedPath}`;
  return `${API_BASE_URL}${apiPath}`;
}

function clearAuthState() {
  localStorage.removeItem('geoAccessToken');
  localStorage.removeItem('geoOrders');
}

(function persistAccessTokenFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('accessToken');
  const oauthError = params.get('oauthError');

  if (accessToken) {
    clearAuthState();
    localStorage.setItem('geoAccessToken', accessToken);

    // URL에서 토큰 제거
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (oauthError) {
    const errMsg = document.getElementById('errMsg');
    if (errMsg) {
      errMsg.textContent = 'Google 로그인 세션이 만료되었습니다. 다시 로그인해 주세요.';
      errMsg.classList.add('show');
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }
})();

async function requestJson(path, options = {}) {
  const token = localStorage.getItem('geoAccessToken');
  const res = await fetch(buildApiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message = data?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function unwrapApiData(data) {
  return data?.data ?? data?.result ?? data;
}

function persistAccessTokenFromResponse(data) {
  const token = data?.token || data?.accessToken;
  if (token) {
    localStorage.setItem('geoAccessToken', token);
  }
  return token;
}

function normalizeOrdersResponse(data) {
  const resolved = unwrapApiData(data);
  if (Array.isArray(resolved)) return resolved;
  if (Array.isArray(resolved?.orders)) return resolved.orders;
  if (Array.isArray(resolved?.items)) return resolved.items;
  return [];
}

function buildResultPageUrl(orderId) {
  if (!orderId) return 'geo-result.html';
  return `geo-result.html?orderId=${encodeURIComponent(orderId)}`;
}

function getOrderIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('orderId');
}

function normalizeOrderStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed' || normalized === 'success' || normalized === 'done') return 'done';
  if (normalized === 'failed' || normalized === 'error') return 'queued';
  if (normalized === 'in_progress' || normalized === 'progress' || normalized === 'processing') return 'progress';
  if (normalized === 'queued' || normalized === 'pending') return 'queued';
  return normalized || 'queued';
}

function hasCompletedReport(data) {
  const report = unwrapApiData(data);
  const aiResult = report?.aiResult || {};
  const rawStatus = String(report?.jobStatus || report?.status || '').toLowerCase();
  if (rawStatus === 'failed' || rawStatus === 'error') {
    const error = new Error('분석 처리 중 오류가 발생했습니다. 대시보드에서 상태를 확인해 주세요.');
    error.isFatalReportStatus = true;
    throw error;
  }
  const status = normalizeOrderStatus(rawStatus);
  const hasAiContent = Boolean(
    aiResult.content ||
    aiResult.categories ||
    report?.suggestedJsonLd ||
    aiResult.suggested_json_ld
  );
  return status === 'done' || hasAiContent;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForCompletedReport(orderId, onTick) {
  const startedAt = Date.now();
  const timeoutMs = 10 * 60 * 1000;
  const intervalMs = 3000;
  let attempt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;
    onTick?.(attempt);

    try {
      const reportResponse = await requestJson(`/report/${encodeURIComponent(orderId)}`);
      if (hasCompletedReport(reportResponse)) return reportResponse;
    } catch (error) {
      if (error?.isFatalReportStatus) throw error;
      console.debug('Report is not ready yet:', error);
    }

    await wait(intervalMs);
  }

  throw new Error('분석 완료 대기 시간이 초과되었습니다. 잠시 후 대시보드에서 결과를 확인해 주세요.');
}

function formatOrderDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function getLocalOrders() {
  try {
    const raw = localStorage.getItem('geoOrders');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalOrder(order) {
  const current = getLocalOrders();
  const next = [order, ...current].slice(0, 50);
  localStorage.setItem('geoOrders', JSON.stringify(next));
}

/* ── CUSTOM CURSOR ── */
(function initCursor() {
  const cursor = document.getElementById('cursor');
  const ring = document.getElementById('cursor-ring');
  if (!cursor || !ring) return;

  let mx = 0, my = 0, rx = 0, ry = 0;

  document.addEventListener('mousemove', e => {
    mx = e.clientX;
    my = e.clientY;
    cursor.style.left = mx + 'px';
    cursor.style.top = my + 'px';
  });

  function animateRing() {
    rx += (mx - rx) * 0.12;
    ry += (my - ry) * 0.12;
    ring.style.left = rx + 'px';
    ring.style.top = ry + 'px';
    requestAnimationFrame(animateRing);
  }
  animateRing();

  document.querySelectorAll('a, button, .card').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('hovering'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('hovering'));
  });
})();


/* ── GEO CANVAS (mouse-reactive network globe) ── */
(function initGeoCanvas() {
  const canvas = document.getElementById('geoCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const NUM = 80;
  let W, H, points = [];
  let mouseX = 0, mouseY = 0;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    W = canvas.width = rect.width;
    H = canvas.height = rect.height;
  }

  function initPoints() {
    points = [];
    for (let i = 0; i < NUM; i++) {
      const r = (Math.random() * 0.42 + 0.04) * Math.min(W, H);
      const a = Math.random() * Math.PI * 2;
      points.push({
        bx: W / 2 + Math.cos(a) * r,
        by: H / 2 + Math.sin(a) * r,
        x: W / 2 + Math.cos(a) * r,
        y: H / 2 + Math.sin(a) * r,
        r: Math.random() * 3 + 1.5,
        speed: Math.random() * 0.003 + 0.001,
        angle: a,
        radius: r,
        color: Math.random() > 0.5 ? '#2d7dd2' : '#0099ff',
        pulse: Math.random() * Math.PI * 2,
      });
    }
  }

  resize();
  initPoints();

  window.addEventListener('resize', () => { resize(); initPoints(); });

  /* track mouse relative to canvas */
  const hero = canvas.closest('.hero') || document.body;
  hero.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  });

  function draw() {
    ctx.clearRect(0, 0, W, H);

    const cr = Math.min(W, H) * 0.46;

    /* globe outline */
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, cr, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(45,125,210,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    /* latitude rings */
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, cr * (i / 5), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(45,125,210,${0.04 + i * 0.01})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    /* longitude lines */
    for (let a = 0; a < Math.PI; a += Math.PI / 6) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + Math.cos(a) * cr, H / 2 + Math.sin(a) * cr);
      ctx.lineTo(W / 2 - Math.cos(a) * cr, H / 2 - Math.sin(a) * cr);
      ctx.strokeStyle = 'rgba(45,125,210,0.07)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    const t = Date.now();

    /* update + draw nodes */
    points.forEach(p => {
      /* orbital motion */
      p.angle += p.speed;
      p.bx = W / 2 + Math.cos(p.angle) * p.radius;
      p.by = H / 2 + Math.sin(p.angle) * p.radius;

      /* mouse repulsion */
      const dx = p.bx - mouseX;
      const dy = p.by - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let tx = p.bx, ty = p.by;
      if (dist < 90 && dist > 0) {
        const force = (90 - dist) / 90;
        tx += (dx / dist) * force * 50;
        ty += (dy / dist) * force * 50;
      }

      /* smooth follow */
      p.x += (tx - p.x) * 0.08;
      p.y += (ty - p.y) * 0.08;

      /* clip to globe boundary */
      const cx = p.x - W / 2, cy = p.y - H / 2;
      const d = Math.sqrt(cx * cx + cy * cy);
      if (d > cr) { p.x = W / 2 + (cx / d) * cr; p.y = H / 2 + (cy / d) * cr; }

      /* draw node */
      const pulse = Math.sin(t * 0.002 + p.pulse) * 0.3 + 0.7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.round(pulse * 180).toString(16).padStart(2, '0');
      ctx.fill();
    });

    /* draw connections */
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 70) {
          ctx.beginPath();
          ctx.moveTo(points[i].x, points[i].y);
          ctx.lineTo(points[j].x, points[j].y);
          ctx.strokeStyle = `rgba(0,153,255,${(1 - d / 70) * 0.3})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  }

  draw();
})();


/* ── SCROLL REVEAL ── */
(function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal');
  if (!reveals.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  reveals.forEach(el => observer.observe(el));
})();
/* ============================================================
   GEO Platform — login.js
   로그인 페이지: 미니 네트워크 캔버스 + 폼 핸들러
   ============================================================ */

'use strict';

/* ── MINI CANVAS ANIMATION (left panel) ── */
(function initMiniCanvas() {
  const canvas = document.getElementById('miniCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const PW = 340, PH = 180;    // logical dimensions

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const pr = window.devicePixelRatio || 1;
    canvas.width = rect.width * pr;
    canvas.height = rect.height * pr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(pr, pr);
  }
  resize();
  window.addEventListener('resize', resize);

  /* build particles */
  const particles = Array.from({ length: 40 }, () => ({
    x: Math.random() * PW,
    y: Math.random() * PH,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    r: Math.random() * 2 + 1,
  }));

  function draw() {
    ctx.clearRect(0, 0, PW, PH);

    /* move + bounce */
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > PW) p.vx *= -1;
      if (p.y < 0 || p.y > PH) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,153,255,0.6)';
      ctx.fill();
    });

    /* draw connections */
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 80) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0,153,255,${(1 - d / 80) * 0.35})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  }

  draw();
})();

function logout() {
  clearAuthState();
  window.location.href = 'index.html';
}

window.logout = logout;

/* ── LOGIN FORM ── */
(function initLoginForm() {
  const form = document.getElementById('loginForm');
  const errMsg = document.getElementById('errMsg');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errMsg && errMsg.classList.remove('show');

    const btn = form.querySelector('.btn-submit');
    const originalText = btn.textContent;
    btn.textContent = '확인 중...';
    btn.disabled = true;

    const email = form.querySelector('#email')?.value?.trim();
    const password = form.querySelector('#password')?.value;

    try {
      clearAuthState();
      const loginRes = await requestJson('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      const token = persistAccessTokenFromResponse(loginRes);
      if (!token) {
        throw new Error('로그인 응답에 인증 토큰이 없습니다.');
      }

      window.location.href = 'geo-personal.html';
    } catch (error) {
      if (errMsg) {
        errMsg.textContent = error.message || '로그인에 실패했습니다.';
        errMsg.classList.add('show');
      }
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
})();
/* ============================================================
   GEO Platform — signup.js
   회원가입 페이지: 비밀번호 강도 + 전체동의 + 폼 제출
   ============================================================ */

'use strict';

/* ── PASSWORD STRENGTH METER ── */
(function initPasswordStrength() {
  const pwInput = document.getElementById('password1');
  if (!pwInput) return;

  const bars = ['pw1', 'pw2', 'pw3', 'pw4'].map(id => document.getElementById(id));
  const label = document.getElementById('pwLabel');
  if (!label) return;

  const COLORS = ['', '#ff4757', '#ffa502', '#2d7dd2', '#00c896'];
  const LABELS = ['', '취약', '보통', '강함', '매우 강함'];

  function getScore(val) {
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    return score;
  }

  pwInput.addEventListener('input', () => {
    const val = pwInput.value;
    const score = val.length ? getScore(val) : 0;

    bars.forEach((bar, i) => {
      bar.style.background = i < score ? COLORS[score] : '';
    });

    label.textContent = val.length ? LABELS[score] : '';
    label.style.color = COLORS[score] || '';
  });
})();


/* ── ALL-AGREE CHECKBOX ── */
(function initAllAgree() {
  const allAgree = document.getElementById('allAgree');
  if (!allAgree) return;

  const subChecks = document.querySelectorAll('.sub-agree');

  allAgree.addEventListener('change', () => {
    subChecks.forEach(c => { c.checked = allAgree.checked; });
  });

  /* sync allAgree state when individual boxes change */
  subChecks.forEach(c => {
    c.addEventListener('change', () => {
      allAgree.checked = [...subChecks].every(sc => sc.checked);
    });
  });
})();


/* ── SIGNUP FORM ── */
(function initSignupForm() {
  const form = document.getElementById('signupForm');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const btn = form.querySelector('.btn-submit');
    const originalText = btn.textContent;
    btn.textContent = '계정 생성 중...';
    btn.disabled = true;

    const password1 = form.querySelector('#password1')?.value || '';
    const password2 = form.querySelector('#password2')?.value || '';

    if (password1 !== password2) {
      alert('비밀번호가 일치하지 않습니다.');
      btn.textContent = originalText;
      btn.disabled = false;
      return;
    }

    const payload = {
      name: form.querySelector('#name')?.value?.trim() || '',
      email: form.querySelector('#email')?.value?.trim() || '',
      phone: form.querySelector('#phone')?.value?.trim() || '',
      company: form.querySelector('#company')?.value?.trim() || '',
      password1,
      password2,
    };

    try {
      const signupRes = await requestJson('/signup', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const token = persistAccessTokenFromResponse(signupRes);
      if (!token) {
        throw new Error('회원가입 응답에 인증 토큰이 없습니다.');
      }
      window.location.href = 'geo-personal.html';
    } catch (error) {
      alert(error.message || '회원가입에 실패했습니다.');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
})();
/* ============================================================
   GEO Platform — personal.js
   개인 대시보드: 검색 필터링 + 상태 필터
   ============================================================ */

'use strict';

/* ── FILTER STATE ── */
let currentFilter = 'all';

/**
 * 필터 버튼 클릭 핸들러
 * @param {HTMLElement} btn  - 클릭된 버튼
 * @param {string}      filter - 'all' | 'done' | 'progress' | 'queued' | 'draft'
 */
function setFilter(btn, filter) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = filter;
  applyFilter();
}

/**
 * 검색창 input 핸들러
 * @param {string} query
 */
function filterProjects(query) {
  applyFilter(query);
}

/**
 * 실제 필터 + 검색 적용 (DOM 토글)
 * @param {string} [query='']
 */
function applyFilter(query = '') {
  const lowerQuery = query.toLowerCase().trim();
  // project-row-wrap 기준으로 필터 (data-status 속성 사용)
  const wraps = document.querySelectorAll('.project-row-wrap');

  wraps.forEach(wrap => {
    const name = (wrap.querySelector('.proj-name')?.textContent || '').toLowerCase();
    const status = wrap.dataset.status || '';

    const matchFilter = currentFilter === 'all' || status === currentFilter;
    const matchQuery = !lowerQuery || name.includes(lowerQuery);

    wrap.style.display = (matchFilter && matchQuery) ? '' : 'none';
  });

  updatePageInfo();
}

/**
 * 현재 표시 중인 행 수 반영
 */
function updatePageInfo() {
  const total = document.querySelectorAll('.project-row-wrap').length;
  const visible = [...document.querySelectorAll('.project-row-wrap')]
    .filter(r => r.style.display !== 'none').length;
  const info = document.querySelector('.page-info');
  if (info) info.textContent = `총 ${total}건 · ${visible}건 표시 중`;
}

/* expose to inline onclick attributes */
window.setFilter = setFilter;
window.filterProjects = filterProjects;
/* ============================================================
   GEO Platform — result.js
   분석 결과 페이지: 모든 차트 및 시각화 로직
   ============================================================ */

'use strict';

/* ============================================================
   GEO Result Page — ReportResult 데이터 파싱 및 시각화
   ============================================================ */

const CATEGORY_ORDER = [
  'Entity Clarity',
  'Answerability',
  'Evidence',
  'Schema Alignment',
  'Domain Completeness',
  'Freshness',
];

const CATEGORY_LABELS = {
  'Entity Clarity': '엔티티·주제 명확성',
  'Answerability': '콘텐츠 구조·답변성',
  'Evidence': '근거·인용 준비',
  'Schema Alignment': '스키마-HTML 정렬',
  'Domain Completeness': '도메인별 완성도',
  'Freshness': '최신성·운영 신뢰',
};

const CATEGORY_SHORT_LABELS = {
  'Entity Clarity': '엔티티',
  'Answerability': '답변성',
  'Evidence': '근거',
  'Schema Alignment': '스키마',
  'Domain Completeness': '완성도',
  'Freshness': '최신성',
};

const CATEGORY_MAX = {
  'Entity Clarity': 15,
  'Answerability': 25,
  'Evidence': 20,
  'Schema Alignment': 15,
  'Domain Completeness': 15,
  'Freshness': 10,
};

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCategoryKey(label) {
  const source = String(label || '').toLowerCase();
  if (!source) return null;
  if (source.includes('entity') || source.includes('엔티티') || source.includes('resolution')) return 'Entity Clarity';
  // Evidence는 "Citation Readiness" 표현을 자주 포함하므로 Answerability보다 먼저 매핑합니다.
  if (source.includes('evidence') || source.includes('citation') || source.includes('근거') || source.includes('인용') || source.includes('출처')) return 'Evidence';
  if (source.includes('answer') || source.includes('답변') || source.includes('density')) return 'Answerability';
  if (source.includes('schema') || source.includes('스키마') || source.includes('semantic') || source.includes('accuracy')) return 'Schema Alignment';
  if (source.includes('domain') || source.includes('도메인') || source.includes('completeness')) return 'Domain Completeness';
  if (source.includes('fresh') || source.includes('최신') || source.includes('신뢰') || source.includes('operat')) return 'Freshness';
  return null;
}

// ── JSON 구조 응답에서 카테고리 빌드 ──
function buildCategories(cats) {
  if (!cats || typeof cats !== 'object') return {};
  const result = {};
  for (const [key, val] of Object.entries(cats)) {
    const nk = normalizeCategoryKey(key);
    if (!nk) continue;
    result[nk] = {
      score: Number.isFinite(Number(val?.score)) ? Number(val.score) : 0,
      max:   Number.isFinite(Number(val?.max))   ? Number(val.max)   : (CATEGORY_MAX[nk] || 20),
      feedback: [val?.feedback_strengths, val?.feedback_improvements]
                  .filter(Boolean).join('\n') || String(val?.feedback || '')
    };
  }
  return result;
}

// ── 텍스트 응답 파서 (멀티-포맷 지원) ──
function parseAiResponse(data) {
  const payload = data || {};

  /* 경로 1: 구조화 JSON 응답 */
  const structuredCategories = buildCategories(payload.categories);
  if (Object.keys(structuredCategories).length > 0) {
    return {
      total_score: Number.isFinite(Number(payload.total_score)) ? Number(payload.total_score) : 0,
      max_score:   Number.isFinite(Number(payload.max_score))   ? Number(payload.max_score)   : 100,
      categories:  structuredCategories
    };
  }

  /* 경로 2: 텍스트 응답 파싱 */
  const content = typeof payload.content === 'string' ? payload.content : '';
  console.log('[GEO] AI 원문:\n', content);

  // 총점 추출 — "Total Score: 72 / 100" 또는 "총점: 72/100" 등
  const totalMatch =
    content.match(/Total\s+Score\s*[:\-]?\s*([\d.]+)\s*\/\s*([\d.]+)/i) ||
    content.match(/총점\s*[:\-]?\s*([\d.]+)\s*\/\s*([\d.]+)/i) ||
    content.match(/종합\s*점수\s*[:\-]?\s*([\d.]+)\s*\/\s*([\d.]+)/i);

  const categories = {};

  // ── 시도 1: [섹션] 형식 ──
  // [카테고리명] ... - 점수: X / Y ... - 강점: ... - 개선점: ...
  // 섹션 끝: 빈 줄 + [ 또는 텍스트 끝 (엄격하지 않게)
  const fmt1 = /\[([^\]]+)\]([\s\S]+?)(?=\n\s*\[|\n\s*카테고리\s*\d|\n\s*Category\s*\d|$)/gi;
  for (const m of content.matchAll(fmt1)) {
    const [, rawLabel, body] = m;
    const key = normalizeCategoryKey(rawLabel);
    if (!key) continue;

    // 점수: X / Y  (dash 있든 없든, 공백 유연)
    const scoreM = body.match(/[-•*]?\s*점수\s*[:\-]\s*([\d.]+)\s*\/\s*([\d.]+)/i) ||
                   body.match(/[-•*]?\s*score\s*[:\-]\s*([\d.]+)\s*\/\s*([\d.]+)/i) ||
                   body.match(/([\d.]+)\s*\/\s*([\d.]+)/);

    const strengthM  = body.match(/[-•*]\s*강점\s*[:\-]\s*([\s\S]+?)(?=\n\s*[-•*]|$)/i);
    const improveM   = body.match(/[-•*]\s*개선점\s*[:\-]\s*([\s\S]+?)(?=\n\s*[-•*]|$)/i);
    const commentM   = body.match(/[-•*]\s*(?:평가|코멘트|요약|설명)\s*[:\-]\s*([\s\S]+?)(?=\n\s*[-•*]|$)/i);

    const feedbackParts = [
      strengthM?.[1]?.trim(),
      improveM?.[1]?.trim(),
      commentM?.[1]?.trim()
    ].filter(Boolean);

    const parsedScore = scoreM ? Number(scoreM[1]) : 0;
    const parsedMax   = scoreM ? Number(scoreM[2]) : (CATEGORY_MAX[key] || 20);

    categories[key] = {
      score:    parsedScore,
      max:      parsedMax,
      feedback: feedbackParts.join('\n')
    };
  }

  // ── 시도 2: "카테고리 N: 이름" 형식 ──
  if (Object.keys(categories).length === 0) {
    const fmt2 = /(?:카테고리\s*\d+|Category\s*\d+)\s*[:\-]\s*([^\n]+)\n([\s\S]+?)(?=\n\s*(?:카테고리|Category)\s*\d|$)/gi;
    for (const m of content.matchAll(fmt2)) {
      const [, rawLabel, body] = m;
      const key = normalizeCategoryKey(rawLabel);
      if (!key) continue;
      const scoreM = body.match(/([\d.]+)\s*\/\s*([\d.]+)/);
      if (!scoreM) continue;
      categories[key] = {
        score:    Number(scoreM[1]) || 0,
        max:      Number(scoreM[2]) || (CATEGORY_MAX[key] || 20),
        feedback: body.replace(scoreM[0], '').replace(/[-•*\n]/g, ' ').trim().slice(0, 300)
      };
    }
  }

  // ── 시도 3: 카테고리 라벨 근방의 점수 패턴 검색 ──
  if (Object.keys(categories).length === 0) {
    for (const key of CATEGORY_ORDER) {
      const label      = CATEGORY_LABELS[key];
      const shortLabel = CATEGORY_SHORT_LABELS[key];
      const re = new RegExp(
        `(?:${escapeRegex(label)}|${escapeRegex(shortLabel)})[\\s\\S]{0,300}?` +
        `(?:점수|score)[\\s\\S]{0,50}?(\\d+)\\s*\\/\\s*(\\d+)`, 'gi'
      );
      const hit = re.exec(content);
      if (hit) {
        categories[key] = {
          score:    Number(hit[1]) || 0,
          max:      Number(hit[2]) || (CATEGORY_MAX[key] || 20),
          feedback: ''
        };
      }
    }
  }

  // ── max 보정: AI가 잘못된 만점을 반환한 경우 CATEGORY_MAX로 정규화 ──
  for (const [key, val] of Object.entries(categories)) {
    const expected = CATEGORY_MAX[key];
    if (expected && val.max !== expected) {
      // 비율을 유지하며 점수 재계산
      val.score = Math.round((val.score / val.max) * expected * 10) / 10;
      val.max   = expected;
    }
  }

  // 총점: 텍스트에 없으면 카테고리 점수 합산
  const computedTotal = Object.values(categories).reduce((s, c) => s + c.score, 0);
  return {
    total_score: totalMatch ? Number(totalMatch[1]) : computedTotal,
    max_score:   totalMatch ? Number(totalMatch[2]) : 100,
    categories
  };
}

/* ── 결과 페이지 초기화 (백엔드 폴링) ── */
(function initResultPage() {
  // 중복 호출 방지를 위해 기존 폴링 로직은 비활성화하고
  // 하단 hydrateResultPageFromApi() 단일 경로만 사용합니다.
})();


/* ── ReportResult 렌더링 ── */
(function initResultPageBootstrap() {
  // 실제 연동 시: fetch('/api/report/' + orderId).then(r => r.json()).then(render)
  if (!document.body.classList.contains('page-result')) return;
})();

function renderPage(report) {
  const ai = report.aiResult;
  const rawCats = ai.categories || {};
  const cats = {};
  CATEGORY_ORDER.forEach(key => {
    const src = rawCats[key] || {};
    cats[key] = {
      score: Number(src.score) || 0,
      max: Number(src.max) || CATEGORY_MAX[key] || 1,
      feedback: String(src.feedback || '')
    };
  });
  const catKeys = CATEGORY_ORDER.slice();

  /* 메타 정보 */
  document.getElementById('ph-title').textContent = report.targetUrl;
  document.getElementById('m-order-id').textContent = '#' + report.orderId;
  document.getElementById('m-url').textContent = report.targetUrl;
  document.getElementById('m-status').textContent = report.jobStatus;
  document.getElementById('m-created-at').textContent =
    new Date(report.createdAt).toLocaleString('ko-KR');

  /* 상태 뱃지 */
  const badge = document.getElementById('ph-badge');
  const isDone = report.jobStatus === 'COMPLETED' || report.jobStatus === 'SUCCESS';
  badge.textContent = isDone ? '● 분석 완료' : '◉ ' + report.jobStatus;
  badge.style.color = isDone ? 'var(--green)' : 'var(--orange)';

  /* 총점 KPI */
  const total = ai.total_score;
  const pct = Math.round((total / ai.max_score) * 100);
  const grade = pct >= 80 ? '우수' : pct >= 60 ? '양호' : pct >= 40 ? '보통' : '개선 필요';
  const gradeColor = pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--accent)' : pct >= 40 ? 'var(--orange)' : 'var(--red)';

  document.getElementById('kpi-total-val').innerHTML = total + '<span class="kpi-unit">/ ' + ai.max_score + '</span>';
  const gradeEl = document.getElementById('kpi-total-grade');
  gradeEl.textContent = grade + ' (' + pct + '%)';
  gradeEl.style.color = gradeColor;
  document.getElementById('kpi-total-bar').dataset.w = pct + '%';

  /* 개별 KPI */
  const kpiMap = {
    'Entity Clarity': ['kpi-entity-clarity', 'kpi-entity-clarity-bar'],
    'Answerability': ['kpi-answerability', 'kpi-answerability-bar'],
    'Evidence': ['kpi-evidence', 'kpi-evidence-bar'],
    'Schema Alignment': ['kpi-schema', 'kpi-schema-bar'],
    'Domain Completeness': ['kpi-domain-completeness', 'kpi-domain-completeness-bar'],
    'Freshness': ['kpi-freshness', 'kpi-freshness-bar'],
  };
  Object.entries(kpiMap).forEach(([key, [valId, barId]]) => {
    const c = cats[key];
    if (!c) return;
    const valEl = document.getElementById(valId);
    const barEl = document.getElementById(barId);
    if (!valEl || !barEl) return;
    valEl.innerHTML = c.score + '<span class="kpi-unit">/ ' + c.max + '</span>';
    barEl.dataset.w = Math.round((c.score / c.max) * 100) + '%';
  });

  /* KPI 바 애니메이션 */
  setTimeout(() => {
    document.querySelectorAll('.kpi-bar-fill').forEach(el => {
      el.style.width = el.dataset.w || '0%';
    });
  }, 300);

  /* 피드백 리스트 */
  const feedbackList = document.getElementById('feedbackList');
  feedbackList.innerHTML = catKeys.map(key => {
    const c = cats[key];
    const ratio = c.score / c.max;
    const cls = ratio >= 0.7 ? 'low' : ratio >= 0.4 ? 'med' : 'high';
    const icon = ratio >= 0.7 ? '🟢' : ratio >= 0.4 ? '🟠' : '🔴';
    const scoreTag = `<span style="font-family:var(--font-mono);font-size:0.75rem;
      background:var(--blue-50);color:var(--accent);padding:2px 8px;
      border-radius:4px;margin-left:8px;">${c.score} / ${c.max}</span>`;
    return `<div class="insight-item ${cls}">
      <span class="insight-icon">${icon}</span>
      <div class="insight-text">
        <strong>${CATEGORY_LABELS[key] || key}${scoreTag}</strong><br>
        <span style="margin-top:4px;display:block">${String(c.feedback || '').replace(/\n/g, '<br>')}</span>
      </div>
    </div>`;
  }).join('');

  /* JSON-LD 블록 */
  try {
    const rawJsonLd = ai.json_ld ?? ai.suggested_json_ld ?? report.suggestedJsonLd;
    const parsed = typeof rawJsonLd === 'string' ? JSON.parse(rawJsonLd) : rawJsonLd;
    document.getElementById('jsonLdBlock').textContent = JSON.stringify(parsed, null, 2);
  } catch {
    document.getElementById('jsonLdBlock').textContent = ai.json_ld ?? ai.suggested_json_ld ?? report.suggestedJsonLd ?? '—';
  }
  const suggestedBlock = document.getElementById('suggestedJsonLdBlock');
  if (suggestedBlock) {
    const suggested = report.suggestedJsonLd ?? ai.suggested_json_ld ?? null;
    suggestedBlock.textContent = suggested ? JSON.stringify(suggested, null, 2) : 'AI 분석 완료 후 표시됩니다...';
  }

  /* 차트 */
  initRadarChart(catKeys, cats);
  initBarChart(catKeys, cats);
}

/* ── RADAR CHART ── */
(async function hydrateResultPageFromApi() {
  const resultRoot = document.body.classList.contains('page-result');
  if (!resultRoot) return;

  try {
    const orderId = getOrderIdFromQuery();
    let reportResponse;

    if (orderId) {
      reportResponse = await requestJson(`/report/${encodeURIComponent(orderId)}`);
    } else {
      try {
        reportResponse = await requestJson('/report/latest');
      } catch {
        reportResponse = await requestJson('/report');
      }
    }

    const raw = unwrapApiData(reportResponse);
    const aiPayload = raw?.aiResult || {};
    const aiText = typeof aiPayload.content === 'string' ? aiPayload.content : '';
    const parsedAi = parseAiResponse(aiPayload.content ? aiPayload : { content: aiText });
    const suggestedJsonLd = aiPayload.suggested_json_ld ?? null;
    renderPage({
      ...raw,
      suggestedJsonLd,
      aiResult: {
        ...parsedAi,
        suggested_json_ld: suggestedJsonLd
      }
    });
  } catch (error) {
    console.error('Failed to load report result:', error);
    document.getElementById('ph-title').textContent = '분석 결과를 불러오지 못했습니다.';
    document.getElementById('m-status').textContent = 'ERROR';
    document.getElementById('feedbackList').innerHTML = `
      <div class="insight-item high">
        <span class="insight-icon">!</span>
        <div class="insight-text">${error.message || '리포트 조회에 실패했습니다.'}</div>
      </div>`;
    document.getElementById('jsonLdBlock').textContent = '';
  }
})();

function copyJsonLd() {
  const target = document.getElementById('suggestedJsonLdBlock') || document.getElementById('jsonLdBlock');
  if (!target) return;
  const text = target.textContent || '';
  if (!text || text === '—') return;
  navigator.clipboard.writeText(text).catch(() => {});
}
window.copyJsonLd = copyJsonLd;

function initRadarChart(catKeys, cats) {
  const canvas = document.getElementById('radarChart');
  if (!canvas) return;
  if (!catKeys || catKeys.length === 0) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  function resize() {
    const w = canvas.parentElement.offsetWidth - 48;
    canvas.width = w * dpr;
    canvas.height = 280 * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = '280px';
    ctx.scale(dpr, dpr);
    draw(w);
  }

  const scores = catKeys.map(k => {
    const score = Number(cats[k]?.score) || 0;
    const max = Number(cats[k]?.max) || 1;
    return score / max;
  });
  const N = catKeys.length;
  let prog = 0;

  function draw(W) {
    const H = 280;
    const cx = W / 2, cy = H / 2 + 10;
    const r = Math.min(W, H) * 0.30;
    ctx.clearRect(0, 0, W, H);
    const angles = catKeys.map((_, i) => -Math.PI / 2 + (2 * Math.PI / N) * i);

    /* rings */
    for (let ring = 1; ring <= 4; ring++) {
      const rr = r * (ring / 4);
      ctx.beginPath();
      angles.forEach((a, i) => {
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = 'rgba(136,170,200,0.2)'; ctx.lineWidth = 1; ctx.stroke();
    }
    /* spokes */
    angles.forEach(a => {
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.strokeStyle = 'rgba(136,170,200,0.2)'; ctx.lineWidth = 1; ctx.stroke();
    });
    /* data */
    ctx.beginPath();
    scores.forEach((v, i) => {
      const rr = r * v * prog;
      const x = cx + Math.cos(angles[i]) * rr;
      const y = cy + Math.sin(angles[i]) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = '#0099ff22'; ctx.fill();
    ctx.strokeStyle = '#0099ff'; ctx.lineWidth = 2; ctx.stroke();

    /* labels */
    const shortLabels = catKeys.map(key => {
      const normalized = normalizeCategoryKey(key) || key;
      return CATEGORY_SHORT_LABELS[normalized] || CATEGORY_LABELS[normalized] || CATEGORY_LABELS[key] || key;
    });
    ctx.font = 'bold 11px DM Sans, sans-serif'; ctx.fillStyle = '#0a1628'; ctx.textAlign = 'center';
    angles.forEach((a, i) => {
      const x = cx + Math.cos(a) * (r + 24), y = cy + Math.sin(a) * (r + 24);
      ctx.fillText(shortLabels[i] || catKeys[i], x, y + 4);
    });

    /* score dots */
    scores.forEach((v, i) => {
      const rr = r * v * prog;
      const x = cx + Math.cos(angles[i]) * rr;
      const y = cy + Math.sin(angles[i]) * rr;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#0099ff'; ctx.fill();
    });
  }

  let ap = 0;
  function animate() {
    if (ap < 1) { ap = Math.min(1, ap + 0.03); prog = ap; resize(); requestAnimationFrame(animate); }
    else { prog = 1; resize(); }
  }
  resize();
  setTimeout(animate, 500);
  window.addEventListener('resize', resize);
}

/* ── BAR CHART ── */
function initBarChart(catKeys, cats) {
  const canvas = document.getElementById('barChart');
  if (!canvas) return;
  if (!catKeys || catKeys.length === 0) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const SCORES = catKeys.map(k => Number(cats[k]?.score) || 0);
  const MAXES = catKeys.map(k => Number(cats[k]?.max) || 10);
  const SHORT = catKeys.map(key => {
    const normalized = normalizeCategoryKey(key) || key;
    return CATEGORY_SHORT_LABELS[normalized] || CATEGORY_LABELS[normalized] || CATEGORY_LABELS[key] || key;
  });
  const COLORS = ['#0099ff', '#7b5ea7', '#00c896', '#ff8c00', '#00b5b5'];
  const PAD = { l: 44, r: 20, t: 20, b: 56 };
  const H = 280;
  let animProg = 0;
  const Y_MAX = Math.max(...MAXES, 1);

  function resize() {
    const w = canvas.parentElement.offsetWidth - 48;
    canvas.width = w * dpr;
    canvas.height = H * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
    draw(w);
  }

  function draw(W) {
    const cw = W - PAD.l - PAD.r;
    const ch = H - PAD.t - PAD.b;
    ctx.clearRect(0, 0, W, H);
    const bw = (cw / SCORES.length) - 12;

    SCORES.forEach((v, i) => {
      const bh = (v / Y_MAX) * ch * animProg;
      const x = PAD.l + i * (cw / SCORES.length) + 6;
      const y = PAD.t + ch - bh;

      /* bar */
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 5); ctx.fill();

      /* max guideline */
      const maxBarH = (MAXES[i] / Y_MAX) * ch;
      const maxY = PAD.t + ch - maxBarH;
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = COLORS[i % COLORS.length] + '88';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, maxY);
      ctx.lineTo(x + bw, maxY);
      ctx.stroke();
      ctx.restore();

      /* value label */
      if (animProg > 0.9) {
        ctx.fillStyle = '#0a1628'; ctx.font = 'bold 11px DM Sans, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(v.toFixed(1) + '/' + MAXES[i], x + bw / 2, y - 6);
      }

      /* x label */
      ctx.fillStyle = '#4a6685'; ctx.font = 'bold 10px DM Sans, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(SHORT[i] || catKeys[i], x + bw / 2, H - PAD.b + 18);
    });

    /* y axis */
    for (let i = 0; i <= 5; i++) {
      const y = PAD.t + ch * (1 - i / 5);
      ctx.fillStyle = '#8aaac8'; ctx.font = '9px DM Mono, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText((Y_MAX * i / 5).toFixed(0), PAD.l - 6, y + 4);
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cw, y);
      ctx.strokeStyle = 'rgba(136,170,200,0.15)'; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  let ap = 0;
  function animate() {
    if (ap < 1) { ap = Math.min(1, ap + 0.04); animProg = ap; resize(); requestAnimationFrame(animate); }
    else { animProg = 1; resize(); }
  }
  resize();
  setTimeout(animate, 400);
  window.addEventListener('resize', resize);
}

function switchTab(btn, type) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
window.switchTab = switchTab;

/* ============================================================
   GEO Order Page — 의뢰 신청 폼 핸들러
   ============================================================ */

(function initOrderForm() {
  const form = document.getElementById('orderForm');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const today = new Date();
    const dateStr = today.getFullYear() + '.' +
      String(today.getMonth() + 1).padStart(2, '0') + '.' +
      String(today.getDate()).padStart(2, '0');

    const payload = {
      targetUrl: document.getElementById('targetUrl')?.value,
      siteName: document.getElementById('siteName')?.value,
      serviceType: document.getElementById('serviceType')?.value,
      targetEngine: document.getElementById('targetEngine')?.value,
      analysisItems: [...document.querySelectorAll('.check-grid input:checked')].map(el => el.nextElementSibling?.querySelector('.check-name')?.textContent || el.id),
      contactName: document.getElementById('contactName')?.value,
      contactPhone: document.getElementById('contactPhone')?.value,
      contactEmail: document.getElementById('contactEmail')?.value,
      contactOrg: document.getElementById('contactOrg')?.value,
      memo: document.getElementById('memo')?.value,
    };

    /* localStorage에 의뢰 목록 저장 (대시보드에서 읽음) */

    const btn = form.querySelector('.order-submit-btn');
    const submitInfo = document.getElementById('orderSubmitInfo');
    const setSubmitInfo = message => {
      if (!submitInfo) return;
      submitInfo.innerHTML = `<span class="order-loading-dot" aria-hidden="true"></span><span>${message}</span>`;
    };

    let shouldResetSubmitButton = true;

    btn.textContent = '분석 중입니다.';
    btn.disabled = true;
    setSubmitInfo('분석 의뢰를 접수하고 있습니다.');

    /* 실제 백엔드 연동 시:
       fetch('/api/order', { method:'POST', headers:{'Content-Type':'application/json'},
         body: JSON.stringify(payload) })
       .then(r => r.json())
       .then(() => window.location.href = 'geo-personal.html');
    */
    try {
      const orderResponse = await requestJson('/order', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const createdOrder = unwrapApiData(orderResponse);
      const orderId = createdOrder?.orderId ?? createdOrder?.id;
      saveLocalOrder({
        ...payload,
        ...createdOrder,
        orderId,
        status: createdOrder?.status ?? createdOrder?.jobStatus ?? 'queued',
        createdAt: createdOrder?.createdAt ?? new Date().toISOString(),
      });

      if (!orderId) {
        setSubmitInfo('분석 의뢰가 완료되었습니다. 결과 페이지로 이동합니다.');
        shouldResetSubmitButton = false;
        window.location.href = buildResultPageUrl();
        return;
      }

      try {
        await waitForCompletedReport(orderId, attempt => {
          const elapsedSeconds = (attempt - 1) * 3;
          setSubmitInfo(`분석이 진행 중입니다. 결과가 준비되면 자동으로 이동합니다. (${elapsedSeconds}초)`);
        });
        setSubmitInfo('분석이 완료되었습니다. 결과 페이지로 이동합니다.');
        shouldResetSubmitButton = false;
        window.location.href = buildResultPageUrl(orderId);
      } catch (pollError) {
        alert(pollError.message || '분석 완료 대기 중 오류가 발생했습니다.');
        setSubmitInfo('분석 완료를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } catch (error) {
      // API 실패 시에도 대시보드에서 목록을 확인할 수 있게 로컬 보관
      saveLocalOrder({
        ...payload,
        orderId: `local-${Date.now()}`,
        status: 'queued',
        createdAt: new Date().toISOString(),
      });
      alert(error.message || ' 주문 요청에 실패했습니다.');
      setSubmitInfo('주문 요청에 실패했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.');
    } finally {
      if (shouldResetSubmitButton) {
        btn.disabled = false;
        btn.textContent = '분석 의뢰 →';
      }
    }
  });
})();


/* ============================================================
   GEO Personal Page — localStorage 의뢰 목록 동적 렌더링
   ============================================================ */

(async function initPersonalOrders() {
  const list = document.getElementById('projectList');
  if (!list) return;

  let apiOrders = [];
  try {
    const ordersResponse = await requestJson('/orders');
    apiOrders = normalizeOrdersResponse(ordersResponse);
  } catch (error) {
    console.error('Failed to load orders:', error);
  }

  const localOrders = getLocalOrders();
  const orderMap = new Map();
  [...apiOrders, ...localOrders].forEach(order => {
    const key = String(order.orderId || order.id || order.targetUrl || Math.random());
    if (!orderMap.has(key)) orderMap.set(key, order);
  });
  const orders = [...orderMap.values()];

  if (orders.length === 0) return;
  list.innerHTML = '';

  /* 서비스 유형별 아이콘 */
  const iconMap = {
    '쇼핑몰 / 이커머스': '🛒',
    '뉴스 / 미디어': '📰',
    'SaaS / 테크': '💻',
    '교육 / 학술': '🎓',
    //'의료 / 헬스케어':   '🏥',
    //'로컬 비즈니스':     '🏪',
    '기타': '🌐',
  };

  orders.forEach(order => {
    const status = normalizeOrderStatus(order.status || order.jobStatus);
    const orderId = order.orderId || order.id;
    const date = formatOrderDate(order.createdAt || order.date);
    const viewHref = buildResultPageUrl(orderId);
    const icon = iconMap[order.serviceType] || '🌐';
    const items = (order.analysisItems || []).join(' · ') || '기본 분석';
    const wrap = document.createElement('div');
    wrap.className = 'project-row-wrap';
    wrap.dataset.status = status;

    if (status === 'done') {
      wrap.innerHTML = `
      <a class="project-row" href="${viewHref}">
        <div class="proj-icon geo">${icon}</div>
        <div class="proj-info">
          <div class="proj-name">${order.siteName || order.targetUrl}</div>
          <div class="proj-meta">${order.targetUrl} · ${items}</div>
        </div>
        <div class="proj-date">${date}</div>
        <span class="status-badge done">● 완료</span>
      </a>
      <div class="proj-actions">
        <a href="${viewHref}" class="action-btn view">결과 보기</a>
      </div>`;
      list.appendChild(wrap);
      return;
    }

    {
      const badgeClass = status === 'progress' ? 'progress' : 'queued';
      const badgeText = status === 'progress' ? '진행 중' : '분석 중';
      wrap.innerHTML = `
      <div class="project-row">
        <div class="proj-icon geo">${icon}</div>
        <div class="proj-info">
          <div class="proj-name">${order.siteName || order.targetUrl}</div>
          <div class="proj-meta">${order.targetUrl} · ${items}</div>
        </div>
        <div class="proj-date">${date}</div>
        <span class="status-badge ${badgeClass}">${badgeText}</span>
      </div>`;
      list.appendChild(wrap);
      return;
    }

    wrap.innerHTML = `
      <div class="project-row">
        <div class="proj-icon geo">${icon}</div>
        <div class="proj-info">
          <div class="proj-name">${order.siteName || order.targetUrl}</div>
          <div class="proj-meta">${order.targetUrl} · ${items}</div>
        </div>
        <div class="proj-date">${order.date}</div>
        <span class="status-badge queued">◌ 대기 중</span>
      </div>`;

    /* 목록 맨 위에 삽입 */
    list.insertBefore(wrap, list.firstChild);
  });

  /* 통계 카드 업데이트 */
  const totalEl = document.querySelector('.stat-card.c-blue .sc-val');
  const doneEl = document.querySelector('.stat-card.c-green .sc-val');
  const queueEl = document.querySelector('.stat-card.c-orange .sc-val');
  const totalCount = orders.length;
  const doneCount = orders.filter(order => normalizeOrderStatus(order.status || order.jobStatus) === 'done').length;
  const queuedOrProgressCount = orders.filter(order => ['queued', 'progress'].includes(normalizeOrderStatus(order.status || order.jobStatus))).length;
  if (totalEl) totalEl.textContent = totalCount;
  if (doneEl) doneEl.textContent = doneCount;
  if (queueEl) queueEl.textContent = queuedOrProgressCount;

  /* page-info 업데이트 */
  updatePageInfo();
})();
