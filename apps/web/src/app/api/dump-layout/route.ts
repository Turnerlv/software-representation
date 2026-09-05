import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
    try {
        const data = await request.json();

        const activeKey = process.env.ACTIVE_DB || "CHOMP_DB_PATH";
        const envPath = process.env[activeKey] || process.env.CHOMP_DB_PATH;

        // Save it next to the active graph.db
        const dumpPath = envPath
            ? path.join(path.dirname(envPath), 'rendered_layout.json')
            : path.join(process.cwd(), '../../.chomp/rendered_layout.json');

        fs.writeFileSync(dumpPath, JSON.stringify(data, null, 2));

        return NextResponse.json({ success: true, path: dumpPath });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
