import * as ts from "typescript";

export { ts };

export type CompilerOptions = ts.CompilerOptions;
export type Program = ts.Program;
export type SourceFile = ts.SourceFile;
export type Node = ts.Node;
export type TypeChecker = ts.TypeChecker;
export type Symbol = ts.Symbol;
export type Type = ts.Type;
export type Diagnostic = ts.Diagnostic;

export function createProgram(
  rootNames: readonly string[],
  options: ts.CompilerOptions,
  host?: ts.CompilerHost,
): ts.Program {
  return ts.createProgram(rootNames, options, host);
}

export function createSourceFile(
  fileName: string,
  sourceText: string,
  languageVersion: ts.ScriptTarget = ts.ScriptTarget.Latest,
  setParentNodes = true,
  scriptKind?: ts.ScriptKind,
): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    sourceText,
    languageVersion,
    setParentNodes,
    scriptKind,
  );
}

export * from './types.js';
export * from './db/index.js';
export * from './extractor.js';
