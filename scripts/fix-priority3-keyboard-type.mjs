import fs from "node:fs";

const file = "src/components/ui/admin-date-picker.tsx";
let source = fs.readFileSync(file, "utf8");
source = source.replace(
  'import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";',
  'import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";',
);
source = source.replace(
  'const handleKeyDown = (event: KeyboardEvent) => {',
  'const handleKeyDown = (event: globalThis.KeyboardEvent) => {',
);
source = source.replace(
  'const handleDateKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {',
  'const handleDateKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, date: Date) => {',
);
fs.writeFileSync(file, source);
