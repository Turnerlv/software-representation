// Next.js App Router Route Handler — API endpoint for products
// File path: app/api/products/route.ts

import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  return Response.json({ products: [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return Response.json({ created: body }, { status: 201 });
}
