// 语音端到端延迟预算分配 — Voice Latency Budget
// 教学目标：调节首音频延迟的五段预算并观察总延迟的实时变化，算出默认合计与余量、
//           只压 VAD 到下限后的合计与节省量、三步联合优化后的合计与余量。
// 规格来源：docs/chapters/13-multimodal-apps 的 voice-latency-budget 规格块
//
// ---- 布局计算（先算再写码）----
// 控件清单：1 行状态 + 5 个滑块（3 列网格 2 行 × 40px）+ 3 行读数
//           + 3 行挑战题 + 1 行按钮 + 反馈文本区
// controlHeight = 8 + 22(状态) + 80(滑块 2 行) + 69(读数 3 行) + 90(3 道题) + 30(按钮) + 198(反馈 10 行) = 497
// drawHeight = 400；iframeHeight = drawHeight + controlHeight + 2 = 899

const drawHeight = 400;
const GRID_H = 2 * 40;                          // 80
const READ_H = 3 * 21 + 6;                      // 69
const FB_LINES = 10;
const FB_H = FB_LINES * 19 + 8;                  // 141
const controlHeight = 8 + 22 + GRID_H + READ_H + 30 * 3 + 30 + FB_H; // 497
const IFRAME_HEIGHT = drawHeight + controlHeight + 2; // 899

const GATE_MS = 1500;          // 首音频延迟门禁 1,500 毫秒
const BASE_TOTAL = 1300;       // 默认合计
const BASE_MARGIN = 200;       // 默认余量
const BASE_MARGIN_PCT = 13.3;  // 默认余量占比
const P95_BASE = 1680;         // 默认配置实测 P95（会破门禁）
const TOL_PCT = 0.1;           // 余量占比容差 ±0.1 个百分点

// 五段预算（规格块 Content：最小 / 最大 / 步长 / 默认，单位毫秒）
// 配色取 Okabe-Ito 色盲友好色板，横轴与图例文字标签作为第二重线索
const SEGS = [
  { key: 'vad',   name: 'VAD 静音判定', min: 200, max: 900, step: 20, def: 500, color: '#0072B2' },
  { key: 'asr',   name: 'ASR 识别尾包', min: 80,  max: 600, step: 10, def: 220, color: '#E69F00' },
  { key: 'llm',   name: '模型首 token', min: 120, max: 900, step: 10, def: 340, color: '#009E73' },
  { key: 'tts',   name: 'TTS 首包',     min: 60,  max: 500, step: 10, def: 180, color: '#CC79A7' },
  { key: 'net',   name: '传输与编码',   min: 20,  max: 200, step: 10, def: 60,  color: '#5A5A5A' }
];

// 规格块给出的关键场景数值
const VAD_ONLY_TOTAL = 1000;      // 只把 VAD 压到可压下限 200 毫秒
const VAD_ONLY_SAVE = 300;
const COMBO_TOTAL = 1020;         // 三步联合优化：VAD 到 300、ASR 到 180、TTS 到 140
const COMBO_MARGIN = 480;
const COMBO_VS_ONLY = VAD_ONLY_TOTAL - COMBO_TOTAL; // −20，负值表示联合方案比只压 VAD 更慢
const FALSE_TRIGGER_LOW = 3.5;    // VAD ≥ 300 毫秒时的打断误触发率
const FALSE_TRIGGER_HIGH = 11.2;  // VAD = 200 毫秒时的打断误触发率

const QUESTIONS = [
  {
    n: 1,
    text: '默认合计、余量、余量占比三项',
    fields: [
      { id: 'q1a', tol: 0 }, { id: 'q1b', tol: 0 }, { id: 'q1c', tol: TOL_PCT }
    ],
    correct: '正确，1,300 毫秒，余量 200 毫秒，余量占比 13.3%。',
    calc: '五段串行相加：500 + 220 + 340 + 180 + 60 = 1,300 毫秒。余量 1,500 − 1,300 = 200 毫秒，占比 200 ÷ 1,500 = 13.3%。余量偏薄，因为实测 P95 是 1,680 毫秒，默认配置会在 5% 的请求上破门禁。',
    hint: '回到堆叠条形按五段串行相加，再和 1,500 毫秒门禁相减。'
  },
  {
    n: 2,
    text: '只压 VAD 到 200 毫秒的合计与节省',
    fields: [{ id: 'q2a', tol: 0 }, { id: 'q2b', tol: 0 }],
    correct: '正确，合计 1,000 毫秒，节省 300 毫秒。',
    calc: '200 + 220 + 340 + 180 + 60 = 1,000 毫秒，比默认少 300 毫秒。但 VAD 低于 300 毫秒会把打断误触发率从 3.5% 抬到 11.2%，省下的 300 毫秒要用三倍投诉量换。',
    hint: '回到堆叠条形按五段串行相加，再和 1,500 毫秒门禁相减。'
  },
  {
    n: 3,
    text: '联合优化（VAD 300 / ASR 180 / TTS 140）后三项',
    fields: [{ id: 'q3a', tol: 0 }, { id: 'q3b', tol: 0 }, { id: 'q3c', tol: 0 }],
    correct: '正确，合计 1,020 毫秒，余量 480 毫秒，比第 2 题少省 20 毫秒。',
    calc: '300 + 180 + 340 + 140 + 60 = 1,020 毫秒，余量 1,500 − 1,020 = 480 毫秒，占比 32.0%。与只压 VAD 的 1,000 毫秒相比，联合方案反而慢 20 毫秒，但打断误触发率保持在 3.5%，P95 落在 1,420 毫秒，门禁通过且留足余量。',
    hint: '回到堆叠条形按五段串行相加，再和 1,500 毫秒门禁相减。'
  }
];
const EXPECT = {
  q1a: BASE_TOTAL, q1b: BASE_MARGIN, q1c: BASE_MARGIN_PCT,
  q2a: VAD_ONLY_TOTAL, q2b: VAD_ONLY_SAVE,
  q3a: COMBO_TOTAL, q3b: COMBO_MARGIN, q3c: COMBO_VS_ONLY
};
const FIELD_UNIT = {
  q1a: '毫秒', q1b: '毫秒', q1c: '%', q2a: '毫秒', q2b: '毫秒',
  q3a: '毫秒', q3b: '毫秒', q3c: '毫秒'
};

let chart = null;
let lastSig = '';
let sliders = {};
let valueEls = {};
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

function vals() { return SEGS.map(s => parseInt(sliders[s.key].value, 10)); }
function total() { return vals().reduce((a, b) => a + b, 0); }
function margin() { return GATE_MS - total(); }
function marginPct() { return margin() / GATE_MS * 100; }
// 规格块生成规则：VAD 阈值不低于 300 毫秒时固定 3.5%，低于 300 毫秒时按每降 50 毫秒抬升 3.85 个百分点
// 该斜率使得 VAD = 200 毫秒时恰为规格块给出的 11.2%
function falseTrigger() {
  const v = parseInt(sliders.vad.value, 10);
  return v >= 300 ? FALSE_TRIGGER_LOW : FALSE_TRIGGER_LOW + (300 - v) / 50 * 3.85;
}

// 堆叠段上的数值标签 + 合计标签 + 1,500 毫秒门禁线
const StackLabels = {
  id: 'stackLabels',
  afterDatasetsDraw(c) {
    const ctx = c.ctx;
    ctx.save();
    const v = vals();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 12px Arial';
    SEGS.forEach((s, i) => {
      const el = c.getDatasetMeta(i).data[0];
      if (!el || v[i] <= 0) return;
      const h = el.base - el.y;
      if (h < 22) {   // 太短的段把数字标到柱体右侧的空白处，避免白字压出柱外或叠字
        ctx.fillStyle = '#1a1a1a';
        ctx.textAlign = 'left';
        ctx.fillText(String(v[i]), el.x + el.width / 2 + 6, (el.base + el.y) / 2);
        ctx.textAlign = 'center';
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(v[i]), el.x, (el.base + el.y) / 2);
      }
    });
    ctx.font = '700 14px Arial';
    ctx.fillStyle = '#1a1a1a';
    const t = total().toLocaleString('en-US');
    [0, 1].forEach(k => {
      const el = c.getDatasetMeta(SEGS.length).data[k];
      if (el) ctx.fillText('合计 ' + t + ' 毫秒', el.x, el.y - 16);
    });
    const mg = c.getDatasetMeta(SEGS.length + 1).data[1];
    if (mg && margin() > 0) {
      ctx.fillStyle = '#222222';
      ctx.font = '600 12px Arial';
      ctx.fillText('余量 ' + margin().toLocaleString('en-US'), mg.x, (mg.base + mg.y) / 2);
    }
    ctx.restore();
  }
};

const GateLine = {
  id: 'gateLine',
  afterDatasetsDraw(c) {
    const y = c.scales.y.getPixelForValue(GATE_MS);
    if (y < c.chartArea.top || y > c.chartArea.bottom) return;
    const ctx = c.ctx;
    ctx.save();
    ctx.strokeStyle = '#B00020';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(c.chartArea.left, y);
    ctx.lineTo(c.chartArea.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '700 13px Arial';
    ctx.fillStyle = '#B00020';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('门禁 1,500 毫秒', c.chartArea.right - 6, y - 4);
    ctx.restore();
  }
};

function buildUI() {
  const chartArea = document.getElementById('chartArea');
  chartArea.style.height = drawHeight + 'px';
  const cv = document.createElement('canvas');
  cv.id = 'chart';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', '首音频延迟五段串行堆叠条形图，默认合计 1,300 毫秒，与 1,500 毫秒门禁的余量为 200 毫秒');
  chartArea.appendChild(cv);
  buildChart(cv);

  const panel = document.getElementById('panel');
  panel.style.height = controlHeight + 'px';

  statusEl = document.createElement('div');
  statusEl.className = 'status';
  panel.appendChild(statusEl);

  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.style.height = GRID_H + 'px';
  SEGS.forEach(s => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const lbl = document.createElement('span');
    lbl.className = 'clbl';
    lbl.textContent = s.name + '（' + s.min + '–' + s.max + ' 毫秒）';
    lbl.title = s.name;
    const crow = document.createElement('div');
    crow.className = 'crow';
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = s.min; inp.max = s.max; inp.step = s.step; inp.value = s.def;
    inp.setAttribute('aria-label', s.name + '，单位毫秒');
    inp.addEventListener('input', onSlide);
    const val = document.createElement('span');
    val.className = 'cval';
    val.textContent = s.def;
    crow.appendChild(inp); crow.appendChild(val);
    cell.appendChild(lbl); cell.appendChild(crow);
    grid.appendChild(cell);
    sliders[s.key] = inp;
    valueEls[s.key] = val;
  });
  panel.appendChild(grid);

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

function buildChart(cv) {
  const v0 = SEGS.map(s => s.def);
  const t0 = v0.reduce((a, b) => a + b, 0);
  const mk = (label, color, border, data) => ({
    label: label, data: data, backgroundColor: color, borderColor: border,
    borderWidth: 1, borderRadius: 2, maxBarThickness: 120
  });
  const dsSeg = SEGS.map((s, i) => mk(s.name, s.color, s.color, [v0[i], 0]));
  const dsTotal = mk('首音频延迟合计（深色柱）', '#4A4A4A', '#222222', [t0, t0]);
  const dsMargin = mk('与门禁的余量（浅色柱，补足到 1,500）', '#B9C4CF', '#7A8794', [0, GATE_MS - t0]);
  lastSig = v0.join(',');   // 初始数据已正确，避免构造后立刻 update('none') 把柱高打成 0
  chart = new Chart(cv.getContext('2d'), {
    type: 'bar',
    data: { labels: ['五段串行求和', '与 1,500 毫秒门禁对比'], datasets: dsSeg.concat([dsTotal, dsMargin]) },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      layout: { padding: { top: 24, right: 12 } },
      scales: {
        x: {
          stacked: true,
          title: { display: true, text: '首音频延迟构成（五段严格串行，不存在并行重叠）', font: { size: 16 } },
          ticks: { font: { size: 14 }, autoSkip: false }, grid: { display: false }
        },
        y: {
          stacked: true,
          title: { display: true, text: '首音频延迟（毫秒）', font: { size: 16 } },
          beginAtZero: true, suggestedMax: 1800,
          ticks: { font: { size: 14 } }
        }
      },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { boxWidth: 16, boxHeight: 12, padding: 10, font: { size: 13 } } },
        title: { display: true, text: '首音频延迟预算分配：默认合计 1,300 毫秒，门禁 1,500 毫秒', font: { size: 18 } },
        tooltip: { mode: 'index', intersect: false }
      }
    },
    plugins: [StackLabels, GateLine]
  });
}

function onSlide() {
  const v = vals();
  SEGS.forEach((s, i) => { valueEls[s.key].textContent = v[i]; });
  const t = total(), m = margin();
  const over = m < 0;
  readEl.innerHTML = '首音频延迟合计 <b>' + t.toLocaleString('en-US') + ' 毫秒</b>；与 1,500 毫秒门禁<b class="' +
    (over ? 'no' : 'ok') + '">' + (over ? '超出额度 ' + (-m).toLocaleString('en-US') : '余量 ' + m.toLocaleString('en-US')) +
    ' 毫秒</b>，余量占比 ' + marginPct().toFixed(1) + '%。<br>' +
    '门禁判定：' + (over ? '<b class="no">不通过</b>（合计超过 1,500 毫秒）' : '<b class="ok">通过</b>（合计不超过 1,500 毫秒）') +
    '；默认配置实测 P95 为 ' + P95_BASE + ' 毫秒，会在 5% 的请求上破门禁。<br>' +
    '打断误触发率 <b class="' + (falseTrigger() > FALSE_TRIGGER_LOW + 0.01 ? 'no' : 'ok') + '">' +
    falseTrigger().toFixed(1) + '%</b>：VAD 不低于 300 毫秒时 3.5%，低于 300 毫秒时每降 50 毫秒抬升 3.85 个百分点。';
  const sig = v.join(',');
  if (chart && sig !== lastSig) {
    lastSig = sig;
    SEGS.forEach((s, i) => { chart.data.datasets[i].data = [v[i], 0]; });
    chart.data.datasets[SEGS.length].data = [t, t];
    chart.data.datasets[SEGS.length + 1].data = [0, Math.max(0, m)];
    chart.update('none');
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
    if (blank) {
      fbEl.innerHTML = '<span class="no">第 ' + q.n + ' 题还有空没填。</span>三道题按固定顺序作答，每题两次机会；' +
        '答案一律按规格块给定的目标值计算，与滑块当前值无关。（已答对 ' + correctCount + ' 题，已用 ' + attempts + ' 次提交。）';
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
  SEGS.forEach(s => { sliders[s.key].value = s.def; });
  onSlide();
  renderStatus();
  renderFeedback();
}

function renderStatus() {
  const n = revealed.filter(Boolean).length;
  statusEl.textContent = '首音频延迟 ' + (total() / 1000).toFixed(2) + ' 秒里，哪一段该先动？｜答对 ' +
    correctCount + ' / 3 题' + (n === 3 ? '｜满分 3 分，答对 2 分视为掌握' : '｜已揭晓 ' + n + ' / 3 题');
}

function renderFeedback() {
  if (!revealed.some(Boolean)) {
    fbEl.innerHTML = '屏幕提问：首音频延迟 1.30 秒里，哪一段该先动？先拖一遍，再算三道题。' +
      '<br>五段严格串行：首音频延迟 = 五段当前值之和；余量 = 1,500 − 合计，负值显示为超出额度并标红；' +
      '余量占比 =（1,500 − 合计）÷ 1,500 × 100%，保留一位小数。<br>' +
      '先只拖动 TTS 首包从 180 毫秒降到 140 毫秒，观察总延迟从 1,300 降到 1,260 毫秒，其余四段完全不变；' +
      '再把 VAD 从 500 拖到 200 毫秒，观察余量涨到 500 毫秒、同步看到打断误触发率从 3.5% 跳到 11.2%。';
    return;
  }
  let html = '';
  QUESTIONS.forEach((q, i) => {
    if (!revealed[i]) return;
    const ok = correctFlags[i];
    html += '<span class="' + (ok ? 'ok">✓' : 'no">✗') + '</span> Q' + q.n + '：' + (ok ? q.correct : q.hint) + '<br>';
    html += '　' + q.calc + '<br>';
  });
  if (revealed.every(Boolean)) {
    html += '第 2 题与第 3 题的结论相反：算术上最优的单段方案在体验上最差。' +
      '首音频延迟的优化顺序应当是“先动别处，最后动 VAD”。';
  } else {
    html += '还有 ' + (3 - revealed.filter(Boolean).length) + ' 题未提交。';
  }
  fbEl.innerHTML = html;
}

window.addEventListener('resize', () => { if (chart) chart.resize(); });
window.addEventListener('DOMContentLoaded', buildUI);