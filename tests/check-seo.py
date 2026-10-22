import json, re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
class Page(HTMLParser):
 def __init__(self,html):
  super().__init__();self.tags=[];self.title='';self.in_title=False;self.h1=0;self.feed(html)
 def handle_starttag(self,t,a):
  a=dict(a);self.tags.append((t,a))
  if t=='title':self.in_title=True
  if t=='h1':self.h1+=1
 def handle_endtag(self,t):
  if t=='title':self.in_title=False
 def handle_data(self,s):
  if self.in_title:self.title+=s
 def values(self,tag,key,value,out):return [a[out] for t,a in self.tags if t==tag and a.get(key)==value]
pages={};titles=set()
for f in Path('docs').rglob('*.html'):
 h=f.read_text();p=Page(h)
 if f.name=='404.html':
  assert p.values('meta','name','robots','content')==['noindex'];continue
 assert '{{' not in h,f
 assert p.h1==1,(f,p.h1)
 title_key=(f.parent,p.title)
 assert p.title and title_key not in titles,(f,p.title)
 titles.add(title_key)
 canonical=p.values('link','rel','canonical','href');assert len(canonical)==1,f
 url=canonical[0];assert url.startswith('https://parasion.art/'),f
 parts=urlsplit(url);local=Path('docs')/parts.path.lstrip('/')
 local=local/'index.html' if parts.path.endswith('/') else local.with_suffix('.html')
 assert local==f,(f,local)
 assert p.values('meta','property','og:title','content')==[p.title]
 desc=p.values('meta','name','description','content');assert len(desc)==1 and 70<=len(desc[0])<=200,(f,desc)
 assert p.values('meta','property','og:description','content')==desc
 assert p.values('meta','name','twitter:title','content')==[p.title]
 assert p.values('meta','name','twitter:description','content')==desc
 alternates={a['hreflang']:a['href'] for t,a in p.tags if t=='link' and a.get('hreflang')}
 assert set(alternates)=={'pl','en','de','es'}
 for raw in re.findall(r'<script type="application/ld\+json">([\s\S]*?)</script>',h):json.loads(raw)
 assert 'sculptor artist' not in h.lower(),f
 pages[url]=(p,alternates)
for url,(p,alternates) in pages.items():
 for lang,target in alternates.items():
  assert target in pages,target
  assert pages[target][1]==alternates,(url,target)
ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9','x':'http://www.w3.org/1999/xhtml'}
root=ET.parse('docs/sitemap.xml').getroot();locs=[]
for entry in root.findall('s:url',ns):
 loc=entry.find('s:loc',ns).text;locs.append(loc)
 alt={a.attrib['hreflang']:a.attrib['href'] for a in entry.findall('x:link',ns)}
 assert alt==pages[loc][1]
assert len(locs)==len(set(locs))==44
assert set(locs)==set(pages)
print('PASS: 44 unique titles and descriptions, canonical targets, reciprocal language links, valid JSON-LD, one H1 per page, complete sitemap and noindex 404.')
for lang in ['','en/','de/','es/']:
 p=Page(Path('docs',lang,'index.html').read_text());print(p.title)
