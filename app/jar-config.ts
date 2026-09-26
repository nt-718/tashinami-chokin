// 瓶に入れる物の形。品目ごとに選び、我慢した 1 本・1 箱がそのまま 1 個として瓶に入る
export type ItemShape = 'can' | 'pack' | 'coin';

// 寸法は瓶（高さ約 3.1）に対する基準サイズ。実際には itemScale() で拡大縮小する
export const ITEM_SHAPES: Record<ItemShape, { label: string; unit: string; volume: number }> = {
  can: { label: '缶', unit: '本', volume: Math.PI * 0.11 ** 2 * 0.45 },
  pack: { label: '箱', unit: '箱', volume: 0.25 * 0.4 * 0.1 },
  coin: { label: 'コイン', unit: 'つ', volume: Math.PI * 0.2 ** 2 * 0.055 },
};
export const CAN_SIZE = { radius: 0.11, height: 0.45 };
// 箱は実物の比率より少し大きめにして、缶の山に埋もれないようにする
export const PACK_SIZE = { width: 0.25, height: 0.4, depth: 0.1 };
export const COIN_SIZE = { radius: 0.2, height: 0.055 };

// 描画と物理演算が重くなりすぎないための上限
export const MAX_ITEMS = 220;
// 目標を達成したとき、瓶に入っている物の体積の合計（隙間込みで瓶の 8 割ほどが埋まる）
const JAR_CAPACITY = 3.4;

// 目標達成時にちょうど瓶が埋まるよう、品目の数と形から物の大きさを決める
export const itemScale = (goalVolume: number) =>
  goalVolume > 0 ? Math.min(1.8, Math.max(0.55, Math.cbrt(JAR_CAPACITY / goalVolume))) : 1;

export const guessShape = (name: string): ItemShape => {
  if (/タバコ|たばこ|煙草|煙|シガ/.test(name)) return 'pack';
  if (/缶|ビール|酒|ハイ|サワー|ジュース|コーラ|エナジー/.test(name)) return 'can';
  if (/お菓子|菓子|スイーツ|チョコ/.test(name)) return 'pack';
  return 'coin';
};

// 品目ごとの色。アイコン・瓶の中の物・カレンダーで同じ色を使う（ink はアイコン上の文字色）
export const TONES = [
  { hex: '#ff8a65', ink: '#ffffff' },
  { hex: '#ffd166', ink: '#1f2328' },
  { hex: '#5aa9f0', ink: '#ffffff' },
  { hex: '#b49ae6', ink: '#ffffff' },
  { hex: '#6fcf97', ink: '#1f2328' },
];
