import fs from 'fs';
import path from 'path';

export interface RepoContextSnapshot {
  workspaceRoot: string;
  harvestedAt: string;
  modules: string[];
  docs: string[];
  entryPoints: string[];
  lastBuildHash: string | null;
  sprintCount: number;
  summary: string;
  persona: string;
  reviewerPersona: string;
  builderPersona: string;
  criticPersona: string;
  memoryKeeperPersona: string;
  koreExecSpec: string;
  toolMasterMap: string;
  dysonAutoCode: string;
  jcodeBrief: string;
  idevaCoding: string;
  katalystMemory: string;
  researchRuns: string;
  exports: string[];
}

let cachedSnapshot: RepoContextSnapshot | null = null;
let cachedWorkspaceRoot = '';

function safeListDir(dir: string): string[] {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function safeReadFile(filePath: string, maxBytes = 4096): string {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > maxBytes * 4) return '(large file, summary only)';
    return fs.readFileSync(filePath, 'utf-8').slice(0, maxBytes);
  } catch { return ''; }
}

function findFiles(dir: string, ext: string, maxDepth = 2): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'release') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && maxDepth > 0) {
        results.push(...findFiles(full, ext, maxDepth - 1));
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        results.push(full);
      }
    }
  } catch { /* skip inaccessible dirs */ }
  return results;
}

export function harvestRepoContext(workspaceRoot: string): RepoContextSnapshot {
  const tsFiles = findFiles(path.join(workspaceRoot, 'src'), '.ts', 3)
    .concat(findFiles(path.join(workspaceRoot, 'src'), '.tsx', 3));
  const pyFiles = findFiles(path.join(workspaceRoot, 'kore'), '.py', 2);
  const rsFiles = findFiles(path.join(workspaceRoot, 'kore-exec', 'src'), '.rs', 3);

  const modules = [
    ...tsFiles.map((f) => path.relative(workspaceRoot, f).replace(/\\/g, '/')),
    ...pyFiles.map((f) => path.relative(workspaceRoot, f).replace(/\\/g, '/')),
    ...rsFiles.map((f) => path.relative(workspaceRoot, f).replace(/\\/g, '/')),
  ];

  const docs = safeListDir(path.join(workspaceRoot, 'BuildDocs'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `BuildDocs/${f}`);

  const pkgJson = safeReadFile(path.join(workspaceRoot, 'package.json'));
  const entryPoints: string[] = [];
  try {
    const pkg = JSON.parse(pkgJson);
    if (pkg.main) entryPoints.push(pkg.main);
    if (pkg.scripts) entryPoints.push(...Object.entries(pkg.scripts).map(([k]) => `npm run ${k}`));
  } catch { /* ignore */ }

  const handoff = safeReadFile(path.join(workspaceRoot, 'HANDOFF.md'));
  const sprintMatch = handoff.match(/Sprint\s+\d+/gi) || [];
  const buildDocsFiles = safeListDir(path.join(workspaceRoot, 'BuildDocs'))
    .concat(safeListDir(path.join(workspaceRoot, 'BuildDocs', 'Tools')));
  const sprintCount = buildDocsFiles.filter((f) => /sprint|run/i.test(f)).length || sprintMatch.length;

  // ── Export extraction from TS/TSX ────────────────────────────
  const exportRegex = /export\s+(interface|type|function|class|const|enum)\s+(\w+)/g;
  const exports: string[] = [];

  for (const file of tsFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8').slice(0, 4096);
      let match: RegExpExecArray | null;
      while ((match = exportRegex.exec(content)) !== null) {
        const kind = match[1];
        const name = match[2];
        const relPath = path.relative(workspaceRoot, file).replace(/\\/g, '/');
        exports.push(`${kind} ${name} (${relPath})`);
        if (exports.length >= 60) break;
      }
      if (exports.length >= 60) break;
    } catch { /* skip unreadable */ }
  }

  const buildHash = (() => {
    const htmlPath = path.join(workspaceRoot, 'dist', 'renderer', 'index.html');
    const html = safeReadFile(htmlPath);
    const match = html.match(/index-(\w+)\.js/);
    return match?.[1] || null;
  })();

  // ── Persona harvesting ───────────────────────────────────────
  const personaPath = path.join(workspaceRoot, 'BuildDocs', 'IdevaPersonas.md');
  let persona = '';
  let reviewerPersona = '';
  let builderPersona = '';
  let criticPersona = '';
  let memoryKeeperPersona = '';
  try {
    const raw = fs.readFileSync(personaPath, 'utf-8');

    const compress = (text: string) => text
      .replace(/###\s*/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/^[\s*-]+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 2000);

    // ROLLE I — Architect
    const archMatch = raw.match(/ROLLE I\s*[-–—]*\s*DER ARCHITECT([\s\S]*?)(?=ROLLE II|## ROLLE II|$)/i);
    if (archMatch) persona = compress(archMatch[1]);

    // ROLLE II — Reviewer
    const revMatch = raw.match(/ROLLE II\s*[-–—]*\s*DER REVIEWER([\s\S]*?)(?=ROLLE III|## ROLLE III|$)/i);
    if (revMatch) reviewerPersona = compress(revMatch[1]);

    // ROLLE III — Builder
    const buildMatch = raw.match(/ROLLE III\s*[-–—]*\s*(?:DER\s+)?BUILDER([\s\S]*?)(?=ROLLE IV|## ROLLE IV|$)/i);
    const critMatch = raw.match(/ROLLE IV\s*[-–—]*\s*(?:DER\s+)?(?:CRITIC|TESTER)([\s\S]*?)(?=ROLLE V|## ROLLE V|$)/i);
    const memMatch = raw.match(/ROLLE V\s*[-–—]*\s*(?:DER\s+)?MEMORY\s*KEEPER([\s\S]*?)$/i);
    if (buildMatch) builderPersona = compress(buildMatch[1]);

    // ROLLE IV — Critic/Tester
    if (critMatch) criticPersona = compress(critMatch[1]);

    // ROLLE V — Memory Keeper
    if (memMatch) memoryKeeperPersona = compress(memMatch[1]);

  } catch { /* persona file not found */ }

  // ── BuildDocs/Tools harvesting ─────────────────────────────────
  let koreExecSpec = '';
  let toolMasterMap = '';
  let dysonAutoCode = '';
  let jcodeBrief = '';

  try {
    koreExecSpec = fs.readFileSync(path.join(workspaceRoot, 'BuildDocs', 'kore-exec-spec.md'), 'utf-8').slice(0, 4000);
  } catch { /* file not found */ }
  try {
    toolMasterMap = fs.readFileSync(path.join(workspaceRoot, 'BuildDocs', 'Tools', 'TOOL-MASTER-MAP.md'), 'utf-8').slice(0, 3000);
  } catch { /* file not found */ }
  try {
    dysonAutoCode = fs.readFileSync(path.join(workspaceRoot, 'BuildDocs', 'DysonAutoCode.md'), 'utf-8').slice(0, 3000);
  } catch { /* file not found */ }
  try {
    jcodeBrief = fs.readFileSync(path.join(workspaceRoot, 'BuildDocs', 'jcode-kore-master-brief.md'), 'utf-8').slice(0, 2000);
  } catch { /* file not found */ }

  let idevaCoding = '';
  let katalystMemory = '';
  let researchRuns = '';
  try {
    idevaCoding = fs.readFileSync(path.join(workspaceRoot, 'BuildDocs', 'IdevaCoding1.md'), 'utf-8').slice(0, 2000);
  } catch { /* file not found */ }
  try {
    katalystMemory = fs.readFileSync(path.join(workspaceRoot, 'BuildDocs', 'KatalystUndMetaBlocksMemoryKeep.md'), 'utf-8').slice(0, 2000);
  } catch { /* file not found */ }
  try {
    const runFiles = safeListDir(path.join(workspaceRoot, 'BuildDocs', 'Tools'))
      .filter((f) => /^Run\d+\.md$/i.test(f))
      .sort()
      .slice(0, 6);
    const runSummaries = runFiles.map((f) => {
      const content = fs.readFileSync(path.join(workspaceRoot, 'BuildDocs', 'Tools', f), 'utf-8').slice(0, 500);
      const title = content.match(/^#\s*(.+)/m);
      return `- ${f}: ${title?.[1] || 'Research run'}`;
    });
    researchRuns = runSummaries.join('\n');
  } catch { /* file not found */ }

  const summary = [
    `Repository: ${path.basename(workspaceRoot)}`,
    `Total source files: ${modules.length} (TS/TSX: ${tsFiles.length}, Python: ${pyFiles.length}, Rust: ${rsFiles.length})`,
    `Entry points: ${entryPoints.slice(0, 3).join(', ')}`,
    `Documentation files: ${docs.slice(0, 5).join(', ')}`,
    `Sprint entries found: ${sprintCount}`,
    `Last build: ${buildHash || 'unknown'}`,
  ].join('\n');

  return {
    workspaceRoot,
    harvestedAt: new Date().toISOString(),
    modules: modules.slice(0, 100),
    docs: docs.slice(0, 20),
    entryPoints: entryPoints.slice(0, 10),
    lastBuildHash: buildHash,
    sprintCount,
    summary,
    persona,
    reviewerPersona,
    builderPersona,
    criticPersona,
    memoryKeeperPersona,
    koreExecSpec,
    toolMasterMap,
    dysonAutoCode,
    jcodeBrief,
    idevaCoding,
    katalystMemory,
    researchRuns,
    exports: exports.slice(0, 60),
  };
}

export function getCachedContext(workspaceRoot: string): RepoContextSnapshot {
  if (cachedSnapshot && cachedWorkspaceRoot === workspaceRoot) {
    return cachedSnapshot;
  }
  return refreshContext(workspaceRoot);
}

export function refreshContext(workspaceRoot: string): RepoContextSnapshot {
  cachedSnapshot = harvestRepoContext(workspaceRoot);
  cachedWorkspaceRoot = workspaceRoot;
  return cachedSnapshot;
}

export function buildPrimer(ctx: RepoContextSnapshot): string {
  const topModules = ctx.modules.slice(0, 20);
  const topExports = ctx.exports.slice(0, 25);
  const personaBlock = [
    ctx.persona ? `\n## Architect Persona\n${ctx.persona}` : '',
    ctx.reviewerPersona ? `\n## Reviewer Persona\n${ctx.reviewerPersona}` : '',
    ctx.builderPersona ? `\n## Builder Persona\n${ctx.builderPersona}` : '',
    ctx.criticPersona ? `\n## Critic/Tester Persona\n${ctx.criticPersona}` : '',
    ctx.memoryKeeperPersona ? `\n## Memory Keeper Persona\n${ctx.memoryKeeperPersona}` : '',
  ].filter(Boolean).join('\n');

  const docsBlock = [
    ctx.koreExecSpec ? `\n## kore-exec Specification\nWhen generating MODULE specs, only use capabilities listed here:\n${ctx.koreExecSpec}` : '',
    ctx.toolMasterMap ? `\n## Available Tools\nReference available tools when designing tasks. Do not re-invent existing integrations:\n${ctx.toolMasterMap}` : '',
    ctx.dysonAutoCode ? `\n## Auto-Coding Architecture\n${ctx.dysonAutoCode}` : '',
    ctx.jcodeBrief ? `\n## Jcode Integration Brief\nThe contract between Canvas planning and jcode execution:\n${ctx.jcodeBrief}` : '',
    ctx.idevaCoding ? `\n## IDEVA Coding Methodology\n${ctx.idevaCoding}` : '',
    ctx.katalystMemory ? `\n## Memory Architecture\n${ctx.katalystMemory}` : '',
    ctx.researchRuns ? `\n## Research Runs\n${ctx.researchRuns}` : '',
  ].filter(Boolean).join('\n');

  return [
    '## Repository Context',
    `Workspace: ${path.basename(ctx.workspaceRoot)}`,
    `Source files (sampled): ${topModules.join(', ')}`,
    `Key docs: ${ctx.docs.slice(0, 5).join(', ')}`,
    `Entry points: ${ctx.entryPoints.slice(0, 3).join(', ')}`,
    `Sprints documented: ${ctx.sprintCount}`,
    ctx.lastBuildHash ? `Build: ${ctx.lastBuildHash}` : '',
    topExports.length > 0 ? `\n## API Surface (exports)\n${topExports.join('\n')}` : '',
    personaBlock,
    docsBlock,
    '',
    'Use this context to ground your plan in the actual codebase.',
    'Reference specific files when proposing module changes.',
  ].filter(Boolean).join('\n');
}
