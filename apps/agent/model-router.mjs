const TASK_MODELS = {
  fast: 'LIVIA_MODEL_FAST',
  balanced: 'LIVIA_MODEL_BALANCED',
  smart: 'LIVIA_MODEL_SMART',
  vision: 'LIVIA_MODEL_VISION',
  embedding: 'LIVIA_MODEL_EMBEDDING'
};

export function modelForTask(task, env = process.env) {
  const variable = TASK_MODELS[task];
  if (!variable) return null;
  const configured = env[variable]?.trim();
  if (task === 'vision' || task === 'embedding') return configured || null;
  return configured || env.LIVIA_MODEL_DEFAULT?.trim() || 'qwen3:4b';
}
