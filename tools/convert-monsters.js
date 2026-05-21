#!/usr/bin/env node
/**
 * convert-monsters.js
 *
 * Reads Draw Steel monster/NPC actor JSONs from Svellheim-Entities
 * and outputs dnd5e-compatible actor JSONs for the sveilheim-5e module.
 *
 * Usage: node tools/convert-monsters.js
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  foundryId, slugify,
  dsCharTo5eScore, abilityMod,
  mapDamageType, mapCreatureType, mapSize,
  calcCR, profBonusForCR,
  convertMovement, convertHP,
  replaceTerms, mk5eStats,
} = require('./shared');

// ── Paths ──────────────────────────────────────────────────────────────
const REPO_ROOT = path.resolve(__dirname, '..');
const ENTITIES_ROOT = path.resolve(REPO_ROOT, '..', 'Svellheim-Entities');
const MONSTER_SRC = path.join(ENTITIES_ROOT, 'data', 'monsters');
const NPC_SRC = path.join(ENTITIES_ROOT, 'data', 'npcs');
const MONSTER_OUT = path.join(REPO_ROOT, 'data', 'monsters');
const NPC_OUT = path.join(REPO_ROOT, 'data', 'npcs');
const MODULE_ID = 'sveilheim-5e';

// ── DS Ability → 5e Action Conversion ──────────────────────────────

function convertDSAbilityToAction(dsItem, parentStats) {
  const sys = dsItem.system || {};
  const name = dsItem.name || 'Unknown';
  const type = sys.type || 'main'; // main, triggered, villain, none
  const category = sys.category || '';
  const keywords = sys.keywords || [];
  const distance = sys.distance || {};
  const target = sys.target || {};
  const power = sys.power || {};

  // Determine if this is melee or ranged
  const isMelee = keywords.includes('melee') || distance.type === 'melee';
  const isRanged = keywords.includes('ranged') || distance.type === 'ranged';
  const isStrike = keywords.includes('strike') || keywords.includes('weapon');
  const isArea = keywords.includes('area') || distance.type === 'aura' || distance.type === 'burst' || distance.type === 'line' || distance.type === 'cube';
  const isMagic = keywords.includes('magic') || keywords.includes('psionic');

  // Extract damage values from the DS power roll effects
  let avgDamage = 0;
  const effects = power?.roll?.effects || {};
  for (const eff of Object.values(effects)) {
    if (eff.type === 'damage' && eff.damage) {
      // Use tier2 (average roll) as baseline
      const tier2Val = parseInt(eff.damage?.tier2?.value || '0', 10);
      avgDamage = Math.max(avgDamage, tier2Val);
    }
  }

  // Derive reach/range
  const reach = (distance.primary || 1) * 5;

  // Build description text
  let descParts = [];

  if (isStrike && isMelee) {
    const toHit = (parentStats?.profBonus || 2) + (parentStats?.strMod || 0);
    const dmgDice = damageToDice(avgDamage, parentStats?.strMod || 0);
    descParts.push(`<p><em>Melee Weapon Attack:</em> +${toHit} to hit, reach ${reach} ft., ${targetToText(target)}.</p>`);
    descParts.push(`<p><em>Hit:</em> ${avgDamage} (${dmgDice}) ${extractDamageTypes(effects)} damage.</p>`);
  } else if (isStrike && isRanged) {
    const toHit = (parentStats?.profBonus || 2) + (parentStats?.dexMod || 0);
    const range = reach;
    const dmgDice = damageToDice(avgDamage, parentStats?.dexMod || 0);
    descParts.push(`<p><em>Ranged Weapon Attack:</em> +${toHit} to hit, range ${range}/${range * 2} ft., ${targetToText(target)}.</p>`);
    descParts.push(`<p><em>Hit:</em> ${avgDamage} (${dmgDice}) ${extractDamageTypes(effects)} damage.</p>`);
  } else if (isArea) {
    const dc = 8 + (parentStats?.profBonus || 2) + Math.max(parentStats?.strMod || 0, parentStats?.conMod || 0);
    const areaSize = (distance.primary || 3) * 5;
    descParts.push(`<p>Each creature in a ${areaSize}-foot ${distance.type || 'area'} must make a DC ${dc} ${isStrike ? 'Dexterity' : 'Constitution'} saving throw.</p>`);
    if (avgDamage > 0) {
      const dmgDice = damageToDice(avgDamage, 0);
      descParts.push(`<p>On a failure, a creature takes ${avgDamage} (${dmgDice}) ${extractDamageTypes(effects)} damage, or half on a success.</p>`);
    }
  } else {
    // Feature / non-strike ability — keep as descriptive text
    const rawDesc = sys.description?.value || dsItem.system?.description?.value || '';
    descParts.push(replaceTerms(rawDesc));
  }

  // Add any extra effect text
  if (sys.effect?.before) descParts.unshift(`<p>${replaceTerms(sys.effect.before)}</p>`);
  if (sys.effect?.after) descParts.push(`<p>${replaceTerms(sys.effect.after)}</p>`);

  // Determine action type for 5e
  let actionType = 'action';
  if (type === 'triggered') actionType = 'reaction';
  else if (type === 'villain') actionType = 'legendary';

  return {
    name,
    type: isStrike ? 'weapon' : 'feat',
    img: dsItem.img || 'icons/svg/sword.svg',
    system: buildActionSystem(name, descParts.join(''), actionType, {
      isMelee, isRanged, reach, avgDamage, parentStats, effects, isArea,
    }),
    effects: [],
    flags: {},
    sort: dsItem.sort || 0,
    ownership: { default: 0 },
    _stats: mk5eStats(),
  };
}

function buildActionSystem(name, desc, actionType, opts) {
  const base = {
    description: { value: desc, chat: '' },
    source: { custom: 'Era of Embers Campaign' },
  };

  if (opts.isMelee || opts.isRanged) {
    // Weapon-type item
    return {
      ...base,
      type: { value: opts.isMelee ? 'natural' : 'natural' },
      ability: opts.isMelee ? 'str' : 'dex',
      actionType: opts.isMelee ? 'mwak' : 'rwak',
      attackBonus: '',
      damage: {
        parts: [[damageToDice(opts.avgDamage, 0), extractDamageTypes(opts.effects || {})]],
        versatile: '',
      },
      range: {
        value: opts.isMelee ? null : opts.reach,
        long: opts.isMelee ? null : opts.reach * 2,
        units: 'ft',
      },
      reach: { value: opts.isMelee ? opts.reach : null, units: 'ft' },
      activation: { type: actionType, cost: 1 },
    };
  }

  // Feature/feat type
  return {
    ...base,
    activation: { type: actionType, cost: actionType === 'legendary' ? 1 : (actionType === 'reaction' ? null : 1) },
    requirements: '',
  };
}

function damageToDice(avgDamage, mod) {
  if (avgDamage <= 0) return '0';
  const adjusted = Math.max(1, avgDamage - mod);
  // Approximate dice: 1d4=2.5, 1d6=3.5, 1d8=4.5, 1d10=5.5, 1d12=6.5
  if (adjusted <= 2) return `1d4${mod > 0 ? ` + ${mod}` : ''}`;
  if (adjusted <= 4) return `1d6${mod > 0 ? ` + ${mod}` : ''}`;
  if (adjusted <= 5) return `1d8${mod > 0 ? ` + ${mod}` : ''}`;
  if (adjusted <= 7) return `1d10${mod > 0 ? ` + ${mod}` : ''}`;
  if (adjusted <= 8) return `1d12${mod > 0 ? ` + ${mod}` : ''}`;
  if (adjusted <= 10) return `2d8${mod > 0 ? ` + ${mod}` : ''}`;
  if (adjusted <= 14) return `2d10${mod > 0 ? ` + ${mod}` : ''}`;
  if (adjusted <= 18) return `3d10${mod > 0 ? ` + ${mod}` : ''}`;
  if (adjusted <= 24) return `4d10${mod > 0 ? ` + ${mod}` : ''}`;
  if (adjusted <= 30) return `5d10${mod > 0 ? ` + ${mod}` : ''}`;
  return `6d10${mod > 0 ? ` + ${mod}` : ''}`;
}

function extractDamageTypes(effects) {
  const types = new Set();
  for (const eff of Object.values(effects)) {
    if (eff.type === 'damage' && eff.damage) {
      for (const tier of ['tier1', 'tier2', 'tier3']) {
        for (const t of (eff.damage[tier]?.types || [])) {
          types.add(mapDamageType(t));
        }
      }
    }
  }
  if (types.size === 0) return 'bludgeoning';
  return [...types].join(', ');
}

function targetToText(target) {
  if (!target) return 'one target';
  if (target.custom) return replaceTerms(target.custom);
  const count = target.value || 1;
  return count === 1 ? 'one target' : `up to ${count} targets`;
}

// ── Main Actor Conversion ──────────────────────────────────────────

function convertActor(dsActor, category) {
  const sys = dsActor.system || {};
  const chars = sys.characteristics || {};
  const monster = sys.monster || {};
  const combat = sys.combat || {};

  // 5e ability scores
  const str = dsCharTo5eScore(chars.might?.value || 0);
  const dex = dsCharTo5eScore(chars.agility?.value || 0);
  const con = dsCharTo5eScore(Math.round(((chars.might?.value || 0) + (chars.agility?.value || 0)) / 2));
  const int = dsCharTo5eScore(chars.reason?.value || 0);
  const wis = dsCharTo5eScore(chars.intuition?.value || 0);
  const cha = dsCharTo5eScore(chars.presence?.value || 0);

  const strMod = abilityMod(str);
  const dexMod = abilityMod(dex);
  const conMod = abilityMod(con);
  const wisMod = abilityMod(wis);

  // Size & CR
  const size5e = mapSize(combat.size);
  const cr = calcCR(monster.level || 1, monster.organization || 'platoon');
  const profBonus = profBonusForCR(cr);

  // HP
  const hp = convertHP(sys.stamina?.max || 10, size5e, conMod);

  // AC (natural armor: 10 + dex mod + some bonus based on org)
  const orgAcBonus = { minion: 0, horde: 1, platoon: 2, elite: 3, leader: 4, solo: 5 };
  const acValue = 10 + dexMod + (orgAcBonus[monster.organization] || 0);

  // Movement
  const movement = convertMovement(sys.movement);

  // Creature type from keywords
  const creatureType = mapCreatureType(monster.keywords);

  // Damage immunities & vulnerabilities
  const di = [];
  const dv = [];
  const dr = [];
  if (sys.damage?.immunities) {
    for (const [dtype, val] of Object.entries(sys.damage.immunities)) {
      if (dtype === 'all' && val > 0) continue; // DS "damage reduction" → 5e resistance
      if (val > 0 && dtype !== 'all') di.push(mapDamageType(dtype));
    }
    if (sys.damage.immunities.all > 0) {
      // General damage reduction → note in features
    }
  }
  if (sys.damage?.weaknesses) {
    for (const [dtype, val] of Object.entries(sys.damage.weaknesses)) {
      if (val > 0 && dtype !== 'all') dv.push(mapDamageType(dtype));
    }
  }

  // Condition immunities from keywords
  const ci = [];
  if (creatureType === 'undead') ci.push('poisoned', 'exhaustion');
  if (creatureType === 'construct') ci.push('poisoned', 'charmed', 'exhaustion', 'frightened');

  // Saving throw proficiencies (based on DS save threshold — lower = better)
  const saves = {};
  const saveThreshold = combat.save?.threshold || 10;
  if (saveThreshold <= 8) {
    // Good saves
    saves.str = { proficient: strMod >= 2 ? 1 : 0 };
    saves.con = { proficient: 1 };
    saves.wis = { proficient: wisMod >= 1 ? 1 : 0 };
  }

  // Convert DS items (abilities/features) to 5e items
  const parentStats = { profBonus, strMod, dexMod, conMod, wisMod };
  const items5e = [];
  const dsItems = dsActor.items || [];

  for (const dsItem of dsItems) {
    if (dsItem.type === 'ability') {
      const converted = convertDSAbilityToAction(dsItem, parentStats);
      converted._id = foundryId(`5e:${category}:${slugify(dsActor.name)}:${slugify(dsItem.name)}`);
      items5e.push(converted);
    } else if (dsItem.type === 'feature') {
      // Features become passive traits
      const desc = replaceTerms(dsItem.system?.description?.value || '');
      items5e.push({
        _id: foundryId(`5e:${category}:${slugify(dsActor.name)}:${slugify(dsItem.name)}`),
        name: dsItem.name,
        type: 'feat',
        img: dsItem.img || 'icons/svg/book.svg',
        system: {
          description: { value: desc, chat: '' },
          source: { custom: 'Era of Embers Campaign' },
          activation: { type: '', cost: null },
          requirements: '',
        },
        effects: [],
        flags: {},
        sort: dsItem.sort || 0,
        ownership: { default: 0 },
        _stats: mk5eStats(),
      });
    }
  }

  // Legendary actions for elites/leaders/solos
  const isLegendary = monster.organization === 'leader' || monster.organization === 'solo' || monster.organization === 'elite';
  const legendaryActions = isLegendary ? { value: monster.organization === 'solo' ? 3 : 2, max: monster.organization === 'solo' ? 3 : 2 } : { value: 0, max: 0 };

  // Biography
  const bioText = replaceTerms(sys.biography?.value || '');

  // Build the 5e actor
  const actorId = foundryId(`5e:${category}:${slugify(dsActor.name)}`);
  const actor5e = {
    _id: actorId,
    name: dsActor.name.replace(/-/g, ' '),
    type: 'npc',
    img: dsActor.img ? dsActor.img.replace(/modules\/svellheim-entities/g, `modules/${MODULE_ID}`) : 'icons/svg/mystery-man.svg',
    system: {
      abilities: {
        str: { value: str },
        dex: { value: dex },
        con: { value: con },
        int: { value: int },
        wis: { value: wis },
        cha: { value: cha },
      },
      attributes: {
        ac: { flat: acValue, calc: 'flat' },
        hp: hp,
        init: { ability: 'dex', bonus: '' },
        movement: movement,
        senses: { darkvision: creatureType === 'undead' ? 60 : 0, passivePerception: 10 + wisMod },
        spellcasting: '',
      },
      details: {
        biography: { value: bioText, public: '' },
        alignment: '',
        cr: cr,
        type: { value: creatureType, subtype: '', swarm: '', custom: '' },
        source: { custom: 'Era of Embers Campaign' },
        xp: { value: crToXP(cr) },
      },
      traits: {
        size: size5e,
        di: { value: di, custom: '' },
        dr: { value: dr, custom: '' },
        dv: { value: dv, custom: '' },
        ci: { value: ci, custom: '' },
        languages: { value: [], custom: sys.biography?.languages?.join(', ') || '' },
      },
      resources: {
        legact: legendaryActions,
        legres: { value: isLegendary ? (monster.organization === 'solo' ? 3 : 1) : 0, max: isLegendary ? (monster.organization === 'solo' ? 3 : 1) : 0 },
        lair: { value: false, initiative: 0 },
      },
    },
    items: items5e,
    effects: [],
    flags: {},
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    prototypeToken: {
      name: dsActor.name.replace(/-/g, ' '),
      displayName: 20,
      actorLink: category === 'npcs',
      disposition: category === 'npcs' ? 0 : -1,
      width: combat.size?.value || 1,
      height: combat.size?.value || 1,
    },
    _stats: mk5eStats(),
  };

  return actor5e;
}

// ── CR → XP table (5e DMG) ─────────────────────────────────────────
function crToXP(cr) {
  const table = {
    0: 10, 0.125: 25, 0.25: 50, 0.5: 100,
    1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800,
    6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900,
    11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000,
    16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
    21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000,
    26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000,
  };
  // Round CR to nearest key
  const rounded = Math.round(cr * 4) / 4;
  return table[rounded] || table[Math.floor(cr)] || 0;
}

// ── Process all files ──────────────────────────────────────────────

function processDirectory(srcDir, outDir, category) {
  if (!fs.existsSync(srcDir)) {
    console.log(`  Skipping ${category} — source dir not found: ${srcDir}`);
    return 0;
  }
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.json')).sort();
  let count = 0;

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(srcDir, file), 'utf8'));
      const converted = convertActor(raw, category);
      const outPath = path.join(outDir, file);
      fs.writeFileSync(outPath, JSON.stringify(converted, null, 2), 'utf8');
      count++;
    } catch (err) {
      console.error(`  ERROR converting ${file}: ${err.message}`);
    }
  }

  return count;
}

// ── Main ───────────────────────────────────────────────────────────
console.log('=== DS → 5e Monster/NPC Conversion ===\n');

const monsterCount = processDirectory(MONSTER_SRC, MONSTER_OUT, 'monsters');
console.log(`  Monsters converted: ${monsterCount}`);

const npcCount = processDirectory(NPC_SRC, NPC_OUT, 'npcs');
console.log(`  NPCs converted: ${npcCount}`);

console.log(`\nTotal: ${monsterCount + npcCount} actors converted.`);
