// 混合检索效果对比 — Hybrid Retrieval Compare
// 教学目标：比较 BM25 / 纯稠密 / RRF 混合在五类查询上的 recall@20，
//           并判断哪一类上混合反而不如单路、哪一路的总均值最高。
// 规格来源：docs/chapters/03-rag-basics 的 hybrid-retrieval-compare 规格块
//
// ---- 布局计算（先算再写码）----
// 控件清单：1 行状态 + 3 行下拉（三个判断）+ 1 行按钮 + 反馈文本区
// controlHeight = 6(内边距) + 24(状态) + 30*3(下拉) + 34(按钮) + 179(反馈 9 行) = 333
// drawHeight = 400；iframeHeight = drawHeight + controlHeight + 2 = 735

const drawHeight = 400;
const FB_LINES = 9;
const FB_H = FB_LINES * 19 + 8;                 // 179
const controlHeight = 6 + 24 + 30 * 3 + 34 + FB_H; // 333
const IFRAME_HEIGHT = drawHeight + controlHeight + 2; // 735

// ---- 数据（规格块 Content：100 道有标准答案的题，每类 20 题）----
const CATS = ['编号精确匹配', '术语精确匹配', '同义改写', '多跳聚合', '跨文档综合', '总体均值'];
// 配色取 Okabe-Ito 色盲友好色板；每路额外用深色描边与图例文字作为第二重线索
const SERIES = [
  { key: 'bm25',  label: 'BM25',     color: '#0072B2', border: '#00354F', data: [0.95, 0.85, 0.45, 0.30, 0.35, 0.58] },
  { key: 'dense', label: '纯稠密',   color: '#E69F00', border: '#7A4E00', data: [0.40, 0.60, 0.85, 0.60, 0.55, 0.60] },
  { key: 'rrf',   label: 'RRF 混合', color: '#009E73', border: '#00452F', data: [0.90, 0.90, 0.90, 0.65, 0.65, 0.80] }
];
// Content 表"该类最优"列
const BEST_LABEL = ['BM25', 'RRF 混合', 'RRF 混合', 'RRF 混合', 'RRF 混合', 'RRF 混合'];

// ---- 三个判断（规格块 Evidence of Mastery：先写下三项判断再揭晓）----
// 判定规则：差值 >= 0.05 不算并列；差值 < 0.02 时两种选择都算对。
// 本块数据下三个判断的次优差距分别为 0.05 / 0.05 / 0.20，均不算并列。
const QUESTIONS = [
  {
    catIdx: 0,
    prompt: '① 编号精确匹配类最优策略',
    accept: ['BM25'],
    standard: 'BM25（0.95）',
    reveal: '编号精确匹配上 BM25 的 0.95 高于混合的 0.90，因为倒排索引对“SO-2024-0917”这类字符串是精确命中，而向量把它编码成了语义位置、编号本身根本没进入匹配；混合的 0.90 已经保住了能力，但代价是纯稠密只有 0.40。'
  },
  {
    catIdx: 2,
    prompt: '② 同义改写类最优策略',
    accept: ['RRF 混合'],
    standard: 'RRF 混合（0.90）',
    reveal: '同义改写上 BM25 只有 0.45，因为“住店的钱”和“住宿标准”没有一个词重合；RRF 混合的 0.90 与纯稠密的 0.85 差距小于编号类那行，说明这一类主要靠稠密路兜底。'
  },
  {
    catIdx: 5,
    prompt: '③ 总均值最高的一路是？',
    accept: ['RRF 混合'],
    standard: 'RRF 混合（0.80）',
    reveal: '总体均值 0.58 / 0.60 / 0.80 的分界线在 0.20，说明混合的收益主要来自把两路各自的强项拼起来，而不是某一路被调好了。'
  }
];

let chart = null;
let selects = [];
let statusEl = null;
let fbEl = null;
let lockBtn = null;
let againBtn = null;
let round = 1;
let answers = ['', '', ''];
let scored = [null, null, null];
let bestScore = 0;

Chart.defaults.font.family = 'Arial, Helvetica, sans-serif';
Chart.defaults.font.size = 14;
Chart.defaults.plugins.title.font = { size: 18 };
Chart.defaults.plugins.legend.labels.font = { size: 15 };

// 数据标签插件（数值直接标在柱顶，避免只靠颜色读图）
const DataLabels = {
  id: 'dataLabels',
  afterDatasetsDraw(c) {
    const o = c.options.plugins.dataLabels || {};
    const ctx = c.ctx;
    ctx.save();
    ctx.font = '600 13px Arial';
    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    c.data.datasets.forEach((ds, di) => {
      const meta = c.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el, i) => {
        const v = ds.data[i];
        if (v === null || v === undefined) return;
        ctx.fillText((o.formatter ? o.formatter(v, i, ds) : v.toFixed(2)), el.x, el.y - 6);
      });
    });
    ctx.restore();
  }
};

// 揭晓后给每类的最优柱加粗描边 —— 与颜色无关的第二重线索
const WinnerMarks = {
  id: 'winnerMarks',
  afterDatasetsDraw(c) {
    if (!state.revealed) return;
    const ctx = c.ctx;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#111111';
    c.data.datasets.forEach((ds, di) => {
      c.data.labels.forEach((lab, i) => {
        if (i >= 6) return;
        let best = -1, bi = -1;
        c.data.datasets.forEach((d, k) => { if (d.data[i] > best) { best = d.data[i]; bi = k; } });
        const el = c.getDatasetMeta(bi).data[i];
        ctx.strokeRect(el.x - el.width / 2 - 3, el.y - 3, el.width + 6, el.height + 6);
      });
    });
    ctx.restore();
  }
};

const state = { revealed: false };

function buildUI() {
  const chartArea = document.getElementById('chartArea');
  chartArea.style.height = drawHeight + 'px';
  const cv = document.createElement('canvas');
  cv.id = 'chart';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', 'BM25、纯稠密、RRF 混合三路策略在五类查询与总体均值上的 recall@20 对比柱状图');
  chartArea.appendChild(cv);
  buildChart(cv);

  const panel = document.getElementById('panel');
  panel.style.height = controlHeight + 'px';

  statusEl = document.createElement('div');
  statusEl.className = 'status';
  panel.appendChild(statusEl);

  QUESTIONS.forEach((q, i) => {
    const row = document.createElement('div');
    row.className = 'row';
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = q.prompt;
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', q.prompt);
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '（先写下你的判断）';
    sel.appendChild(none);
    SERIES.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.label;
      opt.textContent = s.label;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => { answers[i] = sel.value; });
    row.appendChild(lbl);
    row.appendChild(sel);
    panel.appendChild(row);
    selects.push(sel);
  });

  const btnRow = document.createElement('div');
  btnRow.className = 'row';
  lockBtn = document.createElement('button');
  lockBtn.textContent = '锁定三项判断并揭晓';
  lockBtn.addEventListener('click', lockAnswers);
  againBtn = document.createElement('button');
  againBtn.textContent = '再来一轮（第 2 次机会）';
  againBtn.addEventListener('click', restartRound);
  againBtn.style.display = 'none';
  btnRow.appendChild(lockBtn);
  btnRow.appendChild(againBtn);
  panel.appendChild(btnRow);

  fbEl = document.createElement('div');
  fbEl.className = 'fb';
  fbEl.style.height = FB_H + 'px';
  panel.appendChild(fbEl);

  renderStatus();
  renderFeedback();
}

function buildChart(cv) {
  chart = new Chart(cv.getContext('2d'), {
    type: 'bar',
    data: {
      labels: CATS.slice(),
      datasets: SERIES.map(s => ({
        label: s.label,
        data: s.data.slice(),
        backgroundColor: s.color,
        borderColor: s.border,
        borderWidth: 2,
        borderRadius: 2,
        maxBarThickness: 52
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 220 },
      layout: { padding: { top: 18, right: 8 } },
      scales: {
        x: {
          title: { display: true, text: '查询类型（每类 20 题）', font: { size: 16 } },
          ticks: { autoSkip: false, maxRotation: 0, font: { size: 14 }, callback(v, i) { const l = this.getLabelForValue(v); return Array.isArray(l) ? l : [l]; } },
          grid: { display: false }
        },
        y: {
          title: { display: true, text: 'recall@20（0 到 1）', font: { size: 16 } },
          min: 0, max: 1, ticks: { stepSize: 0.2, font: { size: 14 } }
        }
      },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { boxWidth: 18, boxHeight: 12, padding: 12 } },
        title: { display: true, text: '三种检索策略在 100 道有标准答案的题上的 recall@20', font: { size: 18 } },
        tooltip: { callbacks: { label: ctx2 => ctx2.dataset.label + '：' + ctx2.parsed.y.toFixed(2) } }
      }
    },
    plugins: [DataLabels, WinnerMarks]
  });
}

function lockAnswers() {
  if (answers.some(a => a === '')) {
    renderStatus();
    fbEl.innerHTML = '<span class="no">还有判断没有写下。</span>三项判断全部选定后点“锁定三项判断并揭晓”，' +
      '标准值才会显示——先预测、再揭晓是这个层级的证据要求。';
    return;
  }
  scored = QUESTIONS.map((q, i) => answers[i] !== '' && q.accept.indexOf(answers[i]) >= 0);
  const n = scored.filter(Boolean).length;
  bestScore = Math.max(bestScore, n);
  state.revealed = true;

  // 第二重线索：x 轴标签补上“▲ 该类最优”
  chart.data.labels = CATS.map((c, i) => [c, '▲ 最优 ' + BEST_LABEL[i]]);
  chart.update();

  lockBtn.disabled = true;
  selects.forEach(s => { s.disabled = true; });
  if (round < 2) againBtn.style.display = 'inline-block';

  renderStatus();
  renderFeedback();
}

function restartRound() {
  round = 2;
  answers = ['', '', ''];
  scored = [null, null, null];
  state.revealed = false;
  chart.data.labels = CATS.slice();
  chart.update();
  selects.forEach(s => { s.value = ''; s.disabled = false; });
  lockBtn.disabled = false;
  againBtn.style.display = 'none';
  renderStatus();
  renderFeedback();
}

function renderStatus() {
  if (!state.revealed) {
    statusEl.textContent = '第 ' + round + ' 轮：写下三项判断后锁定（标准值已隐藏）。｜三项全部一致才算掌握';
    return;
  }
  const n = scored.filter(Boolean).length;
  const tail = round < 2 ? '（可再来一轮）' : '（两轮已用完）';
  statusEl.textContent = '揭晓：本轮答对 ' + n + ' / 3 题' + tail + '｜最佳 ' + bestScore + ' / 3';
}

function renderFeedback() {
  if (!state.revealed) {
    fbEl.innerHTML = '屏幕提问：混合检索把总体均值抬了 0.20，可在编号类查询上它居然不如纯 BM25——' +
      '先写下三个判断，再看标准值。<br>' +
      '规则：同一类里两路差值 >= 0.05 不算并列；差值 &lt; 0.02 时两种选择都算对。' +
      '每题两次机会，第 2 轮不扣分但记为失手。';
    return;
  }
  let html = '';
  QUESTIONS.forEach((q, i) => {
    const ok = scored[i];
    const mark = ok ? '<span class="ok">✓ 正确</span>' : '<span class="no">✗ 不对</span>';
    html += (i + 1) + '）' + q.prompt + '　你的选择：' + answers[i] + ' ' + mark +
      '　该类最优是 <b>' + q.standard + '</b><br>';
    html += '　' + q.reveal + '<br>';
  });
  const n = scored.filter(Boolean).length;
  if (round < 2) {
    html += '揭晓后展示“答对 ' + n + '/3 题”，提示：融合不是让每类都变好，而是保住纯稠密最弱的那一类。';
  } else {
    html += (n === 3 && bestScore === 3)
      ? '两轮均 3/3，掌握。记住：融合不是让每类都变好，而是保住纯稠密最弱的那一类。'
      : '提示：融合不是让每类都变好，而是保住纯稠密最弱的那一类（编号类 0.95 > 0.90 是唯一一处混合落后单路的数据）。';
  }
  fbEl.innerHTML = html;
}

function onResize() {
  if (chart) chart.resize();
}

window.addEventListener('resize', onResize);
window.addEventListener('DOMContentLoaded', buildUI);