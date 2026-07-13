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

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(env) });
    if (url.pathname === '/health') return json({ ok: true, model: MODEL }, env);
    if (url.pathname !== '/organize' || req.method !== 'POST') return json({ error: 'not found' }, env, 404);

    if (!env.ANTHROPIC_API_KEY) return json({ error: 'APIキーが未設定' }, env, 500);
    if (await overLimit(env)) return json({ error: '今日の上限に達しました。明日また使えます。' }, env, 429);

    let body;
    try { body = await req.json(); } catch { return json({ error: '読めない入力' }, env, 400); }

    const text = String(body.text || '').slice(0, 8000);
    const images = (body.images || []).slice(0, 4);
    if (!text && !images.length) return json({ error: '中身が空' }, env, 400);

    const content = [];
    for (const d of images) {
      const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(String(d));
      if (!m) continue;
      if (m[2].length > 5_000_000) continue;   // 5MB相当を超える画像は捨てる
      content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
    }
    const list = (a, f) => (a || []).slice(0, 200).map(f).join('\n');
    content.push({
      type: 'text',
      text: `次のメモ${images.length ? 'と、手書きノートの写真' : ''}を整理してください。

${text ? '【メモ】\n' + text : '【メモ】\n（本文なし。写真から読み取ってください）'}

【選べる菌のid一覧】
${list(body.organisms, (o) => `${o.id} = ${o.jp}（${o.name}）`)}

【選べる耐性機序のid一覧】
${list(body.mechanisms, (m) => `${m.id} = ${m.abbr}`)}

【選べる抗菌薬系統のid一覧】
${list(body.classes, (c) => `${c.id} = ${c.name}`)}

organize_note ツールを必ず呼んで返してください。id は上の一覧に存在するものだけを使ってください。`,
    });

    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          system: SYSTEM,
          tools: [TOOL],
          tool_choice: { type: 'tool', name: 'organize_note' },
          messages: [{ role: 'user', content }],
        }),
      });
    } catch (e) {
      return json({ error: 'AIに届かなかった: ' + e.message }, env, 502);
    }
    if (!r.ok) return json({ error: 'AIがエラーを返した: HTTP ' + r.status }, env, 502);

    const d = await r.json();
    const use = (d.content || []).find((c) => c.type === 'tool_use');
    if (!use) return json({ error: 'AIが整理できなかった' }, env, 502);

    const out = use.input || {};

    /* 配列を要求していても、モデルは1本の文字列を返してくることがある（実際に返してきた）。
     * ここで矯正しないと、アプリ側の .map() が落ちて画面が壊れる。
     * スキーマの記述だけに頼らず、型はサーバーで保証する。 */
    const arr = (v) => {
      if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
      if (typeof v === 'string' && v.trim()) {
        return v.split(/\r?\n|(?<=。)(?=\S)/)
          .map((s) => s.replace(/^\s*(?:[-−・*●○]|\d+[.)、]|[①-⑳])\s*/, '').trim())
          .filter(Boolean);
      }
      return [];
    };
    const str = (v) => (typeof v === 'string' ? v.trim() : Array.isArray(v) ? v.join(' ') : '');
    const ids = (v, ok) => arr(v).filter((x) => ok.has(x));
    const KINDS = ['knowledge', 'sop', 'trouble', 'case', 'device', 'handover', 'senpai'];

    return json({
      title: str(out.title),
      kind: KINDS.includes(out.kind) ? out.kind : 'knowledge',
      summary: str(out.summary),
      points: arr(out.points),
      cautions: arr(out.cautions),
      steps: arr(out.steps),
      tips: arr(out.tips),
      report: str(out.report),
      tags: arr(out.tags).map((t) => (t.startsWith('#') ? t : '#' + t)),
      /* AIがidを作り話しても弾く。存在するidだけ通す。 */
      orgIds: ids(out.orgIds, new Set((body.organisms || []).map((o) => o.id))),
      mechIds: ids(out.mechIds, new Set((body.mechanisms || []).map((m) => m.id))),
      classIds: ids(out.classIds, new Set((body.classes || []).map((c) => c.id))),
      captions: arr(out.captions),
    }, env);
  },
};
