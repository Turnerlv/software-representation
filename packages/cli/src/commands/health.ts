/**
 * @fileoverview CLI command implementation for evaluating structural extraction health.
 *
 * The `health` command runs deterministic AST extraction against a target repository
 * and calculates four key structural health metrics:
 * 1. Connectivity Rate: Resolvability of cross-entity structural relationships.
 * 2. Entity Type Coverage: Proportion of entities with identified concrete types.
 * 3. Parent Coverage: Proportion of contracts and open connectors attached to parent boundaries.
 * 4. Scope Purity: Proportion of entities belonging to user/application scope.
 *
 * This command serves as the primary automated quality gate before AI inference
 * and research operations are permitted on extracted graphs.
 *
 * @module @chomp/cli/commands/health
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { analyzeTarget, StructuralNode, StructuralEdge } from "@chomp/core";

/**
 * Registers the `health` command on the Commander program instance.
 *
 * @param program - The Commander CLI program instance to attach the command to.
 *
 * @remarks
 * Command Usage:
 * ```bash
 * chomp health --repo <path>
 * ```
 *
 * Metrics Evaluated:
 * - `Connectivity Rate` (Target: >80%): Measures whether structural relationships (REQUIRE, IMPORT, MOUNTS, INHERITS, EMITS) successfully resolve to a `targetId`.
 * - `Entity Type Coverage` (Target: 100%): Ensures no extracted entities or relationships remain categorized as `UNKNOWN`.
 * - `Parent Coverage` (Target: 100%): Ensures all CONTRACT and OPEN_CONNECTOR nodes are bound to a containing parent BOUNDARY (`parentBoundaryId`).
 * - `Scope Purity` (Target: >95%): Measures the ratio of user-scoped entities relative to test/vendor entities.
 *
 * Process Exit Codes:
 * - `0`: All structural health metrics met or exceeded target thresholds.
 * - `1`: Target path invalid, not a directory, or one or more health checks failed.
 *
 * @example
 * ```ts
 * import { Command } from "commander";
 * import { registerHealthCommand } from "./commands/health.js";
 *
 * const program = new Command();
 * registerHealthCommand(program);
 * program.parse(process.argv);
 * ```
 */
export function registerHealthCommand(program: Command): void {
  program
    .command("health")
    .description("Compute extraction health metrics for a repository")
    .requiredOption("--repo <path>", "Path to a directory to analyze")
    .action((options: { repo: string }) => {
      // Resolve target directory relative to initial working directory or cwd
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const targetPath = resolve(baseDir, options.repo);

      if (!existsSync(targetPath) || !statSync(targetPath).isDirectory()) {
        console.error(`Error: Target path ${targetPath} is not a valid directory.`);
        process.exit(1);
      }

      console.log(`Analyzing repository: ${targetPath}...`);
      const graph = analyzeTarget(targetPath);

      const allEntities: Array<StructuralNode | StructuralEdge> = [
        ...graph.nodes,
        ...graph.edges,
      ];

      // -----------------------------------------------------------------------
      // Metric 1: Connectivity Rate
      // Formula: (relationships with resolved targetId) / (total targetable relationships)
      // Target types: REQUIRE, IMPORT, MOUNTS, INHERITS, EMITS
      // -----------------------------------------------------------------------
      const connectivityTargetTypes = ['REQUIRE', 'IMPORT', 'MOUNTS', 'INHERITS', 'EMITS'];
      const relationshipsForConnectivity = graph.edges.filter(r =>
        r.entityType && connectivityTargetTypes.includes(r.entityType)
      );
      const connectedCount = relationshipsForConnectivity.filter(r => r.targetId).length;
      const connectivityRate = relationshipsForConnectivity.length > 0
        ? (connectedCount / relationshipsForConnectivity.length) * 100
        : 100; // Default to 100% when no targetable relationships exist

      // -----------------------------------------------------------------------
      // Metric 2: Entity Type Coverage
      // Formula: (entities with known type !== 'UNKNOWN') / (total entities)
      // -----------------------------------------------------------------------
      const entitiesWithKnownType = allEntities.filter(e => e.entityType && e.entityType !== 'UNKNOWN').length;
      const entityTypeCoverage = allEntities.length > 0
        ? (entitiesWithKnownType / allEntities.length) * 100
        : 100;

      // -----------------------------------------------------------------------
      // Metric 3: Parent Coverage
      // Formula: (contracts + open connectors with parentBoundaryId) / (total contracts + open connectors)
      // -----------------------------------------------------------------------
      const children = graph.nodes.filter(n => n.type === 'CONTRACT' || n.type === 'OPEN_CONNECTOR');
      const childrenWithParent = children.filter(c => c.parentBoundaryId).length;
      const parentCoverage = children.length > 0
        ? (childrenWithParent / children.length) * 100
        : 100;

      // -----------------------------------------------------------------------
      // Metric 4: Scope Purity
      // Formula: (production/user-scoped entities) / (total entities)
      // -----------------------------------------------------------------------
      const productionEntities = allEntities.filter(e => e.scope === 'USER' || !e.scope).length;
      const scopePurity = allEntities.length > 0
        ? (productionEntities / allEntities.length) * 100
        : 100;

      console.log("\n--- Structural Health Metrics ---\n");

      const metrics = [
        {
          Metric: "Connectivity Rate",
          Value: `${connectivityRate.toFixed(1)}%`,
          Target: ">80%",
          Status: connectivityRate >= 80 ? "✅ PASS" : "❌ FAIL"
        },
        {
          Metric: "Entity Type Coverage",
          Value: `${entityTypeCoverage.toFixed(1)}%`,
          Target: "100%",
          Status: entityTypeCoverage === 100 ? "✅ PASS" : "❌ FAIL"
        },
        {
          Metric: "Parent Coverage",
          Value: `${parentCoverage.toFixed(1)}%`,
          Target: "100%",
          Status: parentCoverage === 100 ? "✅ PASS" : "❌ FAIL"
        },
        {
          Metric: "Scope Purity",
          Value: `${scopePurity.toFixed(1)}%`,
          Target: ">95%",
          Status: scopePurity >= 95 ? "✅ PASS" : "❌ FAIL"
        }
      ];

      console.table(metrics);

      // Display supplementary entity counts for diagnostics and reporting
      console.log("\n--- Informational Counts ---\n");
      const callCount = graph.edges.filter(r => r.entityType === 'CALL').length;

      const counts = [
        { Entity: "CALL Relationships (Deferred)", Count: callCount },
        { Entity: "BOUNDARIES", Count: graph.nodes.filter(n => n.type === 'BOUNDARY').length },
        { Entity: "CONTRACTS", Count: graph.nodes.filter(n => n.type === 'CONTRACT').length },
        { Entity: "RELATIONSHIPS", Count: graph.edges.length },
        { Entity: "OPEN CONNECTORS", Count: graph.nodes.filter(n => n.type === 'OPEN_CONNECTOR').length },
        { Entity: "TOTAL ENTITIES", Count: allEntities.length }
      ];

      console.table(counts);

      // Evaluate overall health gate status
      const allPass = metrics.every(m => m.Status === "✅ PASS");
      if (!allPass) {
        console.error("\nHealth check failed: One or more metrics did not meet the target.");
        process.exit(1);
      } else {
        console.log("\nHealth check passed! Repository graph is structurally sound.");
      }
    });
}
