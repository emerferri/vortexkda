// Centralized mapping of full class names to their 3-char abbreviation (class_short).
// Keep in sync with the database `characters.class_short` field.
export const CLASS_SHORT_MAP: Record<string, string> = {
  // Existing
  'Ignition Knight': 'DrK',
  'Force Emperor': 'ER',
  'Infinity Rune Wizard': 'RW4',
  'Royal Elf': 'NE',
  'Creator': 'ACL',
  'Darkness Wizard': 'SW',
  'Bloody Fighter': 'FB',
  'Arcane Lancer': 'SL',
  'Endless Summoner': 'DS',
  'Glory Wizard': 'LW',
  'Magnus Gun Crusher': 'HGC',
  'Battle Mage': 'MM',
  'Rogue Slayer': 'SLT',
  'Douple Knight': 'MK',
  'Phantom Pain Knight': 'MYK',
  'Templar Commander': 'TMC',
  // Added (user-provided abbreviations)
  'Dark Knight': 'DrK',
  'Dark Wizard': 'SW',
  'Soul Wizard': 'SW',
  'Light Wizard': 'LW',
  'Noble Elves': 'NE',
  'Fist Blazer': 'FB',
  'Grand Master': 'SW',
  'Majestic Rune Wizard': 'RW4',
  'Master Paladim': 'TMC',
  'Shining Lancer': 'SL',
  'Slaughterer': 'SLT',
};

export const getClassShort = (className: string | null | undefined): string => {
  if (!className) return '';
  return CLASS_SHORT_MAP[className.trim()] || '';
};
