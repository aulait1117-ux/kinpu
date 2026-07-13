/* 菌譜 — 相棒「きんぺい」（育成の遊び心）
 *
 * ちいかわ風の、まるくて小さいオリジナルキャラ（著作権に触れないよう独自に描く）。
 * 毎日使うほど育つ。ノートを書く・菌を調べる・確認試験を確認する…行動で経験値がたまる。
 * データは端末内だけ。何かを外に送ることはない。
 */
const Pet = (() => {
  const LS_PET = 'kinpu.pet';
  const load = () => { try { return JSON.parse(localStorage.getItem(LS_PET)) || {}; } catch { return {}; } };
  const save = (p) => { try { localStorage.setItem(LS_PET, JSON.stringify(p)); } catch {} };

  /* 成長段階。必要経験値としきい値。 */
  const STAGES = [
    { lv: 1, need: 0,   name: 'たまご',   form: 'egg',   word: 'よろしくね' },
    { lv: 2, need: 30,  name: 'ふわ',     form: 'baby',  word: 'いっしょにがんばろ' },
    { lv: 3, need: 90,  name: 'もこ',     form: 'child', word: 'きょうも えらい' },
    { lv: 4, need: 200, name: 'けんさ見習い', form: 'teen', word: 'だいぶ わかってきた' },
    { lv: 5, need: 380, name: 'いちにんまえ', form: 'adult', word: 'たよりに してるよ' },
    { lv: 6, need: 650, name: 'はかせ',   form: 'master', word: 'きみは もう ベテランだね' },
  ];

  /* 行動ごとの経験値。1日に同じ行動で稼げる上限をつけて、狂ったように増えないようにする。 */
  const XP = {
    note:      { xp: 10, capPerDay: 8,  msg: 'ノートを かいた' },
    ai:        { xp: 8,  capPerDay: 6,  msg: 'AIで せいりした' },
    verify:    { xp: 12, capPerDay: 20, msg: '確認試験を たしかめた' },
    view_org:  { xp: 2,  capPerDay: 15, msg: '菌を しらべた' },
    flow:      { xp: 5,  capPerDay: 6,  msg: '同定フローを つかった' },
    daily:     { xp: 6,  capPerDay: 1,  msg: '日報を つくった' },
    photo:     { xp: 6,  capPerDay: 6,  msg: '写真を のこした' },
  };

  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

  function state() {
    const p = load();
    return {
      xp: p.xp || 0,
      streak: p.streak || 0,
      lastDay: p.lastDay || '',
      caps: (p.capDay === todayKey() ? p.caps : {}) || {},
      seenLv: p.seenLv || 1,
    };
  }
  function stageOf(xp) {
    let s = STAGES[0];
    for (const st of STAGES) if (xp >= st.need) s = st;
    return s;
  }
  function next(xp) {
    const cur = stageOf(xp);
    const idx = STAGES.indexOf(cur);
    return STAGES[idx + 1] || null;
  }

  /* 行動を記録。返り値：{ gained, leveledTo(またはnull), msg } 画面で軽く出す用 */
  function act(kind) {
    const def = XP[kind]; if (!def) return { gained: 0 };
    const p = load();
    const tk = todayKey();
    if (p.capDay !== tk) { p.capDay = tk; p.caps = {}; }
    p.caps = p.caps || {};
    const used = p.caps[kind] || 0;
    if (used >= def.capPerDay) { updateStreak(p, tk); save(p); return { gained: 0 }; }
    p.caps[kind] = used + 1;

    const before = stageOf(p.xp || 0);
    p.xp = (p.xp || 0) + def.xp;
    const after = stageOf(p.xp);
    updateStreak(p, tk);
    let leveled = null;
    if (after.lv > before.lv) { leveled = after; }
    save(p);
    return { gained: def.xp, leveledTo: leveled, msg: def.msg, stage: after };
  }
  function updateStreak(p, tk) {
    if (p.lastDay === tk) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yk = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
    p.streak = (p.lastDay === yk) ? (p.streak || 0) + 1 : 1;
    p.lastDay = tk;
  }

  const hasName = () => { const n = load().name; return typeof n === 'string' && !!n.trim(); };
  const getName = () => { const n = load().name; return (typeof n === 'string' && n.trim()) ? n.trim() : 'この子'; };
  const setName = (n) => { const p = load(); p.name = String(n || '').slice(0, 12).trim(); save(p); };

  /* きもち：連続が途切れそう・レベルアップ直後などで表情が変わる */
  function mood() {
    const s = state();
    if (Date.now() - (load().lvUpAt || 0) < 6 * 60 * 60 * 1000) return 'happy';   // 直近に育った
    if (s.lastDay && s.lastDay !== todayKey()) return 'lonely';                    // 今日まだ会ってない
    return 'normal';
  }

  /* タップで返す一言。キャラごとに性格が出る。豊富に用意し、index で回して選ぶ。 */
  const TALKS = {
    cat: {   // マイペースで気まぐれ・語尾ゆるい
      trait: 'マイペース',
      lines: ['にゃ', 'ふぁ〜', 'べつに あわてないよ', 'コアグラーゼ まち…', 'グラム染色 すきかも',
        'その菌 きになる', 'きゅうけい しよ', 'まぁ なんとかなる', 'ねむい…', 'ひなたぼっこ したい',
        'きょうの おやつ なに？', 'むずかしい ことは あとで', 'まったり いこ', 'ん〜 のびのび',
        'GPCって まるいやつ でしょ', 'かんさつ は とくい', 'ふぅ ひとやすみ', 'きみが いるから いっか',
        'たまには さぼりたい にゃ', 'エサ どこ〜', 'なんか いいこと ないかな', 'まぁ きみに まかせた'],
      levelup: ['おっきく なった にゃ', 'べつに うれしくないし…（うれしい）', 'ふぁ〜 せいちょうき？'],
      lonely: ['あれ ひさしぶり…', 'まってた わけじゃ ないよ？', 'ちょっと さみしかった にゃ'],
    },
    rabbit: {   // 元気・前のめり・応援団
      trait: 'げんき',
      lines: ['がんばろー！', 'つぎ いこ つぎ！', 'えらいっ！', 'もっと しらべよ！', 'ぴょんっ',
        'きょうも さいこう！', 'まけないぞー', 'わくわく！', '確認 だいじだよ！', 'いっしょに べんきょ！',
        'その調子 その調子！', 'ふぁいと〜！', 'きみ てんさい かも！', 'つぎは なに しらべる？',
        'メモ とった？ えらい！', 'どんどん いこ！', 'きょうの きみ かがやいてる！', 'やる気 まんたん！',
        'にんじん たべた？', 'いっぱい おぼえよう！', 'あきらめない！', 'えいえい おー！'],
      levelup: ['やったー おっきくなった！', 'レベルアップ うれしい！', 'つよく なったよー！'],
      lonely: ['まってたよー！', 'あいたかった！', 'やっと きてくれた！'],
    },
    bear: {   // のんびり・やさしい・包容力
      trait: 'のんびり',
      lines: ['ゆっくり いこう', 'むりしないでね', 'よく がんばってるね', 'ほっと ひといき',
        'えらいねぇ', 'あわてないで だいじょうぶ', 'おつかれさま', 'そばに いるよ', 'ぎゅっ',
        'ちゃんと ごはん たべた？', 'つかれたら やすもうね', 'きみの ペースで いいよ', 'あったかいね',
        'はちみつ たべる？', 'きょうも えらかった', 'すこし きゅうけい しよ', 'ねむく なったら ねてね',
        'こわい菌でも だいじょうぶ おちついて', 'まちがえても いいんだよ', 'よしよし', 'のんびり ね',
        'きみが がんばってるの しってるよ'],
      levelup: ['おおきく なったねぇ', 'ゆっくり つよく なったね', 'すごいよ えらいよ'],
      lonely: ['おかえり', 'ずっと ここに いたよ', 'あえて うれしい'],
    },
    penguin: {   // しっかり者・几帳面・仕事人
      trait: 'しっかりや',
      lines: ['確認 しようね', 'てじゅん だいじ', '報告 わすれずに', 'きろく のこそう', 'ミス ふせごう',
        'CRE は 届出だよ', 'ていねいに いこう', 'よし ちゃんとできてる', 'きりっ', 'ダブルチェック だいじ',
        'コンタミ 気をつけて', '復唱確認 したかな？', '菌名 断定は まだ はやい', 'SOP みてみよ',
        'バックアップ とった？', 'いちにちの おわりに にっぽう', '感染対策 わすれずに', 'ふぅ きょうも かんぺき',
        '手あらい しっかり', 'CLSI 最新版 みてる？', 'あわてず せいかくに', 'よし つぎの けんたい'],
      levelup: ['成長 記録 更新です', 'つよく なりました きりっ', 'レベルアップ 確認しました'],
      lonely: ['おそかったですね', 'まっていました', 'ちゃんと きてくれて よかった'],
    },
  };
  function pick(arr, i) { return arr[((i % arr.length) + arr.length) % arr.length]; }
  function talk(i, kind) {
    const t = TALKS[curSpecies()] || TALKS.cat;
    if (kind === 'levelup' && t.levelup) return pick(t.levelup, i);
    if (kind === 'lonely' && t.lonely) return pick(t.lonely, i);
    return pick(t.lines, i);
  }
  const trait = () => (TALKS[curSpecies()] || TALKS.cat).trait;

  /* コレクション（バッジ）。条件を満たすと集まる。 */
  const BADGES = [
    { id: 'first_note', emoji: '📝', name: 'はじめの一歩', desc: 'ノートを1つ書いた' },
    { id: 'note10',     emoji: '📚', name: 'ノート10', desc: 'ノートを10こ書いた' },
    { id: 'verify1',    emoji: '✅', name: 'はじめての確認', desc: '確認試験を1つ確認した' },
    { id: 'verify10',   emoji: '🎯', name: '確認の達人', desc: '確認試験を10こ確認した' },
    { id: 'org20',      emoji: '🦠', name: '菌ずかん', desc: '菌を20種のぞいた' },
    { id: 'flow1',      emoji: '🔬', name: '同定デビュー', desc: '同定フローを使った' },
    { id: 'ai1',        emoji: '✨', name: 'AIとなかよし', desc: 'AI整理を使った' },
    { id: 'streak3',    emoji: '🔥', name: '3日つづいた', desc: '3日れんぞくで会った' },
    { id: 'streak7',    emoji: '🌟', name: '1週間つづいた', desc: '7日れんぞくで会った' },
    { id: 'master',     emoji: '🎓', name: 'はかせになった', desc: 'さいだいまで育てた' },
  ];
  function badges() { return load().badges || {}; }
  /* 現在の統計から、新たに達成したバッジを返す（付与もする） */
  function checkBadges(stats) {
    const p = load(); p.badges = p.badges || {};
    const got = [];
    const give = (id, cond) => { if (cond && !p.badges[id]) { p.badges[id] = Date.now(); got.push(BADGES.find((b) => b.id === id)); } };
    give('first_note', stats.notes >= 1);
    give('note10', stats.notes >= 10);
    give('verify1', stats.verified >= 1);
    give('verify10', stats.verified >= 10);
    give('org20', (p.orgSeen || 0) >= 20);
    give('flow1', stats.flowUsed);
    give('ai1', stats.aiUsed);
    give('streak3', (p.streak || 0) >= 3);
    give('streak7', (p.streak || 0) >= 7);
    give('master', stageOf(p.xp || 0).lv >= 6);
    if (got.length) save(p);
    return got;
  }
  /* 菌を見た累計（org20バッジ用）。重複は数えない */
  function seeOrg(id) {
    const p = load(); p.orgSeenSet = p.orgSeenSet || {};
    if (!p.orgSeenSet[id]) { p.orgSeenSet[id] = 1; p.orgSeen = Object.keys(p.orgSeenSet).length; save(p); }
  }

  /* act() でレベルアップした瞬間を記録（mood='happy' 用） */
  const _act = act;
  function actTracked(kind) {
    const r = _act(kind);
    if (r && r.leveledTo) { const p = load(); p.lvUpAt = Date.now(); save(p); }
    return r;
  }

  /* 育てられるキャラの種類。最初は cat だけ。はかせ(Lv6)まで育てると次が解禁される。 */
  const SPECIES = [
    { id: 'cat',     emoji: '🐱', label: 'はちわれ猫' },
    { id: 'rabbit',  emoji: '🐰', label: 'うさぎ' },
    { id: 'bear',    emoji: '🐻', label: 'くま' },
    { id: 'penguin', emoji: '🐧', label: 'ぺんぎん' },
  ];
  const curSpecies = () => load().species || 'cat';
  const isMaxed = () => stageOf(load().xp || 0).lv >= 6;
  /* 解禁済みの種類。cat は最初から。はかせ(Lv6)まで育てるたびに次が1つ開く。
   * 「いま はかせで、まだ記録に残していない」状態も1つぶんとして数える
   * （そうしないと、解放するには乗り換えが要り、乗り換えには解放が要る…のデッドロックになる）。 */
  function unlocked() {
    const p = load();
    const cleared = p.cleared || {};
    const bonus = (isMaxed() && !cleared[curSpecies()]) ? 1 : 0;
    const n = 1 + Object.keys(cleared).length + bonus;
    return SPECIES.slice(0, Math.min(n, SPECIES.length)).map((s) => s.id);
  }
  /* 別のキャラに乗り換える。今の子が「はかせ」なら、その種類をクリア済みにして経験値をリセット。
   * 図鑑的に、育てた子の記録（クリア）は残る。 */
  function switchSpecies(id) {
    if (!unlocked().includes(id)) return false;
    const p = load();
    if (isMaxed()) { p.cleared = p.cleared || {}; p.cleared[curSpecies()] = true; }
    p.species = id;
    p.xp = 0;                 // 新しい子は たまご から
    p.name = '';              // 名前もリセット（新しい子だから）
    p.lvUpAt = 0;
    save(p);
    return true;
  }
  const clearedList = () => load().cleared || {};

  return { STAGES, XP, state, stageOf, next, act: actTracked, getName, setName, hasName,
    mood, talk, BADGES, badges, checkBadges, seeOrg,
    SPECIES, curSpecies, unlocked, isMaxed, switchSpecies, clearedList,
    markSeen: (lv) => { const p = load(); p.seenLv = lv; save(p); } };
})();

/* オリジナルの相棒たち（本物のキャラは複製しない。まるい・小さい・点目・ほっぺの雰囲気だけ借りる）。
 * species で見た目、form で成長段階、mood で表情が変わる。線はテーマに馴染む墨色。 */
function petSVG(form, opts = {}) {
  const size = opts.size || 120;
  const species = opts.species || 'cat';
  const mood = opts.mood || 'normal';
  const line = '#4a403a';
  const st = 2.4;

  /* 種類ごとの色と耳。 */
  const SP = {
    cat:     { ink: '#3f3a44', ear: 'cat',    hasHachi: true },
    rabbit:  { ink: '#f0e4ea', ear: 'rabbit', hasHachi: false, inner: '#f6b8bf' },
    bear:    { ink: '#c9a06a', ear: 'round',  hasHachi: false },
    penguin: { ink: '#3f4a5a', ear: 'none',   hasHachi: false, belly: true },
  };
  const s = SP[species] || SP.cat;
  const ink = s.ink;

  function ears() {
    if (s.ear === 'cat') return `
      <path d="M 34 44 L 30 24 L 48 38 Z" fill="${ink}" stroke="${line}" stroke-width="${st}" stroke-linejoin="round"/>
      <path d="M 86 44 L 90 24 L 72 38 Z" fill="${ink}" stroke="${line}" stroke-width="${st}" stroke-linejoin="round"/>`;
    if (s.ear === 'rabbit') return `
      <ellipse cx="45" cy="24" rx="8" ry="20" fill="${ink}" stroke="${line}" stroke-width="${st}"/>
      <ellipse cx="75" cy="24" rx="8" ry="20" fill="${ink}" stroke="${line}" stroke-width="${st}"/>
      <ellipse cx="45" cy="26" rx="3.5" ry="13" fill="${s.inner || '#f6b8bf'}"/>
      <ellipse cx="75" cy="26" rx="3.5" ry="13" fill="${s.inner || '#f6b8bf'}"/>`;
    if (s.ear === 'round') return `
      <circle cx="36" cy="36" r="12" fill="${ink}" stroke="${line}" stroke-width="${st}"/>
      <circle cx="84" cy="36" r="12" fill="${ink}" stroke="${line}" stroke-width="${st}"/>`;
    return '';
  }
  /* 目（mood で形が変わる） */
  function eyes(cx1, cx2, cy, r) {
    if (mood === 'happy') return `
      <path d="M ${cx1 - r} ${cy} Q ${cx1} ${cy - r - 1} ${cx1 + r} ${cy}" stroke="#2b2730" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M ${cx2 - r} ${cy} Q ${cx2} ${cy - r - 1} ${cx2 + r} ${cy}" stroke="#2b2730" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    if (mood === 'lonely') return `
      <circle cx="${cx1}" cy="${cy + 1}" r="${r}" fill="#2b2730"/><circle cx="${cx2}" cy="${cy + 1}" r="${r}" fill="#2b2730"/>
      <path d="M ${cx1 - r - 1} ${cy - r - 1} L ${cx1 + r} ${cy - r + 1}" stroke="#2b2730" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M ${cx2 + r + 1} ${cy - r - 1} L ${cx2 - r} ${cy - r + 1}" stroke="#2b2730" stroke-width="1.6" stroke-linecap="round"/>`;
    return `
      <circle cx="${cx1}" cy="${cy}" r="${r}" fill="#2b2730"/><circle cx="${cx2}" cy="${cy}" r="${r}" fill="#2b2730"/>
      <circle cx="${cx1 + 1.2}" cy="${cy - 1.2}" r="1.1" fill="#fff"/><circle cx="${cx2 + 1.2}" cy="${cy - 1.2}" r="1.1" fill="#fff"/>`;
  }
  /* 顔 */
  function head(extra = '') {
    const hachi = s.hasHachi ? `
      <path d="M 21 60 Q 21 33 60 32 Q 99 33 99 60 Q 84 52 72 54 L 60 78 L 48 54 Q 36 52 21 60 Z" fill="${ink}"/>` : '';
    const cap = s.hasHachi ? '' : `<path d="M 30 52 Q 30 33 60 32 Q 90 33 90 52" fill="none" stroke="${ink}" stroke-width="0"/>`;
    const faceFill = s.hasHachi ? '#fff' : (species === 'penguin' ? '#fff' : ink);
    const penguinFace = species === 'penguin' ? `
      <path d="M 60 30 Q 92 32 96 62 Q 90 84 60 88 Q 30 84 24 62 Q 28 32 60 30 Z" fill="${ink}"/>
      <ellipse cx="60" cy="70" rx="27" ry="24" fill="#fff"/>` : '';
    return `
      ${species === 'penguin' ? penguinFace : `<ellipse cx="60" cy="66" rx="39" ry="37" fill="${faceFill}" stroke="#e7ddd0" stroke-width="${st}"/>`}
      ${hachi}
      ${eyes(46, 74, 64, 3.6)}
      <ellipse cx="41" cy="74" rx="5" ry="3.2" fill="#f6b8bf" opacity="0.8"/>
      <ellipse cx="79" cy="74" rx="5" ry="3.2" fill="#f6b8bf" opacity="0.8"/>
      ${species === 'penguin'
        ? '<path d="M 55 70 L 60 76 L 65 70 Z" fill="var(--sun)"/>'
        : `<path d="M 55 73 Q 60 ${mood === 'lonely' ? 75 : 77} 65 73" stroke="${line}" stroke-width="2" fill="none" stroke-linecap="round"/>`}
      ${extra}`;
  }
  const arms = `
    <ellipse cx="26" cy="82" rx="8.5" ry="11" fill="${species === 'penguin' ? ink : '#fff'}" stroke="#e7ddd0" stroke-width="${st}"/>
    <ellipse cx="94" cy="82" rx="8.5" ry="11" fill="${species === 'penguin' ? ink : '#fff'}" stroke="#e7ddd0" stroke-width="${st}"/>`;
  /* キャラごとの衣装（サイン的な小物）。首まわりに描く。 */
  function costume() {
    if (species === 'cat') return `
      <path d="M 40 92 Q 60 100 80 92 L 78 99 Q 60 106 42 99 Z" fill="#e0705a"/>
      <path d="M 78 96 l 8 10 l -7 2 l -3 -9 Z" fill="#c85a48"/>`;   // 赤いマフラー
    if (species === 'rabbit') return `
      <path d="M 48 46 l -7 -4 l 1 8 Z" fill="#f0849a"/>
      <path d="M 42 46 l -7 4 l 8 3 Z" fill="#f0849a"/>
      <circle cx="45" cy="47" r="3" fill="#e06880"/>`;   // 耳もとのリボン
    if (species === 'bear') return `
      <path d="M 52 92 l -9 5 l 9 4 Z" fill="var(--sun)"/>
      <path d="M 68 92 l 9 5 l -9 4 Z" fill="var(--sun)"/>
      <circle cx="60" cy="96" r="4" fill="#d99a3f"/>`;   // 蝶ネクタイ
    if (species === 'penguin') return `
      <path d="M 51 88 l -7 4 l 7 3 Z" fill="var(--lav)"/>
      <path d="M 69 88 l 7 4 l -7 3 Z" fill="var(--lav)"/>
      <circle cx="60" cy="91" r="3.4" fill="#8a78c8"/>`;   // ボウタイ
    return '';
  }
  const feet = `
    <ellipse cx="46" cy="104" rx="9" ry="6" fill="${species === 'penguin' ? 'var(--sun)' : '#fff'}" stroke="#e7ddd0" stroke-width="${st}"/>
    <ellipse cx="74" cy="104" rx="9" ry="6" fill="${species === 'penguin' ? 'var(--sun)' : '#fff'}" stroke="#e7ddd0" stroke-width="${st}"/>`;

  let body = '';
  if (form === 'egg') {
    body = `<ellipse cx="60" cy="64" rx="33" ry="39" fill="#fff" stroke="#e7ddd0" stroke-width="${st}"/>
      <path d="M 30 58 l 8 -8 l 7 8 l 8 -9 l 8 9 l 7 -8 l 9 8" fill="none" stroke="#e7ddd0" stroke-width="${st}" stroke-linejoin="round"/>
      <path d="M 33 44 Q 33 30 60 30 Q 87 30 87 44 Q 74 40 60 55 Q 46 40 33 44 Z" fill="${ink}" opacity="0.85"/>
      <circle cx="52" cy="60" r="2.8" fill="#2b2730"/><circle cx="68" cy="60" r="2.8" fill="#2b2730"/>
      <path d="M 56 66 Q 60 69 64 66" stroke="${line}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  } else if (form === 'baby') {
    body = `${ears()}${head()}`;
  } else if (form === 'child') {
    body = `${ears()}${arms}${costume()}${head()}`;
  } else if (form === 'teen') {
    body = `${ears()}${arms}${costume()}${head()}${feet}`;
  } else if (form === 'adult') {
    body = `${ears()}${arms}${costume()}${head()}${feet}`;
  } else {
    body = `${ears()}${arms}${costume()}${head()}${feet}
      <rect x="40" y="18" width="40" height="8" rx="2" fill="var(--lav)"/>
      <rect x="52" y="10" width="16" height="10" rx="2" fill="var(--lav)"/>
      <path d="M 80 22 l 6 3 l -2 8" stroke="var(--sun)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <circle cx="84" cy="33" r="2.6" fill="var(--sun)"/>`;
  }
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"
    class="pet-svg" role="img" aria-label="相棒">${body}</svg>`;
}
