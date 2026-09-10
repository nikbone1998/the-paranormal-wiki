const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'dossier-repair.js');
let src = fs.readFileSync(file, 'utf8');
const before = `  function directBoxes(app) {\n    return [...app.children].filter(node => node.matches?.('table.box'));\n  }`;
const after = `  function directBoxes(app) {\n    // Dossier boxes may be wrapped by later layout/UI layers; search the active entity\n    // subtree instead of assuming every box is an immediate #app child.\n    return [...app.querySelectorAll('table.box')];\n  }`;
if (!src.includes(before)) throw new Error('Expected directBoxes implementation not found');
src = src.replace(before, after);
if ((src.match(/querySelectorAll\('table\.box'\)/g) || []).length !== 1) throw new Error('Unexpected directBoxes patch count');
fs.writeFileSync(file, src);
console.log('Patched dossier section matching to support wrapped production boxes.');
