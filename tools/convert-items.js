#!/usr/bin/env node
/**
 * convert-items.js
 *
 * Reads Draw Steel item JSONs from Svellheim-Entities
 * and outputs dnd5e-compatible item JSONs for the sveilheim-5e module.
 *
 * Usage: node tools/convert-items.js
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  foundryId, slugify,
  mapDamageType, replaceTerms, mk5eStats,
} = require('./shared');

// ── Paths ──────────────────────────────────────────────────────────────
const REPO_ROOT = path.resolve(__dirname, '..');
const ENTITIES_ROOT = path.resolve(REPO_ROOT, '..', 'Svellheim-Entities');
const ITEM_SRC = path.join(ENTITIES_ROOT, 'data', 'items');
const ITEM_OUT = path.join(REPO_ROOT, 'data', 'items');
const MODULE_ID = 'sveilheim-5e';

// ── DS Echelon → 5e Rarity ─────────────────────────────────────────
function mapRarity(echelon, category) {
  if (category === 'consumable') return echelon >= 5 ? 'uncommon' : 'common';
  if (echelon <= 1) return 'uncommon';
  if (echelon <= 4) return 'rare';
  if (echelon <= 8) return 'veryRare';
  return 'legendary';
}

// ── DS Item Kind → 5e Item Type ────────────────────────────────────
function mapItemType(dsKind) {
  switch (dsKind) {
    case 'weapon': return 'weapon';
    case 'armor': case 'shield': return 'equipment';
    case 'implement': return 'equipment';
    default: return 'loot';
  }
}

// ── Convert a single item ──────────────────────────────────────────
function convertItem(dsItem) {
  const sys = dsItem.system || {};
  const name = dsItem.name || 'Unknown Item';
  const slug = slugify(name);
  const kind = sys.kind || '';
  const category = sys.category || 'leveled';
  const echelon = sys.echelon || 1;

  // Description conversion
  let desc = replaceTerms(sys.description?.value || '');
  const directorNotes = replaceTerms(sys.description?.director || '');

  // Add crafting info if present
  if (sys.project?.prerequisites) {
    desc += `\n<hr><h3>Crafting</h3>`;
    desc += `<p><strong>Prerequisites:</strong> ${replaceTerms(sys.project.prerequisites)}</p>`;
    if (sys.project.source) desc += `<p><strong>Source:</strong> ${replaceTerms(sys.project.source)}</p>`;
    if (sys.project.goal) desc += `<p><strong>Crafting Time:</strong> ${sys.project.goal} downtime days (approximately)</p>`;
  }

  // Director notes → secret block
  if (directorNotes) {
    desc += `\n<section class="secret"><h3>DM Notes</h3>${directorNotes}</section>`;
  }

  // Determine attunement
  const requiresAttunement = echelon >= 1 && category !== 'consumable' && category !== 'trinket';

  const type5e = mapItemType(kind);
  const rarity = mapRarity(echelon, category);

  const item5e = {
    _id: foundryId(`5e:item:${slug}`),
    name: name,
    type: type5e,
    img: dsItem.img ? dsItem.img.replace(/modules\/svellheim-entities/g, `modules/${MODULE_ID}`) : 'icons/svg/item-bag.svg',
    system: {
      description: { value: desc, chat: '', unidentified: '' },
      source: { custom: 'Era of Embers Campaign' },
      quantity: sys.quantity || 1,
      weight: { value: 0, units: 'lb' },
      price: { value: 0, denomination: 'gp' },
      attunement: requiresAttunement ? 'required' : '',
      equipped: false,
      rarity: rarity,
      identified: true,
    },
    effects: [],
    flags: {},
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    _stats: mk5eStats(),
  };

  // Add weapon-specific fields
  if (type5e === 'weapon') {
    item5e.system.type = { value: 'simpleM', baseItem: 'longsword' };
    item5e.system.damage = { parts: [['1d8 + @mod', 'slashing']], versatile: '1d10 + @mod' };
    item5e.system.range = { value: 5, long: null, units: 'ft' };
    item5e.system.ability = 'str';
    item5e.system.actionType = 'mwak';
    item5e.system.proficient = true;
    item5e.system.properties = ['mgc'];

    // Check for damage type keywords in description
    for (const [dsType, dndType] of Object.entries({ cold: 'cold', fire: 'fire', corruption: 'necrotic', holy: 'radiant', lightning: 'lightning', poison: 'poison' })) {
      if (desc.toLowerCase().includes(dsType)) {
        item5e.system.damage.parts.push([`1d6`, dndType]);
        break;
      }
    }
  }

  // Add equipment-specific fields
  if (type5e === 'equipment') {
    item5e.system.type = { value: 'trinket' };
    if (kind === 'armor') {
      item5e.system.type = { value: 'light', baseItem: '' };
      item5e.system.armor = { value: 12, dex: null };
    } else if (kind === 'shield') {
      item5e.system.type = { value: 'shield', baseItem: 'shield' };
      item5e.system.armor = { value: 2, dex: null };
    }
  }

  return item5e;
}

// ── Process all items ──────────────────────────────────────────────

function main() {
  console.log('=== DS → 5e Item Conversion ===\n');

  if (!fs.existsSync(ITEM_SRC)) {
    console.log(`  Source dir not found: ${ITEM_SRC}`);
    return;
  }

  fs.mkdirSync(ITEM_OUT, { recursive: true });

  const files = fs.readdirSync(ITEM_SRC).filter(f => f.endsWith('.json')).sort();
  let count = 0;

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(ITEM_SRC, file), 'utf8'));
      const converted = convertItem(raw);
      fs.writeFileSync(path.join(ITEM_OUT, file), JSON.stringify(converted, null, 2), 'utf8');
      count++;
    } catch (err) {
      console.error(`  ERROR converting ${file}: ${err.message}`);
    }
  }

  console.log(`  Items converted: ${count}`);
}

main();
