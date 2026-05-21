#!/usr/bin/env node
/**
 * convert-montages.js
 *
 * Reads Draw Steel montage test JSONs from Svellheim-Act1/2/3
 * and outputs 5e skill challenge JournalEntry JSONs.
 *
 * Usage: node tools/convert-montages.js
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  foundryId, slugify,
  replaceTerms, fixMojibake, mk5eStats,
  DIFFICULTY_DC, DS_CHAR_TO_5E_SKILLS,
} = require('./shared');

const REPO_ROOT = path.resolve(__dirname, '..');
const ACTS_ROOT = path.resolve(REPO_ROOT, '..');
const OUT_DIR = path.join(REPO_ROOT, 'data', 'journals', 'mechanics');

// ── DS Characteristic mention → 5e skill names ────────────────────
const CHAR_TO_SKILL_NAMES = {
  might: 'Athletics',
  agility: 'Acrobatics or Stealth',
  reason: 'Arcana or Investigation',
  intuition: 'Perception, Survival, or Insight',
  presence: 'Persuasion, Intimidation, or Deception',
};

/**
 * Convert DS characteristic references in complication HTML to 5e skills.
 * Patterns like "(Might)" or "(Reason)" → "(Athletics, DC 15)" etc.
 */
function convertSkillRefs(html, dc) {
  if (!html) return '';
  let result = replaceTerms(html);
  for (const [dsChar, skillName] of Object.entries(CHAR_TO_SKILL_NAMES)) {
    const pattern = new RegExp(`\\(${dsChar}\\)`, 'gi');
    result = result.replace(pattern, `(${skillName}, DC ${dc})`);
  }
  return result;
}

// ── Convert a single montage test ──────────────────────────────────

function convertMontage(dsItem, actLabel) {
  const sys = dsItem.system || {};
  const name = dsItem.name || 'Unnamed Montage';
  const slug = slugify(name);
  const difficulty = sys.difficulty || 'moderate';
  const dc = DIFFICULTY_DC[difficulty] || 13;
  const successes = sys.successLimit || 4;
  const failures = sys.failureLimit || 4;

  // Build the journal page content
  const parts = [];

  parts.push(`<h1>Skill Challenge: ${fixMojibake(name)}</h1>`);
  parts.push(`<p><strong>Act:</strong> ${actLabel} | <strong>Difficulty:</strong> ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} (DC ${dc})</p>`);
  parts.push(`<p><strong>Successes Needed:</strong> ${successes} | <strong>Failures Allowed:</strong> ${failures}</p>`);

  // Overview
  const overview = replaceTerms(fixMojibake(sys.description || ''));
  if (overview) {
    parts.push(`<hr><h2>Overview</h2>${overview}`);
  }

  // Rules box
  parts.push(`<hr><h2>Running the Skill Challenge</h2>`);
  parts.push(`<p>Each character takes a turn attempting one skill check. On their turn, a player describes how they're helping the party and rolls the appropriate skill against <strong>DC ${dc}</strong>. A success adds to the group's total; a failure adds to the failure count. If the party reaches <strong>${successes} successes</strong> before <strong>${failures} failures</strong>, they succeed overall.</p>`);
  parts.push(`<p><strong>Suggested Skills:</strong></p><ul>`);
  for (const [, skillName] of Object.entries(CHAR_TO_SKILL_NAMES)) {
    parts.push(`<li>${skillName}</li>`);
  }
  parts.push(`</ul>`);
  parts.push(`<p>Players may also suggest creative skill uses — reward good roleplaying with advantage or a lower DC.</p>`);

  // Complications (round-by-round challenges)
  if (sys.complications?.round1) {
    parts.push(`<hr><h2>Complications</h2>`);
    parts.push(convertSkillRefs(fixMojibake(sys.complications.round1), dc));
  }
  if (sys.complications?.round2) {
    parts.push(`<h3>Later Rounds</h3>`);
    parts.push(convertSkillRefs(fixMojibake(sys.complications.round2), dc));
  }

  // Outcomes
  if (sys.outcomes?.round1) {
    parts.push(`<hr><h2>Outcomes</h2>`);
    parts.push(replaceTerms(fixMojibake(sys.outcomes.round1)));
  }
  if (sys.outcomes?.round2) {
    parts.push(replaceTerms(fixMojibake(sys.outcomes.round2)));
  }

  // Build journal entry
  const journalId = foundryId(`5e:sc:${slug}`);
  const pageId = foundryId(`5e:sc:page:${slug}`);

  return {
    _id: journalId,
    name: `Skill Challenge: ${fixMojibake(name)}`,
    folder: null,
    sort: 0,
    flags: {},
    ownership: { default: 0 },
    _stats: mk5eStats(),
    pages: [
      {
        _id: pageId,
        name: fixMojibake(name),
        type: 'text',
        title: { show: true, level: 1 },
        text: { content: parts.join('\n'), format: 1 },
        sort: 0,
        ownership: { default: -1 },
        flags: {},
        _stats: mk5eStats(),
      },
    ],
  };
}

// ── Process all acts ───────────────────────────────────────────────

function main() {
  console.log('=== DS → 5e Skill Challenge Conversion ===\n');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const acts = [
    { dir: path.join(ACTS_ROOT, 'Svellheim-Act1', 'data', 'montage-tests'), label: 'Act 1' },
    { dir: path.join(ACTS_ROOT, 'Svellheim-Act2', 'data', 'montage-tests'), label: 'Act 2' },
    { dir: path.join(ACTS_ROOT, 'Svellheim-Act3', 'data', 'montage-tests'), label: 'Act 3' },
  ];

  let total = 0;
  for (const act of acts) {
    if (!fs.existsSync(act.dir)) {
      console.log(`  Skipping ${act.label} — dir not found: ${act.dir}`);
      continue;
    }
    const files = fs.readdirSync(act.dir).filter(f => f.endsWith('.json')).sort();
    for (const file of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(act.dir, file), 'utf8'));
        const journal = convertMontage(raw, act.label);
        const outFile = `sc-${file}`;
        fs.writeFileSync(path.join(OUT_DIR, outFile), JSON.stringify(journal, null, 2), 'utf8');
        total++;
      } catch (err) {
        console.error(`  ERROR converting ${file}: ${err.message}`);
      }
    }
    console.log(`  ${act.label}: ${files.length} montages converted`);
  }

  console.log(`\nTotal skill challenges: ${total}`);
}

main();
