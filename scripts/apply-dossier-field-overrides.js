const fs = require('fs');
const vm = require('vm');

const FILES = [
  'archive-entities-01.js',
  'archive-entities-02.js',
  'archive-entities-03.js',
  'archive-entities-04.js',
  'archive-entities-05.js'
];
const EXPECTED_TOTAL = 913;
const OVERRIDE_FILE = 'scripts/dossier-field-overrides.json';
const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function load(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const sandbox = { window: { __ARCHIVE_ENTITIES: [] }, console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename, timeout: 30000 });
  return sandbox.window.__ARCHIVE_ENTITIES;
}

function fieldReason(field, reason) {
  if (field === 'famousSightings') return /famousSightings/i.test(reason);
  if (field === 'weaknesses') return /weaknesses\/limitations/i.test(reason);
  if (field === 'hoaxesAndControversies') return /controversy derived|hoaxes\/controversies/i.test(reason);
  if (field === 'behavior') return /behavior derived/i.test(reason);
  if (field === 'culturalSignificance') return /cultural significance/i.test(reason);
  if (field === 'scientificExplanations') return /scientific explanations/i.test(reason);
  if (field === 'geographicalOrigin') return /geographical origin/i.test(reason);
  if (field === 'reportFrequency') return /report frequency/i.test(reason);
  return false;
}

function fieldOkay(field, value) {
  if (field === 'famousSightings') {
    return Array.isArray(value) && value.length >= 2 && value.every(item => text(item?.heading) && text(item?.detail));
  }
  if (field === 'reportFrequency') {
    return value && text(value.label) && text(value.explanation);
  }
  return Array.isArray(value) && value.length > 0 && value.some(item => text(item));
}

const overrides = JSON.parse(fs.readFileSync(OVERRIDE_FILE, 'utf8'));
const chunks = FILES.map(filename => ({ filename, entities: load(filename) }));
const all = chunks.flatMap(chunk => chunk.entities);
if (all.length !== EXPECTED_TOTAL) throw new Error(`Expected ${EXPECTED_TOTAL} entities, found ${all.length}`);

const bySlug = new Map(all.map(entity => [entity.slug, entity]));
const audit = {
  generatedAt: new Date().toISOString(),
  expectedEntities: EXPECTED_TOTAL,
  totalEntities: all.length,
  overrideEntitiesRequested: Object.keys(overrides).length,
  overrideEntitiesApplied: 0,
  fieldsApplied: {},
  missingSlugs: [],
  invalidFields: [],
  sourcesAttached: 0,
  identityPreserved: false
};
const before = all.map(entity => ({ id: entity.id, slug: entity.slug }));

for (const [slug, spec] of Object.entries(overrides)) {
  const entity = bySlug.get(slug);
  if (!entity) {
    audit.missingSlugs.push(slug);
    continue;
  }
  entity.dossierFields = entity.dossierFields || {};
  entity.dossierFieldProvenance = entity.dossierFieldProvenance || {};
  entity.dossierFieldSources = entity.dossierFieldSources || {};
  let touched = false;

  for (const [field, value] of Object.entries(spec.fields || {})) {
    if (!fieldOkay(field, value)) {
      audit.invalidFields.push({ slug, field });
      continue;
    }
    entity.dossierFields[field] = value;
    entity.dossierFieldProvenance[field] = ['targetedResearchOverride'];
    entity.dossierFieldSources[field] = (spec.sources?.[field] || []).map(source => ({
      title: text(source.title),
      url: text(source.url),
      note: text(source.note)
    })).filter(source => source.title || source.url || source.note);
    audit.sourcesAttached += entity.dossierFieldSources[field].length;
    entity.dossierFieldManualReview = (entity.dossierFieldManualReview || []).filter(reason => !fieldReason(field, reason));
    audit.fieldsApplied[field] = (audit.fieldsApplied[field] || 0) + 1;
    touched = true;
  }

  if (touched) {
    entity.dossierFieldVersion = 'canonical-dossier-fields-2026-09-10-v2-targeted';
    audit.overrideEntitiesApplied++;
  }
}

if (audit.missingSlugs.length || audit.invalidFields.length) {
  throw new Error(`Override audit failed before write: ${JSON.stringify(audit, null, 2)}`);
}

for (const chunk of chunks) {
  const serialized = JSON.stringify(chunk.entities).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  fs.writeFileSync(chunk.filename, `window.__ARCHIVE_ENTITIES=window.__ARCHIVE_ENTITIES||[];window.__ARCHIVE_ENTITIES.push(...${serialized});\n`, 'utf8');
}

const reloaded = FILES.flatMap(load);
const after = reloaded.map(entity => ({ id: entity.id, slug: entity.slug }));
audit.identityPreserved = before.length === after.length && before.every((row, index) => row.id === after[index].id && row.slug === after[index].slug);
if (!audit.identityPreserved || reloaded.length !== EXPECTED_TOTAL || new Set(after.map(x => x.id)).size !== EXPECTED_TOTAL || new Set(after.map(x => x.slug)).size !== EXPECTED_TOTAL) {
  throw new Error(`Identity audit failed after overrides: ${JSON.stringify(audit, null, 2)}`);
}

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/dossier-field-override-audit.json', JSON.stringify(audit, null, 2) + '\n');
console.log(JSON.stringify(audit, null, 2));
