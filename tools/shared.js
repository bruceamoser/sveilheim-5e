#!/usr/bin/env node
/**
 * shared.js — Shared utilities for DS → 5e conversion scripts.
 */
const crypto = require('node:crypto');

// ── Deterministic ID helpers ───────────────────────────────────────────
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function base62FromBuffer(buf, length) {
  let n = BigInt('0x' + Buffer.from(buf).toString('hex'));
  const base = BigInt(B62.length);
  let out = '';
  while (n > 0n) {
    out = B62[Number(n % base)] + out;
    n /= base;
  }
  if (out.length < length) out = out.padStart(length, '0');
  if (out.length > length) out = out.slice(0, length);
  return out;
}

function foundryId(seed) {
  const digest = crypto.createHash('sha1').update(String(seed)).digest();
  return base62FromBuffer(digest.subarray(0, 12), 16);
}

function slugify(input) {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[ðÐ]/g, 'd')
    .replace(/[þÞ]/g, 'th')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ── DS → 5e Stat Conversion ──────────────────────────────────────────

/** Convert DS characteristic value (-3..+5) to a 5e ability score (1-30). */
function dsCharTo5eScore(dsValue) {
  return Math.max(1, Math.min(30, 10 + (dsValue * 2)));
}

/** Derive a 5e modifier from a 5e ability score. */
function abilityMod(score) {
  return Math.floor((score - 10) / 2);
}

// ── DS Damage Type → 5e Damage Type ──────────────────────────────────
const DAMAGE_TYPE_MAP = {
  acid: 'acid',
  cold: 'cold',
  corruption: 'necrotic',
  fire: 'fire',
  holy: 'radiant',
  lightning: 'lightning',
  poison: 'poison',
  psychic: 'psychic',
  sonic: 'thunder',
};

function mapDamageType(dsType) {
  return DAMAGE_TYPE_MAP[dsType] || dsType;
}

// ── DS Keywords → 5e Creature Type ──────────────────────────────────
const CREATURE_TYPE_MAP = {
  undead: 'undead',
  beast: 'beast',
  construct: 'construct',
  fey: 'fey',
  plant: 'plant',
  elemental: 'elemental',
  fiend: 'fiend',
  celestial: 'celestial',
  aberration: 'aberration',
  ooze: 'ooze',
  dragon: 'dragon',
  giant: 'giant',
  humanoid: 'humanoid',
  monstrosity: 'monstrosity',
};

function mapCreatureType(dsKeywords) {
  if (!dsKeywords || !dsKeywords.length) return 'monstrosity';
  for (const kw of dsKeywords) {
    const mapped = CREATURE_TYPE_MAP[kw.toLowerCase()];
    if (mapped) return mapped;
  }
  return 'monstrosity';
}

// ── DS Size → 5e Size ────────────────────────────────────────────────
function mapSize(dsSize) {
  if (!dsSize) return 'med';
  const val = dsSize.value || 1;
  const letter = (dsSize.letter || 'M').toUpperCase();
  if (letter === 'T') return 'tiny';
  if (letter === 'S') return 'sm';
  if (letter === 'M') return 'med';
  if (letter === 'L') return 'lg';
  if (letter === 'H') return 'huge';
  if (letter === 'G') return 'grg';
  // Fallback by value
  if (val <= 0.5) return 'tiny';
  if (val <= 1) return 'med';
  if (val <= 2) return 'lg';
  if (val <= 3) return 'huge';
  return 'grg';
}

// ── DS Level + Org → 5e CR ──────────────────────────────────────────

/**
 * Level mapping: DS 1-7 → 5e tiers.
 * CR is derived from DS level × multiplier based on organization.
 */
const LEVEL_TO_5E_BASE = {
  1: 2,
  2: 4,
  3: 6,
  4: 9,
  5: 11,
  6: 13,
  7: 15,
};

const ORG_CR_TABLE = {
  minion:  (lvl) => Math.max(0.125, Math.floor(LEVEL_TO_5E_BASE[lvl] * 0.25 * 4) / 4),
  horde:   (lvl) => Math.max(0.25, Math.floor(LEVEL_TO_5E_BASE[lvl] * 0.5 * 4) / 4),
  platoon: (lvl) => LEVEL_TO_5E_BASE[lvl] || lvl * 2,
  elite:   (lvl) => (LEVEL_TO_5E_BASE[lvl] || lvl * 2) + 2,
  leader:  (lvl) => (LEVEL_TO_5E_BASE[lvl] || lvl * 2) + 4,
  solo:    (lvl) => (LEVEL_TO_5E_BASE[lvl] || lvl * 2) + 5,
};

function calcCR(dsLevel, dsOrg) {
  const fn = ORG_CR_TABLE[dsOrg] || ORG_CR_TABLE.platoon;
  return fn(dsLevel);
}

/** Standard CR → proficiency bonus */
function profBonusForCR(cr) {
  if (cr < 5) return 2;
  if (cr < 9) return 3;
  if (cr < 13) return 4;
  if (cr < 17) return 5;
  if (cr < 21) return 6;
  if (cr < 25) return 7;
  if (cr < 29) return 8;
  return 9;
}

// ── DS Movement → 5e Movement (squares × 5 feet) ──────────────────
function convertMovement(dsMovement) {
  const result = {};
  const baseSpeed = (dsMovement?.value || 5) * 5;
  result.walk = baseSpeed;
  if (dsMovement?.types) {
    for (const t of dsMovement.types) {
      if (t === 'fly') result.fly = baseSpeed;
      if (t === 'swim') result.swim = baseSpeed;
      if (t === 'burrow') result.burrow = baseSpeed;
      if (t === 'climb') result.climb = baseSpeed;
    }
  }
  if (dsMovement?.hover) result.hover = true;
  return result;
}

// ── DS Stamina → 5e HP ─────────────────────────────────────────────

/** Hit die size by 5e size category. */
const HD_BY_SIZE = {
  tiny: 4, sm: 6, med: 8, lg: 10, huge: 12, grg: 20,
};

/**
 * Convert DS stamina to 5e HP with a hit dice formula.
 * We target the DS stamina as the average HP and derive dice count.
 */
function convertHP(dsStamina, size5e, conMod) {
  const hp = dsStamina || 10;
  const hd = HD_BY_SIZE[size5e] || 8;
  const avgPerDie = (hd / 2) + 0.5 + conMod;
  let numDice = Math.max(1, Math.round(hp / Math.max(1, avgPerDie)));
  const formula = `${numDice}d${hd}${conMod >= 0 ? ' + ' : ' - '}${Math.abs(numDice * conMod)}`;
  const avg = Math.floor(numDice * ((hd / 2) + 0.5) + (numDice * conMod));
  return { value: avg, max: avg, formula };
}

// ── DS Characteristic → 5e Skill ────────────────────────────────────
const DS_CHAR_TO_5E_SKILLS = {
  might:     ['ath'],         // Athletics
  agility:   ['acr', 'ste'],  // Acrobatics, Stealth
  reason:    ['arc', 'inv'],  // Arcana, Investigation
  intuition: ['prc', 'sur', 'ins'], // Perception, Survival, Insight
  presence:  ['per', 'itm', 'dec'], // Persuasion, Intimidation, Deception
};

// ── DS Montage Difficulty → 5e DC ──────────────────────────────────
const DIFFICULTY_DC = {
  easy: 10,
  moderate: 13,
  hard: 15,
  extreme: 18,
};

// ── Term replacement map for journal text ──────────────────────────
const TERM_REPLACEMENTS = [
  [/\bStamina\b/g, 'Hit Points'],
  [/\bstamina\b/g, 'hit points'],
  [/\bEdge\b(?! of)/g, 'Advantage'],
  [/\bedge\b(?! of)/g, 'advantage'],
  [/\bBane\b/g, 'Disadvantage'],
  [/\bbane\b/g, 'disadvantage'],
  [/\bFree Strike\b/gi, 'Opportunity Attack'],
  [/\bfree strike\b/g, 'opportunity attack'],
  [/\bManeuver\b/g, 'Bonus Action'],
  [/\bmaneuver\b/g, 'bonus action'],
  [/\bRecovery\b(?! value)/g, 'Hit Die'],
  [/\brecovery\b(?! value)/g, 'hit die'],
  [/\bRecoveries\b/g, 'Hit Dice'],
  [/\brecoveries\b/g, 'hit dice'],
  [/\bRespite\b/g, 'Long Rest'],
  [/\brespite\b/g, 'long rest'],
  [/\bHero Token\b/gi, 'Inspiration'],
  [/\bhero token\b/g, 'inspiration'],
  [/\bVictory Point\b/gi, 'Milestone XP'],
  [/\bvictory point\b/g, 'milestone XP'],
  [/\bVictories\b/g, 'Milestones'],
  [/\bvictories\b/g, 'milestones'],
  [/\bpower roll\b/gi, 'ability check'],
  [/\bTier 1\b/g, 'low roll'],
  [/\bTier 2\b/g, 'moderate roll'],
  [/\bTier 3\b/g, 'high roll'],
  [/\bStability\b/g, 'Saving Throws'],
  [/\bstability\b/g, 'saving throws'],
  [/\bsquares?\b/g, (m) => m === 'square' ? 'feet (5 ft.)' : 'feet'],
];

/**
 * Fix UTF-8 double-encoding (mojibake) generically.
 * When UTF-8 bytes are misread as Latin-1 and re-encoded to UTF-8:
 *   U+00C0–U+00FF → 0xC3 + second byte → displayed as \u00C3 + \u0080–\u00BF
 *   U+0080–U+00BF → 0xC2 + byte → displayed as \u00C2 + \u0080–\u00BF
 *   Multi-byte (dashes, quotes) → \u00E2\u0080\u00XX sequences
 */
function fixMojibake(text) {
  if (!text) return text;
  // 3-byte sequences first: em-dash, en-dash, smart quotes
  text = text.replace(/\u00e2\u0080\u0093/g, '\u2013');
  text = text.replace(/\u00e2\u0080\u0094/g, '\u2014');
  text = text.replace(/\u00e2\u0080\u0098/g, '\u2018');
  text = text.replace(/\u00e2\u0080\u0099/g, '\u2019');
  text = text.replace(/\u00e2\u0080\u009c/g, '\u201c');
  text = text.replace(/\u00e2\u0080\u009d/g, '\u201d');
  // \u00C5\u0093 → \u0153 (\u0153)
  text = text.replace(/\u00c5\u0093/g, '\u0153');
  // Generic U+00C0–U+00FF range: \u00C3 + [\u0080-\u00BF] → original char
  text = text.replace(/\u00c3([\u0080-\u00bf])/g, (_, c) =>
    String.fromCharCode(0xc0 + (c.charCodeAt(0) - 0x80))
  );
  // Generic U+0080–U+00BF range: \u00C2 + [\u0080-\u00BF] → original char
  text = text.replace(/\u00c2([\u0080-\u00bf])/g, (_, c) =>
    String.fromCharCode(c.charCodeAt(0))
  );
  return text;
}

function replaceTerms(text) {
  if (!text) return text;
  text = fixMojibake(text);
  for (const [pat, rep] of TERM_REPLACEMENTS) {
    text = text.replace(pat, rep);
  }
  // Strip Draw Steel compendium links
  text = text.replace(/\[\[\/[^\]]*\]\]/g, '');
  text = text.replace(/@Embed\[[^\]]*\]/g, '');
  return text;
}

// ── 5e Foundry stat block helpers ──────────────────────────────────

function mk5eStats() {
  return {
    compendiumSource: null, duplicateSource: null, exportSource: null,
    coreVersion: '13', systemId: 'dnd5e', systemVersion: null,
    createdTime: Date.now(), modifiedTime: null, lastModifiedBy: null,
  };
}

module.exports = {
  foundryId, slugify, base62FromBuffer,
  dsCharTo5eScore, abilityMod,
  mapDamageType, mapCreatureType, mapSize,
  calcCR, profBonusForCR,
  convertMovement, convertHP,
  DS_CHAR_TO_5E_SKILLS, DIFFICULTY_DC, DAMAGE_TYPE_MAP, CREATURE_TYPE_MAP,
  HD_BY_SIZE, LEVEL_TO_5E_BASE, ORG_CR_TABLE,
  replaceTerms, fixMojibake,
  mk5eStats,
};
