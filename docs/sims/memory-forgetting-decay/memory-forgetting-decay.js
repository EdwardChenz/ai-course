// 记忆衰减与遗忘决策 — Memory Forgetting Decay
// 教学目标：调节半衰参数与回填阈值，观察六条记忆的留存分数变化，
// 并回答三道判定（默认参数下 3 条归档、τ 调到 90 天后序号 2 为 0.6150、
// 硬约束的衰减项取 1 因而只有显式覆盖能作废）。
// 规格来源：docs/chapters/10-memory-sandbox/index.md 的 memory-forgetting-decay 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：2 个滑块（τ / 回填阈值）+ 1 个下拉框（题号）+ 1 个单选组或下拉框（答案）
//           + 3 个按钮，共 4 行
// controlHeight = (4 * 35) + 10 = 150
// drawHeight = 590；canvasHeight = 590 + 150 = 740；iframeHeight = 742
// 行分配：第 1 行滑块 τ / 第 2 行滑块阈值 / 第 3 行题号下拉框 + 答案控件
//         第 4 行按钮

let canvasWidth = 800;
let drawHeight = 590;
let controlHeight = 150;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let sliderLeftMargin = 150;
let defaultTextSize = 16;

// ---- 六条记忆（规格块 Content 表）----
const MEMORIES = [
  { no: 1, text: '用户常用邮箱 zhang.wei@example.com',  type: '稳定事实', w: 1.0, R: 0.92, dt: 210, n: 1, s: 0.0146 },
  { no: 2, text: '偏好中文回复、结论先行',                  type: '偏好',     w: 0.9, R: 0.88, dt: 120, n: 6, s: 0.1621 },
  { no: 3, text: '硬约束：该账号只读，不得写操作',          type: '硬约束',   w: 1.2, R: 0.95, dt: 400, n: 3, s: 1.0000 },
  { no: 4, text: '上季度负责的报表项目已结项',              type: '噪声',     w: 0.3, R: 0.80, dt: 300, n: 1, s: 0.0005 },
  { no: 5, text: '用户所在部门为华东销售二部',              type: '稳定事实', w: 1.0, R: 0.70, dt: 45,  n: 2, s: 0.5404 },
  { no: 6, text: '上个月提过一次想学 Rust',                 type: '噪声',     w: 0.3, R: 0.65, dt: 90,  n: 1, s: 0.0447 }
];

// ---- 三道挑战题（规格块 Content 表，固定顺序）----
const QUESTIONS = [
  {
    no: 1, kind: 'radio',
    text: '默认参数（τ = 45 天、阈值 = 0.12）下，六条记忆里有几条会被归档（分数低于阈值）',
    options: ['0 条', '1 条', '2 条', '3 条', '4 条', '5 条', '6 条'], answer: '3 条',
    hint: '序号 1 得 0.0146、序号 4 得 0.0005、序号 6 得 0.0447，三条均低于 0.12；' +
          '序号 2 得 0.1621、序号 5 得 0.5404、序号 3 得 1.0000，均高于阈值。',
    standard: '3 条'
  },
  {
    no: 2, kind: 'radio',
    text: '把半衰参数从 45 天调到 90 天（其余不变），序号 2 的分数变成多少',
    options: ['0.1621', '0.2636', '0.4380', '0.6150', '0.7920', '0.9500'], answer: '0.6150',
    hint: '0.9 × 0.88 × e^(-120/90) × (1 + ln 7) = 0.792 × 0.2636 × 2.9459 = 0.6150；' +
          '衰减项减半，分数从 0.1621 升到 0.6150。',
    standard: '0.6150',
    extra: '硬约束的分数被上限顶到 1.0000，所以它在默认参数下永远是回填候选。'
  },
  {
    no: 3, kind: 'select',
    text: '为什么把半衰参数调到 365 天也不改变序号 3 的分数',
    options: [
      'A 硬约束同样按指数衰减，只是曲线平一点',
      'B 硬约束的频率因子变成 1，所以分数不变',
      'C 硬约束的衰减项固定取 1，不参与时间衰减，只有显式覆盖能作废它',
      'D 半衰参数只对噪声类生效'
    ],
    answer: 'C 硬约束的衰减项固定取 1，不参与时间衰减，只有显式覆盖能作废它',
    hint: '硬约束没有「自然过期」这回事。如果把它放进衰减曲线，400 天后它的分数趋近 0 而被归档，' +
          'Agent 随后就在有写权限的路径上继续跑，这是本章最危险的一种静默失效。',
    standard: 'C（衰减项取 1，且只有显式覆盖能作废）',
    extra: '两个要点都答到才算本题完全正确：衰减项取 1 与只有显式覆盖能作废。'
  }
];

let tauSlider, thSlider;
let qSel, ansRadio, ansSel;
let submitBtn, resetBtn;

let msgs = {};       // no -> {text, ok}
let attempts = {};   // no -> 次数
let correctCount = 0;

// ---- 模型函数（规格块 Rules）----
function decayFactor(m, tau) {
  if (m.type === '硬约束') return 1;            // 硬约束的衰减项固定取 1
  return Math.exp(-m.dt / tau);
}
function freqFactor(m) { return 1 + Math.log(1 + m.n); }
function scoreOf(m, tau) {
  const raw = m.w * m.R * decayFactor(m, tau) * freqFactor(m);
  return Math.min(1.0, raw);                    // 取 1.0 为上限
}
function archivedCount(tau, th) {
  return MEMORIES.filter(m => scoreOf(m, tau) < th).length;
}

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  tauSlider = createSlider(15, 365, 45, 15);
  tauSlider.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  tauSlider.position(sliderLeftMargin, drawHeight + 5);
  tauSlider.size(canvasWidth - sliderLeftMargin - margin);
  tauSlider.attribute('aria-label', '半衰参数 τ，单位天');

  thSlider = createSlider(0.02, 0.60, 0.12, 0.01);
  thSlider.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  thSlider.position(sliderLeftMargin, drawHeight + 40);
  thSlider.size(canvasWidth - sliderLeftMargin - margin);
  thSlider.attribute('aria-label', '回填阈值');

  qSel = createSelect();
  qSel.parent(document.querySelector('main'));
  qSel.position(110, drawHeight + 78);
  qSel.size(140);
  for (const q of QUESTIONS) qSel.option('第 ' + q.no + ' 题', String(q.no));
  qSel.attribute('aria-label', '题号');
  qSel.changed(refreshWidget);

  submitBtn = createButton('提交答案');
  submitBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  submitBtn.position(10, drawHeight + 114);
  submitBtn.mousePressed(submitAnswer);

  resetBtn = createButton('重来');
  resetBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  resetBtn.position(120, drawHeight + 114);
  resetBtn.mousePressed(resetAll);

  refreshWidget();

  describe('交互式遗忘决策台：拖动半衰参数与回填阈值，观察六条记忆的留存曲线与归档条数，' +
    '再完成三道手写挑战题。');
}

function refreshWidget() {
  const q = currentQ();
  // p5 2.x 的 radio.remove() 需要传 value，无参调用不会移除 DOM；这里改用 elt.remove()
  if (typeof ansRadio !== 'undefined' && ansRadio) { ansRadio.elt.remove(); ansRadio = null; }
  if (typeof ansSel !== 'undefined' && ansSel) { ansSel.remove(); ansSel = null; }
  if (q.kind === 'radio') {
// p5 2.x 的 createRadio 只接受组名，选项必须逐个 .option() 添加
  ansRadio = createRadio('memory_answer');
    for (const o of q.options) ansRadio.option(o, o);
    ansRadio.parent(document.querySelector('main'));
    ansRadio.position(265, drawHeight + 80);
    // p5 2.x 单选组必须给足宽度，否则每个选项会各占一行撑破画布
    ansRadio.size(520);
    ansRadio.attribute('aria-label', '答案');
  } else {
    ansSel = createSelect();
    ansSel.parent(document.querySelector('main'));
    ansSel.position(265, drawHeight + 78);
    ansSel.size(canvasWidth - 265 - margin);
    for (const o of q.options) ansSel.option(o, o);
    ansSel.attribute('aria-label', '答案');
  }
}

function currentQ() { return QUESTIONS[parseInt(qSel.value(), 10) - 1]; }

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
  text('记忆衰减与遗忘决策', canvasWidth / 2, 10);
  textAlign(LEFT, TOP);
  textSize(defaultTextSize);

  drawFormula(44);
  drawCurves(104);
  drawTable(248);
  drawFeedback(426);
  drawControls();
}

function drawFormula(y) {
  fill(60);
  textSize(14);
  drawWrapped('留存分数 S = 类型权重 w × 相关性 R × 衰减项 × 频率因子 (1 + ln(1+n))，乘积上限 1.0；' +
    '衰减项 = e^(-Δt / τ)，硬约束的衰减项固定取 1。', margin, y, charsPerLine(), 18);
  fill('black');
}

function drawCurves(top) {
  const tau = tauSlider.value(), th = thSlider.value();
  const h = 130, w = 240;
  const left = margin + 30;
  textSize(13);
  fill('black');
  text('六条留存分数曲线（横轴 τ = 15 → 365 天）', left, top - 18);

  stroke(170);
  line(left, top, left, top + h);
  line(left, top + h, left + w, top + h);
  noStroke();

  // 阈值水平线
  const yTh = top + h * (1 - th);
  stroke(200, 120, 60);
  line(left, yTh, left + w, yTh);
  noStroke();
  fill(190, 110, 40);
  textSize(11);
  text('阈值 ' + th.toFixed(2), left + w + 4, yTh - 6);

  const colors = ['#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#8c564b'];
  for (let i = 0; i < MEMORIES.length; i++) {
    const m = MEMORIES[i];
    stroke(colors[i]);
    noFill();
    beginShape();
    for (let t = 15; t <= 365; t += 15) {
      const x = left + w * (t - 15) / 350;
      const y = top + h * (1 - scoreOf(m, t));
      vertex(x, y);
    }
    endShape();
    noStroke();
    // 当前 τ 的点
    const cx = left + w * (tau - 15) / 350;
    const cy = top + h * (1 - scoreOf(m, tau));
    fill(colors[i]);
    circle(cx, cy, 6);
    fill('black');
    textSize(10);
    text('序' + m.no, cx + 4, cy - 10);
  }

  fill(90);
  textSize(11);
  text('τ = 15', left - 4, top + h + 4);
  text('τ = 365', left + w - 26, top + h + 4);

  // 右侧读数
  const rx = left + w + 70;
  textSize(14);
  fill('black');
  text('当前 τ = ' + tau + ' 天、阈值 = ' + th.toFixed(2), rx, top - 18);
  let yy = top;
  for (let i = 0; i < MEMORIES.length; i++) {
    const m = MEMORIES[i];
    const s = scoreOf(m, tau);
    const arch = s < th;
    fill(arch ? 'darkred' : 'darkgreen');
    text('序号 ' + m.no + '　' + s.toFixed(4) + '　' + (arch ? '归档' : '回填'), rx, yy);
    fill('black');
    yy += 20;
  }
  fill(30);
  text('归档条数 = ' + archivedCount(tau, th) + ' 条', rx, yy);
}

function drawTable(top) {
  const xs = [28, 56, 300, 372, 424, 490, 556, 620];
  const heads = ['序号', '记忆内容', '类型', '权重 w', '相关性 R', 'Δt(天)', '回填 n', '当前分数'];
  textSize(13);
  textStyle(BOLD);
  for (let i = 0; i < heads.length; i++) text(heads[i], xs[i], top);
  stroke(200);
  line(margin, top + 17, canvasWidth - margin, top + 17);
  noStroke();
  textStyle(NORMAL);

  const tau = tauSlider.value(), th = thSlider.value();
  for (let i = 0; i < MEMORIES.length; i++) {
    const m = MEMORIES[i];
    const y = top + 23 + i * 21;
    const s = scoreOf(m, tau);
    text(String(m.no), xs[0], y);
    text(m.text, xs[1], y);
    text(m.type, xs[2], y);
    text(m.w.toFixed(1), xs[3], y);
    text(m.R.toFixed(2), xs[4], y);
    text(String(m.dt), xs[5], y);
    text(String(m.n), xs[6], y);
    fill(s < th ? 'darkred' : 'darkgreen');
    text(s.toFixed(4) + (s < th ? ' 归档' : ' 回填'), xs[7], y);
    fill('black');
  }
  textSize(12);
  fill(120);
  const cpl12 = Math.max(16, Math.floor((canvasWidth - margin * 2) / 12));
  drawWrapped('默认参数下的分数：' + MEMORIES.map(m => m.no + ' 号 ' + m.s.toFixed(4)).join('；') +
    '。归档不等于删除。', margin, top + 23 + MEMORIES.length * 21 + 4, cpl12, 16);
}

function drawFeedback(top) {
  const cpl = charsPerLine();
  let y = top;
  textSize(14);
  fill('black');
  text('屏幕提问：同是记忆，为什么有的必须忘、有的永远不能忘？', margin, y);
  y += 22;
  const q = currentQ();
  text('第 ' + q.no + ' 题：' + q.text, margin, y);
  y += 22;
  const m = msgs[q.no];
  if (m) {
    fill(m.ok ? 'darkgreen' : 'darkred');
    text(m.text, margin, y);
    fill('black');
    y += 22;
    y = drawWrapped(q.hint, margin, y, cpl, 18) + 4;
    if (q.extra) y = drawWrapped(q.extra, margin, y, cpl, 18) + 4;
  } else {
    fill(110);
    y = drawWrapped('请在下方给出第 ' + q.no + ' 题答案后点「提交答案」，每题两次机会。',
                    margin, y, cpl, 18) + 4;
  }
  fill(30);
  text('累计答对 ' + correctCount + ' / 3 题（满分 3 分，达到 2 分视为掌握）', margin, y);
}

function drawControls() {
  fill('black');
  noStroke();
  textAlign(LEFT, CENTER); // 控件区标签按行垂直居中，避免压住 HTML 控件
  textSize(14);
  text('半衰参数 τ: ' + tauSlider.value() + ' 天', 10, drawHeight + 15);
  text('回填阈值: ' + thSlider.value().toFixed(2), 10, drawHeight + 50);
  text('题号 →', 10, drawHeight + 88);
  textAlign(LEFT, TOP); // 还原为顶端对齐

}

function submitAnswer() {
  const q = currentQ();
  const pick = q.kind === 'radio' ? (ansRadio ? ansRadio.value() : '') : (ansSel ? ansSel.value() : '');
  const ok = pick === q.answer;
  attempts[q.no] = (attempts[q.no] || 0) + 1;
  if (ok) {
    correctCount++;
    msgs[q.no] = { text: '正确，' + q.standard, ok: true };
  } else if (attempts[q.no] >= 2) {
    msgs[q.no] = { text: '两次机会已用完，本题记为失手。标准答案：' + q.standard, ok: false };
  } else {
    msgs[q.no] = { text: '还不对，再答一次（还有 ' + (2 - attempts[q.no]) + ' 次机会）。', ok: false };
  }
}

function resetAll() {
  msgs = {};
  attempts = {};
  correctCount = 0;
  qSel.value('1');
  refreshWidget();
  tauSlider.value(45);
  thSlider.value(0.12);
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
    if (typeof tauSlider !== 'undefined' && tauSlider) {
      const w = canvasWidth - sliderLeftMargin - margin;
      tauSlider.size(w);
      thSlider.size(w);
      if (ansSel) ansSel.size(Math.max(200, canvasWidth - 265 - margin));
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