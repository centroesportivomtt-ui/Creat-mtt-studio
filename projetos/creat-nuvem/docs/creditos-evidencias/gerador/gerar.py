import sys, os, importlib
sys.path.insert(0, os.path.dirname(__file__))
os.makedirs('svg', exist_ok=True)
for mod in sys.argv[1:]:
    m = importlib.import_module(mod)
    for nome, f in m.CENAS.items():
        open(f'svg/{nome}.svg', 'w').write(f())
        print('svg', nome)
