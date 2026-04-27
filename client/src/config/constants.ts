/* All game math constants — mirrors config.js + backend/src/config/game.ts */

export interface BetLevel {
  lvl: number;
  base: number;
  total: number;
}

export const BET_LEVELS: BetLevel[] = [
  { lvl: 1, base: 1,   total: 10   },
  { lvl: 2, base: 2,   total: 20   },
  { lvl: 3, base: 5,   total: 50   },
  { lvl: 4, base: 10,  total: 100  },
  { lvl: 5, base: 20,  total: 200  },
  { lvl: 6, base: 25,  total: 250  },
  { lvl: 7, base: 50,  total: 500  },
  { lvl: 8, base: 75,  total: 750  },
  { lvl: 9, base: 100, total: 1000 },
];

export const STARTING_BALANCE = 50_000;
export const MIN_PLAYABLE_BALANCE = 10;  // GDD §14.2: below this: disable spin, prompt restart
export const DEFAULT_BET_IDX  = 3;
export const BUY_FS_MULT    = 75;
export const BUY_WHEEL_MULT = 50;
export const SCATTER_FS_AWARD = 10;
export const FS_RETRIGGER_AWARD: Record<number, number> = { 3: 5, 4: 8, 5: 10 };

export type SymCat = 'basic' | 'character' | 'wild' | 'scatter' | 'modifier';

export interface SymInfo {
  id:    string;
  name:  string;
  cat:   SymCat;
  glyph: string;
  color: string;   // CSS color string
}

export const SYMBOLS: Record<string, SymInfo> = {
  S01:  { id:'S01',  name:'10',           cat:'basic',    glyph:'10', color:'#4f8fc2' },
  S02:  { id:'S02',  name:'J',            cat:'basic',    glyph:'J',  color:'#4f8fc2' },
  S03:  { id:'S03',  name:'Q',            cat:'basic',    glyph:'Q',  color:'#c24f89' },
  S04:  { id:'S04',  name:'K',            cat:'basic',    glyph:'K',  color:'#c2874f' },
  S05:  { id:'S05',  name:'A',            cat:'basic',    glyph:'A',  color:'#c24f4f' },
  S06:  { id:'S06',  name:'Gem Blue',     cat:'basic',    glyph:'◆',  color:'#4ab0ea' },
  S07:  { id:'S07',  name:'Gem Green',    cat:'basic',    glyph:'◆',  color:'#4ed67c' },
  S08:  { id:'S08',  name:'Gem Red',      cat:'basic',    glyph:'◆',  color:'#e64747' },
  C01:  { id:'C01',  name:'Pig (Straw)',  cat:'character',glyph:'🐖', color:'#f8c89c' },
  C02:  { id:'C02',  name:'Pig (Sticks)', cat:'character',glyph:'🐷', color:'#f8c89c' },
  C03:  { id:'C03',  name:'Pig (Bricks)',cat:'character', glyph:'🐽', color:'#f8c89c' },
  C04:  { id:'C04',  name:'Wolf',         cat:'character',glyph:'🐺', color:'#3b3030' },
  W01:  { id:'W01',  name:'Wild',         cat:'wild',     glyph:'W',  color:'#E3A02C' },
  W02:  { id:'W02',  name:'Golden Wild',  cat:'wild',     glyph:'W',  color:'#ffd265' },
  SC01: { id:'SC01', name:'Scatter',      cat:'scatter',  glyph:'★',  color:'#ff7b3a' },
  G01:  { id:'G01',  name:'Golden Mod',   cat:'modifier', glyph:'◎',  color:'#ffd265' },
};

export const PAY_ORDER = ['C04','C03','C02','C01','S08','S07','S06','S05','S04','S03','S02','S01'];

export const SPIN_POOL = [
  'S01','S02','S03','S04','S05','S06','S07','S08',
  'C01','C02','C03','C04','W01','SC01',
];

export interface WinTier {
  id: string;
  min: number;
  max: number;
  label: string;
  dur: number;
  color: string;
}

export const WIN_TIERS: WinTier[] = [
  { id:'standard', min:0,   max:4.99,  label:'WIN',      dur:500,  color:'#F4EADE' },
  { id:'nice',     min:5,   max:14.99, label:'NICE WIN', dur:1500, color:'#5BB86E' },
  { id:'big',      min:15,  max:29.99, label:'BIG WIN',  dur:3000, color:'#E3A02C' },  // OVL-BIGWIN ≥15×  (DS §15.5)
  { id:'mega',     min:30,  max:49.99, label:'MEGA WIN', dur:4500, color:'#FF7B3A' },  // OVL-MEGAWIN ≥30× (DS §15.5)
  { id:'super',    min:50,  max:1e9,   label:'SUPER WIN', dur:5000, color:'#FFC24A' }, // OVL-SUPERWIN ≥50× (DS §15.5)
];

/** OVL-MAXWIN cap — wins at or above this multiple show the locked max-win modal. */
export const MAX_WIN_MULT = 10000;

export const PAYLINES: number[][] = [
  [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],
  [0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],
  [2,2,1,0,0],[1,0,0,0,1],[1,2,2,2,1],[0,1,0,1,0],
];

export const WHEEL_SEGMENTS = [
  'WH_JP','WH_MN','WH_BZ','WH_MH',
  'WH_JP','WH_MN','WH_BZ','WH_JP',
  'WH_MH','WH_JP','WH_MN','WH_BZ',
];
export const WHEEL_BONUS_NAMES: Record<string, string> = {
  WH_JP:'Jackpot', WH_MN:'Mansion Bonus', WH_BZ:'Buzzsaw Bonus', WH_MH:'Mega Hat Bonus',
};
export const WHEEL_BONUS_COLORS: Record<string, string> = {
  WH_JP:'#E3A02C', WH_MN:'#5BB86E', WH_BZ:'#C85538', WH_MH:'#8855C8',
};

export const BUZZSAW_ORDER = ['none','straw','wood','brick','mansion'];
export const BUZZSAW_BORDERS: Record<string, number> = {
  none:0, straw:1, wood:3, brick:8, mansion:25,
};

export interface Timing {
  reelSpinDur:     number;
  reelStagger:     number;
  morphStepDur:    number;
  winHighlightDur: number;
  wheelSpinDur:    number;
}

export function getTiming(quick: boolean): Timing {
  return quick
    ? { reelSpinDur:500,  reelStagger:30, morphStepDur:300, winHighlightDur:180, wheelSpinDur:2500 }
    : { reelSpinDur:1750, reelStagger:50, morphStepDur:1000, winHighlightDur:380, wheelSpinDur:4000 };
}

export function getWinTier(multOfBet: number): WinTier {
  for (const t of WIN_TIERS) if (multOfBet >= t.min && multOfBet <= t.max) return t;
  return WIN_TIERS[0];
}

export function fmt(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}



export const MANSION_PAYOUT: Record<number, number> = {
  1:1, 2:2, 3:3, 4:5, 5:7, 6:10, 7:15, 8:22, 9:35,
  10:50, 11:80, 12:140, 13:220, 14:350, 15:500,
};

export const JACKPOT_TIERS = [
  { id:'Grand', base:500, weight:0.05 },
  { id:'Major', base:100, weight:0.15 },
  { id:'Minor', base:25,  weight:0.30 },
  { id:'Mini',  base:10,  weight:0.50 },
];

/* Paytable: multipliers of total bet for 3/4/5 matching symbols (GDD §4 / Symbols & Paytable sheet) */
export const PAYTABLE: Record<string, [number, number, number]> = {
  C04: [2,    5,    25  ],   // Wolf — top premium
  C03: [1.5,  3,    15  ],   // Pig Bricks
  C02: [1,    2.5,  10  ],   // Pig Sticks
  C01: [0.8,  2,    7.5 ],   // Pig Straw
  S08: [0.5,  1.5,  5   ],   // Gem Red
  S07: [0.4,  1.2,  4   ],   // Gem Green
  S06: [0.3,  1,    3   ],   // Gem Blue
  S05: [0.2,  0.8,  2.5 ],   // A
  S04: [0.2,  0.7,  2   ],   // K
  S03: [0.15, 0.5,  1.5 ],   // Q
  S02: [0.15, 0.5,  1.5 ],   // J
  S01: [0.1,  0.4,  1   ],   // 10
};

/* Scatter pays (× total bet) — GDD §11 */
export const SCATTER_PAY: Record<number, number> = { 3: 2, 4: 10, 5: 50 };

export const PAY_ORDER_DISPLAY = ['C04','C03','C02','C01','S08','S07','S06','S05','S04','S03','S02','S01'];
