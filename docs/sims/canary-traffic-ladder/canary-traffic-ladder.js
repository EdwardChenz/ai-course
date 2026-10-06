// 灰度发布流量分配对比 — Canary Traffic Ladder
// 教学目标：按三条硬约束（每档有效样本 ≥ 500、必须经过 50% 档、五个工作日内到达 100%）
// 评判四套灰度放量的合格性，并选出唯一可执行的一套。
// 规格来源：docs/chapters/04-rag-advanced/index.md 的 canary-traffic-ladder 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：1 个下拉框（判定项）+ 1 组单选（判定值）+ 2 个按钮，共 3 行
// controlHeight = (3 * 35) + 10 = 115
// drawHeight = 480；canvasHeight = 480 + 115 = 595；iframeHeight = 597
// 行分配：第 1 行判定项下拉框 / 第 2 行判定值单选组 / 第 3 行按钮

let canvasWidth = 800;
let drawHeight = 480;
let controlHeight = 115;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let controlLeft = 150;
let defaultTextSize = 16;

// ---- 固定输入（规格块 Rules）----
const DAILY = 12000;        // 日均请求
const COMPLETE = 0.84;      // 有效问答完成率
const MIN_SAMPLE = 500;     // 每档有效样本下限
const MAX_DAYS = 5;         // 五个工作日上限

// ---- 四套方案（规格块 Content 表）----
const PLANS = [
  {
    no: 1, name: 'A 激进阶梯',
    ladder: '5% → 20% → 100%',
    samples: [504, 2016, 10080],
    days: 3, verdict: '不合格',
    fb: '三档样本都过线，但跳过了 50% 档——硬指标在 20% 这个量级上检不出几个百分点的差异，必须有 50% 档做质量把关。'
  },
  {
    no: 2, name: 'B 稳健阶梯',
    ladder: '5% → 20% → 50% → 100%',
    samples: [504, 2016, 5040, 10080],
    days: 4, verdict: '合格',
    fb: '档位齐全、样本全部达标、四个工作日到 100%，三条硬约束全部满足。'
  },
  {
    no: 3, name: 'C 细粒阶梯',
    ladder: '5% → 10% → 20% → 30% → 100%',
    samples: [504, 1008, 2016, 3024, 10080],
    days: 5, verdict: '不合格',
    fb: '样本五档全部达标，但同样跳过了 50% 档，从 30% 直接跳到 100% 意味着最大幅度的行为变化没有被观测。'
  },
  {
    no: 4, name: 'D 慢速阶梯',
    ladder: '5% 停 2 天 → 20% 停 2 天 → 50% → 100%',
    samples: [504, 2016, 5040, 10080],
    days: 6, verdict: '不合格',
    fb: '档位齐全、样本达标，但总耗时 6 个工作日超过 5 个工作日的上限，长灰度会让修复版本迟迟上不了线。'
  }
];
const FINAL_ANSWER = 2;
const VERDICT_OPTS = ['合格', '不合格'];

// ---- 模型函数（规格块 Rules：有效样本 = round(12000 × 比例 × 0.84)）----
function effectiveSamples(ratio) { return Math.round(DAILY * ratio * COMPLETE); }
const hasFifty = (p) => p.ladder.indexOf('50%') >= 0;
const allSamplesOk = (p) => p.samples.every(s => s >= MIN_SAMPLE);
const daysOk = (p) => p.days <= MAX_DAYS;
const isQualified = (p) => allSamplesOk(p) && hasFifty(p) && daysOk(p);

let itemSel, verdictSel;
let submitBtn, resetBtn;
let locked = {};
let revealed = false;

function finalOptions() {
  return PLANS.map(p => '方案 ' + p.no + '（' + p.name + '）');
}

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  itemSel = createSelect();
  itemSel.parent(document.querySelector('main'));
  itemSel.position(110, drawHeight + 5);
  itemSel.size(canvasWidth - 120);
  for (const p of PLANS) itemSel.option('方案' + p.no + '：' + p.name, 'plan' + p.no);
  itemSel.option('★ 最终可执行方案', 'final');
  itemSel.attribute('aria-label', '判定项');
  itemSel.changed(refreshOptions);

  submitBtn = createButton('提交判定');
  submitBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  submitBtn.position(10, drawHeight + 78);
  submitBtn.mousePressed(submitVerdict);

  resetBtn = createButton('重来');
  resetBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  resetBtn.position(130, drawHeight + 78);
  resetBtn.mousePressed(resetAll);

  refreshOptions();

  describe('交互式灰度评审台：日均 12000 次请求、有效问答完成率 84% 下的四条硬约束，' +
    '逐套判定四套放量方案的合格性并提交最终可执行方案。');
}

function refreshOptions() {
  const isFinal = itemSel.value() === 'final';
  const opts = isFinal ? finalOptions() : VERDICT_OPTS;
  if (typeof verdictSel !== 'undefined' && verdictSel) verdictSel.remove();
  verdictSel = createSelect();
  verdictSel.parent(document.querySelector('main'));
  verdictSel.position(controlLeft, drawHeight + 40);
  verdictSel.size(canvasWidth - controlLeft - margin);
  for (const o of opts) verdictSel.option(o, o);
  verdictSel.attribute('aria-label', '判定值');
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
  text('灰度发布流量分配对比', canvasWidth / 2, 10);
  textAlign(LEFT, TOP);
  textSize(defaultTextSize);

  drawInputs(48);
  drawTable(120);
  drawFeedback(346);
  drawControls();
}

function drawInputs(y) {
  textSize(14);
  fill(60);
  drawWrapped('固定输入：日均 ' + DAILY + ' 次请求，有效问答完成率 ' + Math.round(COMPLETE * 100) +
    '%，有效样本 = round(12000 × 比例 × 0.84)。', margin, y, charsPerLine(), 18);
  fill(30);
  drawWrapped('三条硬约束：每档有效样本 ≥ ' + MIN_SAMPLE + ' 次　|　序列中必须含 50% 档　|　五个工作日内到达 100%。',
    margin, y + 20, charsPerLine(), 18);
  fill('black');
  drawWrapped('各档有效样本：' + [0.05, 0.10, 0.20, 0.30, 0.50, 1.00]
    .map(r => Math.round(r * 100) + '% → ' + effectiveSamples(r)).join('；'), margin, y + 40, charsPerLine(), 18);
}

function drawTable(top) {
  const xs = [28, 66, 150, 590, 650];
  const heads = ['序号', '方案', '档位序列', '天数', '你的判定'];
  textSize(13);
  textStyle(BOLD);
  for (let i = 0; i < heads.length; i++) text(heads[i], xs[i], top);
  stroke(200);
  line(margin, top + 18, canvasWidth - margin, top + 18);
  noStroke();
  textStyle(NORMAL);

  for (let i = 0; i < PLANS.length; i++) {
    const p = PLANS[i];
    const y = top + 28 + i * 44;
    text(String(p.no), xs[0], y);
    text(p.name, xs[1], y);
    text(p.ladder, xs[2], y);
    text(p.days + ' 天', xs[3], y);
    const lk = locked['plan' + p.no];
    if (lk) {
      fill(lk.ok ? 'darkgreen' : 'darkred');
      text((lk.ok ? '✓ ' : '✗ ') + lk.pick, xs[4], y);
      fill('black');
    } else {
      fill(130);
      text('待判定', xs[4], y);
      fill('black');
    }
    // 副行：各档有效样本 + 三条约束逐条标注
    textSize(12);
    text('各档有效样本 ' + p.samples.join(' / '), xs[1], y + 17);
    fill(120);
    text('样本 ' + (allSamplesOk(p) ? '过线' : '不足') + '　50% 档 ' + (hasFifty(p) ? '有' : '缺') +
         '　工期 ' + (daysOk(p) ? '达标' : '超期') + (revealed ? '　标准：' + p.verdict : ''), 320, y + 17);
    fill('black');
    textSize(13);
  }
}

function drawFeedback(top) {
  const cpl = charsPerLine();
  let y = top;
  textSize(14);
  fill('black');
  text('屏幕提问：样本够、档位全、别超工期——三件事都做到了才叫合格。', margin, y);
  y += 22;

  const lk = locked['final'];
  if (lk) {
    fill(lk.ok ? 'darkgreen' : 'darkred');
    text(lk.ok
      ? '方案 2 稳健阶梯可执行：504 / 2016 / 5040 / 10080 全部过线，含 50% 档，4 个工作日到达 100%。'
      : '样本达标和方案可行是两件事。被否方案违反的具体约束见下。', margin, y);
    fill('black');
    y += 22;
  } else {
    fill(110);
    text('逐套提交合格 / 不合格判定，再提交最终方案；判定锁定后才揭晓被否的具体约束。', margin, y);
    y += 22;
  }

  const curKey = itemSel.value();
  if (curKey !== 'final') {
    const p = PLANS[parseInt(curKey.slice(4), 10) - 1];
    const l = locked[curKey];
    if (l && (revealed || !l.ok)) {
      y = drawWrapped('方案 ' + p.no + ' ' + p.name + '（' + l.pick + '）：' +
        (l.ok ? '判定正确：' + p.verdict + '。' : '再对一遍三条硬约束。') + p.fb,
        margin, y, cpl, 18) + 6;
    }
  }

  if (revealed) {
    fill(30);
    const nc = PLANS.filter(p => locked['plan' + p.no] && locked['plan' + p.no].ok).length;
    text('判定答对 ' + nc + ' / 4，选型答对 ' + (lk && lk.ok ? 1 : 0) + ' / 1', margin, y + 4);
  }
}

function drawControls() {
  fill('black');
  noStroke();
  textAlign(LEFT, CENTER); // 控件区标签按行垂直居中，避免压住 HTML 控件
  textSize(14);
  text('判定项 →', 10, drawHeight + 15);
  text('判定值 →', 10, drawHeight + 50);
  textAlign(LEFT, TOP); // 还原为顶端对齐

}

function submitVerdict() {
  if (revealed) return;
  const key = itemSel.value();
  const pick = verdictSel.value();
  let ok;
  if (key === 'final') {
    const m = /^方案 (\d+)/.exec(pick);
    ok = !!m && parseInt(m[1], 10) === FINAL_ANSWER;
  } else {
    const p = PLANS[parseInt(key.slice(4), 10) - 1];
    ok = pick === p.verdict;
  }
  locked[key] = { pick: pick, ok: ok };
  let n = 0;
  for (const p of PLANS) if (locked['plan' + p.no]) n++;
  if (n === PLANS.length && locked['final']) revealed = true;
}

function resetAll() {
  locked = {};
  revealed = false;
  itemSel.value('plan1');
  refreshOptions();
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
    if (typeof itemSel !== 'undefined' && itemSel) {
      itemSel.size(canvasWidth - 120);
      if (verdictSel) verdictSel.size(canvasWidth - controlLeft - margin);
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