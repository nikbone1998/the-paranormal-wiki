const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'index.html');
let html = fs.readFileSync(file, 'utf8');

const tag = '<script src="./dossier-repair.js?v=20260910-canonical-fields-live-1"></script>';
html = html.replace(/\n?<script\s+src=["']\.\/dossier-repair\.js[^"']*["']><\/script>\n?/gi, '\n');

const marker = '<!-- UNSEEN_EARTH_BODY_BEGIN -->';
if (!html.includes(marker)) throw new Error('UNSEEN_EARTH_BODY_BEGIN marker not found in index.html');

html = html.replace(marker, `${tag}\n\n${marker}`);
fs.writeFileSync(file, html);

const count = (html.match(/dossier-repair\.js/g) || []).length;
if (count !== 1) throw new Error(`Expected exactly one dossier-repair loader, found ${count}`);
console.log(`Direct dossier loader installed in index.html (${count} occurrence).`);
