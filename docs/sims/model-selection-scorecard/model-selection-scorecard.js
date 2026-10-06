'use strict';

const DIMS = [
  { k: 'eff', label: '任务实测效果', w: 0.4 },
  { k: 'cost', label: '成本', w: 0.2 },
  { k: 'lat', label: '延迟', w: 0.2 },
  { k: 'eng', label: '工程约束', w: 0.2 }
];

const MODELS = [
  {
    key: 'A',
    name: 'A（旗舰大模型）',
    std: { eff: 5, cost: 1, lat: 3, eng: 5 },
    reason: '效果满分且工具调用稳定，但单价最高，TTFT 偏高，不适合批量高 QPS。'
  },
  {
    key: 'B',
    name: 'B（均衡中型）',
    std: { eff: 4, cost: 3, lat: 4, eng: 4 },
    reason: '与 A 同为 3.8 分：效果 0.2 落后，成本与延迟各赚 0.2、0.2，正好打平。'
  },
  {
    key: 'C',
    name: 'C（轻量小模型）',
    std: { eff: 2, cost: 5, lat: 5, eng: 3 },
    reason: '便宜且快，但检索问答效果差 2 分，复杂指令遵循差，长任务不可靠。'
  },
  {
    key: 'D',
    name: 'D（多模态中型）',
    std: { eff: 3, cost: 2, lat: 3, eng: 2 },
    reason: '带图像输入但纯文本问答并无增益，工程约束最弱（不支持流式工具调用）。'
  }
];

const CONCLUSIONS = [
  { v: 'A', t: '选 A（旗舰大模型）' },
  { v: 'B', t: '选 B（均衡中型）' },
  { v: 'C', t: '选 C（轻量小模型）' },
  { v: 'D', t: '选 D（多模态中型）' },
  { v: 'split', t: '按场景分工：复杂规划用 A，批量执行用 B' }
];

const stage = document.getElementById('stage');
const controls = document.getElementById('controls');

const entered = {};
const revealed = { scores: false, conclusion: false, follow: false };
const submitted = { conclusion: '' };

function totalOf(s) {
  return DIMS.reduce((acc, d) => acc + d.w * s[d.k], 0);
}
function fmt1(v) { return v.toFixed(1); }
function stdTotal(m) { return totalOf(m.std); }
function topKeys() {
  let best = -1;
  MODELS.forEach(m => { const t = stdTotal(m); if (t > best) best = t; });
  return MODELS.filter(m => Math.abs(stdTotal(m) - best) < 0.0001).map(m => m.key);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function scoreFilled() {
  return MODELS.every(m => DIMS.every(d => entered[m.key] && entered[m.key][d.k] !== null && entered[m.key][d.k] !== undefined));
}

function renderStage() {
  const top = topKeys();
  let h = '<h1 class="sim-title">模型选型评分卡</h1>';
  h += '<div class="fb info">屏幕提问：同样 3.8 分，A 和 B 该怎么用？先给四个模型打分，再看推荐结论。</div>';
  h += '<div class="muted">权重固定：任务实测效果 0.4、成本 0.2、延迟 0.2、工程约束 0.2；各维度 0~5 整数，5 分最好；总分 = 0.4×效果 + 0.2×成本 + 0.2×延迟 + 0.2×工程约束，保留 1 位小数。</div>';
  if (!revealed.scores) {
  h += '<div class="grid2" id="cards">';
  MODELS.forEach(m => {
    const cur = entered[m.key] || {};
    const partial = DIMS.some(d => cur[d.k] !== null && cur[d.k] !== undefined);
    let totalTxt = '—';
    let totalOk = null;
    if (partial) {
      let sum = 0, n = 0;
      DIMS.forEach(d => {
        if (cur[d.k] !== null && cur[d.k] !== undefined) { sum += d.w * Number(cur[d.k]); n += 1; }
      });
      if (n > 0) totalTxt = fmt1(sum);
    }
    h += '<div class="card">';
    h += '<div><b>' + esc(m.name) + '</b>';
    if (revealed.scores && top.indexOf(m.key) >= 0) h += ' <span class="tag tag-rec">推荐</span>';
    h += '</div>';
    DIMS.forEach(d => {
      const v = cur[d.k];
      h += '<div class="row" style="margin-top:4px">';
      h += '<label class="ctl" style="min-width:150px">' + d.label + '（权重 ' + d.w + '）</label>';
      h += '<select data-model="' + m.key + '" data-dim="' + d.k + '"' + (revealed.scores ? ' disabled' : '') + ' aria-label="' + esc(m.name + ' ' + d.label) + '">';
      h += '<option value="">— 未打分 —</option>';
      for (let i = 0; i <= 5; i += 1) {
        const sel = (v !== null && v !== undefined && Number(v) === i) ? ' selected' : '';
        h += '<option value="' + i + '"' + sel + '>' + i + ' 分</option>';
      }
      h += '</select>';
      if (revealed.scores) {
        const ok = v !== null && v !== undefined && Number(v) === m.std[d.k];
        h += '<span class="muted">标准 ' + m.std[d.k] + ' 分</span>';
        h += '<span class="tag" style="border-color:' + (ok ? '#2e7d32' : '#c62828') + ';background:' + (ok ? '#eaf7ea' : '#fdecea') + '">' + (ok ? '一致' : '不一致') + '</span>';
      }
      h += '</div>';
    });
    h += '<div class="row" style="margin-top:6px"><b>加权总分：' + totalTxt + '</b>';
    if (revealed.scores) {
      const st = stdTotal(m);
      totalOk = Math.abs(totalTxt === '—' ? -1 : Number(totalTxt) - st) < 0.0001;
      h += '<span class="muted">标准总分 ' + fmt1(st) + '</span>';
      h += '<span class="tag" style="border-color:' + (totalOk ? '#2e7d32' : '#c62828') + ';background:' + (totalOk ? '#eaf7ea' : '#fdecea') + '">' + (totalOk ? '一致' : '不一致') + '</span>';
    } else {
      h += '<span class="muted">（打分后自动计算）</span>';
    }
    h += '</div>';
    h += '</div>';
  });
  h += '</div>';
  }

  if (revealed.scores) {
    h += '<h2 class="stage-h">揭晓：你的打分 vs 标准打分</h2>';
    h += '<table><tr><th>候选模型</th>';
    DIMS.forEach(d => { h += '<th>' + d.label + '<br/>（权重 ' + d.w + '）</th>'; });
    h += '<th>你的总分</th><th>标准总分</th><th>推荐</th></tr>';
    MODELS.forEach(m => {
      const cur = entered[m.key] || {};
      let sum = 0, n = 0;
      DIMS.forEach(d => { if (cur[d.k] !== null && cur[d.k] !== undefined) { sum += d.w * Number(cur[d.k]); n += 1; } });
      const yTot = n === 4 ? fmt1(sum) : '—';
      const st = stdTotal(m);
      const totOk = yTot !== '—' && Math.abs(Number(yTot) - st) < 0.0001;
      h += '<tr' + (top.indexOf(m.key) >= 0 ? ' class="hl"' : '') + '><td><b>' + esc(m.name) + '</b></td>';
      DIMS.forEach(d => {
        const v = cur[d.k];
        const ok = v !== null && v !== undefined && Number(v) === m.std[d.k];
        h += '<td>' + (v === null || v === undefined ? '—' : v) + ' / ' + m.std[d.k] +
          ' <span class="tag" style="border-color:' + (ok ? '#2e7d32' : '#c62828') + ';background:' + (ok ? '#eaf7ea' : '#fdecea') + '">' + (ok ? '一致' : '不一致') + '</span></td>';
      });
      h += '<td><b>' + yTot + '</b></td><td>' + fmt1(st) + '</td><td>' + (top.indexOf(m.key) >= 0 ? '推荐' : '—') + '</td></tr>';
      h += '<tr' + (top.indexOf(m.key) >= 0 ? ' class="hl"' : '') + '><td colspan="' + (DIMS.length + 4) + '">反馈原因：' + esc(m.reason) + '</td></tr>';
    });
    h += '</table>';
  }

  stage.innerHTML = h;
  stage.querySelectorAll('select[data-model]').forEach(sel => {
    sel.addEventListener('change', () => {
      const m = sel.getAttribute('data-model');
      const d = sel.getAttribute('data-dim');
      if (!entered[m]) entered[m] = {};
      entered[m][d] = sel.value === '' ? null : Number(sel.value);
      renderStage();
      renderControls();
    });
  });
}

function renderControls() {
  const ready = scoreFilled();
  let h = '<h2 class="stage-h">学习者操作区</h2>';
  h += '<div class="row">';
  h += '<button id="btnScore"' + (ready ? '' : ' disabled') + '>锁定打分并提交</button>';
  h += '<button id="btnReset">重来</button>';
  h += '<span class="muted" id="scoreState">已打分 ' + MODELS.filter(m => entered[m] && DIMS.every(d => entered[m][d.k] !== null && entered[m][d.k] !== undefined)).length + ' / 4 个模型</span>';
  h += '</div>';

  if (revealed.scores) {
    const consistent = MODELS.filter(m => {
      const cur = entered[m.key] || {};
      return DIMS.every(d => cur[d.k] === m.std[d.k]) && Math.abs(stdTotal(m) - totalOf(cur)) < 0.0001;
    }).length;
    h += '<div class="fb info">打分锁定完成：四个模型的加权总分与标准值一致 <b>' + consistent + ' / 4</b>。标准总分为 A 3.8、B 3.8、C ' + fmt1(stdTotal(MODELS[2])) + '、D ' + fmt1(stdTotal(MODELS[3])) + '，最高分并列者为 A 与 B，两者同时标记为“推荐”。</div>';
    h += '<div class="muted">说明：规格 Content 表把 C 的标准总分写作 3.2，而按 Rules 给出的加权公式（C = 2 / 5 / 5 / 3）算得 ' + fmt1(stdTotal(MODELS[2])) + '；本页以公式为准，A 与 B 并列 3.8 的结论不受影响。</div>';
  }

  h += '<h2 class="stage-h">推荐结论</h2>';
  h += '<div id="conclBox">';
  if (!revealed.conclusion) {
    CONCLUSIONS.forEach(c => {
      h += '<div class="row" style="margin-top:3px"><label class="ctl">';
      h += '<input type="radio" name="concl" value="' + c.v + '"' + (revealed.scores ? '' : ' disabled') + '> ' + c.t;
      h += '</label></div>';
    });
  } else {
    const val = submitted.conclusion;
    const label = (CONCLUSIONS.filter(c => c.v === val)[0] || { t: '（未选择）' }).t;
    h += '<div class="muted">你提交的结论：' + esc(label) + '</div>';
  }
  h += '</div>';
  h += '<div class="row"><button id="btnConcl"' + (revealed.scores && !revealed.conclusion ? '' : ' disabled') + '>提交推荐结论</button>';
  if (revealed.conclusion) h += '<button id="btnFollow"' + (revealed.follow ? ' disabled' : '') + '>对照分工结论</button>';
  h += '</div>';

  if (revealed.conclusion) {
    const val = submitted.conclusion;
    let box = '';
    if (val === 'split') {
      box += '<div class="fb ok">正确：A 与 B 并列 3.8 分，实际按场景分工——复杂规划用 A，批量执行用 B。</div>';
      box += '<div class="fb info">总分为 3.8 的 A 与 B 打平不是巧合——评测集在这两个维度上的差距刚好被其他维度抵消；正确结论是“按场景分工”（复杂规划走 A，批量执行走 B），而不是勉强选一个。</div>';
    } else {
      const m = MODELS.filter(x => x.key === val)[0];
      box += '<div class="fb no">再看看是哪一维拉开了差距。</div>';
      if (m) {
        box += '<div class="fb info">你选的 ' + esc(m.name) + ' 的标准总分为 ' + fmt1(stdTotal(m)) + '，反馈原因：' + esc(m.reason) + '</div>';
        box += '<div class="fb info">四个模型的加权总分与反馈原因已在左上方逐张展开，请对照回看。</div>';
      } else {
        box += '<div class="fb info">你没有提交结论。标准结论为：A 与 B 并列 3.8 分，按场景分工——复杂规划用 A，批量执行用 B。</div>';
      }
      box += '<div class="fb info">常见误区：榜单排名最高的模型在自己的任务上一定最好；只看效果不看成本的选型能规模化；延迟可以等上线再优化。</div>';
    }
    h += box;
  }

  if (revealed.follow) {
    h += '<h2 class="stage-h">追问：贡献最大的两个维度（不计分，自评对照）</h2>';
    h += '<div class="muted">规格要求学习者指出贡献最大的两个维度。在下方选好两项后即时对照标准表述。</div>';
    h += '<div class="row" style="margin-top:4px"><span>维度一：</span><select id="f1"><option value="">— 选择 —</option>';
    DIMS.forEach(d => { h += '<option value="' + d.k + '">' + d.label + '</option>'; });
    h += '</select><span>维度二：</span><select id="f2"><option value="">— 选择 —</option>';
    DIMS.forEach(d => { h += '<option value="' + d.k + '">' + d.label + '</option>'; });
    h += '</select></div>';
    h += '<div id="followResult"></div>';
  }

  controls.innerHTML = h;

  if (revealed.follow) {
    const f1 = document.getElementById('f1');
    const f2 = document.getElementById('f2');
    if (f1 && f2) {
      f1.addEventListener('change', showFollowResult);
      f2.addEventListener('change', showFollowResult);
    }
  }

  const b1 = document.getElementById('btnScore');
  if (b1) b1.addEventListener('click', () => {
    revealed.scores = true;
    renderStage();
    renderControls();
  });
  const b2 = document.getElementById('btnReset');
  if (b2) b2.addEventListener('click', () => {
    MODELS.forEach(m => { delete entered[m.key]; });
    revealed.scores = false; revealed.conclusion = false; revealed.follow = false;
    submitted.conclusion = '';
    renderStage();
    renderControls();
  });
  const b3 = document.getElementById('btnConcl');
  if (b3) b3.addEventListener('click', () => {
    const chosen = document.querySelector('input[name="concl"]:checked');
    submitted.conclusion = chosen ? chosen.value : '';
    revealed.conclusion = true;
    renderStage();
    renderControls();
  });
  const b4 = document.getElementById('btnFollow');
  if (b4) b4.addEventListener('click', () => {
    revealed.follow = true;
    renderControls();
    const f1 = document.getElementById('f1');
    const f2 = document.getElementById('f2');
    if (f1 && f2) {
      f1.addEventListener('change', showFollowResult);
      f2.addEventListener('change', showFollowResult);
    }
  });
}

function showFollowResult() {
  const f1 = document.getElementById('f1');
  const f2 = document.getElementById('f2');
  const box = document.getElementById('followResult');
  if (!f1 || !f2 || !box) return;
  const pick = [f1.value, f2.value].filter(x => x !== '');
  const names = pick.map(k => (DIMS.filter(d => d.k === k)[0] || { label: k }).label);
  box.innerHTML = '<div class="fb info">你选的是：' + esc(names.join('、') || '（未选）') +
    '。标准表述：与 A 同为 3.8 分——效果 0.2 落后，成本与延迟各赚 0.2、0.2，正好打平。</div>';
}

renderStage();
renderControls();
