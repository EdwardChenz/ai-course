// STAR 讲述稿评分卡 — STAR Narrative Scorecard
// 教学目标：按情境、任务、行动、结果四维各 0 到 3 分为三段讲述稿打分，
// 判定每段是否达到总分 9 分的作品集门槛，并指出待补强一段中最弱的一维。
// 规格来源：docs/chapters/16-capstone-career/index.md 的 star-narrative-scorecard 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：1 个下拉框（讲述稿）+ 4 个下拉框（四维分数）+ 2 个下拉框（达标判定 / 最弱维度）
//           + 2 个按钮，共 4 行
// controlHeight = (4 * 35) + 10 = 150
// drawHeight = 620；canvasHeight = 620 + 150 = 770；iframeHeight = 772
// 行分配：第 1 行讲述稿下拉框 / 第 2 行四个维度分数下拉框
//         第 3 行达标判定与最弱维度下拉框 / 第 4 行按钮

let canvasWidth = 800;
let drawHeight = 620;
let controlHeight = 150;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let defaultTextSize = 16;

// ---- 四维量表（规格块 Content 表，满分 12 分）----
const DIMS = ['情境', '任务', '行动', '结果'];
const RUBRIC = [
  ['情境', '无背景或只有行业大趋势', '有背景但没有具体症状', '点名一条具体症状并给出数字', '点名症状、数字与它造成的业务后果'],
  ['任务', '说不清负责范围', '只说「我们团队」', '说清负责模块与成功判据', '说清负责模块、成功判据与它在链路中的位置'],
  ['行动', '只罗列技术名词', '有改动但没有取舍理由', '每条改动有一句理由', '每条改动配一个被否掉的替代方案与否定理由'],
  ['结果', '只说「上线了」', '给结论不给数字', '给指标前后对比与门禁口径', '给对比、口径，并列出仍然存在的缺口']
];

// ---- 三段讲述稿（规格块 Content 表）----
const NARRATIVES = [
  {
    no: 1,
    title: '客服知识助手',
    summary: '背景写了制度库更新频繁没人维护；任务是负责检索与评测；行动是换重排模型、把三次服务调用并行化、' +
      '给提示加引用校验，各配了被否方案；结果给正确率 0.83 到 0.89、幻觉率 0.09 到 0.04、P95 3.35 秒到 2.54 秒，' +
      '并列出记忆污染降权未生效',
    scores: [3, 3, 3, 3], total: 12,
    weakest: '无（四维均 3 分）',
    verdict: '直接进作品集',
    fb: '四维满分：背景有具体症状，任务有判据，行动有取舍，结果有对比、口径与缺口。唯一需要注意的是别把 12 分当成每次讲述都能保持，编号 3 就在提醒这个。'
  },
  {
    no: 2,
    title: '多模态文档理解',
    summary: '背景写「AI 很火」；任务是「我们组做的一个项目」；行动列了七个技术名词；结果写「效果很好，用户满意」',
    scores: [0, 1, 1, 0], total: 2,
    weakest: '情境与结果并列（各 0 分）',
    verdict: '重写',
    fb: '四个维度里有三个是 0 分：没有具体症状、没有可验证的数字、用的是「我们」而不是「我」。这种稿子在追问第三句就会散架，先按情境、结果两维补齐再谈其他。'
  },
  {
    no: 3,
    title: '数据分析 Agent',
    summary: '背景给了查询耗时与数据量的具体数字；任务说清负责编排与查询两层；行动列了四条改动，' +
      '每条都写了「为什么不用另一种做法」；结果只给了总耗时从 82 秒降到 31 秒，没有给门禁口径，也没提仍未解决的部分',
    scores: [3, 3, 3, 1], total: 10,
    weakest: '结果（1 分）',
    verdict: '补一项即可',
    fb: '情境、任务、行动三维都扎实，唯一短板在结果：只给数字不给口径，追问「这 31 秒对应哪条 SLO」就答不上来。补上门禁口径与至少一条未解决的缺口，这一稿就能进作品集。'
  }
];

const VERDICT_OPTIONS = ['直接进作品集', '补一项即可', '重写'];
const WEAK_OPTIONS = ['无（四维均 3 分）', '情境', '任务', '行动', '结果', '情境与结果并列'];

let narSel;
let dimSels = [];
let verdictSel, weakSel;
let submitBtn, resetBtn;

let answers = {};    // no -> {scores, verdict, weak, okScore, okVerdict, okWeak}
let attempts = {};   // no -> 次数
let msgs = {};       // no -> {text, ok}
let correctCount = 0;

function verdictOf(total) {
  if (total >= 9) return '直接进作品集';
  if (total >= 7) return '补一项即可';
  return '重写';
}

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  narSel = createSelect();
  narSel.parent(document.querySelector('main'));
  narSel.position(110, drawHeight + 5);
  narSel.size(canvasWidth - 120);
  for (const n of NARRATIVES) narSel.option('讲述稿 ' + n.no + '：' + n.title, String(n.no));
  narSel.attribute('aria-label', '讲述稿');
  narSel.changed(resetInputs);

  for (let i = 0; i < 4; i++) {
    const sel = createSelect();
    sel.parent(document.querySelector('main'));
    sel.position(48 + i * 120, drawHeight + 40);
    sel.size(70);
    for (const v of ['0', '1', '2', '3']) sel.option(v, v);
    sel.attribute('aria-label', DIMS[i] + '维度得分');
    dimSels.push(sel);
  }

  verdictSel = createSelect();
  verdictSel.parent(document.querySelector('main'));
  verdictSel.position(55, drawHeight + 78);
  verdictSel.size(175);
  for (const v of VERDICT_OPTIONS) verdictSel.option(v, v);
  verdictSel.attribute('aria-label', '达标判定');

  weakSel = createSelect();
  weakSel.parent(document.querySelector('main'));
  weakSel.position(320, drawHeight + 78);
  weakSel.size(240);
  for (const v of WEAK_OPTIONS) weakSel.option(v, v);
  weakSel.attribute('aria-label', '最弱维度');

  submitBtn = createButton('提交打分与判定');
  submitBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  submitBtn.position(10, drawHeight + 113);
  submitBtn.mousePressed(submitScore);

  resetBtn = createButton('重来');
  resetBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  resetBtn.position(150, drawHeight + 113);
  resetBtn.mousePressed(resetAll);

  describe('交互式评分卡：情境、任务、行动、结果四维各 0 到 3 分的量表与三段讲述稿摘要。' +
    '为每段填入四维分数、提交达标判定与最弱维度，再对照标准答案。');
}

function resetInputs() {
  for (const s of dimSels) s.selected('0');
  verdictSel.selected(VERDICT_OPTIONS[0]);
  weakSel.selected(WEAK_OPTIONS[0]);
}

function current() { return NARRATIVES[parseInt(narSel.value(), 10) - 1]; }

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
  text('STAR 讲述稿评分卡', canvasWidth / 2, 10);
  textAlign(LEFT, TOP);
  textSize(defaultTextSize);

  drawRule(44);
  drawRubric(86);
  drawNarrative(240);
  drawFeedback(400);
  drawControls();
}

function drawRule(y) {
  fill(60);
  textSize(14);
  drawWrapped('屏幕提问：编号 3 拿 10 分却还要补一项——先打分，再判它能不能直接进作品集。' +
    '四维各 0 到 3 分，满分 12 分；总分 ≥ 9 判「直接进作品集」，7 到 8 判「补一项即可」，≤ 6 判「重写」。',
    margin, y, charsPerLine(), 18);
  fill('black');
}

function drawRubric(top) {
  textSize(13);
  textStyle(BOLD);
  text('维度', 28, top);
  text('0 分', 120, top);
  text('1 分', 280, top);
  text('2 分', 440, top);
  text('3 分', 600, top);
  stroke(200);
  line(margin, top + 17, canvasWidth - margin, top + 17);
  noStroke();
  textStyle(NORMAL);

  for (let i = 0; i < RUBRIC.length; i++) {
    const y = top + 22 + i * 30;
    text(RUBRIC[i][0], 28, y);
    textSize(11);
    for (let k = 1; k <= 4; k++) {
      drawWrapped(RUBRIC[i][k], 120 + (k - 1) * 160, y, 15, 13);
    }
    textSize(13);
  }
}

function drawNarrative(top) {
  const cpl = charsPerLine();
  const n = current();
  textSize(14);
  textStyle(BOLD);
  text('讲述稿 ' + n.no + '：' + n.title, 28, top);
  textStyle(NORMAL);
  drawWrapped(n.summary, 28, top + 20, cpl, 18);

  const scores = dimSels.map(s => parseInt(s.value(), 10));
  const total = scores.reduce((a, b) => a + b, 0);
  const expectVerdict = verdictOf(total);

  const rowY = top + 20 + Math.ceil(n.summary.length / cpl) * 18 + 26;
  textSize(15);
  fill('black');
  let x = 28;
  for (let i = 0; i < 4; i++) {
    text(DIMS[i] + ' ' + scores[i] + ' 分', x, rowY);
    x += 120;
  }
  textSize(22);
  fill(total === n.total ? 'darkgreen' : 'darkorange');
  text('总分 = ' + total + ' / 12（标准总分 ' + n.total + '）', 520, rowY - 6);
  fill('black');
  textSize(14);
  text('按此总分的判定：' + expectVerdict + '　|　你选的是：' + verdictSel.value() +
       '　|　最弱维度你选：' + weakSel.value(), 28, rowY + 26);
}

function drawFeedback(top) {
  const cpl = charsPerLine();
  let y = top;
  textSize(14);
  fill('black');
  const n = current();
  const m = msgs[n.no];
  if (m) {
    fill(m.ok ? 'darkgreen' : 'darkred');
    text(m.text, margin, y);
    fill('black');
    y += 22;
  } else {
    fill(110);
    y = drawWrapped('请在下方为讲述稿 ' + n.no + ' 填入四维分数、选择达标判定与最弱维度后点「提交打分与判定」。',
                    margin, y, cpl, 18) + 6;
  }
  if (answers[n.no]) {
    fill(60);
    y = drawWrapped('你的答案：四维 ' + answers[n.no].scores.join(' / ') + '，总分 ' +
      answers[n.no].total + '，判定「' + answers[n.no].verdict + '」，最弱维度「' +
      answers[n.no].weak + '」。', margin, y, cpl, 18) + 4;
  }
  y = drawWrapped(n.fb, margin, y, cpl, 18) + 6;
  fill(30);
  y = drawWrapped('标准四维：' + n.scores.join(' / ') + '，标准总分 ' + n.total + '，标准判定「' +
    n.verdict + '」，标准最弱维度「' + n.weakest + '」。', margin, y, cpl, 18) + 6;
  drawWrapped('累计答对 ' + correctCount + ' / 3 段（满分 5 分：打分 3 分加判定与最弱维度各 1 分，答对 4 分视为掌握）。',
              margin, y, cpl, 18);
}

function drawControls() {
  fill('black');
  noStroke();
  textAlign(LEFT, CENTER); // 控件区标签按行垂直居中，避免压住 HTML 控件
  textSize(14);
  text('讲述稿 →', 10, drawHeight + 15);
  // 标签画在下拉框左侧的空隙里，避免与 HTML 控件重叠
  for (let i = 0; i < 4; i++) text(DIMS[i], 10 + i * 120, drawHeight + 50);
  text('达标', 10, drawHeight + 88);
  text('最弱维度', 250, drawHeight + 88);
  textAlign(LEFT, TOP); // 还原为顶端对齐

}

function submitScore() {
  const n = current();
  const scores = dimSels.map(s => parseInt(s.value(), 10));
  const total = scores.reduce((a, b) => a + b, 0);
  const v = verdictSel.value();
  const w = weakSel.value();
  const okScore = scores.every((sc, i) => sc === n.scores[i]) && total === n.total;
  const okVerdict = v === n.verdict;
  // 最弱维度：说出其中任一维度均算正确，但必须明确指出这是并列
  const okWeak = (w === n.weakest) ||
    (n.no === 2 && w === '情境与结果并列');

  attempts[n.no] = (attempts[n.no] || 0) + 1;
  answers[n.no] = { scores: scores, total: total, verdict: v, weak: w,
                    okScore: okScore, okVerdict: okVerdict, okWeak: okWeak };
  const got = (okScore ? 1 : 0) + (okVerdict ? 1 : 0) + (okWeak ? 1 : 0);
  if (got > 0) correctCount++;

  const parts = [];
  if (okScore) parts.push('分数正确，总分 ' + n.total);
  if (okVerdict) parts.push('判定正确：' + n.verdict);
  if (okWeak) parts.push('最弱维度正确：' + n.weakest);
  if (got === 3) {
    msgs[n.no] = { text: '本段三项全对：' + parts.join('；') + '。', ok: true };
  } else if (attempts[n.no] >= 2) {
    msgs[n.no] = { text: '两次机会已用完，本段记为失手。' +
      (okScore ? '' : '分数错误，把四维逐项对照量表加一遍。') +
      (okVerdict ? '' : '判定错误，总分不到 9 就不能说能直接用，先看是哪个维度拖的。') +
      (okWeak ? '' : '最弱维度错误，' + (n.no === 2 ? '本段情境与结果并列 0 分，必须明确指出这是并列。' : '看四维里最低的那一维。')),
      ok: false };
  } else {
    msgs[n.no] = { text: '部分正确（' + parts.join('；') + '），再改一次（还有 ' +
      (2 - attempts[n.no]) + ' 次机会）。', ok: false };
  }
}

function resetAll() {
  answers = {};
  attempts = {};
  msgs = {};
  correctCount = 0;
  narSel.value('1');
  resetInputs();
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
    if (typeof narSel !== 'undefined' && narSel) {
      narSel.size(canvasWidth - 120);
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