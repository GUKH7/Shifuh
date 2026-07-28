from pathlib import Path

page_path = Path('src/app/admin/(painel)/orders/page.tsx')
source = page_path.read_text(encoding='utf-8')


def replace_once(before: str, after: str, label: str) -> None:
    global source
    if before not in source:
        raise SystemExit(f'missing replacement target: {label}')
    source = source.replace(before, after, 1)


replace_once(
    'import { useEffect, useMemo, useState } from "react";',
    'import { useEffect, useMemo, useRef, useState } from "react";',
    'react imports',
)

replace_once(
    '''  const supabase = createBrowserClient(\n    process.env.NEXT_PUBLIC_SUPABASE_URL!,\n    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,\n  );''',
    '''  const supabase = useMemo(\n    () => createBrowserClient(\n      process.env.NEXT_PUBLIC_SUPABASE_URL!,\n      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,\n    ),\n    [],\n  );''',
    'stable supabase client',
)

replace_once(
    '  const [lastSeenOrderId, setLastSeenOrderId] = useState("");',
    '  const lastSeenOrderIdRef = useRef("");',
    'last seen order ref',
)

replace_once(
    'payload.new.id !== lastSeenOrderId',
    'payload.new.id !== lastSeenOrderIdRef.current',
    'realtime duplicate guard',
)

replace_once(
    '            setLastSeenOrderId(String(payload.new.id));',
    '            lastSeenOrderIdRef.current = String(payload.new.id);',
    'remember realtime order',
)

replace_once(
    '  }, [isChimeEnabled, isCurrentDate, lastSeenOrderId, restaurantId, showToast, supabase]);',
    '  }, [isChimeEnabled, isCurrentDate, restaurantId, showToast, supabase]);',
    'realtime dependencies',
)

refresh_effect = '''\n  useEffect(() => {\n    if (!restaurantId || !isCurrentDate) return;\n\n    const refreshOrders = () => {\n      void fetchOrders(false);\n    };\n    const handleVisibilityChange = () => {\n      if (document.visibilityState === "visible") refreshOrders();\n    };\n\n    const intervalId = window.setInterval(refreshOrders, 12000);\n    window.addEventListener("focus", refreshOrders);\n    document.addEventListener("visibilitychange", handleVisibilityChange);\n\n    return () => {\n      window.clearInterval(intervalId);\n      window.removeEventListener("focus", refreshOrders);\n      document.removeEventListener("visibilitychange", handleVisibilityChange);\n    };\n    // O polling funciona como contingência quando o websocket do Realtime é interrompido.\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [isCurrentDate, restaurantId]);\n'''

replace_once(
    '''  }, [isCurrentDate, restaurantId]);\n\n  const fetchOrders = async (showLoading = true) => {''',
    '''  }, [isCurrentDate, restaurantId]);\n''' + refresh_effect + '''\n  const fetchOrders = async (showLoading = true) => {''',
    'fallback refresh effect',
)

replace_once(
    '''      if (mappedOrders.length > 0) {\n        setLastSeenOrderId((current) => current || String(mappedOrders[0].id));\n      }''',
    '''      if (mappedOrders.length > 0 && !lastSeenOrderIdRef.current) {\n        lastSeenOrderIdRef.current = String(mappedOrders[0].id);\n      }''',
    'initialize last seen ref',
)

page_path.write_text(source, encoding='utf-8')

test_path = Path('tests/orders-auto-refresh.test.js')
test_path.write_text('''const assert = require("node:assert/strict");\nconst fs = require("node:fs");\nconst test = require("node:test");\n\nconst page = fs.readFileSync("src/app/admin/(painel)/orders/page.tsx", "utf8");\n\ntest("cliente Supabase permanece estável durante renderizações", () => {\n  assert.match(page, /useMemo, useRef, useState/);\n  assert.match(page, /const supabase = useMemo\\(/);\n  assert.match(page, /createBrowserClient\\(/);\n  assert.match(page, /const lastSeenOrderIdRef = useRef\\(""\\)/);\n  assert.doesNotMatch(page, /setLastSeenOrderId/);\n});\n\ntest("pedidos têm atualização de contingência e ao recuperar foco", () => {\n  assert.match(page, /window\\.setInterval\\(refreshOrders, 12000\\)/);\n  assert.match(page, /window\\.addEventListener\\("focus", refreshOrders\\)/);\n  assert.match(page, /document\\.addEventListener\\("visibilitychange", handleVisibilityChange\\)/);\n  assert.match(page, /void fetchOrders\\(false\\)/);\n});\n''', encoding='utf-8')
