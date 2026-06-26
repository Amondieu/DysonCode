/** ΛENS — Restart Level Classifier */
export type RestartLevel = 0 | 1 | 2 | 3;

export interface RestartNotice {
  level: RestartLevel;
  icon: string;
  label: string;
  color: string;
  buttonLabel?: string;
}

const LEVELS: Record<RestartLevel, RestartNotice> = {
  0: { level: 0, icon: '⚡', label: 'Hot-reload safe — no restart required', color: '#3dd68c' },
  1: { level: 1, icon: '🔄', label: 'Component refresh only — save to apply', color: '#569cd6' },
  2: { level: 2, icon: '⚠️', label: 'Dev server restart required', color: '#f5a623', buttonLabel: 'Execute + Restart Server' },
  3: { level: 3, icon: '🔴', label: 'Full restart required', color: '#ef4444', buttonLabel: 'Execute + Full Restart' },
};

const DEV_SERVER_RESTART_PATTERNS = [
  /vite\.config/i, /webpack\.config/i, /tsconfig/i, /\.env/i,
  /global/i, /shared/i, /middleware/i, /plugin/i,
  /\/styles\//, /css-variables/i, /theme/i,
];

const FULL_RESTART_PATTERNS = [
  /package\.json/i, /package-lock/i, /yarn\.lock/i,
  /Dockerfile/i, /docker-compose/i, /\.db/i, /migration/i,
  /\.rs$/, /Cargo\.toml/i, /\.py$/, /requirements/i,
  /\.yml$/, /\.yaml$/, /ci/i, /pipeline/i,
];

export function classifyRestart(filePath: string): RestartNotice {
  // Level 0: styles, tokens, JSX structure
  if (/\.css$|\.scss$|style=|className|design-token|color/i.test(filePath)) {
    return LEVELS[0];
  }
  // Level 1: component files
  if (/\/components\//i.test(filePath) || /\.tsx$/.test(filePath)) {
    return LEVELS[1];
  }
  // Level 3: heavy infrastructure
  if (FULL_RESTART_PATTERNS.some(p => p.test(filePath))) {
    return LEVELS[3];
  }
  // Level 2: build config, shared, env
  if (DEV_SERVER_RESTART_PATTERNS.some(p => p.test(filePath))) {
    return LEVELS[2];
  }
  // Default: component-level
  return LEVELS[1];
}
