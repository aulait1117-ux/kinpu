/* 菌譜 — 菌・自然耐性・確認試験の判定ルール（医学的中身はこの1ファイルに集約）
 *
 * ここに書かれているのは「下書き」であって、正解ではない。
 * すべてのルールは verified:false で出荷し、画面上は⚠️付きで表示される。
 * CLSI M100（最新版）と自施設のSOPで1件ずつ突き合わせ、
 * 確認できたものだけ「確認済み」を付ける。
 *
 * ブレークポイント（判定基準値）は年次改訂で変わる。数値はここに書かない。
 * 書くのは「何が起きたら、次に何をするか」という手順の骨格だけにする。
 */

/* ---------- 薬剤の辞書 ----------
 * 菌の薬剤パネルも、ルールの条件も、必ずこの D を参照する。
 * 文字列を直接書くと、パネルとルールで表記がずれて判定が発火しなくなる。
 */
const D = {
  // βラクタム
  PCG:   'PCG（ペニシリンG）',
  ABPC:  'ABPC（アンピシリン）',
  SBT:   'ABPC/SBT（スルバクタム配合）',
  AMPC:  'AMPC/CVA（クラブラン酸配合）',
  PIPC:  'PIPC（ピペラシリン）',
  TAZ:   'TAZ/PIPC（タゾバクタム配合）',
  MPIPC: 'MPIPC/OXA（オキサシリン）',
  FOX:   'FOX（セフォキシチン・スクリーニング）',
  CEZ:   'CEZ（セファゾリン・第1世代）',
  CTM:   'CTM（セフォチアム・第2世代）',
  CMZ:   'CMZ（セフメタゾール・セファマイシン）',
  CTX:   'CTX/CTRX（第3世代）',
  CAZ:   'CAZ（セフタジジム）',
  CFPM:  'CFPM（セフェピム・第4世代）',
  CPT:   'CPT（セフタロリン）',
  AZT:   'AZT（アズトレオナム）',
  IPM:   'IPM（イミペネム）',
  MEPM:  'MEPM（メロペネム）',
  ERTA:  'ERTA（エルタペネム）',
  OXAS:  'オキサシリン1µgスクリーニング',
  BL:    'βラクタマーゼ産生（ニトロセフィン）',
  // アミノグリコシド
  GM:    'GM（ゲンタマイシン）',
  TOB:   'TOB（トブラマイシン）',
  AMK:   'AMK（アミカシン）',
  SM:    'SM（ストレプトマイシン）',
  GMHL:  'GM高濃度スクリーニング',
  SMHL:  'SM高濃度スクリーニング',
  // マクロライド・リンコマイシン
  EM:    'EM（エリスロマイシン）',
  CAM:   'CAM（クラリスロマイシン）',
  AZM:   'AZM（アジスロマイシン）',
  CLDM:  'CLDM（クリンダマイシン）',
  // グリコペプチド他
  VCM:   'VCM（バンコマイシン）',
  TEIC:  'TEIC（テイコプラニン）',
  LZD:   'LZD（リネゾリド）',
  DAP:   'DAP（ダプトマイシン）',
  // テトラサイクリン
  MINO:  'MINO（ミノサイクリン）',
  TC:    'TC（テトラサイクリン）',
  TGC:   'TGC（チゲサイクリン）',
  // キノロン
  LVFX:  'LVFX（レボフロキサシン）',
  CPFX:  'CPFX（シプロフロキサシン）',
  MFLX:  'MFLX（モキシフロキサシン）',
  NA:    'NA（ナリジクス酸・スクリーニング）',
  // その他
  ST:    'ST（ST合剤）',
  CL:    'CL（コリスチン）',
  CP:    'CP（クロラムフェニコール）',
  MNZ:   'MNZ（メトロニダゾール）',
  FOM:   'FOM（ホスホマイシン）',
  NIT:   'NIT（ニトロフラントイン）',
  RFP:   'RFP（リファンピシン）',
  // 抗酸菌
  INH:   'INH（イソニアジド）',
  EB:    'EB（エタンブトール）',
  PZA:   'PZA（ピラジナミド）',
  // 抗真菌
  FLCZ:  'FLCZ（フルコナゾール）',
  VRCZ:  'VRCZ（ボリコナゾール）',
  ITCZ:  'ITCZ（イトラコナゾール）',
  PSCZ:  'PSCZ（ポサコナゾール）',
  MCFG:  'MCFG（ミカファンギン）',
  CPFG:  'CPFG（カスポファンギン）',
  AMPH:  'AMPH-B（アムホテリシンB）',
  FC:    '5-FC（フルシトシン）',
};

/* ---------- 菌 ----------
 * intrinsic      … 画面に出す自然耐性の説明（人が読む）
 * intrinsicCodes … このパネル内で自然耐性にあたる薬剤（機械が照合する。「感性」と出たら警告）
 * expectedS      … 耐性がまず報告されない薬（CLSI の expected susceptible の考え方）。
 *                  「耐性」と出たら、菌ではなく測定と同定を疑う。自然耐性のちょうど裏返し。
 */

const ORGANISMS = [

  /* ============ グラム陽性球菌 ============ */
  {
    id: 'saureus', jp: '黄色ブドウ球菌', name: 'Staphylococcus aureus', group: 'グラム陽性球菌',
    drugs: [D.PCG, D.MPIPC, D.FOX, D.EM, D.CLDM, D.VCM, D.TEIC, D.DAP, D.LZD, D.LVFX, D.MINO, D.ST, D.GM, D.RFP],
    intrinsic: [], intrinsicCodes: [],
    note: 'FOXスクリーニングがメチシリン耐性の代用指標。オキサシリンより検出感度が高い。',
  },
  {
    id: 'cns', jp: 'コアグラーゼ陰性ブドウ球菌（CNS）', name: 'Staphylococcus epidermidis 他', group: 'グラム陽性球菌',
    drugs: [D.PCG, D.FOX, D.EM, D.CLDM, D.VCM, D.TEIC, D.LZD, D.LVFX, D.MINO, D.ST, D.GM, D.RFP, D.MPIPC],
    intrinsic: [], intrinsicCodes: [],
    note: '血液培養1セットのみの検出はコンタミネーションを疑う。臨床的意義の判断が先。',
  },
  {
    id: 'ssaprophyticus', jp: '腐性ブドウ球菌', name: 'Staphylococcus saprophyticus', group: 'グラム陽性球菌',
    drugs: [D.PCG, D.FOX, D.EM, D.CLDM, D.VCM, D.LVFX, D.ST, D.NIT, D.MPIPC],
    intrinsic: ['ノボビオシン（同定用のマーカー。CNSの中でこの菌だけ耐性）'], intrinsicCodes: [],
    note: '若年女性の膀胱炎の原因菌。尿から出たCNSはこの菌を疑う。ノボビオシン耐性で他のCNSと分ける。',
  },
  {
    id: 'slugdunensis', jp: 'ルグドゥネンシス', name: 'Staphylococcus lugdunensis', group: 'グラム陽性球菌',
    drugs: [D.PCG, D.FOX, D.EM, D.CLDM, D.VCM, D.LVFX, D.ST, D.RFP, D.MPIPC],
    intrinsic: [], intrinsicCodes: [],
    note: 'CNSに分類されるが、病原性は黄色ブドウ球菌に近い。心内膜炎を起こす。コンタミ扱いにしない。',
  },
  {
    id: 'spyogenes', jp: 'A群溶血性レンサ球菌', name: 'Streptococcus pyogenes', group: 'グラム陽性球菌',
    drugs: [D.PCG, D.ABPC, D.CTX, D.EM, D.CLDM, D.VCM, D.LVFX],
    intrinsic: [], intrinsicCodes: [],
    expectedS: [
      { d: D.PCG, why: 'S. pyogenes のペニシリン耐性株は世界的に報告がない' },
      { d: D.ABPC, why: '同上。アンピシリン耐性も報告がない' },
      { d: D.CTX, why: '第3世代セファロスポリンの耐性も報告がない' },
    ],
    note: 'ペニシリン耐性株は世界的に報告がない。耐性と出たら、まず菌種同定と測定を疑う。',
  },
  {
    id: 'sagalactiae', jp: 'B群溶血性レンサ球菌（GBS）', name: 'Streptococcus agalactiae', group: 'グラム陽性球菌',
    drugs: [D.PCG, D.ABPC, D.CTX, D.EM, D.CLDM, D.VCM, D.LVFX],
    intrinsic: [], intrinsicCodes: [],
    expectedS: [
      { d: D.PCG, why: 'GBSのペニシリン耐性は報告がない。ここが耐性なら測定か同定を疑う' },
      { d: D.ABPC, why: '同上' },
      { d: D.CTX, why: '同上' },
    ],
    note: '妊婦スクリーニングで検出したら、ペニシリンアレルギー時に備えてEM・CLDMの感受性まで必ず出す。',
  },
  {
    id: 'spneumoniae', jp: '肺炎球菌', name: 'Streptococcus pneumoniae', group: 'グラム陽性球菌',
    drugs: [D.OXAS, D.PCG, D.CTX, D.MEPM, D.EM, D.CLDM, D.LVFX, D.VCM, D.ST],
    intrinsic: [], intrinsicCodes: [],
    expectedS: [
      { d: D.VCM, why: '肺炎球菌のバンコマイシン耐性は報告がない' },
    ],
    note: 'ペニシリンのブレークポイントは髄膜炎・非髄膜炎（静注）・経口で別。検体と病態を確認してから判定する。',
  },
  {
    id: 'viridans', jp: '口腔レンサ球菌（Viridans群）', name: 'Streptococcus mitis / oralis / sanguinis 他', group: 'グラム陽性球菌',
    drugs: [D.PCG, D.ABPC, D.CTX, D.EM, D.CLDM, D.VCM, D.LVFX, D.MEPM],
    intrinsic: [], intrinsicCodes: [],
    expectedS: [
      { d: D.VCM, why: 'レンサ球菌のバンコマイシン耐性は報告がない' },
    ],
    note: '感染性心内膜炎の主要原因菌。血液培養から出たら必ずペニシリンMICを測る。',
  },
  {
    id: 'sanginosus', jp: 'アンギノーサス群（ミレリ群）', name: 'Streptococcus anginosus group', group: 'グラム陽性球菌',
    drugs: [D.PCG, D.ABPC, D.CTX, D.EM, D.CLDM, D.VCM, D.LVFX],
    intrinsic: [], intrinsicCodes: [],
    note: '膿瘍をつくる。検出したらドレナージが要る場所を疑う、と臨床に伝える価値がある。',
  },
  {
    id: 'efaecalis', jp: '腸球菌（フェカリス）', name: 'Enterococcus faecalis', group: 'グラム陽性球菌',
    drugs: [D.ABPC, D.PCG, D.VCM, D.TEIC, D.LZD, D.DAP, D.GMHL, D.SMHL, D.LVFX, D.MINO],
    intrinsic: [
      'セファロスポリン系（全世代）',
      'アミノグリコシド系（通常濃度。単剤では無効）',
      'クリンダマイシン',
      'キヌプリスチン/ダルホプリスチン',
      'ST合剤（培地では感性と出るが、生体内では葉酸を利用できるため無効）',
    ],
    intrinsicCodes: [],
    expectedS: [
      { d: D.ABPC, why: 'E. faecalis のアンピシリン耐性は稀。耐性なら E. faecium との同定ミスをまず疑う' },
    ],
    note: 'ST合剤は「感性」と出ても報告しない運用が一般的。培地中の葉酸が少ないせいで感性に見えるだけ。',
  },
  {
    id: 'efaecium', jp: '腸球菌（フェシウム）', name: 'Enterococcus faecium', group: 'グラム陽性球菌',
    drugs: [D.ABPC, D.VCM, D.TEIC, D.LZD, D.DAP, D.GMHL, D.LVFX, D.SMHL],
    intrinsic: [
      'セファロスポリン系（全世代）',
      'アミノグリコシド系（通常濃度）',
      'クリンダマイシン',
      'ST合剤（生体内では無効）',
    ],
    intrinsicCodes: [],
    note: 'フェカリスと違いアンピシリン耐性が多数派。VREもこちらで多い。菌種同定を先に確定させる。',
  },
  {
    id: 'evanc', jp: '腸球菌（gallinarum / casseliflavus）', name: 'Enterococcus gallinarum / casseliflavus', group: 'グラム陽性球菌',
    drugs: [D.ABPC, D.VCM, D.TEIC, D.LZD],
    intrinsic: ['バンコマイシン（vanC遺伝子による低度の自然耐性。獲得耐性のVREとは別物）'], intrinsicCodes: [D.VCM],
    note: 'バンコマイシンに生まれつき低度耐性。これをVREと報告すると、不要な隔離とアウトブレイク対応が走る。菌種同定を必ず確定させる。',
  },

  /* ============ グラム陽性桿菌 ============ */
  {
    id: 'listeria', jp: 'リステリア', name: 'Listeria monocytogenes', group: 'グラム陽性桿菌',
    drugs: [D.ABPC, D.PCG, D.GM, D.ST, D.MEPM, D.EM, D.VCM],
    intrinsic: ['セファロスポリン系（全世代。第3世代も効かない）', 'ホスホマイシン'], intrinsicCodes: [],
    expectedS: [
      { d: D.ABPC, why: 'リステリアのアンピシリン耐性は報告がない。耐性なら同定ミス（コリネバクテリウム等との取り違え）をまず疑う' },
      { d: D.PCG, why: '同上' },
    ],
    note: '髄膜炎の経験的治療でセフトリアキソンだけだと外れる。妊婦・高齢者・免疫低下者で疑う。アンピシリン＋ゲンタマイシンが基本。',
  },
  {
    id: 'corynebacterium', jp: 'コリネバクテリウム', name: 'Corynebacterium striatum 他', group: 'グラム陽性桿菌',
    drugs: [D.PCG, D.VCM, D.LZD, D.EM, D.CLDM, D.GM, D.LVFX, D.MINO, D.RFP],
    intrinsic: [], intrinsicCodes: [],
    expectedS: [
      { d: D.VCM, why: 'コリネバクテリウムのバンコマイシン耐性は報告がない。多剤耐性でもVCMは残る' },
    ],
    note: '皮膚常在菌なのでコンタミが多い。ただし C. striatum は多剤耐性で、複数セット陽性なら真の起因菌を疑う。バンコマイシンはほぼ確実に効く。',
  },
  {
    id: 'bacillus', jp: 'バチルス（セレウス菌 他）', name: 'Bacillus cereus / subtilis', group: 'グラム陽性桿菌',
    drugs: [D.PCG, D.VCM, D.CLDM, D.MEPM, D.LVFX, D.GM, D.EM],
    intrinsic: ['ペニシリン系・セファロスポリン系（B. cereus はβラクタマーゼ産生）'], intrinsicCodes: [D.PCG],
    note: 'B. cereus は輸液ルート感染・食中毒。βラクタムは効かない前提で見る。芽胞をつくるので消毒に抵抗する。',
  },
  {
    id: 'nocardia', jp: 'ノカルジア', name: 'Nocardia 属', group: 'グラム陽性桿菌',
    drugs: [D.ST, D.AMK, D.IPM, D.CTX, D.MINO, D.LZD],
    intrinsic: [], intrinsicCodes: [],
    note: '部分抗酸性（Kinyoun染色）。発育が遅く、通常培養では見逃す。免疫低下者の肺・脳膿瘍で疑う。感受性は種によって大きく違うので、必ず種同定と感受性試験を出す。ST合剤が基本。',
  },
  {
    id: 'lactobacillus', jp: 'ラクトバチルス', name: 'Lactobacillus 属', group: 'グラム陽性桿菌',
    drugs: [D.PCG, D.ABPC, D.VCM, D.CLDM, D.EM],
    intrinsic: ['バンコマイシン（多くの菌種で自然耐性）'], intrinsicCodes: [D.VCM],
    note: '腟・腸管の常在菌。バンコマイシン耐性のグラム陽性桿菌を見たらまずこれを疑う（VREと間違えない）。',
  },

  /* ============ 腸内細菌目 ============ */
  {
    id: 'ecoli', jp: '大腸菌', name: 'Escherichia coli', group: '腸内細菌目',
    drugs: [D.ABPC, D.SBT, D.CEZ, D.CMZ, D.CTX, D.CAZ, D.CFPM, D.TAZ, D.MEPM, D.IPM, D.ERTA, D.GM, D.AMK, D.LVFX, D.ST, D.FOM, D.NIT],
    intrinsic: [], intrinsicCodes: [],
    note: 'ESBL産生が最も多い菌種のひとつ。第3世代セファロスポリン耐性を見たらまずESBLを疑う。',
  },
  {
    id: 'kpneumoniae', jp: '肺炎桿菌', name: 'Klebsiella pneumoniae', group: '腸内細菌目',
    drugs: [D.ABPC, D.SBT, D.CEZ, D.CMZ, D.CTX, D.CAZ, D.CFPM, D.TAZ, D.MEPM, D.IPM, D.ERTA, D.GM, D.AMK, D.LVFX, D.ST],
    intrinsic: ['アンピシリン（染色体性ペニシリナーゼ SHV-1 による）'], intrinsicCodes: [D.ABPC],
    note: 'アンピシリン耐性は生まれつき。ここが「感性」と出たら菌種同定と測定を疑う。',
  },
  {
    id: 'koxytoca', jp: 'クレブシエラ・オキシトカ', name: 'Klebsiella oxytoca', group: '腸内細菌目',
    drugs: [D.ABPC, D.SBT, D.CEZ, D.CMZ, D.CTX, D.CAZ, D.CFPM, D.TAZ, D.MEPM, D.GM, D.LVFX, D.ST, D.IPM, D.ERTA],
    intrinsic: ['アンピシリン', 'ピペラシリン（染色体性 K1 βラクタマーゼによる）'], intrinsicCodes: [D.ABPC],
    note: 'K1 βラクタマーゼを過剰産生すると、アズトレオナムとセフトリアキソンだけ耐性でセフタジジムは感性、という紛らわしい像になる。ESBLと誤判定しやすい。',
  },
  {
    id: 'kaerogenes', jp: 'クレブシエラ・エアロゲネス', name: 'Klebsiella aerogenes（旧 Enterobacter aerogenes）', group: '腸内細菌目',
    drugs: [D.ABPC, D.CEZ, D.CMZ, D.CTX, D.CAZ, D.CFPM, D.TAZ, D.MEPM, D.ERTA, D.GM, D.AMK, D.LVFX, D.ST, D.IPM],
    intrinsic: ['アンピシリン', '第1世代セファロスポリン（セファゾリン等）', 'セファマイシン系（セフメタゾール等）'],
    intrinsicCodes: [D.ABPC, D.CEZ, D.CMZ],
    note: '2017年に Enterobacter から Klebsiella へ移った。名前は Klebsiella でも中身は誘導型AmpC産生菌。第3世代セファロスポリンで治療中に耐性化する。',
  },
  {
    id: 'enterobacter', jp: 'エンテロバクター', name: 'Enterobacter cloacae complex', group: '腸内細菌目',
    drugs: [D.ABPC, D.CEZ, D.CMZ, D.CTX, D.CAZ, D.CFPM, D.TAZ, D.MEPM, D.IPM, D.ERTA, D.GM, D.AMK, D.LVFX, D.ST],
    intrinsic: ['アンピシリン', '第1世代セファロスポリン', 'セファマイシン系', 'ABPC/SBT'],
    intrinsicCodes: [D.ABPC, D.CEZ, D.CMZ],
    note: '染色体性AmpCを誘導的に産生する。初回感性でも治療中に耐性化しうる、が最大の落とし穴。',
  },
  {
    id: 'cfreundii', jp: 'シトロバクター・フロインディ', name: 'Citrobacter freundii', group: '腸内細菌目',
    drugs: [D.ABPC, D.CEZ, D.CMZ, D.CTX, D.CAZ, D.CFPM, D.TAZ, D.MEPM, D.ERTA, D.GM, D.LVFX, D.ST, D.IPM],
    intrinsic: ['アンピシリン', '第1世代セファロスポリン', 'セファマイシン系'],
    intrinsicCodes: [D.ABPC, D.CEZ, D.CMZ],
    note: 'こちらも誘導型AmpC産生菌。Citrobacter koseri とは耐性パターンが違うので、種まで同定する。',
  },
  {
    id: 'ckoseri', jp: 'シトロバクター・コセリ', name: 'Citrobacter koseri', group: '腸内細菌目',
    drugs: [D.ABPC, D.CEZ, D.CMZ, D.CTX, D.CAZ, D.TAZ, D.MEPM, D.GM, D.LVFX, D.ST, D.IPM, D.ERTA],
    intrinsic: ['アンピシリン'], intrinsicCodes: [D.ABPC],
    note: 'freundii と違いAmpCは誘導性ではない。新生児髄膜炎・脳膿瘍を起こす。',
  },
  {
    id: 'smarcescens', jp: 'セラチア', name: 'Serratia marcescens', group: '腸内細菌目',
    drugs: [D.ABPC, D.CEZ, D.CMZ, D.CTX, D.CAZ, D.CFPM, D.TAZ, D.MEPM, D.ERTA, D.GM, D.AMK, D.LVFX, D.ST, D.CL, D.IPM],
    intrinsic: ['アンピシリン', '第1世代セファロスポリン', 'セファマイシン系', 'コリスチン／ポリミキシンB', 'ニトロフラントイン'],
    intrinsicCodes: [D.ABPC, D.CEZ, D.CMZ, D.CL],
    note: '誘導型AmpC産生菌。コリスチンが生まれつき効かない点が緑膿菌との大きな違い。院内アウトブレイクを起こしやすい。',
  },
  {
    id: 'pmirabilis', jp: 'プロテウス・ミラビリス', name: 'Proteus mirabilis', group: '腸内細菌目',
    drugs: [D.ABPC, D.SBT, D.CEZ, D.CTX, D.CAZ, D.TAZ, D.MEPM, D.IPM, D.GM, D.LVFX, D.ST, D.CL, D.NIT, D.TC, D.ERTA],
    intrinsic: ['コリスチン／ポリミキシンB', 'テトラサイクリン系', 'ニトロフラントイン', 'チゲサイクリン'],
    intrinsicCodes: [D.CL, D.NIT, D.TC],
    note: '遊走（スウォーミング）で阻止円が読みにくい。イミペネムのMICが生まれつきやや高いので、イミペネム単独の非感性でCREと決めない。',
  },
  {
    id: 'pvulgaris', jp: 'プロテウス・ブルガリス', name: 'Proteus vulgaris', group: '腸内細菌目',
    drugs: [D.ABPC, D.CEZ, D.CTX, D.CAZ, D.TAZ, D.MEPM, D.GM, D.LVFX, D.ST, D.CL, D.NIT, D.TC, D.IPM, D.ERTA],
    intrinsic: ['アンピシリン', '第1世代セファロスポリン', 'コリスチン／ポリミキシンB', 'テトラサイクリン系', 'ニトロフラントイン'],
    intrinsicCodes: [D.ABPC, D.CEZ, D.CL, D.NIT, D.TC],
    note: 'mirabilis と違ってアンピシリンとセファゾリンが生まれつき効かない。種同定を省略しない。',
  },
  {
    id: 'morganella', jp: 'モルガネラ', name: 'Morganella morganii', group: '腸内細菌目',
    drugs: [D.ABPC, D.CEZ, D.CMZ, D.CTX, D.CAZ, D.CFPM, D.TAZ, D.MEPM, D.IPM, D.GM, D.LVFX, D.ST, D.CL, D.NIT, D.TC, D.ERTA],
    intrinsic: ['アンピシリン', '第1・第2世代セファロスポリン', 'コリスチン／ポリミキシンB', 'テトラサイクリン系', 'ニトロフラントイン', 'チゲサイクリン'],
    intrinsicCodes: [D.ABPC, D.CEZ, D.CL, D.NIT, D.TC],
    note: '誘導型AmpC産生菌。イミペネムのMICが生まれつき高め。CREと誤判定しやすい代表格。',
  },
  {
    id: 'providencia', jp: 'プロビデンシア', name: 'Providencia 属', group: '腸内細菌目',
    drugs: [D.ABPC, D.CEZ, D.CTX, D.CAZ, D.TAZ, D.MEPM, D.IPM, D.GM, D.AMK, D.LVFX, D.ST, D.CL, D.NIT, D.TC, D.ERTA],
    intrinsic: ['アンピシリン', '第1世代セファロスポリン', 'コリスチン／ポリミキシンB', 'テトラサイクリン系', 'ニトロフラントイン', 'ゲンタマイシン（多くの株）'],
    intrinsicCodes: [D.ABPC, D.CEZ, D.CL, D.NIT, D.TC],
    note: '長期尿道カテーテル症例で出る。イミペネムのMICが生まれつき高め。',
  },
  {
    id: 'salmonella', jp: 'サルモネラ（非チフス性）', name: 'Salmonella enterica', group: '腸内細菌目',
    drugs: [D.ABPC, D.CTX, D.NA, D.CPFX, D.LVFX, D.ST, D.CP, D.MEPM, D.CAZ, D.AZM, D.IPM, D.ERTA],
    intrinsic: [], intrinsicCodes: [],
    note: '第1・第2世代セファロスポリン、セファマイシン、アミノグリコシドは、培地で「感性」と出ても生体内では効かない。報告してはいけない。',
  },
  {
    id: 'styphi', jp: 'チフス菌・パラチフス菌', name: 'Salmonella Typhi / Paratyphi A', group: '腸内細菌目',
    drugs: [D.ABPC, D.CTX, D.NA, D.CPFX, D.LVFX, D.ST, D.CP, D.AZM, D.CAZ, D.MEPM, D.IPM, D.ERTA],
    intrinsic: [], intrinsicCodes: [],
    note: '感染症法3類。診断したら直ちに保健所へ届出。就業制限がかかる。ナリジクス酸耐性＝フルオロキノロン低感受性で、治療失敗の原因になる。',
  },
  {
    id: 'shigella', jp: '赤痢菌', name: 'Shigella 属', group: '腸内細菌目',
    drugs: [D.ABPC, D.CTX, D.NA, D.CPFX, D.LVFX, D.ST, D.AZM, D.CAZ, D.CP, D.MEPM, D.IPM, D.ERTA],
    intrinsic: [], intrinsicCodes: [],
    note: '感染症法3類。直ちに保健所へ届出。第1・第2世代セファロスポリンとアミノグリコシドは、感性と出ても臨床的に無効。報告しない。',
  },
  {
    id: 'yersinia', jp: 'エルシニア', name: 'Yersinia enterocolitica', group: '腸内細菌目',
    drugs: [D.ABPC, D.CEZ, D.CTX, D.TAZ, D.GM, D.LVFX, D.ST, D.MINO],
    intrinsic: ['アンピシリン', '第1世代セファロスポリン'], intrinsicCodes: [D.ABPC, D.CEZ],
    note: '低温で増える（4℃でも発育）。虫垂炎に似た腹痛で出てくる。',
  },

  /* ============ ブドウ糖非発酵菌 ============ */
  {
    id: 'paeruginosa', jp: '緑膿菌', name: 'Pseudomonas aeruginosa', group: 'ブドウ糖非発酵菌',
    drugs: [D.PIPC, D.TAZ, D.CAZ, D.CFPM, D.AZT, D.IPM, D.MEPM, D.AMK, D.GM, D.TOB, D.LVFX, D.CPFX, D.CL, D.ABPC, D.CTX, D.ERTA, D.ST],
    intrinsic: [
      'アンピシリン', '第1・第2世代セファロスポリン',
      'セフォタキシム／セフトリアキソン（第3世代でも抗緑膿菌活性なし）',
      'エルタペネム', 'ST合剤', 'テトラサイクリン系', 'クロラムフェニコール', 'マクロライド系',
    ],
    intrinsicCodes: [D.ABPC, D.CTX, D.ERTA, D.ST],
    note: 'エルタペネムは緑膿菌に効かない。他のカルバペネムと同列に扱わない。',
  },
  {
    id: 'abaumannii', jp: 'アシネトバクター', name: 'Acinetobacter baumannii', group: 'ブドウ糖非発酵菌',
    drugs: [D.SBT, D.TAZ, D.CAZ, D.CFPM, D.IPM, D.MEPM, D.AMK, D.GM, D.LVFX, D.CPFX, D.MINO, D.ST, D.CL, D.ABPC, D.ERTA, D.AZT],
    intrinsic: ['アンピシリン', '第1・第2世代セファロスポリン', 'エルタペネム', 'アズトレオナム', 'ホスホマイシン'],
    intrinsicCodes: [D.ABPC, D.ERTA, D.AZT],
    note: '環境で長く生存する。多剤耐性株はアウトブレイクに直結する。スルバクタム自体に抗菌活性がある珍しい菌。',
  },
  {
    id: 'smaltophilia', jp: 'ステノトロフォモナス', name: 'Stenotrophomonas maltophilia', group: 'ブドウ糖非発酵菌',
    drugs: [D.ST, D.MINO, D.LVFX, D.CAZ, D.IPM, D.MEPM, D.AMK, D.GM],
    intrinsic: ['カルバペネム系（全て。金属βラクタマーゼ L1 を生まれつき持つ）', 'アミノグリコシド系', 'ほとんどのβラクタム系'],
    intrinsicCodes: [D.IPM, D.MEPM, D.AMK, D.GM],
    note: 'カルバペネムが生まれつき効かない。カルバペネム投与中の患者から出てくるのが典型。ST合剤が第一選択。',
  },
  {
    id: 'bcepacia', jp: 'バークホルデリア（セパシア）', name: 'Burkholderia cepacia complex', group: 'ブドウ糖非発酵菌',
    drugs: [D.ST, D.MEPM, D.CAZ, D.MINO, D.LVFX, D.CL, D.AMK, D.GM],
    intrinsic: ['アミノグリコシド系', 'コリスチン／ポリミキシン', 'ホスホマイシン', '第1・第2世代セファロスポリン'],
    intrinsicCodes: [D.CL, D.AMK, D.GM],
    note: '消毒薬・輸液の中でも生き延びる。院内感染のアウトブレイク源になる。コリスチンが効かない点が緑膿菌との決定的な違い。',
  },
  {
    id: 'achromobacter', jp: 'アクロモバクター', name: 'Achromobacter xylosoxidans', group: 'ブドウ糖非発酵菌',
    drugs: [D.TAZ, D.IPM, D.MEPM, D.ST, D.CAZ, D.CFPM, D.AZT, D.LVFX, D.AMK],
    intrinsic: ['アズトレオナム', 'セフェピム（多くの株）', 'アミノグリコシド系（多くの株）', 'キノロン系（多くの株）'],
    intrinsicCodes: [D.AZT],
    note: '緑膿菌と間違えやすい。カルバペネムとST合剤は残ることが多いが、セフタジジム以外のセファロスポリンは期待しない。',
  },

  /* ============ グラム陰性 その他 ============ */
  {
    id: 'hinfluenzae', jp: 'インフルエンザ菌', name: 'Haemophilus influenzae', group: 'グラム陰性 その他',
    drugs: [D.ABPC, D.BL, D.AMPC, D.CTX, D.MEPM, D.LVFX, D.AZM, D.ST],
    intrinsic: [], intrinsicCodes: [],
    expectedS: [
      { d: D.CTX, why: 'インフルエンザ菌の第3世代セファロスポリン耐性は極めて稀' },
      { d: D.MEPM, why: 'カルバペネム耐性も極めて稀' },
      { d: D.LVFX, why: 'フルオロキノロン耐性も極めて稀' },
    ],
    note: 'アンピシリン耐性の機序が2つある（βラクタマーゼ産生 と PBP変異＝BLNAR）。どちらかで使える薬が真逆になる。',
  },
  {
    id: 'mcatarrhalis', jp: 'モラクセラ', name: 'Moraxella catarrhalis', group: 'グラム陰性 その他',
    drugs: [D.ABPC, D.BL, D.AMPC, D.CTX, D.AZM, D.CAM, D.LVFX, D.ST],
    intrinsic: ['アンピシリン（ほぼ全株がβラクタマーゼ BRO を産生する）'], intrinsicCodes: [D.ABPC],
    expectedS: [
      { d: D.AMPC, why: 'βラクタマーゼ産生株でも、クラブラン酸配合剤には感性のはず' },
      { d: D.CTX, why: '第3世代セファロスポリン耐性は報告がない' },
    ],
    note: 'ほぼ100%がβラクタマーゼ産生。アンピシリン単剤が「感性」と出たら測定を疑う。クラブラン酸配合剤なら効く。',
  },
  {
    id: 'nmeningitidis', jp: '髄膜炎菌', name: 'Neisseria meningitidis', group: 'グラム陰性 その他',
    drugs: [D.PCG, D.ABPC, D.CTX, D.MEPM, D.CPFX, D.RFP],
    intrinsic: [], intrinsicCodes: [],
    expectedS: [
      { d: D.CTX, why: '髄膜炎菌のセフトリアキソン耐性は報告がない。耐性なら直ちに再検する' },
    ],
    note: '感染症法5類全数（侵襲性髄膜炎菌感染症）。直ちに届出。検査室内での感染リスクがあるので、疑ったら安全キャビネット内で扱う。',
  },
  {
    id: 'ngonorrhoeae', jp: '淋菌', name: 'Neisseria gonorrhoeae', group: 'グラム陰性 その他',
    drugs: [D.PCG, D.CTX, D.CPFX, D.AZM, D.TC, D.SBT],
    intrinsic: [], intrinsicCodes: [],
    note: 'ペニシリン・キノロン・テトラサイクリンの耐性が進み、事実上セフトリアキソンしか残っていない。セフトリアキソン低感受性は世界的な警戒対象。',
  },
  {
    id: 'campylobacter', jp: 'カンピロバクター', name: 'Campylobacter jejuni / coli', group: 'グラム陰性 その他',
    drugs: [D.EM, D.CAM, D.AZM, D.CPFX, D.LVFX, D.TC, D.GM, D.MEPM],
    intrinsic: ['セファロスポリン系', 'ST合剤', 'バンコマイシン', 'リファンピシン'], intrinsicCodes: [],
    note: '微好気培養が要る。食中毒最多の原因菌。ギラン・バレー症候群の先行感染。フルオロキノロン耐性が3〜4割に達しており、第一選択はマクロライド。',
  },
  {
    id: 'hpylori', jp: 'ヘリコバクター・ピロリ', name: 'Helicobacter pylori', group: 'グラム陰性 その他',
    drugs: [D.CAM, D.AMPC, D.MNZ, D.LVFX, D.TC],
    intrinsic: [], intrinsicCodes: [],
    note: 'クラリスロマイシン耐性かどうかで一次除菌の成否が決まる。耐性なら二次除菌（メトロニダゾール）へ切り替える。',
  },
  {
    id: 'vibrio', jp: 'ビブリオ（腸炎ビブリオ・ビブリオバルニフィカス）', name: 'Vibrio parahaemolyticus / vulnificus', group: 'グラム陰性 その他',
    drugs: [D.ABPC, D.CTX, D.MINO, D.LVFX, D.CPFX, D.ST, D.MEPM],
    intrinsic: [], intrinsicCodes: [],
    note: '食塩を要求するのでNaCl添加培地で発育。V. vulnificus は肝硬変患者で劇症の壊死性軟部組織感染を起こす。生食用海産物・海水曝露を必ず問診に返す。',
  },
  {
    id: 'aeromonas', jp: 'エロモナス', name: 'Aeromonas 属', group: 'グラム陰性 その他',
    drugs: [D.ABPC, D.CTX, D.TAZ, D.MEPM, D.GM, D.LVFX, D.ST, D.MINO],
    intrinsic: ['アンピシリン'], intrinsicCodes: [D.ABPC],
    note: '淡水・創傷感染。誘導型のβラクタマーゼを複数持つので、βラクタムは治療中に耐性化しうる。',
  },
  {
    id: 'pasteurella', jp: 'パスツレラ', name: 'Pasteurella multocida', group: 'グラム陰性 その他',
    drugs: [D.PCG, D.ABPC, D.AMPC, D.CTX, D.LVFX, D.MINO, D.ST, D.CLDM, D.EM],
    intrinsic: ['クリンダマイシン', '第1世代セファロスポリン（セファレキシン等）'], intrinsicCodes: [D.CLDM],
    expectedS: [
      { d: D.PCG, why: 'パスツレラのペニシリン耐性は報告がない。グラム陰性桿菌なのにペニシリンが効く' },
      { d: D.ABPC, why: '同上' },
    ],
    note: 'イヌ・ネコの咬掻傷。ペニシリンが効く珍しいグラム陰性桿菌。動物咬傷にクリンダマイシンやセファレキシンを選ぶと外す。',
  },
  {
    id: 'legionella', jp: 'レジオネラ', name: 'Legionella pneumophila', group: 'グラム陰性 その他',
    drugs: [D.LVFX, D.AZM, D.CAM, D.MINO, D.RFP],
    intrinsic: ['βラクタム系（全て。細胞内寄生のため到達しない）', 'アミノグリコシド系'], intrinsicCodes: [],
    note: '感染症法4類、直ちに届出。通常培地では生えない（BCYEα培地が要る）。感受性試験は通常しない。尿中抗原が診断の主役。',
  },
  {
    id: 'bordetella', jp: '百日咳菌', name: 'Bordetella pertussis', group: 'グラム陰性 その他',
    drugs: [D.EM, D.CAM, D.AZM, D.ST],
    intrinsic: [], intrinsicCodes: [],
    note: '感染症法5類全数。培養が難しく、LAMP法・PCRが主。マクロライド耐性株が中国等で問題になっている。',
  },

  /* ============ 嫌気性菌 ============
   * 共通の大前提：嫌気性菌はアミノグリコシド系が生まれつき効かない。
   * 取り込みに酸素依存の輸送機構が要るため、菌の中に入れない。
   * 「アミノグリコシドが感性」と出たら、まず好気性菌の混入か同定ミスを疑う。
   */
  {
    id: 'bfragilis', jp: 'バクテロイデス・フラジリス群', name: 'Bacteroides fragilis group', group: '嫌気性菌',
    drugs: [D.PCG, D.SBT, D.TAZ, D.CMZ, D.MEPM, D.IPM, D.MNZ, D.CLDM, D.MFLX, D.TGC, D.GM, D.AZT],
    intrinsic: ['アミノグリコシド系（嫌気性菌に共通）', 'アズトレオナム', 'ペニシリン（ほぼ全株がβラクタマーゼを産生）'],
    intrinsicCodes: [D.GM, D.PCG, D.AZT],
    note: '腹腔内感染の主役。嫌気性菌で最も薬剤耐性が進んでいる。クリンダマイシン耐性が3〜4割に達し、経験的治療の当てにならない。メトロニダゾールとカルバペネムが基本。',
  },
  {
    id: 'bacteroides-other', jp: 'バクテロイデス（非フラジリス群）', name: 'Bacteroides thetaiotaomicron / ovatus 他', group: '嫌気性菌',
    drugs: [D.PCG, D.SBT, D.TAZ, D.CMZ, D.MEPM, D.MNZ, D.CLDM, D.MFLX, D.GM, D.AZT, D.IPM],
    intrinsic: ['アミノグリコシド系', 'アズトレオナム', 'ペニシリン'],
    intrinsicCodes: [D.GM, D.PCG, D.AZT],
    note: 'B. thetaiotaomicron は fragilis よりさらに耐性が強い。クリンダマイシン・セファマイシン耐性率が高く、βラクタマーゼ阻害薬配合剤も外れることがある。群まで分けて報告する意味がある。',
  },
  {
    id: 'parabacteroides', jp: 'パラバクテロイデス', name: 'Parabacteroides distasonis', group: '嫌気性菌',
    drugs: [D.PCG, D.SBT, D.TAZ, D.CMZ, D.MEPM, D.MNZ, D.CLDM, D.GM],
    intrinsic: ['アミノグリコシド系', 'ペニシリン'],
    intrinsicCodes: [D.GM, D.PCG],
    note: '旧 Bacteroides distasonis。セファマイシン系（セフォキシチン等）の耐性率が高い。',
  },
  {
    id: 'porphyromonas', jp: 'ポルフィロモナス', name: 'Porphyromonas gingivalis 他', group: '嫌気性菌',
    drugs: [D.PCG, D.ABPC, D.SBT, D.MNZ, D.CLDM, D.MEPM, D.GM],
    intrinsic: ['アミノグリコシド系'], intrinsicCodes: [D.GM],
    note: '歯周病の主役。黒色色素を産生する（コロニーが黒くなる）。誤嚥性肺炎・歯性感染症で出る。',
  },
  {
    id: 'prevotella', jp: 'プレボテラ', name: 'Prevotella 属', group: '嫌気性菌',
    drugs: [D.PCG, D.SBT, D.TAZ, D.MNZ, D.CLDM, D.MEPM, D.GM],
    intrinsic: ['アミノグリコシド系'], intrinsicCodes: [D.GM],
    note: '口腔内嫌気性菌。誤嚥性肺炎・歯性感染症・肺膿瘍。βラクタマーゼ産生株が増えており、ペニシリン単剤は当てにしない。黒色色素を産生する種がある。',
  },
  {
    id: 'fusobacterium', jp: 'フソバクテリウム', name: 'Fusobacterium necrophorum / nucleatum', group: '嫌気性菌',
    drugs: [D.PCG, D.SBT, D.MNZ, D.CLDM, D.MEPM, D.GM],
    intrinsic: ['アミノグリコシド系'], intrinsicCodes: [D.GM],
    note: 'F. necrophorum は Lemierre症候群（咽頭炎後の内頸静脈血栓性静脈炎）。若年者の咽頭痛＋敗血症で疑う。紡錘形の細長いグラム陰性桿菌。',
  },
  {
    id: 'leptotrichia', jp: 'レプトトリキア', name: 'Leptotrichia 属', group: '嫌気性菌',
    drugs: [D.PCG, D.SBT, D.MNZ, D.CLDM, D.MEPM],
    intrinsic: ['アミノグリコシド系'], intrinsicCodes: [],
    note: '口腔常在。好中球減少患者の粘膜炎から菌血症を起こす。Fusobacteriumと形態が似る。',
  },
  {
    id: 'bilophila', jp: 'ビロフィラ', name: 'Bilophila wadsworthia', group: '嫌気性菌',
    drugs: [D.PCG, D.SBT, D.TAZ, D.MNZ, D.MEPM, D.CLDM, D.GM],
    intrinsic: ['アミノグリコシド系', 'ペニシリン（βラクタマーゼ産生）'],
    intrinsicCodes: [D.GM, D.PCG],
    note: '虫垂炎の穿孔例・腹腔内膿瘍で出る。胆汁存在下で増える（bile-loving の名の通り）。βラクタマーゼを産生する。',
  },
  {
    id: 'veillonella', jp: 'ベイヨネラ（嫌気性グラム陰性球菌）', name: 'Veillonella 属', group: '嫌気性菌',
    drugs: [D.PCG, D.MNZ, D.CLDM, D.MEPM, D.GM],
    intrinsic: ['アミノグリコシド系'], intrinsicCodes: [D.GM],
    note: '口腔・腸管の常在菌。混合感染の一員。単独では起因菌になりにくいが、人工物感染では意味を持つ。',
  },
  {
    id: 'peptostreptococcus', jp: 'ペプトストレプトコッカス（嫌気性グラム陽性球菌）', name: 'Peptostreptococcus / Parvimonas 属', group: '嫌気性菌',
    drugs: [D.PCG, D.ABPC, D.MNZ, D.CLDM, D.VCM, D.MEPM, D.GM],
    intrinsic: ['アミノグリコシド系'], intrinsicCodes: [D.GM],
    note: '混合感染の一員として出る。ペニシリンが基本的に効く。Parvimonas micra は歯性感染・脳膿瘍。',
  },
  {
    id: 'finegoldia', jp: 'フィネゴルディア', name: 'Finegoldia magna', group: '嫌気性菌',
    drugs: [D.PCG, D.ABPC, D.MNZ, D.CLDM, D.VCM, D.MEPM, D.LZD],
    intrinsic: ['アミノグリコシド系'], intrinsicCodes: [],
    note: '嫌気性グラム陽性球菌で最も分離頻度が高い。糖尿病性足潰瘍・人工関節感染。クリンダマイシン耐性が増えている。',
  },
  {
    id: 'cperfringens', jp: 'ウェルシュ菌', name: 'Clostridium perfringens', group: '嫌気性菌',
    drugs: [D.PCG, D.ABPC, D.CLDM, D.MNZ, D.MEPM, D.VCM, D.GM],
    intrinsic: ['アミノグリコシド系'], intrinsicCodes: [D.GM],
    expectedS: [
      { d: D.PCG, why: 'ウェルシュ菌のペニシリン耐性は報告がない' },
    ],
    note: 'ガス壊疽。ペニシリン＋クリンダマイシン（毒素産生を抑える目的）が定石。血液培養ボトルで急速に大量溶血する。二重溶血環（ダブルゾーン）が特徴。',
  },
  {
    id: 'cdifficile', jp: 'クロストリジオイデス・ディフィシル', name: 'Clostridioides difficile', group: '嫌気性菌',
    drugs: [D.VCM, D.MNZ],
    intrinsic: [], intrinsicCodes: [],
    expectedS: [
      { d: D.VCM, why: 'C. difficile のバンコマイシン耐性は稀。CDI治療中に下痢が続くなら、C. innocuum（VCM自然耐性）の関与を疑う' },
      { d: D.MNZ, why: 'メトロニダゾール耐性も稀' },
    ],
    note: '感受性試験は通常しない。診断はGDH抗原＋トキシン（A/B）、不一致なら核酸増幅検査。芽胞はアルコール手指消毒で死なない。手洗いは石けんと流水で行い、環境は次亜塩素酸で拭く。',
  },
  {
    id: 'cinnocuum', jp: 'クロストリジウム・イノキューム / ラモーサム', name: 'Clostridium innocuum / ramosum', group: '嫌気性菌',
    drugs: [D.PCG, D.VCM, D.MNZ, D.CLDM, D.MEPM, D.LZD, D.DAP],
    intrinsic: ['バンコマイシン（C. innocuum は生まれつき耐性）'], intrinsicCodes: [D.VCM],
    note: 'C. difficile感染症をバンコマイシンで治療している患者から出てくる。バンコマイシンが生まれつき効かないので、CDI治療中の下痢遷延の原因になる。グラム陽性桿菌でバンコマイシン耐性を見たら、Lactobacillus と並んでこれを疑う。',
  },
  {
    id: 'ctetani', jp: '破傷風菌', name: 'Clostridium tetani', group: '嫌気性菌',
    drugs: [D.PCG, D.MNZ, D.CLDM, D.MEPM],
    intrinsic: ['アミノグリコシド系'], intrinsicCodes: [],
    note: '感染症法5類全数。診断は臨床症状（開口障害・後弓反張）で行い、培養に頼らない。培養陰性でも否定しない。治療はメトロニダゾール＋抗毒素＋創部デブリドマン。',
  },
  {
    id: 'cbotulinum', jp: 'ボツリヌス菌', name: 'Clostridium botulinum', group: '嫌気性菌',
    drugs: [D.PCG, D.MNZ, D.MEPM],
    intrinsic: ['アミノグリコシド系'], intrinsicCodes: [],
    note: '感染症法4類、直ちに届出。菌の検出ではなく毒素の検出が診断。乳児ボツリヌス症では抗菌薬（特にアミノグリコシド）が菌体崩壊で毒素放出を増やすため慎重に。検査室内曝露リスクが高い。',
  },
  {
    id: 'csepticum', jp: 'クロストリジウム・セプティカム', name: 'Clostridium septicum', group: '嫌気性菌',
    drugs: [D.PCG, D.CLDM, D.MNZ, D.MEPM],
    intrinsic: ['アミノグリコシド系'], intrinsicCodes: [],
    note: '血液培養から出たら、大腸癌・血液悪性腫瘍・好中球減少性腸炎を強く疑い、臨床へ必ず伝える。非外傷性ガス壊疽を起こす。「検出＝消化管精査」が要る数少ない菌。',
  },
  {
    id: 'eggerthella', jp: 'エガーセラ', name: 'Eggerthella lenta', group: '嫌気性菌',
    drugs: [D.PCG, D.SBT, D.TAZ, D.MNZ, D.CLDM, D.MEPM, D.VCM],
    intrinsic: [], intrinsicCodes: [],
    note: '嫌気性菌なのにメトロニダゾール耐性の報告がある例外。腹腔内感染・菌血症で予後が悪い。βラクタム耐性も持つため、感受性試験を出す意義が大きい。',
  },
  {
    id: 'cutibacterium', jp: 'キューティバクテリウム（アクネ菌）', name: 'Cutibacterium acnes（旧 Propionibacterium）', group: '嫌気性菌',
    drugs: [D.PCG, D.ABPC, D.VCM, D.CLDM, D.MNZ, D.MEPM, D.LZD, D.RFP],
    intrinsic: ['メトロニダゾール'], intrinsicCodes: [D.MNZ],
    note: '皮膚常在菌でコンタミの代表。ただし人工物感染（人工関節・脳室シャント・人工弁・特に肩関節）では真の起因菌になる。発育が遅く、7〜14日の培養が要る。嫌気性菌なのにメトロニダゾールが効かない例外。',
  },
  {
    id: 'actinomyces', jp: 'アクチノミセス', name: 'Actinomyces 属', group: '嫌気性菌',
    drugs: [D.PCG, D.ABPC, D.CLDM, D.MINO, D.MEPM, D.MNZ],
    intrinsic: ['メトロニダゾール', 'アミノグリコシド系'], intrinsicCodes: [D.MNZ],
    note: '硫黄顆粒。顎顔面・胸部・骨盤（IUD関連）。治療は高用量ペニシリンを数カ月。発育が遅いので培養を早く捨てない。メトロニダゾールが効かない。',
  },
  {
    id: 'bifidobacterium', jp: 'ビフィドバクテリウム', name: 'Bifidobacterium 属', group: '嫌気性菌',
    drugs: [D.PCG, D.ABPC, D.VCM, D.CLDM, D.MNZ, D.MEPM],
    intrinsic: ['メトロニダゾール（多くの株）'], intrinsicCodes: [D.MNZ],
    note: '腸内常在・プロバイオティクス。免疫低下者やプロバイオティクス投与患者の菌血症で出ることがある。',
  },
  {
    id: 'gardnerella', jp: 'ガードネレラ', name: 'Gardnerella vaginalis', group: '嫌気性菌',
    drugs: [D.MNZ, D.CLDM, D.ABPC, D.VCM],
    intrinsic: [], intrinsicCodes: [],
    note: '細菌性腟症。診断は培養ではなく、Nugentスコア（グラム染色）と clue cell。培養陽性だけでは病態を示さない（健常者からも出る）。メトロニダゾールが治療の基本。',
  },
  {
    id: 'mobiluncus', jp: 'モビルンカス', name: 'Mobiluncus 属', group: '嫌気性菌',
    drugs: [D.MNZ, D.CLDM, D.ABPC, D.VCM],
    intrinsic: ['メトロニダゾール（in vitro では耐性に見えるが、臨床では細菌性腟症に有効）'], intrinsicCodes: [],
    note: '細菌性腟症でclue cell上に見える湾曲桿菌。in vitro のメトロニダゾール耐性と臨床効果が乖離する。感受性試験の結果をそのまま臨床に持ち込まない。',
  },

  /* ============ 抗酸菌 ============ */
  {
    id: 'mtb', jp: '結核菌', name: 'Mycobacterium tuberculosis', group: '抗酸菌',
    drugs: [D.INH, D.RFP, D.EB, D.PZA, D.SM, D.LVFX, D.AMK],
    intrinsic: [], intrinsicCodes: [],
    note: '感染症法2類、直ちに届出。BSL3。イソニアジドとリファンピシンの両方に耐性なら多剤耐性結核（MDR-TB）。',
  },
  {
    id: 'mac', jp: 'MAC（非結核性抗酸菌）', name: 'Mycobacterium avium complex', group: '抗酸菌',
    drugs: [D.CAM, D.AZM, D.EB, D.RFP, D.AMK],
    intrinsic: ['イソニアジド', 'ピラジナミド'], intrinsicCodes: [],
    note: 'ヒト‒ヒト感染しないので届出不要。感受性試験で意味があるのはクラリスロマイシンとアミカシンだけ、とされている。クラリスロマイシン耐性は治療成績を大きく落とす。',
  },
  {
    id: 'mabscessus', jp: 'M. abscessus（迅速発育菌）', name: 'Mycobacterium abscessus', group: '抗酸菌',
    drugs: [D.CAM, D.AMK, D.IPM, D.CFPM, D.LVFX, D.MINO, D.ST],
    intrinsic: ['ほとんどの抗結核薬', '多くのβラクタム'], intrinsicCodes: [],
    note: '最も治療が難しい抗酸菌。erm(41)遺伝子による誘導型クラリスロマイシン耐性があるため、3〜5日の判定では「感性」に見えて、14日目に耐性化する。判定を早く打ち切らない。',
  },
  {
    id: 'mkansasii', jp: 'M. kansasii', group: '抗酸菌', name: 'Mycobacterium kansasii',
    drugs: [D.RFP, D.EB, D.CAM, D.INH, D.LVFX],
    intrinsic: ['ピラジナミド'], intrinsicCodes: [],
    note: '非結核性抗酸菌の中では治療しやすい。リファンピシン感受性が要。光発色性（光に当てると黄色くなる）。',
  },

  /* ============ 真菌 ============ */
  {
    id: 'calbicans', jp: 'カンジダ・アルビカンス', name: 'Candida albicans', group: '真菌',
    drugs: [D.FLCZ, D.VRCZ, D.ITCZ, D.MCFG, D.CPFG, D.AMPH, D.FC],
    intrinsic: [], intrinsicCodes: [],
    note: 'カンジダの中では最も素直。通常フルコナゾールが効く。血液培養から出たら、コンタミ扱いせず必ず治療対象にする。',
  },
  {
    id: 'cglabrata', jp: 'カンジダ・グラブラータ', name: 'Nakaseomyces glabratus（旧 Candida glabrata）', group: '真菌',
    drugs: [D.FLCZ, D.VRCZ, D.MCFG, D.CPFG, D.AMPH, D.FC],
    intrinsic: ['フルコナゾール（用量依存性感受性。低用量では効かない前提で扱う）'], intrinsicCodes: [],
    note: 'アゾール耐性が起こりやすい。第一選択はエキノキャンディン。エキノキャンディン耐性も出てきており、その場合は治療の手が一気に減る。',
  },
  {
    id: 'cparapsilosis', jp: 'カンジダ・パラプシローシス', name: 'Candida parapsilosis', group: '真菌',
    drugs: [D.FLCZ, D.VRCZ, D.MCFG, D.CPFG, D.AMPH],
    intrinsic: ['エキノキャンディン系（ミカファンギン・カスポファンギン。MICが生まれつき高い）'], intrinsicCodes: [D.MCFG, D.CPFG],
    note: 'カテーテル関連血流感染。エキノキャンディンのMICが生まれつき高いので、フルコナゾールを選ぶ。手指を介して伝播する。',
  },
  {
    id: 'ckrusei', jp: 'カンジダ・クルセイ', name: 'Pichia kudriavzevii（旧 Candida krusei）', group: '真菌',
    drugs: [D.FLCZ, D.VRCZ, D.MCFG, D.CPFG, D.AMPH, D.FC],
    intrinsic: ['フルコナゾール（生まれつき効かない。感性と出ても報告しない）', 'フルシトシン'], intrinsicCodes: [D.FLCZ, D.FC],
    note: 'フルコナゾールが生まれつき効かない。感性と報告すると治療が外れる。エキノキャンディンかボリコナゾールを選ぶ。',
  },
  {
    id: 'ctropicalis', jp: 'カンジダ・トロピカリス', name: 'Candida tropicalis', group: '真菌',
    drugs: [D.FLCZ, D.VRCZ, D.MCFG, D.CPFG, D.AMPH],
    intrinsic: [], intrinsicCodes: [],
    note: '血液悪性腫瘍・好中球減少で多い。アゾール耐性が増えている。',
  },
  {
    id: 'cauris', jp: 'カンジダ・オーリス', name: 'Candidozyma auris（旧 Candida auris）', group: '真菌',
    drugs: [D.FLCZ, D.VRCZ, D.MCFG, D.CPFG, D.AMPH, D.FC],
    intrinsic: ['フルコナゾール（ほぼ全株が耐性）'], intrinsicCodes: [],
    note: '国際的な脅威。多剤耐性で、環境に定着し、院内アウトブレイクを起こす。一般の生化学同定機では C. haemulonii 等と誤同定される。疑ったらMALDI-TOF（データベース更新済み）か遺伝子で確定させ、直ちに感染対策部門へ。',
  },
  {
    id: 'cryptococcus', jp: 'クリプトコッカス', name: 'Cryptococcus neoformans / gattii', group: '真菌',
    drugs: [D.FLCZ, D.VRCZ, D.AMPH, D.FC, D.MCFG, D.CPFG],
    intrinsic: ['エキノキャンディン系（ミカファンギン・カスポファンギン。生まれつき無効）'], intrinsicCodes: [D.MCFG, D.CPFG],
    expectedS: [
      { d: D.AMPH, why: 'クリプトコッカスのアムホテリシンB耐性は稀。髄膜炎治療の要なので、耐性と出たら必ず再検する' },
    ],
    note: 'エキノキャンディンが生まれつき効かない。髄膜炎の治療はアムホテリシンB＋フルシトシン。墨汁染色・莢膜抗原。',
  },
  {
    id: 'afumigatus', jp: 'アスペルギルス・フミガーツス', name: 'Aspergillus fumigatus', group: '真菌',
    drugs: [D.VRCZ, D.ITCZ, D.PSCZ, D.AMPH, D.MCFG, D.CPFG, D.FLCZ],
    intrinsic: ['フルコナゾール（生まれつき効かない）', 'フルシトシン（単剤では無効）'], intrinsicCodes: [D.FLCZ],
    note: '第一選択はボリコナゾール。農薬由来のアゾール耐性株（TR34/L98H）が世界で拡大しており、アゾール耐性なら治療が一気に難しくなる。',
  },
  {
    id: 'mucorales', jp: 'ムーコル（接合菌）', name: 'Mucorales（Rhizopus / Mucor 他）', group: '真菌',
    drugs: [D.AMPH, D.PSCZ, D.ITCZ, D.VRCZ, D.MCFG, D.FLCZ],
    intrinsic: ['ボリコナゾール', 'フルコナゾール', 'エキノキャンディン系'], intrinsicCodes: [D.VRCZ, D.FLCZ, D.MCFG],
    note: 'ボリコナゾール投与中の患者に出てくるのが典型（ボリコナゾールが効かないため）。糖尿病ケトアシドーシス・血液疾患で鼻脳型。外科的デブリドマンが要る。アムホテリシンBが基本。',
  },

  /* ============ その他 ============ */
  {
    id: 'mycoplasma', jp: 'マイコプラズマ', name: 'Mycoplasma pneumoniae', group: 'その他',
    drugs: [D.CAM, D.AZM, D.EM, D.MINO, D.LVFX],
    intrinsic: ['βラクタム系（全て。細胞壁を持たないため作用点がない）', 'グリコペプチド系（バンコマイシン等）'], intrinsicCodes: [],
    note: '細胞壁を持たないので、βラクタムは原理的に効かない。日本ではマクロライド耐性が高率。耐性ならテトラサイクリン系かキノロン系へ。',
  },
];

/* ---------- 判定ルール ----------
 * when: allR = 列挙した薬が「すべて」耐性 / anyR = 「いずれか」が耐性 / S = 感性であること
 * urgency: 'urgent'（感染対策部門・保健所へ即連絡）／'normal'
 * verified: 出荷時は必ず false
 */

const RULES = [

  /* ===== ブドウ球菌 ===== */
  {
    id: 'mrsa',
    organisms: ['saureus', 'cns', 'slugdunensis', 'ssaprophyticus'],
    when: { anyR: [D.FOX, D.MPIPC] },
    title: 'メチシリン耐性ブドウ球菌（MRSA / MRCNS）を疑う',
    urgency: 'urgent',
    tests: [
      'mecA（または mecC）遺伝子検査、あるいは PBP2\' 検出（ラテックス凝集法）で確認する',
      'FOXスクリーニングとオキサシリンMICが食い違う場合は、mecA / PBP2\' の結果を優先する',
    ],
    report: [
      'メチシリン耐性と確定したら、βラクタム系は in vitro で感性と出てもすべて「耐性」として報告する（セファロスポリン・カルバペネム・βラクタマーゼ阻害薬配合剤を含む）',
      '例外：セフタロリンはMRSAに活性を持つ。ひとまとめに耐性報告しない',
      '【2025年4月の届出基準改正】オキサシリン（MPIPC）のディスク拡散法の基準は削除され、セフォキシチン（CFX/FOX）のディスク法とMICが基準に加わった。国際基準（CLSI・EUCAST）に合わせるため。オキサシリンのディスク法で届出判断をしない',
    ],
    notify: 'MRSAは感染症法5類定点（基幹定点）報告対象。院内感染対策部門（ICT）への報告ルールを施設SOPで確認する',
    source: 'CLSI M100 ／ 感染症法5類定点・基幹定点（2025年4月届出基準改正）（要確認）',
    verified: false,
  },
  {
    id: 'dtest',
    organisms: ['saureus', 'cns', 'slugdunensis', 'spyogenes', 'sagalactiae', 'spneumoniae'],
    when: { allR: [D.EM], S: [D.CLDM] },
    title: '誘導型クリンダマイシン耐性 — Dテストが必要',
    urgency: 'normal',
    tests: [
      'Dテスト（ディスク近接法）を実施する。エリスロマイシンとクリンダマイシンのディスクを近接して置き、クリンダマイシン側の阻止円がエリスロマイシン側に向かって平坦化（D字型）するかを見る',
    ],
    report: [
      'Dテスト陽性 → クリンダマイシンは「耐性」として報告する。感性のまま報告すると治療中に耐性化して失敗する',
      'Dテスト陰性 → クリンダマイシン感性のまま報告してよい',
    ],
    source: 'CLSI M100（erm遺伝子による誘導型MLSb耐性）（要確認）',
    verified: false,
    why: 'エリスロマイシン耐性＋クリンダマイシン感性、という組み合わせのときだけ意味を持つ検査。この組み合わせに気づかないと、Dテスト自体が実施されない。',
  },
  {
    id: 'gbs-allergy',
    organisms: ['sagalactiae'],
    when: { anyR: [D.EM, D.CLDM] },
    title: 'GBS：ペニシリンアレルギー時の選択肢が消える',
    urgency: 'normal',
    tests: ['クリンダマイシンが感性でエリスロマイシンが耐性なら、必ずDテストを追加する'],
    report: [
      '妊婦のGBSスクリーニングでは、母体がペニシリンアレルギーの場合にクリンダマイシンが分娩時予防投与の候補になる。EM・CLDMがともに耐性なら、その選択肢が消えることを産科へ明確に伝える',
      'GBSのペニシリン耐性は報告がない。ペニシリン感性は前提として、EM・CLDMの結果こそが臨床判断を変える',
    ],
    source: 'CLSI M100 ／ GBS母子感染予防ガイドライン（要確認）',
    verified: false,
  },
  {
    id: 'vrsa',
    organisms: ['saureus'],
    when: { allR: [D.VCM] },
    title: 'バンコマイシン耐性黄色ブドウ球菌（VRSA）— 極めて稀。まず測定を疑う',
    urgency: 'urgent',
    tests: [
      '同一検体・別コロニーで再検する。ディスク法では検出できないため、必ずMIC法（微量液体希釈法等）で確認する',
      'MIC上昇にとどまる場合は VISA / hVISA の可能性。population analysis 等は一般検査室では困難なので、地方衛生研究所や専門機関への送付を検討する',
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
    when: { anyR: [D.VCM] },
    title: 'バンコマイシン耐性腸球菌（VRE）を疑う',
    urgency: 'urgent',
    tests: [
      'van遺伝子（vanA / vanB）を確認する',
      'テイコプラニンの感受性も併せて見る（vanA＝VCM耐性かつTEIC耐性、vanB＝VCM耐性だがTEIC感性、が典型）',
      '菌種同定を確定させる。gallinarum / casseliflavus は vanC による自然耐性で、VREとは扱いが違う',
    ],
    report: ['確認が済むまで確定報告しない'],
    notify: 'VREは感染症法5類全数届出対象。確定したら直ちに主治医・感染対策部門・保健所へ。院内アウトブレイクに直結する',
    source: '感染症法5類全数（バンコマイシン耐性腸球菌感染症）（要確認）',
    verified: false,
  },
  {
    id: 'hlar',
    organisms: ['efaecalis', 'efaecium'],
    when: { anyR: [D.GMHL, D.SMHL] },
    title: '高度アミノグリコシド耐性（HLAR）',
    urgency: 'normal',
    tests: ['高濃度ゲンタマイシン／ストレプトマイシンのスクリーニングで確認する'],
    report: [
      'HLAR陽性 → βラクタムとアミノグリコシドの併用による相乗効果が期待できない。心内膜炎の治療方針が変わるので必ず報告する',
      'HLAR陰性 → 併用による相乗効果が期待できる',
    ],
    source: 'CLSI M100（要確認）',
    verified: false,
    why: '腸球菌はアミノグリコシドに自然耐性なので、通常濃度の感受性を測っても意味がない。「併用が効くか」だけを見るための専用スクリーニング。',
  },

  /* ===== 肺炎球菌 ===== */
  {
    id: 'prsp',
    organisms: ['spneumoniae'],
    when: { anyR: [D.OXAS, D.PCG] },
    title: 'ペニシリン非感性肺炎球菌（PISP / PRSP）を疑う',
    urgency: 'normal',
    tests: [
      'オキサシリン1µgディスクはスクリーニングにすぎない。阻止円が小さければ、必ずペニシリンGのMICを測定する',
      'セフトリアキソン／セフォタキシムのMICも併せて測定する',
    ],
    report: [
      'ペニシリンのブレークポイントは「髄膜炎」「非髄膜炎（静注）」「経口ペニシリン」で3系統に分かれる。検体と病態を確認し、正しいブレークポイントで判定する',
      '髄膜炎由来なら髄膜炎用の厳しいブレークポイントで判定する。ここを取り違えると治療失敗に直結する',
      '【2025年4月の届出基準改正】届出の基準は「無菌検体（血液・髄液等）」と「無菌検体以外（喀痰等）」で別の値になった。CLSIのブレークポイントとは別物なので混同しない。検体の種類を必ず見る',
    ],
    notify: 'PRSPは感染症法5類定点（基幹定点）報告対象（施設SOPで確認）',
    source: 'CLSI M100（部位別ブレークポイント）／感染症法5類定点（2025年4月届出基準改正）（要確認）',
    verified: false,
  },

  /* ===== 腸内細菌目 ===== */
  {
    id: 'esbl',
    organisms: ['ecoli', 'kpneumoniae', 'koxytoca', 'pmirabilis', 'salmonella', 'styphi', 'shigella'],
    when: { anyR: [D.CTX, D.CAZ] },
    title: 'ESBL（基質特異性拡張型βラクタマーゼ）産生を疑う',
    urgency: 'normal',
    tests: [
      'クラブラン酸併用によるESBL確認試験を実施する。セフタジジム単独 vs セフタジジム/クラブラン酸、セフォタキシム単独 vs セフォタキシム/クラブラン酸を比較する',
      'ディスク法：クラブラン酸併用で阻止円が一定以上大きくなれば陽性（判定基準値はCLSI最新版で確認する）',
      'セファマイシン系（セフメタゾール等）が感性のままなら ESBL、セファマイシンも耐性なら AmpC や カルバペネマーゼ も疑う',
    ],
    report: [
      '現行のCLSIブレークポイントは、ESBL産生の有無にかかわらずMIC実測値どおりに報告してよい設計になっている。一方で「ESBL陽性ならセファロスポリンは一律耐性報告」という運用を残す施設もある。どちらを採るかは必ず自施設のSOPで確認する',
      'ESBL産生菌に対してセファマイシン系やカルバペネム系をどう扱うかも、施設ごとに方針が分かれる',
    ],
    source: 'CLSI M100（ESBL確認試験）（要確認・施設SOP必須）',
    verified: false,
    why: '「検査室の判定」と「報告の仕方」がずれやすい代表例。ルールを鵜呑みにせず施設の手順書を見る。',
  },
  {
    id: 'cre',
    organisms: ['ecoli', 'kpneumoniae', 'koxytoca', 'kaerogenes', 'enterobacter', 'cfreundii', 'ckoseri', 'smarcescens', 'pmirabilis', 'pvulgaris', 'morganella', 'providencia', 'salmonella', 'styphi', 'shigella'],
    when: { anyR: [D.MEPM, D.IPM, D.ERTA] },
    title: 'カルバペネム耐性腸内細菌目細菌（CRE）を疑う',
    urgency: 'urgent',
    tests: [
      'mCIM（modified carbapenem inactivation method）でカルバペネマーゼ産生の有無を確認する',
      'eCIM を併用して、メタロβラクタマーゼ（MBL）かどうかを判別する（eCIM陽性＝MBL）',
      '可能なら遺伝子検査で型まで特定する：IMP / NDM / VIM（＝MBL）、KPC、OXA-48 など。日本では IMP型 が多い',
      'カルバペネマーゼ非産生でもCREになりうる（ESBL/AmpC＋外膜ポーリン欠損）。mCIM陰性でも、耐性は耐性として報告する',
    ],
    report: [
      'メロペネム・イミペネム・エルタペネムのうち1剤でも非感性なら、他のカルバペネムも必ず測定する',
      'Proteus / Providencia / Morganella はイミペネムのMICが生まれつきやや高い。イミペネム単独の非感性でCREと決めない',
      '【2025年4月の届出基準改正】イミペネム＋セフメタゾールの基準は削除された。現行はメロペネム基準、または「メロペネムのMIC・阻止円に関わらず、カルバペネマーゼ産生またはその遺伝子が確認されること」。最新の届出基準は必ず自施設・保健所で確認する',
      '【最重要】メロペネムのMICが低くても、カルバペネマーゼ産生株でありうる。国のサーベイランスで、現行のメロペネム基準はカルバペネマーゼ産生CREの約13%を取りこぼすと分かっている。厚生科学審議会も「MICが低値でもカルバペネマーゼ産生株の可能性があることを臨床検査技師に伝える必要がある」と明記した。MIC基準だけで安心しない',
    ],
    notify: 'CREは感染症法5類全数届出対象。確定したら直ちに主治医・感染対策部門・保健所へ。院内アウトブレイクに直結する',
    source: '感染症法5類全数（カルバペネム耐性腸内細菌目細菌感染症、2025年4月届出基準改正）／CLSI M100 mCIM・eCIM（要確認）',
    verified: false,
    why: '旧基準（イミペネム＋セフメタゾール）だけを満たしていた症例の64.5%は Klebsiella aerogenes だった。これはカルバペネマーゼではなくAmpC過剰産生で、真の耐性ではない。旧基準は偽CREを大量に拾っていた。だから基準から外された。',
  },
  {
    id: 'ampc',
    organisms: ['enterobacter', 'cfreundii', 'kaerogenes', 'smarcescens', 'morganella', 'providencia'],
    when: { anyR: [D.CTX, D.CAZ] },
    title: '染色体性AmpCの過剰産生を疑う',
    urgency: 'normal',
    tests: [
      'セファマイシン系（セフメタゾール等）も耐性なら AmpC を強く疑う（ESBLならセファマイシンは感性のまま残ることが多い）',
      'ESBLとの合併もありうる。クラブラン酸によるESBL確認試験は、AmpC産生菌では偽陰性になりやすい',
    ],
    report: [
      '最大の注意点は「初回感性でも治療中に耐性化する」こと。第3世代セファロスポリンが感性と出ても、治療中の耐性化リスクを報告に添える運用があるか施設SOPで確認する',
      'セフェピム（第4世代）はAmpCに安定。第3世代が耐性でもセフェピムは残ることが多い',
    ],
    source: 'CLSI M100 ／ 誘導型AmpC産生菌（Enterobacter, Citrobacter freundii, Serratia, Providencia, Morganella, Klebsiella aerogenes）（要確認）',
    verified: false,
    why: 'AmpCは「感性と報告したのに効かなかった」が起きる典型。菌種を見た時点で身構える。',
  },
  {
    id: 'salmonella-fq',
    organisms: ['salmonella', 'styphi', 'shigella'],
    when: { anyR: [D.NA] },
    title: 'ナリジクス酸耐性 → フルオロキノロン低感受性を疑う',
    urgency: 'normal',
    tests: [
      'シプロフロキサシンのMICを必ず測定する。ディスク法だけで済ませない',
      'ナリジクス酸耐性は、キノロン耐性決定領域（QRDR）の変異を示すマーカーとして使う',
    ],
    report: [
      'ナリジクス酸耐性なら、シプロフロキサシンが「感性」と出ても臨床的に治療失敗する。この乖離こそが報告すべき情報',
      'チフス・パラチフスではアジスロマイシンやセフトリアキソンへの切り替えが必要になる',
    ],
    source: 'CLSI M100（Salmonella のFQ低感受性）（要確認）',
    verified: false,
    why: 'MICが感性域なのに効かない、という数少ない例外。ここを知らないと「感性」とだけ報告してしまう。',
  },
  {
    id: 'salmonella-report',
    organisms: ['salmonella', 'styphi', 'shigella'],
    when: { anyR: [D.ABPC, D.CTX, D.ST, D.CPFX, D.LVFX, D.NA, D.CP, D.AZM, D.MEPM] },
    title: '腸管系病原菌：感性と出ても報告してはいけない薬がある',
    urgency: 'normal',
    tests: ['菌種・血清型の同定を確定させる'],
    report: [
      '第1・第2世代セファロスポリン、セファマイシン系、アミノグリコシド系は、培地では「感性」と出ても細胞内の菌に届かず臨床的に無効。報告しない',
      '報告してよいのは、アンピシリン・フルオロキノロン・第3世代セファロスポリン・ST合剤・アジスロマイシン・クロラムフェニコールなど',
    ],
    notify: 'チフス菌・パラチフス菌・赤痢菌は感染症法3類。診断したら直ちに保健所へ届出。就業制限がかかる',
    source: 'CLSI M100 ／ 感染症法3類（要確認）',
    verified: false,
    why: '「感性」を機械的に転記すると、効かない薬を推奨してしまう。腸管系病原菌だけの特別ルール。',
  },

  /* ===== 緑膿菌 ===== */
  {
    id: 'mdrp',
    organisms: ['paeruginosa'],
    when: { allR: [D.IPM, D.AMK, D.LVFX] },
    title: '多剤耐性緑膿菌（MDRP）',
    urgency: 'urgent',
    tests: [
      'カルバペネム・アミカシン・フルオロキノロンの3系統すべてで耐性を再確認する（判定基準は施設SOP／届出基準で確認）',
      'メタロβラクタマーゼ（MBL）産生を確認する：SMA（メルカプト酢酸ナトリウム）阻害試験、あるいは mCIM/eCIM',
    ],
    report: [
      '再検で確認が取れるまで確定報告しない',
      '【2025年4月の変更】MDRPは基幹定点（月1回報告）から全数把握（7日以内に報告）へ変わった。以前の感覚で「月末にまとめて」ではもう間に合わない',
    ],
    notify: 'MDRPは感染症法5類全数届出対象（2025年4月に基幹定点から全数把握へ変更）。診断から7日以内に届出。直ちに主治医・感染対策部門・保健所へ',
    source: '感染症法5類全数（薬剤耐性緑膿菌感染症、2025年4月に全数把握化）（要確認）',
    verified: false,
  },
  {
    id: 'pa-carbapenem',
    organisms: ['paeruginosa'],
    when: { anyR: [D.IPM, D.MEPM] },
    title: '緑膿菌のカルバペネム耐性 — MBL産生かどうかを分ける',
    urgency: 'normal',
    tests: [
      'SMA阻害試験（メタロβラクタマーゼ確認）、あるいは mCIM/eCIM を実施する',
      'イミペネムだけ耐性でメロペネムが感性の場合、カルバペネマーゼではなく外膜ポーリン（OprD）欠損の可能性が高い。MBL確認は陰性になる',
    ],
    report: ['MBL産生株は院内伝播しうる。感染対策部門への報告基準を施設SOPで確認する'],
    source: 'CLSI M100 ／ MBL確認試験（要確認）',
    verified: false,
  },

  /* ===== アシネトバクター ===== */
  {
    id: 'mdra',
    organisms: ['abaumannii'],
    when: { allR: [D.IPM, D.AMK, D.LVFX] },
    title: '多剤耐性アシネトバクター（MDRA）',
    urgency: 'urgent',
    tests: [
      'カルバペネム・アミカシン・フルオロキノロンの3系統すべてで耐性を再確認する',
      'カルバペネマーゼ（OXA型が多い）の確認を検討する',
    ],
    report: ['再検で確認が取れるまで確定報告しない'],
    notify: 'MDRAは感染症法5類全数届出対象。確定したら直ちに主治医・感染対策部門・保健所へ。環境生存性が高くアウトブレイクを起こしやすい',
    source: '感染症法5類全数（薬剤耐性アシネトバクター感染症）（要確認）',
    verified: false,
  },

  /* ===== インフルエンザ菌・モラクセラ ===== */
  {
    id: 'blnar',
    organisms: ['hinfluenzae'],
    when: { anyR: [D.ABPC] },
    title: 'アンピシリン耐性 — βラクタマーゼ産生か BLNAR かを分ける',
    urgency: 'normal',
    tests: [
      'ニトロセフィン法でβラクタマーゼ産生の有無を確認する',
      'βラクタマーゼ陽性 → BLPAR（産生株）。陰性なのにアンピシリン耐性 → BLNAR（PBP変異による耐性）を疑う',
    ],
    report: [
      'BLPAR（βラクタマーゼ産生）→ クラブラン酸配合剤は有効',
      'BLNAR（PBP変異）→ βラクタマーゼ阻害薬を足しても無効。クラブラン酸配合剤を感性報告しない',
    ],
    source: 'CLSI M100（要確認）',
    verified: false,
    why: '同じ「アンピシリン耐性」でも、機序が違うと次に使える薬が真逆になる。ここを分けないと臨床が薬を誤る。',
  },
  {
    id: 'moraxella-bl',
    organisms: ['mcatarrhalis'],
    when: { anyR: [D.ABPC] },
    title: 'モラクセラのアンピシリン耐性 — ほぼ全株がβラクタマーゼ産生',
    urgency: 'normal',
    tests: ['ニトロセフィン法でβラクタマーゼ（BRO型）を確認する'],
    report: ['βラクタマーゼ産生でも、クラブラン酸・スルバクタム配合剤、第2・第3世代セファロスポリン、マクロライドは有効。アンピシリン単剤だけを耐性報告する'],
    source: 'CLSI M100（要確認）',
    verified: false,
  },

  /* ===== 淋菌 ===== */
  {
    id: 'gono-ctrx',
    organisms: ['ngonorrhoeae'],
    when: { anyR: [D.CTX] },
    title: 'セフトリアキソン低感受性淋菌 — 最後の薬が効かない',
    urgency: 'urgent',
    tests: [
      'MIC法で再確認する（ディスク法で済ませない）',
      '地方衛生研究所・国立感染症研究所への菌株送付を検討する。世界的なサーベイランス対象',
    ],
    report: ['確認が取れるまで確定報告しない。確定したら直ちに主治医へ連絡する'],
    notify: '淋菌感染症は感染症法5類定点。セフトリアキソン耐性株は公衆衛生上の重大事案として扱う',
    source: 'WHO / 感染症法5類定点（要確認）',
    verified: false,
  },

  /* ===== カンピロバクター・ピロリ ===== */
  {
    id: 'campylo-fq',
    organisms: ['campylobacter'],
    when: { anyR: [D.CPFX, D.LVFX] },
    title: 'カンピロバクターのフルオロキノロン耐性',
    urgency: 'normal',
    tests: ['エリスロマイシン／クラリスロマイシンの感受性を必ず併せて出す'],
    report: [
      '日本のフルオロキノロン耐性率は3〜4割。経験的にキノロンを選ぶと外れる。第一選択はマクロライド',
      'マクロライドも耐性なら治療選択肢が乏しくなるため、明確に伝える',
    ],
    source: 'JANIS / CLSI M45（要確認）',
    verified: false,
  },
  {
    id: 'hpylori-cam',
    organisms: ['hpylori'],
    when: { anyR: [D.CAM] },
    title: 'ピロリ菌のクラリスロマイシン耐性 — 一次除菌が失敗する',
    urgency: 'normal',
    tests: ['23S rRNA遺伝子の点変異（A2142G / A2143G）を確認する方法もある'],
    report: [
      'クラリスロマイシン耐性なら、一次除菌（PPI＋AMPC＋CAM）の成功率が大きく落ちる',
      '二次除菌（PPI＋AMPC＋メトロニダゾール）への切り替えが必要、と明示する',
    ],
    source: 'H. pylori 感染の診断と治療のガイドライン（要確認）',
    verified: false,
  },

  /* ===== 嫌気性菌 ===== */
  {
    id: 'anaerobe-cldm',
    organisms: ['bfragilis', 'bacteroides-other', 'parabacteroides', 'prevotella', 'porphyromonas', 'fusobacterium', 'finegoldia', 'peptostreptococcus'],
    when: { anyR: [D.CLDM] },
    title: '嫌気性菌のクリンダマイシン耐性 — 経験的治療が外れる',
    urgency: 'normal',
    tests: ['メトロニダゾール、βラクタマーゼ阻害薬配合剤、カルバペネムの感受性を必ず併せて出す'],
    report: [
      'Bacteroides群のクリンダマイシン耐性は3〜4割に達している。「嫌気性菌カバーにクリンダマイシン」という経験則はもう通用しない。耐性なら明確に伝える',
      'B. thetaiotaomicron など非フラジリス群は、fragilis よりさらに耐性率が高い。群まで同定して報告する',
    ],
    source: 'CLSI M11（嫌気性菌の感受性試験）／JANIS（要確認）',
    verified: false,
  },
  {
    id: 'anaerobe-mnz',
    organisms: ['bfragilis', 'bacteroides-other', 'parabacteroides', 'prevotella', 'fusobacterium', 'cperfringens'],
    when: { anyR: [D.MNZ] },
    title: 'メトロニダゾール耐性 — 嫌気性菌では稀。まず測定を疑う',
    urgency: 'urgent',
    tests: [
      '別コロニーで再検する。嫌気培養の条件（嫌気度・培地）が不適切だと偽耐性が出る',
      'nim遺伝子（nimA〜nimJ）の保有を確認する方法がある',
      '同定をやり直す。Cutibacterium・Actinomyces・Bifidobacterium はメトロニダゾールが生まれつき効かないので、耐性で正しい',
    ],
    report: [
      'メトロニダゾールは嫌気性菌治療の最後の砦。これを失うと選択肢がカルバペネムだけになる。確認が取れるまで確定報告しない',
    ],
    notify: '確定したら感染対策部門へ報告する。国内では極めて稀',
    source: 'CLSI M11（要確認）',
    verified: false,
    why: '「嫌気性菌なのにメトロニダゾールが効かない」には、本物の耐性・自然耐性・培養条件の失敗、の3通りある。取り違えない。',
  },
  {
    id: 'anaerobe-aminoglycoside',
    organisms: ['bfragilis', 'bacteroides-other', 'parabacteroides', 'prevotella', 'porphyromonas', 'fusobacterium', 'veillonella', 'peptostreptococcus', 'cperfringens', 'bilophila'],
    when: { S: [D.GM] },
    title: 'アミノグリコシドが「感性」— 嫌気性菌ではありえない',
    urgency: 'normal',
    tests: [
      '好気性菌の混入を疑う。純培養になっているか確認する',
      '菌種同定をやり直す（通性嫌気性菌との取り違え）',
      '嫌気培養の条件を確認する',
    ],
    report: ['アミノグリコシド系は嫌気性菌に生まれつき効かない（取り込みに酸素依存の輸送機構が要るため）。感性として報告しない'],
    source: '嫌気性菌の自然耐性（要確認）',
    verified: false,
    why: '嫌気性菌にアミノグリコシドの感受性を測ること自体が本来おかしい。感性と出たら、結果ではなく検査そのものを疑う。',
  },
  {
    id: 'bacteroides-carba',
    organisms: ['bfragilis', 'bacteroides-other'],
    when: { anyR: [D.MEPM, D.IPM] },
    title: 'バクテロイデスのカルバペネム耐性 — cfiA を疑う',
    urgency: 'urgent',
    tests: [
      'メタロβラクタマーゼ（cfiA / ccrA）遺伝子の保有を確認する',
      'メトロニダゾールの感受性を必ず併せて出す（ここまで失うと治療手段がほぼ無い）',
    ],
    report: ['嫌気性菌の感受性試験は日常的には行われないが、カルバペネム耐性が疑われる症例では実施する意義が大きい'],
    source: 'CLSI M11（嫌気性菌の感受性試験）（要確認）',
    verified: false,
  },

  /* ===== 抗酸菌 ===== */
  {
    id: 'mdrtb',
    organisms: ['mtb'],
    when: { allR: [D.INH, D.RFP] },
    title: '多剤耐性結核（MDR-TB）',
    urgency: 'urgent',
    tests: [
      'フルオロキノロン系とアミカシン等の二次抗結核薬の感受性を追加で測定する（超多剤耐性＝XDR-TB の判定に要る）',
      '遺伝子検査（rpoB / katG / inhA 変異）で確認する',
    ],
    report: ['確定したら直ちに主治医へ連絡する。治療レジメンが全面的に変わる'],
    notify: '結核は感染症法2類。診断したら直ちに保健所へ届出。MDR-TBは接触者健診の範囲が大きく変わる',
    source: '感染症法2類 ／ 結核医療の基準（要確認）',
    verified: false,
  },
  {
    id: 'abscessus-erm',
    organisms: ['mabscessus'],
    when: { anyR: [D.CAM] },
    title: 'M. abscessus のクラリスロマイシン耐性 — 誘導耐性を見逃さない',
    urgency: 'normal',
    tests: [
      'erm(41) 遺伝子の保有と、その配列型（T28 か C28 か）を確認する',
      '感受性試験の判定を3〜5日で打ち切らず、14日目まで延長して読む',
    ],
    report: [
      '初期判定で「感性」に見えても、erm(41)を持つ株は14日目に耐性化する。早期判定だけで感性報告すると治療が失敗する',
      'subsp. abscessus は erm(41) 機能株が多く、subsp. massiliense は欠損しているため感性のまま。亜種同定まで行う',
    ],
    source: 'CLSI M24（要確認）',
    verified: false,
    why: '「培養日数を延ばさないと見えない耐性」という珍しい型。判定を急ぐと必ず取り違える。',
  },

  /* ===== 真菌 ===== */
  {
    id: 'candida-azole',
    organisms: ['calbicans', 'cglabrata', 'ctropicalis', 'cparapsilosis'],
    when: { anyR: [D.FLCZ] },
    title: 'カンジダのアゾール耐性',
    urgency: 'normal',
    tests: [
      'エキノキャンディン（ミカファンギン・カスポファンギン）とアムホテリシンBの感受性を必ず併せて出す',
      '菌種同定を再確認する（C. krusei ならフルコナゾール耐性は自然耐性であって、獲得耐性ではない）',
    ],
    report: [
      'C. glabrata のフルコナゾールは「用量依存性感受性（SDD）」という別枠がある。単純に感性／耐性で報告しない',
      'C. parapsilosis はエキノキャンディンのMICが生まれつき高い。エキノキャンディンへ切り替えれば安心、とはならない',
    ],
    source: 'CLSI M27 / M60（要確認）',
    verified: false,
  },
  {
    id: 'candida-echino',
    organisms: ['cglabrata', 'calbicans', 'ctropicalis'],
    when: { anyR: [D.MCFG, D.CPFG] },
    title: 'エキノキャンディン耐性カンジダ — 治療の手が一気に減る',
    urgency: 'urgent',
    tests: [
      'FKS遺伝子の変異を確認する（可能なら）',
      'アムホテリシンBとアゾール系の感受性を必ず併せて出す',
    ],
    report: ['エキノキャンディンとアゾールの両方に耐性なら、残るのはアムホテリシンBのみになる。直ちに主治医へ連絡する'],
    source: 'CLSI M27 / M60（要確認）',
    verified: false,
  },
  {
    id: 'cauris',
    organisms: ['cauris'],
    when: { anyR: [D.FLCZ, D.VRCZ, D.MCFG, D.CPFG, D.AMPH] },
    title: 'Candida auris — 検出した時点でアウトブレイク対応',
    urgency: 'urgent',
    tests: [
      'MALDI-TOF（データベース更新済み）か遺伝子検査で同定を確定させる。従来の生化学同定機では C. haemulonii などと誤同定される',
      'フルコナゾール・ボリコナゾール・エキノキャンディン・アムホテリシンBの全系統で感受性を測る',
    ],
    report: ['同定が確定するまで確定報告しないが、疑った時点で感染対策部門へ第一報を入れる'],
    notify: '直ちに感染対策部門へ。環境に定着し、接触感染で広がる。保菌者スクリーニングと環境清掃（過酸化水素・次亜塩素酸）が要る',
    source: 'CDC / 国立感染症研究所（要確認）',
    verified: false,
    why: '誤同定されたまま通常のカンジダとして扱われるのが最大のリスク。同定機の結果を疑うべき数少ない菌。',
  },
  {
    id: 'aspergillus-azole',
    organisms: ['afumigatus'],
    when: { anyR: [D.VRCZ, D.ITCZ, D.PSCZ] },
    title: 'アゾール耐性アスペルギルス — 環境由来の耐性（TR34/L98H）を疑う',
    urgency: 'urgent',
    tests: [
      'cyp51A遺伝子の変異（TR34/L98H、TR46/Y121F/T289A）を確認する',
      'アムホテリシンBとエキノキャンディンの感受性を併せて出す',
    ],
    report: ['第一選択のボリコナゾールが使えなくなるため、直ちに主治医へ連絡する'],
    notify: '農薬由来のアゾール耐性株が世界的に拡大している。検出したら地方衛生研究所への報告を検討する',
    source: 'CLSI M38 / EUCAST（要確認）',
    verified: false,
  },
];

/* ---------- 患者情報ガード ----------
 * 職場のノートを持ち出す以上、患者が特定される情報の混入を機械で止める。
 * 完全な検出は不可能。「気づかせる」ための網でしかない。
 */
const PII_PATTERNS = [
  { re: /\b[0-9]{6,10}\b/, label: 'カルテID・検体番号らしき数字の並び' },
  { re: /(様|さん|氏)\s*$/m, label: '患者氏名らしき敬称' },
  { re: /(patient|pt\.?)\s*[:：]/i, label: '患者を指す記載' },
  { re: /\b(19|20)[0-9]{2}[-/年][0-9]{1,2}[-/月][0-9]{1,2}/, label: '生年月日らしき日付' },
  { re: /(病棟|外来|ICU|HCU)\s*[0-9]/, label: '病棟・部屋番号' },
  { re: /\b[0-9]{2,3}歳\s*(男|女)/, label: '年齢＋性別（症例が特定されうる）' },
];
