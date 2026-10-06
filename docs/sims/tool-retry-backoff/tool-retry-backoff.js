// 重试次数与熔断联动的收益账 — Tool Retry Backoff
// 教学目标：调节重试次数与熔断联动开关，算出四种方案的总耗时上限与最终成功率，
// 并在 5000 毫秒用户等待预算下选出方案 B（3400 毫秒 / 0.910）。
// 规格来源：docs/chapters/06-mcp-tools/index.md 的 tool-retry-backoff 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：1 个滑块（k）+ 1 个复选框（熔断联动）+ 3 个按钮 + 4 个输入框，共 4 行
// controlHeight = (4 * 35) + 10 = 150
// drawHeight = 500；canvasHeight = 500 + 150 = 650；iframeHeight = 652
// 行分配：第 1 行滑块 k / 第 2 行复选框熔断联动 / 第 3 行按钮 + 方案 + 耗时
//         第 4 行成功率 + 占比

let canvasWidth = 800;
let drawHeight = 500;
let controlHeight = 150;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let sliderLeftMargin = 150;
let defaultTextSize = 16;

// ---- 固定参数（规格块 Content）----
const CALL_TIMEOUT = 800;   // 单次调用超时上限（毫秒）
const P_FAIL = 0.30;        // 单次失败率
const BACKOFF_BASE = 200;   // 退避基数（毫秒）
const BACKOFF_MUL = 4;      // 退避倍数
const JITTER = 0.25;        // 抖动上下 25%
const BUDGET_MS = 5000;     // 用户等待预算（毫秒）
const CB_WINDOW_S = 60;     // 熔断 60 秒窗口
const CB_MIN_SAMPLES = 20;  // 熔断窗口内样本下限
const CB_FAIL_RATE = 0.50;  // 熔断失败率阈值

// ---- 四种方案（规格块 Content 表）----
const PLANS = [
  { id: 'A', k: 0, note: '1 次调用',       success: 0.700, cost: 800,   inBudget: true },
  { id: 'B', k: 2, note: '3 次调用',       success: 0.910, cost: 3400,  inBudget: true },
  { id: 'C', k: 3, note: '4 次调用',       success: 0.973, cost: 7400,  inBudget: false },
  { id: 'D', k: 2, note: '3 次调用（熔断联动）', success: 0.910, cost: 3400, inBudget: true }
];
const PLAN_BEST_IN_BUDGET = 'B';
const PLAN_BEST_SUCCESS = 'C';

// ---- 三道挑战题（规格块 Content 表，固定顺序）----
const QUESTIONS = [
  {
    no: 1, text: '在 5000 毫秒用户等待预算下，本章应选哪个方案，写出它的总耗时上限与最终成功率',
    slots: ['plan', 'cost', 'success'], expect: { plan: 'B', cost: 3400, success: 0.910 },
    tol: { cost: 0, success: 0.001 },
    hint: '方案 C 成功率更高但总耗时 7400 毫秒已超预算；方案 B 为 3 次调用 × 800 毫秒加 1000 毫秒退避等于 3400 毫秒，成功率为 1 − 0.30 的 3 次方即 0.910。',
    answer: '方案 B，3400 毫秒，0.910'
  },
  {
    no: 2, text: '四个方案里成功率最高的是哪个方案，它的总耗时上限是多少，是否可以用',
    slots: ['plan', 'cost', 'success'], expect: { plan: 'C', cost: 7400, success: 0.973 },
    tol: { cost: 0, success: 0.001 },
    hint: '1 − 0.30 的 4 次方等于 0.973，是四者最高；但 4 次调用 × 800 毫秒加 4200 毫秒退避等于 7400 毫秒，超过 5000 毫秒预算 2400 毫秒，不可用。',
    answer: '方案 C，7400 毫秒，0.973，不可用（超预算 2400 毫秒）'
  },
  {
    no: 3, text: '方案 B 的总耗时中，退避等待占比是多少，保留三位小数',
    slots: ['ratio'], expect: { ratio: 0.294 }, tol: { ratio: 0.001 },
    hint: '1000 毫秒除以 3400 毫秒等于 0.294，说明近三成时间花在等而不是在执行。',
    answer: '0.294'
  }
];

const FEEDBACK =
  '重试把成功率从 0.700 抬到 0.910，代价是耗时从 800 毫秒涨到 3400 毫秒；第三次重试还能再捞 0.063 的成功率（0.910 到 0.973），' +
  '但要多花 4000 毫秒，这笔买卖在任何交互式场景里都不划算。方案 B 有一个常被忽略的属性：它 3400 毫秒里有 1000 毫秒是纯等待，' +
  '占比 0.294，把这部分消掉能直接换来首字延迟的改善——所以本地重试优于把等待丢给上游队列。' +
  '方案 D 的价值不在正常路径，而在故障路径：熔断打开时 800 毫秒就能返回错误，' +
  '避免 60 秒窗口内每一次调用都白等 3400 毫秒。';

let kSlider, cbCheck;
let startBtn, checkBtn, resetBtn;
let planInput, costInput, successInput, ratioInput;

let mode = 'explore';   // explore | challenge | done
let qIdx = -1;
let attempts = 0;
let correctCount = 0;
let lastMsg = '';
let lastOk = false;

// ---- 模型函数（规格块 Rules）----
function successRate(k) { return 1 - Math.pow(P_FAIL, k + 1); }
function backoffWait(k) {
  let s = 0;
  for (let i = 1; i <= k; i++) s += BACKOFF_BASE * Math.pow(BACKOFF_MUL, i - 1);
  return s;
}
function totalCostMs(k, breakerOpen) {
  if (breakerOpen) return CALL_TIMEOUT;           // 第一次调用 800 毫秒即返回，不进入重试
  return (k + 1) * CALL_TIMEOUT + backoffWait(k);
}

// ---- 判定工具 ----
const okNum = (raw, expect, tol) => {
  const v = parseFloat(raw);
  return String(raw).trim() !== '' && !isNaN(v) && Math.abs(v - expect) <= tol;
};
const okStr = (raw, expect) => String(raw).trim().toUpperCase() === expect;

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  kSlider = createSlider(0, 3, 2, 1);
  kSlider.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  kSlider.position(sliderLeftMargin, drawHeight + 5);
  kSlider.size(canvasWidth - sliderLeftMargin - margin);
  kSlider.attribute('aria-label', '重试次数 k');

  cbCheck = createCheckbox(' 熔断联动（60 秒窗口 / 样本 ≥ 20 / 失败率 ≥ 50% 打开）');
  cbCheck.parent(document.querySelector('main'));
  cbCheck.position(sliderLeftMargin, drawHeight + 42);
  cbCheck.checked(true);
  cbCheck.attribute('aria-label', '熔断联动开关');

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

  planInput = makeTextInput('方案字母答案', 440, drawHeight + 79, 60, 'A-D');
  costInput = makeInput('总耗时上限答案，单位毫秒', 570, drawHeight + 79, 90, 'ms');
  successInput = makeInput('最终成功率答案', 150, drawHeight + 114, 90, '0.910');
  ratioInput = makeInput('退避等待占比答案', 300, drawHeight + 114, 90, '0.294');

  describe('交互式收益账：拖动重试次数与开关熔断联动，实时读出总耗时上限与最终成功率，' +
    '并在 5000 毫秒用户等待预算下完成三道手写挑战题。');
}

function makeTextInput(label, x, y, w, ph) {
  const el = createInput('');
  el.parent(document.querySelector('main'));
  el.position(x, y);
  el.size(w);
  el.attribute('aria-label', label);
  el.attribute('placeholder', ph);
  el.hide();
  return el;
}

function makeInput(label, x, y, w, ph) {
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
  text('重试次数与熔断联动的收益账', canvasWidth / 2, 10);
  textAlign(LEFT, TOP);
  textSize(defaultTextSize);

  if (mode === 'explore') drawExplore();
  else drawChallenge();

  drawControls();
}

function drawExplore() {
  const k = kSlider.value();
  const open = cbCheck.checked();
  const ms = totalCostMs(k, open);
  const sr = successRate(k);
  const wait = open ? 0 : backoffWait(k);

  fill('black');
  noStroke();
  textSize(14);
  text('屏幕提问：多试一次总能多救回一点吧？先算这四个方案的总耗时，再决定要不要重试。', margin, 50);
  text('固定参数：单次超时 ' + CALL_TIMEOUT + ' 毫秒、单次失败率 ' + P_FAIL +
       '、退避基数 ' + BACKOFF_BASE + ' 毫秒、倍数 ' + BACKOFF_MUL + '、抖动 ±' +
       Math.round(JITTER * 100) + '%、用户等待预算 ' + BUDGET_MS + ' 毫秒。', margin, 72);

  textSize(17);
  text('当前组合（k = ' + k + (open ? '，熔断打开' : '，熔断关闭') + '）：调用 ' + (open ? 1 : k + 1) +
       ' 次，退避等待 ' + wait + ' 毫秒', margin, 108);
  textSize(24);
  fill(ms <= BUDGET_MS ? 'darkgreen' : 'darkred');
  text('总耗时上限 = ' + ms + ' 毫秒（预算 ' + BUDGET_MS + ' 毫秒，' +
       (ms <= BUDGET_MS ? '预算内' : '超预算 ' + (ms - BUDGET_MS) + ' 毫秒') + '）', margin, 134);
  text('最终成功率 = 1 − 0.30^' + (k + 1) + ' = ' + sr.toFixed(3), margin, 166);
  fill('black');
  textSize(14);

  drawPlanTable(200);
  drawNote(346);
}

function drawPlanTable(top) {
  const xs = [30, 62, 150, 230, 350, 450, 545];
  const heads = ['方案', '重试次数 k', '调用次数', '退避等待', '总耗时上限', '最终成功率', '预算内'];
  textSize(13);
  textStyle(BOLD);
  for (let i = 0; i < heads.length; i++) text(heads[i], xs[i], top);
  stroke(200);
  line(margin, top + 18, canvasWidth - margin, top + 18);
  noStroke();
  textStyle(NORMAL);

  for (let i = 0; i < PLANS.length; i++) {
    const p = PLANS[i];
    const y = top + 26 + i * 24;
    text(p.id, xs[0], y);
    text(p.id === 'D' ? p.k + '（联动）' : String(p.k), xs[1], y);
    text(String(p.k + 1), xs[2], y);
    text(backoffWait(p.k) + ' 毫秒', xs[3], y);
    text(p.id === 'D' ? (CALL_TIMEOUT + ' / ' + p.cost) + ' 毫秒' : p.cost + ' 毫秒', xs[4], y);
    text(p.success.toFixed(3), xs[5], y);
    fill(p.inBudget ? 'darkgreen' : 'darkred');
    text(p.inBudget ? '是' : '否（超预算）', xs[6], y);
    fill('black');
  }
  textSize(12);
  fill(120);
  text('方案 C 超预算 2400 毫秒；方案 D 在熔断打开时 800 毫秒即返回，不进入重试。', margin, top + 26 + PLANS.length * 24 + 6);
}

function drawNote(y) {
  const cpl = charsPerLine();
  fill(70);
  drawWrapped('注意：抖动上下 ' + Math.round(JITTER * 100) + '% 只影响实际等待的分布，不改变上表的上限取值，上限按无抖动取整数计算。' +
    '熔断判定双门槛：' + CB_WINDOW_S + ' 秒窗口、样本不少于 ' + CB_MIN_SAMPLES + '、失败率不低于 ' +
    Math.round(CB_FAIL_RATE * 100) + '%。', margin, y, cpl, 18);
  y += 40;
  fill(60);
  drawWrapped('读类超时 800 毫秒、写类超时 3000 毫秒的分档依据是下游链路长度；超时保护的是服务，不提高成功率。',
              margin, y, cpl, 18);
}

function drawChallenge() {
  fill('black');
  noStroke();
  textSize(defaultTextSize);

  if (qIdx >= QUESTIONS.length) {
    text('全部挑战完成：答对 ' + correctCount + ' / ' + QUESTIONS.length + ' 题', margin, 54);
    textSize(18);
    text('完整推导：', margin, 92);
    textSize(14);
    const cpl = charsPerLine();
    let y = 118;
    y = drawWrapped('方案 A：k = 0，1 次调用 × 800 毫秒 + 退避 0 = 800 毫秒，成功率 1 − 0.30 = 0.700。', margin, y, cpl, 18) + 6;
    y = drawWrapped('方案 B：k = 2，3 次调用 × 800 毫秒 + (200 + 800) = 1000 毫秒退避 = 3400 毫秒，' +
      '成功率 1 − 0.30³ = 0.910，退避占比 1000 / 3400 = 0.294。', margin, y, cpl, 18) + 6;
    y = drawWrapped('方案 C：k = 3，4 次调用 × 800 毫秒 + (200 + 800 + 3200) = 4200 毫秒退避 = 7400 毫秒，' +
      '成功率 1 − 0.30⁴ = 0.973，超预算 2400 毫秒。', margin, y, cpl, 18) + 6;
    y = drawWrapped('方案 D：k = 2 且熔断联动，正常路径 3400 毫秒；熔断打开时第一次调用 800 毫秒即返回。',
                    margin, y, cpl, 18) + 6;
    y = drawWrapped('两个并不相同的结论：预算内选 B、成功率最高选 C。', margin, y, cpl, 18) + 8;
    fill(70);
    drawWrapped(FEEDBACK, margin, y, cpl, 18);
    return;
  }

  const q = QUESTIONS[qIdx];
  text('挑战题 ' + (q.no) + ' / ' + QUESTIONS.length + '（累计答对 ' + correctCount + ' 题）', margin, 54);
  textSize(17);
  drawWrapped(q.text, margin, 82, charsPerLine(), 22);
  textSize(14);
  drawWrapped('请在下方输入框手写答案后点「检查答案」，每题两次机会。', margin, 118, charsPerLine(), 20);

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
  text('重试次数 k: ' + kSlider.value(), 10, drawHeight + 15);
  const on = mode === 'challenge' && qIdx >= 0 && qIdx < QUESTIONS.length;
  if (on) {
    const q = QUESTIONS[qIdx];
    if (q.slots.indexOf('plan') >= 0) text('方案', 405, drawHeight + 88);
    if (q.slots.indexOf('cost') >= 0) text('耗时ms', 525, drawHeight + 88);
    if (q.slots.indexOf('success') >= 0) text('成功率', 105, drawHeight + 123);
    if (q.slots.indexOf('ratio') >= 0) text('占比', 265, drawHeight + 123);
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
  syncSliders();
  showInputs();
}

function syncSliders() {
  const q = QUESTIONS[qIdx];
  if (!q) return;
  if (q.expect.plan === 'B' || q.expect.plan === 'D') { kSlider.value(2); cbCheck.checked(true); }
  else if (q.expect.plan === 'C') { kSlider.value(3); cbCheck.checked(true); }
  else kSlider.value(2);
}

function clearInputs() {
  planInput.value(''); costInput.value(''); successInput.value(''); ratioInput.value('');
}

function showInputs() {
  planInput.hide(); costInput.hide(); successInput.hide(); ratioInput.hide();
  if (qIdx < 0 || qIdx >= QUESTIONS.length) return;
  const s = QUESTIONS[qIdx].slots;
  if (s.indexOf('plan') >= 0) planInput.show();
  if (s.indexOf('cost') >= 0) costInput.show();
  if (s.indexOf('success') >= 0) successInput.show();
  if (s.indexOf('ratio') >= 0) ratioInput.show();
}

function checkAnswer() {
  if (mode !== 'challenge' || qIdx < 0 || qIdx >= QUESTIONS.length) return;
  const q = QUESTIONS[qIdx];
  attempts++;

  let allOk = true;
  if (q.slots.indexOf('plan') >= 0 && !okStr(planInput.value(), q.expect.plan)) allOk = false;
  if (q.slots.indexOf('cost') >= 0 && !okNum(costInput.value(), q.expect.cost, q.tol.cost)) allOk = false;
  if (q.slots.indexOf('success') >= 0 && !okNum(successInput.value(), q.expect.success, q.tol.success)) allOk = false;
  if (q.slots.indexOf('ratio') >= 0 && !okNum(ratioInput.value(), q.expect.ratio, q.tol.ratio)) allOk = false;

  if (allOk) {
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
  clearInputs();
  qIdx++;
  attempts = 0;
  if (qIdx < QUESTIONS.length) syncSliders();
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
  planInput.hide(); costInput.hide(); successInput.hide(); ratioInput.hide();
  kSlider.value(2);
  cbCheck.checked(true);
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
      kSlider.size(canvasWidth - sliderLeftMargin - margin);
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