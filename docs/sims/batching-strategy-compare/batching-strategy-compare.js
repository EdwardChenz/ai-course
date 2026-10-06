// 静态批处理与连续批处理的吞吐延迟对比 — Batching Strategy Compare
// 教学目标：调节批并发上限、平均输出长度与最长输出长度，观察两种策略的吞吐与 P50 延迟
//           的实时变化，并算出静态批耗时、连续批吞吐与 P50、算力利用率与并发翻倍的代价。
// 规格来源：docs/chapters/14-inference-deploy 的 batching-strategy-compare 规格块
//
// ---- 布局计算（先算再写码）----
// 控件清单：1 行状态 + 3 行滑块 + 2 行读数 + 4 行挑战题 + 1 行按钮 + 反馈文本区
// controlHeight = 8 + 22(状态) + 90(3 个滑块) + 69(读数 3 行) + 150(4 道题 + Q4 结论行) + 30(按钮) + 236(反馈 12 行) = 605
// drawHeight = 400；iframeHeight = drawHeight + controlHeight + 2 = 1007

const drawHeight = 400;
const READ_H = 3 * 21 + 6;                      // 69
const FB_LINES = 12;
const FB_H = FB_LINES * 19 + 8;                  // 122
const controlHeight = 8 + 22 + 30 * 3 + READ_H + 30 * 5 + 30 + FB_H; // 605
const IFRAME_HEIGHT = drawHeight + controlHeight + 2; // 1007

// ---- 模型常量（规格块 Rules / Provenance）----
const DECODE_TPS = 80;          // 单序列解码速度，token/s
const SCHED_MS = 50;            // 调度周期，毫秒
const CONT_BOOST = 3.0;         // 连续批处理相对静态的吞吐系数
const CONT_UTIL = 89;           // 连续批处理算力利用率口径，%
const KV_PER_TOKEN_MB = 0.5;    // 7B FP16 每 token KV 显存，MB
const KV_CTX = 4096;            // 上下文长度
const VRAM_BUDGET_GB = 72;      // 单卡显存预算，GB
const WEIGHT_GB = 14;           // 7B FP16 权重，GB

const TOL_SEC = 0.1;   // 批耗时与延迟容差 ±0.1 秒
const TOL_QPS = 0.01;  // 吞吐容差 ±0.01 QPS
const TOL_PCT = 0;     // 利用率容差 ±0 个百分点
const TOL_GB = 0.1;    // KV 显存容差 ±0.1 GB

// 三个可调项（规格块 Content：最小 / 最大 / 步长 / 默认）
const KNOBS = [
  { key: 'conc',   name: '批并发上限',   min: 16,  max: 64, step: 16, def: 32, unit: '条' },
  { key: 'avgLen', name: '平均输出长度', min: 160, max: 640, step: 160, def: 320, unit: 'token' },
  { key: 'maxLen', name: '最长输出长度', min: 1000, max: 4000, step: 500, def: 2000, unit: 'token' }
];

// ---- 模型公式（规格块 Rules）----
function conc() { return parseInt(sliders.conc.value, 10); }
function avgLen() { return parseInt(sliders.avgLen.value, 10); }
function maxLen() { return parseInt(sliders.maxLen.value, 10); }
function staticBatchSec() { return maxLen() / DECODE_TPS; }                        // 25.0 秒
function staticQps() { return conc() / staticBatchSec(); }                          // 1.28 QPS
function contQps() { return staticQps() * CONT_BOOST; }                             // 3.84 QPS
function staticP50() { return staticBatchSec(); }
function contP50() {                                                          // 按 0.1 秒向上取整到 0.2 秒的整数倍
  const raw = avgLen() / DECODE_TPS + SCHED_MS / 1000;
  return Math.ceil(raw / 0.2 - 1e-9) * 0.2;
}
function staticUtil() { return Math.round(avgLen() / maxLen() * 100); }         // 16%
function kvGB() { return conc() * KV_CTX * KV_PER_TOKEN_MB / 1024; }            // 64.0 GB

const QUESTIONS = [
  {
    n: 1,
    text: '静态批耗时（秒）与静态吞吐（QPS）',
    fields: [{ id: 'q1a', unit: '秒', tol: TOL_SEC }, { id: 'q1b', unit: 'QPS', tol: TOL_QPS }],
    correct: '正确，批耗时 25.0 秒，吞吐 1.28 QPS。',
    calc: '批耗时由最长请求决定：2,000 ÷ 80 = 25.0 秒。吞吐 = 批并发上限 ÷ 批耗时 = 32 ÷ 25 = 1.28 QPS。',
    hint: '回到公式：静态批耗时由最长输出决定，吞吐 = 批并发上限 ÷ 批耗时。',
    insight: '第 1 题说明静态批处理的延迟被最长请求绑架——一个 2,000 token 的请求会让同批另外 31 个请求全部陪等 25 秒。'
  },
  {
    n: 2,
    text: '连续批处理的吞吐（QPS）与 P50 延迟（秒）',
    fields: [{ id: 'q2a', unit: 'QPS', tol: TOL_QPS }, { id: 'q2b', unit: '秒', tol: TOL_SEC }],
    correct: '正确，3.84 QPS，4.2 秒。',
    calc: '连续批处理吞吐 = 静态吞吐 × 3.0 = 1.28 × 3.0 = 3.84 QPS。P50 = 平均输出 ÷ 80 + 调度周期 = 320 ÷ 80 + 0.05 ≈ 4.05 秒，取一次调度对齐后的 4.2 秒。',
    hint: '回到公式：静态批耗时由最长输出决定，吞吐 = 批并发上限 ÷ 批耗时。',
    insight: '第 2 题说明连续批处理的两端同时改善：吞吐涨 3.0 倍而 P50 掉到 4.2 秒，因为等待被压到了单次调度周期内。'
  },
  {
    n: 3,
    text: '两种策略的算力利用率（%）',
    fields: [{ id: 'q3a', unit: '%', tol: TOL_PCT }, { id: 'q3b', unit: '%', tol: TOL_PCT }],
    correct: '正确，静态 16%，连续 89%。',
    calc: '静态利用率 = 平均输出 ÷ 最长输出 = 320 ÷ 2,000 = 16%，也就是 84% 的算力在给已完成的请求空转。连续批处理下窗口始终满载，本章口径为 89%。',
    hint: '回到公式：静态批耗时由最长输出决定，吞吐 = 批并发上限 ÷ 批耗时。',
    insight: '第 3 题的 16% 是本章最有说服力的数字：静态批处理下 84% 的 GPU 算力在空转，这也是它吞吐低的唯一原因。'
  },
  {
    n: 4,
    text: '批并发 32 → 64 后的静态吞吐与 KV 显存',
    fields: [{ id: 'q4a', tol: TOL_QPS }, { id: 'q4b', tol: TOL_GB }],
    select: 'q4c',
    selectOptions: ['可行', '不可行（OOM）'],
    correct: '正确，2.56 QPS，128.0 GB，不可行（OOM）。',
    calc: '批耗时仍被 2,000 token 的最长请求锁死在 25.0 秒，吞吐 = 64 ÷ 25 = 2.56 QPS；但 64 路并发 × 4,096 token × 0.5 MB 每 token = 131,072 MB = 128 GB KV，加上 14 GB 权重远超 72 GB 显存预算，会直接 OOM。并发翻倍不等于吞吐翻倍，瓶颈在批耗时。',
    hint: '回到公式：静态批耗时由最长输出决定，吞吐 = 批并发上限 ÷ 批耗时。',
    insight: '第 4 题是陷阱：静态吞吐确实从 1.28 涨到 2.56 QPS（接近翻倍），但 KV 显存需求从 64 GB 涨到 128 GB，单卡 72 GB 预算下必然 OOM；正确做法是用连续批处理并把并发控制在 24 路。'
  }
];
// 标准答案一律按默认取值口径（批并发上限 32、平均输出 320 token、最长输出 2,000 token）
const EXPECT = {
  q1a: 25.0, q1b: 1.28,
  q2a: 3.84, q2b: 4.2,
  q3a: 16, q3b: 89,
  q4a: 2.56, q4b: 128.0, q4c: '不可行（OOM）'
};
const FIELD_UNIT = { q1a: '秒', q1b: 'QPS', q2a: 'QPS', q2b: '秒', q3a: '%', q3b: '%', q4a: 'QPS', q4b: 'GB' };

let chartQps = null;
let chartLat = null;
let lastSig = '';
let sliders = {};
let valueEls = {};
let readEl = null;
let statusEl = null;
let fbEl = null;
let inputs = {};
let attempts = 0;
let correctCount = 0;
let revealed = [false, false, false, false];
let correctFlags = [false, false, false, false];

Chart.defaults.font.family = 'Arial, Helvetica, sans-serif';
Chart.defaults.font.size = 14;
Chart.defaults.plugins.title.font = { size: 17 };
Chart.defaults.plugins.legend.labels.font = { size: 13 };

// 格式化函数必须用工厂闭包传入：写进 options.plugins 会命中 Chart.js 的选项代理，
// 函数属性会被包成自引用代理，调用时报 "Recursion detected: formatter->formatter"。
function makeValueLabels(fmt) {
  return {
    id: 'valueLabels',
    afterDatasetsDraw(c) {
      const ctx = c.ctx;
      ctx.save();
      ctx.font = '700 13px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#1a1a1a';
      // 注意：Chart.js 4.4 的 bar 元素上没有可用的 index 属性，只能用 forEach 的下标
      c.data.datasets.forEach((ds, di) => {
        c.getDatasetMeta(di).data.forEach((el, i) => {
          const v = ds.data[i];
          if (v === null || v === undefined) return;
          ctx.fillText(fmt(v), el.x, el.y - 6);
        });
      });
      ctx.restore();
    }
  };
}

function buildUI() {
  const chartArea = document.getElementById('chartArea');
  chartArea.style.height = drawHeight + 'px';
  buildCharts();

  const panel = document.getElementById('panel');
  panel.style.height = controlHeight + 'px';

  statusEl = document.createElement('div');
  statusEl.className = 'status';
  panel.appendChild(statusEl);

  KNOBS.forEach(k => {
    const row = document.createElement('div');
    row.className = 'row';
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = k.name + '（' + k.min + '–' + k.max + ' ' + k.unit + '，步长 ' + k.step + '）';
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = k.min; inp.max = k.max; inp.step = k.step; inp.value = k.def;
    inp.setAttribute('aria-label', k.name + '，单位' + k.unit);
    inp.addEventListener('input', onSlide);
    const val = document.createElement('span');
    val.className = 'val';
    const u = document.createElement('span');
    u.className = 'unit';
    u.textContent = k.unit;
    row.appendChild(lbl); row.appendChild(inp); row.appendChild(val); row.appendChild(u);
    panel.appendChild(row);
    sliders[k.key] = inp;
    valueEls[k.key] = val;
  });

  readEl = document.createElement('div');
  readEl.className = 'readout';
  readEl.style.height = READ_H + 'px';
  panel.appendChild(readEl);

  QUESTIONS.forEach(q => {
    const row = document.createElement('div');
    row.className = 'row';
    const lbl = document.createElement('span');
    lbl.className = 'q';
    lbl.textContent = 'Q' + q.n + '　' + q.text + '？';
    row.appendChild(lbl);
    q.fields.forEach(f => {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.step = 'any';
      inp.setAttribute('aria-label', 'Q' + q.n + ' ' + FIELD_UNIT[f.id]);
      inp.placeholder = FIELD_UNIT[f.id];
      inputs[f.id] = inp;
      const u = document.createElement('span');
      u.className = 'unit';
      u.textContent = FIELD_UNIT[f.id];
      row.appendChild(inp); row.appendChild(u);
    });
    panel.appendChild(row);
    if (q.select) {
      const row2 = document.createElement('div');
      row2.className = 'row';
      const lbl2 = document.createElement('span');
      lbl2.className = 'q-cont';
      lbl2.textContent = '（Q4 续）并发翻倍后是否可行';
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Q4 结论是否可行');
      const none = document.createElement('option');
      none.value = '';
      none.textContent = '（选择结论）';
      sel.appendChild(none);
      q.selectOptions.forEach(v => {
        const o = document.createElement('option');
        o.value = v; o.textContent = v;
        sel.appendChild(o);
      });
      inputs[q.select] = sel;
      row2.appendChild(lbl2); row2.appendChild(sel);
      panel.appendChild(row2);
    }
  });

  const btnRow = document.createElement('div');
  btnRow.className = 'row';
  const checkBtn = document.createElement('button');
  checkBtn.textContent = '检查答案';
  checkBtn.addEventListener('click', checkAll);
  const resetBtn = document.createElement('button');
  resetBtn.textContent = '恢复默认并重来';
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

function buildCharts() {
  const paneQ = document.getElementById('paneQps');
  const paneL = document.getElementById('paneLat');
  const cvQ = document.createElement('canvas');
  cvQ.id = 'chartQps';
  cvQ.setAttribute('role', 'img');
  cvQ.setAttribute('aria-label', '静态批处理与连续批处理的吞吐对比柱状图，单位 QPS');
  const cvL = document.createElement('canvas');
  cvL.id = 'chartLat';
  cvL.setAttribute('role', 'img');
  cvL.setAttribute('aria-label', '静态批处理与连续批处理的 P50 延迟对比柱状图，单位秒');
  paneQ.appendChild(cvQ);
  paneL.appendChild(cvL);

  // 初始数据直接用默认取值，避免 new Chart() 之后立刻 update('none') 把柱高打成 0
  const d0 = KNOBS[0].def, a0 = KNOBS[1].def, m0 = KNOBS[2].def;
  const batch0 = m0 / DECODE_TPS, sq0 = d0 / batch0, cq0 = sq0 * CONT_BOOST;
  const cp0 = Math.ceil((a0 / DECODE_TPS + SCHED_MS / 1000) / 0.2 - 1e-9) * 0.2;
  const mkDs = (label, color, border, data) => ({
    label: label, data: data, backgroundColor: color, borderColor: border,
    borderWidth: 2, borderRadius: 2, maxBarThickness: 66
  });

  chartQps = new Chart(cvQ.getContext('2d'), {
    type: 'bar',
    data: { labels: ['静态批处理', '连续批处理'], datasets: [mkDs('静态批处理', '#0072B2', '#00354F', [sq0, null]), mkDs('连续批处理', '#D55E00', '#7A2600', [null, cq0])] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 180 },
      layout: { padding: { top: 22, right: 6 } },
      scales: {
        x: { ticks: { font: { size: 14 } }, grid: { display: false } },
        y: { title: { display: true, text: '吞吐（QPS）', font: { size: 16 } }, beginAtZero: true, ticks: { font: { size: 13 } } }
      },
      plugins: {
        legend: { display: false },
        title: { display: true, text: '吞吐（QPS）', font: { size: 17 } },
        tooltip: { callbacks: { label: c => c.dataset.label + '：' + c.parsed.y.toFixed(2) + ' QPS' } }
      }
    },
    plugins: [makeValueLabels(v => v.toFixed(2))]
  });

  chartLat = new Chart(cvL.getContext('2d'), {
    type: 'bar',
    data: { labels: ['静态批处理', '连续批处理'], datasets: [mkDs('静态批处理', '#0072B2', '#00354F', [batch0, null]), mkDs('连续批处理', '#D55E00', '#7A2600', [null, cp0])] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 180 },
      layout: { padding: { top: 22, right: 6 } },
      scales: {
        x: { ticks: { font: { size: 14 } }, grid: { display: false } },
        y: { title: { display: true, text: 'P50 延迟（秒）', font: { size: 16 } }, beginAtZero: true, ticks: { font: { size: 13 } } }
      },
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'P50 延迟（秒）', font: { size: 17 } },
        tooltip: { callbacks: { label: c => c.dataset.label + '：' + c.parsed.y.toFixed(1) + ' 秒' } }
      }
    },
    plugins: [makeValueLabels(v => v.toFixed(1))]
  });
  lastSig = KNOBS.map(k => k.def).join(',');
}

function onSlide() {
  KNOBS.forEach(k => { valueEls[k.key].textContent = sliders[k.key].value + ' ' + k.unit; });
  const kv = kvGB();
  const fits = kv + WEIGHT_GB <= VRAM_BUDGET_GB;
  readEl.innerHTML = '静态批耗时 <b>' + staticBatchSec().toFixed(1) + ' 秒</b>（最长输出 ' + maxLen() +
    ' ÷ 80 决定）；静态吞吐 ' + staticQps().toFixed(2) + ' QPS，连续吞吐 ' + contQps().toFixed(2) + ' QPS。<br>' +
    '静态算力利用率 <b class="' + (staticUtil() >= 50 ? 'ok' : 'no') + '">' + staticUtil() + '%</b>（' +
    (100 - staticUtil()) + '% 的算力空转），连续批处理固定 89%。<br>' +
    'KV 显存 ' + conc() + ' × 4,096 × 0.5 MB ÷ 1,024 = <b class="' + (fits ? 'ok' : 'no') + '">' + kv.toFixed(1) +
    ' GB</b>，加 14 GB 权重共 ' + (kv + WEIGHT_GB).toFixed(1) + ' GB，对 72 GB 预算：<b class="' +
    (fits ? 'ok' : 'no') + '">' + (fits ? '可行' : '超预算') + '</b>。';
  const sig = KNOBS.map(k => sliders[k.key].value).join(',');
  if (chartQps && sig !== lastSig) {
    lastSig = sig;
    chartQps.data.datasets[0].data = [staticQps(), null];
    chartQps.data.datasets[1].data = [null, contQps()];
    chartQps.update('none');
    chartLat.data.datasets[0].data = [staticP50(), null];
    chartLat.data.datasets[1].data = [null, contP50()];
    chartLat.update('none');
  }
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
      if (Math.abs(v - EXPECT[f.id]) > f.tol) ok = false;
    });
    if (q.select) {
      const v = inputs[q.select].value;
      if (v === '') blank = true;
      else if (v !== EXPECT[q.select]) ok = false;
    }
    if (blank) {
      fbEl.innerHTML = '<span class="no">第 ' + q.n + ' 题还有空没填。</span>四道题按固定顺序作答，每题两次机会；' +
        '答案一律按默认取值口径计算，与滑块当前值无关。（已答对 ' + correctCount + ' 题，已用 ' + attempts + ' 次提交。）';
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
  revealed = [false, false, false, false];
  correctFlags = [false, false, false, false];
  Object.keys(inputs).forEach(k => { inputs[k].value = ''; });
  KNOBS.forEach(k => { sliders[k.key].value = k.def; });
  onSlide();
  renderStatus();
  renderFeedback();
}

function renderStatus() {
  const n = revealed.filter(Boolean).length;
  statusEl.textContent = '同样一张卡、同样 32 个请求，两种策略差在哪儿？｜答对 ' + correctCount +
    ' / 4 题' + (n === 4 ? '｜满分 4 分，答对 3 分视为掌握' : '｜已揭晓 ' + n + ' / 4 题');
}

function renderFeedback() {
  if (!revealed.some(Boolean)) {
    fbEl.innerHTML = '屏幕提问：同样一张卡、同样 32 个请求，两种策略差在哪儿？先拖一遍，再算四道题。' +
      '<br>单序列解码速度 80 token/s、调度周期 50 毫秒固定不变；静态批耗时 = 最长输出 ÷ 80，' +
      '静态吞吐 = 批并发上限 ÷ 批耗时，连续批吞吐 = 静态吞吐 × 3.0。<br>' +
      '先只拖动“平均输出长度”从 320 到 160，观察静态两根柱完全不动、连续那根 P50 掉到 2.2 秒；' +
      '再把“最长输出长度”从 2,000 拖到 4,000，观察静态吞吐掉到 0.64 而连续只掉到 1.92。';
    return;
  }
  let html = '';
  QUESTIONS.forEach((q, i) => {
    if (!revealed[i]) return;
    const ok = correctFlags[i];
    html += '<span class="' + (ok ? 'ok">✓' : 'no">✗') + '</span> Q' + q.n + '：' + (ok ? q.correct : q.hint) + '<br>';
    html += '　' + q.calc + (ok ? '' : '　' + q.insight) + '<br>';
  });
  if (revealed.every(Boolean)) {
    html += '连续批处理把吞吐提高 3.0 倍、P50 下降 83.2%；但把静态批并发翻倍换来的吞吐会被 KV 显存直接 OOM 掉。';
  } else {
    html += '还有 ' + (4 - revealed.filter(Boolean).length) + ' 题未提交。';
  }
  fbEl.innerHTML = html;
}

window.addEventListener('resize', () => { if (chartQps) chartQps.resize(); if (chartLat) chartLat.resize(); });
window.addEventListener('DOMContentLoaded', buildUI);