from pathlib import Path

path = Path('.github/scripts/apply-priority-one.py')
source = path.read_text(encoding='utf-8')
old = '''            <div className="admin-page-shell grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
              <AdminSkeleton className="h-10 w-10 lg:hidden" />
              <AdminSkeleton className="h-11 w-full max-w-2xl justify-self-start" />
              <div className="flex gap-2">
                <AdminSkeleton className="h-10 w-10" />
                <AdminSkeleton className="h-10 w-10" />
              </div>
            </div>'''
new = '''          <div className="admin-page-shell grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <AdminSkeleton className="h-10 w-10 lg:hidden" />
            <AdminSkeleton className="h-11 w-full max-w-2xl justify-self-start" />
            <div className="flex gap-2">
              <AdminSkeleton className="h-10 w-10" />
              <AdminSkeleton className="h-10 w-10" />
            </div>
          </div>'''
if old not in source:
    raise RuntimeError('Bloco do skeleton não encontrado no aplicador')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
