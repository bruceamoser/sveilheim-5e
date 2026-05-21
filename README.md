# Sveilheim: Era of Embers (D&D 5e)

A Foundry VTT module converting the complete **Era of Embers** campaign from Draw Steel to **D&D 5e**.

## Contents

| Pack | Count | Description |
|------|-------|-------------|
| Monsters | 58 | Draugr, Pale Maw, corrupted beasts, Grafvitnir boss stages |
| NPCs | 25 | Söldís, Kaelen, Lew, Gragnir, Harald, and more |
| Magic Items | 25 | Frost-Etched Barrow-Blade, Yggdrasil Sap Pendant, etc. |
| World Lore | 15 | Gazetteer, pantheon, calendar, languages, ancestry guide |
| Act 1 Journals | 2 | Beats 1–9: The Gathering (director + player) |
| Act 2 Journals | 3 | Beats 10–19: The Northern Road |
| Act 3 Journals | 2 | Beats 20–27: The Burning |
| Skill Challenges | 21 | Converted from Draw Steel montage tests |
| Social Encounters | 11 | Converted from Draw Steel negotiation tests |
| Downtime Reference | 1 | Crafting, research, and imbuing projects |

**Total: ~163 documents across 8 compendium packs.**

## Level Mapping

The campaign maps from Draw Steel levels 1–7 to 5e levels 1–15:

| DS Level | 5e Levels | Campaign Phase |
|----------|-----------|----------------|
| 1 | 1–2 | Act 1: Beats 1–3 |
| 2 | 3–4 | Act 1: Beats 4–6 |
| 3 | 5–7 | Act 1: Beats 7–9, Act 2: Beats 10–12 |
| 4 | 8–9 | Act 2: Beats 13–15 |
| 5 | 10–12 | Act 2: Beats 16–18, Act 3: Beats 20–22 |
| 6 | 13–14 | Act 3: Beats 23–25 |
| 7 | 15 | Act 3: Beats 26–27 (Grafvitnir) |

## Installation

1. Copy the `module/` directory to your Foundry VTT `Data/modules/sveilheim-5e/` folder
2. Enable the module in your dnd5e world
3. Access all content through the Compendium tab

## Building from Source

```bash
npm install
npm run convert:all   # Convert all Draw Steel data to 5e format
npm run build         # Compile LevelDB packs
npm run full          # Both steps
```

## Conversion Notes

- **Damage types:** corruption→necrotic, holy→radiant, sonic→thunder
- **Ancestries:** See the in-module "Svellheim Ancestry Guide" journal
- **Montage tests** → 5e skill challenges with DCs and skill mappings
- **Negotiation tests** → social encounters with attitude tracks and DCs
- **Draw Steel terms** are replaced: Stamina→HP, Edge→Advantage, Maneuver→Bonus Action, etc.