import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Command } from "commander";

import { createSourceFile, ts } from "@chomp/core";

const program = new Command();

program
  .name("chomp")
  .description("Chomp CLI")
  .command("analyze <path>")
  .description("Analyze a TypeScript source file")
  .action((inputPath: string) => {
    const filePath = resolve(process.cwd(), inputPath);
    const sourceText = readFileSync(filePath, "utf8");
    const sourceFile = createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

    const result = {
      filePath,
      statements: sourceFile.statements.length,
      syntaxKind: ts.SyntaxKind[sourceFile.kind],
      isDeclarationFile: sourceFile.isDeclarationFile,
    };

    console.log(JSON.stringify(result, null, 2));
  });

program.parse(process.argv);
