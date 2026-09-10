from pathlib import Path
import re

path = Path('index.html')
src = path.read_text(encoding='utf-8')

start = src.index('function entityPage(slug){')
end = src.find('\nfunction ', start + len('function entityPage(slug){'))
if end < 0:
    raise SystemExit('Could not locate end of entityPage()')

helper = r'''function dossierFieldParagraphs(values,fallback=''){
 const rows=Array.isArray(values)&&values.length?values:(fallback?[fallback]:[]);
 return rows.map(value=>`<p>${esc(typeof value==='string'?value:(value?.detail||value?.heading||''))}</p>`).join('');
}
function dossierFieldSightings(items){
 const rows=Array.isArray(items)?items:[];
 return `<div class="dossier-sighting-list">${rows.map(item=>`<article class="dossier-sighting"><h4>${esc(item?.heading||'Notable account')}</h4>${item?.detail?`<p>${esc(item.detail)}</p>`:''}</article>`).join('')}</div>`;
}
function dossierFieldHeader(e){
 const f=e.dossierFields||{},rf=f.reportFrequency||{};
 const origin=(Array.isArray(f.geographicalOrigin)&&f.geographicalOrigin[0])||e.origin||e.country||'Regional tradition';
 const aliases=(e.aliases||[]).filter(alias=>String(alias).toLowerCase()!==String(e.name).toLowerCase()).slice(0,3);
 const nav=[['dossier-overview','Overview'],['dossier-appearance','Appearance'],['dossier-behavior','Behavior'],['dossier-sightings','Sightings'],['dossier-abilities','Abilities'],['dossier-weaknesses','Weaknesses'],['dossier-geography','Origin'],['dossier-frequency','Frequency'],['dossier-culture','Culture'],['dossier-science','Explanations'],['dossier-controversy','Controversies'],['dossier-sources','Sources']];
 return `<nav class="dossier-nav" aria-label="Dossier sections">${nav.map(([id,label])=>`<a href="#${id}" data-dossier-anchor="${id}" onclick="event.preventDefault();document.getElementById('${id}')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})">${label}</a>`).join('')}</nav><section class="dossier-overview" id="dossier-overview" data-dossier-enhanced="${esc(e.slug)}"><div class="dossier-overview-head"><span>DOSSIER OVERVIEW</span><small>${esc(e.id)}</small></div><div class="dossier-quickfacts"><div><b>CLASSIFICATION</b><span>${esc(e.category||e.type||'Paranormal entity')}</span></div><div><b>GEOGRAPHICAL ORIGIN</b><span>${esc(origin)}</span></div><div><b>REPORT FREQUENCY</b><span>${esc(rf.label||'Qualitative archive profile')}</span></div><div><b>PRIMARY REGION</b><span>${esc(e.country||e.origin||'Varies by tradition')}</span></div>${aliases.length?`<div><b>ALSO KNOWN AS</b><span>${aliases.map(esc).join(' · ')}</span></div>`:''}<div><b>SOURCE TRAIL</b><span>${Number(e.sourceCount||(e.sources||[]).length)||0} named references</span></div></div></section>`;
}
'''

if 'function dossierFieldHeader(e){' not in src:
    src = src[:start] + helper + src[start:]
    start = src.index('function entityPage(slug){')
    end = src.find('\nfunction ', start + len('function entityPage(slug){'))

block = src[start:end]

old = " const e=E.find(x=>x.slug===slug); if(!e)return notFound();"
new = " const e=E.find(x=>x.slug===slug); if(!e)return notFound();\n const df=e.dossierFields||{};"
if old not in block:
    raise SystemExit('entity lookup anchor not found')
block = block.replace(old, new, 1)

block, n = re.subn(r" const fiction=e\.sourceCode==='O'\?`<div class=\\?\"fiction\\?\">.*?</div>`:'';", " const fiction='';", block, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'fiction banner replacement count={n}')

# Public-facing review line: keep dates/source count, remove internal batch/status prose.
block, n = re.subn(r"\$\{fiction\}<div class=\"status\">\$\{esc\(e\.researchStatus\)\}.*?</div>", "${fiction}<div class=\"status\">ARCHIVE REVIEW · INFORMATION CURRENT THROUGH: ${esc(e.currentThrough||e.reviewDate||'current archive review')} · ATTACHED SOURCE LINKS: ${e.sourceCount||0}</div>", block, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'status replacement count={n}')

# Remove the reader-facing reality-status row and the parenthetical fictional/editorial danger label.
block, n = re.subn(r'<tr><th>CURRENT STATUS</th><td>.*?</td></tr>', '', block, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'current status row replacement count={n}')
block = block.replace(' <span class="tiny">(editorial / fictional)</span>', '', 1)

# Insert canonical navigation/overview directly into the base renderer before dossier sections.
ety = ' <table class="box"><tr><td class="box-title">ETYMOLOGY & NAME HISTORY</td></tr>'
if ety not in block:
    raise SystemExit('etymology section anchor not found')
block = block.replace(ety, ' ${dossierFieldHeader(e)}\n <table class="box"><tr><td class="box-title">ETYMOLOGY & NAME HISTORY</td></tr>', 1)

def replace_table(title, replacement):
    global block
    pattern = re.compile(r'<table class="box"><tr><td class="box-title(?: [^"]*)?">'+re.escape(title)+r'</td></tr><tr><td class="box-body">.*?</td></tr></table>', re.S)
    block2, count = pattern.subn(replacement, block, count=1)
    if count != 1:
        raise SystemExit(f'{title}: replacement count={count}')
    block = block2

replace_table('GEOGRAPHICAL ORIGIN / REPORTED OR TRADITIONAL DISTRIBUTION', r'''<table id="dossier-geography" class="box"><tr><td class="box-title green">GEOGRAPHICAL ORIGIN & DISTRIBUTION</td></tr><tr><td class="box-body"><div class="dossier-field-summary" data-field-summary>${dossierFieldParagraphs(df.geographicalOrigin,e.origin||e.country)}</div>${mapHtml(e)}<h3>MOST IMPORTANT ASSOCIATED LOCATIONS</h3>${associatedLocations(e)}<p class="tiny">Mapped points distinguish cultural range, historical records, modern reports and named cases.</p></td></tr></table>''')
replace_table('FAMOUS SIGHTINGS / DOCUMENTED CASE FILES', r'''<table id="dossier-sightings" class="box"><tr><td class="box-title">FAMOUS SIGHTINGS & REPORT TRADITIONS</td></tr><tr><td class="box-body">${dossierFieldSightings(df.famousSightings)}</td></tr></table>''')
replace_table('BEHAVIOR / REPORTED HABITAT', r'''<table id="dossier-behavior" class="box"><tr><td class="box-title green">BEHAVIOR / REPORTED HABITAT</td></tr><tr><td class="box-body">${dossierFieldParagraphs(df.behavior,e.behaviorLong)}${e.habitatLong?`<div class="dossier-subfact"><b>SETTING / HABITAT</b><p>${esc(e.habitatLong)}</p></div>`:''}${(e.warningSigns||[]).length?`<div class="dossier-subfact"><b>RECURRING SIGNS / PRECURSORS</b><ul>${e.warningSigns.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}</td></tr></table>''')
replace_table('WEAKNESSES, PROTECTION & PRACTICAL SAFETY', r'''<table id="dossier-weaknesses" class="box"><tr><td class="box-title red">WEAKNESSES, LIMITATIONS & PROTECTIONS</td></tr><tr><td class="box-body">${dossierFieldParagraphs(df.weaknesses,e.protection)}</td></tr></table>''')
replace_table('CULTURAL SIGNIFICANCE', r'''<table id="dossier-culture" class="box"><tr><td class="box-title purple">CULTURAL SIGNIFICANCE</td></tr><tr><td class="box-body">${dossierFieldParagraphs(df.culturalSignificance,e.culture)}</td></tr></table>''')
replace_table('SCIENTIFIC / SKEPTICAL EXPLANATIONS', r'''<table id="dossier-science" class="box"><tr><td class="box-title green">SCIENTIFIC & CONVENTIONAL EXPLANATIONS</td></tr><tr><td class="box-body">${dossierFieldParagraphs(df.scientificExplanations,e.skeptical)}</td></tr></table>''')
replace_table('HOAXES, MISIDENTIFICATIONS & CONTROVERSIES', r'''<table id="dossier-controversy" class="box"><tr><td class="box-title yellow">HOAXES, MISIDENTIFICATIONS & CONTROVERSIES</td></tr><tr><td class="box-body">${dossierFieldParagraphs(df.hoaxesAndControversies,e.controversy)}</td></tr></table>''')
replace_table('REPORT FREQUENCY / DATA QUALITY', r'''<table id="dossier-frequency" class="box"><tr><td class="box-title">REPORT FREQUENCY</td></tr><tr><td class="box-body"><div class="dossier-frequency-label">${esc(df.reportFrequency?.label||'Qualitative archive profile')}</div><p>${esc(df.reportFrequency?.explanation||'Report frequency is recorded qualitatively from the attached case, chronology and source material.')}</p></td></tr></table>''')

# Add stable navigation targets to remaining core sections without rewriting their contents.
for title, did in [
    ('PHYSICAL DESCRIPTION','dossier-appearance'),
    ('ABILITIES / ATTRIBUTES','dossier-abilities'),
    ('SOURCES & FURTHER RESEARCH','dossier-sources'),
]:
    pattern = re.compile(r'<table class="box"><tr><td class="box-title([^>]*)">'+re.escape(title)+r'</td></tr>')
    block2, count = pattern.subn(r'<table id="'+did+r'" class="box"><tr><td class="box-title\1">'+title+r'</td></tr>', block, count=1)
    if count != 1:
        raise SystemExit(f'{title}: id insertion count={count}')
    block = block2

# Remove the old abilities disclaimer because the dossier now presents archive traits directly.
block = block.replace('<p class="tiny">Abilities are source motifs, not verified biological capabilities.</p>', '', 1)

src = src[:start] + block + src[end:]
src = src.replace('[O] original archive fiction', '[O] archive-origin')

path.write_text(src, encoding='utf-8')
print('Patched entityPage() to render canonical dossier fields and navigation directly.')
