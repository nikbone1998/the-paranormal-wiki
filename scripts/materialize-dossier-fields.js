const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ARCHIVE_FILES = [
  'archive-entities-01.js',
  'archive-entities-02.js',
  'archive-entities-03.js',
  'archive-entities-04.js',
  'archive-entities-05.js'
];
const EXPECTED_TOTAL = 913;
const VERSION = 'canonical-dossier-fields-2026-09-10-v1';
const PLACEHOLDER = /^(?:empty|null|n\/a|no data|unknown|-|not entered|none)$/i;
const REVIEW_ONLY = /\b(?:batch\s*\d+|archive review|research completed|staged|canonical ledger|completion pass|entity-specific review replaces|source-control review)\b/i;
const FICTION_FLAG = /\b(?:original archive fiction|fictional archive entry|created for the unseen archive|not claimed to be historical folklore|archive-created fictional record)\b/i;
const GENERIC_CONTROVERSY = /source-control issue|later retellings can merge|standardized profile|source labels visible|category error/i;
const GENERIC_PROTECTION = /traditional protective practices vary|ordinary safety measures|emergency services|not presented as scientifically proven defenses|no .* operationalized|no child labeling|medical substitution/i;

const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const meaningful = value => {
  const s = text(value);
  return !!s && !PLACEHOLDER.test(s);
};
const clean = value => text(value)
  .replace(/\bAI-generated imagery\b/gi, 'synthetic imagery')
  .replace(/\bAI-generated pictures\b/gi, 'synthetic pictures')
  .replace(/\bAI-generated\b/gi, 'synthetic');
const uniq = values => {
  const out = [];
  const seen = new Set();
  for (const raw of values.flat(Infinity)) {
    const value = clean(raw);
    if (!meaningful(value)) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
};
const usableParagraph = value => {
  const s = clean(value);
  return meaningful(s) && !REVIEW_ONLY.test(s) && !FICTION_FLAG.test(s);
};

function loadChunk(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const sandbox = { window: { __ARCHIVE_ENTITIES: [] }, console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename, timeout: 30000 });
  if (!Array.isArray(sandbox.window.__ARCHIVE_ENTITIES)) throw new Error(`${filename}: archive array not created`);
  return sandbox.window.__ARCHIVE_ENTITIES;
}

function deepParagraphs(entity, pattern, limit = 3) {
  const out = [];
  for (const section of entity.deepSections || []) {
    const title = text(section?.title);
    const paragraphs = (section?.paragraphs || []).map(clean).filter(usableParagraph);
    if (!pattern.test(title + ' ' + paragraphs.join(' '))) continue;
    for (const paragraph of paragraphs) {
      out.push(paragraph);
      if (out.length >= limit) return uniq(out);
    }
  }
  return uniq(out);
}

function timelineRows(entity) {
  return (entity.timeline || [])
    .filter(row => Array.isArray(row) && row.length >= 2)
    .map(row => ({ date: text(row[0]), detail: clean(row[1]), source: text(row[2]) }))
    .filter(row => usableParagraph(row.detail))
    .filter(row => !/^internet era$/i.test(row.date))
    .filter(row => !/^2026-09-0[1-9]$/.test(row.date));
}

function reportTimeline(entity) {
  const rows = timelineRows(entity);
  const specific = rows.filter(row => /\b(?:sight|report|encounter|appar|attack|incident|case|witness|observ|record|haunt|claim|knock|event|manifest|contact|abduct|photograph|film|footage)\w*\b/i.test(row.detail + ' ' + row.date));
  return (specific.length ? specific : rows).slice(-6);
}

function locationNames(entity) {
  return uniq([
    ...(entity.locations || []),
    ...(entity.mapPoints || []).map(point => point?.label),
    entity.country,
    entity.origin
  ]).slice(0, 8);
}

function buildFamousSightings(entity, provenance, review) {
  const items = [];
  for (const c of entity.caseFiles || []) {
    const heading = [text(c.case), text(c.date), text(c.location)].filter(Boolean).join(' — ');
    const detail = uniq([c.notes, c.evidence, c.alternatives].filter(usableParagraph))[0] || '';
    if (heading || detail) items.push({ heading: heading || 'Recorded case', detail });
    if (items.length >= 5) break;
  }
  if (items.length) provenance.famousSightings.push('caseFiles');

  if (items.length < 5) {
    for (const p of entity.mapPoints || []) {
      const descriptor = `${text(p.layer)} ${text(p.sourceType)}`;
      if (!/modern|famous|historical|case|report|encounter|event/i.test(descriptor)) continue;
      const heading = text(p.label) || 'Associated report location';
      const detail = uniq([p.why, [p.earliest, p.recent].filter(Boolean).join(' – ')].filter(usableParagraph))[0] || '';
      if (!items.some(item => item.heading.toLowerCase() === heading.toLowerCase())) items.push({ heading, detail });
      if (items.length >= 5) break;
    }
    if (items.length) provenance.famousSightings.push('mapPoints');
  }

  if (items.length < 3) {
    for (const row of reportTimeline(entity)) {
      const heading = row.date || 'Recorded tradition';
      if (!items.some(item => (item.detail || '').toLowerCase() === row.detail.toLowerCase())) items.push({ heading, detail: row.detail });
      if (items.length >= 5) break;
    }
    if (items.length) provenance.famousSightings.push('timeline');
  }

  if (items.length < 2) {
    const deep = deepParagraphs(entity, /\b(?:sighting|report|case|encounter|incident|witness|appearance|episode|story|account|haunt|manifestation)\b/i, 3);
    deep.forEach((detail, index) => {
      if (items.length < 5) items.push({ heading: index ? 'Associated account or tradition' : 'Notable account or tradition', detail });
    });
    if (deep.length) provenance.famousSightings.push('deepSections');
  }

  if (!items.length) {
    const detail = uniq([entity.history, entity.description].filter(usableParagraph))[0] || `${entity.name} is primarily preserved through the traditions and source history associated with ${entity.origin || entity.country || 'its recorded region'}.`;
    items.push({ heading: 'Best-known report tradition', detail });
    review.push('famousSightings needs individual case-level research');
    provenance.famousSightings.push('fallback');
  } else if (items.length < 2) {
    review.push('famousSightings has fewer than two specific items');
  }

  return items.slice(0, 5);
}

function buildBehavior(entity, provenance, review) {
  const direct = usableParagraph(entity.behaviorLong) ? [entity.behaviorLong] : [];
  const deep = deepParagraphs(entity, /\b(?:behavior|behaviour|hunt|stalk|attack|encounter|movement|nocturnal|mimic|communication|manifest|return|visit|pursu|territor|avoid|feed|travel)\w*\b/i, 2);
  if (direct.length) provenance.behavior.push('behaviorLong');
  if (deep.length) provenance.behavior.push('deepSections');
  let values = uniq([direct, deep]);
  if (!values.length) {
    values = uniq([entity.description, entity.appearance].filter(usableParagraph));
    provenance.behavior.push('descriptionFallback');
    review.push('behavior derived from description rather than dedicated behavior material');
  }
  return values.slice(0, 3);
}

function buildWeaknesses(entity, provenance, review) {
  const deep = deepParagraphs(entity, /\b(?:weakness|vulnerab|protection|protective|ward|repel|banish|deterr|limit|avoid|iron|salt|sunlight|daylight|fire|water|prayer|ritual|sacred|talisman|amulet|plant|herb|boundary|taboo)\w*\b/i, 3);
  const values = [];
  if (deep.length) {
    values.push(...deep);
    provenance.weaknesses.push('deepSections');
  }
  if (usableParagraph(entity.protection) && !GENERIC_PROTECTION.test(text(entity.protection))) {
    values.unshift(clean(entity.protection));
    provenance.weaknesses.push('protection');
  }
  const result = uniq(values).slice(0, 3);
  if (result.length) return result;

  provenance.weaknesses.push('fallback');
  review.push('weaknesses/limitations need individual tradition-specific research');
  return [`No single universal weakness is consistently described for ${entity.name}; limitations and protective practices differ by source, region, and telling.`];
}

function buildCulture(entity, provenance, review) {
  const values = [];
  if (usableParagraph(entity.culture)) {
    values.push(clean(entity.culture));
    provenance.culturalSignificance.push('culture');
  }
  const deep = deepParagraphs(entity, /\b(?:cultur|religio|ritual|folklore|myth|tradition|literature|literary|film|television|symbol|identity|reception|festival|oral|belief|popular culture)\w*\b/i, 2);
  if (deep.length) {
    values.push(...deep);
    provenance.culturalSignificance.push('deepSections');
  }
  let result = uniq(values).slice(0, 3);
  if (!result.length) {
    result = uniq([entity.history, entity.description].filter(usableParagraph)).slice(0, 2);
    provenance.culturalSignificance.push('historyFallback');
    review.push('cultural significance derived from general history');
  }
  return result;
}

function buildScience(entity, provenance, review) {
  const values = [];
  if (usableParagraph(entity.skeptical)) {
    values.push(clean(entity.skeptical));
    provenance.scientificExplanations.push('skeptical');
  }
  const deep = deepParagraphs(entity, /\b(?:scient|skeptic|natural|psycholog|medical|misident|pareidolia|sleep|hallucin|memory|infrasound|atmospher|geolog|animal|camera|optical|astronom|weather|disease|fraud|hoax|neurolog|perception)\w*\b/i, 2);
  if (deep.length) {
    values.push(...deep);
    provenance.scientificExplanations.push('deepSections');
  }
  const result = uniq(values).slice(0, 3);
  if (result.length) return result;

  provenance.scientificExplanations.push('fallback');
  review.push('scientific explanations need individual research');
  return [`Conventional explanations for reports associated with ${entity.name} depend on the circumstances of each encounter, including perception, environment, cultural transmission, and possible misidentification.`];
}

function buildControversy(entity, provenance, review) {
  const values = [];
  const deep = deepParagraphs(entity, /\b(?:hoax|controvers|disput|debunk|fraud|misident|confession|forg|commercial|contradict|credib|fabricat|exaggerat|skeptic)\w*\b/i, 3);
  if (deep.length) {
    values.push(...deep);
    provenance.hoaxesAndControversies.push('deepSections');
  }
  if (usableParagraph(entity.controversy) && !GENERIC_CONTROVERSY.test(text(entity.controversy))) {
    values.push(clean(entity.controversy));
    provenance.hoaxesAndControversies.push('controversy');
  }
  const result = uniq(values).slice(0, 3);
  if (result.length) return result;

  if (usableParagraph(entity.modern) && !REVIEW_ONLY.test(text(entity.modern))) {
    provenance.hoaxesAndControversies.push('modernFallback');
    review.push('controversy derived from modern reception material');
    return [clean(entity.modern)];
  }

  provenance.hoaxesAndControversies.push('fallback');
  review.push('hoaxes/controversies need individual research');
  return [`The principal controversy around ${entity.name} concerns how reports are interpreted, repeated, and separated from later embellishment, misidentification, or deliberate fabrication.`];
}

function buildGeography(entity, provenance, review) {
  const origin = text(entity.origin);
  const country = text(entity.country);
  const descriptor = text(entity.descriptor);
  const values = [];
  if (meaningful(origin)) {
    let lead = origin;
    if (meaningful(country) && country.toLowerCase() !== origin.toLowerCase() && !origin.toLowerCase().includes(country.toLowerCase()) && !country.toLowerCase().includes(origin.toLowerCase())) lead += ` (${country})`;
    if (meaningful(descriptor) && !lead.toLowerCase().includes(descriptor.toLowerCase())) lead += `. ${descriptor}.`;
    values.push(lead);
    provenance.geographicalOrigin.push('origin/country');
  } else if (meaningful(country)) {
    values.push(country);
    provenance.geographicalOrigin.push('country');
  }

  const locations = locationNames(entity).filter(loc => ![origin.toLowerCase(), country.toLowerCase()].includes(loc.toLowerCase())).slice(0, 5);
  if (locations.length) {
    values.push(`Key associated locations or regional traditions include ${locations.join('; ')}.`);
    provenance.geographicalOrigin.push('locations/mapPoints');
  }
  const deep = deepParagraphs(entity, /\b(?:geograph|region|location|range|distribution|origin|homeland|island|valley|forest|mountain|river|country|province|state)\w*\b/i, 1);
  if (deep.length) {
    values.push(...deep);
    provenance.geographicalOrigin.push('deepSections');
  }

  const result = uniq(values).slice(0, 3);
  if (result.length) return result;
  review.push('geographical origin needs individual research');
  provenance.geographicalOrigin.push('fallback');
  return [`The strongest surviving geographic association for ${entity.name} is the region identified by its attached source tradition and case material.`];
}

function buildFrequency(entity, provenance, review) {
  const caseCount = (entity.caseFiles || []).length;
  const reportPoints = (entity.mapPoints || []).filter(point => /modern|report|famous|case|encounter/i.test(`${text(point.layer)} ${text(point.sourceType)}`)).length;
  const timelineCount = reportTimeline(entity).length;
  const corpus = [entity.modern, entity.history, ...(entity.deepSections || []).flatMap(section => section?.paragraphs || [])].map(text).join(' ');
  const worldwide = /worldwide|global traditions|global/i.test(`${text(entity.origin)} ${text(entity.country)}`);
  let label;

  if (/\b(?:very common|widespread reports|frequently reported|numerous reports|many reports|recurring reports)\b/i.test(corpus)) label = worldwide ? 'Widely reported' : 'Frequently reported / recurring';
  else if (/\b(?:rarely reported|very rare|extremely rare|few reports|isolated reports)\b/i.test(corpus)) label = 'Rare';
  else if (worldwide && (caseCount + reportPoints + timelineCount >= 3)) label = 'Widely reported';
  else if (caseCount >= 4 || reportPoints >= 4) label = 'Frequently reported / recurring';
  else if (caseCount >= 2 || reportPoints >= 2 || timelineCount >= 5) label = 'Recurring';
  else if (caseCount || reportPoints || timelineCount >= 2) label = 'Occasional';
  else if (['F', 'R'].includes(entity.sourceCode)) label = 'Tradition-based; modern reports vary';
  else if (Number(entity.rarity) >= 8) label = 'Rare';
  else label = 'Occasional to rare';

  const locs = locationNames(entity).slice(0, 3);
  const parts = [];
  if (caseCount) parts.push(`This dossier retains ${caseCount} named case ${caseCount === 1 ? 'file' : 'files'}`);
  if (reportPoints) parts.push(`${reportPoints} report or case ${reportPoints === 1 ? 'location is' : 'locations are'} mapped`);
  if (!caseCount && !reportPoints && timelineCount) parts.push(`the chronology retains ${timelineCount} report-relevant historical or cultural ${timelineCount === 1 ? 'entry' : 'entries'}`);
  if (locs.length) parts.push(`the strongest geographic associations are ${locs.join(', ')}`);
  const explanation = parts.length
    ? `${parts.join('; ')}. The frequency label is qualitative because surviving reports and source coverage are uneven.`
    : `The surviving material is qualitative rather than a complete sighting census, so frequency is presented as a broad archive profile rather than an exact count.`;

  provenance.reportFrequency.push('caseFiles/mapPoints/timeline/rarity');
  review.push('report frequency is a qualitative archive-derived profile and should be manually refined where strong external frequency evidence exists');
  return { label, explanation };
}

function normalizeEntity(entity) {
  const provenance = {
    famousSightings: [], behavior: [], weaknesses: [], culturalSignificance: [],
    scientificExplanations: [], hoaxesAndControversies: [], reportFrequency: [], geographicalOrigin: []
  };
  const review = [];
  const fields = {
    famousSightings: buildFamousSightings(entity, provenance, review),
    behavior: buildBehavior(entity, provenance, review),
    weaknesses: buildWeaknesses(entity, provenance, review),
    culturalSignificance: buildCulture(entity, provenance, review),
    scientificExplanations: buildScience(entity, provenance, review),
    hoaxesAndControversies: buildControversy(entity, provenance, review),
    reportFrequency: buildFrequency(entity, provenance, review),
    geographicalOrigin: buildGeography(entity, provenance, review)
  };

  entity.dossierFields = fields;
  entity.dossierFieldVersion = VERSION;
  entity.dossierFieldProvenance = provenance;
  entity.dossierFieldManualReview = uniq(review);
  return fields;
}

function fieldOkay(value) {
  if (Array.isArray(value)) return value.length > 0 && value.some(item => meaningful(typeof item === 'object' ? `${item.heading || ''} ${item.detail || ''}` : item));
  if (value && typeof value === 'object') return meaningful(value.label) && meaningful(value.explanation);
  return meaningful(value);
}

const baseline = [];
const chunks = [];
for (const filename of ARCHIVE_FILES) {
  const entities = loadChunk(filename);
  chunks.push({ filename, entities });
  for (const entity of entities) baseline.push({ id: entity.id, slug: entity.slug, file: filename });
}

if (baseline.length !== EXPECTED_TOTAL) throw new Error(`Expected ${EXPECTED_TOTAL} entities before migration, found ${baseline.length}`);
if (new Set(baseline.map(row => row.id)).size !== EXPECTED_TOTAL) throw new Error('Duplicate IDs exist before migration');
if (new Set(baseline.map(row => row.slug)).size !== EXPECTED_TOTAL) throw new Error('Duplicate slugs exist before migration');

const audit = {
  version: VERSION,
  generatedAt: new Date().toISOString(),
  totalEntities: 0,
  expectedEntities: EXPECTED_TOTAL,
  fileCounts: {},
  fieldCounts: {
    famousSightings: 0, behavior: 0, weaknesses: 0, culturalSignificance: 0,
    scientificExplanations: 0, hoaxesAndControversies: 0, reportFrequency: 0, geographicalOrigin: 0
  },
  manualReviewEntities: [],
  manualReviewReasonCounts: {},
  genericFallbackCounts: { famousSightings: 0, behavior: 0, weaknesses: 0, culturalSignificance: 0, scientificExplanations: 0, hoaxesAndControversies: 0, reportFrequency: 0, geographicalOrigin: 0 },
  duplicateIds: [],
  duplicateSlugs: [],
  identityPreserved: false,
  allEightFieldsPresent: false
};

for (const chunk of chunks) {
  for (const entity of chunk.entities) {
    const fields = normalizeEntity(entity);
    audit.totalEntities += 1;
    for (const key of Object.keys(audit.fieldCounts)) if (fieldOkay(fields[key])) audit.fieldCounts[key] += 1;
    for (const [key, sources] of Object.entries(entity.dossierFieldProvenance || {})) if (sources.includes('fallback') || sources.includes('descriptionFallback') || sources.includes('historyFallback') || sources.includes('modernFallback')) audit.genericFallbackCounts[key] += 1;
    if ((entity.dossierFieldManualReview || []).length) {
      audit.manualReviewEntities.push({ id: entity.id, slug: entity.slug, name: entity.name, reasons: entity.dossierFieldManualReview });
      for (const reason of entity.dossierFieldManualReview) audit.manualReviewReasonCounts[reason] = (audit.manualReviewReasonCounts[reason] || 0) + 1;
    }
  }
  audit.fileCounts[chunk.filename] = chunk.entities.length;
  const serialized = JSON.stringify(chunk.entities).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const source = `window.__ARCHIVE_ENTITIES=window.__ARCHIVE_ENTITIES||[];window.__ARCHIVE_ENTITIES.push(...${serialized});\n`;
  fs.writeFileSync(chunk.filename, source, 'utf8');
}

const after = [];
for (const filename of ARCHIVE_FILES) {
  const entities = loadChunk(filename);
  for (const entity of entities) after.push({ id: entity.id, slug: entity.slug, file: filename, entity });
}

const ids = new Set();
const slugs = new Set();
for (const row of after) {
  if (ids.has(row.id)) audit.duplicateIds.push(row.id); else ids.add(row.id);
  if (slugs.has(row.slug)) audit.duplicateSlugs.push(row.slug); else slugs.add(row.slug);
}

audit.identityPreserved = baseline.length === after.length && baseline.every((row, index) => row.id === after[index].id && row.slug === after[index].slug && row.file === after[index].file);
audit.allEightFieldsPresent = after.length === EXPECTED_TOTAL && Object.values(audit.fieldCounts).every(count => count === EXPECTED_TOTAL) && audit.duplicateIds.length === 0 && audit.duplicateSlugs.length === 0 && audit.identityPreserved;

if (!audit.allEightFieldsPresent) throw new Error(`Canonical dossier-field audit failed: ${JSON.stringify(audit, null, 2)}`);

fs.mkdirSync(path.join('reports'), { recursive: true });
fs.writeFileSync(path.join('reports', 'canonical-dossier-field-audit.json'), JSON.stringify(audit, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ totalEntities: audit.totalEntities, fieldCounts: audit.fieldCounts, manualReviewEntities: audit.manualReviewEntities.length, genericFallbackCounts: audit.genericFallbackCounts, identityPreserved: audit.identityPreserved, allEightFieldsPresent: audit.allEightFieldsPresent }, null, 2));
