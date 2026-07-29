from pathlib import Path

path = Path('src/app/admin/(painel)/menu/page.tsx')
source = path.read_text(encoding='utf-8')
needle = '''                        <div className="flex flex-shrink-0 items-center gap-2">
                          <button
                            onClick={() => startEditingCat(category)}'''
replacement = '''                        <div className="flex flex-shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void toggleCategoryStatus(category)}
                            disabled={categoryStatusUpdatingId === category.id}
                            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition disabled:cursor-wait disabled:opacity-60 ${
                              category.is_active === false
                                ? "border-orange-200 bg-[#fff0e8] text-[var(--brand)]"
                                : "border-[var(--line)] bg-white text-gray-600 hover:border-orange-200"
                            }`}
                            title={category.is_active === false ? "Reativar categoria" : "Pausar categoria"}
                            aria-label={category.is_active === false ? `Reativar categoria ${category.name}` : `Pausar categoria ${category.name}`}
                          >
                            {categoryStatusUpdatingId === category.id ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Power size={15} />
                            )}
                            <span className="hidden sm:inline">
                              {category.is_active === false ? "Reativar" : "Pausar"}
                            </span>
                          </button>
                          <button
                            onClick={() => startEditingCat(category)}'''
if needle not in source:
    raise SystemExit('category actions anchor not found')
source = source.replace(needle, replacement, 1)
path.write_text(source, encoding='utf-8')
