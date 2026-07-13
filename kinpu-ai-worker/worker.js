/* 菌譜 AIサーバー（Cloudflare Worker）
 *
 * 役割はひとつ。雑なメモと写真を受け取り、Claudeに整理させて返すだけ。
 * ノートそのものは保存しない。ログにも残さない。通り抜けるだけの管。
 *
 * 必要なシークレット（wrangler secret put で入れる。コードには絶対書かない）：
 *   ANTHROPIC_API_KEY
 *
 * 任意の環境変数：
 *   ALLOW_ORIGIN  … 許可するオリジン（既定：https://aulait1117-ux.github.io）
 *   DAILY_LIMIT   … 1日の呼び出し上限（既定：200）。KVバインディング KINPU_KV があるときだけ効く
 */

/* Haiku では steps（作業手順）を空のまま返してくることが再現した。
 * 「雑なメモを手順書に起こす」がこの機能の核なので、そこを外す安さは意味がない。
 * 呼び出しは1日50回で頭打ちにしてあるため、上位モデルでも費用は誤差の範囲。 */
const MODEL = 'claude-sonnet-5';

const SYSTEM = `あなたは臨床検査技師（微生物検査室・入職3か月目）の相棒です。
その人が現場で走り書きしたメモや、手書きノートの写真を受け取り、あとから引ける形に整えます。

守ること：
- 患者が特定できる情報（氏名・カルテID・検体番号・生年月日・病棟番号）は、入力に含まれていても出力に絶対に写さない。見つけたら cautions に「患者情報が含まれています。消してください」と入れる。
- 入力に書かれていないことを創作しない。メモにない手順を足さない。推測を書くときは「〜かもしれない」と明示する。
- 医学的な断定をしない。ブレークポイントの数値や判定基準を勝手に書かない。「CLSI M100と施設SOPで確認」と促す。
- 口調はやさしく、親しみやすく。ただし業務メモなので、かわいさより「あとで読んで分かること」を優先する。
- 日本語で書く。

steps（作業手順）の埋め方 — ここを空にしないこと：
メモに「〜した」「〜する」という行為が2つ以上あれば、必ず steps を時系列に分解して埋める。
走り書きは主語も順番も省かれている。省かれた部分を補って、次に同じ場面に出くわした人が
そのまま辿れる手順に書き直すのが、この機能の存在意義。
例：「血培陽性だったのでグラム染色して先生に電話した」
  → steps: ["血液培養の陽性を確認する", "グラム染色を実施する", "染色所見を確認する",
            "主治医へ電話で第一報を入れる", "実施内容を記録に残す"]
kind を sop（作業手順）にしたのに steps が空、という矛盾は絶対に起こさないこと。

cautions（注意点）の埋め方：
「先輩に注意された」「間違えやすい」「〜するな と言われた」に類することが書いてあれば、必ず入れる。
また、そのメモの内容で新人が踏みやすい落とし穴に気づいたら、メモの範囲内で1つ添えてよい。`;

const TOOL = {
  name: 'organize_note',
  description: '検査技師の走り書きを、あとから引けるノートに整える',
  input_schema: {
    type: 'object',
    properties: {
      title:    { type: 'string', description: '一目で内容がわかる見出し。15〜30字' },
      kind:     { type: 'string', enum: ['knowledge', 'sop', 'trouble', 'case', 'device', 'handover', 'senpai'],
                  description: 'ノートの種類。knowledge=細菌検査の知識 / sop=作業手順 / trouble=機器トラブル / case=症例 / device=機器操作 / handover=申し送り・報告 / senpai=先輩メモ' },
      summary:  { type: 'string', description: '一言まとめ。40字以内' },
      points:   { type: 'array', items: { type: 'string' }, minItems: 3,
                  description: '要点。必ず配列で3〜5個。1文ずつ分けて配列の要素にする。1本の文字列にまとめない' },
      cautions: { type: 'array', items: { type: 'string' },
                  description: '見落としやすい注意点。必ず配列。1件ずつ要素に分ける。無ければ空配列' },
      steps:    { type: 'array', items: { type: 'string' },
                  description: '実際にやった／やる作業手順。必ず配列で、1手順=1要素に分ける。番号は付けない。メモに動作が2つ以上あれば必ず埋める（例：「血液培養の陽性を確認する」「グラム染色を実施する」「所見を医師へ電話報告する」）。手順の話が全く無い場合だけ空配列' },
      tips:     { type: 'array', items: { type: 'string' },
                  description: '現場のコツ・先輩から教わった内容。必ず配列。1件ずつ要素に分ける。無ければ空配列' },
      report:   { type: 'string', description: '報告・連絡が要る内容。無ければ空文字' },
      tags:     { type: 'array', items: { type: 'string' }, minItems: 3,
                  description: '#付きのタグ。必ず配列で3〜6個。1個ずつ要素に分ける。例 ["#血液培養","#報告","#MRSA"]' },
      orgIds:   { type: 'array', items: { type: 'string' }, description: '関連する菌のid。渡された一覧の中からだけ選ぶ' },
      mechIds:  { type: 'array', items: { type: 'string' }, description: '関連する耐性機序のid。渡された一覧の中からだけ選ぶ' },
      classIds: { type: 'array', items: { type: 'string' }, description: '関連する抗菌薬系統のid。渡された一覧の中からだけ選ぶ' },
      captions: { type: 'array', items: { type: 'string' }, description: '写真ごとの説明。渡された画像の順番と同じ数だけ' },
    },
    required: ['title', 'kind', 'summary', 'points', 'cautions', 'steps', 'tips', 'tags'],
  },
};

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || 'https://aulait1117-ux.github.io',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
const json = (o, env, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...cors(env) } });

/* 鍵はサーバー側にあるので、誰かがURLを知ると請求が伸びる。1日の上限で頭を止める。 */
async function overLimit(env) {
  if (!env.KINPU_KV) return false;
  const limit = Number(env.DAILY_LIMIT || 200);
  const key = 'calls:' + new Date().toISOString().slice(0, 10);
  const n = Number((await env.KINPU_KV.get(key)) || 0);
  if (n >= limit) return true;
  await env.KINPU_KV.put(key, String(n + 1), { expirationTtl: 172800 });
  return false;
}

/* Claude に投げる共通処理。ツール強制で構造化出力を受け取る。 */
async function callClaude(env, system, content, tool, maxTokens = 2000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens, system, tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content }],
    }),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  const use = (d.content || []).find((c) => c.type === 'tool_use');
  if (!use) throw new Error('no tool_use');
  return use.input || {};
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(env) });
    if (url.pathname === '/health') return json({ ok: true, model: MODEL }, env);

    const ROUTES = { '/organize': organize, '/describe': describe, '/daily': daily };
    const handler = ROUTES[url.pathname];
    if (!handler || req.method !== 'POST') return json({ error: 'not found' }, env, 404);

    /* CORSはブラウザにしか効かない。curl等の素の呼び出しには Origin / Referer で軽く蓋をする。 */
    const allow = env.ALLOW_ORIGIN || 'https://aulait1117-ux.github.io';
    const origin = req.headers.get('origin') || '';
    const referer = req.headers.get('referer') || '';
    if (!(origin === allow || referer.startsWith(allow))) return json({ error: 'not allowed' }, env, 403);

    if (!env.ANTHROPIC_API_KEY) return json({ error: 'APIキーが未設定' }, env, 500);
    if (await overLimit(env)) return json({ error: '今日の上限に達しました。明日また使えます。' }, env, 429);

    const clen = Number(req.headers.get('content-length') || 0);
    if (clen && clen > 12_000_000) return json({ error: 'データが大きすぎます' }, env, 413);

    let body;
    try { body = await req.json(); } catch { return json({ error: '読めない入力' }, env, 400); }
    try { return await handler(body, env); }
    catch (e) { return json({ error: 'AIエラー: ' + e.message }, env, 502); }
  },
};

/* 画像を content 用に整える（合計8MBまで） */
function imagesToContent(images) {
  const content = [];
  let budget = 8_000_000;
  for (const d of (Array.isArray(images) ? images.slice(0, 4) : [])) {
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(d));
    if (!m || m[2].length > budget) continue;
    budget -= m[2].length;
    content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  return content;
}

/* ========== /organize ========== */
async function organize(body, env) {
  const text = String(body.text || '').slice(0, 8000);
  const imgs = imagesToContent(body.images);
  if (!text && !imgs.length) return json({ error: '中身が空' }, env, 400);

  const list = (a, f) => (a || []).slice(0, 200).map(f).join('\n');
  const content = [...imgs, {
    type: 'text',
    text: `次のメモ${imgs.length ? 'と、手書きノートの写真' : ''}を整理してください。

${text ? '【メモ】\n' + text : '【メモ】\n（本文なし。写真から読み取ってください）'}

【選べる菌のid一覧】
${list(body.organisms, (o) => `${o.id} = ${o.jp}（${o.name}）`)}

【選べる耐性機序のid一覧】
${list(body.mechanisms, (m) => `${m.id} = ${m.abbr}`)}

【選べる抗菌薬系統のid一覧】
${list(body.classes, (c) => `${c.id} = ${c.name}`)}

organize_note ツールを必ず呼んで返してください。id は上の一覧に存在するものだけを使ってください。`,
  }];

  const out = await callClaude(env, SYSTEM, content, TOOL);
  const KINDS = ['knowledge', 'sop', 'trouble', 'case', 'device', 'handover', 'senpai'];
  return json({
    title: str(out.title),
    kind: KINDS.includes(out.kind) ? out.kind : 'knowledge',
    summary: str(out.summary),
    points: arr(out.points), cautions: arr(out.cautions),
    steps: arr(out.steps), tips: arr(out.tips),
    report: str(out.report),
    tags: arr(out.tags).map((t) => (t.startsWith('#') ? t : '#' + t)),
    orgIds: idsIn(out.orgIds, body.organisms), mechIds: idsIn(out.mechIds, body.mechanisms),
    classIds: idsIn(out.classIds, body.classes),
    captions: arr(out.captions),
  }, env);
}

/* 返り値の型を必ず均す（モデルが配列でなく文字列を返すことがある） */
function arr(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string' && v.trim()) {
    return v.split(/\r?\n|(?<=。)(?=\S)/)
      .map((s) => s.replace(/^\s*(?:[-−・*●○]|\d+[.)、]|[①-⑳])\s*/, '').trim()).filter(Boolean);
  }
  return [];
}
const str = (v) => (typeof v === 'string' ? v.trim() : Array.isArray(v) ? v.join(' ') : '');
const idsIn = (v, listOfObj) => { const ok = new Set((listOfObj || []).map((o) => o.id)); return arr(v).filter((x) => ok.has(x)); };

/* ========== /describe：グラム染色・コロニーの写真を言葉にする（学習用） ========== */
const DESCRIBE_SYSTEM = `あなたは臨床検査技師（微生物・入職3か月目）の学習を助ける相棒です。
グラム染色像・培地・コロニーの写真を受け取り、そこに何が見えるかを言葉にします。

守ること：
- 見えたものだけを述べる。写っていないものを想像で足さない。
- 菌名を断定しない。「〜を疑う所見」「〜と矛盾しない」まで。最終判断は本人と施設の同定手順に委ねる。
- 患者情報（氏名・ID・検体番号）が写り込んでいたら、findings ではなく caution に「患者情報が写っています。共有前に隠してください」と入れる。
- やさしく、学習の助けになるように。ただし正確さを最優先。日本語で。`;
const DESCRIBE_TOOL = {
  name: 'describe_image',
  description: 'グラム染色・コロニー写真の所見を言葉にする',
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', description: '写真の種類（例：グラム染色 / 血液寒天のコロニー / 培地 / 不明）' },
      findings: { type: 'array', items: { type: 'string' }, description: '見える所見。グラム染色なら陽性/陰性・形態・配列・貪食像など。コロニーなら色・大きさ・溶血・光沢など。2〜5個' },
      suspect: { type: 'array', items: { type: 'string' }, description: '所見と矛盾しない菌の候補（断定しない）。無ければ空' },
      next: { type: 'array', items: { type: 'string' }, description: '次に確認するとよい検査（カタラーゼ等）。無ければ空' },
      caution: { type: 'string', description: '注意（患者情報の写り込み等）。無ければ空' },
    },
    required: ['kind', 'findings'],
  },
};
async function describe(body, env) {
  const imgs = imagesToContent(body.images);
  if (!imgs.length) return json({ error: '写真がない' }, env, 400);
  const content = [...imgs, { type: 'text',
    text: 'この写真に見える所見を describe_image で返してください。菌名は断定せず、候補と次の検査まで。' }];
  const out = await callClaude(env, DESCRIBE_SYSTEM, content, DESCRIBE_TOOL, 1200);
  return json({
    kind: str(out.kind), findings: arr(out.findings),
    suspect: arr(out.suspect), next: arr(out.next), caution: str(out.caution),
  }, env);
}

/* ========== /daily：その日のノートから日報をつくる ========== */
const DAILY_SYSTEM = `あなたは臨床検査技師の相棒です。その日に書かれた業務ノートの断片を受け取り、
本人が一日を振り返る日報にまとめます。ノートに書かれていないことは足さない。
患者情報が混じっていたら日報には写さない。やさしく、簡潔に。日本語で。`;
const DAILY_TOOL = {
  name: 'make_daily',
  description: 'その日のノートから日報をつくる',
  input_schema: {
    type: 'object',
    properties: {
      done: { type: 'array', items: { type: 'string' }, description: '本日やったこと。ノートに基づく' },
      learned: { type: 'array', items: { type: 'string' }, description: '学んだこと・気づき' },
      troubles: { type: 'array', items: { type: 'string' }, description: '発生したトラブルと対応。無ければ空' },
      tomorrow: { type: 'array', items: { type: 'string' }, description: '明日やること・持ち越し。無ければ空' },
      oneline: { type: 'string', description: '一日を一言で' },
    },
    required: ['done', 'oneline'],
  },
};
async function daily(body, env) {
  const notes = (Array.isArray(body.notes) ? body.notes : []).slice(0, 60)
    .map((n) => `[${n.kind || ''}] ${String(n.title || '').slice(0, 60)}｜${String(n.body || '').slice(0, 300)}`)
    .join('\n');
  if (!notes.trim()) return json({ error: '今日のノートがない' }, env, 400);
  const content = [{ type: 'text', text: `今日書かれたノート：\n${notes}\n\nmake_daily で日報にまとめてください。` }];
  const out = await callClaude(env, DAILY_SYSTEM, content, DAILY_TOOL, 1400);
  return json({
    done: arr(out.done), learned: arr(out.learned),
    troubles: arr(out.troubles), tomorrow: arr(out.tomorrow), oneline: str(out.oneline),
  }, env);
}
