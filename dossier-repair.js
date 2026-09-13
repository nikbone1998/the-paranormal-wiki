/* THE PARANORMAL WIKI — archive-wide dossier field repair + shared dossier UI.
 * Centralized enrichment layer: preserves the 913 canonical entity records and
 * derives public quick-reference fields from each record's existing research.
 */
(() => {
  'use strict';

  const records = Array.isArray(window.__ARCHIVE_ENTITIES) ? window.__ARCHIVE_ENTITIES : [];
  if (!records.length) return;

  const PLACEHOLDER = /^(?:empty|null|n\/a|no data|unknown|-|not entered|none)$/i;
  const REVIEW_ONLY = /\b(?:batch\s*\d+|archive review|research completed|staged|canonical ledger|completion pass|entity-specific review|placeholder|source-control review)\b/i;
  const FICTION_FLAG = /\b(?:original archive fiction|fictional archive entry|created for the unseen archive|not claimed to be historical folklore|archive-created fictional record)\b/i;

  const html = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  const meaningful = value => {
    const s = text(value);
    return !!s && !PLACEHOLDER.test(s);
  };

  const uniq = values => {
    const seen = new Set();
    return values.map(text).filter(Boolean).filter(value => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const paragraphsFor = (entity, pattern, limit = 2) => {
    const out = [];
    for (const section of entity.deepSections || []) {
      const title = text(section?.title);
      const body = (section?.paragraphs || []).map(text).filter(Boolean);
      if (!pattern.test(title + ' ' + body.join(' '))) continue;
      for (const paragraph of body) {
        if (REVIEW_ONLY.test(paragraph) || FICTION_FLAG.test(paragraph)) continue;
        out.push(paragraph);
        if (out.length >= limit) return uniq(out);
      }
    }
    return uniq(out);
  };

  const trimmedBase = value => {
    const s = text(value);
    if (!meaningful(s)) return '';
    return s
      .replace(/\bAI-generated\b/gi, 'synthetic')
      .replace(/\bAI image(?:ry)?\b/gi, 'synthetic imagery');
  };

  const candidateParagraphs = (...values) =>
    uniq(values.flat(Infinity).map(trimmedBase).filter(meaningful));

  const timelineCandidates = entity => (entity.timeline || [])
    .filter(row => Array.isArray(row) && row.length >= 2)
    .map(row => ({ date: text(row[0]), detail: text(row[1]), source: text(row[2]) }))
    .filter(row => meaningful(row.detail) && !REVIEW_ONLY.test(row.detail))
    .filter(row => !/^internet era$/i.test(row.date))
    .slice(-8);

  const reportLikeTimeline = entity => {
    const specific = timelineCandidates(entity).filter(row =>
      /\b(?:sight|report|encounter|appar|attack|incident|case|witness|observ|record|haunt|claim|knock|event|manifest|contact|abduct|photograph|film|footage)\w*\b/i
        .test(row.detail + ' ' + row.date)
    );
    return (specific.length ? specific : timelineCandidates(entity)).slice(-5);
  };

  const locationNames = entity => uniq([
    ...(entity.locations || []),
    ...(entity.mapPoints || []).map(point => point?.label),
    entity.country
  ].filter(meaningful)).slice(0, 6);

  function buildFamousSightings(entity) {
    const items = [];
    for (const c of entity.caseFiles || []) {
      const heading = [text(c.case), text(c.date), text(c.location)].filter(Boolean).join(' — ');
      const detail = candidateParagraphs(c.notes, c.evidence, c.alternatives)[0] || '';
      if (heading || detail) items.push({ heading: heading || 'Recorded case', detail });
      if (items.length >= 5) break;
    }

    if (items.length < 5) {
      for (const p of entity.mapPoints || []) {
        const layer = text(p.layer);
        if (!/modern|famous|historical|case|report/i.test(layer + ' ' + text(p.sourceType))) continue;
        const heading = text(p.label) || 'Associated report location';
        const detail = candidateParagraphs(p.why, [p.earliest, p.recent].filter(Boolean).join(' – '))[0] || '';
        if (!items.some(item => item.heading.toLowerCase() === heading.toLowerCase())) items.push({ heading, detail });
        if (items.length >= 5) break;
      }
    }

    if (items.length < 3) {
      for (const row of reportLikeTimeline(entity)) {
        const heading = row.date || 'Recorded tradition';
        const detail = row.detail;
        if (!items.some(item => (item.detail || '').toLowerCase() === detail.toLowerCase())) items.push({ heading, detail });
        if (items.length >= 5) break;
      }
    }

    if (items.length < 2) {
      const deep = paragraphsFor(entity, /\b(?:sighting|report|case|encounter|incident|witness|appearance|episode|story|account|reception|literary)\b/i, 3);
      deep.forEach((detail, i) => {
        if (items.length < 5) items.push({ heading: i ? 'Associated account' : 'Notable account or tradition', detail });
      });
    }

    if (!items.length) {
      const detail = candidateParagraphs(entity.history, entity.description)[0] ||
        `${entity.name} is primarily preserved through the traditions and source history associated with ${entity.origin || entity.country || 'its recorded region'}.`;
      items.push({ heading: 'Best-known report tradition', detail });
    }

    return items.slice(0, 5);
  }

  function buildBehavior(entity) {
    const deep = paragraphsFor(entity, /\b(?:behavior|behaviour|hunt|stalk|attack|encounter|movement|nocturnal|mimic|communication|manifest|return|visit|pursu|territor)\w*\b/i, 2);
    const base = candidateParagraphs(entity.behaviorLong);
    let values = candidateParagraphs(base, deep);
    if (!values.length) values = candidateParagraphs(entity.description, entity.appearance);
    return values.slice(0, 3);
  }

  function protectionIsGeneric(value) {
    const s = text(value);
    return !s || /traditional protective practices vary|ordinary safety measures|emergency services|no .* operationalized|no child labeling|medical substitution|not operationalized/i.test(s);
  }

  function buildWeaknesses(entity) {
    const deep = paragraphsFor(entity,
      /\b(?:weakness|vulnerab|protection|protective|ward|repel|banish|deterr|limit|avoid|iron|salt|sunlight|daylight|fire|water|prayer|ritual|sacred|talisman|amulet|iyi-uwa)\w*\b/i, 3);
    const values = [];
    if (!protectionIsGeneric(entity.protection)) values.push(trimmedBase(entity.protection));
    values.push(...deep);
    const deduped = uniq(values);
    if (deduped.length) return deduped.slice(0, 3);

    const contextual = candidateParagraphs(entity.protection);
    if (contextual.length && !FICTION_FLAG.test(contextual[0])) {
      return [
        `No single universal weakness is consistently described across the surviving traditions for ${entity.name}.`,
        contextual[0]
      ];
    }
    return [
      `No single universal weakness is consistently described for ${entity.name}; reported limitations and protective practices vary by source, region, and telling.`
    ];
  }

  function buildCulture(entity) {
    const deep = paragraphsFor(entity,
      /\b(?:cultur|religio|ritual|folklore|myth|tradition|literature|literary|film|television|symbol|identity|reception|festival|oral|belief)\w*\b/i, 2);
    let values = candidateParagraphs(entity.culture, deep);
    if (!values.length) values = candidateParagraphs(entity.history, entity.description);
    return values.slice(0, 3);
  }

  function buildScience(entity) {
    const deep = paragraphsFor(entity,
      /\b(?:scient|skeptic|natural|psycholog|medical|misident|pareidolia|sleep|hallucin|memory|infrasound|atmospher|geolog|animal|camera|optical|astronom|weather|disease|sickle|fraud|hoax)\w*\b/i, 2);
    let values = candidateParagraphs(entity.skeptical, deep);
    if (!values.length) values = [
      `Explanations for reports associated with ${entity.name} depend on the circumstances of individual encounters, including perception, environment, cultural transmission, and possible misidentification.`
    ];
    return values.slice(0, 3);
  }

  function buildControversy(entity) {
    const deep = paragraphsFor(entity,
      /\b(?:hoax|controvers|disput|debunk|fraud|misident|confession|forg|commercial|category error|source-control|standardiz|contradict|reception)\w*\b/i, 2);
    let values = candidateParagraphs(entity.controversy, deep);
    if (!values.length) {
      const modern = trimmedBase(entity.modern);
      values = modern ? [modern] : [
        `The main controversy surrounding ${entity.name} concerns how reports are interpreted, repeated, and separated from later embellishment or misidentification.`
      ];
    }
    return values.slice(0, 3);
  }

  function buildGeography(entity) {
    const origin = text(entity.origin);
    const country = text(entity.country);
    const descriptor = text(entity.descriptor);
    const locations = locationNames(entity).filter(loc =>
      ![origin.toLowerCase(), country.toLowerCase()].includes(loc.toLowerCase())
    );
    const values = [];

    if (meaningful(origin)) {
      let lead = origin;
      if (meaningful(country) && country.toLowerCase() !== origin.toLowerCase() &&
          !origin.toLowerCase().includes(country.toLowerCase()) &&
          !country.toLowerCase().includes(origin.toLowerCase())) {
        lead += ` (${country})`;
      }
      if (meaningful(descriptor) && !lead.toLowerCase().includes(descriptor.toLowerCase())) lead += `. ${descriptor}.`;
      values.push(lead);
    } else if (meaningful(country)) {
      values.push(country);
    }

    if (locations.length) values.push(`Key associated locations and regional traditions include ${locations.join('; ')}.`);
    const deep = paragraphsFor(entity, /\b(?:geograph|region|location|range|distribution|origin|homeland|island|valley|forest|mountain|river|country)\w*\b/i, 1);
    values.push(...deep);

    const result = uniq(values).slice(0, 3);
    return result.length ? result :
      [`The strongest surviving geographic association for ${entity.name} is the region identified in its source tradition and attached case material.`];
  }

  function buildFrequency(entity) {
    const cases = (entity.caseFiles || []).length;
    const points = entity.mapPoints || [];
    const modernPoints = points.filter(point => /modern|report|famous|case/i.test(text(point.layer) + ' ' + text(point.sourceType))).length;
    const timeline = reportLikeTimeline(entity).length;
    const worldwide = /worldwide|global/i.test(text(entity.origin) + ' ' + text(entity.country));
    let label;

    if (worldwide && (cases + modernPoints + timeline >= 3)) label = 'Widely reported';
    else if (cases >= 4 || modernPoints >= 4) label = 'Frequently reported / recurring';
    else if (cases >= 2 || modernPoints >= 2 || timeline >= 5) label = 'Recurring';
    else if (cases || modernPoints || timeline >= 2) label = 'Occasional';
    else if (['F', 'R'].includes(entity.sourceCode)) label = 'Tradition-based; modern reports vary';
    else if (Number(entity.rarity) >= 8) label = 'Rare';
    else label = 'Occasional to rare';

    const locs = locationNames(entity).slice(0, 3);
    const detailParts = [];
    if (cases) detailParts.push(`${cases} named case ${cases === 1 ? 'file is' : 'files are'} retained in this dossier`);
    if (modernPoints) detailParts.push(`${modernPoints} report/case ${modernPoints === 1 ? 'location is' : 'locations are'} mapped`);
    if (!cases && !modernPoints && timeline) detailParts.push(`the chronology preserves ${timeline} report-relevant historical or cultural ${timeline === 1 ? 'entry' : 'entries'}`);
    if (locs.length) detailParts.push(`activity and tradition are most strongly associated with ${locs.join(', ')}`);

    const explanation = detailParts.length
      ? `${detailParts.join('; ')}. The profile is qualitative because surviving reports and source coverage are uneven.`
      : `The surviving material is qualitative rather than a complete sighting census, so frequency is best read as a broad archive profile rather than an exact count.`;

    return { label, explanation };
  }

  function canonicalFieldsComplete(fields) {
    return !!(fields &&
      Array.isArray(fields.famousSightings) && fields.famousSightings.length &&
      Array.isArray(fields.behavior) && fields.behavior.length &&
      Array.isArray(fields.weaknesses) && fields.weaknesses.length &&
      Array.isArray(fields.culturalSignificance) && fields.culturalSignificance.length &&
      Array.isArray(fields.scientificExplanations) && fields.scientificExplanations.length &&
      Array.isArray(fields.hoaxesAndControversies) && fields.hoaxesAndControversies.length &&
      fields.reportFrequency && meaningful(fields.reportFrequency.label) && meaningful(fields.reportFrequency.explanation) &&
      Array.isArray(fields.geographicalOrigin) && fields.geographicalOrigin.length);
  }

  function exposeFieldAliases(entity, fields) {
    entity.famousSightings = fields.famousSightings;
    entity.behaviorProfile = fields.behavior;
    entity.weaknessesProfile = fields.weaknesses;
    entity.culturalSignificanceProfile = fields.culturalSignificance;
    entity.scientificExplanationsProfile = fields.scientificExplanations;
    entity.hoaxesAndControversies = fields.hoaxesAndControversies;
    entity.reportFrequency = fields.reportFrequency;
    entity.geographicalOrigin = fields.geographicalOrigin;
  }

  function normalize(entity) {
    if (canonicalFieldsComplete(entity.dossierFields)) {
      exposeFieldAliases(entity, entity.dossierFields);
      return entity.dossierFields;
    }

    const fields = {
      famousSightings: buildFamousSightings(entity),
      behavior: buildBehavior(entity),
      weaknesses: buildWeaknesses(entity),
      culturalSignificance: buildCulture(entity),
      scientificExplanations: buildScience(entity),
      hoaxesAndControversies: buildControversy(entity),
      reportFrequency: buildFrequency(entity),
      geographicalOrigin: buildGeography(entity)
    };
    entity.dossierFields = fields;
    exposeFieldAliases(entity, fields);
    return fields;
  }

  records.forEach(normalize);

  function renderParagraphs(values) {
    return (values || []).filter(meaningful).map(value => `<p>${html(value)}</p>`).join('');
  }

  function renderSightings(items) {
    return `<div class="dossier-sighting-list">${items.map(item =>
      `<article class="dossier-sighting"><h4>${html(item.heading)}</h4>${item.detail ? `<p>${html(item.detail)}</p>` : ''}</article>`
    ).join('')}</div>`;
  }

  function directBoxes(app) {
    // Dossier boxes may be wrapped by later layout/UI layers; search the active entity
    // subtree instead of assuming every box is an immediate #app child.
    return [...app.querySelectorAll('table.box')];
  }

  function boxTitle(box) {
    return text(box?.querySelector('.box-title')?.textContent);
  }

  function findBox(app, pattern) {
    return directBoxes(app).find(box => pattern.test(boxTitle(box)));
  }

  function bodyOf(box) {
    return box?.querySelector('.box-body') || null;
  }

  function replaceBody(app, pattern, markup) {
    const box = findBox(app, pattern);
    const body = bodyOf(box);
    if (body) body.innerHTML = markup;
    return box;
  }

  function prependBody(app, pattern, markup) {
    const box = findBox(app, pattern);
    const body = bodyOf(box);
    if (body && !body.querySelector('[data-field-summary]')) body.insertAdjacentHTML('afterbegin', markup);
    return box;
  }

  function makeQuickFacts(entity, fields) {
    const aliases = (entity.aliases || []).filter(alias => text(alias).toLowerCase() !== text(entity.name).toLowerCase()).slice(0, 3);
    const origin = fields.geographicalOrigin[0] || entity.origin || entity.country || 'Regional tradition';
    const sourceCount = Number(entity.sourceCount || (entity.sources || []).length) || 0;
    return `<section class="dossier-overview" id="dossier-overview" data-dossier-enhanced="${html(entity.slug)}">
      <div class="dossier-overview-head"><span>DOSSIER OVERVIEW</span><small>${html(entity.id)}</small></div>
      <div class="dossier-quickfacts">
        <div><b>CLASSIFICATION</b><span>${html(entity.category || entity.type || 'Paranormal entity')}</span></div>
        <div><b>GEOGRAPHICAL ORIGIN</b><span>${html(origin)}</span></div>
        <div><b>REPORT FREQUENCY</b><span>${html(fields.reportFrequency.label)}</span></div>
        <div><b>PRIMARY REGION</b><span>${html(entity.country || entity.origin || 'Varies by tradition')}</span></div>
        ${aliases.length ? `<div><b>ALSO KNOWN AS</b><span>${aliases.map(html).join(' · ')}</span></div>` : ''}
        <div><b>SOURCE TRAIL</b><span>${sourceCount} named reference${sourceCount === 1 ? '' : 's'}</span></div>
      </div>
    </section>`;
  }

  function makeNav() {
    const items = [
      ['dossier-overview', 'Overview'],
      ['dossier-appearance', 'Appearance'],
      ['dossier-behavior', 'Behavior'],
      ['dossier-sightings', 'Sightings'],
      ['dossier-abilities', 'Abilities'],
      ['dossier-weaknesses', 'Weaknesses'],
      ['dossier-geography', 'Origin'],
      ['dossier-frequency', 'Frequency'],
      ['dossier-culture', 'Culture'],
      ['dossier-science', 'Explanations'],
      ['dossier-controversy', 'Controversies'],
      ['dossier-sources', 'Sources']
    ];
    return `<nav class="dossier-nav" aria-label="Dossier sections">${items.map(([id, label]) =>
      `<a href="#${id}" data-dossier-anchor="${id}">${label}</a>`).join('')}</nav>`;
  }

  function assignId(box, id) {
    if (box) box.id = id;
  }

  function removeRealityFlags(app) {
    app.querySelectorAll('.fiction').forEach(node => node.remove());

    app.querySelectorAll('.archive-table tr').forEach(row => {
      const heading = text(row.querySelector('th')?.textContent);
      if (/^CURRENT STATUS$/i.test(heading)) row.remove();
      if (/^DANGER INDEX$/i.test(heading)) {
        row.querySelectorAll('.tiny').forEach(node => {
          if (/fiction|editorial/i.test(node.textContent)) node.remove();
        });
      }
    });

    app.querySelectorAll('.tiny,.note').forEach(node => {
      const t = text(node.textContent);
      if (/abilities are source motifs, not verified biological capabilities/i.test(t) ||
          /AI-generated pictures, synthetic video/i.test(t) ||
          /every non-fiction entity file/i.test(t)) {
        node.remove();
      }
    });
  }

  function organizeCore(app, boxes) {
    let core = app.querySelector('.dossier-core-sections');
    if (!core) {
      core = document.createElement('section');
      core.className = 'dossier-core-sections';
      const overview = app.querySelector('.dossier-overview');
      overview?.insertAdjacentElement('afterend', core);
    }
    boxes.filter(Boolean).forEach(box => core.appendChild(box));
  }

  function groupResearchNotes(app) {
    if (app.querySelector('.dossier-research-details')) return;
    const patterns = [
      /^SOURCE-BY-SOURCE RESEARCH NOTES$/i,
      /^GEOGRAPHIC INTERPRETATION NOTES$/i,
      /^CHRONOLOGY ANALYSIS$/i,
      /^EVIDENCE \/ CLAIM MATRIX$/i,
      /^ARCHIVE METHODOLOGY \/ SOURCE INTERPRETATION NOTES$/i,
      /^OPEN RESEARCH QUESTIONS$/i
    ];
    const boxes = directBoxes(app).filter(box => patterns.some(pattern => pattern.test(boxTitle(box))));
    if (!boxes.length) return;
    const details = document.createElement('details');
    details.className = 'dossier-research-details';
    details.innerHTML = '<summary>Research notes, evidence matrix & source trail</summary><div class="dossier-research-inner"></div>';
    const sourceBox = findBox(app, /^SOURCES & FURTHER RESEARCH$/i);
    if (sourceBox) app.insertBefore(details, sourceBox);
    else app.appendChild(details);
    const inner = details.querySelector('.dossier-research-inner');
    boxes.forEach(box => inner.appendChild(box));
  }

  function enhanceEntityPage() {
    const routeName = decodeURIComponent(location.hash.replace(/^#/, '') || 'home');
    if (!routeName.startsWith('entity/')) return;
    const slug = routeName.slice(7);
    const entity = records.find(record => record.slug === slug);
    const app = document.getElementById('app');
    if (!entity || !app || app.querySelector(`[data-dossier-enhanced="${CSS.escape(slug)}"]`)) return;

    const fields = entity.dossierFields || normalize(entity);
    app.classList.add('dossier-modernized');

    removeRealityFlags(app);

    const layout = app.querySelector('table.layout');
    if (layout) {
      layout.insertAdjacentHTML('afterend', makeQuickFacts(entity, fields));
      app.querySelector('.dossier-overview')?.insertAdjacentHTML('beforebegin', makeNav());
    } else {
      app.insertAdjacentHTML('afterbegin', makeNav() + makeQuickFacts(entity, fields));
    }

    const behaviorBox = replaceBody(app, /^BEHAVIOR \/ REPORTED HABITAT$/i,
      `${renderParagraphs(fields.behavior)}
       ${meaningful(entity.habitatLong) ? `<div class="dossier-subfact"><b>SETTING / HABITAT</b><p>${html(trimmedBase(entity.habitatLong))}</p></div>` : ''}
       ${(entity.warningSigns || []).length ? `<div class="dossier-subfact"><b>RECURRING SIGNS / PRECURSORS</b><ul>${entity.warningSigns.map(item => `<li>${html(item)}</li>`).join('')}</ul></div>` : ''}`);

    const sightingsBox = replaceBody(app, /^FAMOUS SIGHTINGS \/ DOCUMENTED CASE FILES$/i, renderSightings(fields.famousSightings));
    if (sightingsBox?.querySelector('.box-title')) sightingsBox.querySelector('.box-title').textContent = 'FAMOUS SIGHTINGS & REPORT TRADITIONS';

    const weaknessesBox = replaceBody(app, /^WEAKNESSES, PROTECTION & PRACTICAL SAFETY$/i, renderParagraphs(fields.weaknesses));
    if (weaknessesBox?.querySelector('.box-title')) weaknessesBox.querySelector('.box-title').textContent = 'WEAKNESSES, LIMITATIONS & PROTECTIONS';

    const cultureBox = replaceBody(app, /^CULTURAL SIGNIFICANCE$/i, renderParagraphs(fields.culturalSignificance));
    const scienceBox = replaceBody(app, /^SCIENTIFIC \/ SKEPTICAL EXPLANATIONS$/i, renderParagraphs(fields.scientificExplanations));
    if (scienceBox?.querySelector('.box-title')) scienceBox.querySelector('.box-title').textContent = 'SCIENTIFIC & CONVENTIONAL EXPLANATIONS';

    const controversyBox = replaceBody(app, /^HOAXES, MISIDENTIFICATIONS & CONTROVERSIES$/i, renderParagraphs(fields.hoaxesAndControversies));
    const frequencyBox = replaceBody(app, /^REPORT FREQUENCY \/ DATA QUALITY$/i,
      `<div class="dossier-frequency-label">${html(fields.reportFrequency.label)}</div><p>${html(fields.reportFrequency.explanation)}</p>`);
    if (frequencyBox?.querySelector('.box-title')) frequencyBox.querySelector('.box-title').textContent = 'REPORT FREQUENCY';

    const geoBox = prependBody(app, /^GEOGRAPHICAL ORIGIN \/ REPORTED OR TRADITIONAL DISTRIBUTION$/i,
      `<div class="dossier-field-summary" data-field-summary>${renderParagraphs(fields.geographicalOrigin)}</div>`);
    if (geoBox?.querySelector('.box-title')) geoBox.querySelector('.box-title').textContent = 'GEOGRAPHICAL ORIGIN & DISTRIBUTION';

    const abilitiesBox = findBox(app, /^ABILITIES \/ ATTRIBUTES$/i);
    const abilitiesBody = bodyOf(abilitiesBox);
    if (abilitiesBody && !(entity.abilities || []).filter(meaningful).length) {
      const abilityFallback = paragraphsFor(entity, /\b(?:abilit|power|trait|transform|flight|invisib|telepath|strength|speed|shape|manifest)\w*\b/i, 2);
      abilitiesBody.innerHTML = renderParagraphs(abilityFallback.length ? abilityFallback :
        [`Descriptions of ${entity.name} emphasize the traits recorded in its appearance, behavior, and encounter traditions rather than a fixed universal ability list.`]);
    }

    const appearanceBox = findBox(app, /^PHYSICAL DESCRIPTION$/i);
    const historyBox = findBox(app, /^KNOWN HISTORY$/i);
    const timelineBox = findBox(app, /^HISTORICAL TIMELINE$/i);
    const etymologyBox = findBox(app, /^ETYMOLOGY & NAME HISTORY$/i);
    const sourcesBox = findBox(app, /^SOURCES & FURTHER RESEARCH$/i);

    assignId(appearanceBox, 'dossier-appearance');
    assignId(behaviorBox, 'dossier-behavior');
    assignId(sightingsBox, 'dossier-sightings');
    assignId(abilitiesBox, 'dossier-abilities');
    assignId(weaknessesBox, 'dossier-weaknesses');
    assignId(geoBox, 'dossier-geography');
    assignId(frequencyBox, 'dossier-frequency');
    assignId(cultureBox, 'dossier-culture');
    assignId(scienceBox, 'dossier-science');
    assignId(controversyBox, 'dossier-controversy');
    assignId(sourcesBox, 'dossier-sources');

    // Keep the canonical dossier sections in the document positions created by
    // entityPage(). Reparenting HTML table sections into a new <section> caused
    // Chromium's table DOM normalization to detach the dossier content. The
    // canonical fields are already written into these boxes above, so no move
    // is necessary. This also preserves maps, history, sources, evidence tables,
    // and the existing long-form research exactly where the base renderer puts them.

    app.querySelectorAll('*').forEach(node => {
      if (node.childNodes.length !== 1 || node.firstChild?.nodeType !== Node.TEXT_NODE) return;
      if (/AI-generated/i.test(node.textContent)) node.textContent = node.textContent.replace(/AI-generated/gi, 'synthetic');
    });

    app.querySelectorAll('.dossier-nav a').forEach(anchor => {
      const target = document.getElementById(anchor.dataset.dossierAnchor);
      if (!target) anchor.remove();
    });
  }

  function installStyles() {
    if (document.getElementById('dossier-repair-styles')) return;
    const style = document.createElement('style');
    style.id = 'dossier-repair-styles';
    style.textContent = `
      .dossier-modernized{--dossier-line:#34345f;--dossier-panel:#05050e;--dossier-soft:#0a0a18}
      .dossier-modernized .status{margin:8px 0 10px;padding:7px 9px;border-color:#44446f;color:#c8c8de}
      .dossier-nav{position:sticky;top:0;z-index:24;display:flex;gap:4px;overflow-x:auto;padding:6px;margin:8px 0;background:rgba(2,2,10,.96);border:1px solid #30305d;scrollbar-width:thin}
      .dossier-nav a{flex:0 0 auto;padding:4px 7px;font:10px Arial,sans-serif;color:#9eefff;text-decoration:none;border:1px solid transparent;white-space:nowrap}
      .dossier-nav a:hover,.dossier-nav a:focus-visible{border-color:#56568d;background:#10102a;color:#fff;outline:none}
      .dossier-overview{margin:9px 0 12px;border:1px solid #4a4a78;background:linear-gradient(180deg,#080819,#030309)}
      .dossier-overview-head{display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:#12123a;border-bottom:1px solid #4a4a78;color:#7ef2ef;font:bold 12px Arial,sans-serif;letter-spacing:.04em}
      .dossier-overview-head small{font:10px "Courier New",monospace;color:#aaa}
      .dossier-quickfacts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0}
      .dossier-quickfacts>div{display:grid;grid-template-columns:130px 1fr;gap:8px;align-items:start;padding:7px 8px;border-bottom:1px dotted #34345a}
      .dossier-quickfacts>div:nth-child(odd){border-right:1px dotted #34345a}
      .dossier-quickfacts b{font:9px Arial,sans-serif;color:#aaa;letter-spacing:.04em}
      .dossier-quickfacts span{font:12px Arial,sans-serif;color:#eee;line-height:1.35}
      .dossier-core-sections>.box{margin-bottom:10px}
      .dossier-core-sections .box-body{padding:9px 10px;line-height:1.45}
      .dossier-core-sections .box-body>p:first-child{margin-top:0}
      .dossier-core-sections .box-body>p:last-child{margin-bottom:0}
      .dossier-sighting-list{display:grid;gap:8px}
      .dossier-sighting{padding:7px 9px;border-left:2px solid #55558a;background:#080812}
      .dossier-sighting h4{margin:0 0 4px;color:#dfdfff;font:bold 11px Arial,sans-serif}
      .dossier-sighting p{margin:0;line-height:1.42}
      .dossier-subfact{margin-top:9px;padding-top:8px;border-top:1px dotted #38385b}
      .dossier-subfact>b{font:10px Arial,sans-serif;color:#9eefff;letter-spacing:.04em}
      .dossier-subfact ul{margin:5px 0 0 20px}
      .dossier-field-summary{margin:0 0 10px;padding:8px 9px;border:1px solid #33335c;background:#070713}
      .dossier-field-summary p{margin:0 0 6px}
      .dossier-field-summary p:last-child{margin-bottom:0}
      .dossier-frequency-label{display:inline-block;margin:0 0 6px;padding:3px 7px;border:1px solid #676790;background:#11112c;color:#fff;font:bold 11px Arial,sans-serif}
      .dossier-research-details{margin:12px 0;border:1px solid #36365e;background:#030309}
      .dossier-research-details>summary{cursor:pointer;padding:8px 10px;color:#b9b9ef;background:#0c0c20;font:bold 11px Arial,sans-serif}
      .dossier-research-inner{padding:8px}
      .dossier-research-inner>.box:last-child{margin-bottom:0}
      .dossier-modernized .box{scroll-margin-top:48px}
      .dossier-modernized #dossier-overview{scroll-margin-top:48px}
      .occult-astro-gallery,.occult-alchemy-gallery{margin:10px 0 14px}
      .occult-astro-gallery>div,.occult-alchemy-gallery>div{padding:7px}
      .occult-astro-gallery img,.occult-alchemy-gallery img{display:block;width:100%;height:210px;object-fit:contain;background:#080808;margin:0 auto 6px}
      @media(max-width:680px){
        .dossier-nav{top:0;margin-left:-3px;margin-right:-3px;padding:5px 4px}
        .dossier-nav a{padding:5px 6px;font-size:9px}
        .dossier-quickfacts{grid-template-columns:1fr}
        .dossier-quickfacts>div{grid-template-columns:112px 1fr}
        .dossier-quickfacts>div:nth-child(odd){border-right:0}
        .dossier-core-sections .box-body{padding:8px}
        .occult-astro-gallery img,.occult-alchemy-gallery img{height:170px}
      }
      @media(prefers-reduced-motion:reduce){.dossier-nav{scroll-behavior:auto}}
    `;
    document.head.appendChild(style);
  }

  function audit() {
    const fields = [
      'famousSightings','behavior','weaknesses','culturalSignificance',
      'scientificExplanations','hoaxesAndControversies','reportFrequency','geographicalOrigin'
    ];
    const fieldCounts = Object.fromEntries(fields.map(field => [field, 0]));
    const incomplete = [];
    const ids = new Set();
    const slugs = new Set();
    const duplicateIds = [];
    const duplicateSlugs = [];

    for (const entity of records) {
      const f = entity.dossierFields || normalize(entity);
      const missing = [];
      for (const field of fields) {
        const value = f[field];
        let ok = false;
        if (Array.isArray(value)) ok = value.length > 0 && value.some(item => meaningful(typeof item === 'object' ? (item.detail || item.heading) : item));
        else if (value && typeof value === 'object') ok = meaningful(value.label) && meaningful(value.explanation);
        else ok = meaningful(value);
        if (ok) fieldCounts[field] += 1;
        else missing.push(field);
      }
      if (missing.length) incomplete.push({ id: entity.id, slug: entity.slug, missing });
      if (ids.has(entity.id)) duplicateIds.push(entity.id); else ids.add(entity.id);
      if (slugs.has(entity.slug)) duplicateSlugs.push(entity.slug); else slugs.add(entity.slug);
    }

    return {
      generatedAt: new Date().toISOString(),
      totalEntities: records.length,
      expectedEntities: 913,
      entityCountPreserved: records.length === 913,
      fieldCounts,
      fullyAddressed: incomplete.length === 0,
      incomplete,
      duplicateIds,
      duplicateSlugs
    };
  }

  installStyles();
  const auditResult = audit();
  window.__PARANORMAL_DOSSIER_AUDIT = auditResult;
  console.info('[PARANORMAL WIKI] dossier repair audit', auditResult);

  let queued = false;
  const scheduleEnhance = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      enhanceEntityPage();
    });
  };

  scheduleEnhance();
  const app = document.getElementById('app');
  if (app) new MutationObserver(scheduleEnhance).observe(app, { childList: true, subtree: true });
  addEventListener('hashchange', scheduleEnhance);

  const symbolDirectories = [
    ['PLANETARY & ASTROLOGICAL SYMBOLS', 'planetary-astrological-symbols'],
    ['ALCHEMICAL SYMBOLS', 'alchemical-symbols'],
    ['SIGILS, SEALS & MAGICAL ALPHABETS', 'sigils-seals-magical-alphabets'],
    ['PROTECTIVE & DIVINATORY MARKS', 'protective-divinatory-marks'],
    ['SECRET-SOCIETY & ESOTERIC EMBLEMS', 'secret-society-esoteric-emblems'],
    ['ANIMAL, ELEMENTAL & CONTEMPORARY SYMBOLISM', 'animal-elemental-contemporary-symbolism']
  ];

  const planetaryDirectories = [
    ['The Classical Seven', 'classical-planets', '☉ ☽ ☿ ♀ ♂ ♃ ♄', 'The Sun, Moon, and five visible planets: the original planetary vocabulary shared by astrology, alchemy, medicine, and ritual calendars.'],
    ['The Zodiac', 'zodiac-signs', '♈ ♉ ♊ ♋', 'The twelve signs, their figures, seasonal sequence, and the symbolic vocabulary built around the ecliptic.'],
    ['Elements & Modalities', 'elements-modalities', '🜂 🜄 🜁 🜃', 'Fire, Water, Air, Earth, and the cardinal, fixed, and mutable divisions used to organize astrological qualities.'],
    ['Houses, Angles & Aspects', 'houses-aspects', 'ASC ☌ △ ☍', 'The chart’s twelve houses, four angles, lunar nodes, and the geometric symbols used to describe planetary relationships.'],
    ['Moon Phases & Eclipses', 'lunar-symbols', '● ◐ ◑ ○', 'Lunar phases, eclipse imagery, and the recurring visual language of darkness, return, and celestial timing.'],
    ['Outer Planets & Modern Additions', 'modern-planets', '♅ ♆ ♇ ⊕', 'Later astronomical symbols and modern astrological additions, including Uranus, Neptune, Pluto, Earth, Chiron, and asteroids.']
  ];

  const planetaryEntries = {
    'classical-planets': {
      title: 'THE CLASSICAL SEVEN',
      intro: 'Before the telescope changed the map of the heavens, astrology organized the sky around seven moving lights visible to the naked eye. Their glyphs also became the signs of the seven traditional metals in alchemical writing.',
      rows: [['☉','SUN','Gold · vitality · center'],['☽','MOON','Silver · change · reflection'],['☿','MERCURY','Quicksilver · movement · language'],['♀','VENUS','Copper · attraction · harmony'],['♂','MARS','Iron · force · conflict'],['♃','JUPITER','Tin · growth · authority'],['♄','SATURN','Lead · limits · time']],
      history: 'The familiar planetary glyphs were standardized gradually in manuscript, astronomical, astrological, and alchemical use. Their forms gathered together older visual ideas—solar disks, crescents, weapons, mirrors, and letter-based abbreviations—rather than arriving as one fixed code.',
      timeline: `<p><b>SUN ☉ and MOON ☽ — before the 1st century CE through late antiquity.</b> There is no named inventor. A disk for the Sun and a crescent for the Moon were practical diagram signs because they resembled the visible lights themselves; Greek and Roman astronomical traditions passed such shorthand into later manuscript culture.</p><p><b>MERCURY ☿, VENUS ♀, and MARS ♂ — late-antique to medieval manuscript tradition, roughly 4th–12th centuries.</b> No single maker is securely recorded. Their familiar forms draw on the Mercury staff, Venus mirror, and Mars shield-and-spear imagery, making them quick identifiers in charts and alchemical tables.</p><p><b>JUPITER ♃ and SATURN ♄ — late-antique letter forms, stabilized in early modern print.</b> These glyphs developed from Greek-letter abbreviations connected with the planetary gods. Printers and compilers of the 16th and 17th centuries helped settle the shapes now seen in ephemerides and symbol charts.</p><p><b>PLANETARY METALS — Hellenistic and Roman-era synthesis, widely transmitted from late antiquity onward.</b> The purpose was correspondence: one compact sign could identify a planet, its metal, and a cluster of associated qualities in a recipe, diagram, or calendar.</p>`
    },
    'zodiac-signs': {
      title: 'THE ZODIAC',
      intro: 'The zodiac divides the apparent annual path of the Sun into twelve signs. Its animals and figures became one of the most recognizable symbolic systems in European, Mediterranean, Middle Eastern, and later global astrological imagery.',
      rows: [['♈','ARIES','The Ram'],['♉','TAURUS','The Bull'],['♊','GEMINI','The Twins'],['♋','CANCER','The Crab'],['♌','LEO','The Lion'],['♍','VIRGO','The Maiden'],['♎','LIBRA','The Scales'],['♏','SCORPIO','The Scorpion'],['♐','SAGITTARIUS','The Archer'],['♑','CAPRICORN','The Sea-Goat'],['♒','AQUARIUS','The Water-Bearer'],['♓','PISCES','The Fishes']],
      history: 'The sign sequence developed from ancient Mesopotamian sky traditions and was refined through Hellenistic astronomy and astrology. Medieval manuscripts frequently paired the signs with calendars, medicine, seasons, and images of the human body.',
      timeline: `<p><b>THE TWELVE-SIGN ZODIAC — late 5th century BCE.</b> Babylonian astronomer-scribes developed the twelve-part zodiac to give celestial positions a regular mathematical framework. It was not the work of one named artist or author; it was a technical system refined through astronomical diaries and star catalogues.</p><p><b>GREEK AND HELLENISTIC TRANSMISSION — 3rd to 1st centuries BCE.</b> Greek-speaking astronomers and astrologers adopted and translated the Babylonian sign sequence. The purpose shifted beyond positional astronomy into horoscope interpretation, linking signs, planets, seasons, and human affairs.</p><p><b>THE MODERN GLYPHS — medieval manuscript practice through early modern print, roughly 12th–17th centuries.</b> The compact marks are abbreviated drawings of the ram, bull, twins, crab, lion, maiden, scales, scorpion, archer, sea-goat, water-bearer, and fishes. They do not have twelve separately documented inventors; scribes and printers simplified the figures for tables and charts.</p><p><b>MEDIEVAL ZODIAC ART — 11th century onward.</b> Illuminated calendars, medical miscellanies, and astrological manuscripts made the signs visually rich, often combining them with seasons, body diagrams, and planetary rulers.</p>`
    },
    'elements-modalities': {
      title: 'ELEMENTS & MODALITIES',
      intro: 'Astrological systems use four elements to describe broad qualities and three modalities to describe how a sign begins, sustains, or changes a pattern.',
      rows: [['🜂','FIRE','Aries · Leo · Sagittarius'],['🜃','EARTH','Taurus · Virgo · Capricorn'],['🜁','AIR','Gemini · Libra · Aquarius'],['🜄','WATER','Cancer · Scorpio · Pisces'],['—','CARDINAL','Beginning and initiation'],['—','FIXED','Continuance and preservation'],['—','MUTABLE','Transition and adaptation']],
      history: 'The four-element scheme entered Western astrology through ancient natural philosophy. Later astrologers joined it to zodiac signs, seasonal patterns, humoral medicine, alchemical images, and ritual correspondences.',
      timeline: `<p><b>FOUR ELEMENTS — c. 450 BCE.</b> The Greek philosopher Empedocles is the earliest named author conventionally credited with a four-root scheme of earth, water, air, and fire. The purpose was to explain change in the natural world through mixtures and separations rather than through one single substance.</p><p><b>QUALITIES AND COSMOLOGY — 4th century BCE.</b> Aristotle developed the elemental scheme through paired qualities such as hot, cold, dry, and wet. Later astrologers and physicians used those pairings to relate seasons, signs, bodily temperaments, and materials.</p><p><b>TRIANGLE GLYPHS 🜂 🜁 🜄 🜃 — Renaissance and early modern alchemical notation, especially 16th–17th centuries.</b> The exact designer is not known. The crossed or divided triangles were made for quick visual distinction in manuscripts and printed symbol tables.</p><p><b>MODALITIES — Hellenistic foundations, later medieval and modern standardization.</b> Cardinal, fixed, and mutable groupings organized the twelve signs by seasonal position. Their purpose was classification: to show how a sign begins, holds, or shifts a cycle.</p>`
    },
    'houses-aspects': {
      title: 'HOUSES, ANGLES & ASPECTS',
      intro: 'A horoscope is not only a list of signs and planets. It is a circular map in which houses locate topics of life, angles orient the chart, and aspects mark geometric relationships between planets.',
      rows: [['ASC','ASCENDANT','Eastern horizon'],['MC','MIDHEAVEN','Highest point of the chart'],['☊','NORTH NODE','Ascending lunar node'],['☋','SOUTH NODE','Descending lunar node'],['☌','CONJUNCTION','0° relationship'],['✶','SEXTILE','60° relationship'],['□','SQUARE','90° relationship'],['△','TRINE','120° relationship'],['☍','OPPOSITION','180° relationship']],
      history: 'House division and aspect doctrine developed through Hellenistic and later medieval astrology. The symbols used for aspects are comparatively modern shorthand for relationships that older authors described with geometry and written terminology.',
      timeline: `<p><b>ASCENDANT AND FOUR ANGLES — Hellenistic astrology, roughly 2nd century BCE to 2nd century CE.</b> Early horoscope practice used the eastern horizon and other cardinal points to anchor a chart to a particular time and place. No single inventor survives; the purpose was to turn celestial positions into a local map of the sky.</p><p><b>TWELVE HOUSES — Hellenistic period, with major later revisions.</b> House doctrine developed across Greek, Egyptian, and later Arabic and Latin traditions. Different systems divide the chart differently, which is why a careful directory will distinguish the historical house schemes rather than pretending there was one original design.</p><p><b>ASPECTS — described in surviving Hellenistic texts and systematized by authors such as Ptolemy, c. 150 CE.</b> Conjunction, sextile, square, trine, and opposition began as geometric relations. Their short glyphs—☌, ✶, □, △, ☍—are later printed shorthand, used so chart readers could scan relationships quickly.</p><p><b>LUNAR NODES ☊ ☋ — ancient eclipse astronomy, later astrological notation.</b> The node symbols mark the two crossing points of the Moon’s orbit and the ecliptic. They were useful because eclipses occur near these crossings; their dragon-head and dragon-tail imagery became widespread in medieval and early modern astrological material.</p>`
    },
    'lunar-symbols': {
      title: 'MOON PHASES & ECLIPSES',
      intro: 'The changing lunar disk supplied astrology and ritual calendars with a visible cycle of emergence, fullness, decline, disappearance, and return.',
      rows: [['●','NEW MOON','Conjunction of Sun and Moon'],['◔','WAXING CRESCENT','First visible return of light'],['◐','FIRST QUARTER','Half-illuminated Moon'],['◕','WAXING GIBBOUS','Approach to fullness'],['○','FULL MOON','Opposition of Sun and Moon'],['◑','LAST QUARTER','Half-illuminated Moon'],['◒','WANING CRESCENT','Light withdrawing'],['☉ / ☽','ECLIPSE','Sun, Moon, and node aligned']],
      history: 'Crescents, disks, and eclipsed suns appear in calendar art, astronomical manuscripts, talismans, and religious imagery across many periods. Astrological use made the lunar phase a repeating indicator of timing and change.',
      timeline: `<p><b>LUNAR PHASE OBSERVATION — prehistoric and ancient, with written calendrical records by the 2nd millennium BCE.</b> There is no inventor: the changing Moon is an observable cycle. Mesopotamian calendrical and astronomical traditions recorded lunar visibility, conjunctions, and intervals because they were essential for months and festival timing.</p><p><b>NEW AND FULL MOON SIGNS — ancient astronomical diagram tradition.</b> The dark disk, bright disk, crescent, and half-disk became visual shortcuts for the Moon’s changing illumination. Their purpose was calendrical and observational before later astrological writers gave the phases interpretive roles.</p><p><b>ECLIPSE NODES — Babylonian eclipse calculation, later Greek, Arabic, and Latin transmission.</b> Astronomers tracked the places where lunar and solar paths meet in order to anticipate eclipse seasons. Medieval astrology visualized them as the Dragon’s Head and Tail, retaining the older practical connection between nodes and eclipses.</p><p><b>PRINTED PHASE SEQUENCES — 15th century onward.</b> Calendars, almanacs, and ephemerides standardized the familiar progression of circles, crescents, and half-lit disks because readers needed a compact way to follow the month.</p>`
    },
    'modern-planets': {
      title: 'OUTER PLANETS & MODERN ADDITIONS',
      intro: 'Telescopic discoveries expanded the symbolic vocabulary. New glyphs were proposed by astronomers and later adopted, altered, or supplemented by modern astrologers.',
      rows: [['♅','URANUS','Discovery-era astronomical glyph'],['♆','NEPTUNE','Trident symbol'],['♇','PLUTO','Monogram and alternate glyphs'],['⊕','EARTH','Terrestrial globe / cross'],['⚷','CHIRON','Key-like modern glyph'],['⚳','CERES','Dwarf planet and asteroid symbol'],['⚴','PALLAS','Asteroid symbol'],['⚵','JUNO','Asteroid symbol'],['⚶','VESTA','Asteroid symbol']],
      history: 'Unlike the classical seven, modern symbols have competing forms and more traceable dates of proposal. Their use reflects the meeting of scientific discovery, print culture, ephemerides, and modern astrological interpretation.',
      timeline: `<p><b>URANUS ♅ / ⛢ — discovered 13 March 1781 by William Herschel.</b> Johann Elert Bode promoted an H-marked symbol in the 1780s to acknowledge Herschel; other forms circulated. The glyph gave astronomers and later astrologers a compact sign for the first planet discovered by telescope.</p><p><b>NEPTUNE ♆ — predicted by Urbain Le Verrier and observed 23 September 1846 by Johann Galle and Heinrich d’Arrest.</b> A temporary LV monogram competed with the trident. The trident became the common sign because it referred directly to the planet’s mythological name and was easy to set in printed tables.</p><p><b>PLUTO ♇ — discovered 18 February 1930 by Clyde Tombaugh; name announced 1 May 1930.</b> Lowell Observatory proposed the interlocked P–L monogram soon afterward, honoring both Pluto and Percival Lowell. Other symbols later appeared, but ♇ remains the best-known traditional form.</p><p><b>EARTH ⊕ / 🜨 — medieval and early modern cosmological and alchemical use.</b> The globe-and-cross design has no single documented maker. It allowed mapmakers, astronomers, and alchemists to distinguish the terrestrial world from the moving planets.</p><p><b>CHIRON ⚷ — discovered 1 November 1977 by Charles T. Kowal.</b> Its key-shaped modern glyph entered astrological use after the discovery; the exact designer is not securely documented. Ceres (1801, Giuseppe Piazzi), Pallas (1802, Heinrich Olbers), Juno (1804, Karl Harding), and Vesta (1807, Heinrich Olbers) likewise received emblematic astronomical signs for catalogues and ephemerides.</p>`
    }
  };

  // Individual archival records. Exact inventors are named only where the historical record supports one.
  const symbolRecordDefs = {
    'classical-planets': [
      ['sun','☉','SUN','⊙ · Sol','ancient solar disks; surviving Mediterranean astronomical shorthand from antiquity','Antiquity; the circumpunct form is securely attested in later Greco-Roman and medieval diagram traditions','No single inventor is known. Astronomers, calendar-makers, and manuscript compilers used a disk and central point as a compact image of the visible Sun.','To mark the solar body quickly in tables, diagrams, and calendrical schemes.','The visible Sun, light, and the annual course.','Later astrology made it the sign of centrality, vitality, rulership, and solar character; alchemy used it for gold.','The disk, radiating disk, and circumpunct coexisted before the compact ⊙ form became common in print.','Medieval calendar diagrams and astronomical/medical miscellanies regularly place a solar disk at the center of a planetary or zodiacal arrangement.','Astronomy, calendrics, alchemical gold, talismanic diagrams, and medical astrology.','☉ and ⊙ remain the usual astrological and astronomical forms; Unicode preserves both.'],
      ['moon','☽','MOON','☾ · Luna','ancient crescent imagery; written astronomical use is ancient, with later Greco-Roman and medieval shorthand','Antiquity to medieval manuscript tradition','No single inventor is known. The crescent is a direct visual abbreviation of the changing Moon.','To identify the Moon and its visible phase in calendars and sky diagrams.','The lunar body, months, and visible waxing and waning.','Later astrology linked it with change, reception, memory, and bodily rhythms; alchemy used it for silver.','Crescents turn left or right in manuscripts, and full disks or horned crescents may be used according to context.','Lunar crescents appear in medieval calendars, eclipse diagrams, and illustrated zodiac manuscripts.','Astronomy, lunar calendars, eclipse calculation, alchemical silver, and ritual timing.','☽ and ☾ are both current; phase icons are also widely used in digital astronomy.'],
      ['mercury','☿','MERCURY','☿ · ☊-like manuscript forms','late antique and medieval planetary shorthand','roughly 4th–12th centuries for the familiar composite form','No single designer is securely documented. The form is conventionally read as a circle, crescent, and cross, with associations to the staff of Mercury developing in later interpretation.','To distinguish Mercury in planetary tables and alchemical recipes.','The planet and the Roman god Mercury; later, the metal quicksilver.','Astrology associated it with motion, messages, trade, calculation, and mediation.','Scribes used several looped and cross-bearing forms before printing favored the familiar ☿.','Planetary tables in medieval and early printed astrological works preserve variant Mercury characters.','Astronomy, alchemical mercury, medical astrology, and ritual planetary correspondences.','☿ is the standard modern glyph and a Unicode celestial symbol.'],
      ['venus','♀','VENUS','♀ · mirror-like variants','late antique and medieval planetary shorthand','roughly 4th–12th centuries; stabilized in early modern print','No single designer is securely documented. The familiar sign was later understood as Venus’s mirror.','To identify Venus in astronomical and astrological tables; later also copper in alchemical notation.','The planet Venus and the goddess-name attached to it.','Astrology later emphasized attraction, agreement, beauty, and pleasure; alchemy used it for copper.','Early forms vary in the size and placement of the cross; the round-and-cross form was fixed by print culture.','Medieval planetary tables and early modern ephemerides show the sign beside Venus and copper.','Astronomy, alchemical copper, medical correspondences, and later biological notation.','♀ is widely used in astrology, astronomy, biology, and Unicode.'],
      ['mars','♂','MARS','♂ · shield-and-spear variants','late antique and medieval planetary shorthand','roughly 4th–12th centuries; stabilized in early modern print','No single designer is securely documented. Later tradition reads the circle and projecting stroke as Mars’s shield and spear.','To identify Mars in tables and, in alchemy, iron.','The planet Mars and its Roman divine name.','Astrology later connected it with force, conflict, initiative, and heat; alchemy used it for iron.','The diagonal projection varies sharply in manuscript hands before the modern arrowed form prevailed.','Planetary and alchemical symbol tables from the medieval and early modern periods preserve the mark.','Astronomy, alchemical iron, medicine, and later biological notation.','♂ remains the usual glyph in astrological, astronomical, and biological contexts.'],
      ['jupiter','♃','JUPITER','♃ · zeta-like variants','late antique letter-based abbreviation','late antiquity; familiar printed form stabilized by the 16th–17th centuries','No single inventor is known. The character developed from abbreviated Greek and Latin naming traditions for Jupiter.','To save space in ephemerides and planetary tables.','The planet and the god Jupiter.','Astrology later associated it with expansion, law, status, and beneficence; alchemy used it for tin.','Manuscript forms can resemble a curled zeta, while printers regularized the familiar ♃.','Early modern almanacs and astronomical tables present a range of Jupiter forms.','Astronomy, alchemical tin, medical astrology, and magical planetary tables.','♃ is the standard modern glyph and Unicode form.'],
      ['saturn','♄','SATURN','♄ · eta-like variants','late antique letter-based abbreviation','late antiquity; familiar printed form stabilized by the 16th–17th centuries','No single inventor is known. The mark developed from abbreviated naming traditions rather than a documented design event.','To identify Saturn economically in chart and calendar notation.','The planet and the god Saturn.','Astrology later emphasized time, boundary, endurance, and constraint; alchemy used it for lead.','The cross and descending curve shift between manuscripts before the print form became familiar.','Astrological tables, alchemical sign lists, and early modern ephemerides preserve the transition.','Astronomy, alchemical lead, medical astrology, and planetary magic.','♄ remains the normal astrological and astronomical form.']
    ],
    'zodiac-signs': [
      ['aries','♈','ARIES','♈ · ram-head forms','Babylonian zodiacal tradition, then Hellenistic zodiac imagery','late 5th century BCE for the twelve-sign zodiac; compact glyph medieval to early modern','Babylonian astronomer-scribes developed the twelve-part zodiac; no separate inventor is known for the later glyph.','To mark a regular 30-degree sector of the ecliptic.','A ram figure used to name and recognize the zodiacal sector.','Later astrology made Aries the first sign and associated it with initiation and spring.','Figural rams were reduced to a paired horn-like shorthand in manuscript tables and print.','Zodiac calendars and medical miscellanies portray the ram as a full animal while tables use ♈.','Astronomy, horoscopy, seasonal calendars, medical astrology, and talismanic art.','♈ is the standard Unicode and horoscope glyph.'],
      ['taurus','♉','TAURUS','♉ · bull-head forms','Babylonian zodiacal tradition, then Hellenistic zodiac imagery','late 5th century BCE; compact glyph medieval to early modern','The zodiacal system comes from Mesopotamian astronomy; no named maker of ♉ is recorded.','To identify the Bull sector in a compact celestial grid.','A bull figure marking a zodiacal sector.','Later astrology associated Taurus with continuity, materiality, and the middle of spring.','Full bull images were reduced to a circle with rising horns.','Medieval calendars portray the bull; early printed ephemerides use the compressed mark.','Astronomy, horoscopy, agricultural calendars, medicine, and occult correspondences.','♉ remains the standard modern form.'],
      ['gemini','♊','GEMINI','♊ · twin-pillar forms','Babylonian and Hellenistic zodiac tradition','late 5th century BCE; compact glyph medieval to early modern','No individual designer survives. The sign descends from the twin figure in the zodiacal sequence.','To identify the Twins sector.','A paired or twin figure marking the sector.','Later astrology connected Gemini with duality, exchange, and movement.','Two figures became two parallel strokes linked above and below.','Illustrated zodiac manuscripts show paired figures alongside abbreviated table signs.','Astronomy, horoscopy, calendars, medical astrology, and planetary rulership tables.','♊ is the usual Unicode glyph.'],
      ['cancer','♋','CANCER','♋ · crab or paired-spiral forms','Babylonian and Hellenistic zodiac tradition','late 5th century BCE; compact glyph medieval to early modern','No named designer is known for the later character.','To identify the Crab sector in charts and almanacs.','A crab or crustacean figure associated with the sector.','Later astrology related Cancer to the lunar cycle, enclosure, and the summer solstice region.','Figural crabs became a compact opposing-spiral or claw-like sign.','Medieval calendars and zodiac wheels preserve crab imagery; tables favor ♋.','Astronomy, horoscopy, lunar rulership tables, medicine, and calendrics.','♋ is the standard modern glyph.'],
      ['leo','♌','LEO','♌ · lion-tail forms','Babylonian and Hellenistic zodiac tradition','late 5th century BCE; compact glyph medieval to early modern','No named designer is recorded.','To identify the Lion sector in a regular zodiac scheme.','A lion figure marking the ecliptic sector.','Later astrology linked Leo to solar rulership, visibility, and midsummer.','The animal was reduced to a curling mane or tail-like stroke.','Zodiac manuscripts depict lions in full while printed tables use ♌.','Astronomy, horoscopy, calendrical art, medical astrology, and solar correspondences.','♌ remains standard in Unicode and horoscope notation.'],
      ['virgo','♍','VIRGO','♍ · maiden and letter-like variants','Babylonian and Hellenistic zodiac tradition','late 5th century BCE; compact glyph medieval to early modern','No named maker of the glyph is documented.','To identify the Maiden sector.','A maiden or harvest-bearing figure in zodiac imagery.','Later astrology related Virgo to sorting, harvest, and late-summer order.','The figure became a looped letter-like shorthand with variable terminal strokes.','Medieval calendars commonly show a maiden or grain-bearing figure.','Astronomy, horoscopy, harvest calendars, medicine, and occult correspondences.','♍ is the standard modern sign.'],
      ['libra','♎','LIBRA','♎ · scales and horizon forms','late Babylonian and Hellenistic zodiac tradition','late 5th century BCE onward; compact glyph medieval to early modern','The sign’s place was shaped by Mesopotamian and Greek transmission; no glyph designer is known.','To identify the Scales sector.','A balance or scales, sometimes read in later art as the Sun at the horizon.','Later astrology linked Libra with balance, agreement, and the autumnal equinox.','Figural scales became a horizontal line and raised arc.','Calendars and zodiac wheels show scales, while tables use ♎.','Astronomy, horoscopy, seasonal calendrics, law imagery, and medical astrology.','♎ is the standard Unicode character.'],
      ['scorpio','♏','SCORPIO','♏ · scorpion-tail forms','Babylonian and Hellenistic zodiac tradition','late 5th century BCE; compact glyph medieval to early modern','No named designer survives.','To identify the Scorpion sector.','A scorpion figure marking the zodiacal sector.','Later astrology associated it with autumn, intensity, and hidden or transformative processes.','The full scorpion became a looped stroke with a raised tail.','Medieval zodiac art gives the animal full form; charts use ♏.','Astronomy, horoscopy, medical astrology, talismanic art, and seasonal calendars.','♏ remains the usual modern glyph.'],
      ['sagittarius','♐','SAGITTARIUS','♐ · arrow and archer forms','Babylonian and Hellenistic zodiac tradition','late 5th century BCE; compact glyph medieval to early modern','No named designer is recorded for ♐.','To identify the Archer sector.','An archer, often a composite or centaur-like figure in later Mediterranean imagery.','Later astrology emphasized travel, aim, doctrine, and expansion.','The full archer was reduced to an arrow with a cross-stroke.','Manuscripts display archers in zodiac wheels; tables use the compressed arrow.','Astronomy, horoscopy, calendar art, medicine, and planetary rulership systems.','♐ is the standard Unicode glyph.'],
      ['capricorn','♑','CAPRICORN','♑ · sea-goat forms','Babylonian and Hellenistic zodiac tradition','late 5th century BCE; compact glyph medieval to early modern','No named designer is documented.','To identify the Sea-Goat sector.','A horned goat with aquatic hindquarters in the transmitted zodiacal imagery.','Later astrology linked Capricorn to the solstitial turn, endurance, and Saturn.','The composite figure was reduced to a loop and curling tail.','Medieval calendars show the sea-goat in full; tables use ♑.','Astronomy, horoscopy, solstitial calendars, medical astrology, and Saturnian correspondences.','♑ remains standard in modern notation.'],
      ['aquarius','♒','AQUARIUS','♒ · water-wave forms','Babylonian and Hellenistic zodiac tradition','late 5th century BCE; compact glyph medieval to early modern','No named designer survives.','To identify the Water-Bearer sector.','A figure pouring water; the sector has deep Mesopotamian antecedents.','Later astrology associated Aquarius with circulation, collective patterns, and the winter sky.','Pouring water became two stacked wave lines.','Zodiac manuscripts show the water-bearer, while tables use ♒.','Astronomy, horoscopy, calendars, medical astrology, and weather symbolism.','♒ is the usual Unicode glyph.'],
      ['pisces','♓','PISCES','♓ · paired-fish forms','Babylonian and Hellenistic zodiac tradition','late 5th century BCE; compact glyph medieval to early modern','No named designer of the compact sign is recorded.','To identify the Fishes sector.','Two fishes connected by a cord or band in zodiacal imagery.','Later astrology associated Pisces with the end of the zodiacal cycle, fluidity, and Jupiterian rulership.','The two animals became opposed curves bound by a central bar.','Medieval zodiac wheels commonly depict two linked fish beside the compact character.','Astronomy, horoscopy, calendars, medical astrology, and ritual correspondences.','♓ is the standard modern glyph.']
    ]
  };

  const genericRecordSpecs = {
    'elements-modalities': { origin: 'Greek natural philosophy, later Hellenistic, medieval, and early modern astrological classification', date: 'c. 450 BCE for the four-element scheme; current visual shorthand largely early modern', source: 'Empedocles is the earliest named four-element author; later authors and printers standardized the notation', purpose: 'To classify natural qualities and zodiacal relationships in a compact table', example: 'Elemental triangles and quality tables appear in Renaissance and early modern alchemical and astrological printed works.', related: 'Natural philosophy, humoral medicine, alchemy, astrology, and ritual correspondences.' },
    'houses-aspects': { origin: 'Hellenistic horoscopy, later Arabic, Latin, and early modern astrological practice', date: 'roughly 2nd century BCE onward; many compact glyphs are later printed shorthand', source: 'No single inventor; aspect doctrine is discussed by Hellenistic authors including Ptolemy', purpose: 'To mark chart orientation, divisions, and angular relationships quickly', example: 'Medieval and early modern horoscopes and ephemerides show house divisions, angles, nodes, and aspect marks.', related: 'Astronomy, horoscopy, eclipse calculation, electional astrology, and astrological medicine.' },
    'lunar-symbols': { origin: 'Ancient lunar observation and calendrical astronomy, transmitted through Mesopotamian, Greek, Arabic, and Latin traditions', date: 'written lunar records by the 2nd millennium BCE; standardized printed phase signs from the 15th century onward', source: 'No single inventor; calendars and astronomical tables developed the notation', purpose: 'To record a visible lunar condition or eclipse relationship with minimal space', example: 'Calendars, almanacs, eclipse diagrams, and medieval astronomical manuscripts use disks, crescents, and node imagery.', related: 'Lunar calendars, eclipse calculation, astrology, medicine, and ritual timing.' },
    'modern-planets': { origin: 'Telescopic astronomy, nineteenth- and twentieth-century ephemerides, and modern astrology', date: '1781 onward for the outer planets and newly discovered bodies', source: 'Astronomers, observatories, editors of ephemerides, and later astrologers proposed competing forms', purpose: 'To add newly identified bodies to compact astronomical tables and charts', example: 'Nineteenth-century astronomical publications and twentieth-century ephemerides preserve competing planetary and asteroid glyphs.', related: 'Astronomy, ephemerides, modern astrology, discovery announcements, and Unicode notation.' }
  };

  const genericSymbols = {
    'elements-modalities': [['fire','🜂','FIRE','upward triangle','heat, ascent, and transformation'],['earth','🜃','EARTH','downward triangle crossed by a horizontal line','weight, solidity, and material form'],['air','🜁','AIR','upward triangle crossed by a horizontal line','breath, motion, and mediation'],['water','🜄','WATER','downward triangle','dissolution, descent, and receptivity'],['cardinal','✦','CARDINAL','angular / initiating classification','the beginning of a seasonal cycle'],['fixed','◼','FIXED','stable / preserving classification','the middle and holding portion of a cycle'],['mutable','≈','MUTABLE','changing / transitional classification','the shifting end of a cycle']],
    'houses-aspects': [['ascendant','ASC','ASCENDANT','Asc · rising sign','the eastern horizon'],['midheaven','MC','MIDHEAVEN','MC · Medium Coeli','the upper culmination point'],['north-node','☊','NORTH NODE','Dragon’s Head · ascending node','the northward crossing of the lunar orbit'],['south-node','☋','SOUTH NODE','Dragon’s Tail · descending node','the southward crossing of the lunar orbit'],['conjunction','☌','CONJUNCTION','0° · coniunctio','shared celestial longitude'],['sextile','✶','SEXTILE','60°','a sixth-part relationship'],['square','□','SQUARE','90° · quadrature','a quarter-turn relationship'],['trine','△','TRINE','120°','a third-part relationship'],['opposition','☍','OPPOSITION','180°','a face-to-face relationship']],
    'lunar-symbols': [['new-moon','●','NEW MOON','dark disk · conjunction','the beginning of a lunar month'],['waxing-crescent','◔','WAXING CRESCENT','young crescent','the first return of visible light'],['first-quarter','◐','FIRST QUARTER','half-lit Moon','a half-phase after waxing'],['waxing-gibbous','◕','WAXING GIBBOUS','nearly full disk','approach toward full illumination'],['full-moon','○','FULL MOON','bright disk · opposition','maximum visible lunar illumination'],['last-quarter','◑','LAST QUARTER','half-lit Moon','the waning half-phase'],['waning-crescent','◒','WANING CRESCENT','old crescent','the final visible withdrawal of light'],['eclipse','☉ / ☽','ECLIPSE','solar/lunar alignment · node symbols','an alignment of Sun, Moon, and orbital nodes']],
    'modern-planets': [['uranus','♅','URANUS','⛢ · H-marked alternate','the planet discovered by William Herschel'],['neptune','♆','NEPTUNE','♆ · LV monogram','the planet predicted by Le Verrier and observed in 1846'],['pluto','♇','PLUTO','PL monogram · alternate forms','the body discovered by Clyde Tombaugh in 1930'],['earth','⊕','EARTH','🜨 · globe-and-cross','the terrestrial world'],['chiron','⚷','CHIRON','key-like glyph','the centaur discovered by Charles Kowal in 1977'],['ceres','⚳','CERES','sickle-like form','the body discovered by Giuseppe Piazzi in 1801'],['pallas','⚴','PALLAS','spear-like form','the body discovered by Heinrich Olbers in 1802'],['juno','⚵','JUNO','scepter-like form','the body discovered by Karl Harding in 1804'],['vesta','⚶','VESTA','hearth-like form','the body discovered by Heinrich Olbers in 1807']]
  };

  const makeGenericRecord = (folder, row) => {
    const [slug, symbol, name, alternate, focus] = row;
    const spec = genericRecordSpecs[folder];
    return [slug, symbol, name, alternate, spec.origin, spec.date, spec.source, spec.purpose, `The earliest use of this sign belongs to the visual vocabulary used to identify ${focus}.`, `Later astrological writers and readers attached interpretive meanings to ${name}; those meanings developed through practice rather than one original decree.`, `The form changed as manuscript hands, engraved tables, and printed ephemerides sought a quicker, clearer character.`, spec.example, spec.related, `${symbol} and its variants continue in modern reference charts, digital type, and Unicode where assigned.`];
  };

  Object.entries(genericSymbols).forEach(([folder, rows]) => { symbolRecordDefs[folder] = rows.map(row => makeGenericRecord(folder, row)); });

  const symbolRecords = Object.fromEntries(Object.entries(symbolRecordDefs).flatMap(([folder, rows]) => rows.map(record => [`${folder}/${record[0]}`, record])));

  const renderSymbolRecord = (folder, record) => {
    const [slug, symbol, name, alternate, earliest, date, source, purpose, original, later, development, example, related, modern] = record;
    const parent = planetaryEntries[folder];
    return `<div class="occult-page occult-symbol-record"><h2 class="welcome"><span class="occult-symbol" aria-hidden="true">${symbol}</span> ${name}</h2><p class="occult-intro">Individual archival record for the ${name} symbol.</p><table class="archive-table"><tr><th>PRIMARY FORM</th><td style="font:28px Georgia;text-align:center">${symbol}</td></tr><tr><th>ALTERNATE FORMS</th><td>${alternate}</td></tr><tr><th>EARLIEST KNOWN APPEARANCE</th><td>${earliest}</td></tr><tr><th>DATE / RANGE</th><td>${date}</td></tr><tr><th>RESPONSIBLE TRADITION</th><td>${source}</td></tr></table><section class="occult-article"><h3>WHY THE MARK WAS ADOPTED</h3><p>${purpose}</p></section><section class="occult-article"><h3>ORIGINAL AND LATER MEANINGS</h3><p><b>Original use:</b> ${original}</p><p><b>Later astrological use:</b> ${later}</p></section><section class="occult-article"><h3>FORM, TRANSMISSION &amp; EXAMPLES</h3><p><b>Change over time:</b> ${development}</p><p><b>Manuscript and printed record:</b> ${example}</p></section><section class="occult-article"><h3>RELATED USES</h3><p>${related}</p><p><b>Modern usage and variants:</b> ${modern}</p></section><section class="occult-sources"><h3>HISTORICAL VISUAL REFERENCE</h3><p>See the <a href="#occult-symbols/planetary-astrological-symbols">Planetary &amp; Astrological Symbols directory</a> for its compact historic manuscript imagery and comparison chart. These images show the wider manuscript and printed traditions in which the symbol was transmitted.</p></section><p class="occult-return"><a href="#occult-symbols/planetary-astrological-symbols/${folder}">[ BACK TO ${parent.title} ]</a> &nbsp; <a href="#occult-symbols/planetary-astrological-symbols">[ PLANETARY DIRECTORY ]</a> &nbsp; <a href="#occult-symbols">[ SYMBOLS &amp; SYMBOLISM ]</a></p></div>`;
  };

  const renderRecordLinks = folder => `<div class="occult-directory">${(symbolRecordDefs[folder] || []).map(record => {
    const [slug, symbol, name, alternate, earliest, date] = record;
    return `<div><span class="occult-symbol" aria-hidden="true">${symbol}</span><a href="#occult-symbols/planetary-astrological-symbols/${folder}/${slug}">${name}</a><p>${alternate}</p><p class="tiny">${date}</p><p><a href="#occult-symbols/planetary-astrological-symbols/${folder}/${slug}">[ OPEN SYMBOL RECORD ]</a></p></div>`;
  }).join('')}</div>`;

  const alchemyDirectories = [
    ['The Seven Metals', 'seven-metals', '☉ ☽ ☿ ♀ ♂ ♃ ♄', 'Gold, silver, mercury, copper, iron, tin, and lead, together with their planetary signs.'],
    ['The Three Principles & Four Elements', 'principles-elements', '☿ 🜍 🜔', 'Mercury, Sulfur, Salt, and the elemental triangle signs that shaped alchemical theory.'],
    ['The Great Work', 'great-work', '⚫ ⚪ 🟡 🔴', 'Nigredo, albedo, citrinitas, and rubedo: the color stages used to describe transformation.'],
    ['Alchemical Operations', 'operations', '△ ◇ ○', 'Calcination, dissolution, separation, conjunction, fermentation, distillation, and coagulation.'],
    ['Emblems & Allegorical Figures', 'emblems-figures', '☉ ☽ 🜏', 'The Sun and Moon, the Ouroboros, the Rebis, royal pairs, birds, dragons, and other visual allegories.'],
    ['Manuscripts, Books & Symbol Tables', 'manuscripts-texts', '✦ ☿ ☉', 'Historic symbol lists, emblem books, illustrated treatises, and the manuscript traditions that preserved them.']
  ];

  const alchemyEntries = {
    'seven-metals': {
      title: 'THE SEVEN METALS',
      intro: 'In traditional alchemical notation, metals and the visible planets were joined into one visual system. A planetary sign could identify both a celestial body and a corresponding metal in a recipe or diagram.',
      rows: [['☉','GOLD / SOL','Sun · perfected metal'],['☽','SILVER / LUNA','Moon · reflective metal'],['☿','MERCURY / MERCURIUS','Mercury · quicksilver'],['♀','COPPER / VENUS','Venus · copper'],['♂','IRON / MARS','Mars · iron'],['♃','TIN / JUPITER','Jupiter · tin'],['♄','LEAD / SATURN','Saturn · lead']],
      history: 'The planetary-metal scheme appears in Greek, Arabic, Latin, and early modern European alchemical writing. It made a compact notation possible while connecting laboratory substances to a larger celestial order.'
    },
    'principles-elements': {
      title: 'THE THREE PRINCIPLES & FOUR ELEMENTS',
      intro: 'Many alchemical authors described material change through three principles—Mercury, Sulfur, and Salt—while also using the older four-element vocabulary of Fire, Air, Water, and Earth.',
      rows: [['☿','MERCURY','Volatility · fluidity · mediation'],['🜍','SULFUR','Combustion · activity · color'],['🜔','SALT','Fixity · body · residue'],['🜂','FIRE','Heat · ascent · transformation'],['🜁','AIR','Breath · movement · volatility'],['🜄','WATER','Dissolution · receptivity'],['🜃','EARTH','Weight · solidity · remainder']],
      history: 'The four-element signs entered alchemy from ancient natural philosophy. The three-principle framework became especially associated with Paracelsian and early modern alchemical thought, though authors used the terms in different ways.'
    },
    'great-work': {
      title: 'THE GREAT WORK',
      intro: 'The Great Work is the long-form symbolic narrative of alchemy: a movement through breakdown, purification, illumination, and completion. Images of colors, kings, queens, animals, and celestial unions often mark its stages.',
      rows: [['⚫','NIGREDO','Blackening · dissolution · first matter'],['⚪','ALBEDO','Whitening · washing · clarification'],['🟡','CITRINITAS','Yellowing · dawning light'],['🔴','RUBEDO','Reddening · completion · conjunction'],['☉ + ☽','CONIUNCTIO','Union of solar and lunar opposites']],
      history: 'Not every alchemical author used the same stage sequence. The black-white-red progression is especially widespread, while citrinitas may appear as a distinct stage or be folded into the later red phase.'
    },
    'operations': {
      title: 'ALCHEMICAL OPERATIONS',
      intro: 'Alchemical texts combine practical operations with symbolic language. The same word can refer to a laboratory action, a change in matter, and an allegorical movement inside an emblem or narrative.',
      rows: [['△','CALCINATION','Breaking down through heat'],['≈','DISSOLUTION','Reducing a body into liquid'],['↗','SEPARATION','Sorting and isolating parts'],['☌','CONJUNCTION','Joining separated principles'],['✦','FERMENTATION','Introducing a transformative agent'],['♨','DISTILLATION','Rising, condensing, and returning'],['●','COAGULATION','Fixing or solidifying a result']],
      history: 'Operation lists vary by text and period. Their visual signs were often local to a manuscript or workshop, which is why historic symbol tables show many alternate marks for the same material or action.'
    },
    'emblems-figures': {
      title: 'EMBLEMS & ALLEGORICAL FIGURES',
      intro: 'Alchemy repeatedly turns processes into images: a serpent consuming its tail, a king and queen joining, a double-bodied figure, birds rising from vessels, and the Sun and Moon facing one another.',
      rows: [['☉ / ☽','SUN & MOON','Gold and silver · solar and lunar pair'],['◯','OUROBOROS','Cycle · enclosure · return'],['☿ + ☉ + ☽','REBIS','Conjoined opposites'],['👑','RED KING & WHITE QUEEN','Royal pair in alchemical allegory'],['🜏','DRAGON / SERPENT','Raw force · death · renewal'],['🕊','BIRDS','Volatilization · ascent · spirit']],
      history: 'Emblem books made alchemical material memorable through images, mottos, and short poems. These figures rarely have one single fixed meaning; their role changes according to the surrounding text and sequence of images.'
    },
    'manuscripts-texts': {
      title: 'MANUSCRIPTS, BOOKS & SYMBOL TABLES',
      intro: 'Alchemical signs survive in recipe books, notebooks, illustrated treatises, emblem collections, and later printed tables. These records show how varied the visual language could be from one workshop, author, or period to another.',
      rows: [['☿','SYMBOL TABLES','Lists of materials and operations'],['☉','ILLUSTRATED TREATISES','Color stages and cosmological diagrams'],['✦','EMBLEM BOOKS','Images, mottos, and explanatory verse'],['♨','LABORATORY MANUALS','Vessels, furnaces, and preparations'],['◯','PHILOSOPHICAL TEXTS','Theories of matter and transformation']],
      history: 'Important surviving traditions include Greek alchemical manuscripts, Arabic and Latin translations, Renaissance natural-philosophy texts, and early modern illustrated works. Each preserves a different mixture of laboratory practice, symbolic theory, and visual convention.'
    }
  };

  const astrologicalImages = `<div class="occult-directory occult-astro-gallery"><div><img src="https://www.wga.hu/art/zgothic/miniatur/1051-100/09_1051.jpg" alt="Medieval zodiac diagram from a French medical miscellany" loading="lazy"><p class="tiny">Medieval zodiac diagram from a French medical miscellany. The signs appear in a circular calendar-like arrangement around a central sun.</p></div><div><img src="https://pbs.twimg.com/media/DOauN2OX0AEL7sl.jpg" alt="Comparison of Arabic and Latin planetary symbols" loading="lazy"><p class="tiny">A comparison of planetary signs in the Arabic <i>Ghāyat al-Ḥakīm</i> tradition and the Latin <i>Picatrix</i>.</p></div></div>`;
  const alchemicalImages = `<div class="occult-directory occult-alchemy-gallery"><div><img src="https://cms.allardpierson.nl/storage/media/Blogs/1.-PH338.jpg" alt="Sixteenth-century alchemical symbol table" loading="lazy"><p class="tiny">A sixteenth-century manuscript table of alchemical characters, including planetary metals and material signs.</p></div><div><img src="https://cms.allardpierson.nl/storage/media/Blogs/3.-PH185-fols.-2v-3r.jpg" alt="Seventeenth-century alchemical symbol list" loading="lazy"><p class="tiny">A seventeenth-century symbol list showing the compact visual notation used for substances and operations.</p></div></div>`;

  const showPlanetaryDirectory = (parts) => {
    const target = document.getElementById('app');
    if (!target) return;
    const folder = parts[1];
    if (!folder) {
      target.innerHTML = `<div class="occult-page"><h2 class="welcome">PLANETARY & ASTROLOGICAL SYMBOLS</h2><p class="occult-intro">A directory of the signs used to map planets, zodiacal figures, lunar cycles, elements, and relationships in the astrological chart. Open a file below to view its symbol set, historical background, and related imagery.</p>${astrologicalImages}<div class="occult-directory">${planetaryDirectories.map(([name,slug,marks,description]) => `<div><span class="occult-symbol" aria-hidden="true">${marks}</span><a href="#occult-symbols/planetary-astrological-symbols/${slug}">${name.toUpperCase()}</a><p>${description}</p><p><a href="#occult-symbols/planetary-astrological-symbols/${slug}">[ OPEN DIRECTORY ]</a></p></div>`).join('')}</div><p class="occult-return"><a href="#occult-symbols">[ RETURN TO SYMBOLS &amp; SYMBOLISM ]</a> &nbsp; <a href="#occult">[ RETURN TO THE OCCULT ]</a></p></div>`;
      return;
    }
    const file = planetaryEntries[folder];
    if (!file) return;
    const record = parts[2] ? symbolRecords[`${folder}/${parts[2]}`] : null;
    if (parts[2]) {
      if (record) target.innerHTML = renderSymbolRecord(folder, record);
      return;
    }
    target.innerHTML = `<div class="occult-page"><h2 class="welcome">${file.title}</h2><p class="occult-intro">${file.intro}</p><h3 class="archive-subhead">INDIVIDUAL SYMBOL RECORDS</h3>${renderRecordLinks(folder)}<section class="occult-article"><h3>HISTORY &amp; DEVELOPMENT</h3><p>${file.history}</p></section>${file.timeline ? `<section class="occult-article"><h3>DATED SYMBOL RECORD</h3>${file.timeline}</section>` : ''}<section class="occult-sources"><h3>IMAGE &amp; READING NOTES</h3><p>Open any symbol above for its individual history, alternate forms, dated record, manuscript context, related uses, and modern variants.</p></section><p class="occult-return"><a href="#occult-symbols/planetary-astrological-symbols">[ BACK TO PLANETARY DIRECTORY ]</a> &nbsp; <a href="#occult-symbols">[ SYMBOLS &amp; SYMBOLISM ]</a></p></div>`;
  };

  const showAlchemyDirectory = (parts) => {
    const target = document.getElementById('app');
    if (!target) return;
    const folder = parts[1];
    if (!folder) {
      target.innerHTML = `<div class="occult-page"><h2 class="welcome">ALCHEMICAL SYMBOLS</h2><p class="occult-intro">A directory of the marks, diagrams, colors, substances, and visual allegories used in alchemical manuscripts and printed treatises. Open a file below to view its symbol set and historical context.</p>${alchemicalImages}<div class="occult-directory">${alchemyDirectories.map(([name,slug,marks,description]) => `<div><span class="occult-symbol" aria-hidden="true">${marks}</span><a href="#occult-symbols/alchemical-symbols/${slug}">${name.toUpperCase()}</a><p>${description}</p><p><a href="#occult-symbols/alchemical-symbols/${slug}">[ OPEN DIRECTORY ]</a></p></div>`).join('')}</div><p class="occult-return"><a href="#occult-symbols">[ RETURN TO SYMBOLS &amp; SYMBOLISM ]</a> &nbsp; <a href="#occult">[ RETURN TO THE OCCULT ]</a></p></div>`;
      return;
    }
    const file = alchemyEntries[folder];
    if (!file) return;
    target.innerHTML = `<div class="occult-page"><h2 class="welcome">${file.title}</h2><p class="occult-intro">${file.intro}</p><table class="archive-table"><tr><th>SYMBOL</th><th>NAME</th><th>ASSOCIATIONS</th></tr>${file.rows.map(([symbol,name,meaning]) => `<tr><td style="font:26px Georgia;text-align:center">${symbol}</td><td><b>${name}</b></td><td>${meaning}</td></tr>`).join('')}</table><section class="occult-article"><h3>HISTORY &amp; DEVELOPMENT</h3><p>${file.history}</p></section><section class="occult-sources"><h3>IMAGE &amp; READING NOTES</h3><p>Historic manuscript imagery at the main directory shows the varied character systems that circulated in alchemical writing. Individual records can later expand into illustrated manuscript examples, associated authors, and related material signs.</p></section><p class="occult-return"><a href="#occult-symbols/alchemical-symbols">[ BACK TO ALCHEMICAL DIRECTORY ]</a> &nbsp; <a href="#occult-symbols">[ SYMBOLS &amp; SYMBOLISM ]</a></p></div>`;
  };

  const showSymbolDirectory = () => {
    const parts = decodeURIComponent(location.hash.replace(/^#occult-symbols\//, '')).split('/');
    if (parts[0] === 'planetary-astrological-symbols') return showPlanetaryDirectory(parts);
    if (parts[0] === 'alchemical-symbols') return showAlchemyDirectory(parts);
    const item = symbolDirectories.find(([, slug]) => slug === parts[0]);
    if (!item || parts[1]) return;
    const [title] = item;
    const target = document.getElementById('app');
    if (!target) return;
    target.innerHTML = `<div class="occult-page"><h2 class="welcome">${title}</h2><p class="occult-return"><a href="#occult-symbols">[ RETURN TO SYMBOLS &amp; SYMBOLISM ]</a> &nbsp; <a href="#occult">[ RETURN TO THE OCCULT ]</a></p></div>`;
    const crumb = document.getElementById('crumb');
    if (crumb) crumb.textContent = `THE OCCULT > SYMBOLS & SYMBOLISM > ${title}`;
  };

  const linkSymbolDirectories = () => {
    if (location.hash !== '#occult-symbols') return;
    document.querySelectorAll('.occult-page .occult-article h3').forEach((heading, index) => {
      const item = symbolDirectories[index];
      if (!item || heading.dataset.symbolDirectory) return;
      heading.dataset.symbolDirectory = item[1];
      heading.tabIndex = 0;
      heading.style.cursor = 'pointer';
      heading.setAttribute('role', 'link');
      heading.setAttribute('aria-label', `Open ${item[0]} directory`);
      const open = document.createElement('p');
      open.innerHTML = `<a href="#occult-symbols/${item[1]}">[ OPEN DIRECTORY ]</a>`;
      heading.closest('.occult-article')?.append(open);
      heading.addEventListener('click', () => { location.hash = `occult-symbols/${item[1]}`; });
      heading.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); location.hash = `occult-symbols/${item[1]}`; }
      });
    });
  };

  const syncSymbolDirectories = () => {
    if (location.hash.startsWith('#occult-symbols/')) showSymbolDirectory();
    else linkSymbolDirectories();
  };
  addEventListener('hashchange', () => setTimeout(syncSymbolDirectories, 0));
  syncSymbolDirectories();
})();
