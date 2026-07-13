/* 菌譜 — 耐性ナビの判定ルール（医学的中身はこの1ファイルに集約）
 *
 * ここに書かれているのは「下書き」であって、正解ではない。
 * すべてのルールは verified:false で出荷され、画面上は⚠️付きで表示される。
 * 使う人が CLSI M100（最新版）と自施設のSOPで1件ずつ突き合わせ、
 * 「確認済み」を付けたルールだけが⚠️の外れた状態になる。
 *
 * ブレークポイント（判定基準値）は年次改訂で変わる。数値は原則ここに書かない。
 * 書くのは「何が起きたら、次に何をするか」という手順の骨格だけにする。
 */

/* ---------- 菌種 ---------- */
/* intrinsic = 自然耐性（生まれつき効かない薬）。感性と出たら判定ミスを疑う対象。 */

const ORGANISMS = [
  {
    id: 'saureus',
    name: 'Staphylococcus aureus',
    jp: '黄色ブドウ球菌',
    group: 'グラム陽性球菌',
    drugs: ['PCG', 'MPIPC/OXA', 'FOX（セフォキシチン）', 'EM（エリスロマイシン）', 'CLDM（クリンダマイシン）', 'VCM（バンコマイシン）', 'LVFX', 'MINO', 'ST', 'GM'],
    intrinsic: [],
    note: 'FOXスクリーニングがメチシリン耐性の代用指標。オキサシリンより検出感度が高い。',
  },
  {
    id: 'cns',
    name: 'Staphylococcus (coagulase-negative)',
    jp: 'コアグラーゼ陰性ブドウ球菌（CNS）',
    group: 'グラム陽性球菌',
    drugs: ['PCG', 'FOX（セフォキシチン）', 'EM（エリスロマイシン）', 'CLDM（クリンダマイシン）', 'VCM（バンコマイシン）', 'LVFX', 'ST'],
    intrinsic: [],
    note: '血液培養1セットのみの検出はコンタミネーションを疑う。臨床的意義の判断が先。',
  },
  {
    id: 'efaecalis',
    name: 'Enterococcus faecalis',
    jp: '腸球菌（フェカリス）',
    group: 'グラム陽性球菌',
    drugs: ['ABPC（アンピシリン）', 'VCM（バンコマイシン）', 'TEIC', 'GM高濃度', 'SM高濃度', 'LVFX', 'LZD'],
    intrinsic: ['セファロスポリン系（全世代）', 'アミノグリコシド系（通常濃度）', 'クリンダマイシン', 'キヌプリスチン/ダルホプリスチン', 'ST合剤（in vitro感性でも生体内では無効）'],
    note: 'ST合剤は培地中の葉酸が少ないと「感性」と出るが、生体内では葉酸を利用できるため無効。感性と出ても報告しない運用が一般的。',
  },
  {
    id: 'efaecium',
    name: 'Enterococcus faecium',
    jp: '腸球菌（フェシウム）',
    group: 'グラム陽性球菌',
    drugs: ['ABPC（アンピシリン）', 'VCM（バンコマイシン）', 'TEIC', 'GM高濃度', 'LVFX', 'LZD'],
    intrinsic: ['セファロスポリン系（全世代）', 'アミノグリコシド系（通常濃度）', 'クリンダマイシン', 'ST合剤（in vitro感性でも生体内では無効）'],
    note: 'faecalisと違いアンピシリン耐性が多数派。VREもfaecalisよりfaeciumで多い。菌種同定を先に確定させる。',
  },
  {
    id: 'spneumoniae',
    name: 'Streptococcus pneumoniae',
    jp: '肺炎球菌',
    group: 'グラム陽性球菌',
    drugs: ['PCG（ペニシリン）', 'オキサシリン1µgスクリーニング', 'CTRX（セフトリアキソン）', 'EM（エリスロマイシン）', 'LVFX', 'VCM（バンコマイシン）', 'MEPM'],
    intrinsic: [],
    note: 'ペニシリンのブレークポイントは髄膜炎・非髄膜炎・経口/静注で別。検体と病態を確認してから判定する。',
  },
  {
    id: 'ecoli',
    name: 'Escherichia coli',
    jp: '大腸菌',
    group: '腸内細菌目',
    drugs: ['ABPC（アンピシリン）', 'CEZ（セファゾリン）', 'CTX/CTRX（第3世代）', 'CAZ（セフタジジム）', 'CMZ（セファマイシン）', 'TAZ/PIPC', 'MEPM（メロペネム）', 'IPM', 'ERTA（エルタペネム）', 'LVFX', 'GM', 'AMK', 'ST'],
    intrinsic: [],
    note: 'ESBL産生が最も多い菌種のひとつ。第3世代セファロスポリン耐性を見たらまずESBLを疑う。',
  },
  {
    id: 'kpneumoniae',
    name: 'Klebsiella pneumoniae',
    jp: '肺炎桿菌',
    group: '腸内細菌目',
    drugs: ['ABPC（アンピシリン）', 'CEZ（セファゾリン）', 'CTX/CTRX（第3世代）', 'CAZ（セフタジジム）', 'CMZ（セファマイシン）', 'TAZ/PIPC', 'MEPM（メロペネム）', 'IPM', 'ERTA（エルタペネム）', 'LVFX', 'GM', 'AMK', 'ST'],
    intrinsic: ['アンピシリン（染色体性ペニシリナーゼSHV-1による）'],
    note: 'アンピシリン耐性は生まれつき。ここが「感性」と出たら菌種同定と測定を疑う。',
  },
  {
    id: 'enterobacter',
    name: 'Enterobacter / Citrobacter freundii / Serratia',
    jp: '誘導型AmpC産生菌群',
    group: '腸内細菌目',
    drugs: ['CEZ（セファゾリン）', 'CTX/CTRX（第3世代）', 'CAZ（セフタジジム）', 'CMZ（セファマイシン）', 'CFPM（第4世代）', 'TAZ/PIPC', 'MEPM（メロペネム）', 'ERTA（エルタペネム）', 'LVFX', 'GM', 'ST'],
    intrinsic: ['アンピシリン', '第1世代セファロスポリン（セファゾリン等）', 'セファマイシン系（セフメタゾール等）'],
    note: '染色体性AmpCを誘導的に産生する。初回感性でも治療中に耐性化しうる、という点が最大の落とし穴。',
  },
  {
    id: 'pmirabilis',
    name: 'Proteus mirabilis',
    jp: 'プロテウス',
    group: '腸内細菌目',
    drugs: ['ABPC（アンピシリン）', 'CEZ（セファゾリン）', 'CTX/CTRX（第3世代）', 'TAZ/PIPC', 'MEPM（メロペネム）', 'LVFX', 'GM', 'ST'],
    intrinsic: ['コリスチン／ポリミキシンB', 'テトラサイクリン系', 'ニトロフラントイン', 'チゲサイクリン'],
    note: '遊走（スウォーミング）で阻止円が読みにくい。ディスク法の判定に注意。',
  },
  {
    id: 'paeruginosa',
    name: 'Pseudomonas aeruginosa',
    jp: '緑膿菌',
    group: 'ブドウ糖非発酵菌',
    drugs: ['PIPC', 'TAZ/PIPC', 'CAZ（セフタジジム）', 'CFPM（第4世代）', 'IPM（イミペネム）', 'MEPM（メロペネム）', 'AMK（アミカシン）', 'GM', 'LVFX（レボフロキサシン）', 'CPFX', 'CL（コリスチン）'],
    intrinsic: ['アンピシリン', '第1・第2世代セファロスポリン', 'セフォタキシム／セフトリアキソン（第3世代でも抗緑膿菌活性なし）', 'エルタペネム', 'ST合剤', 'テトラサイクリン系', 'クロラムフェニコール', 'マクロライド系'],
    note: 'エルタペネムは緑膿菌に効かない。他のカルバペネムと同列に扱わない。',
  },
  {
    id: 'abaumannii',
    name: 'Acinetobacter baumannii',
    jp: 'アシネトバクター',
    group: 'ブドウ糖非発酵菌',
    drugs: ['TAZ/PIPC', 'CAZ（セフタジジム）', 'IPM（イミペネム）', 'MEPM（メロペネム）', 'AMK（アミカシン）', 'GM', 'LVFX（レボフロキサシン）', 'CPFX', 'MINO', 'ST', 'CL（コリスチン）'],
    intrinsic: ['アンピシリン', '第1・第2世代セファロスポリン', 'エルタペネム', 'アズトレオナム'],
    note: '環境で長く生存する。多剤耐性株はアウトブレイクに直結する。',
  },
  {
    id: 'smaltophilia',
    name: 'Stenotrophomonas maltophilia',
    jp: 'ステノトロフォモナス',
    group: 'ブドウ糖非発酵菌',
    drugs: ['ST（ST合剤）', 'MINO（ミノサイクリン）', 'LVFX（レボフロキサシン）'],
    intrinsic: ['カルバペネム系（全て。金属βラクタマーゼL1を保有）', 'アミノグリコシド系', 'ほとんどのβラクタム系'],
    note: 'カルバペネムが生まれつき効かない。ST合剤が第一選択。カルバペネム投与中に検出されることが多い。',
  },
  {
    id: 'hinfluenzae',
    name: 'Haemophilus influenzae',
    jp: 'インフルエンザ菌',
    group: 'グラム陰性桿菌（その他）',
    drugs: ['ABPC（アンピシリン）', 'βラクタマーゼ産生（ニトロセフィン）', 'CVA/AMPC', 'CTRX（セフトリアキソン）', 'MEPM', 'LVFX', 'AZM'],
    intrinsic: [],
    note: 'アンピシリン耐性の機序が2つある（βラクタマーゼ産生 と PBP変異＝BLNAR）。どちらかで報告が変わる。',
  },
];

/* ---------- 判定ルール ----------
 * when: 条件。allR = 列挙した薬が「すべて」耐性、anyR = 「いずれか」が耐性、S = 感性であること
 * urgency: 'urgent'（感染対策部門へ即連絡）／'normal'
 * verified: 出荷時は必ず false（施設SOPで確認したら画面上でチェックを付ける）
 */

const RULES = [
  /* ===== ブドウ球菌 ===== */
  {
    id: 'mrsa',
    organisms: ['saureus', 'cns'],
    when: { anyR: ['FOX（セフォキシチン）', 'MPIPC/OXA'] },
    title: 'メチシリン耐性ブドウ球菌（MRSA / MRCNS）を疑う',
    urgency: 'urgent',
    tests: [
      'mecA（または mecC）遺伝子検査、あるいは PBP2\' 検出（ラテックス凝集法）で確認する',
      'FOXスクリーニングとオキサシリンMICが食い違う場合は、mecA/PBP2\' の結果を優先する',
    ],
    report: [
      'メチシリン耐性と確定したら、βラクタム系は in vitro で感性と出てもすべて「耐性」として報告する（セファロスポリン・カルバペネム・βラクタマーゼ阻害薬配合剤を含む）',
      '例外：セフタロリンはMRSAに活性を持つ。ひとまとめに耐性報告しない',
    ],
    notify: 'MRSAは感染症法の基幹定点報告対象。院内感染対策部門（ICT）への報告ルールを施設SOPで確認する',
    source: 'CLSI M100 / 感染症法 基幹定点（要確認）',
    verified: false,
  },
  {
    id: 'dtest',
    organisms: ['saureus', 'cns'],
    when: { allR: ['EM（エリスロマイシン）'], S: ['CLDM（クリンダマイシン）'] },
    title: '誘導型クリンダマイシン耐性 — Dテストが必要',
    urgency: 'normal',
    tests: [
      'Dテスト（ディスク近接法）を実施する。エリスロマイシンディスクとクリンダマイシンディスクを近接配置し、クリンダマイシン側の阻止円がエリスロマイシン側に向かって平坦化（D字型）するかを見る',
    ],
    report: [
      'Dテスト陽性 → クリンダマイシンは「耐性」として報告する。感性のまま報告すると治療中に耐性化して失敗する',
      'Dテスト陰性 → クリンダマイシン感性のまま報告してよい',
    ],
    source: 'CLSI M100（erm遺伝子による誘導型MLSb耐性）（要確認）',
    verified: false,
    why: 'エリスロマイシン耐性＋クリンダマイシン感性、という組み合わせのときだけ意味を持つ検査。この組み合わせを見逃すと、Dテスト自体が実施されない。',
  },
  {
    id: 'vrsa',
    organisms: ['saureus'],
    when: { allR: ['VCM（バンコマイシン）'] },
    title: 'バンコマイシン耐性黄色ブドウ球菌（VRSA）— 極めて稀。まず測定を疑う',
    urgency: 'urgent',
    tests: [
      '同一検体・別コロニーで再検する。ディスク法では検出できないため、必ずMIC法（微量液体希釈法等）で確認する',
      'MIC上昇にとどまる場合は VISA / hVISA の可能性。マクロファージ法・population analysis 等は一般検査室では困難なため、地方衛生研究所や専門機関への送付を検討する',
    ],
    report: ['確認が済むまで確定報告しない'],
    notify: 'VRSAは感染症法5類全数届出対象。確定したら直ちに主治医・感染対策部門・保健所へ',
    source: '感染症法5類全数（バンコマイシン耐性黄色ブドウ球菌感染症）（要確認）',
    verified: false,
  },

  /* ===== 腸球菌 ===== */
  {
    id: 'vre',
    organisms: ['efaecalis', 'efaecium'],
    when: { anyR: ['VCM（バンコマイシン）'] },
    title: 'バンコマイシン耐性腸球菌（VRE）を疑う',
    urgency: 'urgent',
    tests: [
      'van遺伝子（vanA / vanB）を確認する',
      'テイコプラニンの感受性も併せて見る（vanA=VCM耐性かつTEIC耐性、vanB=VCM耐性だがTEIC感性、が典型）',
      '菌種同定を確定させる。gallinarum / casseliflavus は vanC による低度耐性で、感染対策上の扱いが異なる',
    ],
    report: ['確認が済むまで確定報告しない'],
    notify: 'VREは感染症法5類全数届出対象。確定したら直ちに主治医・感染対策部門・保健所へ。院内アウトブレイクに直結する',
    source: '感染症法5類全数（バンコマイシン耐性腸球菌感染症）（要確認）',
    verified: false,
  },
  {
    id: 'hlar',
    organisms: ['efaecalis', 'efaecium'],
    when: { anyR: ['GM高濃度', 'SM高濃度'] },
    title: '高度アミノグリコシド耐性（HLAR）',
    urgency: 'normal',
    tests: ['高濃度ゲンタマイシン／ストレプトマイシンのスクリーニングで確認する'],
    report: [
      'HLAR陽性 → βラクタム系とアミノグリコシドの併用による相乗効果が期待できない。心内膜炎の治療方針が変わるため、必ず報告する',
      'HLAR陰性 → 併用による相乗効果が期待できる',
    ],
    source: 'CLSI M100（要確認）',
    verified: false,
    why: '腸球菌はアミノグリコシドに自然耐性なので、単剤の感受性を測っても意味がない。「併用が効くか」を見るための専用スクリーニング。',
  },

  /* ===== 肺炎球菌 ===== */
  {
    id: 'prsp',
    organisms: ['spneumoniae'],
    when: { anyR: ['オキサシリン1µgスクリーニング', 'PCG（ペニシリン）'] },
    title: 'ペニシリン非感性肺炎球菌（PISP / PRSP）を疑う',
    urgency: 'normal',
    tests: [
      'オキサシリン1µgディスクはスクリーニングにすぎない。阻止円が小さければ、必ずペニシリンGのMICを測定する',
      'セフトリアキソン／セフォタキシムのMICも併せて測定する',
    ],
    report: [
      'ペニシリンのブレークポイントは「髄膜炎」「非髄膜炎（静注）」「経口ペニシリン」で3系統に分かれる。検体・病態を確認して、正しいブレークポイントで判定する',
      '髄膜炎由来なら、髄膜炎用の厳しいブレークポイントで判定する。ここを取り違えると治療失敗に直結する',
    ],
    notify: 'PRSPは感染症法の基幹定点報告対象（施設SOPで確認）',
    source: 'CLSI M100（部位別ブレークポイント）（要確認）',
    verified: false,
  },

  /* ===== 腸内細菌目 ===== */
  {
    id: 'esbl',
    organisms: ['ecoli', 'kpneumoniae', 'pmirabilis'],
    when: { anyR: ['CTX/CTRX（第3世代）', 'CAZ（セフタジジム）'] },
    title: 'ESBL（基質特異性拡張型βラクタマーゼ）産生を疑う',
    urgency: 'normal',
    tests: [
      'クラブラン酸併用によるESBL確認試験を実施する。セフタジジム単独 vs セフタジジム/クラブラン酸、セフォタキシム単独 vs セフォタキシム/クラブラン酸を比較する',
      'ディスク法：クラブラン酸併用で阻止円が一定以上大きくなれば陽性（判定基準値はCLSI最新版で確認する）',
      'セファマイシン系（セフメタゾール等）が感性のままなら ESBL、セファマイシンも耐性なら AmpC や カルバペネマーゼ も疑う',
    ],
    report: [
      '現行のCLSIブレークポイントは、ESBL産生の有無にかかわらずMIC実測値どおりに報告してよい設計になっている。一方で「ESBL陽性ならセファロスポリンは一律耐性報告」という運用を残している施設もある。どちらを採るかは必ず自施設のSOPで確認する',
      'ESBL産生菌に対してセファマイシン系やカルバペネム系をどう扱うかも、施設ごとに方針が分かれる',
    ],
    source: 'CLSI M100（ESBL確認試験）（要確認・施設SOP必須）',
    verified: false,
    why: 'ここは「検査室の判定」と「報告の仕方」がずれやすい代表例。ルールを鵜呑みにせず施設の手順書を見ること。',
  },
  {
    id: 'cre',
    organisms: ['ecoli', 'kpneumoniae', 'enterobacter', 'pmirabilis'],
    when: { anyR: ['MEPM（メロペネム）', 'IPM', 'ERTA（エルタペネム）'] },
    title: 'カルバペネム耐性腸内細菌目細菌（CRE）を疑う',
    urgency: 'urgent',
    tests: [
      'mCIM（modified carbapenem inactivation method）でカルバペネマーゼ産生の有無を確認する',
      'eCIM を併用して、メタロβラクタマーゼ（MBL）かどうかを判別する（eCIM陽性＝MBL）',
      '可能なら遺伝子検査で型まで特定する：IMP / NDM / VIM（＝MBL）、KPC、OXA-48 など。日本では IMP型 が多い',
      'カルバペネマーゼ非産生でもCREになりうる（ESBL/AmpC＋外膜ポーリン欠損）。mCIM陰性でも耐性は耐性として報告する',
    ],
    report: [
      'メロペネム・イミペネム・エルタペネムのうち1剤でも非感性なら、他のカルバペネムも必ず測定する',
      'Proteus / Providencia / Morganella はイミペネムのMICが生まれつきやや高い。イミペネム単独の非感性でCREと決めない',
    ],
    notify: 'CREは感染症法5類全数届出対象。確定したら直ちに主治医・感染対策部門・保健所へ。院内アウトブレイクに直結する',
    source: '感染症法5類全数（カルバペネム耐性腸内細菌目細菌感染症）／CLSI M100 mCIM・eCIM（要確認）',
    verified: false,
  },
  {
    id: 'ampc',
    organisms: ['enterobacter'],
    when: { anyR: ['CTX/CTRX（第3世代）', 'CAZ（セフタジジム）'] },
    title: '染色体性AmpCの過剰産生を疑う',
    urgency: 'normal',
    tests: [
      'セファマイシン系（セフメタゾール等）も耐性なら AmpC を強く疑う（ESBLならセファマイシンは感性のまま残ることが多い）',
      'ESBLとの合併もありうる。クラブラン酸によるESBL確認試験はAmpC産生菌では偽陰性になりやすい点に注意する',
    ],
    report: [
      '最大の注意点は「初回感性でも治療中に耐性化する」こと。第3世代セファロスポリンが感性と出ても、治療中の耐性化リスクを報告に添える運用があるか施設SOPで確認する',
      'セフェピム（第4世代）はAmpCに安定。第3世代が耐性でもセフェピムは残ることが多い',
    ],
    source: 'CLSI M100 / 誘導型AmpC（Enterobacter, Citrobacter freundii, Serratia, Providencia, Morganella, Hafnia）（要確認）',
    verified: false,
    why: 'AmpCは「感性と報告したのに効かなかった」が起きる典型。菌種を見た時点で身構える。',
  },

  /* ===== 緑膿菌 ===== */
  {
    id: 'mdrp',
    organisms: ['paeruginosa'],
    when: { allR: ['IPM（イミペネム）', 'AMK（アミカシン）', 'LVFX（レボフロキサシン）'] },
    title: '多剤耐性緑膿菌（MDRP）',
    urgency: 'urgent',
    tests: [
      'カルバペネム・アミカシン・フルオロキノロンの3系統すべてで耐性を再確認する（判定基準は施設SOP／届出基準で確認）',
      'メタロβラクタマーゼ（MBL）産生を確認する：SMA（メルカプト酢酸ナトリウム）阻害試験、あるいは mCIM/eCIM',
    ],
    report: ['再検で確認が取れるまで確定報告しない'],
    notify: 'MDRPは感染症法5類全数届出対象。確定したら直ちに主治医・感染対策部門・保健所へ',
    source: '感染症法5類全数（薬剤耐性緑膿菌感染症）（要確認）',
    verified: false,
  },
  {
    id: 'pa-carbapenem',
    organisms: ['paeruginosa'],
    when: { anyR: ['IPM（イミペネム）', 'MEPM（メロペネム）'] },
    title: '緑膿菌のカルバペネム耐性 — MBL産生かどうかを分ける',
    urgency: 'normal',
    tests: [
      'SMA阻害試験（メタロβラクタマーゼ確認）、あるいは mCIM/eCIM を実施する',
      'イミペネムだけ耐性でメロペネムが感性の場合、カルバペネマーゼではなく外膜ポーリン（OprD）欠損の可能性が高い。MBL確認は陰性になる',
    ],
    report: ['MBL産生株は院内伝播しうる。感染対策部門への報告基準を施設SOPで確認する'],
    source: 'CLSI M100 / MBL確認試験（要確認）',
    verified: false,
  },

  /* ===== アシネトバクター ===== */
  {
    id: 'mdra',
    organisms: ['abaumannii'],
    when: { allR: ['IPM（イミペネム）', 'AMK（アミカシン）', 'LVFX（レボフロキサシン）'] },
    title: '多剤耐性アシネトバクター（MDRA）',
    urgency: 'urgent',
    tests: [
      'カルバペネム・アミカシン・フルオロキノロンの3系統すべてで耐性を再確認する',
      'カルバペネマーゼ（OXA型カルバペネマーゼが多い）の確認を検討する',
    ],
    report: ['再検で確認が取れるまで確定報告しない'],
    notify: 'MDRAは感染症法5類全数届出対象。確定したら直ちに主治医・感染対策部門・保健所へ。環境生存性が高くアウトブレイクを起こしやすい',
    source: '感染症法5類全数（薬剤耐性アシネトバクター感染症）（要確認）',
    verified: false,
  },

  /* ===== インフルエンザ菌 ===== */
  {
    id: 'blnar',
    organisms: ['hinfluenzae'],
    when: { anyR: ['ABPC（アンピシリン）'] },
    title: 'アンピシリン耐性 — βラクタマーゼ産生か BLNAR かを分ける',
    urgency: 'normal',
    tests: [
      'ニトロセフィン法でβラクタマーゼ産生の有無を確認する',
      'βラクタマーゼ陽性 → BLPAR（産生株）。陰性なのにアンピシリン耐性 → BLNAR（PBP変異による耐性）を疑う',
    ],
    report: [
      'BLPAR（βラクタマーゼ産生）→ クラブラン酸配合剤（オーグメンチン等）は有効',
      'BLNAR（PBP変異）→ βラクタマーゼ阻害薬を足しても無効。クラブラン酸配合剤を感性報告しない',
    ],
    source: 'CLSI M100（要確認）',
    verified: false,
    why: '同じ「アンピシリン耐性」でも、機序が違うと次に使える薬が真逆になる。ここを分けないと臨床が薬を誤る。',
  },
];

/* ---------- 患者情報ガード ----------
 * 職場のノートを持ち出す以上、患者が特定される情報が混入する事故を機械で止める。
 * 完全な検出は不可能なので、あくまで「気づかせる」ための網。
 */
const PII_PATTERNS = [
  { re: /\b[0-9]{6,10}\b/, label: 'カルテID・検体番号らしき数字の並び' },
  { re: /(様|さん|氏)\s*$/m, label: '患者氏名らしき敬称' },
  { re: /(patient|pt\.?)\s*[:：]/i, label: '患者を指す記載' },
  { re: /\b(19|20)[0-9]{2}[-/年][0-9]{1,2}[-/月][0-9]{1,2}/, label: '生年月日らしき日付' },
  { re: /(病棟|外来|ICU|HCU)\s*[0-9]/, label: '病棟・部屋番号' },
  { re: /\b[0-9]{2,3}歳\s*(男|女)/, label: '年齢＋性別（症例が特定されうる）' },
];
