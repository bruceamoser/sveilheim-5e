#!/usr/bin/env node
/**
 * convert-journals.js
 *
 * Converts Draw Steel journal JSONs from Act 1/2/3 and svellheim-world
 * into 5e-compatible journal entries with terminology replaced.
 *
 * Also generates:
 *  - Ancestry mapping guide journal
 *  - Downtime reference journals from project data
 *
 * Usage: node tools/convert-journals.js
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  foundryId, slugify,
  replaceTerms, fixMojibake, mk5eStats,
} = require('./shared');

const REPO_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(REPO_ROOT, '..');
const WORLD_DIR = path.join(WORKSPACE_ROOT, 'svellheim-world', 'data');

// ── Output directories ─────────────────────────────────────────────
const ACT_OUT = {
  act1: path.join(REPO_ROOT, 'data', 'journals', 'act1'),
  act2: path.join(REPO_ROOT, 'data', 'journals', 'act2'),
  act3: path.join(REPO_ROOT, 'data', 'journals', 'act3'),
};
const WORLD_OUT = path.join(REPO_ROOT, 'data', 'journals', 'world-lore');
const DOWNTIME_OUT = path.join(REPO_ROOT, 'data', 'journals', 'downtime');

// ── Deep-convert a journal document ────────────────────────────────

function convertJournalDoc(doc, category) {
  const slug = slugify(doc.name || 'unknown');
  const newId = foundryId(`5e:journal:${category}:${slug}`);

  // Deep-clone and transform
  const result = {
    _id: newId,
    name: fixMojibake(doc.name || 'Unnamed Journal'),
    folder: null,
    sort: doc.sort || 0,
    flags: {},
    ownership: doc.ownership || { default: 0 },
    _stats: mk5eStats(),
    pages: [],
  };

  // Convert each page
  const pages = doc.pages || [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageSlug = slugify(page.name || `page-${i}`);
    const pageId = foundryId(`5e:journal:${category}:${slug}:${pageSlug}`);

    let content = page.text?.content || '';
    content = replaceTerms(content);

    // Strip DS compendium links from content
    content = content.replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, '$1');
    content = content.replace(/@UUID\[[^\]]*\]/g, '');
    content = content.replace(/@Compendium\[[^\]]*\]\{([^}]*)\}/g, '$1');
    content = content.replace(/@Compendium\[[^\]]*\]/g, '');

    result.pages.push({
      _id: pageId,
      name: fixMojibake(page.name || `Page ${i + 1}`),
      type: page.type || 'text',
      title: page.title || { show: true, level: 1 },
      text: { content, format: page.text?.format || 1 },
      sort: page.sort || (i * 100000),
      ownership: page.ownership || { default: -1 },
      flags: {},
      _stats: mk5eStats(),
    });
  }

  return result;
}

// ── Generate ancestry mapping guide ────────────────────────────────

function generateAncestryGuide() {
  const content = `
<h1>Svellheim Ancestry Guide for D&D 5e</h1>
<p>The Svellheim campaign setting uses custom ancestries from the Draw Steel system. For D&D 5e, map these to the closest standard 5e races while keeping the campaign flavor.</p>

<h2>The Hearth-Keepers</h2>

<h3>Hearthborn → Human (Variant)</h3>
<p><em>"Quick to build, quick to die, quick to break their word."</em></p>
<p>The stubborn builders. Hearthborn survive because they refuse to be alone. They are masters of <strong>The Hearth</strong> — the concept that fire is shared.</p>
<p><strong>5e Notes:</strong> Use Variant Human. The bonus feat can represent their Detect the Supernatural signature trait (take Alert or Sentinel). Hearthborn owe a debt to <em>Community</em>.</p>

<h3>Deepforged → Dwarf (Hill or Mountain)</h3>
<p><em>"Greedy as a dragon, stubborn as a glacier."</em></p>
<p>The architects who claim to be painted from the mountain's roots. They value <strong>Weight</strong> — things that last.</p>
<p><strong>5e Notes:</strong> Use Hill Dwarf for the tougher variant, Mountain for the martial. Their Runic Painting trait maps to the Dwarven Toughness or Dwarven Armor Training features. Deepforged owe a debt to <em>Craft</em>.</p>

<h2>The Wild-Kin</h2>

<h3>Ashmarked → Half-Orc</h3>
<p><em>"Half-monster, half-fuel."</em></p>
<p>Blood that burns like embers. While Hearthborn built walls, Ashmarked heated their blood to match the cold.</p>
<p><strong>5e Notes:</strong> Use Half-Orc. Relentless Endurance directly maps to the Ashmarked Relentless trait. Ashmarked owe a debt to <em>Endurance</em>.</p>

<h3>Cragbound → Goliath</h3>
<p><em>"Strong back, slow mind."</em></p>
<p>The old ones. Too big for the world. They move with the slow, grinding inevitability of a tectonic plate.</p>
<p><strong>5e Notes:</strong> Use Goliath. Stone's Endurance maps to their siege-like resilience. Their Living Siege trait (extra forced movement) can be roleplayed via Powerful Build. Cragbound owe a debt to <em>Endurance</em>.</p>

<h3>Tonttu → Wood Elf</h3>
<p><em>"Quiet as falling snow."</em></p>
<p>Small, quiet watchers of the Taiga who guard the hot springs and moss-beds.</p>
<p><strong>5e Notes:</strong> Use Wood Elf. Fleet of Foot and Mask of the Wild fit the Tonttu perfectly. Consider Halfling (Ghostwise) for a small-size option. Tonttu owe a debt to <em>the Land</em>.</p>

<h2>The Outsiders</h2>

<h3>Skogvættr → Firbolg</h3>
<p><em>"More tree than person."</em></p>
<p>Forest spirits who walk between the Green Heart and the mortal world.</p>
<p><strong>5e Notes:</strong> Use Firbolg. Hidden Step and Speech of Beast and Leaf fit perfectly. Skogvættr owe a debt to <em>the Green Heart</em>.</p>

<h3>Wyrdscarred → Tiefling</h3>
<p><em>"Touched by the wrong gods."</em></p>
<p>Marked by the Wyrd — fate itself has left visible scars on their bodies.</p>
<p><strong>5e Notes:</strong> Use Tiefling. Hellish Rebuke maps to their curse-discharge abilities. Reflavor "infernal" as "Wyrd-touched." Wyrdscarred owe a debt to <em>Fate</em>.</p>

<h3>Jotunfolk → Goliath (variant)</h3>
<p><em>"Children of the frost giants."</em></p>
<p>Giant heritage flowing through smaller frames.</p>
<p><strong>5e Notes:</strong> Use Goliath or Firbolg. Their giant ancestry gives them cold resistance and powerful build. Jotunfolk owe a debt to <em>the Old Ways</em>.</p>

<h2>The Touch-Bound</h2>

<h3>Revenant → Reborn (Van Richten's)</h3>
<p><em>"Death refused to hold you."</em></p>
<p>Those who died and came back — willingly or not.</p>
<p><strong>5e Notes:</strong> Use the Reborn lineage from Van Richten's Guide to Ravenloft. Revenant owe a debt to <em>the Grave</em>.</p>

<hr>
<h2>Ancestry & Debt</h2>
<p>In Svellheim, ancestry defines your <strong>debt to the world</strong>:</p>
<ul>
<li><strong>Hearth-Keepers</strong> owe a debt to each other (Community)</li>
<li><strong>Wild-Kin</strong> owe a debt to the land (Endurance)</li>
<li><strong>Outsiders</strong> owe a debt to the strange places they came from (Magic)</li>
<li><strong>Touch-Bound</strong> owe a debt to the forces that marked them (Curse)</li>
</ul>
<p>This is a roleplaying hook, not a mechanical restriction. Discuss with your DM how your debt might come up during play.</p>
`;

  const journalId = foundryId('5e:journal:ancestry-guide');
  const pageId = foundryId('5e:journal:ancestry-guide:main');

  return {
    _id: journalId,
    name: 'Svellheim Ancestry Guide (5e)',
    folder: null,
    sort: 0,
    flags: {},
    ownership: { default: 0 },
    _stats: mk5eStats(),
    pages: [{
      _id: pageId,
      name: 'Ancestry Mapping',
      type: 'text',
      title: { show: true, level: 1 },
      text: { content, format: 1 },
      sort: 0,
      ownership: { default: -1 },
      flags: {},
      _stats: mk5eStats(),
    }],
  };
}

// ── Generate downtime reference from project data ──────────────────

function generateDowntimeReference() {
  const projectRoot = path.join(WORKSPACE_ROOT, 'Svellheim-Entities', 'data', 'projects');
  const imbuingRoot = path.join(WORKSPACE_ROOT, 'Svellheim-Entities', 'data', 'imbuing-projects');

  const parts = [];
  parts.push(`<h1>Svellheim Downtime Projects (5e Reference)</h1>`);
  parts.push(`<p>These downtime activities are adapted from the Draw Steel campaign. Use the Xanathar's Guide downtime rules as a base framework, with the flavor and costs below.</p>`);

  // Read project categories
  for (const [label, dir] of [['Crafting', 'Crafting'], ['Research', 'Research'], ['Other', 'Other']]) {
    const catDir = path.join(projectRoot, dir);
    if (!fs.existsSync(catDir)) continue;

    parts.push(`<hr><h2>${label} Projects</h2>`);

    // Read tier subdirs
    for (const tierDir of fs.readdirSync(catDir).sort()) {
      const tierPath = path.join(catDir, tierDir);
      if (!fs.statSync(tierPath).isDirectory()) continue;

      const tierLabel = tierDir.replace(/-/g, ' ');
      parts.push(`<h3>${tierLabel}</h3>`);

      const files = fs.readdirSync(tierPath).filter(f => f.endsWith('.json')).sort();
      for (const file of files) {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(tierPath, file), 'utf8'));
          const name = fixMojibake(raw.name || file);
          const desc = replaceTerms(fixMojibake(raw.system?.description?.value || ''));
          const prereqs = fixMojibake(raw.system?.project?.prerequisites || '');
          const goal = raw.system?.project?.goal || 0;

          parts.push(`<h4>${name}</h4>`);
          if (desc) parts.push(desc);
          if (prereqs) parts.push(`<p><strong>Prerequisites:</strong> ${prereqs}</p>`);
          if (goal) parts.push(`<p><strong>Downtime Days:</strong> ${Math.ceil(goal / 10)} (approx.)</p>`);
        } catch (err) {
          console.error(`  Warning: could not read ${file}: ${err.message}`);
        }
      }
    }
  }

  // Imbuing projects
  for (const [label, dir] of [['Armor Imbuing', 'Armor'], ['Weapon Imbuing', 'Weapon'], ['Implement Imbuing', 'Implement']]) {
    const catDir = path.join(imbuingRoot, dir);
    if (!fs.existsSync(catDir)) continue;

    parts.push(`<hr><h2>${label}</h2>`);

    for (const tierDir of fs.readdirSync(catDir).sort()) {
      const tierPath = path.join(catDir, tierDir);
      if (!fs.statSync(tierPath).isDirectory()) continue;

      const tierLabel = tierDir.replace(/-/g, ' ');
      parts.push(`<h3>${tierLabel}</h3>`);

      const files = fs.readdirSync(tierPath).filter(f => f.endsWith('.json')).sort();
      for (const file of files) {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(tierPath, file), 'utf8'));
          const name = fixMojibake(raw.name || file);
          const desc = replaceTerms(fixMojibake(raw.system?.description?.value || ''));
          parts.push(`<h4>${name}</h4>`);
          if (desc) parts.push(desc);
        } catch (err) {
          console.error(`  Warning: could not read ${file}: ${err.message}`);
        }
      }
    }
  }

  const journalId = foundryId('5e:journal:downtime-ref');
  const pageId = foundryId('5e:journal:downtime-ref:main');

  return {
    _id: journalId,
    name: 'Svellheim Downtime Projects Reference',
    folder: null,
    sort: 0,
    flags: {},
    ownership: { default: 0 },
    _stats: mk5eStats(),
    pages: [{
      _id: pageId,
      name: 'Downtime Projects',
      type: 'text',
      title: { show: true, level: 1 },
      text: { content: parts.join('\n'), format: 1 },
      sort: 0,
      ownership: { default: -1 },
      flags: {},
      _stats: mk5eStats(),
    }],
  };
}

// ── Process journal directories ────────────────────────────────────

function processJournalDir(srcDir, outDir, category) {
  if (!fs.existsSync(srcDir)) {
    console.log(`  Skipping ${category} — dir not found: ${srcDir}`);
    return 0;
  }
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.json')).sort();
  let count = 0;

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(srcDir, file), 'utf8'));
      const converted = convertJournalDoc(raw, category);
      fs.writeFileSync(path.join(outDir, file), JSON.stringify(converted, null, 2), 'utf8');
      count++;
    } catch (err) {
      console.error(`  ERROR converting ${file}: ${err.message}`);
    }
  }

  return count;
}

// ── Main ───────────────────────────────────────────────────────────

function main() {
  console.log('=== DS → 5e Journal Conversion ===\n');

  // Act journals (director + player)
  for (const [actKey, actNum] of [['act1', 1], ['act2', 2], ['act3', 3]]) {
    const actRoot = path.join(WORKSPACE_ROOT, `Svellheim-Act${actNum}`, 'data');
    let total = 0;
    total += processJournalDir(path.join(actRoot, 'director-journals'), ACT_OUT[actKey], `${actKey}-director`);
    total += processJournalDir(path.join(actRoot, 'player-journals'), ACT_OUT[actKey], `${actKey}-player`);
    console.log(`  Act ${actNum} journals: ${total}`);
  }

  // World lore journals
  let worldTotal = 0;
  worldTotal += processJournalDir(path.join(WORLD_DIR, 'player-journals'), WORLD_OUT, 'world-player');
  worldTotal += processJournalDir(path.join(WORLD_DIR, 'director-journals'), WORLD_OUT, 'world-director');
  console.log(`  World lore journals: ${worldTotal}`);

  // Ancestry guide
  fs.mkdirSync(WORLD_OUT, { recursive: true });
  const ancestryGuide = generateAncestryGuide();
  fs.writeFileSync(path.join(WORLD_OUT, 'ancestry-guide.json'), JSON.stringify(ancestryGuide, null, 2), 'utf8');
  console.log('  Ancestry guide: generated');

  // Downtime reference
  fs.mkdirSync(DOWNTIME_OUT, { recursive: true });
  const downtimeRef = generateDowntimeReference();
  fs.writeFileSync(path.join(DOWNTIME_OUT, 'downtime-projects-reference.json'), JSON.stringify(downtimeRef, null, 2), 'utf8');
  console.log('  Downtime reference: generated');

  console.log('\nJournal conversion complete.');
}

main();
