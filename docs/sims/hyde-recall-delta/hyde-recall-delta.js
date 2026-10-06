// 假设性文档的召回增益 — HyDE Recall Delta
// 教学目标：比较六道查询在「仅用原查询」与「假文档替换原查询」下的前 20 名命中数，
// 选出唯一出现负增益的查询（序号 5），并说出双路融合的工程修法。
// 规格来源：docs/chapters/03-rag-basics/index.md 的 hyde-recall-delta 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：1 个数字输入框（序号）+ 1 个下拉框（工程修法）+ 2 个按钮，共 3 行
// controlHeight = (3 * 35) + 10 = 115
// drawHeight = 560；canvasHeight = 560 + 115 = 675；iframeHeight = 677
// 行分配：第 1 行输入框 / 第 2 行下拉框 / 第 3 行按钮

let canvasWidth = 800;
let drawHeight = 560;
let controlHeight = 115;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let controlLeft = 150;
let defaultTextSize = 16;

// ---- 数据源（规格块 Content 表，命中数上限 20）----
const ROWS = [
  { no: 1, q: '报销要几天批下来', base: 11, hyde: 17 },
  { no: 2, q: '出差住宿标准是多少', base: 12, hyde: 16 },
  { no: 3, q: '年假怎么算', base: 9, hyde: 14 },
  { no: 4, q: '门禁卡丢了怎么办', base: 10, hyde: 16 },
  { no: 5, q: '工单 SO-2024-0917 归谁处理', base: 20, hyde: 15 },
  { no: 6, q: '合同编号规则是什么', base: 14, hyde: 18 }
];

// ---- 工程修法选项（规格块 Feedback 的标准答案）----
const FIX_OPTIONS = [
  'A 关掉 HyDE，改为只用原查询检索',
  'B 假文档只喂稠密路、原查询只喂稀疏路，再用 RRF 融合',
  'C 把召回 topK 从 20 提到 100 再重试',
  'D 把假文档也写进答案上下文，让模型自己判断'
];
const FIX_ANSWER = 'B 假文档只喂稠密路、原查询只喂稀疏路，再用 RRF 融合';
const Q1_ANSWER = 5; // 序号 5 是唯一负增益

// ---- 反馈文案（规格块 Content 原文）----
const FB_Q1 =
  '五道口语化查询的增益在 +4 到 +6 之间，因为假文档把口语问句翻译成了制度正文语体，稠密路的召回明显改善；' +
  '序号 5 是唯一负增益，原因是工单号必须精确匹配，假文档在生成时把编号改写成了一个不存在的单号，' +
  '稠密路被带偏，而原问题的 BM25 路仍能靠精确串命中。';
const FB_Q2 =
  '工程修法不是关掉 HyDE，而是把两条路分工：假文档只喂稠密路，原问题只喂稀疏路，再用 RRF 融合——' +
  '这样既保住口语改写的增益，又保住编号匹配的能力。';

let idxInput, fixSel;
let submitBtn, resetBtn;

let mode = 'predict';       // predict | revealed
let attemptsQ1 = 0;
let attemptsQ2 = 0;
let okQ1 = false;
let okQ2 = false;
let correctCount = 0;
let msgQ1 = '';
let msgQ2 = '';
let msg1Ok = false;
let msg2Ok = false;

// ---- 模型函数（规格块 Rules：增益 = 假文档替换后 − 仅原查询）----
function gain(r) { return r.hyde - r.base; }
function isDegraded(r) { return gain(r) <= 0; }
function sumBase() { return ROWS.reduce((a, r) => a + r.base, 0); }
function sumHyde() { return ROWS.reduce((a, r) => a + r.hyde, 0); }
function degradedList() { return ROWS.filter(isDegraded).map(r => r.no); }

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  idxInput = createInput('', 'number');
  idxInput.parent(document.querySelector('main'));
  idxInput.position(controlLeft, drawHeight + 6);
  idxInput.size(90);
  idxInput.attribute('aria-label', '第 1 题答案：唯一负增益的查询序号');
  idxInput.attribute('placeholder', '序号 1-6');

  fixSel = createSelect();
  fixSel.parent(document.querySelector('main'));
  fixSel.position(controlLeft, drawHeight + 41);
  fixSel.size(canvasWidth - controlLeft - margin);
  for (const o of FIX_OPTIONS) fixSel.option(o, o);
  fixSel.attribute('aria-label', '第 2 题答案：工程修法');

  submitBtn = createButton('提交判定');
  submitBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  submitBtn.position(10, drawHeight + 78);
  submitBtn.mousePressed(submitAll);

  resetBtn = createButton('重来');
  resetBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  resetBtn.position(130, drawHeight + 78);
  resetBtn.mousePressed(resetAll);

  describe('交互式对照台：六道查询在仅用原查询与假文档替换两种做法下的前 20 名命中数对比。' +
    '先预测唯一出现负增益的查询序号，再选出双路融合的工程修法。');
}

function draw() {
  updateCanvasSize();

  fill('aliceblue');
  stroke('silver');
  rect(0, 0, canvasWidth, drawHeight);
  fill('white');
  rect(0, drawHeight, canvasWidth, controlHeight);

  fill('black');
  noStroke();
  textSize(24);
  textAlign(CENTER, TOP);
  text('假设性文档的召回增益（recall@20）', canvasWidth / 2, 10);

  textAlign(LEFT, TOP);
  textSize(14);
  const cpl = charsPerLine();
  drawWrapped(
    'HyDE 在五道题上都赚了，唯独有一道倒亏——先猜是哪一道，再想怎么修。' +
    '提示：假文档的生成开销约 200 token / 1.2 秒 / 0.0024 元，且只用于检索、不进答案上下文。',
    margin, 44, cpl, 18);

  drawTable(120);
  drawTotals();
  drawFeedback(348);
  drawControls();
}

function drawTable(top) {
  const xs = [30, 66, 380, 470, 580];
  textSize(13);
  textStyle(BOLD);
  text('序号', xs[0], top);
  text('查询', xs[1], top);
  text('仅原查询', xs[2], top);
  text('假文档替换后', xs[3], top);
  text('增益', xs[4], top);
  stroke(200);
  line(margin, top + 18, canvasWidth - margin, top + 18);
  noStroke();
  textStyle(NORMAL);

  for (let i = 0; i < ROWS.length; i++) {
    const r = ROWS[i];
    const y = top + 28 + i * 24;
    text(String(r.no), xs[0], y);
    text(r.q, xs[1], y);
    text(String(r.base), xs[2], y);
    text(String(r.hyde), xs[3], y);
    if (mode === 'revealed') {
      const g = gain(r);
      fill(g <= 0 ? 'darkred' : 'darkgreen');
      text((g > 0 ? '+' : '') + g, xs[4], y);
      fill('black');
    } else {
      fill(130);
      text('待揭晓', xs[4], y);
      fill('black');
    }
  }
}

function drawTotals() {
  const y = 120 + 28 + ROWS.length * 24 + 12;
  const b = sumBase(), h = sumHyde();
  fill('black');
  textSize(14);
  text('合计命中数：仅原查询 ' + b + ' → 假文档替换后 ' + h +
       '（' + (h - b >= 0 ? '+' : '') + (h - b) + '），平均每题 ' +
       (b / ROWS.length).toFixed(1) + ' → ' + (h / ROWS.length).toFixed(1), margin, y);
  fill(110);
  text('（按上表逐行求和；规格块正文的「86 / 14.3」与表内数据不一致，表内求和为 96 / 16.0）',
       margin, y + 20);
}

function drawFeedback(top) {
  textSize(14);
  const cpl = charsPerLine();
  let y = top;
  fill('black');
  text('第 1 题：六道查询里唯一出现负增益（增益 ≤ 0）的是序号几？', margin, y);
  y += 22;
  if (msgQ1) {
    fill(msg1Ok ? 'darkgreen' : 'darkred');
    text(msgQ1, margin, y);
    fill('black');
    y += 22;
    y = drawWrapped('负增益行：' + degradedList().join('、') + ' 号；' + FB_Q1, margin, y, cpl, 18) + 8;
  } else {
    fill(110);
    y = drawWrapped('判定规则：增益 = 假文档替换后命中数 − 仅原查询命中数；增益 ≤ 0 即为变差。',
                    margin, y, cpl, 18) + 8;
  }
  text('第 2 题：工程修法该怎么改？', margin, y);
  y += 22;
  if (msgQ2) {
    fill(msg2Ok ? 'darkgreen' : 'darkred');
    text(msgQ2, margin, y);
    fill('black');
    y += 22;
    y = drawWrapped(FB_Q2, margin, y, cpl, 18) + 8;
  } else {
    fill(110);
    y = drawWrapped('提示：修法不是关掉 HyDE，而是给稠密路与稀疏路分工。', margin, y, cpl, 18) + 8;
  }
  if (mode === 'revealed') {
    fill(30);
    text('揭晓：答对 ' + correctCount + ' / 2 题；负增益只出现在序号 ' + Q1_ANSWER + '。',
         margin, Math.min(y, drawHeight - 22));
  }
}

function drawControls() {
  fill('black');
  noStroke();
  textAlign(LEFT, CENTER); // 控件区标签按行垂直居中，避免压住 HTML 控件
  textSize(14);
  text('第1题 序号 →', 10, drawHeight + 15);
  text('第2题 修法 →', 10, drawHeight + 50);
  textAlign(LEFT, TOP); // 还原为顶端对齐

}

function submitAll() {
  if (mode === 'revealed') return;

  // ---- 第 1 题：序号判定（整数精确匹配，两次机会）----
  const raw = idxInput.value().trim();
  const v = parseInt(raw, 10);
  const ok1 = raw !== '' && !isNaN(v) && v === Q1_ANSWER;
  attemptsQ1++;
  okQ1 = ok1;
  if (ok1) {
    msg1Ok = true;
    msgQ1 = '正确，序号 ' + Q1_ANSWER + ' 是唯一负增益';
  } else if (attemptsQ1 >= 2) {
    msg1Ok = false;
    msgQ1 = '两次机会已用完。标准答案：序号 ' + Q1_ANSWER +
            '（仅原查询 20 → 假文档替换后 15，增益 -5）';
  } else {
    msg1Ok = false;
    msgQ1 = '再判一次（还有 ' + (2 - attemptsQ1) + ' 次机会）。变差的行增益为负或为零。';
  }

  // ---- 第 2 题：工程修法（精确匹配，两次机会）----
  const pick = fixSel.value();
  const ok2 = pick === FIX_ANSWER;
  attemptsQ2++;
  okQ2 = ok2;
  if (ok2) {
    msg2Ok = true;
    msgQ2 = '正确，假文档走稠密、原查询走稀疏、RRF 融合。';
  } else if (attemptsQ2 >= 2) {
    msg2Ok = false;
    msgQ2 = '两次机会已用完。标准答案：' + FIX_ANSWER + '。';
  } else {
    msg2Ok = false;
    msgQ2 = '再判一次（还有 ' + (2 - attemptsQ2) + ' 次机会）：假文档会编造编号，被带偏的是哪一路？';
  }

  correctCount = (ok1 ? 1 : 0) + (ok2 ? 1 : 0);
  if (attemptsQ1 >= 2 && attemptsQ2 >= 2) mode = 'revealed';
}

function resetAll() {
  mode = 'predict';
  attemptsQ1 = 0;
  attemptsQ2 = 0;
  okQ1 = false;
  okQ2 = false;
  correctCount = 0;
  msgQ1 = '';
  msgQ2 = '';
  msg1Ok = false;
  msg2Ok = false;
  idxInput.value('');
  fixSel.value(FIX_OPTIONS[0]);
}

function windowResized() {
  updateCanvasSize();
  resizeCanvas(canvasWidth, canvasHeight);
}

function updateCanvasSize() {
  const container = document.querySelector('main');
  if (container) {
    canvasWidth = container.offsetWidth;
    // setup() 的第一句会调用本函数，那时控件尚未创建，必须守卫
    if (typeof fixSel !== 'undefined' && fixSel) {
      fixSel.size(canvasWidth - controlLeft - margin);
    }
  }
}

function charsPerLine() {
  return Math.max(16, Math.floor((canvasWidth - margin * 2) / 14));
}

function wrapCJK(str, n) {
  const out = [];
  let line = '';
  for (const ch of String(str)) {
    line += ch;
    if (line.length >= n) { out.push(line); line = ''; }
  }
  if (line) out.push(line);
  return out;
}

function drawWrapped(str, x, y, n, lineH) {
  noStroke();
  const lines = wrapCJK(str, n);
  for (let i = 0; i < lines.length; i++) text(lines[i], x, y + i * lineH);
  return y + lines.length * lineH;
}