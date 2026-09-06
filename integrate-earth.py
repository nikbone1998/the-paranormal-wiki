#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import argparse, hashlib, json, re, shutil, sys

HEAD_BEGIN='<!-- UNSEEN_EARTH_HEAD_BEGIN -->'
HEAD_END='<!-- UNSEEN_EARTH_HEAD_END -->'
BODY_BEGIN='<!-- UNSEEN_EARTH_BODY_BEGIN -->'
BODY_END='<!-- UNSEEN_EARTH_BODY_END -->'
SECTION_BEGIN='<!-- UNSEEN_EARTH_SECTION_BEGIN -->'
SECTION_END='<!-- UNSEEN_EARTH_SECTION_END -->'

def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def extract_db_text(s: str) -> str:
    start=s.index('const DB=')
    jstart=s.index('{', start)
    depth=0; instr=False; esc=False
    for i,ch in enumerate(s[jstart:], jstart):
        if instr:
            if esc: esc=False
            elif ch=='\\': esc=True
            elif ch=='"': instr=False
            continue
        if ch=='"': instr=True
        elif ch=='{': depth+=1
        elif ch=='}':
            depth-=1
            if depth==0:
                return s[jstart:i+1]
    raise ValueError('Could not find end of DB JSON')

def audit_source(s: str) -> dict:
    dbtxt=extract_db_text(s)
    db=json.loads(dbtxt)
    entities=db.get('entities', [])
    ids=[e.get('id') for e in entities]
    slugs=[e.get('slug') for e in entities]
    if len(entities)!=913:
        raise ValueError(f'Expected 913 entities, found {len(entities)}')
    if len(set(ids))!=913 or None in ids:
        raise ValueError('Entity IDs are not exactly 913 unique non-null values')
    if len(set(slugs))!=913 or None in slugs:
        raise ValueError('Entity slugs are not exactly 913 unique non-null values')
    required=[
        '[ ENTITY INDEX ]','[ CATEGORIES ]','[ CULTURES ]','[ COUNTRIES ]','[ ARCHIVE TREE ]',
        '[ EXTRATERRESTRIAL ARCHIVE ]','[ MODERN UAP ]','[ CASES ]','[ MAP INDEX ]','[ SEARCH ]','[ ABOUT ]','[ CONTACT ]',
        '/UNKNOWN/914/','ufo-restricted/','uaResearchVisits','DEMO FORM — NOTHING IS TRANSMITTED.',
        'THERE ARE 913 PUBLIC ENTITY FILES.',
        'mapPoints','researchStatus','researchTier','currentThrough','caseFiles','NETSCAPE NAVIGATOR 4.0'
    ]
    missing=[x for x in required if x not in s]
    if missing:
        raise ValueError('Required current-site features missing: '+', '.join(missing))
    return {
        'entities': len(entities), 'unique_ids': len(set(ids)), 'unique_slugs': len(set(slugs)),
        'first_entity': ids[0], 'last_entity': ids[-1],
        'aliens': len(db.get('aliens',[])), 'cases': len(db.get('cases',[])),
        'timeline': len(db.get('timeline',[])), 'shapes': len(db.get('shapes',[])),
        'db_sha256': sha256_bytes(dbtxt.encode('utf-8')),
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('source')
    ap.add_argument('outdir')
    ap.add_argument('--module-dir', default=str(Path(__file__).resolve().parent))
    args=ap.parse_args()
    src=Path(args.source); out=Path(args.outdir); mod=Path(args.module_dir)
    raw=src.read_bytes(); s=raw.decode('utf-8')
    audit=audit_source(s)
    for marker in (HEAD_BEGIN, HEAD_END, BODY_BEGIN, BODY_END, SECTION_BEGIN, SECTION_END):
        if marker in s:
            raise ValueError(f'Source already contains Earth marker: {marker}')

    frag=(mod/'earth-fragment.html').read_text('utf-8').strip()
    if not (frag.startswith(SECTION_BEGIN) and frag.endswith(SECTION_END)):
        raise ValueError('earth-fragment.html markers missing')
    # Keep the fragment literal safe inside the site's home() template literal.
    if '`' in frag or '${' in frag:
        raise ValueError('Earth fragment contains template-literal syntax')

    # Head: stylesheet only.
    head_patch=f'\n{HEAD_BEGIN}\n<link rel="stylesheet" href="./paranormal-earth.css">\n{HEAD_END}\n'
    if s.count('</head>')!=1:
        raise ValueError('Unexpected </head> count')
    s=s.replace('</head>', head_patch+'</head>', 1)

    # Home route: insert at the end of the HOME template before shell() closes.
    h0=s.index('function home(){')
    h1=s.index('function entityIndex', h0)
    home=s[h0:h1]
    close=home.rfind('`);')
    if close<0:
        raise ValueError('Could not locate end of home template')
    abspos=h0+close
    s=s[:abspos]+'\n'+frag+'\n'+s[abspos:]

    # Body: module loader. Observer inside the module handles SPA remounts.
    body_patch=f'\n{BODY_BEGIN}\n<script src="./paranormal-earth.js"></script>\n{BODY_END}\n'
    if s.count('</body>')!=1:
        raise ValueError('Unexpected </body> count')
    s=s.replace('</body>', body_patch+'</body>', 1)

    out.mkdir(parents=True, exist_ok=True)
    (out/'index.original.html').write_bytes(raw)
    (out/'index.html').write_text(s, encoding='utf-8', newline='')
    for name in ['paranormal-earth.css','paranormal-earth.js','earth-fragment.html','README.md','vercel.json']:
        shutil.copy2(mod/name, out/name)
    # Save audit provenance for validation and future merges.
    manifest={
        'source_filename': src.name,
        'source_sha256': sha256_bytes(raw),
        **audit,
        'integrated_sha256': sha256_bytes(s.encode('utf-8')),
        'earth_js_sha256': sha256_bytes((mod/'paranormal-earth.js').read_bytes()),
        'earth_css_sha256': sha256_bytes((mod/'paranormal-earth.css').read_bytes()),
        'earth_phase': 'Phase 1 — Earth engine only; entity coordinate layer intentionally absent',
    }
    (out/'INTEGRATION-MANIFEST.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps(manifest,indent=2,ensure_ascii=False))

if __name__=='__main__':
    main()
