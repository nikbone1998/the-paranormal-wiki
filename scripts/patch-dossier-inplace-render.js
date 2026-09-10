const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'dossier-repair.js');
let src = fs.readFileSync(file, 'utf8');

const old = `    organizeCore(app, [\n      appearanceBox,\n      behaviorBox,\n      sightingsBox,\n      abilitiesBox,\n      weaknessesBox,\n      geoBox,\n      frequencyBox,\n      cultureBox,\n      scienceBox,\n      controversyBox,\n      etymologyBox,\n      historyBox,\n      timelineBox\n    ]);\n\n    groupResearchNotes(app);`;

const replacement = `    // Keep the canonical dossier sections in the document positions created by\n    // entityPage(). Reparenting HTML table sections into a new <section> caused\n    // Chromium's table DOM normalization to detach the dossier content. The\n    // canonical fields are already written into these boxes above, so no move\n    // is necessary. This also preserves maps, history, sources, evidence tables,\n    // and the existing long-form research exactly where the base renderer puts them.`;

if (!src.includes(old)) throw new Error('Expected dossier reparenting block not found');
src = src.replace(old, replacement);
fs.writeFileSync(file, src);
console.log('Removed destructive dossier section reparenting; canonical fields now render in place.');
