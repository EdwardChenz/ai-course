// 单 Agent 与多 Agent 的编排成本对比 — Orchestration Cost Tradeoff
// 教学目标：由三个旋钮算多 Agent 单任务成本，并求出使成本首次不超过 0.10 元的上下文重读倍数。
// 规格来源：docs/chapters/07-multi-agent/index.md 的 orchestration-cost-tradeoff 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：3 个滑块（N / C / R）+ 1 个下拉框（题号）+ 3 个按钮 + 2 个数字输入框，共 5 行
// controlHeight = (5 * 35) + 10 = 185
// drawHeight = 500；canvasHeight = 500 + 185 = 685；iframeHeight = 687
// 行分配：第 1 行滑块 N / 第 2 行滑块 C / 第 3 行滑块 R / 第 4 行题号下拉框 + 按钮
//         第 5 行两个输入框（标签动态）

let canvasWidth = 800;
let drawHeight = 500;
let controlHeight = 185;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let sliderLeftMargin = 150;
let defaultTextSize = 16;

// ---- 固定参数（规格块 Content；价格为示意价）----
const TOK_IN_PER_CALL = 2000;
const TOK_OUT_PER_CALL = 300;
const PRICE_IN = 0.004;
const PRICE_OUT = 0.012;
const BASELINE_COST = 0.0348;   // 单 Agent 基线（T = 3, R = 1.0）
const COST_CAP = 0.10;          // 成本上限 元 / 任务

// ---- 三道挑战题（规格块 Content 表，固定顺序）----
const QUESTIONS = [
  {
    no: 1,
    text: '默认配置（N = 4、C = 2、R = 2.0）下多 Agent 的单任务成本是多少元，是单 Agent 基线的几倍',
    slots: [
      { label: '单任务成本（元）', expect: 0.1568, tol: 0.0001 },
      { label: '相对基线倍数', expect: 4.5, tol: 0.05 }
    ],
    hint: 'T = 8；输入 8×2000×2.0 = 32,000 token，输出 8×300 = 2,400 token；' +
          '成本 = 32×0.004 + 2.4×0.012 = 0.1568 元；0.1568 / 0.0348 = 4.5057，保留一位小数为 4.5 倍。',
    answer: '0.1568 元，4.5 倍'
  },
  {
    no: 2,
    text: '固定 N = 4、C = 2，R 在 0.5 的步长网格上首次让成本不超过 0.10 元时，R 取多少、对应成本多少元',
    slots: [
      { label: '重读倍数 R', expect: 1.0, tol: 0.001 },
      { label: '对应成本（元）', expect: 0.0928, tol: 0.0001 }
    ],
    hint: '成本 = 8×(0.008R + 0.0036) = 0.064R + 0.0288 ≤ 0.10，解得 R ≤ 1.1125；网格上最大可行值为 1.0；' +
          '成本 = 0.064 + 0.0288 = 0.0928 元。R 取 1.5 时成本 0.1248 元，已越界。',
    answer: 'R = 1.0，0.0928 元'
  },
  {
    no: 3,
    text: 'N = 4、C = 2 不变，R 从 2.0 降到 1.0 省下多少元，占原成本的百分之多少',
    slots: [
      { label: '省下（元）', expect: 0.0640, tol: 0.0001 },
      { label: '占原成本（%）', expect: 40.8, tol: 0.05 }
    ],
    hint: '0.1568 − 0.0928 = 0.0640 元；0.0640 / 0.1568 = 40.82%，保留一位小数为 40.8%。',
    answer: '0.0640 元，40.8%'
  }
];

let nSlider, cSlider, rSlider;
let qSel;
let startBtn, checkBtn, resetBtn;
let inA, inB;

let mode = 'explore';   // explore | challenge | done
let qIdx = -1;
let attempts = 0;
let correctCount = 0;
let lastMsg = '';
let lastOk = false;

// ---- 模型函数（规格块 Rules）----
function totalCalls() { return nSlider.value() * cSlider.value(); }
function inputTokens() { return totalCalls() * TOK_IN_PER_CALL * rSlider.value(); }
function outputTokens() { return totalCalls() * TOK_OUT_PER_CALL; }
function taskCost() { return inputTokens() / 1000 * PRICE_IN + outputTokens() / 1000 * PRICE_OUT; }
function baselineMultiple() { return taskCost() / BASELINE_COST; }

// ---- 判定工具 ----
const okNum = (raw, expect, tol) => {
  const v = parseFloat(raw);
  return String(raw).trim() !== '' && !isNaN(v) && Math.abs(v - expect) <= tol;
};

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  nSlider = createSlider(2, 8, 4, 1);
  nSlider.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  nSlider.position(sliderLeftMargin, drawHeight + 5);
  nSlider.size(canvasWidth - sliderLeftMargin - margin);
  nSlider.attribute('aria-label', '角色数 N');

  cSlider = createSlider(1, 4, 2, 1);
  cSlider.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  cSlider.position(sliderLeftMargin, drawHeight + 40);
  cSlider.size(canvasWidth - sliderLeftMargin - margin);
  cSlider.attribute('aria-label', '每角色调用次数 C');

  rSlider = createSlider(1.0, 5.0, 2.0, 0.5);
  rSlider.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  rSlider.position(sliderLeftMargin, drawHeight + 75);
  rSlider.size(canvasWidth - sliderLeftMargin - margin);
  rSlider.attribute('aria-label', '上下文重读倍数 R');

  qSel = createSelect();
  qSel.parent(document.querySelector('main'));
  qSel.position(10, drawHeight + 113);
  qSel.size(canvasWidth - 300);
  for (const q of QUESTIONS) qSel.option('挑战题 ' + q.no + '：' + q.text, String(q.no));
  qSel.attribute('aria-label', '题号');

  startBtn = createButton('开始挑战');
  startBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  startBtn.position(canvasWidth - 280, drawHeight + 113);
  startBtn.mousePressed(startChallenge);

  checkBtn = createButton('检查答案');
  checkBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  checkBtn.position(canvasWidth - 195, drawHeight + 113);
  checkBtn.mousePressed(checkAnswer);

  resetBtn = createButton('重来');
  resetBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  resetBtn.position(canvasWidth - 110, drawHeight + 113);
  resetBtn.mousePressed(resetAll);

  inA = createInput('', 'number');
  inA.parent(document.querySelector('main'));
  inA.position(250, drawHeight + 149);
  inA.size(100);
  inA.attribute('aria-label', '第一个答案输入框');
  inA.hide();

  inB = createInput('', 'number');
  inB.parent(document.querySelector('main'));
  inB.position(450, drawHeight + 149);
  inB.size(100);
  inB.attribute('aria-label', '第二个答案输入框');
  inB.hide();

  describe('交互式成本对比台：调节角色数、每角色调用次数与上下文重读倍数，' +
    '实时读出总调用次数、token 与单任务成本，再完成三道手写挑战题。');
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
  text('单 Agent 与多 Agent 的编排成本对比', canvasWidth / 2, 10);
  textAlign(LEFT, TOP);
  textSize(defaultTextSize);

  if (mode === 'explore') drawExplore();
  else drawChallenge();

  drawControls();
}

function drawExplore() {
  const N = nSlider.value(), C = cSlider.value(), R = rSlider.value();
  const T = totalCalls();
  const cost = taskCost();
  const mult = baselineMultiple();

  fill(60);
  textSize(14);
  text('屏幕提问：多 Agent 一上来就是 4.5 倍成本——先看它怎么涨，再算出 0.10 元预算下 R 能取多少。',
       margin, 48);
  fill('black');

  textSize(16);
  text('总调用次数 T = N × C = ' + N + ' × ' + C + ' = ' + T, margin, 80);
  text('输入 token = T × 2000 × R = ' + fmtTok(inputTokens()) +
       '　输出 token = T × 300 = ' + fmtTok(outputTokens()), margin, 106);
  textSize(26);
  fill(cost <= COST_CAP ? 'darkgreen' : 'darkred');
  text('单任务成本 = ' + cost.toFixed(4) + ' 元（上限 ' + COST_CAP.toFixed(2) +
       ' 元，' + (cost <= COST_CAP ? '预算内' : '超预算 ' + (cost - COST_CAP).toFixed(4) + ' 元') + '）',
       margin, 136);
  text('相对单 Agent 基线 ' + BASELINE_COST.toFixed(4) + ' 元 = ' + mult.toFixed(1) + ' 倍',
       margin, 170);
  fill('black');
  textSize(14);

  drawCostCurve(220);
  drawNote(392);
}

function fmtTok(v) { return Math.round(v).toLocaleString('en-US') + ' token'; }

function drawCostCurve(top) {
  const left = margin + 30, right = canvasWidth - margin - 150;
  const h = 110;
  const maxCost = 1.6;
  textSize(13);
  fill('black');
  text('R 的形状（固定当前 N 与 C）：成本随 R 线性增长', left, top - 20);
  stroke(180);
  line(left, top, left, top + h);
  line(left, top + h, right, top + h);
  noStroke();

  // 0.10 元预算线
  const yCap = top + h * (1 - COST_CAP / maxCost);
  stroke(220, 120, 120);
  line(left, yCap, right, yCap);
  noStroke();
  fill(200, 60, 60);
  textSize(11);
  text('0.10 元上限', right + 4, yCap - 6);

  stroke(20, 90, 200);
  noFill();
  beginShape();
  for (let r = 1.0; r <= 5.0 + 1e-9; r += 0.5) {
    const c = (totalCalls() * (TOK_IN_PER_CALL * r / 1000 * PRICE_IN + TOK_OUT_PER_CALL / 1000 * PRICE_OUT));
    vertex(left + (right - left) * (r - 1.0) / 4.0, top + h * (1 - c / maxCost));
  }
  endShape();
  noStroke();

  fill(90);
  textSize(11);
  text('R = 1.0', left - 6, top + h + 4);
  text('R = 5.0', right - 26, top + h + 4);
  const cur = taskCost();
  fill('black');
  textSize(13);
  text('当前 R = ' + rSlider.value().toFixed(1) + ' → ' + cur.toFixed(4) + ' 元（R = 5.0 时为 1.5088 元）',
       left, top + h + 24);
}

function drawNote(y) {
  const cpl = charsPerLine();
  fill(70);
  let yy = drawWrapped('固定参数（不可调）：单次调用平均输入 2,000 token、输出 300 token；' +
    '输入 0.004 元每千 token、输出 0.012 元每千 token（教学估算价，示意价）；' +
    '单 Agent 基线 T = 3、R = 1.0、成本 0.0348 元；成本上限 0.10 元每任务。', margin, y, cpl, 18);
  yy += 6;
  drawWrapped('步数上限 24 次调用、token 上限 120,000；R = 2.0 降到 1.0 只降 40.8%，' +
    '因为重读倍数是一块独立的成本大头——它不改变任务数，只改变每个角色重读多少份共享背景。',
    margin, yy, cpl, 18);
}

function drawChallenge() {
  fill('black');
  noStroke();
  textSize(defaultTextSize);

  if (qIdx >= QUESTIONS.length) {
    text('全部挑战完成：答对 ' + correctCount + ' / ' + QUESTIONS.length + ' 题（满分 3 分，达到 3 分视为掌握）',
         margin, 52);
    textSize(18);
    text('完整演算：', margin, 88);
    textSize(14);
    const cpl = charsPerLine();
    let y = 114;
    y = drawWrapped('第 1 题：N = 4、C = 2 → T = 8；R = 2.0 → 输入 8×2000×2.0 = 32,000 token，' +
      '输出 2,400 token；成本 = 32×0.004 + 2.4×0.012 = 0.1568 元；倍数 = 0.1568 / 0.0348 = 4.5057 → 4.5 倍。',
      margin, y, cpl, 18) + 6;
    y = drawWrapped('第 2 题：0.064R + 0.0288 ≤ 0.10 → R ≤ 1.1125；0.5 步长网格上首次达标取 R = 1.0，' +
      '成本 = 0.064 + 0.0288 = 0.0928 元；R = 1.5 时成本 0.1248 元已越界。', margin, y, cpl, 18) + 6;
    y = drawWrapped('第 3 题：0.1568 − 0.0928 = 0.0640 元；0.0640 / 0.1568 = 40.82% → 40.8%。',
                    margin, y, cpl, 18) + 6;
    drawWrapped('结论：翻 4.5 倍的成本必须换来可度量的质量提升；重读倍数是压缩上下文最直接的抓手。',
                margin, y, cpl, 18);
    return;
  }

  const q = QUESTIONS[qIdx];
  text('挑战题 ' + q.no + ' / ' + QUESTIONS.length + '（累计答对 ' + correctCount + ' 题）', margin, 52);
  textSize(17);
  drawWrapped(q.text, margin, 80, charsPerLine(), 22);
  textSize(14);
  drawWrapped('请在下方两个输入框手写答案后点「检查答案」，每题两次机会。', margin, 118, charsPerLine(), 20);

  if (lastMsg) {
    fill(lastOk ? 'darkgreen' : 'darkred');
    text(lastMsg, margin, 158);
    fill('black');
    if (!lastOk) {
      drawWrapped('提示：' + q.hint, margin, 186, charsPerLine(), 18);
    }
  }
}

function drawControls() {
  fill('black');
  noStroke();
  textAlign(LEFT, CENTER); // 控件区标签按行垂直居中，避免压住 HTML 控件
  textSize(14);
  text('角色数 N: ' + nSlider.value(), 10, drawHeight + 15);
  text('每角色调用次数 C: ' + cSlider.value(), 10, drawHeight + 50);
  text('上下文重读倍数 R: ' + rSlider.value().toFixed(1), 10, drawHeight + 85);

  const on = mode === 'challenge' && qIdx >= 0 && qIdx < QUESTIONS.length;
  if (on) {
    const q = QUESTIONS[qIdx];
    // 标签画在输入框左侧的空隙里，避免与 HTML 输入框重叠
    text(q.slots[0].label, 10, drawHeight + 158);
    text(q.slots[1].label, 345, drawHeight + 158);
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
  inA.value('');
  inB.value('');
  inA.show();
  inB.show();
}

function checkAnswer() {
  if (mode !== 'challenge' || qIdx < 0 || qIdx >= QUESTIONS.length) return;
  const q = QUESTIONS[qIdx];
  attempts++;
  const okA = okNum(inA.value(), q.slots[0].expect, q.slots[0].tol);
  const okB = okNum(inB.value(), q.slots[1].expect, q.slots[1].tol);

  if (okA && okB) {
    correctCount++;
    lastOk = true;
    lastMsg = '正确，' + q.answer;
    advance();
  } else if (attempts >= 2) {
    lastOk = false;
    lastMsg = '两次机会已用完，本题记为失手。标准答案：' + q.answer;
    advance();
  } else {
    lastOk = false;
    lastMsg = '还不对，再算一次（还有 ' + (2 - attempts) + ' 次机会）。';
  }
}

function advance() {
  inA.value('');
  inB.value('');
  qIdx++;
  attempts = 0;
  if (qIdx >= QUESTIONS.length) {
    inA.hide();
    inB.hide();
  }
}

function resetAll() {
  mode = 'explore';
  qIdx = -1;
  attempts = 0;
  correctCount = 0;
  lastMsg = '';
  lastOk = false;
  inA.value('');
  inB.value('');
  inA.hide();
  inB.hide();
  nSlider.value(4);
  cSlider.value(2);
  rSlider.value(2.0);
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
    if (typeof nSlider !== 'undefined' && nSlider) {
      const w = canvasWidth - sliderLeftMargin - margin;
      nSlider.size(w);
      cSlider.size(w);
      rSlider.size(w);
      qSel.size(canvasWidth - 300);
      startBtn.position(canvasWidth - 280, drawHeight + 113);
      checkBtn.position(canvasWidth - 195, drawHeight + 113);
      resetBtn.position(canvasWidth - 110, drawHeight + 113);
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