export const BRAND = {
  name: 'LIVIA',
  full: 'Living Interactive Virtual Intelligence Avatar',
  tagline: 'Your AI. Alive across your digital world.'
} as const;

export const FORMS = ['sphere', 'cube', 'ball', 'spaceship', 'drone', 'robot', 'particle'] as const;
export type Form = (typeof FORMS)[number];

export type AvatarConfig = {
  name: string;
  form: Form;
  color: string;
  size: number;
};

export const DEFAULT_CONFIG: AvatarConfig = {
  name: 'Livia',
  form: 'sphere',
  color: '#7cf3ff',
  size: 1
};

export type Action =
  | { action: 'transform'; form: Form }
  | { action: 'scale'; value: number }
  | { action: 'game'; on: boolean }
  | { action: 'move' | 'destroy' | 'rebuild' };

const FORM_MAP: Array<[Form, RegExp]> = [
  ['spaceship', /spaceship|ship|rocket/],
  ['robot', /robot/],
  ['drone', /drone/],
  ['cube', /cube|box/],
  ['ball', /ball/],
  ['sphere', /sphere|orb/],
  ['particle', /particle|dust|cloud/]
];

export function parseCommand(input: string): Action | null {
  const t = String(input).toLowerCase().slice(0, 200);

  if (/tiny|small|shrink|mini/.test(t)) return { action: 'scale', value: 0.5 };
  if (/huge|big|giant|grow|large/.test(t)) return { action: 'scale', value: 2 };
  if (/normal size|reset size/.test(t)) return { action: 'scale', value: 1 };
  if (/rebuild|reconstruct|restore/.test(t)) return { action: 'rebuild' };
  if (/destroy (everything|all)|blow up/.test(t)) return { action: 'destroy' };
  if (/companion|stop|calm|exit/.test(t)) return { action: 'game', on: false };
  if (/play|game|shoot|target/.test(t)) return { action: 'game', on: true };
  if (/come here|follow|here/.test(t)) return { action: 'move' };

  for (const [form, re] of FORM_MAP) {
    if (re.test(t)) return { action: 'transform', form };
  }

  return null;
}

export function sanitizeConfig(raw: unknown): AvatarConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const form = FORMS.includes(r.form as Form) ? (r.form as Form) : DEFAULT_CONFIG.form;
  const color = typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : DEFAULT_CONFIG.color;
  const size = Math.min(3, Math.max(0.25, Number(r.size) || 1));
  const name = typeof r.name === 'string' ? r.name.replace(/[<>]/g, '').slice(0, 30) || DEFAULT_CONFIG.name : DEFAULT_CONFIG.name;

  return {
    name,
    form,
    color,
    size
  };
}
