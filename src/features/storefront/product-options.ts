type AddonGroup = {
  min_options?: number | null;
  max_options?: number | null;
  required?: boolean | null;
};

export function getAddonGroupLimits(group: AddonGroup) {
  return {
    minimum: Math.max(0, Number(group.min_options ?? (group.required ? 1 : 0))),
    maximum: Math.max(0, Number(group.max_options || 0)),
  };
}

export function getAddonSelectionInstruction(group: AddonGroup) {
  const { minimum, maximum } = getAddonGroupLimits(group);

  if (minimum > 0 && maximum > 0) {
    if (minimum === maximum) {
      return maximum === 1 ? "Escolha 1 opção" : `Escolha ${maximum} opções`;
    }
    return `Escolha pelo menos ${minimum} · até ${maximum}`;
  }
  if (minimum > 0) return `Escolha pelo menos ${minimum}`;
  if (maximum > 0) return `Escolha até ${maximum}`;
  return "Escolha como preferir";
}

export function toggleAddonSelection<T extends { name: string }>(
  current: T[],
  option: T,
  group: AddonGroup,
) {
  const exists = current.some((item) => item.name === option.name);
  if (exists) return current.filter((item) => item.name !== option.name);

  const { maximum } = getAddonGroupLimits(group);
  if (maximum === 1) return [option];
  if (maximum > 0 && current.length >= maximum) return current;
  return [...current, option];
}
