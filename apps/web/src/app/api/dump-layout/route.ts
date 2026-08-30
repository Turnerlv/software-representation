import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
    try {
        const data = await request.json();

        // Save it next to the graph.db
        const dumpPath = process.env.CHOMP_DB_PATH
            ? path.join(path.dirname(process.env.CHOMP_DB_PATH), 'rendered_layout.json')
            : path.join(process.cwd(), '../../.chomp/rendered_layout.json');

        fs.writeFileSync(dumpPath, JSON.stringify(data, null, 2));

        return NextResponse.json({ success: true, path: dumpPath });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}