// Token 费用估算器 — Token Cost Estimator
// 教学目标：学习者计算中英文混合提示的输入 tokens 与请求总费用
// 规格来源：docs/chapters/01-dev-foundations/index.md 的 token-cost-estimator 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：3 个滑块（C/W/O）+ 3 个按钮 + 2 个数字输入框，共 4 行
// controlHeight = (4 * 35) + 10 = 150
// drawHeight = 330；canvasHeight = 330 + 150 = 480；iframeHeight = 482
// sliderLeftMargin = 150（标签宽 140 + 间距 10）
// 行分配：第 1 行滑块 C / 第 2 行滑块 W / 第 3 行滑块 O / 第 4 行按钮 + 输入框

let canvasWidth = 800;
let drawHeight = 330;
let controlHeight = 150;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let sliderLeftMargin = 150;
let defaultTextSize = 16;

// ---- 模型常量（来自规格块 Rules；价格为示意价）----
const PRICE_IN = 0.004;  // 元 / 千输入 tokens
const PRICE_OUT = 0.012; // 元 / 千输出 tokens

// ---- 挑战题（来自规格块 Content，固定顺序）----
const CHALLENGES = [
  { C: 1500, W: 0,   O: 800,  tokens: 1000, cost: 0.0136,
    hint: 'ceil(1500/1.5) = 1000；费用 = 1×0.004 + 0.8×0.012 = 0.0136。' },
  { C: 0,    W: 600, O: 1200, tokens: 800,  cost: 0.0176,
    hint: 'ceil(600/0.75) = 800；费用 = 0.8×0.004 + 1.2×0.012 = 0.0176。输出同样计费。' },
  { C: 3000, W: 300, O: 2000, tokens: 2400, cost: 0.0336,
    hint: 'ceil(3000/1.5) + ceil(300/0.75) = 2000 + 400 = 2400；费用 = 2.4×0.004 + 2×0.012 = 0.0336。' }
];

let cSlider, wSlider, oSlider;
let startBtn, checkBtn, resetBtn;
let tokInput, costInput;

let mode = 'explore';        // explore | challenge
let challengeIdx = -1;
let attempts = 0;            // 当前题已用次数
let correctCount = 0;
let lastResult = '';
let lastResultOk = false;

// ---- 模型函数（规格块 Rules）----
function inputTokens(C, W) {
  return Math.ceil(C / 1.5) + Math.ceil(W / 0.75);
}
function totalCost(tokens, O) {
  return tokens / 1000 * PRICE_IN + O / 1000 * PRICE_OUT;
}

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  cSlider = createSlider(0, 20000, 1500, 100);
  cSlider.position(sliderLeftMargin, drawHeight + 5);
  cSlider.size(canvasWidth - sliderLeftMargin - margin);

  wSlider = createSlider(0, 5000, 200, 50);
  wSlider.position(sliderLeftMargin, drawHeight + 40);
  wSlider.size(canvasWidth - sliderLeftMargin - margin);

  oSlider = createSlider(0, 8000, 800, 100);
  oSlider.position(sliderLeftMargin, drawHeight + 75);
  oSlider.size(canvasWidth - sliderLeftMargin - margin);

  startBtn = createButton('开始挑战');
  startBtn.position(10, drawHeight + 113);
  startBtn.mousePressed(startChallenge);

  checkBtn = createButton('检查答案');
  checkBtn.position(120, drawHeight + 113);
  checkBtn.mousePressed(checkAnswer);

  resetBtn = createButton('重来');
  resetBtn.position(230, drawHeight + 113);
  resetBtn.mousePressed(resetAll);

  tokInput = createInput('', 'number');
  tokInput.parent(document.querySelector('main'));
  tokInput.position(360, drawHeight + 114);
  tokInput.size(96);
  tokInput.attribute('aria-label', '输入 tokens 答案');
  tokInput.attribute('placeholder', 'tokens');
  tokInput.hide();

  costInput = createInput('', 'number');
  costInput.parent(document.querySelector('main'));
  costInput.position(540, drawHeight + 114);
  costInput.size(96);
  costInput.attribute('aria-label', '总费用答案，单位元');
  costInput.attribute('placeholder', '元');
  costInput.hide();

  describe('交互式 Token 费用估算器：拖动三个滑块观察输入 token 数与费用变化，或进入挑战模式手写计算结果并提交检验。');
}

function draw() {
  updateCanvasSize();

  // 背景（规范：先画背景区域）
  fill('aliceblue');
  stroke('silver');
  rect(0, 0, canvasWidth, drawHeight);
  fill('white');
  rect(0, drawHeight, canvasWidth, controlHeight);

  // 标题（画在背景之后）
  fill('black');
  textSize(24);
  textAlign(CENTER, TOP);
  noStroke();
  text('Token 费用估算器', canvasWidth / 2, 10);

  textAlign(LEFT, CENTER);
  textSize(defaultTextSize);

  if (mode === 'explore') {
    drawExplore();
  } else {
    drawChallenge();
  }

  drawControls();
}

function drawExplore() {
  const C = cSlider.value(), W = wSlider.value(), O = oSlider.value();
  const tok = inputTokens(C, W);
  const cost = totalCost(tok, O);

  fill('black');
  noStroke();
  text('输入 tokens = ceil(' + C + '/1.5) + ceil(' + W + '/0.75) = ' + tok, margin, 70);
  text('费用 = ' + tok + '/1000×0.004 + ' + O + '/1000×0.012', margin, 100);
  textSize(28);
  text('总费用 = ' + cost.toFixed(4) + ' 元（示意价）', margin, 140);
  textSize(defaultTextSize);

  fill(90);
  text('提示：输出 tokens 也会计费——输入不变时，拖动"O 输出 tokens"看费用如何变化。', margin, 185);
  text('先手算，再点"开始挑战"验证你的算法。', margin, 210);
}

function drawChallenge() {
  fill('black');
  noStroke();

  if (challengeIdx >= CHALLENGES.length) {
    text('全部挑战完成：答对 ' + correctCount + ' / ' + CHALLENGES.length + ' 题', margin, 70);
    textSize(20);
    text('正确答案为：', margin, 110);
    textSize(defaultTextSize);
    for (let i = 0; i < CHALLENGES.length; i++) {
      const c = CHALLENGES[i];
      text((i + 1) + ') C=' + c.C + ' W=' + c.W + ' O=' + c.O +
           ' → 输入 ' + c.tokens + ' tokens，费用 ' + c.cost.toFixed(4) + ' 元',
           margin, 140 + i * 26);
    }
    text('点"重来"可重新挑战。', margin, 140 + CHALLENGES.length * 26 + 14);
    return;
  }

  const ch = CHALLENGES[challengeIdx];
  text('挑战题 ' + (challengeIdx + 1) + ' / ' + CHALLENGES.length +
       '（已答对 ' + correctCount + '）', margin, 70);
  text('已知 C=' + ch.C + ' 字符，W=' + ch.W + ' 单词，O=' + ch.O + ' 输出 tokens', margin, 100);
  text('请在下方输入框手写：输入 tokens 与总费用（元），然后点"检查答案"。', margin, 130);

  if (lastResult) {
    fill(lastResultOk ? 'darkgreen' : 'darkred');
    text(lastResult, margin, 175);
    if (!lastResultOk) {
      fill(90);
      text('提示：' + ch.hint, margin, 205);
    }
  }
}

function drawControls() {
  fill('black');
  noStroke();
  text('中文字符数 C: ' + cSlider.value(), 10, drawHeight + 15);
  text('英文单词数 W: ' + wSlider.value(), 10, drawHeight + 50);
  text('输出 tokens O: ' + oSlider.value(), 10, drawHeight + 85);
  if (mode === 'challenge' && challengeIdx < CHALLENGES.length) {
    // 标签画在输入框左侧留出的空隙里，避免与 HTML 输入框重叠
    text('输入', 330, drawHeight + 124);
    text('费用', 510, drawHeight + 124);
  }
}

function startChallenge() {
  mode = 'challenge';
  challengeIdx = 0;
  attempts = 0;
  correctCount = 0;
  lastResult = '';
  lastResultOk = false;
  tokInput.value('');
  costInput.value('');
  tokInput.show();
  costInput.show();
  syncSlidersToChallenge();
}

function syncSlidersToChallenge() {
  const ch = CHALLENGES[challengeIdx];
  if (!ch) return;
  cSlider.value(ch.C);
  wSlider.value(ch.W);
  oSlider.value(ch.O);
}

function checkAnswer() {
  if (mode !== 'challenge' || challengeIdx < 0) return;
  if (challengeIdx >= CHALLENGES.length) return;

  const ch = CHALLENGES[challengeIdx];
  attempts++;

  // 判定规则（规格块 Evidence of Mastery）：tokens 精确命中，费用 ±0.001 元容差
  const tokRaw = tokInput.value().trim();
  const costRaw = costInput.value().trim();
  const tokVal = parseInt(tokRaw, 10);
  const costVal = parseFloat(costRaw);
  const tokOk = tokRaw !== '' && !isNaN(tokVal) && tokVal === ch.tokens;
  const costOk = costRaw !== '' && !isNaN(costVal) && Math.abs(costVal - ch.cost) <= 0.001;

  if (tokOk && costOk) {
    correctCount++;
    lastResultOk = true;
    lastResult = '正确：输入 ' + ch.tokens + ' tokens，费用 ' + ch.cost.toFixed(4) + ' 元。';
    advance();
  } else if (attempts >= 2) {
    lastResultOk = false;
    lastResult = '两次机会已用完，本题记为失手。标准答案：' +
                 ch.tokens + ' tokens，' + ch.cost.toFixed(4) + ' 元。';
    advance();
  } else {
    lastResultOk = false;
    lastResult = '还不对，再算一次（还有 ' + (2 - attempts) + ' 次机会）。';
  }
}

function advance() {
  tokInput.value('');
  costInput.value('');
  challengeIdx++;
  attempts = 0;
  if (challengeIdx < CHALLENGES.length) {
    syncSlidersToChallenge();
  } else {
    tokInput.hide();
    costInput.hide();
  }
}

function resetAll() {
  mode = 'explore';
  challengeIdx = -1;
  attempts = 0;
  correctCount = 0;
  lastResult = '';
  lastResultOk = false;
  tokInput.value('');
  costInput.value('');
  tokInput.hide();
  costInput.hide();
  cSlider.value(1500);
  wSlider.value(200);
  oSlider.value(800);
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
    if (typeof cSlider !== 'undefined' && cSlider) {
      const w = canvasWidth - sliderLeftMargin - margin;
      cSlider.size(w);
      wSlider.size(w);
      oSlider.size(w);
    }
  }
}