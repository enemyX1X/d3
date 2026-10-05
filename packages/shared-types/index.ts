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

export type SceneNodeType =
  | 'PAGE' | 'SECTION' | 'CONTAINER' | 'TEXT' | 'WORD' | 'LETTER' | 'IMAGE' | 'VIDEO'
  | 'BUTTON' | 'LINK' | 'INPUT' | 'CARD' | 'TABLE' | 'ICON' | 'MENU' | 'DIALOG'
  | 'FORM' | 'NAVIGATION' | 'FRAME' | 'OTHER';

export type SceneNode = {
  id: string;
  type: SceneNodeType;
  parentId: string | null;
  children: string[];
  text?: string;
  semanticRole?: string;
  bounds: { x: number; y: number; w: number; h: number };
  position: { x: number; y: number };
  rotation: number;
  scale: number;
  visible: boolean;
  interactive?: boolean;
  selected: boolean;
  focused: boolean;
  color?: string;
  style?: { font?: string; backgroundColor?: string; display?: string };
  source: 'dom' | 'aria' | 'visual' | 'virtual';
  confidence: number;
  timestamp: number;
};

export type PageScene = {
  page: { url: string; title: string };
  viewport: { width: number; height: number; scrollX: number; scrollY: number };
  nodes: SceneNode[];
  timestamp: number;
};

export type ExtensionRequest =
  | { type: 'get-scene'; maxNodes?: number }
  | { type: 'find-element'; query: string; limit?: number }
  | { type: 'scroll-element'; id: string }
  | { type: 'click-element'; id: string; confirmed: true }
  | { type: 'cmd'; text: string }
  | { type: 'sync' }
  | { type: 'remember-page'; memory: PageMemory; embedding?: number[] }
  | { type: 'search-memory'; query: string; limit?: number; embedding?: number[] };

export type GetSceneResponse = { ok: true; scene: PageScene } | { ok: false; error: string };

export type FindElementResult = Pick<SceneNode, 'id' | 'type' | 'text' | 'semanticRole' | 'bounds' | 'confidence'> & { score: number };

export type PageMemory = {
  id: string;
  kind: 'page';
  title: string;
  url: string;
  summary: string;
  source: 'explicit-page-save';
  confidence: number;
  timestamp: number;
  embedding?: number[];
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
