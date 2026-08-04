import { readFile, writeFile } from "node:fs/promises";

const path = "src/app/admin/(painel)/history/HistoryWorkspace.tsx";
let content = await readFile(path, "utf8");

const replacements = [
  [
    "const [expandedDateKey, setExpandedDateKey] = useState<string | null>(null);",
    "const [expandedDateKeys, setExpandedDateKeys] = useState<string[]>([]);",
  ],
  [
    "setExpandedDateKey(latestGroupKey);",
    "setExpandedDateKeys(latestGroupKey ? [latestGroupKey] : []);",
  ],
  [
    `const toggleDateGroup = (key: string) => {\n    setExpandedDateKey((current) => (current === key ? null : key));\n  };`,
    `const toggleDateGroup = (key: string) => {\n    setExpandedDateKeys((current) =>\n      current.includes(key)\n        ? current.filter((item) => item !== key)\n        : [...current, key],\n    );\n  };`,
  ],
  [
    "const isCollapsed = expandedDateKey !== group.key;",
    "const isCollapsed = !expandedDateKeys.includes(group.key);",
  ],
];

let changed = false;
for (const [before, after] of replacements) {
  if (content.includes(after)) continue;
  if (!content.includes(before)) {
    throw new Error(`Trecho esperado não encontrado em ${path}: ${before.slice(0, 80)}`);
  }
  content = content.replace(before, after);
  changed = true;
}

if (changed) {
  await writeFile(path, content, "utf8");
  console.log("Histórico ajustado para permitir múltiplas datas abertas.");
}
