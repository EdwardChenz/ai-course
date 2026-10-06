// 召回条数与上下文预算的权衡 — Recall TopK Tradeoff
// 教学目标：由正确块名次分布算 recall@K，并在命中率 ≥ 0.67 的前提下选出成本最小的 M。
// 规格来源：docs/chapters/03-rag-basics/index.md 的 recall-topk-tradeoff 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：2 个滑块（K / M）+ 3 个按钮 + 4 个数字输入框，共 4 行
// controlHeight = (4 * 35) + 10 = 150
// drawHeight = 470；canvasHeight = 470 + 150 = 620；iframeHeight = 622
// 行分配：第 1 行滑块 K / 第 2 行滑块 M / 第 3 行按钮 + 输入框 recall 与 K值
//         第 4 行输入框 M值 与 单次成本

let canvasWidth = 800;
let drawHeight = 470;
let controlHeight = 150;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let sliderLeftMargin = 150;
let defaultTextSize = 16;

// ---- 固定参数（规格块 Rules；价格为示意价）----
const CHUNK_TOKENS = 400;        // 块大小 token
const PRICE_IN = 0.004;          // 元 / 千输入 token（教学示意价）
const TARGET_1 = 0.90;           // 第 2 题达标线
const TARGET_3 = 0.67;           // 第 3 题达标线
const TOTAL_Q = 100;             // 评测题总数

// 正确块名次分布（规格块 Content 表，合成数据，随机种子 20261006）
const RANKS = [
  { lo: 1,  hi: 1,  cnt: 35 },
  { lo: 2,  hi: 5,  cnt: 19 },
  { lo: 6,  hi: 10, cnt: 13 },
  { lo: 11, hi: 20, cnt: 13 },
  { lo: 21, hi: 30, cnt: 8 },
  { lo: 31, hi: 50, cnt: 5 },
  { lo: 51, hi: 100, cnt: 7 }
];

// 挑战题（规格块 Content 表，固定顺序）
const CHALLENGES = [
  {
    title: 'K 取 20 时 recall@20 是多少',
    need: ['recall'],
    expect: { recall: 0.80 },
    tol: { recall: 0.005 },
    hint: '名次 1 到 20 共 35 + 19 + 13 + 13 = 80 道，80 / 100 = 0.80。'
  },
  {
    title: '在 K 取 5、10、20、30、50、100 中，recall@K 首次达到 0.90 的 K 是多少',
    need: ['kval'],
    expect: { kval: 50 },
    tol: { kval: 0 },
    hint: 'K = 30 时为 88 / 100 = 0.88，未达标；K = 50 时为 93 / 100 = 0.93，首次达标。'
  },
  {
    title: '要求命中率不低于 0.67 时，最小的 M 是多少，单次上下文成本多少元',
    need: ['mval', 'cost'],
    expect: { mval: 10, cost: 0.0160 },
    tol: { mval: 0, cost: 0.0001 },
    hint: 'M = 10 时命中率为 67 / 100 = 0.67，成本 = 10 × 400 / 1000 × 0.004 = 0.0160 元；' +
          'M = 20 命中率升到 0.80 但成本翻倍到 0.0320 元。'
  }
];

let kSlider, mSlider;
let startBtn, checkBtn, resetBtn;
let recallInput, kvalInput, mvalInput, costInput;

let mode = 'explore';     // explore | challenge | done
let qIdx = -1;
let attempts = 0;
let correctCount = 0;
let lastMsg = '';
let lastOk = false;

// ---- 模型函数（规格块 Rules）----
function hitCount(K) {
  let n = 0;
  for (const r of RANKS) if (r.lo <= K) n += r.cnt;
  return n;
}
function recallAt(K) { return hitCount(K) / TOTAL_Q; }
function ctxCost(M) { return M * CHUNK_TOKENS / 1000 * PRICE_IN; }

// ---- 判定工具 ----
const okNum = (raw, expect, tol) => {
  const v = parseFloat(raw);
  return String(raw).trim() !== '' && !isNaN(v) && Math.abs(v - expect) <= tol;
};

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  kSlider = createSlider(5, 100, 20, 5);
  kSlider.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  kSlider.position(sliderLeftMargin, drawHeight + 5);
  kSlider.size(canvasWidth - sliderLeftMargin - margin);
  kSlider.attribute('aria-label', '召回条数 K');

  mSlider = createSlider(1, 20, 5, 1);
  mSlider.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  mSlider.position(sliderLeftMargin, drawHeight + 40);
  mSlider.size(canvasWidth - sliderLeftMargin - margin);
  mSlider.attribute('aria-label', '送模型条数 M');

  startBtn = createButton('开始挑战');
  startBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  startBtn.position(10, drawHeight + 78);
  startBtn.mousePressed(startChallenge);

  checkBtn = createButton('检查答案');
  checkBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  checkBtn.position(120, drawHeight + 78);
  checkBtn.mousePressed(checkAnswer);

  resetBtn = createButton('重来');
  resetBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  resetBtn.position(230, drawHeight + 78);
  resetBtn.mousePressed(resetAll);

  recallInput = makeNumInput('第 1 题 recall@20 答案', 320, drawHeight + 79, 90, '0.80');
  kvalInput = makeNumInput('第 2 题首次达标 K 的答案', 480, drawHeight + 79, 90, 'K');
  mvalInput = makeNumInput('第 3 题最小 M 的答案', 150, drawHeight + 114, 90, 'M');
  costInput = makeNumInput('第 3 题单次上下文成本的答案，单位元', 320, drawHeight + 114, 110, '元');

  describe('交互式权衡台：拖动召回条数 K 与送模型条数 M，观察 recall@K 曲线与单次上下文成本的实时读数，' +
    '并完成三道手写挑战题。');
}

function makeNumInput(label, x, y, w, ph) {
  const el = createInput('', 'number');
  el.parent(document.querySelector('main'));
  el.position(x, y);
  el.size(w);
  el.attribute('aria-label', label);
  el.attribute('placeholder', ph);
  el.hide();
  return el;
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
  text('召回条数与上下文预算的权衡', canvasWidth / 2, 10);
  textAlign(LEFT, TOP);
  textSize(defaultTextSize);

  if (mode === 'explore') drawExplore();
  else drawChallenge();

  drawControls();
}

function drawExplore() {
  const K = kSlider.value(), M = mSlider.value();
  const rK = recallAt(K), rM = recallAt(M), cost = ctxCost(M);
  const base = ctxCost(5);

  fill('black');
  noStroke();
  text('召回率已经 ' + rK.toFixed(2) + ' 了，再加大 K 到底值不值？先看曲线，再算这笔账。',
       margin, 52);

  // ---- recall@K 曲线 ----
  drawCurve(80, 250);

  // ---- 名次分布表 ----
  textSize(13);
  let ty = 296;
  text('正确块名次分布（100 道题）', margin, ty);
  ty += 20;
  for (const r of RANKS) {
    const label = r.lo === r.hi ? String(r.lo) : r.lo + ' 到 ' + (r.hi === 100 ? '50 以后' : r.hi);
    text(label + ' 名：' + r.cnt + ' 道', margin + 10, ty);
    ty += 18;
  }

  // ---- 读数区 ----
  const rx = margin + 190;
  textSize(15);
  text('K = ' + K + ' → recall@K = ' + rK.toFixed(2), rx, 296);
  text('M = ' + M + ' → 命中率 recall@M = ' + rM.toFixed(2), rx, 322);
  text('单次上下文成本 = M × 400 / 1000 × 0.004 = ' + cost.toFixed(4) + ' 元（示意价）', rx, 348);
  text('相对 K = 20 / M = 5 基线（0.0080 元）：' + (cost - base >= 0 ? '+' : '') +
       (cost - base).toFixed(4) + ' 元', rx, 374);
  text('K = 20 以后 recall@K 曲线明显变平；成本随 M 线性增长。', rx, 400);
}

function drawCurve(top, h) {
  const left = margin + 40, right = canvasWidth - margin - 20;
  const w = right - left;
  stroke(180);
  line(left, top, left, top + h);
  line(left, top + h, right, top + h);
  noStroke();

  // 达标参考线 0.90
  const y90 = top + h * (1 - TARGET_1);
  stroke(220, 120, 120);
  line(left, y90, right, y90);
  noStroke();
  fill(200, 60, 60);
  textSize(12);
  text('0.90 达标线', right - 80, y90 - 14);

  stroke(20, 90, 200);
  noFill();
  beginShape();
  for (let K = 5; K <= 100; K += 5) {
    const x = left + w * (K - 5) / 95;
    const y = top + h * (1 - recallAt(K));
    vertex(x, y);
  }
  endShape();
  noStroke();
  fill(20, 90, 200);
  const cx = left + w * (kSlider.value() - 5) / 95;
  const cy = top + h * (1 - recallAt(kSlider.value()));
  circle(cx, cy, 7);

  fill(90);
  textSize(12);
  text('K = 5', left - 6, top + h + 4);
  text('K = 100', right - 30, top + h + 4);
  text('1.00', left - 34, top - 4);
}

function drawChallenge() {
  fill('black');
  noStroke();
  textSize(defaultTextSize);

  if (qIdx >= CHALLENGES.length) {
    text('全部挑战完成：答对 ' + correctCount + ' / ' + CHALLENGES.length + ' 题', margin, 56);
    textSize(18);
    text('完整推导：', margin, 96);
    textSize(14);
    const cpl = charsPerLine();
    let y = 124;
    y = drawWrapped('recall@20 = (35 + 19 + 13 + 13) / 100 = 0.80；recall@30 = 88 / 100 = 0.88 未达标；' +
      'recall@50 = 93 / 100 = 0.93 为首次达标，所以第 2 题取 K = 50。', margin, y, cpl, 18) + 6;
    y = drawWrapped('第 3 题：命中率不低于 0.67 的最小 M 是 10（recall@10 = 67 / 100 = 0.67），' +
      '单次上下文成本 = 10 × 400 / 1000 × 0.004 = 0.0160 元；M = 20 命中率 0.80 但成本 0.0320 元。',
      margin, y, cpl, 18) + 6;
    y = drawWrapped('结论：准确率 0.54 与 recall@20 = 0.80 之间那 0.26 的缺口对应 26 道题，' +
      '这是重排要救的部分；K 超过 20 之后边际收益明显变平。', margin, y, cpl, 18) + 6;
    text('点「重来」可重新挑战。', margin, y + 6);
    return;
  }

  const ch = CHALLENGES[qIdx];
  text('挑战题 ' + (qIdx + 1) + ' / ' + CHALLENGES.length + '（累计答对 ' + correctCount + ' 题）', margin, 56);
  textSize(17);
  text(ch.title, margin, 86);
  textSize(defaultTextSize);
  drawWrapped('请在下方输入框手写答案后点「检查答案」，每题两次机会。', margin, 114, charsPerLine(), 20);

  if (lastMsg) {
    fill(lastOk ? 'darkgreen' : 'darkred');
    text(lastMsg, margin, 150);
    fill('black');
    if (!lastOk) {
      drawWrapped('提示：' + ch.hint, margin, 178, charsPerLine(), 18);
    }
  }
}

function drawControls() {
  fill('black');
  noStroke();
  textAlign(LEFT, CENTER); // 控件区标签按行垂直居中，避免压住 HTML 控件
  textSize(14);
  text('召回条数 K: ' + kSlider.value(), 10, drawHeight + 15);
  text('送模型条数 M: ' + mSlider.value(), 10, drawHeight + 50);
  const on = mode === 'challenge' && qIdx < CHALLENGES.length;
  // 标签画在输入框左侧的空隙里，避免与 HTML 输入框重叠
  if (on) {
    const ch = CHALLENGES[qIdx];
    if (ch.need.indexOf('recall') >= 0) text('recall', 256, drawHeight + 88);
    if (ch.need.indexOf('kval') >= 0) text('K 值', 450, drawHeight + 88);
    if (ch.need.indexOf('mval') >= 0) text('最小 M', 105, drawHeight + 123);
    if (ch.need.indexOf('cost') >= 0) text('成本元', 265, drawHeight + 123);
  }
  textAlign(LEFT, TOP); // 还原为顶端对齐

}

function startChallenge() {
  mode = 'challenge';
  qIdx = 0;
  attempts = 0;
  correctCount = 0;
  lastMsg = '';
  lastOk = false;
  clearInputs();
  showInputs();
}

function clearInputs() {
  recallInput.value(''); kvalInput.value('');
  mvalInput.value(''); costInput.value('');
}

function showInputs() {
  recallInput.hide(); kvalInput.hide(); mvalInput.hide(); costInput.hide();
  if (qIdx >= CHALLENGES.length || qIdx < 0) return;
  const need = CHALLENGES[qIdx].need;
  if (need.indexOf('recall') >= 0) recallInput.show();
  if (need.indexOf('kval') >= 0) kvalInput.show();
  if (need.indexOf('mval') >= 0) mvalInput.show();
  if (need.indexOf('cost') >= 0) costInput.show();
}

function checkAnswer() {
  if (mode !== 'challenge' || qIdx < 0 || qIdx >= CHALLENGES.length) return;
  const ch = CHALLENGES[qIdx];
  attempts++;

  let allOk = true;
  for (const slot of ch.need) {
    const raw = readSlot(slot);
    if (!okNum(raw, ch.expect[slot], ch.tol[slot])) allOk = false;
  }

  if (allOk) {
    correctCount++;
    lastOk = true;
    lastMsg = '正确，' + expectedText(ch);
    advance();
  } else if (attempts >= 2) {
    lastOk = false;
    lastMsg = '两次机会已用完，本题记为失手。标准答案：' + expectedText(ch);
    advance();
  } else {
    lastOk = false;
    lastMsg = '还不对，再算一次（还有 ' + (2 - attempts) + ' 次机会）。';
  }
}

function readSlot(slot) {
  if (slot === 'recall') return recallInput.value().trim();
  if (slot === 'kval') return kvalInput.value().trim();
  if (slot === 'mval') return mvalInput.value().trim();
  if (slot === 'cost') return costInput.value().trim();
  return '';
}

function expectedText(ch) {
  if (ch.expect.recall !== undefined) return 'recall@20 = 0.80';
  if (ch.expect.kval !== undefined) return '首次达到 0.90 的 K = 50';
  return '最小 M = 10，单次上下文成本 0.0160 元';
}

function advance() {
  clearInputs();
  qIdx++;
  attempts = 0;
  showInputs();
}

function resetAll() {
  mode = 'explore';
  qIdx = -1;
  attempts = 0;
  correctCount = 0;
  lastMsg = '';
  lastOk = false;
  clearInputs();
  recallInput.hide(); kvalInput.hide(); mvalInput.hide(); costInput.hide();
  kSlider.value(20);
  mSlider.value(5);
}

function windowResized() {
  updateCanvasSize();
  resizeCanvas(canvasWidth, canvasHeight);
}

function updateCanvasSize() {
  const container = document.querySelector('main');
  if (container) {
    canvasWidth = container.offsetWidth;
    // setup() 的第一句会调用本函数，那时滑块尚未创建，必须守卫
    if (typeof kSlider !== 'undefined' && kSlider) {
      const w = canvasWidth - sliderLeftMargin - margin;
      kSlider.size(w);
      mSlider.size(w);
    }
  }
}

function charsPerLine() {
  return Math.max(16, Math.floor((canvasWidth - margin * 2) / defaultTextSize));
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