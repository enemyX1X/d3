export type Form = 'human' | 'robot' | 'animal' | 'creature' | 'spaceship' | 'drone' | 'ball' | 'cube' | 'sphere' | 'particle' | 'abstract' | 'custom';

export type Avatar = {
  id: string;
  name: string;
  form: Form;
  position: { x: number; y: number; z?: number };
  scale: number;
  rotation: number;
  velocity: { x: number; y: number; z?: number };
  personality: string;
  material: string;
  color: string;
  animationState: string;
  expression: string;
  energy: number;
  interactionMode: 'IDLE' | 'FOLLOW' | 'OBSERVE' | 'REACT' | 'PLAY' | 'TRANSFORM' | 'CREATE' | 'DESTROY' | 'REBUILD' | 'SLEEP';
};

export type ScreenElementType = 'TEXT' | 'IMAGE' | 'BUTTON' | 'LINK' | 'INPUT' | 'CARD' | 'FRAME' | 'VIDEO' | 'OTHER';

export type ScreenElement = {
  id: string;
  type: ScreenElementType;
  text?: string;
  bounds: { x: number; y: number; w: number; h: number };
  image?: string;
  color?: string;
  font?: string;
  interactive?: boolean;
  source?: 'page' | 'extension' | 'virtual';
};

export type TransformCommand = {
  action: 'transform';
  form: Form;
  animation?: string;
};

export type ScaleCommand = {
  action: 'scale';
  value: number;
};

export type GameCommand = {
  action: 'game';
  mode?: 'shooting' | 'particle' | 'rebuild' | 'chase' | 'transform';
  on?: boolean;
};

export type AvatarCommand = TransformCommand | ScaleCommand | GameCommand | { action: 'move' | 'destroy' | 'rebuild' };
