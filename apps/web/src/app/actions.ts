"use server";

import { createSQLiteStorage } from "@chomp/db";
import path from "node:path";
import fs from "node:fs";

export async function fetchLocalGraph() {
    // When running `npm run dev` in apps/web, process.cwd() is the apps/web directory.
    // Allow selecting DB via ACTIVE_DB pointer, fallback to CHOMP_DB_PATH
    const activeKey = process.env.ACTIVE_DB || "CHOMP_DB_PATH";
    const envPath = process.env[activeKey] || process.env.CHOMP_DB_PATH;
    const dbPath = envPath || path.join(process.cwd(), "../../.chomp/graph.db");

    let targetDbPath = dbPath;
    let gridLayoutPath = path.join(path.dirname(dbPath), "grid_layout.json");

    if (dbPath.endsWith('.json')) {
        targetDbPath = path.join(path.dirname(dbPath), "graph.db");
        gridLayoutPath = dbPath;
    }

    if (!fs.existsSync(targetDbPath)) {
        return { error: `No database found at ${targetDbPath}. Run 'chomp analyze .' at the root of your monorepo first.` };
    }

    try {
        const storage = createSQLiteStorage(targetDbPath);
        const repos = await storage.listRepositories();

        if (!repos || repos.length === 0) {
            return { error: "Database is empty. No repositories found." };
        }

        const graph = await storage.getRepresentationGraph(repos[0].id);

        let gridLayout = null;
        try {
            if (fs.existsSync(gridLayoutPath)) {
                gridLayout = JSON.parse(fs.readFileSync(gridLayoutPath, "utf-8"));
            }
        } catch (e) {
            console.error(`Failed to read ${gridLayoutPath}`, e);
        }

        return {
            nodes: graph?.nodes || [],
            edges: graph?.edges || [],
            gridLayout
        };
    } catch (err: any) {
        console.error("DEBUG ERROR STACK:", err.stack);
        return { error: `Failed to read database: ${err.message}` };
    }
}
