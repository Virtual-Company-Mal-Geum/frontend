'use strict';

/* ── CUSTOM CURSOR ── */
(function initCursor() {
  const cursor = document.getElementById('cursor');
  const ring   = document.getElementById('cursor-ring');
  if (!cursor || !ring) return;

  let mx = 0, my = 0, rx = 0, ry = 0;

  document.addEventListener('mousemove', e => {
    mx = e.clientX;
    my = e.clientY;
    cursor.style.left = mx + 'px';
    cursor.style.top  = my + 'px';
  });

  function animateRing() {
    rx += (mx - rx) * 0.12;
    ry += (my - ry) * 0.12;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
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
    W = canvas.width  = rect.width;
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
        speed:  Math.random() * 0.003 + 0.001,
        angle:  a,
        radius: r,
        color:  Math.random() > 0.5 ? '#2d7dd2' : '#0099ff',
        pulse:  Math.random() * Math.PI * 2,
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
      const d  = Math.sqrt(cx * cx + cy * cy);
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
        const d  = Math.sqrt(dx * dx + dy * dy);
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
    canvas.width  = rect.width  * pr;
    canvas.height = rect.height * pr;
    canvas.style.width  = rect.width  + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(pr, pr);
  }
  resize();
  window.addEventListener('resize', resize);

  /* build particles */
  const particles = Array.from({ length: 40 }, () => ({
    x:  Math.random() * PW,
    y:  Math.random() * PH,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    r:  Math.random() * 2 + 1,
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
        const d  = Math.sqrt(dx * dx + dy * dy);
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


/* ── LOGIN FORM ── */
(function initLoginForm() {
  const form   = document.getElementById('loginForm');
  const errMsg = document.getElementById('errMsg');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    errMsg && errMsg.classList.remove('show');

    const btn = form.querySelector('.btn-submit');
    btn.textContent = '확인 중...';
    btn.disabled = true;

    /* DB 연동 전 UI 시뮬레이션 — 실제 인증 로직으로 교체 예정 */
    setTimeout(() => {
      window.location.href = 'geo-personal.html';
    }, 1000);
  });
})();
/* ============================================================
   GEO Platform — signup.js
   회원가입 페이지: 비밀번호 강도 + 전체동의 + 폼 제출
   ============================================================ */

'use strict';

/* ── PASSWORD STRENGTH METER ── */
(function initPasswordStrength() {
  const pwInput = document.getElementById('pwInput');
  if (!pwInput) return;

  const bars  = ['pw1','pw2','pw3','pw4'].map(id => document.getElementById(id));
  const label = document.getElementById('pwLabel');
  if (!label) return;

  const COLORS = ['', '#ff4757', '#ffa502', '#2d7dd2', '#00c896'];
  const LABELS = ['', '취약', '보통', '강함', '매우 강함'];

  function getScore(val) {
    let score = 0;
    if (val.length >= 8)        score++;
    if (/[A-Z]/.test(val))      score++;
    if (/[0-9]/.test(val))      score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    return score;
  }

  pwInput.addEventListener('input', () => {
    const val   = pwInput.value;
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
  const allAgree  = document.getElementById('allAgree');
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

  form.addEventListener('submit', e => {
    e.preventDefault();

    const btn = form.querySelector('.btn-submit');
    btn.textContent = '계정 생성 중...';
    btn.disabled = true;

    /* DB 연동 전 UI 시뮬레이션 — 실제 회원가입 API 교체 예정 */
    setTimeout(() => {
      window.location.href = 'geo-personal.html';
    }, 1200);
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
    const name      = (wrap.querySelector('.proj-name')?.textContent || '').toLowerCase();
    const status    = wrap.dataset.status || '';

    const matchFilter = currentFilter === 'all' || status === currentFilter;
    const matchQuery  = !lowerQuery || name.includes(lowerQuery);

    wrap.style.display = (matchFilter && matchQuery) ? '' : 'none';
  });

  updatePageInfo();
}

/**
 * 현재 표시 중인 행 수 반영
 */
function updatePageInfo() {
  const total   = document.querySelectorAll('.project-row-wrap').length;
  const visible = [...document.querySelectorAll('.project-row-wrap')]
    .filter(r => r.style.display !== 'none').length;
  const info = document.querySelector('.page-info');
  if (info) info.textContent = `총 ${total}건 · ${visible}건 표시 중`;
}

/* expose to inline onclick attributes */
window.setFilter      = setFilter;
window.filterProjects = filterProjects;
/* ============================================================
   GEO Platform — result.js
   분석 결과 페이지: 모든 차트 및 시각화 로직
   ============================================================ */

'use strict';

/* ============================================================
   GEO Result Page — ReportResult 데이터 파싱 및 시각화
   ============================================================ */

/* ── 샘플 데이터 (실제 백엔드 연동 시 API 응답으로 교체) ── */
const MOCK_REPORT = {
  orderId: 42,
  targetUrl: "https://example.com/tech-news",
  jobStatus: "COMPLETED",
  aiResult: {
    total_score: 6.0,
    max_score: 50.0,
    categories: {
      "Schema Completeness": { score: 1.0, max: 10.0, feedback: "JSON-LD는 페이지의 주요 내용을 포함하지 않습니다. Apple Vision Pro 업데이트에 대한 정보를 추가해야 합니다." },
      "Information Density": { score: 1.0, max: 10.0, feedback: "JSON-LD는 페이지의 주요 내용을 충분히 설명하지 못합니다. Apple Vision Pro 업데이트에 대한 상세한 정보를 포함하도록 수정해야 합니다." },
      "Semantic Accuracy":   { score: 2.0, max: 10.0, feedback: "JSON-LD와 HTML 텍스트 사이에는 모순이 없습니다. 그러나 JSON-LD는 페이지의 핵심 사실을 제공하지 않으므로 정확성을 높일 수 있습니다." },
      "Entity Resolution":   { score: 1.0, max: 10.0, feedback: "JSON-LD는 HTML 텍스트에서 언급된 특정 엔티티(예: Apple Vision Pro)를 연결하지 않습니다. 이러한 엔티티들을 JSON-LD에 포함시켜야 합니다." },
      "GEO-Readiness":       { score: 1.0, max: 10.0, feedback: "LLM은 JSON-LD만 읽으면 페이지의 핵심 사실을 정확하게 요약할 수 없습니다. JSON-LD는 페이지의 핵심 사실을 더 잘 표현해야 합니다." }
    },
    json_ld: '{"@context":"https://schema.org","@type":"WebPage","name":"Tech News"}'
  },
  createdAt: "2025-06-12T14:32:00"
};

/* ── ReportResult 렌더링 ── */
(function initResultPage() {
  // 실제 연동 시: fetch('/api/report/' + orderId).then(r => r.json()).then(render)
  const report = MOCK_REPORT;
  renderPage(report);
})();

function renderPage(report) {
  const ai = report.aiResult;
  const cats = ai.categories;
  const catKeys = Object.keys(cats);

  /* 메타 정보 */
  document.getElementById('ph-title').textContent = report.targetUrl;
  document.getElementById('m-order-id').textContent = '#' + report.orderId;
  document.getElementById('m-url').textContent = report.targetUrl;
  document.getElementById('m-status').textContent = report.jobStatus;
  document.getElementById('m-created-at').textContent =
    new Date(report.createdAt).toLocaleString('ko-KR');

  /* 상태 뱃지 */
  const badge = document.getElementById('ph-badge');
  badge.textContent = report.jobStatus === 'COMPLETED' ? '● 분석 완료' : '◉ ' + report.jobStatus;
  badge.style.color = report.jobStatus === 'COMPLETED' ? 'var(--green)' : 'var(--orange)';

  /* 총점 KPI */
  const total = ai.total_score;
  const pct   = Math.round((total / ai.max_score) * 100);
  const grade = pct >= 80 ? '우수' : pct >= 60 ? '양호' : pct >= 40 ? '보통' : '개선 필요';
  const gradeColor = pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--accent)' : pct >= 40 ? 'var(--orange)' : 'var(--red)';

  document.getElementById('kpi-total-val').innerHTML = total + '<span class="kpi-unit">/ ' + ai.max_score + '</span>';
  const gradeEl = document.getElementById('kpi-total-grade');
  gradeEl.textContent = grade + ' (' + pct + '%)';
  gradeEl.style.color = gradeColor;
  document.getElementById('kpi-total-bar').dataset.w = pct + '%';

  /* 개별 KPI */
  const kpiMap = {
    'Schema Completeness': ['kpi-sc',  'kpi-sc-bar'],
    'Information Density': ['kpi-id',  'kpi-id-bar'],
    'GEO-Readiness':       ['kpi-geo', 'kpi-geo-bar'],
  };
  Object.entries(kpiMap).forEach(([key, [valId, barId]]) => {
    const c = cats[key];
    if (!c) return;
    document.getElementById(valId).innerHTML = c.score + '<span class="kpi-unit">/ ' + c.max + '</span>';
    document.getElementById(barId).dataset.w = Math.round((c.score / c.max) * 100) + '%';
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
    const cls   = ratio >= 0.7 ? 'low' : ratio >= 0.4 ? 'med' : 'high';
    const icon  = ratio >= 0.7 ? '🟢' : ratio >= 0.4 ? '🟠' : '🔴';
    const scoreTag = `<span style="font-family:var(--font-mono);font-size:0.75rem;
      background:var(--blue-50);color:var(--accent);padding:2px 8px;
      border-radius:4px;margin-left:8px;">${c.score} / ${c.max}</span>`;
    return `<div class="insight-item ${cls}">
      <span class="insight-icon">${icon}</span>
      <div class="insight-text">
        <strong>${key}${scoreTag}</strong><br>
        <span style="margin-top:4px;display:block">${c.feedback}</span>
      </div>
    </div>`;
  }).join('');

  /* JSON-LD 블록 */
  try {
    const parsed = typeof ai.json_ld === 'string' ? JSON.parse(ai.json_ld) : ai.json_ld;
    document.getElementById('jsonLdBlock').textContent = JSON.stringify(parsed, null, 2);
  } catch {
    document.getElementById('jsonLdBlock').textContent = ai.json_ld || '—';
  }

  /* 차트 */
  initRadarChart(catKeys, cats);
  initBarChart(catKeys, cats);
}

/* ── RADAR CHART ── */
function initRadarChart(catKeys, cats) {
  const canvas = document.getElementById('radarChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  function resize() {
    const w = canvas.parentElement.offsetWidth - 48;
    canvas.width  = w * dpr;
    canvas.height = 280 * dpr;
    canvas.style.width  = w + 'px';
    canvas.style.height = '280px';
    ctx.scale(dpr, dpr);
    draw(w);
  }

  const scores = catKeys.map(k => cats[k].score / cats[k].max);
  const N = catKeys.length;
  let prog = 0;

  function draw(W) {
    const H  = 280;
    const cx = W / 2, cy = H / 2 + 10;
    const r  = Math.min(W, H) * 0.30;
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
    const shortLabels = ['완전성','정보밀도','의미정확성','엔티티','AI적합성'];
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
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const SCORES = catKeys.map(k => cats[k].score);
  const SHORT  = ['완전성','정보밀도','의미정확성','엔티티','AI적합성'];
  const COLORS = ['#0099ff','#7b5ea7','#00c896','#ff8c00','#00b5b5'];
  const PAD    = { l: 44, r: 20, t: 20, b: 56 };
  const H      = 280;
  let animProg = 0;

  function resize() {
    const w = canvas.parentElement.offsetWidth - 48;
    canvas.width  = w * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = w + 'px';
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
      const bh = (v / 10) * ch * animProg;
      const x  = PAD.l + i * (cw / SCORES.length) + 6;
      const y  = PAD.t + ch - bh;

      /* bar */
      ctx.fillStyle = COLORS[i];
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 5); ctx.fill();

      /* value label */
      if (animProg > 0.9) {
        ctx.fillStyle = '#0a1628'; ctx.font = 'bold 11px DM Sans, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(v.toFixed(1), x + bw / 2, y - 6);
      }

      /* x label */
      ctx.fillStyle = '#4a6685'; ctx.font = 'bold 10px DM Sans, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(SHORT[i] || catKeys[i], x + bw / 2, H - PAD.b + 18);
    });

    /* y axis */
    for (let i = 0; i <= 5; i++) {
      const y = PAD.t + ch * (1 - i / 5);
      ctx.fillStyle = '#8aaac8'; ctx.font = '9px DM Mono, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText((10 * i / 5).toFixed(0), PAD.l - 6, y + 4);
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