// 延迟分段瀑布与优化优先级 — Latency Segment Priority
// 教学目标：调节九个延迟分段观察端到端 P50 的实时变化，在三个候选优化动作里
//           按可省毫秒数排收益顺序，并判断三步全做后是否通过 3.00 秒的 P95 门禁。
// 规格来源：docs/chapters/11-observability-eval 的 latency-segment-priority 规格块
//
// ---- 布局计算（先算再写码）----
// 控件清单：1 行状态 + 九个滑块（3 列 × 3 行 × 40px）+ 2 行读数 + 动作表（表头 + 3 行 × 23px）
//           + 3 行挑战题 + 1 行按钮 + 反馈文本区
// controlHeight = 8 + 22(状态) + 120(滑块 3 行) + 48(读数 2 行) + 92(动作表) + 90(3 道题) + 30(按钮) + 141(反馈 7 行) = 551
// drawHeight = 400；iframeHeight = drawHeight + controlHeight + 2 = 953

const drawHeight = 400;
const GRID_ROWS = 3;
const CELL_H = 40;
const GRID_H = GRID_ROWS * CELL_H;               // 120
const READ_H = 2 * 21 + 6;                      // 48
const ACT_H = 4 * 23;                           // 92（表头 + 3 个动作）
const FB_LINES = 7;
const FB_H = FB_LINES * 19 + 8;                  // 122
const controlHeight = 8 + 22 + GRID_H + READ_H + ACT_H + 30 * 3 + 30 + FB_H; // 551
const IFRAME_HEIGHT = drawHeight + controlHeight + 2; // 953

const GATE_MS = 3000;      // P95 门禁 3.00 秒
const P95_OFFSET = 550;    // 教学设定：P95 = P50 + 550 毫秒（默认 P50 2800、P95 3350）
const TOL_PCT = 0.1;       // 百分比容差 ±0.1 个百分点

// 九个延迟分段（规格块 Content：最小 / 最大 / 步长 / 默认，单位毫秒）
// 配色取 Okabe-Ito 与其扩展色板（色盲友好），每段的 x 轴标签作为第二重线索
const SEGMENTS = [
  { key: 'rewrite',  name: '查询改写',   min: 0,    max: 400,  step: 10, def: 180, color: '#0072B2' },
  { key: 'retrieve', name: '检索',       min: 20,   max: 300,  step: 5,  def: 70,  color: '#E69F00' },
  { key: 'rerank',   name: '重排',       min: 0,    max: 400,  step: 10, def: 120, color: '#009E73' },
  { key: 'compress', name: '上下文压缩', min: 0,    max: 300,  step: 10, def: 60,  color: '#CC79A7' },
  { key: 'ttft',     name: '首 token 等待', min: 100, max: 1500, step: 10, def: 620, color: '#56B4E9' },
  { key: 'gen',      name: '逐 token 生成', min: 200, max: 2500, step: 20, def: 900, color: '#D55E00' },
  { key: 'tool',     name: '工具调用',   min: 0,    max: 1200, step: 10, def: 630, color: '#8B6F00' },
  { key: 'cite',     name: '引用校验',   min: 0,    max: 400,  step: 10, def: 140, color: '#5A5A5A' },
  { key: 'persist',  name: '落库',       min: 0,    max: 300,  step: 10, def: 80,  color: '#2E7D8F' }
];
const BASE_TOTAL = 2800;

// 三个候选优化动作（规格块 Content：可省值由默认值与目标值之差确定，为固定常数）
const ACTIONS = [
  { name: '工具调用并行化',        seg: '工具调用', from: 630, to: 230, save: 400 },
  { name: '首 token 走提示缓存',   seg: '首 token 等待', from: 620, to: 390, save: 230 },
  { name: '跳过无指代查询的改写',  seg: '查询改写',   from: 180, to: 0,   save: 180 }
];
const ORDER = [ACTIONS[0].name, ACTIONS[1].name, ACTIONS[2].name]; // 400 > 230 > 180
const AFTER_ALL = BASE_TOTAL - 400 - 230 - 180;          // 1,990 毫秒
const AFTER_P95 = 3350 - (400 + 230 + 180);              // 2,540 毫秒
const AFTER_MARGIN = GATE_MS - AFTER_P95;                // 460 毫秒
const GEN_SHARE = (SEGMENTS[4].def + SEGMENTS[5].def) / BASE_TOTAL * 100; // 54.3%
const TOOL_SHARE = SEGMENTS[6].def / BASE_TOTAL * 100;                  // 22.5%

const QUESTIONS = [
  {
    n: 1,
    text: '首 token 等待 + 逐 token 生成占端到端的百分比',
    fields: [{ id: 'q1', unit: '%', tol: TOL_PCT }],
    correct: '正确，54.3%。',
    calc: '620 + 900 = 1,520 毫秒，1,520 / 2,800 = 54.3%。但这两段最难压：逐 token 与输出长度成正比，压它等于让模型少说话。',
    hint: '回到瀑布图看该段的占比与可压缩性两列。'
  },
  {
    n: 2,
    text: '按可省毫秒数排序',
    type: 'select3',
    correct: '正确，工具调用并行化 > 首 token 走提示缓存 > 跳过无指代查询的改写。',
    calc: '400 > 230 > 180 毫秒。注意收益第一的是只占 ' + TOOL_SHARE.toFixed(1) + '% 的工具调用，而不是占 ' + GEN_SHARE.toFixed(1) + '% 的生成段——它零质量损失且纯机械改动。',
    hint: '回到动作表看“可省”一列，可省值是分段默认值 − 目标值，为固定常数，不随滑块变化。'
  },
  {
    n: 3,
    text: '三动作全做后端到端 P50 毫秒数与 P95 是否过门禁',
    fields: [{ id: 'q3a', unit: '毫秒', tol: 0 }, { id: 'q3b', type: 'pass' }],
    correct: '正确，1,990 毫秒，通过。',
    calc: '2,800 − 400 − 230 − 180 = ' + AFTER_ALL.toLocaleString('en-US') + ' 毫秒。P95 同步从 3,350 降到 ' + AFTER_P95.toLocaleString('en-US') + ' 毫秒，同样通过 3.00 秒门禁，余量 ' + AFTER_MARGIN + ' 毫秒。',
    hint: '回到瀑布图看该段的占比与可压缩性两列。'
  }
];

let chart = null;
let sliders = [];
let valueEls = [];
let readEl = null;
let statusEl = null;
let fbEl = null;
let inputs = {};
let orderSelects = [];
let passSelect = null;
let attempts = 0;
let correctCount = 0;
let revealed = [false, false, false];
let correctFlags = [false, false, false];

Chart.defaults.font.family = 'Arial, Helvetica, sans-serif';
Chart.defaults.font.size = 14;
Chart.defaults.plugins.title.font = { size: 18 };
Chart.defaults.plugins.legend.labels.font = { size: 15 };

function values() { return SEGMENTS.map(s => parseInt(sliders[s.key].value, 10)); }
function total() { return values().reduce((a, b) => a + b, 0); }
function p95() { return total() + P95_OFFSET; }
function gatePass(v) { return v <= GATE_MS; }

// 瀑布（浮动柱）上的数值标签，画在每段中心
const WaterfallLabels = {
  id: 'waterfallLabels',
  afterDatasetsDraw(c) {
    const ctx = c.ctx;
    ctx.save();
    ctx.font = '600 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    c.data.datasets.forEach((ds, di) => {
      const meta = c.getDatasetMeta(di);
      meta.data.forEach((el, i) => {
        const seg = ds.data[i];
        if (!seg) return;
        const h = el.base - el.y;
        if (h < 22) {   // 太短的段把数字标到柱体右侧的空白处，避免白字压出柱外或叠字
          ctx.fillStyle = '#1a1a1a';
          ctx.textAlign = 'left';
          ctx.fillText(String(seg[1] - seg[0]), el.x + el.width / 2 + 4, (el.base + el.y) / 2);
          ctx.textAlign = 'center';
        } else {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(String(seg[1] - seg[0]), el.x, (el.base + el.y) / 2);
        }
      });
    });
    ctx.restore();
  }
};

function buildUI() {
  const chartArea = document.getElementById('chartArea');
  chartArea.style.height = drawHeight + 'px';
  const cv = document.createElement('canvas');
  cv.id = 'chart';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', '九个延迟分段的瀑布图，默认合计 2,800 毫秒，首 token 等待与逐 token 生成占 54.3%');
  chartArea.appendChild(cv);
  // 注意：瀑布图的初始值依赖九个滑块，必须在滑块创建之后再绘图

  const panel = document.getElementById('panel');
  panel.style.height = controlHeight + 'px';

  statusEl = document.createElement('div');
  statusEl.className = 'status';
  panel.appendChild(statusEl);

  // ---- 九个滑块（3 列网格）----
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.style.height = GRID_H + 'px';
  SEGMENTS.forEach(s => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const lbl = document.createElement('span');
    lbl.className = 'clbl';
    lbl.textContent = s.name + '（' + s.min + '–' + s.max + ' 毫秒，步长 ' + s.step + '）';
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

  // ---- 三个动作表 ----
  const table = document.createElement('table');
  table.className = 'act';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['动作', '涉及分段', '默认值', '目标值', '可省', '套用'].forEach(t => {
    const th = document.createElement('th');
    th.textContent = t;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  ACTIONS.forEach(a => {
    const tr = document.createElement('tr');
    [a.name, a.seg, a.from + ' 毫秒', a.to + ' 毫秒', a.save + ' 毫秒', ''].forEach((txt, k) => {
      const td = document.createElement('td');
      if (k === 5) {
        const btn = document.createElement('button');
        btn.textContent = '套用';
        btn.style.fontSize = '13px';
        btn.style.padding = '0 6px';
        btn.style.height = '20px';
        btn.addEventListener('click', () => applyAction(a));
        td.appendChild(btn);
      } else {
        td.textContent = txt;
        if (k === 0) td.className = 'name';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  const tw = document.createElement('div');
  tw.style.height = ACT_H + 'px';
  tw.style.overflow = 'hidden';
  tw.appendChild(table);
  panel.appendChild(tw);

  // ---- 三道挑战题 ----
  QUESTIONS.forEach(q => {
    const row = document.createElement('div');
    row.className = 'row';
    const lbl = document.createElement('span');
    lbl.className = q.type === 'select3' ? 'q2' : 'q';
    lbl.textContent = 'Q' + q.n + '　' + q.text + (q.type === 'select3' ? '？' : '');
    row.appendChild(lbl);
    if (q.type === 'select3') {
      for (let k = 0; k < 3; k++) {
        const t = document.createElement('span');
        t.className = 'unit';
        t.textContent = ['①', '②', '③'][k];
        const sel = document.createElement('select');
        sel.className = 'sel-sm';
        sel.setAttribute('aria-label', 'Q2 收益排序第 ' + (k + 1) + ' 位');
        const none = document.createElement('option');
        none.value = '';
        none.textContent = '（选择动作）';
        sel.appendChild(none);
        ACTIONS.forEach(a => {
          const o = document.createElement('option');
          o.value = a.name;
          o.textContent = a.name;
          sel.appendChild(o);
        });
        row.appendChild(t); row.appendChild(sel);
        orderSelects.push(sel);
      }
    } else {
      q.fields.forEach(f => {
        if (f.type === 'pass') {
          const sel = document.createElement('select');
          sel.setAttribute('aria-label', 'Q3 P95 是否通过 3.00 秒门禁');
          [['', '（选择）'], ['通过', '通过'], ['不通过', '不通过']].forEach(([v, tx]) => {
            const o = document.createElement('option');
            o.value = v; o.textContent = tx;
            sel.appendChild(o);
          });
          passSelect = sel;
          row.appendChild(sel);
        } else {
          const inp = document.createElement('input');
          inp.type = 'number';
          inp.step = 'any';
          inp.setAttribute('aria-label', 'Q' + q.n + ' ' + f.unit);
          inp.placeholder = f.unit;
          inputs[f.id] = inp;
          const u = document.createElement('span');
          u.className = 'unit';
          u.textContent = f.unit;
          row.appendChild(inp); row.appendChild(u);
        }
      });
    }
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

  buildChart(cv);
  onSlide();
  renderStatus();
  renderFeedback();
}

function buildChart(cv) {
  const starts = [];
  let acc = 0;
  SEGMENTS.forEach(s => { const v = values()[SEGMENTS.indexOf(s)]; starts.push([acc, acc + v]); acc += v; });
  const data = SEGMENTS.map((s, i) => [starts[i][0], starts[i][1]]);
  const ds = {
    label: '九个延迟分段',
    data: data,
    backgroundColor: SEGMENTS.map(s => s.color),
    borderColor: SEGMENTS.map(s => s.color),
    borderWidth: 1,
    borderRadius: 2,
    maxBarThickness: 58
  };
  chart = new Chart(cv.getContext('2d'), {
    type: 'bar',
    data: { labels: SEGMENTS.map(s => s.name), datasets: [ds] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 150 },
      layout: { padding: { top: 16, right: 8 } },
      scales: {
        x: { ticks: { autoSkip: false, maxRotation: 30, minRotation: 30, font: { size: 13 } }, grid: { display: false } },
        y: {
          title: { display: true, text: '累计耗时（毫秒）', font: { size: 16 } },
          beginAtZero: true,
          ticks: { font: { size: 14 } }
        }
      },
      plugins: {
        legend: { display: false },
        title: { display: true, text: '端到端 P50 分段瀑布（九个分段串行求和）', font: { size: 18 } },
        tooltip: {
          callbacks: {
            title: items => SEGMENTS[items[0].dataIndex].name,
            label: ctx2 => {
              const seg = ctx2.raw;
              return [seg[1] - seg[0] + ' 毫秒', '累计到 ' + seg[1] + ' 毫秒'];
            }
          }
        }
      }
    },
    plugins: [WaterfallLabels]
  });
}

function onSlide() {
  const vals = values();
  SEGMENTS.forEach((s, i) => { valueEls[s.key].textContent = vals[i]; });
  const tot = total();
  const p95v = p95();
  const margin = GATE_MS - p95v;
  const pass = gatePass(p95v);
  readEl.innerHTML = '端到端 P50 = <b>' + tot.toLocaleString('en-US') + ' 毫秒</b>；P95（教学口径 P50 + 550）= <b>' +
    p95v.toLocaleString('en-US') + ' 毫秒</b>；对 3.00 秒门禁 <b class="' + (pass ? 'ok' : 'no') + '">' +
    (pass ? '通过' : '不通过') + '</b>，余量 ' + (margin >= 0 ? margin.toLocaleString('en-US') : '超出 ' + (-margin).toLocaleString('en-US')) + ' 毫秒。<br>' +
    '占比：首 token 等待 + 逐 token 生成 = ' + (vals[4] + vals[5]) + ' 毫秒 = ' +
    ((vals[4] + vals[5]) / tot * 100).toFixed(1) + '%；工具调用 ' + (vals[6] / tot * 100).toFixed(1) + '%。';
  if (chart) {
    let acc = 0;
    chart.data.datasets[0].data = SEGMENTS.map((s, i) => { const a = acc; acc += vals[i]; return [a, acc]; });
    chart.update('none');
  }
}

function applyAction(a) {
  const seg = SEGMENTS.find(s => s.name === a.seg);
  sliders[seg.key].value = a.to;
  onSlide();
}

function checkAll() {
  for (let i = 0; i < QUESTIONS.length; i++) {
    if (revealed[i]) continue;
    const q = QUESTIONS[i];
    let ok = true, blank = false;
    if (q.type === 'select3') {
      const picked = orderSelects.map(s => s.value);
      if (picked.some(p => p === '')) blank = true;
      if (new Set(picked).size !== 3) ok = false;
      picked.forEach((p, k) => { if (p !== ORDER[k]) ok = false; });
    } else {
      q.fields.forEach(f => {
        if (f.type === 'pass') {
          const v = passSelect.value;
          if (v === '') { blank = true; ok = false; return; }
          if (v !== '通过') ok = false;
          return;
        }
        const raw = inputs[f.id].value.trim();
        const v = parseFloat(raw);
        if (raw === '' || isNaN(v)) { blank = true; ok = false; return; }
        const exp = q.n === 1 ? GEN_SHARE : AFTER_ALL;
        if (Math.abs(v - exp) > f.tol) ok = false;
      });
    }
    if (blank) {
      fbEl.innerHTML = '<span class="no">第 ' + q.n + ' 题还有空没填。</span>三道题按固定顺序作答，每题两次机会；' +
        '答案一律按默认口径计算，与滑块当前值无关。（已答对 ' + correctCount + ' 题，已用 ' + attempts + ' 次提交。）';
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
  orderSelects.forEach(s => { s.value = ''; });
  passSelect.value = '';
  SEGMENTS.forEach(s => { sliders[s.key].value = s.def; });
  onSlide();
  renderStatus();
  renderFeedback();
}

function renderStatus() {
  const n = revealed.filter(Boolean).length;
  statusEl.textContent = '端到端 ' + (total() / 1000).toFixed(2) + ' 秒里，哪一段最该动？' +
    '｜答对 ' + correctCount + ' / 3 题｜已提交 ' + attempts + ' 次' +
    (n === 3 ? '｜满分 3 分，答对 2 分视为掌握' : '｜已揭晓 ' + n + ' / 3 题');
}

function renderFeedback() {
  if (!revealed.some(Boolean)) {
    fbEl.innerHTML = '屏幕提问：端到端 2.80 秒里，哪一段最该动？先拖一遍，再算一遍占比和收益。' +
      '<br>先拖“工具调用”滑块从 630 毫秒降到 230 毫秒，观察读数从 2,800 掉到 2,400 毫秒；' +
      '再把“首 token 等待”拖到 100 毫秒，观察读数大幅下移。<br>' +
      '挑战题的答案一律按默认口径（九个分段默认值）计算，与滑块当前值无关；判定容差：百分比 ±0.1 个百分点，' +
      '毫秒 ±0。三题按固定顺序作答，每题两次机会。';
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
    html += '两处反直觉：占比 54.3% 的生成段最难压，收益第一的却是只占 22.5% 的工具调用——' +
      '“该优化谁”和“谁最慢”是两回事。';
  } else {
    html += '还有 ' + (3 - revealed.filter(Boolean).length) + ' 题未提交。';
  }
  fbEl.innerHTML = html;
}

window.addEventListener('resize', () => { if (chart) chart.resize(); });
window.addEventListener('DOMContentLoaded', buildUI);