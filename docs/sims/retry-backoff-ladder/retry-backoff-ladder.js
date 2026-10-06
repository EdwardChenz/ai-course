// 重试退避阶梯 — Retry Backoff Ladder
// 教学目标：对比固定间隔与指数退避在六种重试次数下的总等待，并为每种次数选出等待更短的策略。
// 规格来源：docs/chapters/01-dev-foundations/index.md 的 retry-backoff-ladder 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：6 行 × 2 个策略按钮（共 12 个）+ 1 行揭晓与重来按钮 = 7 行
// controlHeight = (7 * 35) + 10 = 255
// drawHeight = 480；canvasHeight = 480 + 255 = 735；iframeHeight = 737
// 行分配：第 1 到 6 行分别是 n = 1 到 6 的两个策略按钮 / 第 7 行揭晓与重来按钮

let canvasWidth = 800;
let drawHeight = 480;
let controlHeight = 255;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let defaultTextSize = 16;

// ---- 基准延迟（规格块 Rules）----
const BASE_DELAY = 2;   // 秒

// 六行对比（规格块 Content 表，Correct 列为标准值）
const ROWS = [
  { n: 1, fixed: 2,  exp: 6,   best: 'both',
    why: 'n = 1 时两者都是首个 2 秒延迟，打平。' },
  { n: 2, fixed: 4,  exp: 6,   best: 'fixed',
    why: '指数第二阶跳到 4 秒，总和 2 + 4 = 6，已超过固定的 4。' },
  { n: 3, fixed: 6,  exp: 14,  best: 'fixed',
    why: '指数三阶总和 2 + 4 + 8 = 14，是固定的两倍多。' },
  { n: 4, fixed: 8,  exp: 30,  best: 'fixed',
    why: '2 + 4 + 8 + 16 = 30，等待体验差距继续拉大。' },
  { n: 5, fixed: 10, exp: 62,  best: 'fixed',
    why: '五次重试下指数退避让用户等一分钟，基本不可接受。' },
  { n: 6, fixed: 12, exp: 126, best: 'fixed',
    why: '六次重试指数总和破两分钟：重试必须配熔断，而不是加次数。' }
];

const CHOICES = ['固定间隔', '指数退避'];

let btns = [];         // [n][choice]
let revealBtn, resetBtn;

let picks = {};       // n -> 'fixed' | 'exp'
let revealed = false;
let correctCount = 0;

// ---- 模型函数（规格块 Rules）----
function totalFixed(n) { return BASE_DELAY * n; }
function totalExp(n) { return BASE_DELAY * (Math.pow(2, n) - 1); }
function bestOf(n) { return totalFixed(n) <= totalExp(n) ? 'fixed' : 'exp'; }

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  for (let i = 0; i < ROWS.length; i++) {
    const r = ROWS[i];
    const pair = [];
    for (let c = 0; c < 2; c++) {
      const b = createButton(CHOICES[c]);
      b.parent(document.querySelector('main'));
      b.position(58 + c * 118, drawHeight + 8 + i * 35);
      b.mousePressed(() => makePick(r.n, c === 0 ? 'fixed' : 'exp'));
      pair.push(b);
    }
    btns.push(pair);
  }

  revealBtn = createButton('揭晓全部');
  revealBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  revealBtn.position(10, drawHeight + 8 + 6 * 35);
  revealBtn.mousePressed(() => {
    revealed = true;
    correctCount = ROWS.filter(r => picks[r.n] && judge(r).ok).length;
  });

  resetBtn = createButton('重来');
  resetBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  resetBtn.position(130, drawHeight + 8 + 6 * 35);
  resetBtn.mousePressed(resetAll);

  describe('交互式对比台：六行重试次数，每行选一种策略。' +
    '固定间隔总等待 = 2n 秒，指数退避总等待 = 2×(2^n − 1) 秒；六行全部选择后揭晓。');
}

function judge(row) {
  const pick = picks[row.n];
  if (!pick) return { ok: false, reason: '' };
  if (row.best === 'both') return { ok: true, reason: 'n = 1 打平，任一策略都算对' };
  const ok = pick === row.best;
  return {
    ok: ok,
    reason: ok ? row.why
               : '再看一下总和。' + row.why
  };
}

function makePick(n, pick) {
  if (revealed) return;
  picks[n] = pick;
  let all = true;
  for (const r of ROWS) if (!picks[r.n]) all = false;
  if (all) {
    revealed = true;
    correctCount = ROWS.filter(r => judge(r).ok).length;
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
  text('重试退避阶梯', canvasWidth / 2, 10);
  textAlign(LEFT, TOP);
  textSize(defaultTextSize);

  drawFormula(46);
  drawTable(110);
  drawConclusion(300);
  drawControls();
}

function drawFormula(y) {
  fill(60);
  textSize(14);
  drawWrapped('屏幕提问：同样重试 6 次，哪种策略让用户等得更短？先全猜一遍再揭晓。' +
    '两种策略的基准延迟都是 2 秒；固定间隔总等待 = 2n 秒，指数退避总等待 = 2×(2^n − 1) 秒。' +
    'n = 3 的演算示例：2 + 4 + 8 = 14 秒。', margin, y, charsPerLine(), 18);
  fill('black');
}

function drawTable(top) {
  const xs = [28, 130, 250, 350, 470, 560];
  const heads = ['重试次数 n', '固定间隔总等待', '指数退避总等待', '你的预测', '更短的是', '判定'];
  textSize(13);
  textStyle(BOLD);
  for (let i = 0; i < heads.length; i++) text(heads[i], xs[i], top);
  stroke(200);
  line(margin, top + 18, canvasWidth - margin, top + 18);
  noStroke();
  textStyle(NORMAL);

  for (let i = 0; i < ROWS.length; i++) {
    const r = ROWS[i];
    const y = top + 26 + i * 28;
    text('n = ' + r.n, xs[0], y);
    if (revealed) {
      text(r.fixed + ' s', xs[1], y);
      text(r.exp + ' s', xs[2], y);
    } else {
      fill(130);
      text('待揭晓', xs[1], y);
      text('待揭晓', xs[2], y);
      fill('black');
    }
    const p = picks[r.n];
    fill(p ? 'black' : 130);
    text(p ? labelOf(p) : '待预测', xs[3], y);
    fill('black');

    if (revealed) {
      const j = judge(r);
      fill(j.ok ? 'darkgreen' : 'darkred');
      text(j.ok ? '✓ 正确' : '✗ 看总和', xs[4], y);
      fill('black');
      text(j.ok ? '✓' : '✗', xs[5], y);
    } else {
      fill(130);
      text('—', xs[4], y);
      text('—', xs[5], y);
      fill('black');
    }
  }
}

function labelOf(p) { return p === 'fixed' ? '固定间隔更短' : '指数退避更短'; }

function drawConclusion(y) {
  const cpl = charsPerLine();
  let yy = y;
  fill('black');
  if (revealed) {
    textSize(14);
    text('答对 ' + correctCount + ' / 6 题（n = 1 打平，选任一策略都算对；单次作答答对 ≥ 5 题为掌握）', margin, yy);
    yy += 22;
    for (const r of ROWS) {
      const j = judge(r);
      yy = drawWrapped('n = ' + r.n + '：' + j.reason, margin, yy, cpl, 18) + 2;
    }
    yy += 6;
    fill(30);
    drawWrapped('交叉点：n = 1 打平，之后固定间隔全胜，且从 n = 4 起差距爆炸式拉大（30 s 对 8 s）。' +
      '重试要配熔断，而不是加次数。', margin, yy, cpl, 18);
  } else {
    fill(110);
    textSize(14);
    let left = ROWS.length;
    for (const r of ROWS) if (picks[r.n]) left--;
    drawWrapped('还有 ' + left + ' 行未预测。请为每一行选一种策略；六行全部选择后自动揭晓。',
                margin, yy, cpl, 18);
    yy += 24;
    fill(90);
    textSize(12);
    drawWrapped('模型是确定性的，不含抖动；真实部署需加 ±20% 抖动，延迟常量为教学用示意值。',
                margin, yy, cpl, 16);
  }
}

function drawControls() {
  fill('black');
  noStroke();
  textAlign(LEFT, CENTER); // 控件区标签按行垂直居中，避免压住 HTML 控件
  textSize(14);
  for (let i = 0; i < ROWS.length; i++) {
    text('n = ' + ROWS[i].n, 10, drawHeight + 18 + i * 35);
  }
  textAlign(LEFT, TOP); // 还原为顶端对齐

}

function resetAll() {
  picks = {};
  revealed = false;
  correctCount = 0;
}

function windowResized() {
  updateCanvasSize();
  resizeCanvas(canvasWidth, canvasHeight);
}

function updateCanvasSize() {
  const container = document.querySelector('main');
  if (container) {
    canvasWidth = container.offsetWidth;
    // setup() 的第一句会调用本函数，那时按钮尚未创建，必须守卫
    if (typeof btns !== 'undefined' && btns && btns.length > 0 && btns[0][0]) {
      for (const row of btns) for (const b of row) b.size(105);
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