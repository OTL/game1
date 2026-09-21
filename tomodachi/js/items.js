// アイテム図鑑。たべもの・ふく・インテリア・どうぐ・おたから・うた・くちぐせ をぜんぶここに置く。
// このファイルはデータのかたまりなので、外から読むのは import { FOODS, byId, ... } だけでよい。
import { seeded, shuffle, pick } from './rng.js';

/* ============================================================
 * たべもの（143 しゅるい）
 * kind: 'meat'|'fish'|'veg'|'sweet'|'noodle'|'rice'|'bread'|'drink'|'fruit'|'odd'
 * 'odd' はゲテモノわく。やすくて exp はたかいけど、きらわれやすい。
 * ============================================================ */
export const FOODS = [
  // ---- おにく ----
  { id: 'food_karaage',    name: 'からあげ',           emoji: '🍗', price: 180, kind: 'meat', exp: 15 },
  { id: 'food_hamburg',    name: 'ハンバーグ',         emoji: '🍖', price: 260, kind: 'meat', exp: 18 },
  { id: 'food_tonkatsu',   name: 'とんかつ',           emoji: '🍖', price: 300, kind: 'meat', exp: 19 },
  { id: 'food_steak',      name: 'ステーキ',           emoji: '🥩', price: 620, kind: 'meat', exp: 28 },
  { id: 'food_yakitori',   name: 'やきとり',           emoji: '🍢', price: 150, kind: 'meat', exp: 13 },
  { id: 'food_shogayaki',  name: 'しょうがやき',       emoji: '🍖', price: 280, kind: 'meat', exp: 17 },
  { id: 'food_gyoza',      name: 'ぎょうざ',           emoji: '🥟', price: 220, kind: 'meat', exp: 16 },
  { id: 'food_roastbeef',  name: 'ローストビーフ',     emoji: '🥩', price: 560, kind: 'meat', exp: 26 },
  { id: 'food_sausage',    name: 'ソーセージ',         emoji: '🌭', price: 120, kind: 'meat', exp: 11 },
  { id: 'food_meatball',   name: 'ミートボール',       emoji: '🍡', price: 140, kind: 'meat', exp: 12 },
  { id: 'food_nugget',     name: 'チキンナゲット',     emoji: '🍗', price: 160, kind: 'meat', exp: 13 },
  { id: 'food_kakuni',     name: 'ぶたのかくに',       emoji: '🍖', price: 340, kind: 'meat', exp: 20 },
  { id: 'food_roastchick', name: 'ローストチキン',     emoji: '🍗', price: 480, kind: 'meat', exp: 24 },
  { id: 'food_menchi',     name: 'メンチカツ',         emoji: '🍖', price: 200, kind: 'meat', exp: 15 },
  { id: 'food_yakiniku',   name: 'やきにく',           emoji: '🥩', price: 700, kind: 'meat', exp: 30 },
  { id: 'food_baconegg',   name: 'ベーコンエッグ',     emoji: '🍳', price: 130, kind: 'meat', exp: 11 },

  // ---- おさかな ----
  { id: 'food_sashimi',    name: 'おさしみ',           emoji: '🍣', price: 420, kind: 'fish', exp: 23 },
  { id: 'food_yakizakana', name: 'やきざかな',         emoji: '🐟', price: 240, kind: 'fish', exp: 16 },
  { id: 'food_sabamiso',   name: 'さばのみそに',       emoji: '🐟', price: 260, kind: 'fish', exp: 17 },
  { id: 'food_ebifry',     name: 'えびフライ',         emoji: '🍤', price: 320, kind: 'fish', exp: 19 },
  { id: 'food_takoyaki',   name: 'たこやき',           emoji: '🐙', price: 180, kind: 'fish', exp: 14 },
  { id: 'food_unagi',      name: 'うなぎのかばやき',   emoji: '🍱', price: 780, kind: 'fish', exp: 32 },
  { id: 'food_ikayaki',    name: 'いかやき',           emoji: '🦑', price: 190, kind: 'fish', exp: 14 },
  { id: 'food_kanikoro',   name: 'かにクリームコロッケ', emoji: '🦀', price: 300, kind: 'fish', exp: 18 },
  { id: 'food_shishamo',   name: 'ししゃも',           emoji: '🐟', price: 150, kind: 'fish', exp: 12 },
  { id: 'food_ajihiraki',  name: 'あじのひらき',       emoji: '🐟', price: 170, kind: 'fish', exp: 13 },
  { id: 'food_hotate',     name: 'ホタテのバターやき', emoji: '🦪', price: 380, kind: 'fish', exp: 21 },
  { id: 'food_seagratin',  name: 'シーフードグラタン', emoji: '🥘', price: 360, kind: 'fish', exp: 20 },
  { id: 'food_ikuradon',   name: 'いくらどん',         emoji: '🍚', price: 690, kind: 'fish', exp: 29 },
  { id: 'food_asari',      name: 'あさりのさかむし',   emoji: '🦪', price: 230, kind: 'fish', exp: 15 },

  // ---- やさい ----
  { id: 'food_salad',      name: 'サラダ',             emoji: '🥗', price: 120, kind: 'veg', exp: 10 },
  { id: 'food_yasaiitame', name: 'やさいいため',       emoji: '🥬', price: 160, kind: 'veg', exp: 12 },
  { id: 'food_oden',       name: 'おでん',             emoji: '🍢', price: 240, kind: 'veg', exp: 16 },
  { id: 'food_potesara',   name: 'ポテトサラダ',       emoji: '🥔', price: 140, kind: 'veg', exp: 11 },
  { id: 'food_cornsoup',   name: 'コーンスープ',       emoji: '🥣', price: 110, kind: 'veg', exp: 9 },
  { id: 'food_tomatomari', name: 'トマトのマリネ',     emoji: '🍅', price: 180, kind: 'veg', exp: 13 },
  { id: 'food_kinpira',    name: 'きんぴらごぼう',     emoji: '🥕', price: 130, kind: 'veg', exp: 11 },
  { id: 'food_ohitashi',   name: 'ほうれんそうのおひたし', emoji: '🥬', price: 120, kind: 'veg', exp: 10 },
  { id: 'food_vegstick',   name: 'やさいスティック',   emoji: '🥕', price: 100, kind: 'veg', exp: 8 },
  { id: 'food_ratatouille',name: 'ラタトゥイユ',       emoji: '🍆', price: 260, kind: 'veg', exp: 16 },
  { id: 'food_sengiri',    name: 'キャベツのせんぎり', emoji: '🥬', price: 80,  kind: 'veg', exp: 7 },
  { id: 'food_nasumiso',   name: 'なすのみそいため',   emoji: '🍆', price: 170, kind: 'veg', exp: 13 },
  { id: 'food_kabocha',    name: 'かぼちゃのにもの',   emoji: '🎃', price: 150, kind: 'veg', exp: 12 },

  // ---- あまいもの ----
  { id: 'food_shortcake',  name: 'ショートケーキ',     emoji: '🍰', price: 420, kind: 'sweet', exp: 22 },
  { id: 'food_chocolate',  name: 'チョコレート',       emoji: '🍫', price: 180, kind: 'sweet', exp: 14 },
  { id: 'food_purin',      name: 'プリン',             emoji: '🍮', price: 160, kind: 'sweet', exp: 13 },
  { id: 'food_icecream',   name: 'アイスクリーム',     emoji: '🍨', price: 200, kind: 'sweet', exp: 15 },
  { id: 'food_donut',      name: 'ドーナツ',           emoji: '🍩', price: 150, kind: 'sweet', exp: 12 },
  { id: 'food_cookie',     name: 'クッキー',           emoji: '🍪', price: 120, kind: 'sweet', exp: 10 },
  { id: 'food_dango',      name: 'おだんご',           emoji: '🍡', price: 130, kind: 'sweet', exp: 11 },
  { id: 'food_taiyaki',    name: 'たいやき',           emoji: '🐟', price: 140, kind: 'sweet', exp: 12 },
  { id: 'food_dorayaki',   name: 'どらやき',           emoji: '🥮', price: 150, kind: 'sweet', exp: 12 },
  { id: 'food_watagashi',  name: 'わたあめ',           emoji: '☁️', price: 90,  kind: 'sweet', exp: 8 },
  { id: 'food_pancake',    name: 'パンケーキ',         emoji: '🥞', price: 300, kind: 'sweet', exp: 18 },
  { id: 'food_shucream',   name: 'シュークリーム',     emoji: '🧁', price: 190, kind: 'sweet', exp: 14 },
  { id: 'food_montblanc',  name: 'モンブラン',         emoji: '🌰', price: 440, kind: 'sweet', exp: 23 },
  { id: 'food_jelly',      name: 'ゼリー',             emoji: '🍧', price: 110, kind: 'sweet', exp: 9 },
  { id: 'food_yokan',      name: 'ようかん',           emoji: '🍫', price: 170, kind: 'sweet', exp: 13 },
  { id: 'food_macaron',    name: 'マカロン',           emoji: '🍬', price: 260, kind: 'sweet', exp: 17 },
  { id: 'food_softcream',  name: 'ソフトクリーム',     emoji: '🍦', price: 180, kind: 'sweet', exp: 14 },
  { id: 'food_daifuku',    name: 'いちごだいふく',     emoji: '🍡', price: 220, kind: 'sweet', exp: 16 },
  { id: 'food_castella',   name: 'カステラ',           emoji: '🍞', price: 200, kind: 'sweet', exp: 15 },
  { id: 'food_chocobanana',name: 'チョコバナナ',       emoji: '🍌', price: 150, kind: 'sweet', exp: 12 },
  { id: 'food_caramel',    name: 'キャラメル',         emoji: '🍬', price: 80,  kind: 'sweet', exp: 7 },
  { id: 'food_purinamode', name: 'プリンアラモード',   emoji: '🍨', price: 480, kind: 'sweet', exp: 24 },

  // ---- めん ----
  { id: 'food_ramen',      name: 'ラーメン',           emoji: '🍜', price: 120, kind: 'noodle', exp: 14 },
  { id: 'food_udon',       name: 'うどん',             emoji: '🍲', price: 110, kind: 'noodle', exp: 12 },
  { id: 'food_soba',       name: 'おそば',             emoji: '🍜', price: 130, kind: 'noodle', exp: 13 },
  { id: 'food_yakisoba',   name: 'やきそば',           emoji: '🍝', price: 160, kind: 'noodle', exp: 14 },
  { id: 'food_spaghetti',  name: 'スパゲッティ',       emoji: '🍝', price: 240, kind: 'noodle', exp: 17 },
  { id: 'food_tsukemen',   name: 'つけめん',           emoji: '🍜', price: 260, kind: 'noodle', exp: 18 },
  { id: 'food_somen',      name: 'そうめん',           emoji: '🍜', price: 100, kind: 'noodle', exp: 10 },
  { id: 'food_carbonara',  name: 'カルボナーラ',       emoji: '🍝', price: 320, kind: 'noodle', exp: 20 },
  { id: 'food_champon',    name: 'ちゃんぽん',         emoji: '🍜', price: 280, kind: 'noodle', exp: 18 },
  { id: 'food_hiyashichu', name: 'ひやしちゅうか',     emoji: '🍜', price: 230, kind: 'noodle', exp: 16 },
  { id: 'food_meatsauce',  name: 'ミートソースパスタ', emoji: '🍝', price: 290, kind: 'noodle', exp: 19 },
  { id: 'food_yakiudon',   name: 'やきうどん',         emoji: '🍲', price: 180, kind: 'noodle', exp: 14 },

  // ---- ごはん ----
  { id: 'food_onigiri',    name: 'おにぎり',           emoji: '🍙', price: 90,  kind: 'rice', exp: 9 },
  { id: 'food_curry',      name: 'カレーライス',       emoji: '🍛', price: 250, kind: 'rice', exp: 18 },
  { id: 'food_omurice',    name: 'オムライス',         emoji: '🍳', price: 280, kind: 'rice', exp: 19 },
  { id: 'food_chahan',     name: 'チャーハン',         emoji: '🍚', price: 220, kind: 'rice', exp: 16 },
  { id: 'food_sushi',      name: 'おすし',             emoji: '🍣', price: 640, kind: 'rice', exp: 29 },
  { id: 'food_gyudon',     name: 'ぎゅうどん',         emoji: '🍚', price: 230, kind: 'rice', exp: 17 },
  { id: 'food_tendon',     name: 'てんどん',           emoji: '🍤', price: 380, kind: 'rice', exp: 21 },
  { id: 'food_okayu',      name: 'おかゆ',             emoji: '🍚', price: 70,  kind: 'rice', exp: 7 },
  { id: 'food_okowa',      name: 'おこわ',             emoji: '🍙', price: 190, kind: 'rice', exp: 14 },
  { id: 'food_inari',      name: 'いなりずし',         emoji: '🍣', price: 160, kind: 'rice', exp: 13 },
  { id: 'food_risotto',    name: 'リゾット',           emoji: '🍚', price: 340, kind: 'rice', exp: 20 },
  { id: 'food_doria',      name: 'ドリア',             emoji: '🥘', price: 330, kind: 'rice', exp: 20 },
  { id: 'food_katsudon',   name: 'かつどん',           emoji: '🍚', price: 360, kind: 'rice', exp: 21 },
  { id: 'food_tamagokake', name: 'たまごかけごはん',   emoji: '🥚', price: 60,  kind: 'rice', exp: 6 },

  // ---- パン ----
  { id: 'food_shokupan',   name: 'しょくパン',         emoji: '🍞', price: 80,  kind: 'bread', exp: 8 },
  { id: 'food_melonpan',   name: 'メロンパン',         emoji: '🍈', price: 140, kind: 'bread', exp: 12 },
  { id: 'food_croissant',  name: 'クロワッサン',       emoji: '🥐', price: 160, kind: 'bread', exp: 13 },
  { id: 'food_sandwich',   name: 'サンドイッチ',       emoji: '🥪', price: 200, kind: 'bread', exp: 15 },
  { id: 'food_hotdog',     name: 'ホットドッグ',       emoji: '🌭', price: 210, kind: 'bread', exp: 15 },
  { id: 'food_hamburger',  name: 'ハンバーガー',       emoji: '🍔', price: 290, kind: 'bread', exp: 19 },
  { id: 'food_currypan',   name: 'カレーパン',         emoji: '🥐', price: 150, kind: 'bread', exp: 12 },
  { id: 'food_anpan',      name: 'あんパン',           emoji: '🥯', price: 130, kind: 'bread', exp: 11 },
  { id: 'food_pizza',      name: 'ピザ',               emoji: '🍕', price: 520, kind: 'bread', exp: 25 },
  { id: 'food_frenchtoast',name: 'フレンチトースト',   emoji: '🍞', price: 260, kind: 'bread', exp: 17 },
  { id: 'food_bagel',      name: 'ベーグル',           emoji: '🥯', price: 170, kind: 'bread', exp: 13 },
  { id: 'food_creampan',   name: 'クリームパン',       emoji: '🥐', price: 140, kind: 'bread', exp: 12 },

  // ---- のみもの ----
  { id: 'food_milk',       name: 'ぎゅうにゅう',       emoji: '🥛', price: 70,  kind: 'drink', exp: 7 },
  { id: 'food_orangejuice',name: 'オレンジジュース',   emoji: '🧃', price: 110, kind: 'drink', exp: 9 },
  { id: 'food_koucha',     name: 'こうちゃ',           emoji: '🫖', price: 130, kind: 'drink', exp: 10 },
  { id: 'food_coffee',     name: 'コーヒー',           emoji: '☕', price: 150, kind: 'drink', exp: 11 },
  { id: 'food_ryokucha',   name: 'りょくちゃ',         emoji: '🍵', price: 90,  kind: 'drink', exp: 8 },
  { id: 'food_cocoa',      name: 'ココア',             emoji: '☕', price: 140, kind: 'drink', exp: 11 },
  { id: 'food_cider',      name: 'サイダー',           emoji: '🥤', price: 100, kind: 'drink', exp: 9 },
  { id: 'food_smoothie',   name: 'スムージー',         emoji: '🥤', price: 240, kind: 'drink', exp: 15 },
  { id: 'food_lemonade',   name: 'レモネード',         emoji: '🍋', price: 160, kind: 'drink', exp: 12 },
  { id: 'food_misoshiru',  name: 'みそしる',           emoji: '🍵', price: 80,  kind: 'drink', exp: 8 },
  { id: 'food_tapioca',    name: 'タピオカミルクティー', emoji: '🧋', price: 320, kind: 'drink', exp: 18 },
  { id: 'food_bananajuice',name: 'バナナジュース',     emoji: '🥤', price: 200, kind: 'drink', exp: 14 },
  { id: 'food_amazake',    name: 'あまざけ',           emoji: '🍶', price: 170, kind: 'drink', exp: 12 },
  { id: 'food_sportsdrink',name: 'スポーツドリンク',   emoji: '🥤', price: 120, kind: 'drink', exp: 10 },

  // ---- くだもの ----
  { id: 'food_ichigo',     name: 'いちご',             emoji: '🍓', price: 210, kind: 'fruit', exp: 15 },
  { id: 'food_ringo',      name: 'りんご',             emoji: '🍎', price: 120, kind: 'fruit', exp: 10 },
  { id: 'food_banana',     name: 'バナナ',             emoji: '🍌', price: 90,  kind: 'fruit', exp: 9 },
  { id: 'food_mikan',      name: 'みかん',             emoji: '🍊', price: 80,  kind: 'fruit', exp: 8 },
  { id: 'food_budou',      name: 'ぶどう',             emoji: '🍇', price: 280, kind: 'fruit', exp: 17 },
  { id: 'food_suika',      name: 'すいか',             emoji: '🍉', price: 340, kind: 'fruit', exp: 19 },
  { id: 'food_momo',       name: 'もも',               emoji: '🍑', price: 260, kind: 'fruit', exp: 16 },
  { id: 'food_melon',      name: 'メロン',             emoji: '🍈', price: 700, kind: 'fruit', exp: 30 },
  { id: 'food_pineapple',  name: 'パイナップル',       emoji: '🍍', price: 230, kind: 'fruit', exp: 15 },
  { id: 'food_sakuranbo',  name: 'さくらんぼ',         emoji: '🍒', price: 300, kind: 'fruit', exp: 18 },
  { id: 'food_kaki',       name: 'かき',               emoji: '🟠', price: 110, kind: 'fruit', exp: 10 },
  { id: 'food_nashi',      name: 'なし',               emoji: '🍐', price: 130, kind: 'fruit', exp: 11 },
  { id: 'food_kiwi',       name: 'キウイ',             emoji: '🥝', price: 140, kind: 'fruit', exp: 11 },
  { id: 'food_mango',      name: 'マンゴー',           emoji: '🥭', price: 420, kind: 'fruit', exp: 22 },

  // ---- ゲテモノ ----
  { id: 'food_nattoparfait', name: 'なっとうパフェ',     emoji: '🍨', price: 60, kind: 'odd', exp: 34 },
  { id: 'food_konnyakusteak',name: 'こんにゃくステーキ', emoji: '🥩', price: 50, kind: 'odd', exp: 28 },
  { id: 'food_wasabiice',    name: 'わさびアイス',       emoji: '🍦', price: 70, kind: 'odd', exp: 30 },
  { id: 'food_shiokaracookie',name:'しおからクッキー',   emoji: '🍪', price: 55, kind: 'odd', exp: 29 },
  { id: 'food_nigauri',      name: 'にがうりジュース',   emoji: '🥤', price: 45, kind: 'odd', exp: 26 },
  { id: 'food_chilichoco',   name: 'とうがらしチョコ',   emoji: '🌶️', price: 65, kind: 'odd', exp: 31 },
  { id: 'food_medamaparfait',name: 'めだまやきパフェ',   emoji: '🍳', price: 75, kind: 'odd', exp: 33 },
  { id: 'food_kusayaonigiri',name: 'くさやのおにぎり',   emoji: '🍙', price: 80, kind: 'odd', exp: 36 },
  { id: 'food_aojirujelly',  name: 'あおじるゼリー',     emoji: '🥬', price: 50, kind: 'odd', exp: 27 },
  { id: 'food_ikasumipan',   name: 'いかすみパン',       emoji: '🥖', price: 85, kind: 'odd', exp: 25 },
  { id: 'food_nukazukecake', name: 'ぬかづけケーキ',     emoji: '🍰', price: 90, kind: 'odd', exp: 32 },
  { id: 'food_curryice',     name: 'カレーアイス',       emoji: '🍨', price: 70, kind: 'odd', exp: 30 },
];

/* ============================================================
 * ふく（66 しゅるい）
 * style: 'casual'|'formal'|'cute'|'cool'|'costume'|'japanese'|'sports'
 * ============================================================ */
export const CLOTHES = [
  // カジュアル
  { id: 'cloth_tshirt_red',    name: '赤い Tシャツ',       emoji: '👕', price: 300,  color: '#e0574f', style: 'casual' },
  { id: 'cloth_tshirt_blue',   name: '青い Tシャツ',       emoji: '👕', price: 300,  color: '#4f7fe0', style: 'casual' },
  { id: 'cloth_tshirt_green',  name: 'みどりの Tシャツ',   emoji: '👕', price: 300,  color: '#5aa96a', style: 'casual' },
  { id: 'cloth_tshirt_yellow', name: 'きいろい Tシャツ',   emoji: '👕', price: 300,  color: '#e8c24a', style: 'casual' },
  { id: 'cloth_border',        name: 'ボーダーシャツ',     emoji: '👕', price: 420,  color: '#3d5a80', style: 'casual' },
  { id: 'cloth_denim',         name: 'デニムジャケット',   emoji: '🧥', price: 780,  color: '#41618c', style: 'casual' },
  { id: 'cloth_hoodie_gray',   name: 'グレーのパーカー',   emoji: '🧥', price: 640,  color: '#9aa0a6', style: 'casual' },
  { id: 'cloth_hoodie_pink',   name: 'ももいろパーカー',   emoji: '🧥', price: 660,  color: '#eb9ab4', style: 'casual' },
  { id: 'cloth_overall',       name: 'オーバーオール',     emoji: '👖', price: 720,  color: '#5c7da8', style: 'casual' },
  { id: 'cloth_check_shirt',   name: 'チェックのシャツ',   emoji: '👔', price: 520,  color: '#b5533c', style: 'casual' },
  { id: 'cloth_cardigan',      name: 'ベージュのカーデ',   emoji: '🧶', price: 580,  color: '#d9c3a0', style: 'casual' },
  { id: 'cloth_tanktop',       name: 'タンクトップ',       emoji: '🎽', price: 240,  color: '#f2f2f2', style: 'casual' },
  { id: 'cloth_poncho',        name: 'もこもこポンチョ',   emoji: '🧣', price: 690,  color: '#c9b19b', style: 'casual' },
  { id: 'cloth_sweater_navy',  name: 'こんいろセーター',   emoji: '🧶', price: 610,  color: '#2f3d63', style: 'casual' },

  // フォーマル
  { id: 'cloth_suit_black',    name: 'くろいスーツ',       emoji: '🤵', price: 1600, color: '#22242a', style: 'formal' },
  { id: 'cloth_suit_gray',     name: 'グレーのスーツ',     emoji: '🤵', price: 1500, color: '#79808c', style: 'formal' },
  { id: 'cloth_tuxedo',        name: 'タキシード',         emoji: '🤵', price: 2400, color: '#17181d', style: 'formal' },
  { id: 'cloth_dress_white',   name: 'しろいドレス',       emoji: '👰', price: 2600, color: '#f7f4ef', style: 'formal' },
  { id: 'cloth_dress_navy',    name: 'こんいろドレス',     emoji: '👗', price: 1400, color: '#28355c', style: 'formal' },
  { id: 'cloth_vest',          name: 'ベストとネクタイ',   emoji: '👔', price: 980,  color: '#6b4f3a', style: 'formal' },
  { id: 'cloth_trench',        name: 'トレンチコート',     emoji: '🧥', price: 1800, color: '#c2a476', style: 'formal' },
  { id: 'cloth_hakama_formal', name: 'もんつきはかま',     emoji: '🎎', price: 2200, color: '#1d1f26', style: 'formal' },
  { id: 'cloth_shirt_white',   name: 'しろいワイシャツ',   emoji: '👔', price: 700,  color: '#fbfbfb', style: 'formal' },

  // かわいい
  { id: 'cloth_frill_dress',   name: 'フリルのワンピ',     emoji: '👗', price: 1100, color: '#f4a7c3', style: 'cute' },
  { id: 'cloth_ribbon_top',    name: 'リボンのブラウス',   emoji: '🎀', price: 860,  color: '#fbe3ef', style: 'cute' },
  { id: 'cloth_lolita',        name: 'レースのドレス',     emoji: '👗', price: 1700, color: '#efd9f2', style: 'cute' },
  { id: 'cloth_bear_hoodie',   name: 'くまさんパーカー',   emoji: '🧸', price: 940,  color: '#c98d5c', style: 'cute' },
  { id: 'cloth_strawberry',    name: 'いちごワンピ',       emoji: '🍓', price: 1020, color: '#e8566f', style: 'cute' },
  { id: 'cloth_pastel_skirt',  name: 'パステルスカート',   emoji: '👗', price: 760,  color: '#bfe3f0', style: 'cute' },
  { id: 'cloth_cat_ears',      name: 'ねこみみフード',     emoji: '🐱', price: 880,  color: '#f0c9d8', style: 'cute' },
  { id: 'cloth_apron_cute',    name: 'ハートのエプロン',   emoji: '🧁', price: 640,  color: '#f6b7b7', style: 'cute' },
  { id: 'cloth_marine_cute',   name: 'セーラーふう',       emoji: '⚓', price: 980,  color: '#9fc7ea', style: 'cute' },

  // クール
  { id: 'cloth_leather',       name: 'レザージャケット',   emoji: '🧥', price: 1900, color: '#2b2622', style: 'cool' },
  { id: 'cloth_rider',         name: 'ライダースーツ',     emoji: '🏍️', price: 2100, color: '#3a3f4b', style: 'cool' },
  { id: 'cloth_black_coat',    name: 'ながいくろコート',   emoji: '🧥', price: 1750, color: '#1c1e22', style: 'cool' },
  { id: 'cloth_sunglass_set',  name: 'サングラスのふく',   emoji: '🕶️', price: 1250, color: '#4a4f57', style: 'cool' },
  { id: 'cloth_punk',          name: 'パンクなふく',       emoji: '🎸', price: 1380, color: '#6b2740', style: 'cool' },
  { id: 'cloth_bandana',       name: 'バンダナスタイル',   emoji: '🔥', price: 820,  color: '#8c3b2f', style: 'cool' },
  { id: 'cloth_mode_white',    name: 'モードなしろ',       emoji: '🤍', price: 1600, color: '#e9eaec', style: 'cool' },
  { id: 'cloth_camo',          name: 'めいさいがら',       emoji: '🪖', price: 1150, color: '#5c6b45', style: 'cool' },
  { id: 'cloth_gothic',        name: 'ゴシックなふく',     emoji: '🦇', price: 1820, color: '#3b2b4a', style: 'cool' },

  // コスチューム
  { id: 'cloth_hero',          name: 'ヒーロースーツ',     emoji: '🦸', price: 2600, color: '#d63b3b', style: 'costume' },
  { id: 'cloth_maousama',      name: 'まおうのマント',     emoji: '👑', price: 2900, color: '#4b1d5c', style: 'costume' },
  { id: 'cloth_wizard',        name: 'まほうつかいのローブ', emoji: '🧙', price: 2100, color: '#3d4a8c', style: 'costume' },
  { id: 'cloth_pirate',        name: 'かいぞくのふく',     emoji: '🏴‍☠️', price: 1700, color: '#7a4a2b', style: 'costume' },
  { id: 'cloth_animal_frog',   name: 'カエルのきぐるみ',   emoji: '🐸', price: 1500, color: '#5fa84f', style: 'costume' },
  { id: 'cloth_animal_panda',  name: 'パンダのきぐるみ',   emoji: '🐼', price: 1500, color: '#2b2b2b', style: 'costume' },
  { id: 'cloth_robot',         name: 'ロボットスーツ',     emoji: '🤖', price: 2300, color: '#8d99a6', style: 'costume' },
  { id: 'cloth_chef',          name: 'コックさん',         emoji: '👨‍🍳', price: 1200, color: '#fafafa', style: 'costume' },
  { id: 'cloth_doctor',        name: 'おいしゃさん',       emoji: '🥼', price: 1250, color: '#eef3f6', style: 'costume' },
  { id: 'cloth_astronaut',     name: 'うちゅうふく',       emoji: '👨‍🚀', price: 3000, color: '#dfe4ea', style: 'costume' },
  { id: 'cloth_ghost',         name: 'おばけのシーツ',     emoji: '👻', price: 900,  color: '#f3f3f7', style: 'costume' },
  { id: 'cloth_santa',         name: 'サンタのふく',       emoji: '🎅', price: 1400, color: '#c0392b', style: 'costume' },

  // わふう
  { id: 'cloth_kimono_pink',   name: 'さくらのきもの',     emoji: '👘', price: 1900, color: '#e6a0b4', style: 'japanese' },
  { id: 'cloth_kimono_blue',   name: 'あいいろのきもの',   emoji: '👘', price: 1900, color: '#2f4f7a', style: 'japanese' },
  { id: 'cloth_yukata',        name: 'ゆかた',             emoji: '🎐', price: 1200, color: '#7fa8c9', style: 'japanese' },
  { id: 'cloth_jinbei',        name: 'じんべい',           emoji: '🎋', price: 800,  color: '#6f8f7a', style: 'japanese' },
  { id: 'cloth_hanten',        name: 'はんてん',           emoji: '🍁', price: 950,  color: '#8b4a3b', style: 'japanese' },
  { id: 'cloth_miko',          name: 'みこさん',           emoji: '⛩️', price: 1600, color: '#d8494a', style: 'japanese' },
  { id: 'cloth_ninja',         name: 'にんじゃのふく',     emoji: '🥷', price: 1450, color: '#26303a', style: 'japanese' },
  { id: 'cloth_samurai',       name: 'さむらいのよろい',   emoji: '🗡️', price: 2700, color: '#4a3b2a', style: 'japanese' },

  // スポーツ
  { id: 'cloth_jersey_blue',   name: 'あおいジャージ',     emoji: '🎽', price: 560,  color: '#2f6fb5', style: 'sports' },
  { id: 'cloth_jersey_red',    name: 'あかいジャージ',     emoji: '🎽', price: 560,  color: '#c0392b', style: 'sports' },
  { id: 'cloth_soccer',        name: 'サッカーのユニフォーム', emoji: '⚽', price: 980, color: '#1f9d55', style: 'sports' },
  { id: 'cloth_baseball',      name: 'やきゅうのユニフォーム', emoji: '⚾', price: 980, color: '#dfe6ee', style: 'sports' },
  { id: 'cloth_swimsuit',      name: 'みずぎ',             emoji: '🏊', price: 620,  color: '#1f7a8c', style: 'sports' },
  { id: 'cloth_judogi',        name: 'じゅうどうぎ',       emoji: '🥋', price: 840,  color: '#f4f1ea', style: 'sports' },
  { id: 'cloth_marathon',      name: 'ランニングウェア',   emoji: '🏃', price: 520,  color: '#f07f2d', style: 'sports' },
  { id: 'cloth_tennis',        name: 'テニスウェア',       emoji: '🎾', price: 740,  color: '#d7e84a', style: 'sports' },
];

/* ============================================================
 * インテリア（32 しゅるい）
 * bg は CSS の background にそのまま入れられる文字列。かべとして見せる。
 * ============================================================ */
export const INTERIORS = [
  { id: 'room_plain',     name: 'まっしろな部屋',   emoji: '🧱', price: 0,
    bg: 'linear-gradient(180deg, #fbfbfb 0%, #eceff3 100%)', floor: '#c9a26b', accent: '#8899aa' },
  { id: 'room_wood',      name: 'ウッドの部屋',     emoji: '🪵', price: 600,
    bg: 'linear-gradient(180deg, #e7d3b3 0%, #cbb08a 100%)', floor: '#9c7a4e', accent: '#7a5a38' },
  { id: 'room_washitsu',  name: 'わしつ',           emoji: '🎎', price: 900,
    bg: 'linear-gradient(180deg, #efe6cf 0%, #ddd0b0 100%)', floor: '#b9c48a', accent: '#6b5a3c' },
  { id: 'room_island',    name: 'みなみのしま',     emoji: '🏝️', price: 1400,
    bg: 'linear-gradient(180deg, #7fd4f5 0%, #bfeaf7 55%, #f6e3b4 100%)', floor: '#e8d49a', accent: '#1f9bb5' },
  { id: 'room_space',     name: 'うちゅう',         emoji: '🚀', price: 2200,
    bg: 'radial-gradient(circle at 30% 25%, #4b3f86 0%, #1b1740 55%, #07061a 100%)', floor: '#2b2752', accent: '#9f8cf0' },
  { id: 'room_castle',    name: 'おしろ',           emoji: '🏰', price: 2600,
    bg: 'linear-gradient(180deg, #6b5f8a 0%, #4a4168 60%, #332c4b 100%)', floor: '#7b6b52', accent: '#e0c05a' },
  { id: 'room_theater',   name: 'げきじょう',       emoji: '🎭', price: 2000,
    bg: 'linear-gradient(180deg, #7c1c2c 0%, #4d0f1c 70%, #2a070f 100%)', floor: '#3a2129', accent: '#e8c15a' },
  { id: 'room_forest',    name: 'もりのなか',       emoji: '🌳', price: 1300,
    bg: 'linear-gradient(180deg, #a9dd94 0%, #5fa85c 55%, #2f6b3c 100%)', floor: '#6b5236', accent: '#2f6b3c' },
  { id: 'room_sea',       name: 'うみのそこ',       emoji: '🐠', price: 1800,
    bg: 'linear-gradient(180deg, #4fc3e8 0%, #1f7fb5 55%, #0b3f66 100%)', floor: '#cfd9a8', accent: '#8ee3f5' },
  { id: 'room_sakura',    name: 'さくらのへや',     emoji: '🌸', price: 1500,
    bg: 'linear-gradient(180deg, #ffdfe9 0%, #f7bfd2 60%, #e79cb6 100%)', floor: '#d6b08c', accent: '#d4638a' },
  { id: 'room_night',     name: 'よるのまち',       emoji: '🌃', price: 1700,
    bg: 'linear-gradient(180deg, #16203c 0%, #27345c 50%, #3d4a78 100%)', floor: '#2a2f45', accent: '#f2c65c' },
  { id: 'room_kitchen',   name: 'キッチン',         emoji: '🍳', price: 1000,
    bg: 'linear-gradient(180deg, #fff6e0 0%, #f3e0bd 100%)', floor: '#b8b0a4', accent: '#d9663c' },
  { id: 'room_library',   name: 'としょしつ',       emoji: '📚', price: 1600,
    bg: 'linear-gradient(180deg, #7a5a3c 0%, #5b402a 60%, #3d2a1b 100%)', floor: '#6b4a2e', accent: '#d9b25a' },
  { id: 'room_lab',       name: 'けんきゅうしつ',   emoji: '🧪', price: 1900,
    bg: 'linear-gradient(180deg, #dff2f6 0%, #b6d9e3 60%, #8ab9c9 100%)', floor: '#9aa7ad', accent: '#3fa89b' },
  { id: 'room_snow',      name: 'ゆきぐに',         emoji: '❄️', price: 1500,
    bg: 'linear-gradient(180deg, #e7f4ff 0%, #c2ddf0 55%, #9dc3e0 100%)', floor: '#f2f7fb', accent: '#5b8fc7' },
  { id: 'room_desert',    name: 'さばく',           emoji: '🏜️', price: 1400,
    bg: 'linear-gradient(180deg, #ffd98a 0%, #f0b45f 55%, #d98f3f 100%)', floor: '#e8cd96', accent: '#a9612c' },
  { id: 'room_candy',     name: 'おかしのくに',     emoji: '🍭', price: 2100,
    bg: 'linear-gradient(180deg, #ffe6f3 0%, #ffc2dd 45%, #c9a2f0 100%)', floor: '#f6d7a8', accent: '#e05a9b' },
  { id: 'room_matsuri',   name: 'なつまつり',       emoji: '🏮', price: 1800,
    bg: 'linear-gradient(180deg, #2b1f3c 0%, #4a2340 55%, #7a3a3a 100%)', floor: '#5a4030', accent: '#f0603c' },
  { id: 'room_sunset',    name: 'ゆうやけ',         emoji: '🌇', price: 1300,
    bg: 'linear-gradient(180deg, #ffbe6b 0%, #f0766a 50%, #8a4a7a 100%)', floor: '#9c7a5e', accent: '#f2a03c' },
  { id: 'room_rainbow',   name: 'にじいろ',         emoji: '🌈', price: 2400,
    bg: 'linear-gradient(180deg, #ff9aa2 0%, #ffdaa0 25%, #b5ead7 55%, #a6c8f0 80%, #cbb0f0 100%)', floor: '#f4f1ea', accent: '#e05a9b' },
  { id: 'room_dungeon',   name: 'ちかダンジョン',   emoji: '🕯️', price: 2000,
    bg: 'linear-gradient(180deg, #3b3a38 0%, #2a2926 60%, #171614 100%)', floor: '#4a463f', accent: '#e8a23c' },
  { id: 'room_stadium',   name: 'スタジアム',       emoji: '🏟️', price: 1900,
    bg: 'linear-gradient(180deg, #9fd7f5 0%, #6fb8e0 45%, #4a9a4f 100%)', floor: '#5aa85c', accent: '#f2f2f2' },
  { id: 'room_studio',    name: 'ろくおんスタジオ', emoji: '🎙️', price: 2200,
    bg: 'linear-gradient(180deg, #3a3550 0%, #272338 60%, #17141f 100%)', floor: '#4a4358', accent: '#f05a8c' },
  { id: 'room_cafe',      name: 'カフェ',           emoji: '☕', price: 1600,
    bg: 'linear-gradient(180deg, #f0e0cb 0%, #d9bd99 55%, #b89a73 100%)', floor: '#7a5a3c', accent: '#6b4a2e' },
  { id: 'room_hotspring', name: 'おんせん',         emoji: '♨️', price: 1900,
    bg: 'linear-gradient(180deg, #d8ecea 0%, #9fcfc9 50%, #6aa8a5 100%)', floor: '#8c9aa0', accent: '#e07a4a' },
  { id: 'room_school',    name: 'きょうしつ',       emoji: '🏫', price: 1200,
    bg: 'linear-gradient(180deg, #f2efe2 0%, #ded8c2 60%, #c3bda6 100%)', floor: '#b08a5c', accent: '#3f6b3f' },
  { id: 'room_neon',      name: 'ネオンルーム',     emoji: '🪩', price: 2300,
    bg: 'linear-gradient(180deg, #1a0f2e 0%, #3b1b5c 50%, #0f2a4a 100%)', floor: '#241a3c', accent: '#3cf0d2' },
  { id: 'room_flower',    name: 'おはなばたけ',     emoji: '🌻', price: 1400,
    bg: 'linear-gradient(180deg, #bfe6f7 0%, #d9f0a8 55%, #a8d46a 100%)', floor: '#8cbf5a', accent: '#f2c03c' },
  { id: 'room_haunted',   name: 'おばけやしき',     emoji: '👻', price: 2100,
    bg: 'linear-gradient(180deg, #2a2a3c 0%, #3c2a4a 55%, #14121c 100%)', floor: '#3a3340', accent: '#8cf0a8' },
  { id: 'room_pixel',     name: 'ドットのせかい',   emoji: '🕹️', price: 2000,
    bg: 'linear-gradient(180deg, #2a3ca8 0%, #3c8cf0 55%, #8cd4f0 100%)', floor: '#f0d45a', accent: '#f05a5a' },
  { id: 'room_cloud',     name: 'くものうえ',       emoji: '☁️', price: 1700,
    bg: 'linear-gradient(180deg, #a8d8f7 0%, #d9eefc 55%, #ffffff 100%)', floor: '#eaf4fc', accent: '#7ab6e0' },
  { id: 'room_gold',      name: 'おうごんのま',     emoji: '🪙', price: 3200,
    bg: 'linear-gradient(180deg, #f7e08a 0%, #d9ac3c 55%, #8c6a1c 100%)', floor: '#c9a14a', accent: '#5c4410' },
];

/* ============================================================
 * どうぐ（16 しゅるい）
 * ============================================================ */
export const TOOLS = [
  { id: 'tool_camera',    name: 'カメラ',           emoji: '📷', desc: 'なかよしのしゅんかんを ぱしゃっと のこせる。',       price: 400 },
  { id: 'tool_umbrella',  name: 'かさ',             emoji: '☂️', desc: 'あめのひでも おでかけできるようになる。',           price: 220 },
  { id: 'tool_guitar',    name: 'ギター',           emoji: '🎸', desc: 'うたのれんしゅうが はかどる どうぐ。',              price: 900 },
  { id: 'tool_mic',       name: 'マイク',           emoji: '🎤', desc: 'こえが おおきくなって うたが とどきやすくなる。',    price: 650 },
  { id: 'tool_net',       name: 'むしとりあみ',     emoji: '🥅', desc: 'こうえんで むしを つかまえるのに 役に立つ。',        price: 300 },
  { id: 'tool_rod',       name: 'つりざお',         emoji: '🎣', desc: 'うみべで おさかなや おたからが つれる。',            price: 520 },
  { id: 'tool_shovel',    name: 'スコップ',         emoji: '🪣', desc: 'すなはまを ほると なにか でてくるかも。',            price: 280 },
  { id: 'tool_letter',    name: 'てがみセット',     emoji: '💌', desc: 'ともだちに きもちを つたえられる。',                price: 180 },
  { id: 'tool_present',   name: 'ラッピングセット', emoji: '🎁', desc: 'プレゼントが もっと よろこばれるようになる。',       price: 340 },
  { id: 'tool_medicine',  name: 'おくすり',         emoji: '💊', desc: 'ぐあいの わるいときに ききめがある。',              price: 260 },
  { id: 'tool_pillow',    name: 'ふわふわまくら',   emoji: '🛏️', desc: 'ぐっすり ねむれて げんきが もどる。',                price: 380 },
  { id: 'tool_telescope', name: 'ぼうえんきょう',   emoji: '🔭', desc: 'よぞらの ほしを ながめられる。',                    price: 1100 },
  { id: 'tool_notebook',  name: 'にっきちょう',     emoji: '📔', desc: 'そのひの できごとを かきとめておける。',            price: 200 },
  { id: 'tool_ball',      name: 'ボール',           emoji: '⚽', desc: 'みんなで あそぶと なかよしどが あがる。',            price: 240 },
  { id: 'tool_magicwand', name: 'ふしぎなステッキ', emoji: '🪄', desc: 'ときどき ふしぎなことが おきる ステッキ。',          price: 1800 },
  { id: 'tool_piggybank', name: 'ちょきんばこ',     emoji: '🐷', desc: 'おこづかいを すこしずつ ためておける。',            price: 320 },
];

/* ============================================================
 * おたから（40 しゅるい） rarity 1..5
 * ============================================================ */
export const TREASURES = [
  { id: 'tr_shell',       name: 'きれいな貝がら',     emoji: '🐚', value: 80,    rarity: 1 },
  { id: 'tr_pebble',      name: 'つるつるの小石',     emoji: '🪨', value: 40,    rarity: 1 },
  { id: 'tr_acorn',       name: 'どんぐり',           emoji: '🌰', value: 30,    rarity: 1 },
  { id: 'tr_feather',     name: 'とりのはね',         emoji: '🪶', value: 60,    rarity: 1 },
  { id: 'tr_leaf',        name: 'よつばのクローバー', emoji: '🍀', value: 120,   rarity: 1 },
  { id: 'tr_bottlecap',   name: 'びんのふた',         emoji: '🔘', value: 25,    rarity: 1 },
  { id: 'tr_marble',      name: 'ビーだま',           emoji: '🔵', value: 90,    rarity: 1 },
  { id: 'tr_oldcoin',     name: 'ふるいコイン',       emoji: '🪙', value: 150,   rarity: 2 },
  { id: 'tr_starsand',    name: 'ほしずな',           emoji: '✨', value: 200,   rarity: 2 },
  { id: 'tr_seaglass',    name: 'シーグラス',         emoji: '🟦', value: 180,   rarity: 2 },
  { id: 'tr_fossil',      name: 'ちいさな化石',       emoji: '🦴', value: 260,   rarity: 2 },
  { id: 'tr_music_box',   name: 'オルゴール',         emoji: '🎵', value: 320,   rarity: 2 },
  { id: 'tr_oldkey',      name: 'さびた かぎ',        emoji: '🗝️', value: 220,   rarity: 2 },
  { id: 'tr_stamp',       name: 'めずらしい切手',     emoji: '📮', value: 240,   rarity: 2 },
  { id: 'tr_compass',     name: 'ふるいコンパス',     emoji: '🧭', value: 300,   rarity: 2 },
  { id: 'tr_pearl',       name: 'しんじゅ',           emoji: '⚪', value: 520,   rarity: 3 },
  { id: 'tr_amber',       name: 'こはく',             emoji: '🟠', value: 480,   rarity: 3 },
  { id: 'tr_ammonite',    name: 'アンモナイト',       emoji: '🐚', value: 560,   rarity: 3 },
  { id: 'tr_goldfeather', name: 'きんいろのはね',     emoji: '🪶', value: 600,   rarity: 3 },
  { id: 'tr_oldmap',      name: 'ぼろぼろの地図',     emoji: '🗺️', value: 540,   rarity: 3 },
  { id: 'tr_silvercup',   name: 'ぎんのカップ',       emoji: '🏆', value: 640,   rarity: 3 },
  { id: 'tr_mask',        name: 'ふしぎなおめん',     emoji: '🎭', value: 580,   rarity: 3 },
  { id: 'tr_lamp',        name: 'ふるいランプ',       emoji: '🪔', value: 620,   rarity: 3 },
  { id: 'tr_dollhead',    name: 'にんぎょうのかけら', emoji: '🪆', value: 500,   rarity: 3 },
  { id: 'tr_meteor',      name: 'いんせきのかけら',   emoji: '☄️', value: 1200,  rarity: 4 },
  { id: 'tr_ruby',        name: 'ルビー',             emoji: '❤️', value: 1400,  rarity: 4 },
  { id: 'tr_sapphire',    name: 'サファイア',         emoji: '💙', value: 1400,  rarity: 4 },
  { id: 'tr_emerald',     name: 'エメラルド',         emoji: '💚', value: 1450,  rarity: 4 },
  { id: 'tr_goldbar',     name: 'きんのインゴット',   emoji: '🟨', value: 1800,  rarity: 4 },
  { id: 'tr_crown_small', name: 'ちいさな王かん',     emoji: '👑', value: 1600,  rarity: 4 },
  { id: 'tr_scroll',      name: 'まきもの',           emoji: '📜', value: 1100,  rarity: 4 },
  { id: 'tr_hourglass',   name: 'すなどけい',         emoji: '⏳', value: 1050,  rarity: 4 },
  { id: 'tr_bluerose',    name: 'あおいバラ',         emoji: '🌹', value: 1300,  rarity: 4 },
  { id: 'tr_dragonscale', name: 'りゅうのうろこ',     emoji: '🐉', value: 1700,  rarity: 4 },
  { id: 'tr_diamond',     name: 'ダイヤモンド',       emoji: '💎', value: 3200,  rarity: 5 },
  { id: 'tr_starpiece',   name: 'ほしのかけら',       emoji: '⭐', value: 3000,  rarity: 5 },
  { id: 'tr_moonstone',   name: 'つきのいし',         emoji: '🌙', value: 2800,  rarity: 5 },
  { id: 'tr_phoenix',     name: 'ふしちょうのはね',   emoji: '🔥', value: 3600,  rarity: 5 },
  { id: 'tr_heartcrystal',name: 'こころのクリスタル', emoji: '💖', value: 4000,  rarity: 5 },
  { id: 'tr_islandcrown', name: 'しまの王かん',       emoji: '👑', value: 5000,  rarity: 5 },
];

/* ============================================================
 * うた（12 きょく）
 * ============================================================ */
export const SONGS = [
  { id: 'song_island',   name: 'しまのあさ',         emoji: '🌅', lyricsHint: 'あさの ひかりと なみの おと' },
  { id: 'song_friends',  name: 'ともだちのうた',     emoji: '🤝', lyricsHint: 'きみと ぼくと みんなの こと' },
  { id: 'song_love',     name: 'すきのきもち',       emoji: '💗', lyricsHint: 'むねが どきどき するはなし' },
  { id: 'song_rock',     name: 'しまロック',         emoji: '🎸', lyricsHint: 'さけべ はしれ とびはねろ' },
  { id: 'song_enka',     name: 'なみだの みなと',    emoji: '🎏', lyricsHint: 'こころに しみる おとなの うた' },
  { id: 'song_lullaby',  name: 'おやすみのうた',     emoji: '🌙', lyricsHint: 'ゆっくり まぶたを とじる じかん' },
  { id: 'song_curry',    name: 'カレーのうた',       emoji: '🍛', lyricsHint: 'たべものが ひたすら たのしい' },
  { id: 'song_matsuri',  name: 'おまつりばやし',     emoji: '🏮', lyricsHint: 'たいこの おとで みんな おどる' },
  { id: 'song_rap',      name: 'しまラップ',         emoji: '🎤', lyricsHint: 'はやくちで ことばを ころがす' },
  { id: 'song_idol',     name: 'きらきらアイドル',   emoji: '🌟', lyricsHint: 'みんなに てを ふって きらり' },
  { id: 'song_travel',   name: 'たびのとちゅう',     emoji: '🧳', lyricsHint: 'まだ しらない まちへ むかう' },
  { id: 'song_thankyou', name: 'ありがとうのうた',   emoji: '🎁', lyricsHint: 'つたえそびれた きもちを うたに' },
];

/* ============================================================
 * くちぐせ（40 こ）
 * ============================================================ */
export const WORDS = [
  { id: 'word_dane',      text: 'だねー' },
  { id: 'word_nanoda',    text: 'なのだ' },
  { id: 'word_desuwa',    text: 'ですわ' },
  { id: 'word_ssu',       text: 'っす' },
  { id: 'word_yansu',     text: 'でやんす' },
  { id: 'word_nyan',      text: 'にゃん' },
  { id: 'word_wan',       text: 'わん' },
  { id: 'word_pyon',      text: 'ぴょん' },
  { id: 'word_zoyo',      text: 'ぞよ' },
  { id: 'word_gozaru',    text: 'でござる' },
  { id: 'word_nari',      text: 'なり' },
  { id: 'word_dawasa',    text: 'だわさ' },
  { id: 'word_kamo',      text: 'かもねー' },
  { id: 'word_yaro',      text: 'やろー' },
  { id: 'word_yanen',     text: 'やねん' },
  { id: 'word_bai',       text: 'ばい' },
  { id: 'word_zamasu',    text: 'ざます' },
  { id: 'word_dagya',     text: 'だぎゃ' },
  { id: 'word_besa',      text: 'べさ' },
  { id: 'word_dabe',      text: 'だべ' },
  { id: 'word_teyandei',  text: 'てやんでい' },
  { id: 'word_nnoda',     text: 'んーとね' },
  { id: 'word_hai',       text: 'はいっ' },
  { id: 'word_uiin',      text: 'ういーん' },
  { id: 'word_pika',      text: 'ぴかっ' },
  { id: 'word_mogu',      text: 'もぐもぐ' },
  { id: 'word_fuwa',      text: 'ふわー' },
  { id: 'word_gao',       text: 'がおー' },
  { id: 'word_teheh',     text: 'てへっ' },
  { id: 'word_muhi',      text: 'むひひ' },
  { id: 'word_yare',      text: 'やれやれ' },
  { id: 'word_maa',       text: 'まあね' },
  { id: 'word_honma',     text: 'ほんまに' },
  { id: 'word_sugoi',     text: 'すごーい' },
  { id: 'word_daijoubu',  text: 'だいじょうぶ' },
  { id: 'word_ganbaru',   text: 'がんばるぞ' },
  { id: 'word_nemui',     text: 'ねむい…' },
  { id: 'word_onaka',     text: 'おなかすいた' },
  { id: 'word_tanoshi',   text: 'たのしー' },
  { id: 'word_arigato',   text: 'ありがとねっ' },
];

/* ============================================================
 * まとめ
 * ============================================================ */
export const ALL = {
  food: FOODS,
  clothes: CLOTHES,
  interior: INTERIORS,
  tool: TOOLS,
  treasure: TREASURES,
  song: SONGS,
  word: WORDS,
};

// id -> {item, category} の索引をいちど作っておく。
const INDEX = new Map();
for (const [cat, arr] of Object.entries(ALL)) {
  for (const it of arr) {
    if (INDEX.has(it.id)) {
      // 開発中に気づけるように、コンソールへ知らせるだけにしておく。
      console.warn('[items] id がかぶっています:', it.id);
    }
    INDEX.set(it.id, { item: it, category: cat === 'clothes' ? 'clothes' : cat });
  }
}

/** どのカテゴリからでも id で引く。なければ null。 */
export function byId(id) {
  const e = INDEX.get(id);
  return e ? e.item : null;
}

/** たべものの id だけの配列。 */
export function foodIds() {
  return FOODS.map((f) => f.id);
}

/** その id が どのカテゴリか。なければ null。 */
export function categoryOf(id) {
  const e = INDEX.get(id);
  return e ? e.category : null;
}

/** ねだん。おたからは value を ねだんとしてあつかう。うた・くちぐせは 0。 */
export function priceOf(id) {
  const it = byId(id);
  if (!it) return 0;
  if (typeof it.price === 'number') return it.price;
  if (typeof it.value === 'number') return it.value;
  return 0;
}

/* ============================================================
 * このみ（taste）のけいさん
 * ============================================================ */

// せいかくの 4 つのものさしが、たべものの しゅるいの すききらいに どれくらい ひびくか。
// bright(あかるさ) / active(げんきさ) / speech(おしゃべり) / kind(やさしさ)  … それぞれ -100..100
const KIND_WEIGHTS = {
  meat:   { bright: 0.2,  active: 0.8,  speech: 0.1,  kind: -0.1 },
  fish:   { bright: -0.4, active: -0.1, speech: -0.2, kind: 0.3 },
  veg:    { bright: 0.0,  active: -0.3, speech: -0.1, kind: 0.6 },
  sweet:  { bright: 0.3,  active: -0.2, speech: 0.1,  kind: 0.7 },
  noodle: { bright: 0.1,  active: 0.5,  speech: 0.2,  kind: 0.0 },
  rice:   { bright: -0.2, active: 0.2,  speech: -0.1, kind: 0.2 },
  bread:  { bright: 0.5,  active: 0.1,  speech: 0.2,  kind: 0.1 },
  drink:  { bright: 0.2,  active: 0.0,  speech: 0.4,  kind: 0.0 },
  fruit:  { bright: 0.3,  active: 0.0,  speech: 0.0,  kind: 0.4 },
  odd:    { bright: 0.0,  active: 0.3,  speech: 0.5,  kind: -0.5 },
};

const MULT = { love: 3.0, like: 1.6, normal: 1.0, dislike: 0.4, hate: -0.6 };

/** せいかくと しゅるいから、すききらいの てんすうを だす（住人ごとにブレる）。 */
function kindScore(m, kind) {
  const w = KIND_WEIGHTS[kind] || KIND_WEIGHTS.rice;
  const p = (m && m.personality) || {};
  const val = (n) => (typeof n === 'number' ? n : 0);
  let s =
    (val(p.bright) * w.bright +
      val(p.active) * w.active +
      val(p.speech) * w.speech +
      val(p.kind) * w.kind) /
    100 * 30;
  // 住人ごとのブレ。おなじ住人・おなじしゅるいなら いつも おなじ。
  const r = seeded(String((m && m.id) || 'nobody') + ':taste:' + kind)();
  s += (r * 2 - 1) * 34;
  // ゲテモノは そもそも きらわれやすい。
  if (kind === 'odd') s -= 26;
  return s;
}

/** 'love' | 'like' | 'normal' | 'dislike' | 'hate' */
export function tasteOf(m, foodId) {
  const food = byId(foodId);
  if (!food || categoryOf(foodId) !== 'food') return 'normal';
  const likes = (m && m.likes) || [];
  const dislikes = (m && m.dislikes) || [];
  if (likes.indexOf(foodId) >= 0) return 'love';
  if (dislikes.indexOf(foodId) >= 0) return 'hate';
  const s = kindScore(m, food.kind);
  if (s >= 16) return 'like';
  if (s <= -16) return 'dislike';
  return 'normal';
}

/** その住人に その たべものを あげたときの まんぞくど（マイナスもある）。 */
export function foodExp(m, foodId) {
  const food = byId(foodId);
  if (!food || categoryOf(foodId) !== 'food') return 0;
  const t = tasteOf(m, foodId);
  return Math.round(food.exp * MULT[t]);
}

// はんのうの かお と セリフ。セリフは 6 こ いじょうから えらぶ。
const FACES = { love: '😍', like: '😋', normal: '🙂', dislike: '😖', hate: '🤮' };

const LINES = {
  love: [
    'うまーい！ だいすきー！',
    'こ、これは…！ さいこうだよっ',
    'んまっ！ ほっぺが おちちゃう！',
    'これが たべたかったんだ〜！',
    'しあわせ〜 もう いっこ ちょうだい',
    'きみ、わかってるねぇ！',
    'あまえん…じゃなくて、うますぎる！',
  ],
  like: [
    'おいしー！ ありがとっ',
    'うん、これ すきかも',
    'もぐもぐ… いいかんじ！',
    'ちょうど たべたかったんだ',
    'なかなか やるじゃんっ',
    'ほっとする あじだね〜',
  ],
  normal: [
    'ふつうに おいしいよ',
    'もぐもぐ… ごちそうさま',
    'おなかが すこし ふくれたよ',
    'まあまあ かな〜',
    'うん、わるくないね',
    'たべたよ〜 ありがとね',
  ],
  dislike: [
    'うーん… ちょっと にがてかも',
    'んー… のみこむのに じかん かかる',
    'たべたけど… つぎは べつのが いいな',
    'ごめん、あんまり すすまない…',
    'あじが ぼくには つよいなあ',
    'うぅ… がんばって たべたよ',
  ],
  hate: [
    'うええ… むりむりむり！',
    'これは たべられないよぉ',
    'ぺっ！ ごめん、むりだった…',
    'なんで これを…！？',
    'しばらく ごはん いらない…',
    'ひどいよ〜 なきそう',
  ],
};

/** はんのう ひとまとめ。{taste, exp, face, line} */
export function foodReaction(m, foodId) {
  const taste = tasteOf(m, foodId);
  const exp = foodExp(m, foodId);
  const lines = LINES[taste];
  const line = lines[Math.floor(Math.random() * lines.length)];
  return { taste, exp, face: FACES[taste], line };
}

/* ============================================================
 * おみせの しなぞろえ
 * ============================================================ */

/** kind:'food'|'clothes'|'interior' の しなぞろえを n けん えらぶ。rand はシード付き乱数でもよい。 */
export function randomStock(kind, n, rand) {
  const src = ALL[kind];
  if (!src) return [];
  const count = Math.max(0, Math.min(n | 0, src.length));
  const r = typeof rand === 'function' ? rand : Math.random;
  let pool = src;
  // 初期部屋（ねだん 0）は おみせに ならべない。
  if (kind === 'interior') pool = src.filter((it) => it.price > 0);
  return shuffle(pool, r).slice(0, count);
}

/** おまけ: ランダムに ひとつ えらぶ（デバッグや イベントよう）。 */
export function randomOne(kind, rand) {
  const src = ALL[kind];
  if (!src || !src.length) return null;
  return pick(src, typeof rand === 'function' ? rand : Math.random);
}
