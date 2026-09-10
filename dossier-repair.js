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
    return [...app.children].filter(node => node.matches?.('table.box'));
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

    organizeCore(app, [
      appearanceBox,
      behaviorBox,
      sightingsBox,
      abilitiesBox,
      weaknessesBox,
      geoBox,
      frequencyBox,
      cultureBox,
      scienceBox,
      controversyBox,
      etymologyBox,
      historyBox,
      timelineBox
    ]);

    groupResearchNotes(app);

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
      @media(max-width:680px){
        .dossier-nav{top:0;margin-left:-3px;margin-right:-3px;padding:5px 4px}
        .dossier-nav a{padding:5px 6px;font-size:9px}
        .dossier-quickfacts{grid-template-columns:1fr}
        .dossier-quickfacts>div{grid-template-columns:112px 1fr}
        .dossier-quickfacts>div:nth-child(odd){border-right:0}
        .dossier-core-sections .box-body{padding:8px}
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
})();
