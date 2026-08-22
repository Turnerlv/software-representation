import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import { analyzeTarget, StructuralNode, StructuralEdge } from "@chomp/core";

export function registerHealthCommand(program: Command) {
  program
    .command("health")
    .description("Compute extraction health metrics for a repository")
    .requiredOption("--repo <path>", "Path to a directory to analyze")
    .action((options: { repo: string }) => {
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

      // 1. Connectivity Rate
      // relationships with targetId / (REQUIRE + IMPORT + MOUNTS + INHERITS + EMITS)
      const connectivityTargetTypes = ['REQUIRE', 'IMPORT', 'MOUNTS', 'INHERITS', 'EMITS'];
      const relationshipsForConnectivity = graph.edges.filter(r => 
        r.entityType && connectivityTargetTypes.includes(r.entityType)
      );
      const connectedCount = relationshipsForConnectivity.filter(r => r.targetId).length;
      const connectivityRate = relationshipsForConnectivity.length > 0 
        ? (connectedCount / relationshipsForConnectivity.length) * 100 
        : 100; // default to 100% if no such relationships

      // 2. Entity Type Coverage
      const entitiesWithKnownType = allEntities.filter(e => e.entityType && e.entityType !== 'UNKNOWN').length;
      const entityTypeCoverage = allEntities.length > 0 
        ? (entitiesWithKnownType / allEntities.length) * 100 
        : 100;

      // 3. Parent Coverage
      // (contracts + open_connectors) with parentBoundaryId / total
      const children = graph.nodes.filter(n => n.type === 'CONTRACT' || n.type === 'OPEN_CONNECTOR');
      const childrenWithParent = children.filter(c => c.parentBoundaryId).length;
      const parentCoverage = children.length > 0 
        ? (childrenWithParent / children.length) * 100 
        : 100;

      // 4. Scope Purity
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

      const allPass = metrics.every(m => m.Status === "✅ PASS");
      if (!allPass) {
        console.error("\nHealth check failed: One or more metrics did not meet the target.");
        process.exit(1);
      } else {
        console.log("\nHealth check passed! Repository graph is structurally sound.");
      }
    });
}
