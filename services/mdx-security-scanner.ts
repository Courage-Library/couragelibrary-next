/**
 * COURAGE LIBRARY — MDX AST & SECURITY SCANNER
 * Phase 3C: Controlled Content Compilation & Rendering Pipeline
 * 
 * Deep security scanner for controlled MDX content.
 * 
 * Threat Model Defense:
 * - Zero arbitrary JavaScript execution (prohibit imports, exports, require, eval)
 * - Zero arbitrary React components (enforce strict 10 approved component allowlist)
 * - Zero raw unsafe HTML (<script>, <iframe>, <style>, <embed>, <object>, <form>, <input>)
 * - Zero dangerous URL schemes (javascript:, data:, vbscript:, file:, blob:)
 * - Zero inline event handlers (onload, onclick, onerror, onmouseover, etc.)
 * - Zero runtime process/env/fs access expressions
 */

import { CompilationError } from '@/types/learning-compiler';

export const APPROVED_COMPONENTS = [
  'FormulaCard',
  'ExampleBox',
  'WarningBox',
  'ExamTip',
  'QuestionReference',
  'ComparisonTable',
  'QuickCheck',
  'SummaryCard',
  'DiagramBlock',
  'Callout',
] as const;

export const SAFE_URL_SCHEMES = ['https:', 'http:', 'mailto:'];

export const FORBIDDEN_HTML_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'textarea',
  'select',
  'button',
  'meta',
  'link',
  'applet',
  'base',
  'frame',
  'frameset',
];

export interface MdxSecurityScanResult {
  isSafe: boolean;
  errors: CompilationError[];
  warnings: string[];
  componentsFound: string[];
  detectedUrls: string[];
}

export class MdxSecurityScanner {
  /**
   * Scans a compiled or raw MDX string for security violations.
   */
  static scan(content: string): MdxSecurityScanResult {
    const errors: CompilationError[] = [];
    const warnings: string[] = [];
    const componentsFound: string[] = [];
    const detectedUrls: string[] = [];

    if (!content || typeof content !== 'string') {
      errors.push({
        code: 'EMPTY_PAYLOAD',
        severity: 'FATAL',
        path: '$',
        message: 'Content payload is empty or invalid string.',
      });
      return { isSafe: false, errors, warnings, componentsFound, detectedUrls };
    }

    const lines = content.split('\n');

    // 1. Line-by-line checks for imports, exports, require, process, eval
    lines.forEach((line, lineIdx) => {
      const lineNum = lineIdx + 1;

      // Imports / Exports
      if (/^\s*import\s+/i.test(line) || /import\s*\(/i.test(line)) {
        errors.push({
          code: 'IMPORT_NOT_ALLOWED',
          severity: 'FATAL',
          path: `line:${lineNum}`,
          line: lineNum,
          message: 'MDX import statements are strictly forbidden. All components are provided by runtime allowlist.',
        });
      }

      if (/^\s*export\s+/i.test(line)) {
        errors.push({
          code: 'EXPORT_NOT_ALLOWED',
          severity: 'FATAL',
          path: `line:${lineNum}`,
          line: lineNum,
          message: 'MDX export statements are strictly forbidden.',
        });
      }

      // Require calls
      if (/\brequire\s*\(/i.test(line)) {
        errors.push({
          code: 'REQUIRE_NOT_ALLOWED',
          severity: 'FATAL',
          path: `line:${lineNum}`,
          line: lineNum,
          message: 'CommonJS require() calls are strictly forbidden.',
        });
      }

      // Process / Env access
      if (/process\.env/i.test(line) || /process\.exit/i.test(line) || /process\.cwd/i.test(line)) {
        errors.push({
          code: 'PROCESS_ENV_NOT_ALLOWED',
          severity: 'FATAL',
          path: `line:${lineNum}`,
          line: lineNum,
          message: 'Access to Node.js process or environment variables is forbidden.',
        });
      }

      // Eval / Function constructor
      if (/\beval\s*\(/i.test(line) || /new\s+Function\s*\(/i.test(line)) {
        errors.push({
          code: 'UNSAFE_EXPRESSION_NOT_ALLOWED',
          severity: 'FATAL',
          path: `line:${lineNum}`,
          line: lineNum,
          message: 'Dynamic code execution (eval, Function constructor) is strictly forbidden.',
        });
      }
    });

    // 2. Forbidden HTML Tags Check
    FORBIDDEN_HTML_TAGS.forEach((tag) => {
      const tagRegex = new RegExp(`<${tag}[\\s>/]`, 'i');
      if (tagRegex.test(content)) {
        errors.push({
          code: 'UNSAFE_HTML',
          severity: 'FATAL',
          path: `<${tag}>`,
          message: `Raw HTML tag <${tag}> is strictly forbidden in educational content.`,
        });
      }
    });

    // 3. Inline Event Handlers Check (e.g. onload=, onclick=, onerror=)
    const eventHandlerMatches = content.match(/\bon[a-z]{3,15}\s*=/gi);
    if (eventHandlerMatches) {
      eventHandlerMatches.forEach((handler) => {
        errors.push({
          code: 'EVENT_HANDLER_NOT_ALLOWED',
          severity: 'FATAL',
          path: handler,
          message: `Inline HTML event handler "${handler}" is strictly forbidden.`,
        });
      });
    }

    // 4. URL Schemes Check
    const urlMatches = content.match(/(?:href|src|url)\s*=\s*["']([^"']+)["']|\[[^\]]+\]\(([^)]+)\)/gi);
    if (urlMatches) {
      const urlRegex = /(?:href|src|url)\s*=\s*["']([^"']+)["']|\[[^\]]+\]\(([^)]+)\)/i;
      urlMatches.forEach((match) => {
        const parts = urlRegex.exec(match);
        const urlStr = parts ? (parts[1] || parts[2] || '').trim() : '';
        if (urlStr) {
          detectedUrls.push(urlStr);

          // Check dangerous schemes
          const lowerUrl = urlStr.toLowerCase();
          if (
            lowerUrl.startsWith('javascript:') ||
            lowerUrl.startsWith('data:') ||
            lowerUrl.startsWith('vbscript:') ||
            lowerUrl.startsWith('file:') ||
            lowerUrl.startsWith('blob:')
          ) {
            errors.push({
              code: 'UNSAFE_URL',
              severity: 'FATAL',
              path: urlStr,
              message: `Dangerous URL scheme detected in "${urlStr}". Only ${SAFE_URL_SCHEMES.join(', ')} are permitted.`,
            });
          }
        }
      });
    }

    // 5. JSX Component Allowlist Enforcement
    const componentRegex = /<([A-Z][a-zA-Z0-9]+)[\s>/]/g;
    let compMatch: RegExpExecArray | null;
    while ((compMatch = componentRegex.exec(content)) !== null) {
      const compName = compMatch[1];
      if (!componentsFound.includes(compName)) {
        componentsFound.push(compName);
      }

      if (!APPROVED_COMPONENTS.includes(compName as any)) {
        errors.push({
          code: 'UNSUPPORTED_COMPONENT',
          severity: 'ERROR',
          path: `<${compName}>`,
          component: compName,
          message: `Component <${compName}> is not in the approved learning component allowlist. Allowed: ${APPROVED_COMPONENTS.join(', ')}.`,
        });
      }
    }

    const isSafe = errors.length === 0;

    return {
      isSafe,
      errors,
      warnings,
      componentsFound,
      detectedUrls,
    };
  }
}
