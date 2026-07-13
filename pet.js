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

  const getName = () => { const n = load().name; return (typeof n === 'string' && n.trim()) ? n.trim() : 'きんぺい'; };
  const setName = (n) => { const p = load(); p.name = String(n || '').slice(0, 12).trim(); save(p); };

  return { STAGES, XP, state, stageOf, next, act, getName, setName,
    markSeen: (lv) => { const p = load(); p.seenLv = lv; save(p); } };
})();

/* はちわれ風・オリジナルの相棒（本物のキャラは複製しない。特徴＝猫耳・頭が濃色・
 * 顔の中央で白く割れた八の字模様・点目・ほっぺ、だけを借りる）。
 * 成長段階(form)で耳や手足が生えて姿が変わる。線は темаに馴染む墨色。 */
function petSVG(form, opts = {}) {
  const size = opts.size || 120;
  const ink = '#3f3a44';        // 頭の濃い色（はちわれの黒い部分の代わり・少し青みの墨）
  const line = '#4a403a';
  const st = 2.4;

  /* 猫耳（頭頂の濃色とつながる） */
  const ears = `
    <path d="M 34 44 L 30 24 L 48 38 Z" fill="${ink}" stroke="${line}" stroke-width="${st}" stroke-linejoin="round"/>
    <path d="M 86 44 L 90 24 L 72 38 Z" fill="${ink}" stroke="${line}" stroke-width="${st}" stroke-linejoin="round"/>`;
  /* 顔：白い下半分＋濃色の頭、中央が白く割れた八の字 */
  const head = (extra = '') => `
    <ellipse cx="60" cy="66" rx="39" ry="37" fill="#fff" stroke="#e7ddd0" stroke-width="${st}"/>
    <path d="M 21 60 Q 21 33 60 32 Q 99 33 99 60
             Q 84 52 72 54 L 60 78 L 48 54 Q 36 52 21 60 Z"
          fill="${ink}"/>
    <circle cx="46" cy="64" r="3.6" fill="#fff"/>
    <circle cx="74" cy="64" r="3.6" fill="#fff"/>
    <circle cx="46" cy="64" r="3.6" fill="#2b2730"/>
    <circle cx="74" cy="64" r="3.6" fill="#2b2730"/>
    <circle cx="47.2" cy="62.8" r="1.1" fill="#fff"/>
    <circle cx="75.2" cy="62.8" r="1.1" fill="#fff"/>
    <ellipse cx="41" cy="74" rx="5" ry="3.2" fill="#f6b8bf" opacity="0.85"/>
    <ellipse cx="79" cy="74" rx="5" ry="3.2" fill="#f6b8bf" opacity="0.85"/>
    <path d="M 55 73 Q 60 77 65 73" stroke="${line}" stroke-width="2" fill="none" stroke-linecap="round"/>
    ${extra}`;
  const arms = `
    <ellipse cx="26" cy="82" rx="8.5" ry="11" fill="#fff" stroke="#e7ddd0" stroke-width="${st}"/>
    <ellipse cx="94" cy="82" rx="8.5" ry="11" fill="#fff" stroke="#e7ddd0" stroke-width="${st}"/>`;
  const feet = `
    <ellipse cx="46" cy="104" rx="9" ry="6" fill="#fff" stroke="#e7ddd0" stroke-width="${st}"/>
    <ellipse cx="74" cy="104" rx="9" ry="6" fill="#fff" stroke="#e7ddd0" stroke-width="${st}"/>`;

  let body = '';
  if (form === 'egg') {
    /* たまご：まだ耳も生えていない。殻から顔だけ */
    body = `<ellipse cx="60" cy="64" rx="33" ry="39" fill="#fff" stroke="#e7ddd0" stroke-width="${st}"/>
      <path d="M 30 58 l 8 -8 l 7 8 l 8 -9 l 8 9 l 7 -8 l 9 8" fill="none" stroke="#e7ddd0" stroke-width="${st}" stroke-linejoin="round"/>
      <path d="M 33 44 Q 33 30 60 30 Q 87 30 87 44 Q 74 40 60 55 Q 46 40 33 44 Z" fill="${ink}" opacity="0.9"/>
      <circle cx="52" cy="60" r="2.8" fill="#2b2730"/><circle cx="68" cy="60" r="2.8" fill="#2b2730"/>
      <path d="M 56 66 Q 60 69 64 66" stroke="${line}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  } else if (form === 'baby') {
    body = `${ears}${head()}`;
  } else if (form === 'child') {
    body = `${ears}${arms}${head()}`;
  } else if (form === 'teen') {
    body = `${ears}${arms}${head()}${feet}`;
  } else if (form === 'adult') {
    /* いちにんまえ：ちょっと得意げなキラキラ目 */
    body = `${ears}${arms}${head(`
      <path d="M 43 59 Q 46 56 49 59" stroke="${line}" stroke-width="1.5" fill="none"/>
      <path d="M 71 59 Q 74 56 77 59" stroke="${line}" stroke-width="1.5" fill="none"/>`)}${feet}`;
  } else { /* master：はかせ帽 */
    body = `${ears}${arms}${head()}${feet}
      <rect x="40" y="20" width="40" height="8" rx="2" fill="var(--lav)"/>
      <rect x="52" y="12" width="16" height="10" rx="2" fill="var(--lav)"/>
      <path d="M 80 24 l 6 3 l -2 8" stroke="var(--sun)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <circle cx="84" cy="35" r="2.6" fill="var(--sun)"/>`;
  }
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"
    class="pet-svg" role="img" aria-label="相棒">${body}</svg>`;
}
