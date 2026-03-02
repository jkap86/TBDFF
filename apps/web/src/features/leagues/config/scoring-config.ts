import type { League } from '@tbdff/shared';

export const SCORING_CATEGORIES: { title: string; fields: { key: string; label: string; defaultVal: number }[] }[] = [
  {
    title: 'Passing',
    fields: [
      { key: 'pass_td', label: 'Pass TD', defaultVal: 4 },
      { key: 'pass_yd', label: 'Pass Yard', defaultVal: 0.04 },
      { key: 'pass_int', label: 'Interception', defaultVal: -2 },
      { key: 'pass_2pt', label: 'Pass 2PT', defaultVal: 2 },
    ],
  },
  {
    title: 'Rushing',
    fields: [
      { key: 'rush_td', label: 'Rush TD', defaultVal: 6 },
      { key: 'rush_yd', label: 'Rush Yard', defaultVal: 0.1 },
      { key: 'rush_2pt', label: 'Rush 2PT', defaultVal: 2 },
    ],
  },
  {
    title: 'Receiving',
    fields: [
      { key: 'rec', label: 'Reception (PPR)', defaultVal: 1 },
      { key: 'rec_td', label: 'Rec TD', defaultVal: 6 },
      { key: 'rec_yd', label: 'Rec Yard', defaultVal: 0.1 },
      { key: 'rec_2pt', label: 'Rec 2PT', defaultVal: 2 },
    ],
  },
  {
    title: 'Misc Offense',
    fields: [
      { key: 'fum', label: 'Fumble', defaultVal: 0 },
      { key: 'fum_lost', label: 'Fumble Lost', defaultVal: -2 },
      { key: 'fum_rec_td', label: 'Fumble Rec TD', defaultVal: 6 },
    ],
  },
  {
    title: 'Kicking',
    fields: [
      { key: 'fgm_0_19', label: 'FG 0-19', defaultVal: 3 },
      { key: 'fgm_20_29', label: 'FG 20-29', defaultVal: 3 },
      { key: 'fgm_30_39', label: 'FG 30-39', defaultVal: 3 },
      { key: 'fgm_40_49', label: 'FG 40-49', defaultVal: 4 },
      { key: 'fgm_50p', label: 'FG 50+', defaultVal: 5 },
      { key: 'fgmiss', label: 'FG Miss', defaultVal: -1 },
      { key: 'xpm', label: 'XP Made', defaultVal: 1 },
      { key: 'xpmiss', label: 'XP Miss', defaultVal: -1 },
    ],
  },
  {
    title: 'Defense',
    fields: [
      { key: 'sack', label: 'Sack', defaultVal: 1 },
      { key: 'int', label: 'INT', defaultVal: 2 },
      { key: 'ff', label: 'Forced Fumble', defaultVal: 1 },
      { key: 'fum_rec', label: 'Fumble Rec', defaultVal: 1 },
      { key: 'def_td', label: 'Def TD', defaultVal: 6 },
      { key: 'safe', label: 'Safety', defaultVal: 2 },
      { key: 'blk_kick', label: 'Blocked Kick', defaultVal: 2 },
    ],
  },
  {
    title: 'Points Allowed',
    fields: [
      { key: 'pts_allow_0', label: '0 Pts Allowed', defaultVal: 10 },
      { key: 'pts_allow_1_6', label: '1-6 Pts', defaultVal: 7 },
      { key: 'pts_allow_7_13', label: '7-13 Pts', defaultVal: 4 },
      { key: 'pts_allow_14_20', label: '14-20 Pts', defaultVal: 1 },
      { key: 'pts_allow_21_27', label: '21-27 Pts', defaultVal: 0 },
      { key: 'pts_allow_28_34', label: '28-34 Pts', defaultVal: -1 },
      { key: 'pts_allow_35p', label: '35+ Pts', defaultVal: -4 },
    ],
  },
  {
    title: 'Special Teams',
    fields: [
      { key: 'st_td', label: 'ST TD', defaultVal: 6 },
      { key: 'st_ff', label: 'ST FF', defaultVal: 0 },
      { key: 'st_fum_rec', label: 'ST Fum Rec', defaultVal: 0 },
      { key: 'def_st_td', label: 'Def ST TD', defaultVal: 6 },
      { key: 'def_st_ff', label: 'Def ST FF', defaultVal: 0 },
      { key: 'def_st_fum_rec', label: 'Def ST Fum Rec', defaultVal: 0 },
    ],
  },
];

export const DEFAULT_SCORING: Record<string, number> = {};
for (const cat of SCORING_CATEGORIES) {
  for (const f of cat.fields) {
    DEFAULT_SCORING[f.key] = f.defaultVal;
  }
}

export function scoringFromLeague(league: League): Record<string, number> {
  const result: Record<string, number> = {};
  for (const cat of SCORING_CATEGORIES) {
    for (const f of cat.fields) {
      result[f.key] = league.scoring_settings?.[f.key] ?? f.defaultVal;
    }
  }
  return result;
}
