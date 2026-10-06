// 后端月度成本构成与降本空间 — Backend Cost Breakdown
// 教学目标：按七项成本口径算出优化前的月度后端费用合计，找出占比最高的单项，
//           并把账单摊薄成每会话后端成本。
// 规格来源：docs/chapters/09-backend-integration 的 backend-cost-breakdown 规格块
//
// ---- 布局计算（先算再写码）----
// 控件清单：1 行状态 + 口径表（表头 + 7 行 × 22px）+ 优化前后对照（3 行 × 19px）
//           + 3 行挑战题 + 1 行按钮 + 反馈文本区
// controlHeight = 8(内边距) + 22(状态) + 220(口径表 8 行) + 48(优化前后对照 2 行)
//                + 90(3 道题) + 30(按钮) + 122(反馈 6 行) = 540
// drawHeight = 360；iframeHeight = drawHeight + controlHeight + 2 = 908

const drawHeight = 360;
const FB_LINES = 6;
const FB_H = FB_LINES * 19 + 8;                  // 122
const TABLE_H = 220;   // 表头 + 7 行 × 27px，固定高度并 overflow:hidden 以保证跨浏览器一致
const NOTE_H = 2 * 21 + 6;                        // 48
const controlHeight = 8 + 22 + TABLE_H + NOTE_H + 30 * 3 + 30 + FB_H; // 540
const IFRAME_HEIGHT = drawHeight + controlHeight + 2; // 902

const SESSIONS = 18000;          // 月度会话数（数据表建模一节的会话量级）
const TOL_TOTAL = 0.01;          // 合计金额容差 ±0.01 元
const TOL_SHARE = 0.5;           // 占比容差 ±0.5 个百分点
const TOL_PER = 0.0005;          // 每会话成本容差 ±0.0005 元

// ---- 七项成本口径（规格块 Content 表；单价为教学用示意价）----
// bill 为规格块给出的优化前费用（元/月），share 为占比（保留一位小数）
const ITEMS = [
  { name: '数据库实例',     usage: '1 个组织',   free: '0',        price: '68.00',   unit: '元/月',        bill: 68.00, share: 23.7, billable: true },
  { name: '对象存储',       usage: '62 GB',      free: '0',        price: '0.0217',  unit: '元/GB·月',     bill: 1.35,  share: 0.5,  billable: true },
  { name: '对象存储出网',   usage: '210 GB',     free: '0',        price: '0.36',    unit: '元/GB',        bill: 75.60, share: 26.4, billable: true },
  { name: '实时出站消息',   usage: '0.17 GB',    free: '2 GB',     price: '0.36',    unit: '元/GB',        bill: 0.00,  share: 0.0,  billable: false },
  { name: '边缘函数调用',   usage: '260,000 次', free: '500,000 次', price: '0.008', unit: '元/千次',      bill: 0.00,  share: 0.0,  billable: false },
  { name: '边缘函数出网',   usage: '388 GB',     free: '0',        price: '0.36',    unit: '元/GB',        bill: 139.68, share: 48.7, billable: true },
  { name: '备份存储',       usage: '96 GB',      free: '0',        price: '0.0217',  unit: '元/GB·月',     bill: 2.08,  share: 0.7,  billable: true }
];

// ---- 优化前后对照（规格块 Content 的答题反馈文案与 Rules；只列规格给出的口径）----
const AFTER = {
  total: 179.63,       // 优化后合计
  dropPct: 37.4,       // 降幅 =（优化前 − 优化后）÷ 优化前
  edgeUsage: '96 GB',  // 边缘函数出网改成 302 跳转后的用量
  edgeBill: 34.56,     // 对应费用
  edgeShare: 19.2,     // 占优化后总价
  perSession: 0.0100,  // 优化后每会话后端成本
  modelPerSession: 0.0125,
  modelTotal: 0.0225,
  backendShare: 44.4
};

const TOP_ITEM = '边缘函数出网';

const QUESTIONS = [
  {
    n: 1,
    text: '优化前的月度后端费用合计是多少元？',
    answers: [{ id: 'q1', unit: '元', tol: TOL_TOTAL }],
    expect: () => 286.71,
    correct: '正确，286.71 元。',
    hint: '68.00 + 1.35 + 75.60 + 0.00 + 0.00 + 139.68 + 2.08 = 286.71 元。',
    detail: '第 1 题里有两项是 0.00 元，它们是免费额度挡住的——实时出站 0.17 GB 远低于 2 GB，边缘函数调用 26 万次远低于 50 万次，用量最“热闹”的两项一分钱没花，真正的账单在流量上。'
  },
  {
    n: 2,
    text: '占比最高的单项是哪一项，占比多少？',
    answers: [{ id: 'sel', type: 'select', options: ITEMS.map(i => i.name) },
              { id: 'q2', unit: '%', tol: TOL_SHARE }],
    expect: () => 48.7,
    expectText: () => TOP_ITEM,
    correct: '正确，边缘函数出网，48.7%。',
    hint: '139.68 ÷ 286.71 = 0.4871，即 48.7%；它比对象存储出网（26.4%）和数据库实例（23.7%）都高。',
    detail: '第 2 题的 48.7% 之所以高，是因为边缘节点把响应体完整转发了一遍；改成 302 跳转到对象存储后这项降到 96 GB、34.56 元，占优化后总价的 19.2%。'
  },
  {
    n: 3,
    text: '三项降本动作做完后，每会话后端成本是多少元？',
    answers: [{ id: 'q3', unit: '元', tol: TOL_PER }],
    expect: () => AFTER.perSession,
    correct: '正确，0.0100 元。',
    hint: '优化后合计 179.63 元，除以 18,000 个会话得 0.009979 元，判定为 0.0100 元。',
    detail: '第 3 题的 0.0100 元要和模型成本对照：单会话模型成本 0.0125 元，两项相加 0.0225 元，后端占 44.4%——这个比例就是“要不要上自建后端”这个问题的答案起点。'
  }
];

let chart = null;
let inputs = {};
let selects = {};
let statusEl = null;
let fbEl = null;
let attempts = 0;
let correctCount = 0;
let done = false;
let revealed = [false, false, false];
let correctFlags = [false, false, false];

Chart.defaults.font.family = 'Arial, Helvetica, sans-serif';
Chart.defaults.font.size = 14;
Chart.defaults.plugins.title.font = { size: 18 };
Chart.defaults.plugins.legend.labels.font = { size: 15 };

const DataLabels = {
  id: 'dataLabels',
  afterDatasetsDraw(c) {
    const ctx = c.ctx;
    ctx.save();
    ctx.font = '600 13px Arial';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1a1a1a';
    c.data.datasets.forEach((ds, di) => {
      const meta = c.getDatasetMeta(di);
      meta.data.forEach((el, i) => {
        const v = ds.data[i];
        ctx.textAlign = 'left';
        ctx.fillStyle = v === 0 ? '#666666' : '#1a1a1a';
        if (v === 0) {
          ctx.fillText('¥0.00（免费额度内）', el.x + 6, el.y);
        } else if (ITEMS[i].name === TOP_ITEM) {
          ctx.fillStyle = '#7A2600';
          ctx.fillText('¥' + v.toFixed(2) + '　▲ 占比 ' + ITEMS[i].share.toFixed(1) + '%', el.x + 6, el.y);
        } else {
          ctx.fillText('¥' + v.toFixed(2), el.x + 6, el.y);
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
  cv.setAttribute('aria-label', '后端七项成本口径优化前的月度费用条形图，边缘函数出网 139.68 元占比 48.7% 最高');
  chartArea.appendChild(cv);
  buildChart(cv);

  const panel = document.getElementById('panel');
  panel.style.height = controlHeight + 'px';

  statusEl = document.createElement('div');
  statusEl.className = 'status';
  panel.appendChild(statusEl);

  // ---- 七项口径表 ----
  const table = document.createElement('table');
  table.className = 'kb';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['项目', '用量', '免费额度', '单价', '计费单位', '费用（元/月）', '占比'].forEach(t => {
    const th = document.createElement('th');
    th.textContent = t;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  ITEMS.forEach(it => {
    const tr = document.createElement('tr');
    const cells = [it.name, it.usage, it.free, it.price, it.unit, it.bill.toFixed(2), it.share.toFixed(1) + '%'];
    cells.forEach((txt, k) => {
      const td = document.createElement('td');
      td.textContent = txt;
      if (k === 0) td.className = 'name';
      if (!it.billable) td.className = 'zero';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  const tw = document.createElement('div');
  tw.style.height = TABLE_H + 'px';
  tw.style.overflow = 'hidden';
  tw.appendChild(table);
  panel.appendChild(tw);

  // ---- 优化前后对照 ----
  const note = document.createElement('div');
  note.className = 'note';
  note.style.height = NOTE_H + 'px';
  note.innerHTML = '<b>优化前后对照</b>：合计 286.71 → <b>' + AFTER.total.toFixed(2) +
    ' 元</b>（降 ' + AFTER.dropPct.toFixed(1) + '%）；边缘函数出网 388 GB → ' + AFTER.edgeUsage + '、139.68 → ' +
    AFTER.edgeBill.toFixed(2) + ' 元（占优化后 ' + AFTER.edgeShare.toFixed(1) + '%）。<br>' +
    '每会话后端成本 ' + (286.71 / SESSIONS).toFixed(4) + ' → ' + AFTER.perSession.toFixed(4) +
    ' 元（单会话模型成本 ' + AFTER.modelPerSession.toFixed(4) + ' 元，两项相加 ' + AFTER.modelTotal.toFixed(4) +
    ' 元，后端占 ' + AFTER.backendShare.toFixed(1) + '%）。';
  panel.appendChild(note);

  // ---- 三道挑战题 ----
  QUESTIONS.forEach(q => {
    const row = document.createElement('div');
    row.className = 'row';
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = 'Q' + q.n + '　' + q.text;
    row.appendChild(lbl);
    q.answers.forEach(a => {
      if (a.type === 'select') {
        const sel = document.createElement('select');
        sel.setAttribute('aria-label', '第 ' + q.n + ' 题：占比最高的单项');
        const none = document.createElement('option');
        none.value = '';
        none.textContent = '（选择项目）';
        sel.appendChild(none);
        a.options.forEach(o => {
          const op = document.createElement('option');
          op.value = o;
          op.textContent = o;
          sel.appendChild(op);
        });
        selects[a.id] = sel;
        row.appendChild(sel);
      } else {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.step = 'any';
        inp.setAttribute('aria-label', '第 ' + q.n + ' 题：' + a.unit);
        inp.placeholder = a.unit;
        inputs[a.id] = inp;
        row.appendChild(inp);
      }
      const u = document.createElement('span');
      u.className = 'unit';
      u.textContent = a.unit;
      row.appendChild(u);
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

  renderStatus();
  renderFeedback();
}

function buildChart(cv) {
  const ds = {
    label: '优化前月度费用',
    data: ITEMS.map(i => i.bill),
    backgroundColor: ITEMS.map(i => i.bill === 0 ? '#BDBDBD' : (i.name === TOP_ITEM ? '#D55E00' : '#0072B2')),
    borderColor: ITEMS.map(i => i.bill === 0 ? '#7A7A7A' : (i.name === TOP_ITEM ? '#7A2600' : '#00354F')),
    borderWidth: 2, borderRadius: 2, maxBarThickness: 26
  };
  chart = new Chart(cv.getContext('2d'), {
    type: 'bar',
    data: { labels: ITEMS.map(i => i.name), datasets: [ds] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 220 },
      layout: { padding: { right: 176, top: 14 } },
      scales: {
        x: {
          title: { display: true, text: '优化前月度费用（元/月）', font: { size: 16 } },
          min: 0, ticks: { callback: v => '¥' + v, font: { size: 14 } },
          grid: { color: '#e6e6e6' }
        },
        y: { title: { display: true, text: '七项成本口径', font: { size: 16 } }, ticks: { font: { size: 14 }, autoSkip: false }, grid: { display: false } }
      },
      plugins: {
        legend: { display: false },
        title: { display: true, text: '后端月度成本构成：边缘函数出网 139.68 元占 48.7%，两项被免费额度挡成 0.00 元', font: { size: 18 } },
        tooltip: {
          callbacks: {
            label: ctx2 => {
              const i = ctx2.dataIndex;
              return '¥' + ctx2.parsed.x.toFixed(2) + ' / 月，占比 ' + ITEMS[i].share.toFixed(1) +
                '%（' + ITEMS[i].usage + '，免费额度 ' + ITEMS[i].free + '）';
            }
          }
        }
      }
    },
    plugins: [DataLabels]
  });
}

function checkAll() {
  if (done) return;
  // 只判定尚未揭晓的题
  for (let i = 0; i < QUESTIONS.length; i++) {
    if (revealed[i]) continue;
    const q = QUESTIONS[i];
    let ok = true;
    let blank = false;
    q.answers.forEach(a => {
      if (a.type === 'select') {
        const v = selects[a.id].value;
        if (v === '') { blank = true; ok = false; return; }
        if (v !== q.expectText()) ok = false;
      } else {
        const raw = inputs[a.id].value.trim();
        const v = parseFloat(raw);
        if (raw === '' || isNaN(v)) { blank = true; ok = false; return; }
        if (Math.abs(v - q.expect()) > a.tol) ok = false;
      }
    });
    if (blank) {
      fbEl.innerHTML = '<span class="no">第 ' + q.n + ' 题还有空没填。</span>' +
        '三道题按固定顺序作答，每题两次机会；填完当前题再点“检查答案”。' +
        '（已答对 ' + correctCount + ' 题，已用 ' + attempts + ' 次提交。）';
      return;
    }
    revealed[i] = true;
    correctFlags[i] = ok;
    if (ok) correctCount++;
    attempts++;
  }
  done = revealed.every(Boolean);
  renderStatus();
  renderFeedback();
}

function resetAll() {
  attempts = 0;
  correctCount = 0;
  done = false;
  revealed = [false, false, false];
  correctFlags = [false, false, false];
  Object.keys(inputs).forEach(k => { inputs[k].value = ''; });
  Object.keys(selects).forEach(k => { selects[k].value = ''; });
  renderStatus();
  renderFeedback();
}

function renderStatus() {
  const n = revealed.filter(Boolean).length;
  statusEl.textContent = '用量最热闹的两项一分钱没花，真正掏钱的是流量。｜累计答对 ' + correctCount +
    ' / 3 题' + (done ? '｜满分 3 分，答对 2 分视为掌握' : '｜已揭晓 ' + n + ' / 3 题');
}

function renderFeedback() {
  if (!revealed.some(Boolean)) {
    fbEl.innerHTML = '学习者先看到七行成本口径与用量，在不揭晓结果的情况下写下合计、占比最高项与摊薄成本。' +
      '<br>单项费用 = max(0, 用量 − 免费额度) × 单价；边缘函数调用的免费额度单位是次、单价单位是千次，' +
      '所以该项为 max(0, 260,000 − 500,000) ÷ 1000 × 0.008 = 0.00 元。<br>' +
      '判定：合计容差 ±0.01 元；占比容差 ±0.5 个百分点（差值小于 0.5 个百分点判为并列，两者都算对）；' +
      '每会话成本容差 ±0.0005 元。三题固定顺序，每题两次机会。';
    return;
  }
  let html = '';
  QUESTIONS.forEach((q, i) => {
    if (!revealed[i]) return;
    const ok = correctFlags[i];
    html += '<span class="' + (ok ? 'ok">✓' : 'no">✗') + '</span> 第 ' + q.n + ' 题：' +
      (ok ? q.correct : q.hint) + '<br>';
    if (!ok) html += '　' + q.detail + '<br>';
  });
  if (done) {
    html += '计分满分 3 分，答对 ' + correctCount + ' 分。提示：免费额度内的两项（实时消息、边缘函数调用）合计 0.00 元，' +
      '为省 0.14 元去改架构是纯亏损。';
  } else {
    html += '还有 ' + (3 - revealed.filter(Boolean).length) + ' 题未提交——三题结束后展示优化前后对照。';
  }
  fbEl.innerHTML = html;
}

window.addEventListener('resize', () => { if (chart) chart.resize(); });
window.addEventListener('DOMContentLoaded', buildUI);