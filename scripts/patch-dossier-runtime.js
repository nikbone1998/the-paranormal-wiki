const fs = require('fs');

const filename = 'dossier-repair.js';
let source = fs.readFileSync(filename, 'utf8');

if (source.includes('function canonicalFieldsComplete(fields)')) {
  console.log('dossier-repair.js already preserves canonical dossierFields');
  process.exit(0);
}

const needle = `  function normalize(entity) {\n    const fields = {`;
if (!source.includes(needle)) {
  throw new Error('Could not locate normalize(entity) in dossier-repair.js');
}

const replacement = `  function canonicalFieldsComplete(fields) {\n    return !!(fields &&\n      Array.isArray(fields.famousSightings) && fields.famousSightings.length &&\n      Array.isArray(fields.behavior) && fields.behavior.length &&\n      Array.isArray(fields.weaknesses) && fields.weaknesses.length &&\n      Array.isArray(fields.culturalSignificance) && fields.culturalSignificance.length &&\n      Array.isArray(fields.scientificExplanations) && fields.scientificExplanations.length &&\n      Array.isArray(fields.hoaxesAndControversies) && fields.hoaxesAndControversies.length &&\n      fields.reportFrequency && meaningful(fields.reportFrequency.label) && meaningful(fields.reportFrequency.explanation) &&\n      Array.isArray(fields.geographicalOrigin) && fields.geographicalOrigin.length);\n  }\n\n  function exposeFieldAliases(entity, fields) {\n    entity.famousSightings = fields.famousSightings;\n    entity.behaviorProfile = fields.behavior;\n    entity.weaknessesProfile = fields.weaknesses;\n    entity.culturalSignificanceProfile = fields.culturalSignificance;\n    entity.scientificExplanationsProfile = fields.scientificExplanations;\n    entity.hoaxesAndControversies = fields.hoaxesAndControversies;\n    entity.reportFrequency = fields.reportFrequency;\n    entity.geographicalOrigin = fields.geographicalOrigin;\n  }\n\n  function normalize(entity) {\n    if (canonicalFieldsComplete(entity.dossierFields)) {\n      exposeFieldAliases(entity, entity.dossierFields);\n      return entity.dossierFields;\n    }\n\n    const fields = {`;
source = source.replace(needle, replacement);

const aliasNeedle = `    entity.dossierFields = fields;\n    entity.famousSightings = fields.famousSightings;\n    entity.behaviorProfile = fields.behavior;\n    entity.weaknessesProfile = fields.weaknesses;\n    entity.culturalSignificanceProfile = fields.culturalSignificance;\n    entity.scientificExplanationsProfile = fields.scientificExplanations;\n    entity.hoaxesAndControversies = fields.hoaxesAndControversies;\n    entity.reportFrequency = fields.reportFrequency;\n    entity.geographicalOrigin = fields.geographicalOrigin;\n    return fields;`;
const aliasReplacement = `    entity.dossierFields = fields;\n    exposeFieldAliases(entity, fields);\n    return fields;`;
if (!source.includes(aliasNeedle)) {
  throw new Error('Could not locate alias assignment block in dossier-repair.js');
}
source = source.replace(aliasNeedle, aliasReplacement);

fs.writeFileSync(filename, source, 'utf8');
console.log('Patched dossier-repair.js to preserve materialized canonical dossierFields.');
