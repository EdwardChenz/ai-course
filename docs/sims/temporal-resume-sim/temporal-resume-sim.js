// 长任务断点续跑判定 — Temporal Resume Sim
// 教学目标：给定四个崩溃位置与 6 步工作流的耗时与副作用表，判定每个场景的续跑起点、
// 续跑耗时、节省比例，并判定已产生的副作用是否需要重放。
// 规格来源：docs/chapters/12-data-engineering/index.md 的 temporal-resume-sim 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：2 个下拉框（场景 + 判定项）+ 1 组单选（判定值）+ 3 个按钮，共 4 行
// controlHeight = (3 * 35) + 10 = 115
// drawHeight = 700；canvasHeight = 700 + 115 = 815；iframeHeight = 817
// 行分配：第 1 行场景下拉框 / 第 2 行判定项下拉框 + 按钮 / 第 3 行判定值单选组

let canvasWidth = 800;
let drawHeight = 700;
let controlHeight = 115;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let defaultTextSize = 16;

// ---- 6 步月度经营分析工作流（规格块 Content 表）----
const STEPS = [
  { no: 1, name: '抽取订单增量到 raw 层',      min: 12, cum: 12, effect: '写入 raw.orders 当日分区' },
  { no: 2, name: '维度对齐',                  min: 6,  cum: 18, effect: '写入 stg.dim_store、stg.dim_product' },
  { no: 3, name: '计算订单明细宽表',           min: 9,  cum: 27, effect: '写入 dwd.order_detail 当日分区' },
  { no: 4, name: '口径对齐校验',              min: 4,  cum: 31, effect: '写入 ads.metric_definition_check' },
  { no: 5, name: '生成 12 张报表草稿',         min: 7,  cum: 38, effect: '写 12 张草稿表，发出 2 个通知' },
  { no: 6, name: '发布报表并刷新看板',          min: 3,  cum: 41, effect: '草稿转正，看板快照前移' }
];
const FULL_MIN = 41;   // 无编排引擎时的恢复代价

// ---- 四个崩溃场景（规格块 Content 表）----
const SCENES = [
  {
    no: 1, crash: '第 1 步执行到第 7 分钟时 worker 进程被 kill',
    doneSteps: 0, resume: 1, resumeMin: 41, saved: 0, savedPct: '0%', repeat: false,
    fb: '崩溃前没有任何步骤完成，所以续跑起点就是第 1 步，耗时等于全量的 41 分钟，节省为零。这一行是基线，用来提醒你断点续跑不是每次都能省。'
  },
  {
    no: 2, crash: '第 3 步执行到第 6 分钟时被 kill',
    doneSteps: 2, resume: 3, resumeMin: 23, saved: 18, savedPct: '43.9%', repeat: false,
    fb: '第 1、2 步已完成，累计 18 分钟，所以从第 3 步续跑。第 3 到第 6 步耗时 9 加 4 加 7 加 3 等于 23 分钟，41 减 23 等于 18 分钟，18 除以 41 等于 43.9%。'
  },
  {
    no: 3, crash: '第 4 步执行到第 2 分钟时 coordinator 被 kill',
    doneSteps: 3, resume: 4, resumeMin: 14, saved: 27, savedPct: '65.9%', repeat: false,
    fb: '第 1、2、3 步已完成，累计 27 分钟，从第 4 步续跑。4 加 7 加 3 等于 14 分钟，41 减 14 等于 27 分钟，27 除以 41 等于 65.9%。前三步的写入都在事件历史里，不会重跑。'
  },
  {
    no: 4, crash: '第 5 步执行到第 5 分钟（已发出 1 个通知、已写 7 张草稿表）时失败',
    doneSteps: 4, resume: 5, resumeMin: 10, saved: 31, savedPct: '75.6%', repeat: true,
    fb: '节省最大的一行，但也是唯一会重复副作用的一行：第 1 到第 4 步已完成 31 分钟，从第 5 步续跑，7 加 3 等于 10 分钟，31 除以 41 等于 75.6%。而第 5 步已经发出 1 个通知且已写 7 张草稿表，重试会重复，必须靠幂等键和 MERGE 去重才能安全。'
  }
];

const JUDGE_KINDS = [
  { id: 'start', label: '续跑起点' },
  { id: 'min',   label: '续跑耗时（分钟）' },
  { id: 'repeat', label: '副作用是否重复' }
];

const CONCLUSION =
  '对照基准：没有编排引擎时，四个场景的恢复代价都是 41 分钟，且序号 4 的通知会被发第二次——' +
  '这正是断点续跑要解决的两件事，两件事缺一不可。' +
  '序号 4 必须同时看到两个维度：时间维度上它省得最多（75.6%），副作用维度上它是唯一会重复的一行，' +
  '因为前四步的副作用都是分区覆盖写或纯校验记录，而第 5 步的通知是对外发出去的消息，覆盖写去不掉，' +
  '只能靠 dedup_key 让消息中心丢弃重复键。';

let sceneSel, kindSel, valRadio;
let playBtn, submitBtn, resetBtn;
let animT = 0;
let animating = false;

let locked = {};   // key('s' + no + kind) -> {pick, ok}
let msgs = {};     // key -> {text, ok}
let attempts = {};
let correctCount = 0;
let revealed = false;

function currentScene() { return SCENES[parseInt(sceneSel.value(), 10) - 1]; }
function currentKind() { return JUDGE_KINDS.filter(k => k.id === kindSel.value())[0]; }

function optionsFor(kind) {
  if (kind === 'start') return STEPS.map(s => '第 ' + s.no + ' 步');
  if (kind === 'min') return ['41', '23', '14', '10', '18', '27', '31'];
  return ['是', '否'];
}
function expectedFor(scene, kind) {
  if (kind === 'start') return '第 ' + scene.resume + ' 步';
  if (kind === 'min') return String(scene.resumeMin);
  return scene.repeat ? '是' : '否';
}

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  sceneSel = createSelect();
  sceneSel.parent(document.querySelector('main'));
  sceneSel.position(110, drawHeight + 5);
  sceneSel.size(canvasWidth - 120);
  for (const s of SCENES) sceneSel.option('场景 ' + s.no + '：' + s.crash, String(s.no));
  sceneSel.attribute('aria-label', '崩溃场景');

  kindSel = createSelect();
  kindSel.parent(document.querySelector('main'));
  kindSel.position(110, drawHeight + 40);
  kindSel.size(200);
  for (const k of JUDGE_KINDS) kindSel.option(k.label, k.id);
  kindSel.attribute('aria-label', '判定项');
  kindSel.changed(refreshRadio);

  playBtn = createButton('播放工作流动画');
  playBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  playBtn.position(330, drawHeight + 42);
  playBtn.mousePressed(() => { animating = true; animT = 0; });

  submitBtn = createButton('提交判定');
  submitBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  submitBtn.position(500, drawHeight + 42);
  submitBtn.mousePressed(submitJudge);

  resetBtn = createButton('重来');
  resetBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  resetBtn.position(610, drawHeight + 42);
  resetBtn.mousePressed(resetAll);

  refreshRadio();

  describe('交互式断点续跑台：6 步月度经营分析工作流的耗时与副作用表与四个崩溃位置。' +
    '逐个场景判定续跑起点、续跑耗时与副作用是否重复。');
}

function refreshRadio() {
  // p5 2.x 的 radio.remove() 需要传 value，无参调用不会移除 DOM；这里改用 elt.remove()
  if (typeof valRadio !== 'undefined' && valRadio) { valRadio.elt.remove(); valRadio = null; }
// p5 2.x 的 createRadio 只接受组名，选项必须逐个 .option() 添加
  valRadio = createRadio('temporal_answer');
  for (const o of optionsFor(currentKind().id)) valRadio.option(o, o);
  valRadio.parent(document.querySelector('main'));
  valRadio.position(230, drawHeight + 78);
  // p5 2.x 单选组必须给足宽度，否则每个选项会各占一行撑破画布
  valRadio.size(420);
  valRadio.attribute('aria-label', '判定值');
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
  text('长任务断点续跑判定', canvasWidth / 2, 10);
  textAlign(LEFT, TOP);
  textSize(defaultTextSize);

  drawPrompt(44);
  drawWorkflow(96);
  drawScenes(258);
  drawProgress(424);
  drawFeedback(500);
  drawControls();
}

function drawPrompt(y) {
  fill(60);
  textSize(14);
  drawWrapped('屏幕提问：同样一次崩溃，从哪儿继续、还要多久、会不会把通知重发一遍——先写下三个判定，再看标准答案。' +
    '6 步顺序执行合计 ' + FULL_MIN + ' 分钟。', margin, y, charsPerLine(), 18);
  fill('black');
}

function drawWorkflow(top) {
  const boxW = 118, gap = 10;
  textSize(13);
  textStyle(BOLD);
  text('6 步工作流与副作用（累计耗时 ' + FULL_MIN + ' 分钟）', margin, top - 16);
  textStyle(NORMAL);

  const scene = currentScene();
  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i];
    const x = margin + i * (boxW + gap);
    const done = s.no <= scene.doneSteps;
    const crash = s.no === scene.resume;
    fill(done ? '#dff0d8' : (crash ? '#fde3e3' : '#eef1f6'));
    stroke(160);
    rect(x, top, boxW, 128);
    noStroke();
    fill('black');
    textSize(12);
    text('第 ' + s.no + ' 步', x + 6, top + 5);
    drawWrapped(s.name, x + 6, top + 22, 9, 14);
    fill(90);
    text(s.min + ' 分钟 · 累计 ' + s.cum, x + 6, top + 58);
    drawWrapped(s.effect, x + 6, top + 72, 9, 12);
    if (done) { fill('darkgreen'); text('已完成', x + 6, top + 110); }
    else if (crash) { fill('darkred'); text('崩溃在此', x + 6, top + 110); }
    fill('black');
  }
}

function drawScenes(top) {
  const xs = [28, 56, 300, 366, 436, 512, 590, 690];
  const heads = ['场景', '崩溃位置', '续跑起点', '续跑耗时', '节省', '节省比例', '副作用重复', '你的判定'];
  textSize(13);
  textStyle(BOLD);
  for (let i = 0; i < heads.length; i++) text(heads[i], xs[i], top);
  stroke(200);
  line(margin, top + 17, canvasWidth - margin, top + 17);
  noStroke();
  textStyle(NORMAL);

  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i];
    const y = top + 24 + i * 32;
    if (parseInt(sceneSel.value(), 10) === s.no) {
      fill(235, 240, 255); rect(20, y - 3, canvasWidth - 45, 24); fill('black');
    }
    text(String(s.no), xs[0], y);
    drawWrapped(s.crash, xs[1], y, 20, 15);
    if (revealed) {
      text('第 ' + s.resume + ' 步', xs[2], y);
      text(s.resumeMin + ' 分钟', xs[3], y);
      text(s.saved + ' 分钟', xs[4], y);
      text(s.savedPct, xs[5], y);
      fill(s.repeat ? 'darkred' : 'darkgreen');
      text(s.repeat ? '是' : '否', xs[6], y);
      fill('black');
    } else {
      fill(130);
      text('—', xs[2], y); text('—', xs[3], y); text('—', xs[4], y);
      text('—', xs[5], y); text('—', xs[6], y);
      fill('black');
    }
    const done = SCENES[i] ? ['start', 'min', 'repeat'].map(k => locked['s' + s.no + k]).filter(Boolean) : [];
    fill(done.length === 3 ? 'darkgreen' : 130);
    text(done.length === 3 ? '✓ 三项已判' : done.length + '/3', xs[7], y);
    fill('black');
  }
}

function drawProgress(y) {
  const scene = currentScene();
  textSize(14);
  fill('black');
  const target = animating ? animT * 6 : scene.doneSteps > 0 ? STEPS[scene.doneSteps - 1].cum : 0;
  text('动画进度：崩溃前已完成步骤累计 ' + target.toFixed(0) + ' / ' + FULL_MIN +
       ' 分钟（崩溃点：' + scene.crash + '）', margin, y);
  // 进度条
  const barW = canvasWidth - margin * 2;
  stroke(150);
  noFill();
  rect(margin, y + 24, barW, 16);
  noStroke();
  fill('steelblue');
  rect(margin, y + 24, barW * Math.min(1, target / FULL_MIN), 16);
  noStroke();
  if (animating && animT < 7) animT += 0.06;
  if (animating && animT >= 7) animating = false;
  fill(90);
  textSize(12);
  text('第 1 到第 ' + scene.doneSteps + ' 步已完成，续跑起点应为第 ' + scene.resume +
       ' 步；无编排引擎的恢复代价一律 41 分钟。', margin, y + 50);
}

function drawFeedback(top) {
  const cpl = charsPerLine();
  let y = top;
  textSize(14);
  const scene = currentScene();
  const kind = currentKind();
  const key = 's' + scene.no + kind.id;
  fill('black');
  text('判定：场景 ' + scene.no + ' 的' + kind.label + '　|　累计答对 ' + correctCount + ' / 12',
       margin, y);
  y += 22;
  const m = msgs[key];
  if (m) {
    fill(m.ok ? 'darkgreen' : 'darkred');
    text(m.text, margin, y);
    fill('black');
    y += 22;
  }
  if (revealed) {
    y = drawWrapped(scene.fb, margin, y, cpl, 18) + 6;
    fill(30);
    drawWrapped(CONCLUSION, margin, y, cpl, 18);
  }
}

function drawControls() {
  fill('black');
  noStroke();
  textAlign(LEFT, CENTER); // 控件区标签按行垂直居中，避免压住 HTML 控件
  textSize(14);
  text('崩溃场景 →', 10, drawHeight + 15);
  text('判定项 →', 10, drawHeight + 50);
  text('判定值 →', 10, drawHeight + 88);
  textAlign(LEFT, TOP); // 还原为顶端对齐

}

function submitJudge() {
  const scene = currentScene();
  const kind = currentKind();
  const key = 's' + scene.no + kind.id;
  const pick = valRadio.value();
  const expect = expectedFor(scene, kind.id);
  const ok = pick === expect;
  attempts[key] = (attempts[key] || 0) + 1;
  locked[key] = { pick: pick, ok: ok };
  if (ok) {
    correctCount++;
    msgs[key] = { text: '判定正确：' + pick, ok: true };
  } else if (attempts[key] >= 2) {
    msgs[key] = { text: '两次机会已用完，本题记为失手。标准答案：' + expect, ok: false };
  } else {
    msgs[key] = { text: '从已完成步骤的累计耗时那列倒着查；你还有一次机会。', ok: false };
  }
  let n = 0;
  for (const s of SCENES) for (const k of JUDGE_KINDS) if (locked['s' + s.no + k.id]) n++;
  if (n === SCENES.length * JUDGE_KINDS.length) revealed = true;
}

function resetAll() {
  locked = {};
  msgs = {};
  attempts = {};
  correctCount = 0;
  revealed = false;
  animating = false;
  animT = 0;
  sceneSel.value('1');
  kindSel.value('start');
  refreshRadio();
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
    if (typeof sceneSel !== 'undefined' && sceneSel) {
      sceneSel.size(canvasWidth - 120);
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