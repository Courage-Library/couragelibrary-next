/**
 * COURAGE LIBRARY — CURRENT AFFAIRS CONTROLLED COMPILER SERVICE
 * Phase CA-2: Domain Services, Validation Gates & Import Boundary
 * Architecture Contract: Frozen v1.1.0
 */

import { MdxSecurityScanner } from '@/services/mdx-security-scanner';

export interface CompiledAstResult {
  isCompiled: boolean;
  compiledAstJson: Record<string, unknown> | null;
  error?: string;
}

export class CurrentAffairsCompilerService {
  /**
   * Compiles markdown body and structured takeaways into pre-rendered AST representation
   */
  static compileToAst(
    headline: string,
    summaryMd: string,
    keyTakeaways: string[],
    importantFacts: string[] = []
  ): CompiledAstResult {
    // 1. Deep security scan of raw markdown
    const scan = MdxSecurityScanner.scan(summaryMd);
    if (!scan.isSafe) {
      return {
        isCompiled: false,
        compiledAstJson: null,
        error: `COMPILATION_SECURITY_FAILED: ${scan.errors.map((e) => e.message).join(', ')}`,
      };
    }

    // 2. Build structured AST payload
    const astPayload = {
      schemaVersion: '1.0.0',
      type: 'CURRENT_AFFAIRS_AST',
      compiledAt: new Date().toISOString(),
      header: {
        headline: headline.trim(),
      },
      content: {
        summaryMarkdown: summaryMd.trim(),
        keyTakeaways: keyTakeaways.map((t) => t.trim()),
        importantFacts: importantFacts.map((f) => f.trim()),
      },
      components: scan.componentsFound,
    };

    return {
      isCompiled: true,
      compiledAstJson: astPayload,
    };
  }
}
