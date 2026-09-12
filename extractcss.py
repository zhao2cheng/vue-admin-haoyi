import re
css = open('proto.css').read()
scopes = {'login': '4cb38ed3', 'dashboard': 'f210e3ae', 'stations': '9e10960b', 'chargingorders': 'aefdf1df'}
# also some pages may use a second scope id; capture any data-v within the component segment too
segmap = {}
for k in scopes:
    segmap[k] = open('seg_%s.txt' % k).read()
# collect all data-v ids referenced in each segment
extra = {}
for k in scopes:
    extra[k] = set(re.findall(r'data-v-([0-9a-f]+)', segmap[k]))
# Split css into rules
rules = re.findall(r'([^{}]*)\{([^{}]*)\}', css)
for k, sid in scopes.items():
    ids = set([sid]) | extra[k]
    out = []
    for sel, body in rules:
        if any('data-v-%s' % i in sel for i in ids):
            out.append('%s{%s}' % (sel.strip(), body.strip()))
    open('css_%s.txt' % k, 'w').write('\n'.join(out))
    print(k, 'rules:', len(out), 'extra ids:', extra[k]-set([sid]))
