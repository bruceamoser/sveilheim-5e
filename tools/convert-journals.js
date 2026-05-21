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
  replaceTerms, fixMojibake, stripTableStyles, stripHeroPointRefs, mk5eStats,
} = require('./shared');

// Journals to skip entirely (DS-only mechanics with no 5e equivalent)
const SKIP_JOURNALS = new Set([
  'Hero-Points-Surges-Victories.journal.json',
  'Montage-Tests-Cheatsheet.journal.json',
  'Montage-Tests-Overview.journal.json',
  'Negotiations-Cheatsheet.journal.json',
  'Negotiations-Overview.journal.json',
  'Downtime-Projects-Cheatsheet.journal.json',
  'Downtime-Projects-Overview.journal.json',
]);

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
    content = stripTableStyles(content);
    content = stripHeroPointRefs(content);

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
  parts.push(`<h1>Svellheim Downtime Projects</h1>`);
  parts.push(`<p>These are narrative downtime activities for your campaign. They are not tied to any system mechanic — the GM decides how long projects take and what resources are needed based on the fiction.</p>`);
  parts.push(`<h2>How to Use These Projects</h2>`);
  parts.push(`<ul>`);
  parts.push(`<li>When a player wants to pursue a project during downtime, find the relevant entry below.</li>`);
  parts.push(`<li>Use the description and prerequisites as narrative guidance — what does the character need to gather, who do they need to talk to?</li>`);
  parts.push(`<li>The "Downtime Days" value is a rough guideline. Adjust based on your campaign pacing and the player's approach.</li>`);
  parts.push(`<li>Projects can be completed in stages across multiple downtime periods.</li>`);
  parts.push(`<li>Consider requiring ability checks (Arcana, Nature, Smith's Tools, etc.) for key milestones, with DC based on project complexity.</li>`);
  parts.push(`</ul>`);

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
    if (SKIP_JOURNALS.has(file)) {
      console.log(`    Skipped (DS-only): ${file}`);
      continue;
    }
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

  // Module usage guide
  const usageGuide = generateUsageGuide();
  fs.writeFileSync(path.join(WORLD_OUT, 'module-usage-guide.json'), JSON.stringify(usageGuide, null, 2), 'utf8');
  console.log('  Usage guide: generated');

  console.log('\nJournal conversion complete.');
}

// ── Generate module usage guide ────────────────────────────────────

function generateUsageGuide() {
  const content = `
<h1>How to Use This Module</h1>
<p>This module contains the complete <strong>Era of Embers</strong> campaign adapted for D&D 5e. Everything is organized into compendiums under the <strong>Sveilheim</strong> folder.</p>

<hr><h2>What's Included</h2>

<h3>Monsters &amp; NPCs</h3>
<p>All monsters and NPCs have been converted to 5e stat blocks with appropriate CRs, ability scores, actions, and traits. Import them directly into your encounters.</p>

<h3>Magic Items</h3>
<p>25 campaign-specific magic items with 5e rarity, attunement, and damage types. Each includes crafting notes and DM guidance for when they appear in the story.</p>

<h3>Act Journals (Acts 1–3)</h3>
<p>The complete campaign narrative broken into three acts. Each act has <strong>Director Journals</strong> (GM-only beat-by-beat guides) and <strong>Player Handouts</strong> (shareable summaries). Read the Director Journal for each beat before running it.</p>

<h3>World Lore</h3>
<p>Background material for the Svellheim setting:</p>
<ul>
<li><strong>Gazetteer</strong> (Coastal, Interior, Northern Belts) — geography, settlements, factions</li>
<li><strong>The Gods of Svellheim</strong> — the pantheon and their domains</li>
<li><strong>The Svellheim Calendar</strong> — months, seasons, and observances</li>
<li><strong>Languages of Svellheim</strong> — the tongues spoken in the north</li>
<li><strong>Ancestry Guide</strong> — how Svellheim ancestries map to 5e races</li>
<li><strong>Imbue Enhancements</strong> — magical enchantments available through the campaign</li>
</ul>

<hr><h2>Montage Scenes</h2>
<p>The campaign includes <strong>montage scenes</strong> — narrative sequences where the party faces a series of challenges together (travel, exploration, survival). These are <em>not</em> mechanical skill challenges with pass/fail counters. Instead:</p>
<ul>
<li>Go around the table and ask each player how their character contributes.</li>
<li>Call for ability checks when the outcome is uncertain (suggested DCs are provided).</li>
<li>Use the listed complications as dramatic prompts — you don't need to use all of them.</li>
<li>Let creative roleplay succeed without rolls.</li>
<li>The outcomes section guides what happens based on how the party performed overall.</li>
</ul>
<p>Find these in the <strong>Montage Tests &amp; Negotiations</strong> compendium, prefixed with "Montage:".</p>

<hr><h2>Negotiation Scenes</h2>
<p>Social encounters with important NPCs are laid out as <strong>negotiation scenes</strong>. These are narrative conversations, not mechanical attitude-track mini-games. The GM controls the NPC's reactions based on what the players say and do:</p>
<ul>
<li>Each NPC has a <strong>starting attitude</strong> (Hostile through Helpful) that sets the tone.</li>
<li><strong>Motivations</strong> are topics that make the NPC more cooperative — if the PCs appeal to these, reward them.</li>
<li><strong>Pitfalls</strong> are topics that offend or alienate the NPC — if triggered, the NPC becomes defensive.</li>
<li>Only call for Persuasion/Deception/Intimidation checks at pivotal moments. Let good roleplay carry the scene.</li>
<li>Suggested DCs are provided if you need them.</li>
</ul>
<p>Find these in the <strong>Montage Tests &amp; Negotiations</strong> compendium, prefixed with "Negotiation:".</p>

<hr><h2>Downtime Projects</h2>
<p>The campaign provides narrative downtime projects — crafting, research, and imbuing activities that players can pursue between adventures. These are <em>not</em> tied to a system mechanic:</p>
<ul>
<li>When a player wants to pursue a project, find it in the <strong>Downtime Projects Reference</strong> (in this compendium).</li>
<li>Use the description and prerequisites as narrative guidance.</li>
<li>Decide how long it takes based on your pacing — the listed "Downtime Days" are rough guidelines.</li>
<li>Consider requiring relevant ability checks or tool proficiency checks at key milestones.</li>
</ul>

<hr><h2>Running the Campaign</h2>
<ol>
<li>Read the <strong>World Lore</strong> compendium to familiarize yourself with Svellheim.</li>
<li>Share the <strong>Ancestry Guide</strong> with players during character creation.</li>
<li>For each session, read the relevant <strong>Director Journal</strong> beat.</li>
<li>Import the monsters/NPCs you need for that beat from the compendiums.</li>
<li>Use the montage and negotiation journals as GM reference during play.</li>
<li>Share <strong>Player Handouts</strong> as recap material between sessions.</li>
</ol>
`;

  const journalId = foundryId('5e:journal:usage-guide');
  const pageId = foundryId('5e:journal:usage-guide:main');

  return {
    _id: journalId,
    name: 'How to Use This Module',
    folder: null,
    sort: -100000,
    flags: {},
    ownership: { default: 0 },
    _stats: mk5eStats(),
    pages: [{
      _id: pageId,
      name: 'Module Guide',
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

main();
