#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import argparse, hashlib, json, re, subprocess, sys

HEAD_BEGIN='<!-- UNSEEN_EARTH_HEAD_BEGIN -->'; HEAD_END='<!-- UNSEEN_EARTH_HEAD_END -->'
BODY_BEGIN='<!-- UNSEEN_EARTH_BODY_BEGIN -->'; BODY_END='<!-- UNSEEN_EARTH_BODY_END -->'
SECTION_BEGIN='<!-- UNSEEN_EARTH_SECTION_BEGIN -->'; SECTION_END='<!-- UNSEEN_EARTH_SECTION_END -->'

def sha(b): return hashlib.sha256(b).hexdigest()

def strip_region(s,a,b):
    if s.count(a)!=1 or s.count(b)!=1: raise AssertionError(f'Marker count failure for {a}')
    i=s.index(a); j=s.index(b,i)+len(b)
    # Integration emits one leading/trailing newline around each marker region.
    if i>0 and s[i-1]=='\n': i-=1
    if j<len(s) and s[j]=='\n': j+=1
    return s[:i]+s[j:]

def extract_db(s):
    st=s.index('const DB='); js=s.index('{',st); d=0; instr=False; esc=False
    for i,ch in enumerate(s[js:],js):
        if instr:
            if esc: esc=False
            elif ch=='\\': esc=True
            elif ch=='"': instr=False
            continue
        if ch=='"': instr=True
        elif ch=='{': d+=1
        elif ch=='}':
            d-=1
            if d==0:return s[js:i+1]
    raise AssertionError('DB end not found')

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('dir'); args=ap.parse_args()
    d=Path(args.dir); orig=(d/'index.original.html').read_bytes(); integ=(d/'index.html').read_bytes()
    os=orig.decode('utf-8'); ins=integ.decode('utf-8')
    errors=[]; checks={}
    def ck(name,cond,detail=''):
        checks[name]=bool(cond)
        if not cond: errors.append(name+((': '+detail) if detail else ''))
    # Remove integration patches and prove byte-for-byte preservation.
    stripped=ins
    for a,b in [(HEAD_BEGIN,HEAD_END),(SECTION_BEGIN,SECTION_END),(BODY_BEGIN,BODY_END)]:
        try: stripped=strip_region(stripped,a,b)
        except Exception as e: errors.append(f'strip {a}: {e}')
    ck('original round-trip byte identity', stripped.encode('utf-8')==orig,
       f'{sha(stripped.encode())} != {sha(orig)}')
    ck('embedded DB byte identity', extract_db(ins)==extract_db(os))
    db=json.loads(extract_db(ins)); E=db['entities']; ids=[e['id'] for e in E]; slugs=[e['slug'] for e in E]
    ck('exactly 913 public entities',len(E)==913,str(len(E)))
    ck('913 unique entity IDs',len(set(ids))==913,str(len(set(ids))))
    ck('913 unique entity slugs',len(set(slugs))==913,str(len(set(slugs))))
    ck('legacy endpoints preserved',all(x in ins for x in ['entity-index','archive-tree','alien-species','uap','cases','world','contact','ufo-restricted/']))
    ck('File 914 preserved','THERE ARE 913 PUBLIC ENTITY FILES.' in ins and 'THERE ARE 914 FILES ON SERVER.' in ins)
    ck('visitor counter preserved','uaResearchVisits' in ins and '661372+visits' in ins)
    ck('contact demo preserved','DEMO FORM — NOTHING IS TRANSMITTED.' in ins and 'REPORT STORED IN THIS PAGE ONLY. NOTHING TRANSMITTED.' in ins)
    ck('Earth section exactly once',ins.count(SECTION_BEGIN)==1 and ins.count('data-unseen-earth')==1)
    js=(d/'paranormal-earth.js').read_text('utf-8'); css=(d/'paranormal-earth.css').read_text('utf-8')
    # Phase-1 forbidden integration: no archive data, IDs, case links or marker payloads in Earth module.
    ck('Earth module contains no entity route payload','data-entity=' not in js and "go('entity/" not in js and '#entity/' not in js)
    ck('Earth module contains no archive coordinates','mapPoints' not in js and not re.search(r'\b(?:lat|latitude)\s*:\s*-?\d+(?:\.\d+)?',js,re.I) and not re.search(r'\b(?:lon|lng|longitude)\s*:\s*-?\d+(?:\.\d+)?',js,re.I))
    ck('Earth module declares entity layer offline','ENTITY COORDINATES: NOT LOADED' in (d/'earth-fragment.html').read_text('utf-8'))
    ck('Earth lazy loading present','IntersectionObserver' in js and 'import(THREE_URL)' in js)
    ck('interaction controls present',all(x in js for x in ['pointerdown','pointermove','wheel','lastPinch','requestFullscreen','resetView']))
    ck('context recovery present','webglcontextlost' in js and 'webglcontextrestored' in js)
    ck('reduced motion present','prefers-reduced-motion' in js and 'prefers-reduced-motion' in css)
    ck('fallback present','fallbackSvg' in js and 'ua-fallback' in js)
    # JS syntax checks: Earth module and the site's full inline application script.
    p=subprocess.run(['node','--check',str(d/'paranormal-earth.js')],capture_output=True,text=True)
    ck('Earth JS syntax',p.returncode==0,(p.stderr or p.stdout).strip())
    blocks=re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>',ins,re.S|re.I)
    inline=max((b for b in blocks if b.strip()), key=len, default='')
    tmp=d/'.qa-inline-site.js'; tmp.write_text(inline,encoding='utf-8')
    p2=subprocess.run(['node','--check',str(tmp)],capture_output=True,text=True)
    ck('integrated site inline JS syntax',bool(inline) and p2.returncode==0,(p2.stderr or p2.stdout).strip())
    try: tmp.unlink()
    except FileNotFoundError: pass
    h0=ins.find('function home(){'); h1=ins.find('function entityIndex',h0)
    ck('Earth section is homepage-only',h0>=0 and h1>h0 and SECTION_BEGIN in ins[h0:h1] and SECTION_BEGIN not in ins[:h0] and SECTION_BEGIN not in ins[h1:])
    report={'pass':not errors,'checks':checks,'errors':errors,'source_sha256':sha(orig),'integrated_sha256':sha(integ),'db_sha256':sha(extract_db(ins).encode())}
    (d/'PHASE1-QA-REPORT.json').write_text(json.dumps(report,indent=2)+'\n')
    md=['# Phase 1 Earth Integration QA','',f"**Result:** {'PASS' if not errors else 'FAIL'}",'',f"- Source SHA-256: `{report['source_sha256']}`",f"- Integrated SHA-256: `{report['integrated_sha256']}`",f"- Embedded DB SHA-256: `{report['db_sha256']}`",'']
    md += [('✅ ' if v else '❌ ')+k for k,v in checks.items()]
    if errors: md += ['','## Errors']+[f'- {e}' for e in errors]
    (d/'PHASE1-QA-REPORT.md').write_text('\n'.join(md)+'\n')
    print('\n'.join(md))
    if errors: sys.exit(1)
if __name__=='__main__': main()
