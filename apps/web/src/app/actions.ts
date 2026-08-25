"use server";

import { createSQLiteStorage } from "@chomp/db";
import path from "node:path";
import fs from "node:fs";

export async function fetchLocalGraph() {
    // When running `npm run dev` in apps/web, process.cwd() is the apps/web directory.
    // We look for the DB in the monorepo root (../../) by default.
    const dbPath = process.env.CHOMP_DB_PATH || path.join(process.cwd(), "../../.chomp/graph.db");

    if (!fs.existsSync(dbPath)) {
        return { error: `No database found at ${dbPath}. Run 'chomp analyze .' at the root of your monorepo first.` };
    }

    try {
        const storage = createSQLiteStorage(dbPath);
        const repos = await storage.listRepositories();

        if (!repos || repos.length === 0) {
            return { error: "Database is empty. No repositories found." };
        }

        // Grab the first repository (since local dev uses one repo per DB)
        const graph = await storage.getRepresentationGraph(repos[0].id);

        return {
            nodes: graph?.nodes || [],
            edges: graph?.edges || []
        };
    } catch (err: any) {
        console.error("DEBUG ERROR STACK:", err.stack);
        return { error: `Failed to read database: ${err.message}` };
    }
}