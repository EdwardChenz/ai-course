// 沙箱配额与超时成本账 — Sandbox Quota & Timeout Cost Ledger
// 教学目标：调节单次执行时长 T，比较 Daytona 与 E2B 在 2 vCPU 规格下的单次成本，
//           并看懂两条成本线在 5 到 60 秒区间内始终不相交。
// 规格来源：docs/chapters/10-memory-sandbox 的 sandbox-quota-cost-ledger 规格块
//
// ---- 布局计算（先算再写码）----
// 控件清单：1 行状态 + 1 行滑块 + 2 行读数 + 3 行挑战题 + 1 行按钮 + 反馈文本区
// controlHeight = 8 + 22(状态) + 30(滑块) + 48(读数 2 行) + 90(3 道题) + 30(按钮) + 160(反馈 8 行) = 388
// drawHeight = 400；iframeHeight = drawHeight + controlHeight + 2 = 790

const drawHeight = 400;
const READ_LINES = 2;
const READ_H = READ_LINES * 21 + 6;              // 48
const FB_LINES = 8;
const FB_H = FB_LINES * 19 + 8;                  // 141
const controlHeight = 8 + 22 + 30 + READ_H + 30 * 3 + 30 + FB_H; // 388
const IFRAME_HEIGHT = drawHeight + controlHeight + 2; // 790

// ---- 模型常量（规格块 Rules；2.4 / 1.2 秒为创建或启动时间，0.06 / 0.04 元每分钟为教学用示意单价）----
const DAYTONA_START = 2.4, DAYTONA_RATE = 0.06;   // 元 / 分钟
const E2B_START = 1.2, E2B_RATE = 0.04;           // 元 / 分钟
const T_MIN = 5, T_MAX = 60, T_STEP = 1, T_DEF = 12;  // 滑块按 1 秒粒度取值，才能同时取到规格块的 12 秒默认与 45 秒题设
const T_GRID_STEP = 5;                                        // 图表 x 轴与刻度仍按 5 秒网格

const TOL_MONEY = 0.0001;   // 金额容差 ±0.0001 元
const TOL_PCT = 0.1;        // 百分比容差 ±0.1 个百分点

function daytona(T) { return (DAYTONA_START + T) / 60 * DAYTONA_RATE; }
function e2b(T) { return (E2B_START + T) / 60 * E2B_RATE; }
// 规格块给出的差额闭式：(0.096 + 0.02T) / 60 元，T ≥ 0 时恒为正
function gapClosed(T) { return (0.096 + 0.02 * T) / 60; }

// ---- 三道挑战题的标准答案（规格块 Content 的标准答案列）----
const EXPECT = { '1_q1a': 0.0144, '1_q1b': 0.0088, '2_q2a': 0.0056, '2_q2b': 38.9, '3_q3': 5688 };

const T_GRID = [];
for (let t = T_MIN; t <= T_MAX; t += T_GRID_STEP) T_GRID.push(t);

const QUESTIONS = [
  {
    n: 1,
    text: 'T = 12 秒时两家沙箱的单次成本',
    fields: [
      { id: 'q1a', unit: '元', tol: TOL_MONEY, label: 'Daytona' },
      { id: 'q1b', unit: '元', tol: TOL_MONEY, label: 'E2B' }
    ],
    correct: '正确，0.0144 元 / 0.0088 元。',
    calc: 'Daytona：(2.4 + 12) / 60 × 0.06 = 0.24 × 0.06 = 0.0144 元；E2B：(1.2 + 12) / 60 × 0.04 = 0.22 × 0.04 = 0.0088 元。',
    hint: '两条成本线都含创建或启动时间：Daytona 2.4 秒、E2B 1.2 秒，再加执行时长 T 后按分钟计价。'
  },
  {
    n: 2,
    text: 'T = 12 秒时 E2B 比 Daytona 便宜多少、降幅',
    fields: [
      { id: 'q2a', unit: '元', tol: TOL_MONEY, label: '便宜' },
      { id: 'q2b', unit: '%', tol: TOL_PCT, label: '降幅' }
    ],
    correct: '正确，0.0056 元，38.9%。',
    calc: '0.0144 减 0.0088 等于 0.0056 元；0.0056 除以 0.0144 等于 0.389，即 38.9%。',
    hint: '先算差额 = Daytona 单次成本 − E2B 单次成本；降幅 = 差额 ÷ Daytona 单次成本。'
  },
  {
    n: 3,
    text: 'T = 45 秒、日均 4,000 次、30 天的 Daytona 月成本',
    fields: [{ id: 'q3', unit: '元', tol: TOL_MONEY, label: '月成本' }],
    correct: '正确，5,688 元。',
    calc: '(2.4 + 45) / 60 × 0.06 = 0.79 × 0.06 = 0.0474 元 / 次；0.0474 × 4,000 × 30 = 5,688 元。',
    hint: '先把 T = 45 代进 Daytona 公式得单次成本，再乘以 4,000 次/天 × 30 天。'
  }
];

let chart = null;
let slider = null;
let valEl = null;
let readEl = null;
let statusEl = null;
let fbEl = null;
let inputs = {};
let attempts = 0;
let correctCount = 0;
let revealed = [false, false, false];
let correctFlags = [false, false, false];

Chart.defaults.font.family = 'Arial, Helvetica, sans-serif';
Chart.defaults.font.size = 14;
Chart.defaults.plugins.title.font = { size: 18 };
Chart.defaults.plugins.legend.labels.font = { size: 15 };

// 只给区间端点与当前 T 标注读数，避免 12 个点全标
const PointLabels = {
  id: 'pointLabels',
  afterDatasetsDraw(c) {
    const ctx = c.ctx;
    const cur = parseInt(slider.value, 10);
    const idxs = [0, T_GRID.length - 1];
    ctx.save();
    ctx.font = '600 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    c.data.datasets.forEach((ds, di) => {
      const meta = c.getDatasetMeta(di);
      idxs.forEach(i => {
        if (i < 0) return;
        const el = meta.data[i];
        ctx.fillStyle = ds._labelColor;
        ctx.fillText(Number(ds.data[i].y).toFixed(4) + ' 元', el.x, el.y - 8);
      });
    });
    ctx.restore();
  }
};

// 当前 T 的竖直参考线（画在 afterDatasetsDraw，确保不被网格或数据线盖住）
const CurrentT = {
  id: 'currentT',
  afterDatasetsDraw(c) {
    const cur = parseInt(slider.value, 10);
    const x = c.scales.x.getPixelForValue(cur);
    const ctx = c.ctx;
    ctx.save();
    ctx.strokeStyle = '#444444';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, c.chartArea.top);
    ctx.lineTo(x, c.chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '700 13px Arial';
    ctx.fillStyle = '#444444';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('当前 T = ' + cur + ' 秒', x + 5, c.chartArea.top + 2);
    ctx.restore();
  }
};

function buildUI() {
  const chartArea = document.getElementById('chartArea');
  chartArea.style.height = drawHeight + 'px';
  const cv = document.createElement('canvas');
  cv.id = 'chart';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', 'Daytona 与 E2B 两条单次成本线随执行时长从 5 秒到 60 秒的变化折线图，Daytona 始终在 E2B 之上，两线不相交');
  chartArea.appendChild(cv);
  buildChart(cv);

  const panel = document.getElementById('panel');
  panel.style.height = controlHeight + 'px';

  statusEl = document.createElement('div');
  statusEl.className = 'status';
  panel.appendChild(statusEl);

  // ---- 时长滑块 ----
  const sRow = document.createElement('div');
  sRow.className = 'row';
  const sLbl = document.createElement('span');
  sLbl.className = 'lbl';
  sLbl.textContent = '单次执行时长 T（5 到 60 秒，步长 5）';
  slider = document.createElement('input');
  slider.type = 'range';
  slider.min = T_MIN; slider.max = T_MAX; slider.step = T_STEP; slider.value = T_DEF;
  slider.setAttribute('aria-label', '单次执行时长 T，单位秒');
  valEl = document.createElement('span');
  valEl.className = 'val';
  const sUnit = document.createElement('span');
  sUnit.className = 'unit';
  sUnit.textContent = '秒';
  slider.addEventListener('input', onSlide);
  sRow.appendChild(sLbl); sRow.appendChild(slider); sRow.appendChild(valEl); sRow.appendChild(sUnit);
  panel.appendChild(sRow);

  // ---- 读数区 ----
  readEl = document.createElement('div');
  readEl.className = 'readout';
  readEl.style.height = READ_H + 'px';
  panel.appendChild(readEl);

  // ---- 三道挑战题 ----
  QUESTIONS.forEach(q => {
    const row = document.createElement('div');
    row.className = 'row';
    const lbl = document.createElement('span');
    lbl.className = 'q';
    lbl.textContent = 'Q' + q.n + '　' + q.text + '？';
    row.appendChild(lbl);
    q.fields.forEach((f, fi) => {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.step = 'any';
      inp.setAttribute('aria-label', '第 ' + q.n + ' 题 ' + f.label + '，单位' + f.unit);
      inp.placeholder = f.unit;
      inputs[f.id] = inp;
      const u = document.createElement('span');
      u.className = 'unit';
      u.textContent = f.unit;
      row.appendChild(inp); row.appendChild(u);
    });
    panel.appendChild(row);
  });

  const btnRow = document.createElement('div');
  btnRow.className = 'row';
  const checkBtn = document.createElement('button');
  checkBtn.textContent = '检查答案';
  checkBtn.addEventListener('click', checkAll);
  const resetBtn = document.createElement('button');
  resetBtn.textContent = '重来';
  resetBtn.addEventListener('click', resetAll);
  btnRow.appendChild(checkBtn);
  btnRow.appendChild(resetBtn);
  panel.appendChild(btnRow);

  fbEl = document.createElement('div');
  fbEl.className = 'fb';
  fbEl.style.height = FB_H + 'px';
  panel.appendChild(fbEl);

  onSlide();
  renderStatus();
  renderFeedback();
}

function buildChart(cv) {
  // 用 {x, y} 点而不是 labels：x 轴必须是 linear，否则当前 T 的参考线会被当成类目下标画到画布外
  const dData = T_GRID.map(t => ({ x: t, y: +daytona(t).toFixed(4) }));
  const eData = T_GRID.map(t => ({ x: t, y: +e2b(t).toFixed(4) }));
  const dDs = {
    label: 'Daytona：(' + DAYTONA_START + ' + T) / 60 × ' + DAYTONA_RATE,
    data: dData, borderColor: '#0072B2', backgroundColor: 'rgba(0,114,178,0.10)',
    pointRadius: 4, pointBackgroundColor: '#0072B2', borderWidth: 3, tension: 0, fill: false, _labelColor: '#00354F'
  };
  const eDs = {
    label: 'E2B：(' + E2B_START + ' + T) / 60 × ' + E2B_RATE,
    data: eData, borderColor: '#D55E00', backgroundColor: 'rgba(213,94,0,0.10)',
    pointRadius: 4, pointBackgroundColor: '#D55E00', borderWidth: 3, borderDash: [7, 4], tension: 0, fill: false, _labelColor: '#7A2600'
  };
  chart = new Chart(cv.getContext('2d'), {
    type: 'line',
    data: { datasets: [dDs, eDs] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 150 },
      layout: { padding: { top: 20, right: 46 } },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: '单次执行时长 T（秒）', font: { size: 16 } },
          min: 0, max: 62, ticks: { stepSize: 5, font: { size: 14 } }
        },
        y: {
          title: { display: true, text: '单次成本（元）', font: { size: 16 } },
          min: 0, ticks: { callback: v => v.toFixed(3), font: { size: 14 } }
        }
      },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { boxWidth: 26, boxHeight: 12, padding: 10 } },
        title: { display: true, text: '两条成本线都向上，但斜率差一截：T = 5 秒时 0.0074 / 0.0041 元，T = 60 秒时 0.0624 / 0.0408 元', font: { size: 18 } },
        tooltip: {
          callbacks: {
            label: ctx2 => ctx2.dataset.label + ' → ' + ctx2.parsed.y.toFixed(4) + ' 元'
          }
        }
      }
    },
    plugins: [PointLabels, CurrentT]
  });
}

function onSlide() {
  const T = parseInt(slider.value, 10);
  valEl.textContent = T + ' 秒';
  const d = daytona(T), e = e2b(T);
  readEl.innerHTML = '当前 T = <b>' + T + ' 秒</b>：Daytona ' + d.toFixed(4) + ' 元/次，E2B ' + e.toFixed(4) +
    ' 元/次，差额 <b>' + gapClosed(T).toFixed(4) + ' 元</b> =（0.096 + 0.02T）/ 60。<br>' +
    '更便宜的是 <b>E2B</b>。端点：T = 5 秒 → 0.0074 / 0.0041 元；T = 60 秒 → 0.0624 / 0.0408 元；两线不相交。';
  if (chart) chart.update('none');
}

function checkAll() {
  for (let i = 0; i < QUESTIONS.length; i++) {
    if (revealed[i]) continue;
    const q = QUESTIONS[i];
    let ok = true, blank = false;
    q.fields.forEach(f => {
      const raw = inputs[f.id].value.trim();
      const v = parseFloat(raw);
      if (raw === '' || isNaN(v)) { blank = true; ok = false; return; }
      const exp = EXPECT[q.n + '_' + f.id];
      if (Math.abs(v - exp) > f.tol) ok = false;
    });
    if (blank) {
      fbEl.innerHTML = '<span class="no">第 ' + q.n + ' 题还有空没填。</span>三道题按固定顺序作答，每题两次机会。' +
        '（已答对 ' + correctCount + ' 题，已用 ' + attempts + ' 次提交。）';
      return;
    }
    revealed[i] = true;
    correctFlags[i] = ok;
    if (ok) correctCount++;
    attempts++;
  }
  renderStatus();
  renderFeedback();
}

function resetAll() {
  attempts = 0; correctCount = 0;
  revealed = [false, false, false];
  correctFlags = [false, false, false];
  Object.keys(inputs).forEach(k => { inputs[k].value = ''; });
  slider.value = T_DEF;
  onSlide();
  renderStatus();
  renderFeedback();
}

function renderStatus() {
  const n = revealed.filter(Boolean).length;
  statusEl.textContent = '两线始终不相交：启动快 1.2 秒只值 0.0008 元，单价差每分钟 0.02 元。' +
    '｜答对 ' + correctCount + ' / 3 题';
}

function renderFeedback() {
  if (!revealed.some(Boolean)) {
    fbEl.innerHTML = '屏幕提问：启动快 1.2 秒，到底能省多少钱？先拖滑块看两条线的间距，再算这笔账。' +
      '<br>Daytona 单次成本 = (2.4 + T) / 60 × 0.06 元；E2B 单次成本 = (1.2 + T) / 60 × 0.04 元。' +
      '起点 2.4 秒 / 1.2 秒为实测创建或启动时间，单价为教学用示意价。<br>' +
      '两条线的差额 = (0.096 + 0.02T) / 60 元，该式在 T ≥ 0 时恒为正，因此不存在并列。' +
      '挑战题按固定顺序作答，每题两次机会，金额容差 ±0.0001 元、百分比容差 ±0.1 个百分点。';
    return;
  }
  let html = '';
  QUESTIONS.forEach((q, i) => {
    if (!revealed[i]) return;
    const ok = correctFlags[i];
    html += '<span class="' + (ok ? 'ok">✓' : 'no">✗') + '</span> Q' + q.n + '：' +
      (ok ? q.correct : q.hint) + '<br>';
    html += '　' + q.calc + '<br>';
  });
  if (revealed.every(Boolean)) {
    html += '场景建议：一次性短任务选 E2B，需要持久工作区与快照复用则接受 Daytona 的溢价。' +
      '三步：启动快的那 1.2 秒只值 0.0008 元，而单价差是每分钟 0.02 元，量级完全不同。';
  } else {
    html += '还有 ' + (3 - revealed.filter(Boolean).length) + ' 题未提交，全部结束后展示场景建议。';
  }
  fbEl.innerHTML = html;
}

window.addEventListener('resize', () => { if (chart) chart.resize(); });
window.addEventListener('DOMContentLoaded', buildUI);