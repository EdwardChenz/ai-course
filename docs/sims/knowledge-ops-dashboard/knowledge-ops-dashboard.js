// 知识库运营指标看板 — Knowledge Ops Dashboard
// 教学目标：把六个运营指标的周度变化换算成可比的相对变化幅度，
//           从四项越线指标里选出必须立即处置的三项并排出顺序。
// 规格来源：docs/chapters/04-rag-advanced 的 knowledge-ops-dashboard 规格块
//
// ---- 布局计算（先算再写码）----
// 控件清单：1 行状态 + 指标表（表头 + 6 行 × 22px）+ 3 行顺位下拉 + 1 行按钮 + 反馈文本区
// controlHeight = 6 + 22(状态) + 198(指标表 7 行) + 90(3 个顺位) + 30(按钮) + 141(反馈 7 行) = 487
// drawHeight = 380；iframeHeight = drawHeight + controlHeight + 2 = 869

const drawHeight = 380;
const FB_LINES = 7;
const FB_H = FB_LINES * 19 + 8;                  // 141
const TABLE_H = 198;   // 表头 + 6 行，固定高度并 overflow:hidden 以保证跨浏览器一致
const controlHeight = 6 + 22 + TABLE_H + 30 * 3 + 30 + FB_H; // 487
const IFRAME_HEIGHT = drawHeight + controlHeight + 2; // 869

const REL_TOL = 0.5;   // 相对变化判定容差 ±0.5 个百分点

// ---- 指标数据（规格块 Content 表，六项指标；负反馈率与检索调用量为背景指标不参与评选）----
// dir: 'lower' 表示门禁是上限（成本、延迟），'higher' 表示门禁是下限
// breachVal：把本周值换算成"偏离门禁、且越线一律指向正方向"的百分比
const METRICS = [
  { name: '每次成功问答成本', prev: 0.014, cur: 0.021, prevTxt: '0.014 元', curTxt: '0.021 元', gate: '<= 0.02 元', dir: 'lower',  over: true,  rel: 50.0,  top3: true },
  { name: '端到端 P95 延迟',  prev: 3.4,   cur: 4.9,   prevTxt: '3.4 s',    curTxt: '4.9 s',    gate: '<= 4.5 s',  dir: 'lower',  over: true,  rel: 44.1,  top3: true },
  { name: '拒答准确率',       prev: 91,    cur: 80,    prevTxt: '91%',      curTxt: '80%',      gate: '>= 90%',    dir: 'higher', over: true,  rel: -12.1, top3: true },
  { name: '召回命中率',       prev: 91,    cur: 88,    prevTxt: '91%',      curTxt: '88%',      gate: '>= 90%',    dir: 'higher', over: true,  rel: -3.3,  top3: false },
  { name: '忠实度',           prev: 95,    cur: 94,    prevTxt: '95%',      curTxt: '94%',      gate: '>= 93%',    dir: 'higher', over: false, rel: -1.1,  top3: false },
  { name: '自助解决率',       prev: 62,    cur: 61,    prevTxt: '62%',      curTxt: '61%',      gate: '>= 60%',    dir: 'higher', over: false, rel: -1.6,  top3: false }
];

// 门禁阈值（用于把上周 / 本周换算到同一条"越线方向"轴上）
const GATE_VALUE = [0.02, 4.5, 90, 90, 93, 60];

function signedRel(i) {
  return (METRICS[i].cur - METRICS[i].prev) / METRICS[i].prev * 100;
}
function fmt1(v) { return (v >= 0 ? '+' : '') + v.toFixed(1); }

// ---- 三个顺位（规格块 Feedback：正确处置顺序为 成本、延迟、拒答准确率）----
const PRIORITY = ['每次成功问答成本', '端到端 P95 延迟', '拒答准确率'];
const NAME_OPTS = METRICS.map(m => m.name);

let chart = null;
let inputs = [];
let hitCells = [];
let selects = [];
let statusEl = null;
let fbEl = null;
let lockRelBtn = null;
let lockPriBtn = null;
let resetBtn = null;
let relLocked = false;
let priLocked = false;
let relOk = null;
let priOk = null;

Chart.defaults.font.family = 'Arial, Helvetica, sans-serif';
Chart.defaults.font.size = 14;
Chart.defaults.plugins.title.font = { size: 18 };
Chart.defaults.plugins.legend.labels.font = { size: 15 };

// 偏离门禁的方向化换算：正值 = 更靠近越线，负值 = 更远离越线
function gateAxis(i, value) {
  const g = GATE_VALUE[i];
  return METRICS[i].dir === 'lower' ? (value / g - 1) * 100 : (1 - value / g) * 100;
}

const DataLabels = {
  id: 'dataLabels',
  afterDatasetsDraw(c) {
    const ctx = c.ctx;
    ctx.save();
    ctx.font = '600 13px Arial';
    ctx.textBaseline = 'middle';
    c.data.datasets.forEach((ds, di) => {
      const meta = c.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el, i) => {
        const v = ds.data[i];
        if (v === null || v === undefined) return;
        ctx.textAlign = v >= 0 ? 'left' : 'right';
        ctx.fillStyle = '#1a1a1a';
        ctx.fillText(fmt1(v), el.x + (v >= 0 ? 6 : -6), el.y);
      });
    });
    ctx.restore();
  }
};

// 0% 门禁线
const GateLine = {
  id: 'gateLine',
  afterDatasetsDraw(c) {
    const x = c.scales.x.getPixelForValue(0);
    const ctx = c.ctx;
    ctx.save();
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x, c.chartArea.top);
    ctx.lineTo(x, c.chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    const txt = '0% = 恰好触门禁';
    ctx.font = '700 13px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const w = ctx.measureText(txt).width;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x + 4, c.chartArea.top, w + 8, 18);
    ctx.fillStyle = '#222222';
    ctx.fillText(txt, x + 8, c.chartArea.top + 2);
    ctx.restore();
  }
};

function buildUI() {
  const chartArea = document.getElementById('chartArea');
  chartArea.style.height = drawHeight + 'px';
  const cv = document.createElement('canvas');
  cv.id = 'chart';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', '六项知识库运营指标上周值与本周值相对各自门禁的偏离百分比条形图，右侧为已越线需处置的指标');
  chartArea.appendChild(cv);
  buildChart(cv);

  const panel = document.getElementById('panel');
  panel.style.height = controlHeight + 'px';

  statusEl = document.createElement('div');
  statusEl.className = 'status';
  panel.appendChild(statusEl);

  // ---- 指标表（全部 Content 列 + 相对变化输入 + 入选前三）----
  const table = document.createElement('table');
  table.className = 'kb';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['指标', '上周值', '本周值', '门禁', '是否越线', '你的相对变化（%）', '入选前三'].forEach(t => {
    const th = document.createElement('th');
    th.textContent = t;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  METRICS.forEach((m, i) => {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.className = 'name';
    tdName.textContent = m.name;
    const tdPrev = document.createElement('td');
    tdPrev.textContent = m.prevTxt;
    const tdCur = document.createElement('td');
    tdCur.textContent = m.curTxt;
    const tdGate = document.createElement('td');
    tdGate.textContent = m.gate;
    const tdOver = document.createElement('td');
    tdOver.textContent = m.over ? '是' : '否';
    tdOver.className = 'hit';
    const tdIn = document.createElement('td');
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = '0.1';
    inp.setAttribute('aria-label', m.name + ' 的相对变化，单位百分比');
    inp.placeholder = '如 +50.0';
    tdIn.appendChild(inp);
    const tdTop = document.createElement('td');
    tdTop.textContent = '—';
    [tdName, tdPrev, tdCur, tdGate, tdOver, tdIn, tdTop].forEach(td => tr.appendChild(td));
    tbody.appendChild(tr);
    inputs.push(inp);
    hitCells.push(tdTop);
  });
  table.appendChild(tbody);
  const tw = document.createElement('div');
  tw.style.height = TABLE_H + 'px';
  tw.style.overflow = 'hidden';
  tw.appendChild(table);
  panel.appendChild(tw);

  // ---- 三个处置顺位 ----
  for (let k = 0; k < 3; k++) {
    const row = document.createElement('div');
    row.className = 'row';
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = '处置第 ' + (k + 1) + ' 顺位';
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', '处置第 ' + (k + 1) + ' 顺位的指标');
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '（先选出必须立即处置的指标）';
    sel.appendChild(none);
    NAME_OPTS.forEach(n => {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = n;
      sel.appendChild(o);
    });
    row.appendChild(lbl);
    row.appendChild(sel);
    panel.appendChild(row);
    selects.push(sel);
  }

  const btnRow = document.createElement('div');
  btnRow.className = 'row';
  lockRelBtn = document.createElement('button');
  lockRelBtn.textContent = '锁定 6 项相对变化';
  lockRelBtn.addEventListener('click', lockRel);
  lockPriBtn = document.createElement('button');
  lockPriBtn.textContent = '锁定处置顺序';
  lockPriBtn.addEventListener('click', lockPriority);
  resetBtn = document.createElement('button');
  resetBtn.textContent = '重来';
  resetBtn.addEventListener('click', resetAll);
  btnRow.appendChild(lockRelBtn);
  btnRow.appendChild(lockPriBtn);
  btnRow.appendChild(resetBtn);
  panel.appendChild(btnRow);

  fbEl = document.createElement('div');
  fbEl.className = 'fb';
  fbEl.style.height = FB_H + 'px';
  panel.appendChild(fbEl);

  renderStatus();
  renderFeedback();
}

function buildChart(cv) {
  const labels = METRICS.map(m => m.name);
  const prevVals = METRICS.map((m, i) => +gateAxis(i, m.prev).toFixed(1));
  const curVals = METRICS.map((m, i) => +gateAxis(i, m.cur).toFixed(1));
  const dsPrev = {
    label: '上周值', data: prevVals, backgroundColor: '#0072B2', borderColor: '#00354F',
    borderWidth: 2, borderRadius: 2, maxBarThickness: 18
  };
  const dsCur = {
    label: '本周值', data: curVals, backgroundColor: '#E69F00', borderColor: '#7A4E00',
    borderWidth: 2, borderRadius: 2, maxBarThickness: 18
  };
  chart = new Chart(cv.getContext('2d'), {
    type: 'bar',
    data: { labels: labels, datasets: [dsPrev, dsCur] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 220 },
      layout: { padding: { right: 60, top: 16 } },
      scales: {
        x: {
          title: {
            display: true,
            text: '相对各自门禁的偏离百分比（正值 = 已越线需处置；成本与延迟取 高于门禁，\n其余四项取 低于门禁，统一指向“越线”一侧）',
            font: { size: 16 }
          },
          min: -40, max: 20,
          ticks: { stepSize: 10, callback: v => fmt1(v) + '%', font: { size: 14 } },
          grid: { color: '#e3e3e3' }
        },
        y: { title: { display: true, text: '运营指标（六项参与评选）', font: { size: 16 } }, ticks: { font: { size: 14 }, autoSkip: false }, grid: { display: false } }
      },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { boxWidth: 18, boxHeight: 12, padding: 12 } },
        title: { display: true, text: '知识库运营看板：六项指标的周度对比（四项越线，但今天只能修三项）', font: { size: 18 } },
        tooltip: {
          callbacks: {
            label: ctx2 => {
              const i = ctx2.dataIndex;
              const m = METRICS[i];
              const v = ctx2.parsed.x;
              return ctx2.dataset.label + '：' + fmt1(v) + '%（' + m.curTxt + ' vs 门禁 ' + m.gate + '，' + (m.over ? '已越线' : '未越线') + '）';
            }
          }
        }
      }
    },
    plugins: [DataLabels, GateLine]
  });
}

function lockRel() {
  if (relLocked) return;
  let blank = false;
  const vals = inputs.map(inp => {
    const raw = inp.value.trim();
    const v = parseFloat(raw);
    if (raw === '' || isNaN(v)) { blank = true; return null; }
    return v;
  });
  if (blank) {
    renderStatus();
    fbEl.innerHTML = '<span class="no">六项相对变化还没填完。</span>相对变化 =（本周值 − 上周值）÷ 上周值 × 100%，' +
      '保留 1 位小数，判定容差 ±0.5 个百分点。全部锁定前不显示标准值。';
    return;
  }
  relOk = METRICS.map((m, i) => Math.abs(vals[i] - signedRel(i)) <= REL_TOL);
  relLocked = true;
  inputs.forEach(i => { i.disabled = true; });
  lockRelBtn.disabled = true;
  renderStatus();
  renderFeedback();
  if (priLocked) reveal();
}

function lockPriority() {
  if (priLocked) return;
  const picked = selects.map(s => s.value);
  if (picked.some(p => p === '')) {
    renderStatus();
    fbEl.innerHTML = '<span class="no">三个处置顺位还没填完。</span>四项越线但只能修三项——' +
      '先算出每项的相对变化，再按变化幅度绝对值排序，不要按绝对跌幅排序。';
    return;
  }
  if (new Set(picked).size !== 3) {
    renderStatus();
    fbEl.innerHTML = '<span class="no">三个顺位选了同一项。</span>三个顺位必须是三个不同的指标。';
    return;
  }
  priOk = picked.every((p, i) => p === PRIORITY[i]);
  priLocked = true;
  selects.forEach(s => { s.disabled = true; });
  lockPriBtn.disabled = true;
  renderStatus();
  renderFeedback();
  if (relLocked) reveal();
}

function reveal() {
  hitCells.forEach((td, i) => { td.textContent = METRICS[i].top3 ? '是' : '否'; });
  renderStatus();
  renderFeedback();
}

function resetAll() {
  relLocked = false;
  priLocked = false;
  relOk = null;
  priOk = null;
  inputs.forEach(i => { i.value = ''; i.disabled = false; });
  selects.forEach(s => { s.value = ''; s.disabled = false; });
  hitCells.forEach(td => { td.textContent = '—'; });
  lockRelBtn.disabled = false;
  lockPriBtn.disabled = false;
  renderStatus();
  renderFeedback();
}

function renderStatus() {
  const a = relOk ? relOk.filter(Boolean).length : null;
  const b = priOk === null ? null : (priOk ? 1 : 0);
  statusEl.textContent = '四项越线、只能修三项，按变化幅度排，别按绝对跌幅排。｜相对变化 ' +
    (a === null ? '—' : a + '/6') + '，选项 ' + (b === null ? '—' : b + '/1') +
    (relLocked && priLocked ? '｜已揭晓' : '｜全部锁定后揭晓');
}

function renderFeedback() {
  if (!relLocked && !priLocked) {
    fbEl.innerHTML = '学习者看到六条指标的周度对比与四道可见门禁：先算出每项的相对变化，再选三项并排序。' +
      '<br>相对变化 =（本周值 − 上周值）÷ 上周值 × 100%，保留 1 位小数，判定容差 ±0.5 个百分点。' +
      '<br>相对变化恰为 0% 的指标排在所有非零项之后；恰好并列时以门禁更严格者（成本 &lt;= 0.02 元）优先。' +
      '<br>本周的 0.014 元来自第一章的缓存示例口径，仅作对照基准。';
    return;
  }
  let html = '';
  if (relOk) {
    const n = relOk.filter(Boolean).length;
    html += '计算答对 ' + n + ' / 6 项。标准相对变化：';
    html += METRICS.map((m, i) => m.name + ' ' + fmt1(signedRel(i)) + '%').join('；') + '。<br>';
    METRICS.forEach((m, i) => {
      if (relOk[i]) return;
      const raw = parseFloat(inputs[i].value);
      html += '<span class="no">✗ ' + m.name + '</span>：你填 ' + fmt1(raw) + '%，标准 ' + fmt1(signedRel(i)) +
        '%。用（本周 − 上周）÷ 上周 再算一次：（' + m.cur + ' − ' + m.prev + '）÷ ' + m.prev + ' = ' +
        fmt1(signedRel(i)) + '%。<br>';
    });
    const gaps = [];
    METRICS.forEach((m, i) => { if (m.over && !m.top3) gaps.push(m.name); });
    gaps.forEach(g => {
      const i = METRICS.findIndex(m => m.name === g);
      html += '<span class="ok">淘汰 ' + g + '</span>（' + fmt1(signedRel(i)) + '%）落后第三名 ' +
        PRIORITY[2] + '（' + fmt1(signedRel(2)) + '%）' +
        (Math.abs(Math.abs(signedRel(2)) - Math.abs(signedRel(i)))).toFixed(1) + ' 个百分点——它绝对跌幅最大，紧急度却最小。<br>';
    });
  }
  if (priOk !== null) {
    if (priOk) {
      const ord = [0, 1, 2, 3].map(i => METRICS[i].name + ' ' + fmt1(signedRel(i)) + '%');
      html += '<span class="ok">✓ 正确处置顺序：' + PRIORITY.join('、') + '。</span>按变化幅度绝对值降序：' +
        ord.join(' &gt; ') + '。<br>';
    } else {
      html += '<span class="no">✗ 处置顺序不对。</span>越线不等于紧急，比的是变化幅度：正确处置顺序是 ' +
        PRIORITY.join('、') + '；被淘汰的召回命中率（-3.3%）落后第三名拒答准确率（-12.1%）8.8 个百分点。<br>';
    }
  }
  if (relLocked && priLocked) {
    html += '四项越线但只有三项入选。把绝对跌幅当成了紧急度，是这一块最常见的误判。';
  }
  fbEl.innerHTML = html;
}

window.addEventListener('resize', () => { if (chart) chart.resize(); });
window.addEventListener('DOMContentLoaded', buildUI);