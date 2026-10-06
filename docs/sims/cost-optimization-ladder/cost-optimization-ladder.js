// 数据成本优化阶梯与月成本 — Data Cost Optimization Ladder
// 教学目标：调节集群小时单价并在六阶段阶梯上勾选已实施的优化措施，
//           观察累计集群小时与月成本的实时变化，并算出单措施收益排序与两种降幅。
// 规格来源：docs/chapters/12-data-engineering 的 cost-optimization-ladder 规格块
//
// ---- 布局计算（先算再写码）----
// 控件清单：1 行状态 + 阶梯表（表头 + 6 行 × 26px）+ 1 行单价滑块 + 2 行读数
//           + 2 行排序下拉 + 2 行挑战题 + 1 行按钮 + 反馈文本区
// controlHeight = 8 + 22(状态) + 168(阶梯表 7 行) + 30(滑块) + 48(读数 2 行)
//                + 60(排序 2 行) + 60(Q2/Q3) + 30(按钮) + 198(反馈 10 行) = 624
// drawHeight = 400；iframeHeight = drawHeight + controlHeight + 2 = 1026

const drawHeight = 400;
const TABLE_H = 7 * 24;                         // 168
const READ_H = 2 * 21 + 6;                      // 48
const FB_LINES = 10;
const FB_H = FB_LINES * 19 + 8;                  // 122
const controlHeight = 8 + 22 + TABLE_H + 30 + READ_H + 30 * 2 + 30 * 2 + 30 + FB_H; // 624
const IFRAME_HEIGHT = drawHeight + controlHeight + 2; // 1026

// ---- 模型常量（规格块 Rules 与 Provenance）----
const BASE_HOURS = 5760;      // 基线月集群小时
const STORAGE_TB = 4.6;
const STORAGE_PRICE = 900;    // 元 / TB / 月
const STORAGE_COST = STORAGE_TB * STORAGE_PRICE; // 恒为 4,140 元
const BASE_COST = 19116;      // 基线月成本 = 5,760 × 2.6 + 4,140
const PRICE_DEF = 2.6, PRICE_MIN = 1.5, PRICE_MAX = 5.0, PRICE_STEP = 0.1;

const TOL_MONEY = 1;    // 金额容差 ±1 元
const TOL_PCT = 0.1;    // 降幅容差 ±0.1 个百分点

// 六阶段阶梯（规格块 Content）
const STAGES = [
  { stage: '基线', measure: '现状',           save: null, cum: 5760, drop: 0.0,   isBase: true },
  { stage: '一',   measure: '分区裁剪',       save: 1500, cum: 4260, drop: 26.0 },
  { stage: '二',   measure: '列裁剪',         save: 450,  cum: 3810, drop: 33.9 },
  { stage: '三',   measure: '查询合并',       save: 250,  cum: 3560, drop: 38.2 },
  { stage: '四',   measure: '提高缓存命中率', save: 440,  cum: 3120, drop: 45.8 },
  { stage: '五',   measure: '小文件合并',     save: 260,  cum: 2860, drop: 50.3 }
];
// 单措施收益排序（规格块标准答案）
const RANK_ORDER = ['分区裁剪', '列裁剪', '提高缓存命中率', '小文件合并', '查询合并'];

const AFTER_ALL = { hours: 2860, cost: 11576, drop: 39.4 };
const AFTER_TOP3 = { hours: 3560, cost: 13396, drop: 29.9 };

const QUESTIONS = [
  {
    n: 1,
    text: '五个措施按单措施节省的集群小时从大到小排序',
    type: 'rank5',
    correct: '正确，分区裁剪 1,500 > 列裁剪 450 > 提高缓存命中率 440 > 小文件合并 260 > 查询合并 250。',
    calc: '1,500 大于 450 大于 440 大于 260 大于 250。列裁剪与缓存命中率只差 10 小时，差距这么小时按收益稳定性排：列裁剪改了永远生效，缓存命中率会随业务习惯回落。',
    hint: '回到阶梯表看“本措施节省”一列，列裁剪与提高缓存命中率只差 10 小时，差距小时按收益稳定性而非数字大小排。'
  },
  {
    n: 2,
    text: '五项全做后月成本（元）与降幅（%）',
    fields: [
      { id: 'q2a', unit: '元', tol: TOL_MONEY },
      { id: 'q2b', unit: '%', tol: TOL_PCT }
    ],
    correct: '正确，11,576 元，降幅 39.4%。',
    calc: '2,860 乘 2.6 等于 7,436，加 4,140 等于 11,576。降幅是 19,116 减 11,576 等于 7,540，再除以 19,116 等于 39.4%。',
    hint: '回到阶梯图看每一段的落差，再回到成本公式区分查询侧与存储侧。'
  },
  {
    n: 3,
    text: '只做前三项时月成本（元）与降幅（%）',
    fields: [
      { id: 'q3a', unit: '元', tol: TOL_MONEY },
      { id: 'q3b', unit: '%', tol: TOL_PCT }
    ],
    correct: '正确，13,396 元，降幅 29.9%。',
    calc: '3,560 乘 2.6 等于 9,256，加 4,140 等于 13,396。降幅是 19,116 减 13,396 等于 5,720，再除以 19,116 等于 29.9%，不到 39.4% 的一半——降幅与实施数量不成正比，因为每一步的边际收益在递减。',
    hint: '回到阶梯图看每一段的落差，再回到成本公式区分查询侧与存储侧。'
  }
];

let chart = null;
let lastSig = '';
let priceSlider = null;
let priceValEl = null;
let checkboxes = {};
let readEl = null;
let statusEl = null;
let fbEl = null;
let inputs = {};
let rankSelects = [];
let attempts = 0;
let correctCount = 0;
let revealed = [false, false, false];
let correctFlags = [false, false, false];

Chart.defaults.font.family = 'Arial, Helvetica, sans-serif';
Chart.defaults.font.size = 14;
Chart.defaults.plugins.title.font = { size: 18 };
Chart.defaults.plugins.legend.labels.font = { size: 15 };

function price() { return parseFloat(priceSlider.value); }
// 勾选为累积生效：某一阶段勾选后，其后的累计值按基线减去所有已勾选措施的单措施节省重算
function cumHours() {
  let h = BASE_HOURS;
  STAGES.forEach(st => { if (st.save !== null && checkboxes[st.measure].checked) h -= st.save; });
  return h;
}
function monthly() { return cumHours() * price() + STORAGE_COST; }

function buildUI() {
  const chartArea = document.getElementById('chartArea');
  chartArea.style.height = drawHeight + 'px';
  const cv = document.createElement('canvas');
  cv.id = 'chart';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', '六阶段数据成本优化阶梯柱状图，未勾选的阶段跳过，勾选后累计集群小时逐级下降');
  chartArea.appendChild(cv);
  buildChart(cv);

  const panel = document.getElementById('panel');
  panel.style.height = controlHeight + 'px';

  statusEl = document.createElement('div');
  statusEl.className = 'status';
  panel.appendChild(statusEl);

  // ---- 六阶段阶梯表（同时是勾选控件）----
  const table = document.createElement('table');
  table.className = 'ladder';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['阶段', '措施', '本措施节省的集群小时（每月）', '累计集群小时', '累计降幅', '已实施'].forEach(t => {
    const th = document.createElement('th');
    th.textContent = t;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  STAGES.forEach(st => {
    const tr = document.createElement('tr');
    const tdStage = document.createElement('td');
    tdStage.textContent = st.stage;
    const tdName = document.createElement('td');
    tdName.className = 'name';
    tdName.textContent = st.measure;
    const tdSave = document.createElement('td');
    tdSave.textContent = st.save === null ? '—' : st.save.toLocaleString('en-US');
    const tdCum = document.createElement('td');
    tdCum.textContent = st.cum.toLocaleString('en-US');
    const tdDrop = document.createElement('td');
    tdDrop.textContent = st.drop.toFixed(1) + '%';
    const tdChk = document.createElement('td');
    if (st.save !== null) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('aria-label', '已实施 ' + st.measure);
      cb.addEventListener('change', onChange);
      tdChk.appendChild(cb);
      checkboxes[st.measure] = cb;
    } else {
      tdChk.textContent = '（基线）';
    }
    [tdStage, tdName, tdSave, tdCum, tdDrop, tdChk].forEach(td => tr.appendChild(td));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  const tw = document.createElement('div');
  tw.style.height = TABLE_H + 'px';
  tw.style.overflow = 'hidden';
  tw.appendChild(table);
  panel.appendChild(tw);

  // ---- 集群小时单价滑块 ----
  const pRow = document.createElement('div');
  pRow.className = 'row';
  const pLbl = document.createElement('span');
  pLbl.className = 'lbl';
  pLbl.textContent = '集群小时单价（每 worker 小时，1.5–5.0 元）';
  priceSlider = document.createElement('input');
  priceSlider.type = 'range';
  priceSlider.min = PRICE_MIN; priceSlider.max = PRICE_MAX; priceSlider.step = PRICE_STEP;
  priceSlider.value = PRICE_DEF;
  priceSlider.setAttribute('aria-label', '集群小时单价，单位元');
  priceValEl = document.createElement('span');
  priceValEl.className = 'val';
  const pUnit = document.createElement('span');
  pUnit.className = 'unit';
  pUnit.textContent = '元';
  priceSlider.addEventListener('input', onChange);
  pRow.appendChild(pLbl); pRow.appendChild(priceSlider); pRow.appendChild(priceValEl); pRow.appendChild(pUnit);
  panel.appendChild(pRow);

  readEl = document.createElement('div');
  readEl.className = 'readout';
  readEl.style.height = READ_H + 'px';
  panel.appendChild(readEl);

  // ---- 三道挑战题 ----
  QUESTIONS.forEach(q => {
    if (q.type === 'rank5') {
      for (let r = 0; r < 2; r++) {
        const row = document.createElement('div');
        row.className = 'row';
        const lbl = document.createElement('span');
        lbl.className = 'q-rank';
        lbl.textContent = r === 0 ? 'Q1　按节省集群小时排序？' : '（接上）';
        row.appendChild(lbl);
        const span = r === 0 ? 3 : 2;
        for (let k = 0; k < span; k++) {
          const t = document.createElement('span');
          t.className = 'unit';
          t.textContent = ['①', '②', '③', '④', '⑤'][r * 3 + k];
          const sel = document.createElement('select');
          sel.className = 'sel-rk';
          sel.setAttribute('aria-label', 'Q1 收益排序第 ' + (r * 3 + k + 1) + ' 位');
          const none = document.createElement('option');
          none.value = '';
          none.textContent = '（选择措施）';
          sel.appendChild(none);
          RANK_ORDER.forEach(m => {
            const o = document.createElement('option');
            o.value = m;
            o.textContent = m;
            sel.appendChild(o);
          });
          row.appendChild(t); row.appendChild(sel);
          rankSelects.push(sel);
        }
        panel.appendChild(row);
      }
    } else {
      const row = document.createElement('div');
      row.className = 'row';
      const lbl = document.createElement('span');
      lbl.className = 'q';
      lbl.textContent = 'Q' + q.n + '　' + q.text;
      row.appendChild(lbl);
      q.fields.forEach(f => {
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
      });
      panel.appendChild(row);
    }
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

  onChange();
  renderStatus();
  renderFeedback();
}

function buildChart(cv) {
  // 初始数据直接用基线，避免 new Chart() 之后立刻 update('none') 把柱高打成 0
  const ds = {
    label: '累计集群小时',
    data: STAGES.map(st => (st.save === null ? BASE_HOURS : null)),
    backgroundColor: STAGES.map(st => st.isBase ? '#5A5A5A' : '#0072B2'),
    borderColor: STAGES.map(st => st.isBase ? '#333333' : '#00354F'),
    borderWidth: 2, borderRadius: 2, maxBarThickness: 62
  };
  chart = new Chart(cv.getContext('2d'), {
    type: 'bar',
    data: { labels: STAGES.map(st => st.stage + '　' + st.measure), datasets: [ds] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      layout: { padding: { top: 26, right: 8 } },
      scales: {
        x: { ticks: { autoSkip: false, maxRotation: 20, minRotation: 20, font: { size: 13 } }, grid: { display: false } },
        y: {
          title: { display: true, text: '累计集群小时（每月）', font: { size: 16 } },
          beginAtZero: true, suggestedMax: 6200,
          ticks: { font: { size: 14 } }
        }
      },
      plugins: {
        legend: { display: false },
        title: { display: true, text: '六阶段阶梯：勾选一个措施后该阶段计入累计值，未勾选则跳过', font: { size: 18 } },
        tooltip: {
          callbacks: {
            label: ctx2 => {
              const i = ctx2.dataIndex, st = STAGES[i];
              if (ctx2.parsed.y === null) return '未实施（跳过）';
              return '累计 ' + ctx2.parsed.y.toLocaleString('en-US') + ' 小时，降幅 ' +
                (100 - ctx2.parsed.y / BASE_HOURS * 100).toFixed(1) + '%';
            }
          }
        }
      }
    },
    plugins: [{
      id: 'stageLabels',
      afterDatasetsDraw(c) {
        const ctx = c.ctx;
        ctx.save();
        ctx.font = '600 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const meta = c.getDatasetMeta(0);
        meta.data.forEach((el, i) => {
          const v = c.data.datasets[0].data[i];
          if (v === null) {
            ctx.fillStyle = '#777777';
            ctx.fillText('未实施（跳过）', el.x, c.scales.y.getPixelForValue(0) - 12);
            return;
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(v.toLocaleString('en-US'), el.x, (el.base + el.y) / 2);
        });
        ctx.restore();
      }
    }]
  });
}

function onChange() {
  priceValEl.textContent = price().toFixed(1) + ' 元';
  const h = cumHours();
  const drop = (1 - h / BASE_HOURS) * 100;
  readEl.innerHTML = '累计集群小时 <b>' + h.toLocaleString('en-US') + '</b>（基线 5,760，降幅 <b>' +
    drop.toFixed(1) + '%</b>）；查询侧 ' + h.toLocaleString('en-US') + ' × ' + price().toFixed(1) + ' = <b>' +
    (h * price()).toLocaleString('en-US') + ' 元</b>。<br>' +
    '存储侧 4.6 TB × 900 = <b>4,140 元</b>（不随措施变化）；月成本合计 <b class="' +
    (monthly() <= BASE_COST ? 'ok' : 'no') + '">' + monthly().toLocaleString('en-US') + ' 元</b>（基线 19,116 元）。';
  const sig = price().toFixed(1) + '|' + STAGES.map(st => st.save === null ? '-' : (checkboxes[st.measure].checked ? '1' : '0')).join('');
  if (chart && sig !== lastSig) {
    lastSig = sig;
    let acc = BASE_HOURS;
    chart.data.datasets[0].data = STAGES.map(st => {
      if (st.save === null) return BASE_HOURS;
      if (!checkboxes[st.measure].checked) return null;
      acc -= st.save;
      return acc;
    });
    chart.update('none');
  }
}

function checkAll() {
  for (let i = 0; i < QUESTIONS.length; i++) {
    if (revealed[i]) continue;
    const q = QUESTIONS[i];
    let ok = true, blank = false;
    if (q.type === 'rank5') {
      const picked = rankSelects.map(s => s.value);
      if (picked.some(p => p === '')) blank = true;
      if (new Set(picked).size !== 5) ok = false;
      picked.forEach((p, k) => { if (p !== RANK_ORDER[k]) ok = false; });
    } else {
      q.fields.forEach(f => {
        const raw = inputs[f.id].value.trim();
        const v = parseFloat(raw);
        if (raw === '' || isNaN(v)) { blank = true; ok = false; return; }
        const exp = q.n === 2
          ? (f.unit === '元' ? AFTER_ALL.cost : AFTER_ALL.drop)
          : (f.unit === '元' ? AFTER_TOP3.cost : AFTER_TOP3.drop);
        if (Math.abs(v - exp) > f.tol) ok = false;
      });
    }
    if (blank) {
      fbEl.innerHTML = '<span class="no">第 ' + q.n + ' 题还有空没填。</span>三道题按固定顺序作答，每题两次机会；' +
        '答案一律按默认单价 2.6 元的口径计算，与滑块当前值无关。（已答对 ' + correctCount + ' 题，已用 ' + attempts + ' 次提交。）';
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
  rankSelects.forEach(s => { s.value = ''; });
  Object.keys(checkboxes).forEach(k => { checkboxes[k].checked = false; });
  priceSlider.value = PRICE_DEF;
  onChange();
  renderStatus();
  renderFeedback();
}

function renderStatus() {
  const n = revealed.filter(Boolean).length;
  statusEl.textContent = '5,760 集群小时能压到多少——先勾一遍看曲线，再算一遍月成本。｜答对 ' +
    correctCount + ' / 3 题' + (n === 3 ? '｜满分 3 分，答对 2 题视为掌握' : '｜已揭晓 ' + n + ' / 3 题');
}

function renderFeedback() {
  if (!revealed.some(Boolean)) {
    fbEl.innerHTML = '屏幕提问：5,760 集群小时能压到多少——先勾一遍看曲线，再算一遍月成本。' +
      '<br>月成本 = 累计集群小时 × 集群小时单价 + 4,140 元，存储侧恒为 4.6 TB × 900 = 4,140 元，不受勾选与单价调节影响。<br>' +
      '勾选为累积生效：勾选顺序不影响结果；某一阶段勾选后其后的累计值按“基线减去所有已勾选措施的单措施节省”重算。' +
      '判定：金额容差 ±1 元、降幅容差 ±0.1 个百分点、排名判定容差 0 位。';
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
    html += '两处反直觉：单措施收益第二与第三只差 10 小时却要按稳定性排序；集群小时降 50.3% 但月成本只降 39.4%——' +
      '省不掉的那一段正是存储成本。';
  } else {
    html += '还有 ' + (3 - revealed.filter(Boolean).length) + ' 题未提交。';
  }
  fbEl.innerHTML = html;
}

window.addEventListener('resize', () => { if (chart) chart.resize(); });
window.addEventListener('DOMContentLoaded', buildUI);