'use strict';

let charts = {};

// 더미 데이터 생성 (ai 작성)
function generateMockData(url) {
  const seed = url.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rnd  = (min, max, offset = 0) => min + ((seed + offset) % (max - min));

  return {
    geoScore:     rnd(45, 95, 3),
    marketsCount: rnd(18, 72, 7),
    topGender: ['Male', 'Female'][seed % 2],
    topAge:   ['18-24','25-34','35-44','45-54','55+'][seed % 5],
    oppIndex:     ['High','Very High','Medium','High'][seed % 4],

    pieData: {
      labels: ['North America','Europe','East Asia','Southeast Asia','Latin America','Middle East','Other'],
      values: [
        rnd(22, 38, 1), rnd(15, 28, 2), rnd(10, 22, 3),
        rnd(5, 15, 4),  rnd(4, 12, 5),  rnd(2, 8, 6), rnd(3, 8, 7)
      ],
      colors: ['#c8c8c8','#a0a0a0','#787878','#585858','#3a3a3a','#d0d0d0','#909090']
    },

    radarData: {
      labels: ['Visibility','Authority','Traffic','Backlinks','Localization','Growth'],
      values: [
        rnd(40, 90, 10), rnd(50, 88, 20), rnd(35, 85, 30),
        rnd(30, 80, 40), rnd(25, 75, 50), rnd(40, 92, 60)
      ]
    },

    lineData: (() => {
      const months = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
      let base = rnd(40, 65, 11);
      return {
        labels: months,
        values: months.map((_, i) => {
          base = Math.min(95, Math.max(20, base + rnd(-4, 8, i * 13)));
          return base;
        })
      };
    })(),

    barData: {
      competitors: ['Competitor A','Competitor B','Competitor C','Competitor D','Competitor E'],
      overlap: [rnd(30, 75, 21), rnd(20, 60, 22), rnd(15, 55, 23), rnd(10, 45, 24), rnd(5, 35, 25)]
    },
  };
}

// URL에서 
const params    = new URLSearchParams(window.location.search);
const targetUrl = params.get('url') || 'example.com';
const domain    = targetUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

document.getElementById('resultUrlLabel').textContent = domain;

document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = 'main.html';
});

document.getElementById('exportBtn').addEventListener('click', () => {
  alert('결과 내보내기');
});

// 로딩 후 결과 렌더
setTimeout(() => {
  const data = generateMockData(domain);
  renderResult(data);
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('resultContent').classList.remove('hidden');
}, 1800);

// 요소 출력
function renderResult(data) {
  animateCount('geoScore',     data.geoScore,     0);
  animateCount('marketsCount', data.marketsCount, 300);
  document.getElementById('topGender').textContent = data.topGender;
  document.getElementById('topAge').textContent    = data.topAge;
  document.getElementById('oppIndex').textContent  = data.oppIndex;

  destroyCharts();
  renderPie(data.pieData);
  renderRadar(data.radarData);
  renderLine(data.lineData);
  renderBar(data.barData);
}

// 카운트 애니메이션
function animateCount(id, target, delay) {
  const el = document.getElementById(id);
  if (!el || isNaN(target)) return;
  setTimeout(() => {
    let start = 0;
    const step = target / 40;
    const tick = () => {
      start = Math.min(start + step, target);
      el.textContent = Math.round(start);
      if (start < target) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, delay);
}

// 차트 초기화
function destroyCharts() {
  Object.values(charts).forEach(c => c?.destroy());
  charts = {};
}

// pie
function renderPie(d) {
  const total = d.values.reduce((a, b) => a + b, 0);
  const pcts  = d.values.map(v => +((v / total) * 100).toFixed(1));

  charts.pie = new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: {
      labels:   d.labels,
      datasets: [{
        data:            pcts,
        backgroundColor: d.colors,
        borderColor:     '#111111',
        borderWidth:     3,
        hoverOffset:     8
      }]
    },
    options: {
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` }
        }
      },
      animation: { animateRotate: true, duration: 900 }
    }
  });

  const legend = document.getElementById('pieLegend');
  legend.innerHTML = d.labels.map((label, i) => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${d.colors[i]}"></div>
      <span>${label}</span>
      <span class="legend-pct">${pcts[i]}%</span>
    </div>
  `).join('');
}

// rader
function renderRadar(d) {
  charts.radar = new Chart(document.getElementById('radarChart'), {
    type: 'radar',
    data: {
      labels:   d.labels,
      datasets: [{
        label:               'Score',
        data:                d.values,
        backgroundColor:     'rgba(208,208,208,0.1)',
        borderColor:         '#d0d0d0',
        borderWidth:         2,
        pointBackgroundColor:'#d0d0d0',
        pointRadius:         4
      }]
    },
    options: {
      scales: {
        r: {
          min: 0, max: 100,
          grid:        { color: 'rgba(255,255,255,0.05)' },
          angleLines:  { color: 'rgba(255,255,255,0.05)' },
          ticks:       { display: false },
          pointLabels: { color: '#a8a8a8', font: { family: "'DM Mono', monospace", size: 10 } }
        }
      },
      plugins: { legend: { display: false } },
      animation: { duration: 900 }
    }
  });
}

// line
function renderLine(d) {
  charts.line = new Chart(document.getElementById('lineChart'), {
    type: 'line',
    data: {
      labels:   d.labels,
      datasets: [{
        label:   'Visibility Score',
        data:    d.values,
        borderColor: '#d0d0d0',
        backgroundColor: ctx => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 240);
          gradient.addColorStop(0, 'rgba(208,208,208,0.25)');
          gradient.addColorStop(1, 'rgba(208,208,208,0)');
          return gradient;
        },
        borderWidth:         2,
        pointRadius:         3,
        pointBackgroundColor:'#d0d0d0',
        fill:    true,
        tension: 0.4
      }]
    },
    options: {
      scales: {
        x: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#505050', font: { family: "'DM Mono', monospace", size: 10 } }
        },
        y: {
          min: 0, max: 100,
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#505050', font: { family: "'DM Mono', monospace", size: 10 }, stepSize: 25 }
        }
      },
      plugins: { legend: { display: false } },
      animation: { duration: 900 }
    }
  });
}

// Bar
function renderBar(d) {
  charts.bar = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels:   d.competitors,
      datasets: [{
        label:           'Keyword Overlap %',
        data:            d.overlap,
        backgroundColor: [
          'rgba(208,208,208,0.8)', 'rgba(180,180,180,0.8)',
          'rgba(150,150,150,0.8)', 'rgba(120,120,120,0.8)',
          'rgba(90,90,90,0.8)'
        ],
        borderColor:   'transparent',
        borderRadius:  6,
        borderSkipped: false
      }]
    },
    options: {
      indexAxis: 'y',
      scales: {
        x: {
          min: 0, max: 100,
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#505050', font: { family: "'DM Mono', monospace", size: 10 } }
        },
        y: {
          grid:  { color: 'transparent' },
          ticks: { color: '#a8a8a8', font: { family: "'DM Sans', sans-serif", size: 12 } }
        }
      },
      plugins: { legend: { display: false } },
      animation: { duration: 900 }
    }
  });
}
