// 工具描述质量与选对率 — Tool Description Quality
// 教学目标：按四项权重为同一工具的六个描述版本打分，与 120 道评测题的选对率对照，
// 判定三道判断题（最高选对率版本 E、质量分高于 D 但选对率低于 D 的版本 F、
// 选对率低于 0.85 的版本共 4 个），并算出 F 的质量分 0.85。
// 规格来源：docs/chapters/06-mcp-tools/index.md 的 tool-description-quality 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：1 个下拉框（题号）+ 1 组单选（答案）或 1 个数字输入框（质量分）+ 3 个按钮，共 3 行
// controlHeight = (3 * 35) + 10 = 115
// drawHeight = 600；canvasHeight = 600 + 115 = 715；iframeHeight = 717
// 行分配：第 1 行题号下拉框 / 第 2 行答案单选组（或质量分输入框）/ 第 3 行按钮

let canvasWidth = 800;
let drawHeight = 600;
let controlHeight = 115;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let defaultTextSize = 16;

// ---- 质量分权重（规格块 Rules）----
const W_TIME = 0.30;      // 时机
const W_EDGE = 0.30;      // 边界
const W_PARAM = 0.25;     // 参数带单位格式
const W_LEN = 0.15;       // 长度项

// ---- 六个描述版本（规格块 Content 表）----
const VERSIONS = [
  { v: 'A', words: 4,   time: false, edge: false, param: false, score: 0.08, hit: 0.55 },
  { v: 'B', words: 38,  time: false, edge: false, param: false, score: 0.08, hit: 0.68 },
  { v: 'C', words: 96,  time: true,  edge: false, param: false, score: 0.45, hit: 0.79 },
  { v: 'D', words: 142, time: true,  edge: true,  param: false, score: 0.75, hit: 0.85 },
  { v: 'E', words: 178, time: true,  edge: true,  param: true,  score: 1.00, hit: 0.91 },
  { v: 'F', words: 412, time: true,  edge: true,  param: true,  score: 0.85, hit: 0.83 }
];

// ---- 四道判断题（前三题来自规格块，第四题为质量分手算）----
const QUESTIONS = [
  {
    no: 1, kind: 'choice', text: '六个版本里选对率最高的（≥ 0.90 视为达标）是哪一个版本',
    options: ['A', 'B', 'C', 'D', 'E', 'F'], answer: 'E',
    fb: 'A 的 4 个字只说了动作，模型无从判断该不该用，选对率 0.55 意味着 40 道负例里错 23 道；' +
        'B 补了完整句子但仍无时机与边界，涨到 0.68，涨的是正例而不是负例；' +
        'C 加了时机涨到 0.79，说明「什么时候该用」的边际收益最大；D 再加反例与边界涨到 0.85；' +
        'E 补齐参数单位格式后到 0.91，是本章实际采用的版本。'
  },
  {
    no: 2, kind: 'choice', text: '质量分高于 D（0.75）但选对率低于 D（0.85）的版本是哪一个',
    options: ['A', 'B', 'C', 'D', 'E', 'F'], answer: 'F',
    fb: 'F 四项齐全但 412 字超过 200 字上限，长度项归零，质量分掉到 0.85，' +
        '选对率从 E 的 0.91 回落到 0.83——多出来的 234 个字里塞的是「调用 order-core v2 接口、' +
        '字段顺序、示例报文」这类实现细节，模型要在一堆无关文本里找那一句何时该用。'
  },
  {
    no: 3, kind: 'choice', text: '选对率低于 0.85 的版本共几个',
    options: ['1', '2', '3', '4', '5', '6'], answer: '4',
    fb: '低于 0.85 的是 A（0.55）、B（0.68）、C（0.79）、F（0.83）共 4 个；D 恰好 0.85 不算低于。'
  },
  {
    no: 4, kind: 'number', text: '版本 F 的质量分是多少（保留两位小数）',
    answer: 0.85, tol: 0.01,
    fb: 'Q = 0.30×1（时机）+ 0.30×1（边界）+ 0.25×1（参数）+ 0.15×0（412 字超过 200 字，长度项归零）= 0.85。'
  }
];

const SUMMARY =
  '四项齐全不等于效果最优：F 的四项标准全中却因为 412 字超出 200 字上限而丢掉长度项，' +
  '质量分 0.85 高于 D 的 0.75，选对率 0.83 却低于 D 的 0.85；' +
  'A 与 B 质量分打平（都是 0.08）但选对率差 0.13。打分规则与实际效果之间存在缺口。';

let qSel, ansRadio, scoreInput;
let submitBtn, resetBtn, revealBtn;

let answers = {};    // no -> 答案原文
let attempts = {};   // no -> 次数
let msgs = {};       // no -> {text, ok}
let correctCount = 0;
let summaryShown = false;

function qualityScore(v) {
  const wLen = v.words > 200 ? 0 : (v.words < 80 ? 0.5 : 1);
  return W_TIME * (v.time ? 1 : 0) + W_EDGE * (v.edge ? 1 : 0) +
         W_PARAM * (v.param ? 1 : 0) + W_LEN * wLen;
}

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  qSel = createSelect();
  qSel.parent(document.querySelector('main'));
  qSel.position(10, drawHeight + 5);
  qSel.size(canvasWidth - 20);
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

  revealBtn = createButton('展示对照结论');
  revealBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  revealBtn.position(220, drawHeight + 78);
  revealBtn.mousePressed(() => { summaryShown = true; });

  refreshWidget();

  describe('交互式评分台：同一工具的六个 description 版本在四项标准上的勾选状态与质量分，' +
    '对照 120 道评测题的选对率，再完成四道判断题。');
}

function refreshWidget() {
  const q = QUESTIONS[parseInt(qSel.value(), 10) - 1];
  // p5 2.x 的 radio.remove() 需要传 value，无参调用不会移除 DOM；这里改用 elt.remove()
  if (typeof ansRadio !== 'undefined' && ansRadio) { ansRadio.elt.remove(); ansRadio = null; }
  if (typeof scoreInput !== 'undefined' && scoreInput) { scoreInput.remove(); scoreInput = null; }

  if (q.kind === 'choice') {
// p5 2.x 的 createRadio 只接受组名，选项必须逐个 .option() 添加
  ansRadio = createRadio('tdq_answer');
    for (const o of q.options) ansRadio.option(o, o);
    ansRadio.parent(document.querySelector('main'));
    ansRadio.position(250, drawHeight + 45);
    // p5 2.x 单选组必须给足宽度，否则每个选项会各占一行撑破画布
    ansRadio.size(660);
    ansRadio.attribute('aria-label', '答案');
    scoreInput = null;
  } else {
    ansRadio = null;
    scoreInput = createInput('', 'number');
    scoreInput.parent(document.querySelector('main'));
    scoreInput.position(250, drawHeight + 45);
    scoreInput.size(100);
    scoreInput.attribute('aria-label', '质量分答案');
    scoreInput.attribute('placeholder', '0.00');
  }
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
  text('工具描述质量与选对率（query_order）', canvasWidth / 2, 10);
  textAlign(LEFT, TOP);
  textSize(defaultTextSize);

  drawFormula(44);
  drawTable(100);
  drawScoreCheck(296);
  drawFeedback(348);
  drawControls();
}

function drawFormula(y) {
  fill(60);
  textSize(14);
  text('质量分 Q = 0.30×时机 + 0.30×边界 + 0.25×参数带单位格式 + 0.15×长度项（四项权重和为 1.00）',
       margin, y);
  text('长度项：字数为 80 到 200 记 1，小于 80 记 0.5，大于 200 记 0。评测集 120 道（正例 / 负例 / 干扰各 40 道）。',
       margin, y + 22);
  fill('black');
}

function drawTable(top) {
  const xs = [30, 80, 140, 235, 320, 415, 485, 555];
  const heads = ['版本', '描述字数', '含使用时机', '含反例与边界', '参数带单位格式', '质量分', '选对率', '按公式重算'];
  textSize(13);
  textStyle(BOLD);
  for (let i = 0; i < heads.length; i++) text(heads[i], xs[i], top);
  stroke(200);
  line(margin, top + 18, canvasWidth - margin, top + 18);
  noStroke();
  textStyle(NORMAL);

  for (let i = 0; i < VERSIONS.length; i++) {
    const v = VERSIONS[i];
    const y = top + 26 + i * 22;
    text(v.v, xs[0], y);
    text(String(v.words), xs[1], y);
    text(yn(v.time), xs[2], y);
    text(yn(v.edge), xs[3], y);
    text(yn(v.param), xs[4], y);
    text(v.score.toFixed(2), xs[5], y);
    text(v.hit.toFixed(2), xs[6], y);
    const calc = qualityScore(v);
    const match = Math.abs(calc - v.score) <= 0.005;
    fill(match ? 110 : 'darkred');
    text(calc.toFixed(2), xs[7], y);
    fill('black');
  }
  textSize(12);
  fill(120);
  const cpl12 = Math.max(16, Math.floor((canvasWidth - margin * 2) / 12));
  drawWrapped('A 与 B 质量分打平（都是 0.08，低于 80 字记 0.5 长度项），但选对率差 0.13；' +
       'E 是本章实际采用版本；F 因 412 字超过 200 字上限导致选对率从 0.91 回落到 0.83。',
       margin, top + 26 + VERSIONS.length * 22 + 6, cpl12, 16);
}

function yn(b) { return b ? '是' : '否'; }

function drawScoreCheck(y) {
  const q = QUESTIONS[3];
  textSize(14);
  fill('black');
  text('质量分手算：版本 E = 0.30+0.30+0.25+0.15 = 1.00；版本 F = 0.30+0.30+0.25+0.15×0 = 0.85' +
       '（第 4 题的输入框用于填写这个值）', margin, y);
}

function drawFeedback(top) {
  const cpl = charsPerLine();
  let y = top;
  textSize(14);
  fill('black');
  text('屏幕提问：把描述写全就一定更好吗？先给六个版本打分，再看 120 道题的实际结果。', margin, y);
  y += 22;
  text('进度：答对 ' + correctCount + ' / ' + QUESTIONS.length + ' 题' +
       '（满分 ' + QUESTIONS.length + ' 分，达到 ' + (QUESTIONS.length - 1) + ' 分视为掌握）', margin, y);
  y += 24;

  const q = QUESTIONS[parseInt(qSel.value(), 10) - 1];
  const m = msgs[q.no];
  if (m) {
    fill(m.ok ? 'darkgreen' : 'darkred');
    text(m.text, margin, y);
    fill('black');
    y += 22;
    y = drawWrapped(q.fb, margin, y, cpl, 18) + 6;
  } else {
    fill(110);
    y = drawWrapped('请在下方面板给出第 ' + q.no + ' 题答案后点「提交答案」，每题两次机会。',
                    margin, y, cpl, 18) + 6;
  }

  if (summaryShown) {
    fill(30);
    y = drawWrapped('排序对照——质量分：E 1.00 > F 0.85 > D 0.75 > C 0.45 > A 0.08 = B 0.08；' +
      '选对率：E 0.91 > D 0.85 > F 0.83 > C 0.79 > B 0.68 > A 0.55。', margin, y, cpl, 18) + 6;
    drawWrapped(SUMMARY, margin, y, cpl, 18);
  }
}

function drawControls() {
  fill('black');
  noStroke();
  textAlign(LEFT, CENTER); // 控件区标签按行垂直居中，避免压住 HTML 控件
  textSize(14);
  text('题号 →', 10, drawHeight + 15);
  const q = QUESTIONS[parseInt(qSel.value(), 10) - 1];
  if (q.kind === 'choice') text('答案 →', 160, drawHeight + 50);
  else text('质量分 →', 160, drawHeight + 50);
  textAlign(LEFT, TOP); // 还原为顶端对齐

}

function submitAnswer() {
  const q = QUESTIONS[parseInt(qSel.value(), 10) - 1];
  let raw, ok;
  if (q.kind === 'choice') {
    raw = ansRadio.value();
    ok = raw === q.answer;
  } else {
    raw = scoreInput.value().trim();
    const v = parseFloat(raw);
    ok = raw !== '' && !isNaN(v) && Math.abs(v - q.answer) <= q.tol;
  }
  answers[q.no] = raw;
  attempts[q.no] = (attempts[q.no] || 0) + 1;
  if (ok) {
    if (!msgs[q.no] || !msgs[q.no].ok) correctCount++;
    msgs[q.no] = { text: '正确，' + standardText(q), ok: true };
  } else if (attempts[q.no] >= 2) {
    msgs[q.no] = { text: '两次机会已用完，本题记为失手。标准答案：' + standardText(q), ok: false };
  } else {
    msgs[q.no] = { text: '还不对，再答一次（还有 ' + (2 - attempts[q.no]) + ' 次机会）。', ok: false };
  }
}

function standardText(q) {
  return q.kind === 'choice' ? q.answer : q.answer.toFixed(2);
}

function resetAll() {
  answers = {};
  attempts = {};
  msgs = {};
  correctCount = 0;
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
      qSel.size(canvasWidth - 20);
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