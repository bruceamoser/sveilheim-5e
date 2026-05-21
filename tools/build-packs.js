#!/usr/bin/env node
/**
 * build-packs.js
 *
 * Compiles all converted 5e JSON data files into LevelDB compendium packs
 * for the sveilheim-5e Foundry VTT module.
 *
 * Usage: node tools/build-packs.js
 */
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MODULE_DIR = path.join(REPO_ROOT, 'module');
const DATA_DIR = path.join(REPO_ROOT, 'data');
const MODULE_ID = 'sveilheim-5e';

// ── Pack definitions ───────────────────────────────────────────────
const PACKS = [
  {
    name: 'sveilheim-5e-monsters',
    label: 'Sveilheim Monsters',
    type: 'Actor',
    sources: [{ dir: path.join(DATA_DIR, 'monsters'), keyPrefix: '!actors!' }],
  },
  {
    name: 'sveilheim-5e-npcs',
    label: 'Sveilheim NPCs',
    type: 'Actor',
    sources: [{ dir: path.join(DATA_DIR, 'npcs'), keyPrefix: '!actors!' }],
  },
  {
    name: 'sveilheim-5e-items',
    label: 'Sveilheim Magic Items',
    type: 'Item',
    sources: [{ dir: path.join(DATA_DIR, 'items'), keyPrefix: '!items!' }],
  },
  {
    name: 'sveilheim-5e-world-lore',
    label: 'Sveilheim World Lore',
    type: 'JournalEntry',
    sources: [{ dir: path.join(DATA_DIR, 'journals', 'world-lore'), keyPrefix: '!journal!' }],
  },
  {
    name: 'sveilheim-5e-act1',
    label: 'Sveilheim Act 1',
    type: 'JournalEntry',
    sources: [{ dir: path.join(DATA_DIR, 'journals', 'act1'), keyPrefix: '!journal!' }],
  },
  {
    name: 'sveilheim-5e-act2',
    label: 'Sveilheim Act 2',
    type: 'JournalEntry',
    sources: [{ dir: path.join(DATA_DIR, 'journals', 'act2'), keyPrefix: '!journal!' }],
  },
  {
    name: 'sveilheim-5e-act3',
    label: 'Sveilheim Act 3',
    type: 'JournalEntry',
    sources: [{ dir: path.join(DATA_DIR, 'journals', 'act3'), keyPrefix: '!journal!' }],
  },
  {
    name: 'sveilheim-5e-mechanics',
    label: 'Sveilheim Skill Challenges & Social Encounters',
    type: 'JournalEntry',
    sources: [
      { dir: path.join(DATA_DIR, 'journals', 'mechanics'), keyPrefix: '!journal!' },
      { dir: path.join(DATA_DIR, 'journals', 'downtime'), keyPrefix: '!journal!' },
    ],
  },
];

// ── LevelDB writer ────────────────────────────────────────────────

async function writePack(packDef) {
  const { ClassicLevel } = require('classic-level');
  const packDir = path.join(MODULE_DIR, 'packs', packDef.name);

  fs.rmSync(packDir, { recursive: true, force: true });
  fs.mkdirSync(packDir, { recursive: true });

  const db = new ClassicLevel(packDir, { keyEncoding: 'utf8', valueEncoding: 'utf8' });
  await db.open();

  let totalDocs = 0;

  for (const source of packDef.sources) {
    if (!fs.existsSync(source.dir)) {
      console.log(`    Skipping source dir: ${source.dir} (not found)`);
      continue;
    }

    const files = fs.readdirSync(source.dir).filter(f => f.endsWith('.json')).sort();

    for (const file of files) {
      try {
        const doc = JSON.parse(fs.readFileSync(path.join(source.dir, file), 'utf8'));
        const docId = doc._id;

        if (packDef.type === 'Actor') {
          // Write embedded items
          const items = doc.items || [];
          for (const item of items) {
            const itemKey = `!actors.items!${docId}.${item._id}`;
            // Write embedded item effects
            const itemEffects = item.effects || [];
            for (const eff of itemEffects) {
              await db.put(`!actors.items.effects!${docId}.${item._id}.${eff._id}`, JSON.stringify(eff));
            }
            const itemDoc = { ...item, effects: itemEffects.map(e => e._id || e) };
            await db.put(itemKey, JSON.stringify(itemDoc));
          }
          // Write actor effects
          const actorEffects = doc.effects || [];
          for (const eff of actorEffects) {
            await db.put(`!actors.effects!${docId}.${eff._id}`, JSON.stringify(eff));
          }
          // Write actor document
          const actorDoc = {
            ...doc,
            items: items.map(i => i._id),
            effects: actorEffects.map(e => e._id || e),
          };
          await db.put(`${source.keyPrefix}${docId}`, JSON.stringify(actorDoc));

        } else if (packDef.type === 'JournalEntry') {
          // Write embedded pages
          const pages = doc.pages || [];
          for (const page of pages) {
            await db.put(`!journal.pages!${docId}.${page._id}`, JSON.stringify(page));
          }
          // Write journal document
          const journalDoc = {
            ...doc,
            pages: pages.map(p => p._id),
          };
          await db.put(`${source.keyPrefix}${docId}`, JSON.stringify(journalDoc));

        } else if (packDef.type === 'Item') {
          // Write item effects
          const effects = doc.effects || [];
          for (const eff of effects) {
            await db.put(`!items.effects!${docId}.${eff._id}`, JSON.stringify(eff));
          }
          const itemDoc = { ...doc, effects: effects.map(e => e._id || e) };
          await db.put(`${source.keyPrefix}${docId}`, JSON.stringify(itemDoc));

        } else {
          // Generic fallback
          await db.put(`${source.keyPrefix}${docId}`, JSON.stringify(doc));
        }

        totalDocs++;
      } catch (err) {
        console.error(`    ERROR writing ${file}: ${err.message}`);
      }
    }
  }

  await db.compactRange('\x00', '\xff');
  await db.close();

  return totalDocs;
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('=== Building sveilheim-5e Compendium Packs ===\n');

  fs.mkdirSync(path.join(MODULE_DIR, 'packs'), { recursive: true });

  // Copy module.json to module/
  const rootManifest = path.join(REPO_ROOT, 'module.json');
  const moduleManifest = path.join(MODULE_DIR, 'module.json');
  if (fs.existsSync(rootManifest)) {
    fs.copyFileSync(rootManifest, moduleManifest);
    console.log('  Copied module.json → module/module.json');
  }

  let grandTotal = 0;

  for (const pack of PACKS) {
    const count = await writePack(pack);
    console.log(`  ${pack.label}: ${count} documents`);
    grandTotal += count;
  }

  console.log(`\nTotal: ${grandTotal} documents across ${PACKS.length} packs.`);
  console.log('Build complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
