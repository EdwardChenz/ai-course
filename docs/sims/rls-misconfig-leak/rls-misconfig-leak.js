// RLS 漏配导致的数据越权 — RLS Misconfig Leak
// 教学目标：逐表预测 8 张业务表在当前配置下普通客服能读到的行数，算出合计泄漏行数，
// 并指出 attachments 的 0 行属于失败即拒绝而非越权。
// 规格来源：docs/chapters/09-backend-integration/index.md 的 rls-misconfig-leak 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：1 个下拉框（题号）+ 1 组单选（表数 / 故障归类）+ 3 个按钮 + 2 个数字输入框，共 3 行
// controlHeight = (3 * 35) + 10 = 115
// drawHeight = 520；canvasHeight = 520 + 115 = 635；iframeHeight = 637
// 行分配：第 1 行题号下拉框 / 第 2 行单选组 / 第 3 行按钮 + 两个数字输入框

let canvasWidth = 800;
let drawHeight = 520;
let controlHeight = 115;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let defaultTextSize = 16;

// ---- 八张业务表（规格块 Content 表）----
const TABLES = [
  { no: 1, name: 'conversations',  expect: 6000,   cfg: '已开启，读写策略齐全',        actual: 6000,   fault: '正常' },
  { no: 2, name: 'messages',       expect: 84000,  cfg: '已开启，读策略齐全、插入策略漏写', actual: 84000, fault: '读正常，写被拒' },
  { no: 3, name: 'knowledge_items', expect: 62000, cfg: '已开启，策略齐全',           actual: 62000,  fault: '正常' },
  { no: 4, name: 'tool_calls',     expect: 137000, cfg: '忘了开启',                 actual: 411000, fault: '越权' },
  { no: 5, name: 'leads',          expect: 620,    cfg: '已开启，策略齐全',           actual: 620,    fault: '正常' },
  { no: 6, name: 'orders',         expect: 1400,   cfg: '已开启，策略齐全',           actual: 1400,   fault: '正常' },
  { no: 7, name: 'attachments',    expect: 300,    cfg: '已开启，策略里 tenant_id 写成 id', actual: 0, fault: '失败即拒绝' },
  { no: 8, name: 'audit_logs',     expect: 32000,  cfg: '忘了开启',                 actual: 96000,  fault: '越权' }
];

// ---- 三道题（规格块 Content 表，固定顺序）----
const QUESTIONS = [
  {
    no: 1, kind: 'combo', text: '8 张表里越权的共几张、合计泄漏多少行',
    radioLabel: '越权表数', radioOptions: ['0 张', '1 张', '2 张', '3 张', '4 张'], radioAnswer: '2 张',
    numLabels: ['泄漏行数', ''], numAnswers: [338000], numTol: [1000, 0],
    hint: '序号 4 泄漏 411,000 − 137,000 = 274,000 行，序号 8 泄漏 96,000 − 32,000 = 64,000 行，两者相加 338,000。',
    answer: '2 张，338,000 行'
  },
  {
    no: 2, kind: 'fault', text: 'attachments 读到 0 行，属于越权故障还是可用性故障',
    radioLabel: '故障归类', radioOptions: ['越权故障', '可用性故障'], radioAnswer: '可用性故障',
    numLabels: ['', ''], numAnswers: [], numTol: [],
    hint: '策略条件恒为假，数据库直接拒绝返回，把越权挡住了——这是失败即拒绝的正常表现。',
    answer: '可用性故障'
  },
  {
    no: 3, kind: 'number', text: '若给 tool_calls 补上 for select 策略但仍然漏掉开启，实际可见行数是多少',
    radioLabel: '（本题无需单选）', radioOptions: ['忽略本题'], radioAnswer: '忽略本题',
    numLabels: ['实际可见行数', ''], numAnswers: [411000], numTol: [0, 0],
    hint: '漏掉开启就等于没开 RLS，补策略不改变任何事，这正是序号 4 的成因。',
    answer: '411,000 行'
  }
];

const SUMMARY =
  '本租户应见 323,320 行、实际可见 661,020 行、泄漏 338,000 行、少读 300 行。' +
  '漏开启的表比写错的表危险得多，因为前者不产生任何报错：序号 4 与 8 的症状都是行数正好等于全库的三倍，' +
  '说明跨租户数据被完整返回。序号 7 相反，它一行也没漏出去，是因为策略引用了一个不该引用的列，条件恒假被数据库拒掉。' +
  '序号 2 是最容易被忽略的一类：读完全正常，但 Agent 往会话里写工具结果时会被拒绝，' +
  '表现为「问答能答、一调工具就 500」，很容易被误判成工具本身有问题。' +
  '真正危险的顺序是：漏配的表越权读出别人的数据，用户一截图，事后才发现；' +
  '正确次序是先跑那条「用别人的令牌数一遍」的检查，把 0 行泄漏变成发布的前置条件。';

let qSel, radio;
let submitBtn, resetBtn;
let numA, numB;

let msgs = {};        // no -> {text, ok}
let attempts = {};    // no -> 次数
let correctCount = 0;
let allDone = false;
let summaryShown = false;

// ---- 模型函数（规格块 Rules）----
function leakRows() {
  return TABLES.reduce((a, t) => a + Math.max(0, t.actual - t.expect), 0);
}
function leakTables() { return TABLES.filter(t => t.actual - t.expect > 0).length; }
function visibilityRate(t) { return t.actual / t.expect; }

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  qSel = createSelect();
  qSel.parent(document.querySelector('main'));
  qSel.position(110, drawHeight + 5);
  qSel.size(canvasWidth - 120);
  for (const q of QUESTIONS) qSel.option('第 ' + q.no + ' 题：' + q.text, String(q.no));
  qSel.attribute('aria-label', '题号');
  qSel.changed(refreshWidget);

  submitBtn = createButton('提交答案');
  submitBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  submitBtn.position(10, drawHeight + 78);
  submitBtn.mousePressed(submitAnswer);

  resetBtn = createButton('重来');
  resetBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  resetBtn.position(120, drawHeight + 78);
  resetBtn.mousePressed(resetAll);

  refreshWidget();

  describe('交互式越权排查台：八张业务表的本租户应有行数与当前配置。' +
    '先预测越权表数与泄漏行数、归类零行故障、补策略但不开启的后果，再揭晓实际可见行数。');
}

function refreshWidget() {
  const q = currentQ();
  // p5 2.x 的 radio.remove() 需要传 value，无参调用不会移除 DOM；这里改用 elt.remove()
  if (typeof radio !== 'undefined' && radio) { radio.elt.remove(); radio = null; }
// p5 2.x 的 createRadio 只接受组名，选项必须逐个 .option() 添加
  radio = createRadio('rls_answer');
  for (const o of q.radioOptions) radio.option(o, o);
  radio.parent(document.querySelector('main'));
  radio.position(230, drawHeight + 42);
  // p5 2.x 单选组必须给足宽度，否则每个选项会各占一行撑破画布
  radio.size(320);
  radio.attribute('aria-label', q.radioLabel);

  if (typeof numA !== 'undefined' && numA) { numA.remove(); numA = null; }
  if (typeof numB !== 'undefined' && numB) { numB.remove(); numB = null; }
  if (q.numLabels[0]) {
    numA = makeInput('第 ' + q.no + ' 题：' + q.numLabels[0] + ' 答案', 430, drawHeight + 79, 110);
    if (q.numLabels[1]) numB = makeInput('第 ' + q.no + ' 题：' + q.numLabels[1] + ' 答案', 620, drawHeight + 79, 110);
  }
}

function makeInput(label, x, y, w) {
  const el = createInput('', 'number');
  el.parent(document.querySelector('main'));
  el.position(x, y);
  el.size(w);
  el.attribute('aria-label', label);
  return el;
}

function currentQ() {
  return QUESTIONS[parseInt(qSel.value(), 10) - 1];
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
  text('RLS 漏配导致的数据越权', canvasWidth / 2, 10);
  textAlign(LEFT, TOP);
  textSize(defaultTextSize);

  drawTable(56);
  drawFeedback(300);
  drawControls();
}

function drawTable(top) {
  fill(60);
  textSize(14);
  text('屏幕提问：8 张表里两张忘了开策略，一张条件写错——先猜越权了多少行，再看哪张表最先露馅。',
       margin, top - 14);

  const xs = [28, 60, 168, 270, 500, 570];
  const heads = ['序号', '表', '本租户应有行数', '当前配置', '实际可见行数', '故障类型'];
  textSize(13);
  textStyle(BOLD);
  for (let i = 0; i < heads.length; i++) text(heads[i], xs[i], top);
  stroke(200);
  line(margin, top + 18, canvasWidth - margin, top + 18);
  noStroke();
  textStyle(NORMAL);

  for (let i = 0; i < TABLES.length; i++) {
    const t = TABLES[i];
    const y = top + 24 + i * 22;
    text(String(t.no), xs[0], y);
    text(t.name, xs[1], y);
    text(fmtRows(t.expect), xs[2], y);
    textSize(12);
    text(t.cfg, xs[3], y);
    textSize(13);
    if (allDone) {
      text(fmtRows(t.actual), xs[4], y);
      const bad = t.actual > t.expect;
      fill(bad ? 'darkred' : (t.actual < t.expect ? 'darkorange' : 'darkgreen'));
      text(t.fault, xs[5], y);
      fill('black');
    } else {
      fill(130);
      text('待揭晓', xs[4], y);
      text('—', xs[5], y);
      fill('black');
    }
  }

  textSize(12);
  fill(120);
  const cpl12 = Math.max(16, Math.floor((canvasWidth - margin * 2) / 12));
  drawWrapped('越权泄漏行数 = 实际可见行数 − 本租户应有行数，仅对实际值大于应有值的行求和，零行不计入泄漏；' +
    '实际可见行数 < 应有行数判为可用性故障。附件行可见率 ' + visibilityRate(TABLES[6]).toFixed(2) + '。',
    margin, top + 24 + TABLES.length * 22 + 6, cpl12, 16);
}

function fmtRows(v) { return v.toLocaleString('en-US'); }

function drawFeedback(top) {
  const cpl = charsPerLine();
  let y = top;
  textSize(14);
  fill('black');
  const q = currentQ();
  text('第 ' + q.no + ' 题：' + q.text, margin, y);
  y += 22;

  const m = msgs[q.no];
  if (m) {
    fill(m.ok ? 'darkgreen' : 'darkred');
    text(m.text, margin, y);
    fill('black');
    y += 22;
    y = drawWrapped(q.hint, margin, y, cpl, 18) + 6;
  } else {
    fill(110);
    text('请在下方给出答案后点「提交答案」，每题两次机会。', margin, y);
    y += 22;
  }

  if (allDone || summaryShown) {
    fill(30);
    text('揭晓：本租户应见 323,320 行、实际可见 661,020 行、泄漏 ' + fmtRows(leakRows()) +
         ' 行（' + leakTables() + ' 张越权）、少读 300 行。', margin, y);
    y += 22;
    drawWrapped(SUMMARY, margin, y, cpl, 18);
  } else {
    fill(30);
    text('累计答对 ' + correctCount + ' / 3 题（满分 3 分，答对 2 分视为掌握）', margin, y);
  }
}

function drawControls() {
  fill('black');
  noStroke();
  textAlign(LEFT, CENTER); // 控件区标签按行垂直居中，避免压住 HTML 控件
  textSize(14);
  text('题号 →', 10, drawHeight + 15);
  const q = currentQ();
  // 标签画在输入框与单选组左侧的空隙里，避免与 HTML 控件重叠
  text(q.radioLabel, 10, drawHeight + 50);
  if (q.numLabels[0]) text(q.numLabels[0], 350, drawHeight + 88);
  textAlign(LEFT, TOP); // 还原为顶端对齐

}

function submitAnswer() {
  const q = currentQ();
  attempts[q.no] = (attempts[q.no] || 0) + 1;

  let allOk = true;
  if (q.kind === 'combo' || q.kind === 'fault') {
    if (radio.value() !== q.radioAnswer) allOk = false;
  }
  if (q.kind === 'number') {
    const raw = numA.value().trim();
    const v = parseFloat(raw);
    if (raw === '' || isNaN(v) || Math.abs(v - q.numAnswers[0]) > q.numTol[0]) allOk = false;
  }

  if (allOk) {
    correctCount++;
    msgs[q.no] = { text: '正确，' + q.answer, ok: true };
  } else if (attempts[q.no] >= 2) {
    msgs[q.no] = { text: '两次机会已用完，本题记为失手。标准答案：' + q.answer, ok: false };
  } else {
    msgs[q.no] = { text: '还不对，再答一次（还有 ' + (2 - attempts[q.no]) + ' 次机会）。', ok: false };
  }

  if (QUESTIONS.every(x => msgs[x.no])) {
    allDone = true;
    summaryShown = true;
  }
}

function resetAll() {
  msgs = {};
  attempts = {};
  correctCount = 0;
  allDone = false;
  summaryShown = false;
  qSel.value('1');
  refreshWidget();
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
    if (typeof qSel !== 'undefined' && qSel) {
      qSel.size(canvasWidth - 120);
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