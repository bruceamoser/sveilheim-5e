#!/usr/bin/env node
/**
 * convert-negotiations.js
 *
 * Reads Draw Steel negotiation test JSONs from Svellheim-Act1/2/3
 * and outputs 5e social encounter JournalEntry JSONs.
 *
 * Usage: node tools/convert-negotiations.js
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  foundryId, slugify,
  replaceTerms, fixMojibake, mk5eStats,
} = require('./shared');

const REPO_ROOT = path.resolve(__dirname, '..');
const ACTS_ROOT = path.resolve(REPO_ROOT, '..');
const OUT_DIR = path.join(REPO_ROOT, 'data', 'journals', 'mechanics');

// ── Interest → 5e Attitude ─────────────────────────────────────────
function interestToAttitude(interest) {
  if (interest <= 1) return 'Hostile';
  if (interest <= 2) return 'Unfriendly';
  if (interest <= 3) return 'Indifferent';
  if (interest <= 4) return 'Friendly';
  return 'Helpful';
}

// ── Patience → DC modifier ─────────────────────────────────────────
function patienceToDC(patience) {
  if (patience <= 2) return 18;  // Very impatient — hard
  if (patience <= 3) return 15;  // Moderate patience
  if (patience <= 4) return 13;  // Patient
  return 10;                      // Very patient — easy
}

// ── Convert a single negotiation ────────────────────────────────────

function convertNegotiation(dsItem, actLabel) {
  const sys = dsItem.system || {};
  const name = sys.title || dsItem.name || 'Unnamed Negotiation';
  const slug = slugify(name);

  // Extract NPC data
  const participants = sys.participants || [];
  const npcStates = sys.npcStateByParticipantId || {};

  const parts = [];
  parts.push(`<h1>Social Encounter: ${fixMojibake(name)}</h1>`);
  parts.push(`<p><strong>Act:</strong> ${actLabel}</p>`);

  // Overview
  const overview = replaceTerms(fixMojibake(sys.setup?.overview || ''));
  if (overview) {
    parts.push(`<hr><h2>Setup</h2>${overview}`);
  }

  // NPC details
  for (const participant of participants) {
    if (participant.kind !== 'npc') continue;
    const state = npcStates[participant.id] || {};
    const interest = state.interest?.value ?? 3;
    const patience = state.patience?.value ?? 4;
    const attitude = interestToAttitude(interest);
    const dc = patienceToDC(patience);

    parts.push(`<hr><h2>${fixMojibake(participant.displayName || participant.id)}</h2>`);
    if (participant.role) parts.push(`<p><em>${fixMojibake(participant.role)}</em></p>`);
    if (participant.notesGM) parts.push(`<p>${replaceTerms(fixMojibake(participant.notesGM))}</p>`);

    parts.push(`<h3>Social Stats</h3>`);
    parts.push(`<ul>`);
    parts.push(`<li><strong>Starting Attitude:</strong> ${attitude}</li>`);
    parts.push(`<li><strong>Persuasion DC:</strong> ${dc}</li>`);
    parts.push(`<li><strong>Insight DC:</strong> ${dc - 2} (to read motivations/pitfalls)</li>`);
    parts.push(`</ul>`);

    // Motivations
    const motivations = state.motivations || [];
    if (motivations.length > 0) {
      parts.push(`<h3>Motivations (Appeal to These)</h3><ul>`);
      for (const m of motivations) {
        parts.push(`<li><strong>${fixMojibake(m.label)}:</strong> If the PCs appeal to this, they gain advantage on their next Persuasion or Deception check, or the DC is reduced by 2.</li>`);
      }
      parts.push(`</ul>`);
    }

    // Pitfalls
    const pitfalls = state.pitfalls || [];
    if (pitfalls.length > 0) {
      parts.push(`<h3>Pitfalls (Avoid These)</h3><ul>`);
      for (const p of pitfalls) {
        parts.push(`<li><strong>${fixMojibake(p.label)}:</strong> If the PCs trigger this, they have disadvantage on their next check, or the DC increases by 2.</li>`);
      }
      parts.push(`</ul>`);
    }
  }

  // Running the encounter
  parts.push(`<hr><h2>Running the Social Encounter</h2>`);
  parts.push(`<p>This social encounter uses a simple attitude track. The NPC starts at a given attitude. The PCs make Charisma checks (Persuasion, Deception, or Intimidation) against the listed DC to shift the NPC's attitude one step toward Helpful. Three shifts to Helpful = success. Dropping to Hostile = failure.</p>`);
  parts.push(`<p><strong>Key Skills:</strong> Persuasion, Deception, Intimidation, Insight (to discover motivations/pitfalls)</p>`);
  parts.push(`<p><strong>Each PC can attempt one check per round.</strong> A round represents roughly 1-2 minutes of in-character conversation.</p>`);

  // Outcomes
  const outcomes = sys.setup?.outcomes || {};
  if (outcomes.success || outcomes.partialSuccess || outcomes.failure) {
    parts.push(`<hr><h2>Outcomes</h2>`);
    if (outcomes.success) {
      parts.push(replaceTerms(fixMojibake(outcomes.success)));
    }
    if (outcomes.partialSuccess) {
      parts.push(replaceTerms(fixMojibake(outcomes.partialSuccess)));
    }
    if (outcomes.failure) {
      parts.push(replaceTerms(fixMojibake(outcomes.failure)));
    }
  }

  // Build journal entry
  const journalId = foundryId(`5e:neg:${slug}`);
  const pageId = foundryId(`5e:neg:page:${slug}`);

  return {
    _id: journalId,
    name: `Social Encounter: ${fixMojibake(name)}`,
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
  console.log('=== DS → 5e Social Encounter Conversion ===\n');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const acts = [
    { dir: path.join(ACTS_ROOT, 'Svellheim-Act1', 'data', 'negotiation-tests'), label: 'Act 1' },
    { dir: path.join(ACTS_ROOT, 'Svellheim-Act2', 'data', 'negotiation-tests'), label: 'Act 2' },
    { dir: path.join(ACTS_ROOT, 'Svellheim-Act3', 'data', 'negotiation-tests'), label: 'Act 3' },
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
        const journal = convertNegotiation(raw, act.label);
        const outFile = `se-${file}`;
        fs.writeFileSync(path.join(OUT_DIR, outFile), JSON.stringify(journal, null, 2), 'utf8');
        total++;
      } catch (err) {
        console.error(`  ERROR converting ${file}: ${err.message}`);
      }
    }
    console.log(`  ${act.label}: ${files.length} negotiations converted`);
  }

  console.log(`\nTotal social encounters: ${total}`);
}

main();
