// packages/core/src/extractor/adapters/nextjsAdapter.ts
// Framework-specific adapter for Next.js App Router conventions.
//
// Structural patterns handled:
//   - File-path classification (route.ts → ROUTE_HANDLER, page.tsx → PAGE, middleware.ts → MIDDLEWARE)
//   - Route Handler contracts (exported GET/POST/PUT/DELETE/PATCH in route.ts files)
//   - Page component boundaries (default-exported components in page.tsx files)
//   - Middleware export contracts (export { X as middleware } in middleware.ts)

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

/**
 * The structural role a Next.js file plays based on its path convention.
 * Null means the file has no special Next.js App Router role.
 */
export type NextjsFileRole = 'ROUTE_HANDLER' | 'PAGE' | 'LAYOUT' | 'MIDDLEWARE';

/** HTTP method names that constitute a Next.js Route Handler contract. */
const ROUTE_HANDLER_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

/**
 * Classifies a file path into its Next.js App Router structural role.
 *
 * Uses path conventions defined by the Next.js framework:
 *   app/** /route.ts(x)  -> ROUTE_HANDLER
 *   app/** /page.ts(x)   -> PAGE
 *   app/** /layout.ts(x) -> LAYOUT
 *   middleware.ts(x) at the project root level -> MIDDLEWARE
 *
 * @param filePath  The relative file path (relative to cwd or repo root).
 * @returns The structural role, or null if the file has no special Next.js role.
 */
export function classifyNextjsFile(filePath: string): NextjsFileRole | null {
  // Normalize separators
  const normalized = filePath.replace(/\\/g, '/');

  // Route Handler: app/**/route.ts(x)
  if (/(?:^|\/)app\/(?:.*\/)?route\.[tj]sx?$/.test(normalized)) {
    return 'ROUTE_HANDLER';
  }
  // Page: app/**/page.ts(x)
  if (/(?:^|\/)app\/(?:.*\/)?page\.[tj]sx?$/.test(normalized)) {
    return 'PAGE';
  }
  // Layout: app/**/layout.ts(x)
  if (/(?:^|\/)app\/(?:.*\/)?layout\.[tj]sx?$/.test(normalized)) {
    return 'LAYOUT';
  }
  // Middleware: middleware.ts(x) at root (may have leading path segments from cwd)
  if (/(?:^|\/)middleware\.[tj]sx?$/.test(normalized)) {
    return 'MIDDLEWARE';
  }

  return null;
}

/**
 * Extracts Next.js Route Handler contracts from a node in a `route.ts` file.
 *
 * Matches two forms:
 * 1. Direct export: `export async function GET(req: Request) { ... }`
 * 2. Destructured re-export: `export const { GET, POST } = handlers`
 *
 * Both forms produce one CONTRACT per exported HTTP method.
 *
 * @param node      The AST node to inspect.
 * @param fileRole  The classified role of the current file (only fires on ROUTE_HANDLER).
 * @param getEvidence  Returns an EvidenceRecord for the given node.
 * @param nextId    Placeholder ID closure, replaced by stableEntityId() in orchestrator.
 * @returns An array of CONTRACT entities, or null.
 */
export function extractNextjsRouteHandlerContracts(
  node: ts.Node,
  fileRole: NextjsFileRole | null,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity[] | null {
  if (fileRole !== 'ROUTE_HANDLER') return null;

  const results: StructuralEntity[] = [];

  // Form 1: export async function GET(...) / export function POST(...)
  if (
    ts.isFunctionDeclaration(node) &&
    node.name &&
    ROUTE_HANDLER_METHODS.has(node.name.text) &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    results.push({
      id: nextId(),
      name: `Route Handler: ${node.name.text}`,
      type: 'CONTRACT',
      entityType: 'HTTP_ENDPOINT',
      patternId: 'contract.nextjs-route-handler',
      evidence: getEvidence(node),
    });
  }

  // Form 2: export const { GET, POST } = handlers (or any exported destructuring with HTTP method names)
  if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
    for (const decl of node.declarationList.declarations) {
      if (ts.isObjectBindingPattern(decl.name)) {
        for (const element of decl.name.elements) {
          if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
            const methodName = element.name.text;
            if (ROUTE_HANDLER_METHODS.has(methodName)) {
              results.push({
                id: nextId(),
                name: `Route Handler: ${methodName}`,
                type: 'CONTRACT',
                entityType: 'HTTP_ENDPOINT',
                patternId: 'contract.nextjs-route-handler',
                evidence: getEvidence(node),
              });
            }
          }
        }
      }
    }
  }

  return results.length > 0 ? results : null;
}

/**
 * Extracts a Next.js Page component as a BOUNDARY from a `page.tsx` file.
 *
 * Matches: `export default function DashboardPage(...)` or
 *          `export default async function DashboardPage(...)`.
 *
 * The route path is inferred from the file path by stripping the `app/` prefix,
 * the `(group)/` segments, and the `/page.tsx` suffix.
 *
 * @param node      The AST node to inspect.
 * @param fileRole  The classified role of the current file (only fires on PAGE).
 * @param filePath  The relative file path, used to derive the route path.
 * @param getEvidence  Returns an EvidenceRecord for the given node.
 * @param nextId    Placeholder ID closure.
 * @returns A BOUNDARY entity, or null.
 */
export function extractNextjsPageBoundary(
  node: ts.Node,
  fileRole: NextjsFileRole | null,
  filePath: string,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (fileRole !== 'PAGE') return null;

  if (
    ts.isFunctionDeclaration(node) &&
    node.name &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
  ) {
    const routePath = deriveRoutePath(filePath);
    return {
      id: nextId(),
      name: `Next.js Page: ${routePath}`,
      type: 'BOUNDARY',
      entityType: 'NEXTJS_PAGE',
      patternId: 'boundary.nextjs-page-component',
      evidence: getEvidence(node),
      metadata: { routePath, componentName: node.name.text },
    };
  }

  return null;
}

/**
 * Extracts a Next.js middleware export as a CONTRACT from a `middleware.ts` file.
 *
 * Matches two forms:
 * 1. Re-export alias:  `export { auth as middleware }`
 * 2. Direct export:    `export default function middleware(...)`
 *
 * Also matches the config export: `export const config = { matcher: [...] }` and
 * attaches the matcher as metadata on the middleware contract.
 *
 * @param node      The AST node to inspect.
 * @param fileRole  The classified role of the current file (only fires on MIDDLEWARE).
 * @param getEvidence  Returns an EvidenceRecord for the given node.
 * @param nextId    Placeholder ID closure.
 * @returns A CONTRACT entity, or null.
 */
export function extractNextjsMiddlewareExport(
  node: ts.Node,
  fileRole: NextjsFileRole | null,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (fileRole !== 'MIDDLEWARE') return null;

  // Form 1: export { X as middleware }
  if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
    for (const specifier of node.exportClause.elements) {
      if (specifier.name.text === 'middleware') {
        const originalName = specifier.propertyName?.text ?? specifier.name.text;
        return {
          id: nextId(),
          name: `Next.js Middleware`,
          type: 'CONTRACT',
          entityType: 'NEXTJS_MIDDLEWARE',
          patternId: 'contract.nextjs-middleware-export',
          evidence: getEvidence(node),
          metadata: { exportedAs: 'middleware', originalName },
        };
      }
    }
  }

  // Form 2: export default function middleware(...)
  if (
    ts.isFunctionDeclaration(node) &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
  ) {
    return {
      id: nextId(),
      name: `Next.js Middleware`,
      type: 'CONTRACT',
      entityType: 'NEXTJS_MIDDLEWARE',
      patternId: 'contract.nextjs-middleware-export',
      evidence: getEvidence(node),
      metadata: { exportedAs: 'middleware', originalName: node.name?.text ?? 'anonymous' },
    };
  }

  return null;
}

/**
 * Derives a Next.js route path from a page file path.
 *
 * - Strips `app/` prefix and `/page.tsx` suffix.
 * - Removes route group segments (parenthesized names like `(dashboard)`).
 * - Preserves dynamic segment brackets: `[id]` → `/[id]`.
 * - Returns `/` for the root page.
 *
 * @example
 * deriveRoutePath('app/(dashboard)/customers/page.tsx') // → '/customers'
 * deriveRoutePath('app/page.tsx')                       // → '/'
 * deriveRoutePath('app/products/[id]/page.tsx')         // → '/products/[id]'
 */
function deriveRoutePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  // Strip everything up to and including the first 'app/' segment
  const afterApp = normalized.replace(/^.*?app\//, '');
  // Remove the trailing /page.tsx, page.tsx, /layout.tsx, or layout.tsx
  const withoutPage = afterApp.replace(/\/?(?:page|layout)\.[tj]sx?$/, '');
  // Remove route group segments like (dashboard) or (auth)
  const withoutGroups = withoutPage.replace(/\([^)]+\)\//g, '').replace(/\([^)]+\)$/, '');

  if (!withoutGroups || withoutGroups === '/') return '/';
  return '/' + withoutGroups.replace(/\/$/, '');
}

/**
 * Extracts Next.js Cache invalidation calls...
 */
export function extractNextjsRevalidate(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (!ts.isCallExpression(node)) return null;
  if (!ts.isIdentifier(node.expression)) return null;

  const fnName = node.expression.text;
  if (fnName !== 'revalidatePath' && fnName !== 'revalidateTag') return null;

  return {
    id: nextId(),
    name: `Next.js Cache: ${fnName}()`,
    type: 'OPEN_CONNECTOR',
    entityType: 'CACHE_INVALIDATION',
    patternId: 'open-connector.nextjs-revalidate-path',
    evidence: getEvidence(node),
  };
}

/**
 * Extracts a Next.js Layout component as a BOUNDARY from a `layout.tsx` file.
 *
 * Matches: `export default function DashboardLayout(...)` or
 *          `export default async function DashboardLayout(...)`.
 *
 * @param node      The AST node to inspect.
 * @param fileRole  The classified role of the current file (only fires on LAYOUT).
 * @param filePath  The relative file path, used to derive the route path.
 * @param getEvidence  Returns an EvidenceRecord for the given node.
 * @param nextId    Placeholder ID closure.
 * @returns A BOUNDARY entity, or null.
 */
export function extractNextjsLayoutBoundary(
  node: ts.Node,
  fileRole: NextjsFileRole | null,
  filePath: string,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (fileRole !== 'LAYOUT') return null;

  if (
    ts.isFunctionDeclaration(node) &&
    node.name &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
  ) {
    const routePath = deriveRoutePath(filePath);
    return {
      id: nextId(),
      name: `Next.js Layout: ${routePath}`,
      type: 'BOUNDARY',
      entityType: 'NEXTJS_LAYOUT',
      patternId: 'boundary.nextjs-layout-component',
      evidence: getEvidence(node),
      metadata: { routePath, componentName: node.name.text },
    };
  }

  return null;
}

/**
 * Extracts Next.js Route Segment Configs as a CONTRACT.
 * Matches: `export const dynamic = 'force-dynamic'`
 */
export function extractNextjsRouteConfig(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity[] | null {
  if (!ts.isVariableStatement(node)) return null;
  if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return null;

  const validConfigs = new Set(['dynamic', 'revalidate', 'fetchCache', 'runtime', 'preferredRegion', 'maxDuration']);
  const results: StructuralEntity[] = [];

  for (const decl of node.declarationList.declarations) {
    if (ts.isIdentifier(decl.name) && validConfigs.has(decl.name.text)) {
      results.push({
        id: nextId(),
        name: `Next.js Config: ${decl.name.text}`,
        type: 'CONTRACT',
        entityType: 'NEXTJS_ROUTE_CONFIG',
        patternId: 'contract.nextjs-route-config',
        evidence: getEvidence(node),
      });
    }
  }

  return results.length > 0 ? results : null;
}

/**
 * Extracts Next.js metadata export as a CONTRACT.
 * Matches: `export const metadata = { ... }` or `export const metadata: Metadata = { ... }`
 */
export function extractNextjsMetadataExport(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (!ts.isVariableStatement(node)) return null;
  if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return null;

  for (const decl of node.declarationList.declarations) {
    if (ts.isIdentifier(decl.name) && decl.name.text === 'metadata') {
      return {
        id: nextId(),
        name: `Next.js Metadata`,
        type: 'CONTRACT',
        entityType: 'NEXTJS_METADATA',
        patternId: 'contract.nextjs-metadata-export',
        evidence: getEvidence(node),
      };
    }
  }

  return null;
}

/**
 * Extracts Next.js Server Actions as a CONTRACT.
 */
export function extractNextjsServerActions(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isFunctionDeclaration(node) && node.name && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
    let isServerAction = false;

    // Check file-level 'use server' directive
    if (sourceFile.statements.length > 0) {
      const firstStmt = sourceFile.statements[0];
      if (
        ts.isExpressionStatement(firstStmt) &&
        ts.isStringLiteral(firstStmt.expression) &&
        firstStmt.expression.text === 'use server'
      ) {
        isServerAction = true;
      }
    }

    // Check function-level 'use server' directive
    if (!isServerAction && node.body && ts.isBlock(node.body) && node.body.statements.length > 0) {
      const firstStmt = node.body.statements[0];
      if (
        ts.isExpressionStatement(firstStmt) &&
        ts.isStringLiteral(firstStmt.expression) &&
        firstStmt.expression.text === 'use server'
      ) {
        isServerAction = true;
      }
    }

    if (isServerAction) {
      return {
        id: nextId(),
        name: `Server Action: ${node.name.text}`,
        type: 'CONTRACT',
        entityType: 'SERVER_ACTION',
        patternId: 'contract.server-action',
        evidence: getEvidence(node),
      };
    }
  }

  return null;
}
