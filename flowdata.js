/* 菌譜 — 同定フロー用の検査所見タグ
 *
 * グラム染色性と形態は DETAILS（g / s）を流用する。ここに足すのは、
 * 現場のベンチで実際に見る鑑別検査（カタラーゼ・コアグラーゼ・溶血・オキシダーゼ・
 * ラクトース分解・芽胞・ウレアーゼ 等）と、教科書的な「決め手」だけ。
 *
 * 大原則：このフローは「候補を絞る」ためのもので、菌を確定しない。
 * 迷ったら詳細ページと自施設の同定手順で確認する。数値や細かい生化学性状は載せない。
 *
 * フィルタの約束：ある検査の値を持たない菌は、その検査では絞り込みの対象外（＝残す）。
 * これで「タグを付け忘れた菌を誤って除外する」事故が起きない。知っている所見だけ書けばよい。
 */

const FLOW_TAGS = {
  /* ===== ブドウ球菌（カタラーゼ陽性・コアグラーゼで分ける） ===== */
  saureus:        { catalase: '+', coagulase: '+', hemolysis: 'β' },
  cns:            { catalase: '+', coagulase: '-' },
  ssaprophyticus: { catalase: '+', coagulase: '-', special: ['尿由来', 'ノボビオシン耐性', '若年女性の膀胱炎'] },
  slugdunensis:   { catalase: '+', coagulase: '-', special: ['心内膜炎', 'スライドコアグラーゼ陽性のことあり'] },

  /* ===== レンサ球菌・腸球菌（カタラーゼ陰性・溶血で分ける） ===== */
  spyogenes:   { catalase: '-', hemolysis: 'β', special: ['ランスフィールドA群', 'バシトラシン感性', 'PYR陽性'] },
  sagalactiae: { catalase: '-', hemolysis: 'β', special: ['ランスフィールドB群', 'CAMP試験陽性', '馬尿酸陽性'] },
  spneumoniae: { catalase: '-', hemolysis: 'α', special: ['オプトヒン感性', '胆汁溶解陽性', 'ランセット型双球菌'] },
  viridans:    { catalase: '-', hemolysis: 'α', special: ['オプトヒン耐性', '胆汁溶解陰性'] },
  sanginosus:  { catalase: '-', hemolysis: 'γ', special: ['膿瘍', 'キャラメル臭'] },
  efaecalis:   { catalase: '-', hemolysis: 'γ', special: ['胆汁エスクリン陽性', '6.5%食塩発育', 'PYR陽性'] },
  efaecium:    { catalase: '-', hemolysis: 'γ', special: ['胆汁エスクリン陽性', 'アンピシリン耐性が多い'] },
  evanc:       { catalase: '-', hemolysis: 'γ', special: ['運動性あり', '黄色色素', 'vanC自然耐性'] },
  peptostreptococcus: { catalase: '-', oxygen: '嫌気' },
  finegoldia:  { catalase: '-', oxygen: '嫌気', special: ['嫌気性グラム陽性球菌で最多'] },

  /* ===== グラム陽性桿菌 ===== */
  bacillus:      { catalase: '+', spore: '+', oxygen: '好気', special: ['大型', '芽胞', '食中毒/輸液感染'] },
  listeria:      { catalase: '+', oxygen: '通性', special: ['低温発育(4℃)', '転倒運動', '髄膜炎(妊婦/高齢)'] },
  corynebacterium: { catalase: '+', special: ['V字・柵状配列', '棍棒状'] },
  nocardia:      { catalase: '+', oxygen: '好気', special: ['分枝', '部分抗酸性', '発育が遅い', '免疫低下'] },
  lactobacillus: { catalase: '-', special: ['バンコマイシン自然耐性', '腟常在'] },
  cperfringens:  { spore: '+', oxygen: '嫌気', hemolysis: 'β', special: ['ダブルゾーン溶血', 'レシチナーゼ陽性', 'ガス壊疽'] },
  cdifficile:    { spore: '+', oxygen: '嫌気', special: ['トキシン/GDH', '馬糞様臭', '抗菌薬関連下痢'] },
  ctetani:       { spore: '+', oxygen: '嫌気', special: ['太鼓のばち状芽胞', '破傷風'] },
  cbotulinum:    { spore: '+', oxygen: '嫌気', special: ['毒素検出で診断', 'ボツリヌス'] },
  csepticum:     { spore: '+', oxygen: '嫌気', special: ['非外傷性ガス壊疽', '大腸癌を疑う'] },
  cinnocuum:     { spore: '+', oxygen: '嫌気', special: ['バンコマイシン自然耐性', 'CDI治療中に出る'] },
  actinomyces:   { oxygen: '嫌気', special: ['分枝', '抗酸性なし', '硫黄顆粒', '発育が遅い'] },
  cutibacterium: { oxygen: '嫌気', catalase: '+', special: ['皮膚常在', '人工物感染', '発育が遅い'] },
  bifidobacterium: { oxygen: '嫌気', special: ['腸内常在', 'メトロニダゾール耐性'] },

  /* ===== 腸内細菌目（オキシダーゼ陰性・ラクトースで分ける） ===== */
  ecoli:       { oxidase: '-', lactose: '+', oxygen: '通性', special: ['尿路感染最多', 'IMViC ++--'] },
  kpneumoniae: { oxidase: '-', lactose: '+', oxygen: '通性', special: ['粘稠コロニー(莢膜)', '非運動性', 'アンピシリン自然耐性'] },
  koxytoca:    { oxidase: '-', lactose: '+', oxygen: '通性', special: ['インドール陽性'] },
  enterobacter: { oxidase: '-', lactose: '+', oxygen: '通性', special: ['運動性あり', '誘導型AmpC'] },
  kaerogenes:  { oxidase: '-', lactose: '+', oxygen: '通性', special: ['旧Enterobacter aerogenes', '誘導型AmpC'] },
  cfreundii:   { oxidase: '-', lactose: '+', oxygen: '通性', special: ['H2S陽性のことあり', '誘導型AmpC'] },
  smarcescens: { oxidase: '-', lactose: '-', oxygen: '通性', special: ['赤色色素のことあり', 'DNase陽性', 'コリスチン自然耐性'] },
  salmonella:  { oxidase: '-', lactose: '-', oxygen: '通性', special: ['H2S陽性(黒色)', '3類/食中毒'] },
  styphi:      { oxidase: '-', lactose: '-', oxygen: '通性', special: ['H2S弱〜陰性', 'Vi抗原', '3類'] },
  shigella:    { oxidase: '-', lactose: '-', oxygen: '通性', special: ['非運動性', 'H2S陰性', '3類'] },
  pmirabilis:  { oxidase: '-', lactose: '-', urease: '+', oxygen: '通性', special: ['スウォーミング(遊走)', 'インドール陰性', 'ストラバイト結石'] },
  pvulgaris:   { oxidase: '-', lactose: '-', urease: '+', oxygen: '通性', special: ['スウォーミング', 'インドール陽性'] },
  morganella:  { oxidase: '-', lactose: '-', urease: '+', oxygen: '通性', special: ['誘導型AmpC', 'イミペネムMIC生来高め'] },
  providencia: { oxidase: '-', lactose: '-', oxygen: '通性', special: ['長期カテーテル', 'ゲンタマイシン耐性多い'] },
  ckoseri:     { oxidase: '-', lactose: '+', oxygen: '通性', special: ['新生児髄膜炎/脳膿瘍'] },
  yersinia:    { oxidase: '-', lactose: '-', oxygen: '通性', special: ['低温発育', 'CIN寒天', '回腸末端炎'] },

  /* ===== ブドウ糖非発酵菌・オキシダーゼで分かれるGNR ===== */
  paeruginosa:  { oxidase: '+', lactose: '-', oxygen: '好気', special: ['ブドウ糖非発酵', '緑色色素/甘い臭い', '42℃発育', 'エルタペネム自然耐性'] },
  bcepacia:     { oxidase: '+', lactose: '-', oxygen: '好気', special: ['ブドウ糖非発酵', '消毒薬汚染', 'コリスチン自然耐性'] },
  achromobacter: { oxidase: '+', lactose: '-', oxygen: '好気', special: ['ブドウ糖非発酵', '周毛性運動', '緑膿菌類似'] },
  abaumannii:   { oxidase: '-', lactose: '-', oxygen: '好気', special: ['ブドウ糖非発酵', '球桿菌', '乾燥表面で長期生存', 'エルタペネム自然耐性'] },
  smaltophilia: { oxidase: '-', lactose: '-', oxygen: '好気', special: ['ブドウ糖非発酵', 'DNase陽性', 'カルバペネム自然耐性', 'ST合剤が第一選択'] },

  /* ===== グラム陰性 その他 ===== */
  hinfluenzae:  { oxidase: '+', oxygen: '通性', special: ['チョコレート寒天のみ', 'X因子/V因子要求', '衛星現象'] },
  mcatarrhalis: { oxidase: '+', special: ['グラム陰性双球菌', 'DNase陽性', 'ホッケーパック様コロニー'] },
  nmeningitidis: { oxidase: '+', special: ['そら豆型双球菌', 'マルトース分解陽性', '5類全数'] },
  ngonorrhoeae: { oxidase: '+', special: ['好中球内双球菌', 'ブドウ糖のみ分解', 'Thayer-Martin培地'] },
  campylobacter: { oxidase: '+', oxygen: '微好気', special: ['カモメ翼状', '42℃', '微好気', '食中毒最多'] },
  hpylori:      { oxidase: '+', oxygen: '微好気', urease: '+', special: ['ウレアーゼ強陽性', 'らせん菌', '胃'] },
  vibrio:       { oxidase: '+', oxygen: '通性', special: ['コンマ状湾曲', '好塩性', 'TCBS寒天'] },
  aeromonas:    { oxidase: '+', oxygen: '通性', special: ['淡水/創傷', '非好塩性'] },
  pasteurella:  { oxidase: '+', special: ['両端染色', 'イヌネコ咬傷', 'マッコンキー発育せず', 'ペニシリン著効'] },
  legionella:   { oxygen: '好気', special: ['BCYEα培地必須', '尿中抗原', 'グラム染色で見えにくい'] },
  bordetella:   { oxygen: '好気', special: ['ボルデー・ジャング培地', 'LAMP/PCR', '百日咳'] },

  /* ===== 嫌気性グラム陰性 ===== */
  bfragilis:        { oxidase: '-', oxygen: '嫌気', special: ['胆汁耐性(BBE黒色)', '腹腔内感染', 'アミノグリコシド自然耐性'] },
  'bacteroides-other': { oxygen: '嫌気', special: ['高度多剤耐性'] },
  parabacteroides:  { oxygen: '嫌気' },
  porphyromonas:    { oxygen: '嫌気', special: ['黒色色素', '歯周病'] },
  prevotella:       { oxygen: '嫌気', special: ['黒色色素のことあり', '口腔嫌気性菌', '誤嚥性肺炎'] },
  fusobacterium:    { oxygen: '嫌気', special: ['紡錘形', 'Lemierre症候群'] },
  leptotrichia:     { oxygen: '嫌気' },
  bilophila:        { oxygen: '嫌気', special: ['胆汁で増える', '虫垂炎穿孔'] },
  veillonella:      { oxygen: '嫌気', special: ['嫌気性グラム陰性球菌'] },
  eggerthella:      { oxygen: '嫌気', special: ['メトロニダゾール耐性報告あり'] },
  gardnerella:      { special: ['clue cell', '細菌性腟症', 'Nugentスコア'] },
  mobiluncus:       { oxygen: '嫌気', special: ['湾曲桿菌', '細菌性腟症'] },
  actinomyces_dup:  {},

  /* ===== 抗酸菌 ===== */
  mtb:        { special: ['チール・ネルゼン染色', '小川培地4〜8週', '2類', '空気感染'] },
  mac:        { special: ['非結核性抗酸菌', '浴室/シャワー', '中葉舌区'] },
  mabscessus: { special: ['迅速発育菌(7日以内)', 'erm41誘導耐性', '美容/鍼後'] },
  mkansasii:  { special: ['光発色性', '結核類似'] },

  /* ===== 真菌 ===== */
  calbicans:     { special: ['発芽管陽性', '仮性菌糸', 'クロモアガーで緑'] },
  cglabrata:     { special: ['発芽管陰性', '仮性菌糸なし', 'フルコナゾールSDD'] },
  cparapsilosis: { special: ['カテーテル関連', 'エキノキャンディン生来MIC高'] },
  ckrusei:       { special: ['フルコナゾール自然耐性'] },
  ctropicalis:   { special: ['好中球減少で毒性'] },
  cauris:        { special: ['誤同定されやすい', '多剤耐性', 'アウトブレイク', 'MALDI/遺伝子で確定'] },
  cryptococcus:  { special: ['墨汁染色で莢膜', '莢膜抗原', 'ウレアーゼ陽性', 'エキノキャンディン自然耐性'] },
  afumigatus:    { special: ['45度鋭角分枝', '隔壁あり', 'ボリコナゾール第一選択'] },
  mucorales:     { special: ['直角分枝', '隔壁なし', 'リボン状', 'アムホテリシンB'] },

  /* ===== その他 ===== */
  mycoplasma:  { special: ['細胞壁なし', 'βラクタム無効', '目玉焼き状コロニー'] },
};

/* 同定フローの質問。上から順に、候補が2通り以上の値を持つものだけ出す。 */
const FLOW_STEPS = [
  { key: 'gram', label: 'グラム染色は？', from: 'gram',
    options: [
      { v: '陽性', label: '🔴 グラム陽性' },
      { v: '陰性', label: '🔵 グラム陰性' },
      { v: '抗酸菌', label: '抗酸菌（染まりにくい）' },
      { v: '真菌', label: '真菌' },
    ] },
  { key: 'shape', label: '形は？', from: 'shape',
    options: [
      { v: '球菌', label: '球菌' },
      { v: '桿菌', label: '桿菌' },
      { v: '球桿菌', label: '球桿菌' },
      { v: 'らせん菌', label: 'らせん菌・湾曲' },
      { v: '酵母', label: '酵母（真菌）' },
      { v: '糸状菌', label: '糸状菌（真菌）' },
    ] },
  { key: 'catalase', label: 'カタラーゼは？',
    options: [{ v: '+', label: 'カタラーゼ陽性' }, { v: '-', label: 'カタラーゼ陰性' }] },
  { key: 'coagulase', label: 'コアグラーゼは？',
    options: [{ v: '+', label: 'コアグラーゼ陽性' }, { v: '-', label: 'コアグラーゼ陰性' }] },
  { key: 'hemolysis', label: '血液寒天での溶血は？',
    options: [{ v: 'β', label: 'β溶血（透明・完全）' }, { v: 'α', label: 'α溶血（緑色）' }, { v: 'γ', label: 'γ（非溶血）' }] },
  { key: 'oxidase', label: 'オキシダーゼは？',
    options: [{ v: '+', label: 'オキシダーゼ陽性' }, { v: '-', label: 'オキシダーゼ陰性' }] },
  { key: 'lactose', label: 'ラクトース分解は？（マッコンキー）',
    options: [{ v: '+', label: '分解（ピンク）' }, { v: '-', label: '非分解' }] },
  { key: 'spore', label: '芽胞は？',
    options: [{ v: '+', label: '芽胞あり' }] },
  { key: 'urease', label: 'ウレアーゼは？',
    options: [{ v: '+', label: 'ウレアーゼ陽性' }] },
  { key: 'oxygen', label: '発育環境は？',
    options: [
      { v: '好気', label: '好気性' }, { v: '通性', label: '通性嫌気' },
      { v: '嫌気', label: '偏性嫌気' }, { v: '微好気', label: '微好気' },
    ] },
];
