const fs = require('fs');
const vm = require('vm');

const FILES = [
  'archive-entities-01.js','archive-entities-02.js','archive-entities-03.js','archive-entities-04.js','archive-entities-05.js'
];
const FREQUENCY_REASON = 'report frequency is a qualitative archive-derived profile and should be manually refined where strong external frequency evidence exists';
const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const uniq = values => [...new Set((values || []).map(text).filter(Boolean))];

function load(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const sandbox = { window: { __ARCHIVE_ENTITIES: [] }, console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename, timeout: 30000 });
  return sandbox.window.__ARCHIVE_ENTITIES;
}

function strongFrequencyEvidence(entity) {
  const cases = (entity.caseFiles || []).length;
  const reportPoints = (entity.mapPoints || []).filter(point => /modern|report|famous|case|encounter/i.test(`${text(point?.layer)} ${text(point?.sourceType)}`)).length;
  const timeline = (entity.timeline || []).filter(row => Array.isArray(row) && /sight|report|encounter|appar|attack|incident|case|witness|observ|record|haunt|claim|manifest|contact|abduct/i.test(`${text(row[0])} ${text(row[1])}`)).length;
  const corpus = [entity.modern, entity.history, entity.behaviorLong, ...(entity.deepSections || []).flatMap(s => s?.paragraphs || [])].map(text).join(' ');
  const explicit = /\b(?:frequently reported|numerous reports|many reports|recurring reports|widespread reports|rarely reported|very rare|extremely rare|few reports|isolated reports|historically common|regionally common|periodic reports|occasional reports)\b/i.test(corpus);
  return explicit || cases >= 1 || reportPoints >= 1 || timeline >= 2;
}

function reasonBucket(reason) {
  if (/weaknesses\/limitations/i.test(reason)) return 'weaknesses';
  if (/controversy derived from modern reception/i.test(reason)) return 'controversy';
  if (/famousSightings has fewer than two/i.test(reason)) return 'famousSightings';
  if (/famousSightings needs individual/i.test(reason)) return 'famousSightings';
  if (/scientific explanations need individual/i.test(reason)) return 'science';
  if (/geographical origin needs individual/i.test(reason)) return 'geography';
  if (/behavior derived from description/i.test(reason)) return 'behavior';
  if (/cultural significance derived from general history/i.test(reason)) return 'culture';
  return 'other';
}

const chunks = FILES.map(filename => ({ filename, entities: load(filename) }));
const summary = {
  generatedAt: new Date().toISOString(),
  totalEntities: 0,
  needsIndividualResearch: [],
  countsByReason: {},
  countsByField: {},
  reportFrequency: {
    status: 'complete-qualitative',
    note: 'Qualitative frequency is permitted by the dossier specification; strong/weak archive-evidence counts are retained as QA signals, not missing-field flags.',
    strongArchiveEvidence: 0,
    weakArchiveEvidence: 0,
    labelCounts: {}
  }
};

for (const chunk of chunks) {
  for (const entity of chunk.entities) {
    summary.totalEntities++;
    let reasons = uniq(entity.dossierFieldManualReview || []).filter(reason => reason !== FREQUENCY_REASON);
    const strongFrequency = strongFrequencyEvidence(entity);
    if (strongFrequency) summary.reportFrequency.strongArchiveEvidence++;
    else summary.reportFrequency.weakArchiveEvidence++;
    entity.dossierFieldManualReview = reasons;

    const label = text(entity.dossierFields?.reportFrequency?.label) || 'Unlabeled';
    summary.reportFrequency.labelCounts[label] = (summary.reportFrequency.labelCounts[label] || 0) + 1;

    if (reasons.length) {
      const fields = uniq(reasons.map(reasonBucket));
      summary.needsIndividualResearch.push({ id: entity.id, slug: entity.slug, name: entity.name, fields, reasons });
      for (const reason of reasons) summary.countsByReason[reason] = (summary.countsByReason[reason] || 0) + 1;
      for (const field of fields) summary.countsByField[field] = (summary.countsByField[field] || 0) + 1;
    }
  }
  const serialized = JSON.stringify(chunk.entities).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  fs.writeFileSync(chunk.filename, `window.__ARCHIVE_ENTITIES=window.__ARCHIVE_ENTITIES||[];window.__ARCHIVE_ENTITIES.push(...${serialized});\n`, 'utf8');
}

if (summary.totalEntities !== 913) throw new Error(`Expected 913 entities, found ${summary.totalEntities}`);
summary.uniqueEntitiesNeedingResearch = summary.needsIndividualResearch.length;
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/dossier-manual-review-summary.json', JSON.stringify(summary, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  totalEntities: summary.totalEntities,
  uniqueEntitiesNeedingResearch: summary.uniqueEntitiesNeedingResearch,
  countsByField: summary.countsByField,
  reportFrequency: summary.reportFrequency
}, null, 2));
