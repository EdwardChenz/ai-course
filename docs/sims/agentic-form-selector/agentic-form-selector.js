'use strict';

const FORMS = [
  {
    v: 'completion', t: '补全',
    scope: '光标处的一段',
    done: '类型检查通过加上你确认没有语义变化',
    doneFull: '类型检查通过加上你确认没有语义变化'
  },
  {
    v: 'agent', t: '代理',
    scope: '跨文件任务',
    done: '类型检查、测试、lint 三项全绿，且改动范围不超出任务单声明的文件',
    doneFull: '类型检查、测试、lint 三项全绿，且改动范围不超出任务单声明的文件'
  },
  {
    v: 'refactor', t: '重构',
    scope: '一个文件或模块',
    done: '原有测试全绿加新增边界用例全绿，且禁止顺手改语义',
    doneFull: '原有测试全绿加新增边界用例全绿，且禁止顺手改语义'
  }
];

const SCENARIOS = [
  {
    n: 1, text: '给一个已经跑通的 REST 处理器补上参数校验，二十行，写完即忘',
    form: 'completion', crit: '类型检查无新增错误',
    fb: '这是一次单文件内的局部改动，补全的完成判据可以只是类型检查通过；启动代理反而要多花一轮审查。'
  },
  {
    n: 2, text: '给订单模块新增一个退款状态查询接口，涉及模型、路由、权限与测试四处',
    form: 'agent', crit: '新增测试通过加类型检查无新增错误加 lint 无新增告警',
    fb: '作用域跨四个文件，人工改会漏项；代理的价值正在于自己去找相关文件。完成判据里必须有“新增测试”，否则等于没写判据。'
  },
  {
    n: 3, text: '写一条 300 行的重复转换函数',
    form: 'agent', crit: '抽取后的转换函数有逐例对照测试且全部通过',
    fb: '这不是重构也不是补全：新函数的测试用例得由 Agent 一并生成，属于跨文件的新增任务。'
  },
  {
    n: 4, text: '把一个 400 行函数拆成三个，行为必须一字不变',
    form: 'refactor', crit: '原有测试全部通过加新增边界用例通过',
    fb: '关键是有旧测试当护栏，重构才有安全网。顺手修 bug 是禁止事项：一旦语义被改动，旧测试的通过就不能证明行为未变。'
  },
  {
    n: 5, text: '全仓库把旧函数名 fetchUser 改名为 fetchUserById，共 37 处',
    form: 'agent', crit: '全仓库静态检查无旧名残留加原有测试全部通过',
    fb: '三十七处靠人改必漏，但也不该逐个替换：Agent 需要同时改调用点、测试与文档，并用静态检查证明没有残留。'
  },
  {
    n: 6, text: '给一个已封装的模块补一段设计说明注释，内容由代码推断',
    form: 'completion', crit: '注释不改变任何可执行行',
    fb: '注释不影响行为，判据只能是“可执行行零变更”；这类任务的成本几乎全在读懂代码上，用代理是浪费。'
  }
];

const BAD_CRITERIA = ['人工看着对', '由 Agent 自述完成', '不需要测试'];
const ALL_CRITERIA = [];
FORMS.forEach(f => { ALL_CRITERIA.push({ v: f.v + '|right', t: f.t + '：' + f.done }); });
BAD_CRITERIA.forEach(b => { ALL_CRITERIA.push({ v: 'bad|' + b, t: '错误表述：' + b }); });

const stage = document.getElementById('stage');
const controls = document.getElementById('controls');

const picked = {};
const crit = {};
const state = { revealed: false, critRevealed: false };

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function formText(v) {
  const f = FORMS.filter(x => x.v === v)[0];
  return f ? f.t : '（未判定）';
}
function allPicked() { return SCENARIOS.every(s => picked[s.n]); }
function allCrit() { return FORMS.every(f => crit[f.v]); }
function formScore() { return SCENARIOS.filter(s => picked[s.n] === s.form).length; }
function critScore() { return FORMS.filter(f => crit[f.v] === f.v + '|right').length; }
function total() { return formScore() + critScore(); }

function renderStage() {
  let h = '<h1 class="sim-title">Agentic 编码形态选择判定器</h1>';
  h += '<div class="fb info">屏幕提问：同一件事用错形态，审查成本就白花了——六个场景先判形态，再补判据。</div>';

  h += '<h2 class="stage-h">三种形态（作用域与完成判据）</h2>';
  h += '<table><tr><th>形态</th><th>作用域</th><th>完成判据</th></tr>';
  FORMS.forEach(f => {
    h += '<tr><td><b>' + f.t + '</b></td><td>' + f.scope + '</td><td>' + esc(f.done) + '</td></tr>';
  });
  h += '</table>';
  h += '<div class="muted">判定用两把尺子：作用域跨几个文件，错了能不能被测试逮到。三条形态至少各用到一次（补全 2 条、代理 3 条、重构 1 条）。</div>';

  h += '<h2 class="stage-h">六个场景</h2>';
  h += '<table><tr><th class="nowrap">序号</th><th>场景描述</th><th>作用域线索</th><th>形态判定</th><th>对应完成判据</th></tr>';
  const SCOPE_HINT = {
    1: '单文件内，约二十行',
    2: '跨四个文件（模型 / 路由 / 权限 / 测试）',
    3: '新增一个 300 行函数，含测试用例',
    4: '一个文件内拆分，行为一字不变，有旧测试',
    5: '全仓库 37 处，含调用点、测试与文档',
    6: '一个模块内，只写注释，不改行为'
  };
  SCENARIOS.forEach(s => {
    let cls = '';
    if (state.revealed) cls = (picked[s.n] === s.form) ? ' class="pass"' : ' class="block"';
    h += '<tr' + cls + '>';
    h += '<td>' + s.n + '</td><td>' + esc(s.text) + '</td><td>' + SCOPE_HINT[s.n] + '</td>';
    if (state.revealed) {
      h += '<td><span class="tag ' + (picked[s.n] === s.form ? 'tag-ok">形态正确' : 'tag-no">形态错误') + '</span><br/>标准：<b>' + formText(s.form) + '</b><br/>你的：' + formText(picked[s.n]) + '</td>';
    } else {
      h += '<td class="muted">（锁定前隐藏）</td>';
    }
    if (state.critRevealed) {
      h += '<td>' + esc(s.crit) + '</td>';
    } else {
      h += '<td class="muted">（形态判定后填写）</td>';
    }
    h += '</tr>';
  });
  h += '</table>';

  h += '<h2 class="stage-h">逐条形态判定</h2>';
  SCENARIOS.forEach(s => {
    const ok = state.revealed && picked[s.n] === s.form;
    h += '<div class="req ' + (state.revealed ? (ok ? 'ok' : 'no') : '') + '">';
    h += '<div class="row" style="justify-content:space-between"><div><b>序号 ' + s.n + '</b>　' + esc(s.text) + '</div>';
    h += '<label class="ctl">形态 <select data-f="' + s.n + '"' + (state.revealed ? ' disabled' : '') + ' aria-label="序号 ' + s.n + ' 形态"><option value="">— 选择 —</option>';
    FORMS.forEach(f => { h += '<option value="' + f.v + '"' + (picked[s.n] === f.v ? ' selected' : '') + '>' + f.t + '</option>'; });
    h += '</select></label></div>';
    if (state.revealed) {
      h += '<div class="fb ' + (ok ? 'ok' : 'no') + '">' +
        (ok ? '形态正确：' + formText(s.form) : '先问两个问题——跨几个文件、错了能不能被测试逮到。标准形态：' + formText(s.form)) +
        '<br/>对应完成判据：' + esc(s.crit) +
        '<br/>' + esc(s.fb) + '</div>';
    }
    h += '</div>';
  });

  h += '<h2 class="stage-h">三种形态的完成判据匹配</h2>';
  FORMS.forEach(f => {
    const chosen = crit[f.v];
    const ok = state.critRevealed && chosen === f.v + '|right';
    h += '<div class="req ' + (state.critRevealed ? (ok ? 'ok' : 'no') : '') + '">';
    h += '<div class="row" style="justify-content:space-between"><div><b>' + f.t + '</b></div>';
    h += '<label class="ctl">完成判据 <select data-c="' + f.v + '"' + (state.critRevealed ? ' disabled' : '') + ' aria-label="' + f.t + ' 完成判据"><option value="">— 选择 —</option>';
    ALL_CRITERIA.forEach(o => { h += '<option value="' + esc(o.v) + '"' + (chosen === o.v ? ' selected' : '') + '>' + esc(o.t) + '</option>'; });
    h += '</select></label></div>';
    if (state.critRevealed) {
      h += '<div class="fb ' + (ok ? 'ok' : 'no') + '">' +
        (ok ? '判据表述正确：' + esc(f.done) : '把形态表里的完成判据原文抄一遍再对照。标准判据：' + esc(f.done)) + '</div>';
    }
    h += '</div>';
  });

  if (state.critRevealed) {
    h += '<div class="fb info">把六条映射回形态表：补全＝序号 1、6；代理＝序号 2、3、5；重构＝序号 4。序号 4 判为重构而不是代理，依据是它有可执行的旧测试当护栏，而代理形态会顺手扩大改动范围。</div>';
    h += '<div class="fb info">三种最典型的误用：补全被当代理用（单文件局部改动启动代理，多花一轮审查）；代理被当重构用（跨文件重构没有旧测试护栏）；重构时顺手修 bug（旧测试的通过就不再能证明行为未变）。</div>';
  }

  stage.innerHTML = h;

  stage.querySelectorAll('select[data-f]').forEach(sel => {
    sel.addEventListener('change', () => {
      const n = Number(sel.getAttribute('data-f'));
      if (sel.value === '') { delete picked[n]; } else { picked[n] = sel.value; }
      renderStage();
      renderControls();
    });
  });
  stage.querySelectorAll('select[data-c]').forEach(sel => {
    sel.addEventListener('change', () => {
      crit[sel.getAttribute('data-c')] = sel.value;
      const b = document.getElementById('btnCrit');
      if (b) b.disabled = !(allCrit() && state.revealed && !state.critRevealed);
      const c = document.getElementById('critCount');
      if (c) c.textContent = '已判形态 ' + SCENARIOS.filter(s => picked[s.n]).length + ' / 6　已填判据 ' + FORMS.filter(f => crit[f.v]).length + ' / 3';
    });
  });
}

function renderControls() {
  let h = '<h2 class="stage-h">学习者操作区　<span class="muted" id="critCount">已判形态 ' + SCENARIOS.filter(s => picked[s.n]).length + ' / 6　已填判据 ' + FORMS.filter(f => crit[f.v]).length + ' / 3</span></h2>';
  h += '<div class="row">';
  h += '<button id="btnForm"' + (allPicked() && !state.revealed ? '' : ' disabled') + '>提交六条形态判定</button>';
  h += '<button id="btnCrit"' + (allCrit() && state.revealed && !state.critRevealed ? '' : ' disabled') + '>提交完成判据匹配</button>';
  h += '<button id="btnReset">重来</button>';
  h += '</div>';

  if (state.revealed) {
    h += '<div class="fb ' + (formScore() === 6 ? 'ok' : 'no') + '">形态答对 <b>' + formScore() + ' / 6</b>，判据答对 <b>' + critScore() + ' / 3</b>，合计 <b>' + total() + ' / 9</b> 分。满分 9 分，答对 7 分视为掌握；六条形态判定全部一致、且三种形态的完成判据表述全对时算掌握。</div>';
    h += '<div class="muted">说明：规格 Evidence of Mastery 写作「其中至少四条完成判据表述正确」，但同一规格的 Feedback 只给了三次完成判据匹配，故本页按三次判据全对执行。</div>';
    h += '<div class="fb info">注意序号 4 的答案是重构而非代理，并回答“为什么有旧测试时重构才安全”。</div>';
    h += '<div class="fb info">常见误区：代理编码在任何任务上都优于补全编码；重构时可以顺手修复发现的旧 bug；“人工看着对”也是一条合格判据。</div>';
  }

  controls.innerHTML = h;

  const b1 = document.getElementById('btnForm');
  if (b1) b1.addEventListener('click', () => {
    state.revealed = true;
    renderStage();
    renderControls();
  });
  const b2 = document.getElementById('btnCrit');
  if (b2) b2.addEventListener('click', () => {
    state.critRevealed = true;
    renderStage();
    renderControls();
  });
  const b3 = document.getElementById('btnReset');
  if (b3) b3.addEventListener('click', () => {
    SCENARIOS.forEach(s => { delete picked[s.n]; });
    FORMS.forEach(f => { delete crit[f.v]; });
    state.revealed = false; state.critRevealed = false;
    renderStage();
    renderControls();
  });
}

renderStage();
renderControls();
