import re
with open('dist/renderer/assets/index-Dq2YoLTe.js', 'r') as f:
    c = f.read()
for term in ['scrollTop', 'scrollIntoView', 'overscroll', 'scrollHeight', 'scrollBehavior']:
    print(f"{term}: {'FOUND' if term in c else 'NOT FOUND'}")
