'use strict';

const STEPS = [
  { k: 'norm', t: '归一化检查', d: '分辨率、帧率、像素宽高比、像素格式', param: '-r 30 / -fps_mode cfr / setsar=1' },
  { k: 'stream', t: '流参数比对', d: '编码、采样率、声道、时长', param: '-ar 48000' },
  { k: 'timeline', t: '时间轴核对', d: '音频实际时长与字幕时间轴', param: '偏移阈值 40 毫秒' },
  { k: 'moov', t: '容器标记检查', d: 'moov 位置', param: '-movflags +faststart' }
];

const CAUSES = [
  { v: 'c1', t: '归一化缺失：帧率不一致', step: 'norm' },
  { v: 'c2', t: '流参数不一致：音频未统一采样率', step: 'stream' },
  { v: 'c3', t: '时间轴靠估算：字幕按字数估算时长', step: 'timeline' },
  { v: 'c4', t: '某分镜缺音轨，concat 以视频轨长度为准', step: 'stream' },
  { v: 'c5', t: '容器标记：moov 原子在文件末尾，未前置', step: 'moov' },
  { v: 'c6', t: '滤镜顺序错误：先烧字幕后缩放', step: 'norm' }
];

const CASES = [
  {
    n: 1, symptom: '拼接后偶发花屏，画面横向撕裂',
    obs: '六个分镜里有三个的 r_frame_rate 分别是 24/1、25/1、30/1，归一化脚本漏掉了 25/1 的那个',
    cause: 'c1', prio: 5,
    fb: '花屏与素材质量无关。三个分镜是不同来源的模型输出，帧率本来就不同；concat 滤镜版遇到帧率不一致会在切换点丢参考帧，表现为撕裂。归一化必须前置，重生成解决不了。'
  },
  {
    n: 2, symptom: '成片后 20 秒处声音明显超前于画面',
    obs: '音轨总长比视频轨短 180 毫秒，ffprobe 显示该分镜音频采样率 44100、其余为 48000',
    cause: 'c2', prio: 1,
    fb: '混音时不同采样率的片段被直接拼接，时间轴按各自时钟走，误差会随时间累积。180 毫秒这个偏移量正是“多模态评测方法”一节里的基线值，修好后应回到 40 毫秒以内。'
  },
  {
    n: 3, symptom: '字幕整体比语音提前约 0.6 秒',
    obs: '配音轨总长比字幕文件最后一行的结束时间多 640 毫秒',
    cause: 'c3', prio: 2,
    fb: '配音的语速是模型决定的，按字数估算的时间轴必然偏短。640 毫秒的偏差与评测基线一致，这是合成链里最常见也最容易修的一类——修法是让字幕生成以实际音频时长为唯一时间源。'
  },
  {
    n: 4, symptom: '成片结尾有约 4 秒黑屏',
    obs: '视频轨 64.0 秒，音频轨 60.0 秒，黑帧探测在 60.0 秒处报出起点',
    cause: 'c4', prio: 3,
    fb: '黑屏不是编码问题，是内容缺失。concat 以最长流为准，音频短了不会报错只会补静音，而视频长出来的 4 秒没人播就是黑屏。定位方法是逐个分镜跑一次时长比对。'
  },
  {
    n: 5, symptom: '导入平台后进度条走到 90% 卡住不动',
    obs: '本地 ffprobe 正常，平台报“文件损坏”',
    cause: 'c5', prio: 6,
    fb: '文件没坏，是 moov 在文件末尾，播放器必须下完整个文件才能开始播。本地用播放器拖进度条看不出来，所以这条只能靠平台反馈倒推。'
  },
  {
    n: 6, symptom: '烧录字幕后字幕发虚、有明显锯齿',
    obs: '成片分辨率 1920×1080，滤镜链里 subtitles 排在 scale 之前',
    cause: 'c6', prio: 4,
    fb: '字幕是在低分辨率下渲染完再被放大的，放大只会把边缘锯齿一起放大。滤镜链的顺序是书写顺序，所以 -vf 里谁写在前面谁先执行。'
  }
];

const PRIO_ORDER = [2, 3, 4, 6, 1, 5];

const PROBES = [
  { cmd: 'ffprobe -select_streams', use: '取流参数（编码、采样率、声道、时长）' },
  { cmd: 'blackdetect', use: '取黑帧位置（阈值 0.5 秒与 0.10）' },
  { cmd: 'ebur128', use: '取响度' }
];

const CONSEQUENCE = {
  2: '已错发内容', 3: '已错发内容', 4: '不可交付', 6: '影响观感', 1: '影响观感', 5: '特定平台触发'
};

const stage = document.getElementById('stage');
const controls = document.getElementById('controls');

const picked = {};
const prio = {};
const state = { revealed: false, prioRevealed: false };

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function causeText(v) {
  const c = CAUSES.filter(x => x.v === v)[0];
  return c ? c.t : '（未判定）';
}
function allPicked() { return CASES.every(c => picked[c.n]); }
function allPrio() { return CASES.every(c => prio[c.n] !== undefined && prio[c.n] !== ''); }
function causeScore() { return CASES.filter(c => picked[c.n] === c.cause).length; }
function prioScore() {
  return CASES.filter(c => Number(prio[c.n]) === c.prio).length;
}

function renderStage() {
  let h = '<h1 class="sim-title">ffmpeg 合成链故障诊断</h1>';
  h += '<div class="fb info">屏幕提问：现象是症状，参数才是病因——先按四步顺序判六条成因。</div>';

  h += '<h2 class="stage-h">四步诊断顺序（固定且不可换，每个案例只归到第一个被违反的步骤）</h2><div class="flow">';
  STEPS.forEach((s, i) => {
    h += '<div class="node"><b>' + (i + 1) + '. ' + s.t + '</b><br/><span class="muted">' + s.d + '</span><br/><code>' + s.param + '</code></div>';
    if (i < STEPS.length - 1) h += '<div class="arrow">→</div>';
  });
  h += '</div>';

  h += '<h2 class="stage-h">可用的三个探针（不得引用未列出的工具）</h2><div class="card"><div class="row">';
  PROBES.forEach(p => { h += '<span class="tag"><code>' + p.cmd + '</code> ' + p.use + '</span>'; });
  h += '</div></div>';

  h += '<h2 class="stage-h">六个合成故障案例</h2>';
  h += '<table><tr><th class="nowrap">序号</th><th>症状</th><th>观测值</th><th>成因判定</th><th class="nowrap">优先级</th></tr>';
  CASES.forEach(c => {
    h += '<tr' + (state.revealed ? ' class="hl"' : '') + '>';
    h += '<td>' + c.n + '</td><td>' + esc(c.symptom) + '</td><td>' + esc(c.obs) + '</td>';
    if (state.revealed) {
      const ok = picked[c.n] === c.cause;
      h += '<td><span class="tag ' + (ok ? 'tag-ok">成因正确' : 'tag-no">成因错误') + '</span><br/>标准：<b>' + esc(causeText(c.cause)) + '</b><br/>你的：' + esc(causeText(picked[c.n])) + '</td>';
    } else {
      h += '<td class="muted">（锁定前隐藏）</td>';
    }
    if (state.prioRevealed) {
      h += '<td>' + (Number(prio[c.n]) === c.prio ? '<b>' + c.prio + ' ✓</b>' : prio[c.n] + ' / 标准 ' + c.prio) + '</td>';
    } else {
      h += '<td class="muted">（未提交）</td>';
    }
    h += '</tr>';
  });
  h += '</table>';

  h += '<h2 class="stage-h">逐条成因判定与处置优先级</h2>';
  CASES.forEach(c => {
    const ok = state.revealed && picked[c.n] === c.cause;
    h += '<div class="req ' + (state.revealed ? (ok ? 'ok' : 'no') : '') + '">';
    h += '<div class="row" style="justify-content:space-between"><div><b>序号 ' + c.n + '</b>　' + esc(c.symptom) + '</div>';
    h += '<label class="ctl">成因 <select data-c="' + c.n + '"' + (state.revealed ? ' disabled' : '') + ' aria-label="序号 ' + c.n + ' 成因"><option value="">— 判定 —</option>';
    CAUSES.forEach(x => { h += '<option value="' + x.v + '"' + (picked[c.n] === x.v ? ' selected' : '') + '>' + esc(x.t) + '</option>'; });
    h += '</select></label>';
    h += '<label class="ctl">优先级 <input type="number" id="p' + c.n + '" min="1" max="6" step="1" value="' + (prio[c.n] === undefined ? '' : prio[c.n]) + '"' + (state.prioRevealed ? ' disabled' : '') + ' aria-label="序号 ' + c.n + ' 处置优先级"></label>';
    h += '</div>';
    h += '<div class="muted">观测值：' + esc(c.obs) + '</div>';
    if (state.revealed) {
      const step = (STEPS.filter(s => s.k === (CAUSES.filter(x => x.v === c.cause)[0] || {}).step)[0] || { t: '' }).t;
      h += '<div class="fb ' + (ok ? 'ok' : 'no') + '">' +
        (ok ? '成因正确：' + esc(causeText(c.cause)) : '按归一化、流参数、时间轴、容器标记四步走，找第一条被违反的步骤。标准成因：' + esc(causeText(c.cause))) +
        '<br/>违反的步骤：<b>' + esc(step) + '</b>（' + esc(c.obs) + '）';
      h += '<br/>' + esc(c.fb) + '</div>';
    }
    h += '</div>';
  });

  if (state.prioRevealed) {
    h += '<h2 class="stage-h">优先级排序揭晓</h2>';
    h += '<div class="fb info">标准处置优先级排序：<b>' + PRIO_ORDER.join(' → ') + '</b>（按“修完能否立刻解除线上损失”排）。</div>';
    h += '<table><tr><th>案例序号</th><th class="nowrap">标准优先级</th><th>后果标签</th><th class="nowrap">你的优先级</th><th>判定</th></tr>';
    PRIO_ORDER.forEach((n, i) => {
      const c = CASES.filter(x => x.n === n)[0];
      const ok = Number(prio[n]) === c.prio;
      h += '<tr class="' + (ok ? 'pass' : 'block') + '"><td>序号 ' + n + '</td><td>' + (i + 1) + '</td><td>' + CONSEQUENCE[n] + '</td><td>' + (prio[n] === undefined ? '（未提交）' : prio[n]) + '</td><td>' + (ok ? '正确' : '错误') + '</td></tr>';
    });
    h += '</table>';
    h += '<div class="fb info">四个后果标签的归属：已错发内容＝序号 2、3；不可交付＝序号 4；影响观感＝序号 6、1；特定平台触发＝序号 5。</div>';
  }

  h += '<div class="fb info">六个案例对应合成链事故类型的分布：归一化缺失、流参数不一致、时间轴靠估算、内容缺失、容器标记、滤镜顺序各 1 条，各占 16.7%。真实事故里前四类占绝大多数。</div>';

  stage.innerHTML = h;

  stage.querySelectorAll('select[data-c]').forEach(sel => {
    sel.addEventListener('change', () => {
      const n = Number(sel.getAttribute('data-c'));
      if (sel.value === '') { delete picked[n]; } else { picked[n] = sel.value; }
      renderStage();
      renderControls();
    });
  });
  stage.querySelectorAll('input[id^="p"]').forEach(inp => {
    const handler = () => {
      const n = Number(inp.id.replace('p', ''));
      prio[n] = inp.value;
      const b = document.getElementById('btnPrio');
      if (b) b.disabled = !(allPrio() && state.revealed && !state.prioRevealed);
      const c = document.getElementById('prioCount');
      if (c) c.textContent = '已判成因 ' + CASES.filter(x => picked[x.n]).length + ' / 6　已填优先级 ' + CASES.filter(x => prio[x.n] !== undefined && prio[x.n] !== '').length + ' / 6';
    };
    inp.addEventListener('change', handler);
    inp.addEventListener('input', handler);
  });
}

function renderControls() {
  let h = '<h2 class="stage-h">学习者操作区</h2>';
  h += '<div class="row">';
  h += '<button id="btnCause"' + (allPicked() && !state.revealed ? '' : ' disabled') + '>提交六条成因判定</button>';
  h += '<button id="btnPrio"' + (allPrio() && state.revealed && !state.prioRevealed ? '' : ' disabled') + '>提交优先级排序</button>';
  h += '<button id="btnReset">重来</button>';
  h += '<span class="muted" id="prioCount">已判成因 ' + CASES.filter(c => picked[c.n]).length + ' / 6　已填优先级 ' + CASES.filter(c => prio[c.n] !== undefined && prio[c.n] !== '').length + ' / 6</span>';
  h += '</div>';

  if (state.revealed) {
    h += '<div class="fb ' + (causeScore() === 6 ? 'ok' : 'no') + '">成因答对 <b>' + causeScore() + ' / 6</b>。计分：满分 7 分，成因 6 分加排序 1 分；六条判定全部命中“应判成因”列、且至少五条答对处置优先级时算掌握。</div>';
    h += '<div class="fb info">注意序号 2 与序号 3 一个只动声音、一个只动字幕与时间轴；序号 5 的文件在本地完全正常，只能靠平台反馈倒推。两处练的都是“按流分家、按反馈倒推”。</div>';
    h += '<div class="fb info">六个案例没有一条是提示词问题：成因全部落在合成链的四步诊断上。</div>';
  }

  controls.innerHTML = h;

  const b1 = document.getElementById('btnCause');
  if (b1) b1.addEventListener('click', () => {
    state.revealed = true;
    renderStage();
    renderControls();
  });
  const b2 = document.getElementById('btnPrio');
  if (b2) b2.addEventListener('click', () => {
    state.prioRevealed = true;
    renderStage();
    renderControls();
    const f = document.getElementById('prioResult');
    if (f) {
      f.innerHTML = '<div class="fb ' + (prioScore() === 6 ? 'ok' : 'no') + '">' +
        (prioScore() === 6
          ? '优先级正确——已错发的内容优先于不可交付，不可交付优先于影响观感。'
          : '展示四个后果标签（已错发内容、不可交付、影响观感、特定平台触发）各自对应的案例序号。') +
        ' 你的优先级与标准一致 ' + prioScore() + ' / 6 条。</div>';
    }
  });
  const b3 = document.getElementById('btnReset');
  if (b3) b3.addEventListener('click', () => {
    CASES.forEach(c => { delete picked[c.n]; delete prio[c.n]; });
    state.revealed = false; state.prioRevealed = false;
    renderStage();
    renderControls();
  });

  if (state.prioRevealed) {
    const box = document.createElement('div');
    box.id = 'prioResult';
    controls.appendChild(box);
  }
}

renderStage();
renderControls();
