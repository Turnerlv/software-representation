import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { condenseGraph } from "@chomp/core";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { nodes, edges } = body;

    if (!nodes || !Array.isArray(nodes)) {
      return NextResponse.json({ error: "Invalid nodes array provided." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured on the server." }, { status: 500 });
    }

    // Preprocess the graph to filter out AST noise and roll up contracts to boundaries
    const condensed = condenseGraph({ nodes, edges: edges || [] });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

    // Minimize payload to save tokens
    const minNodes = condensed.nodes.map(n => ({ id: n.id, name: n.name, type: n.type }));
    const minEdges = condensed.edges.map(e => ({ source: e.sourceId, target: e.targetId, type: e.type }));

    const prompt = `
You are the Chomp Cartographer, an AI expert in software architecture. 
I am providing you a condensed macroscopic list of structural nodes and edges representing an application's topology.

Your job is to organize these nodes into a logical Transit Map layout by assigning each node to a 'lane' and giving it a 'role'.

Lanes could be (as numbers): 1 for "Ingress/Gateway", 2 for "Core/Middle", 3 for "Egress/DB/External".
Roles MUST BE ONE OF: "INGRESS", "CORE", "EGRESS", "TOP_TRAY", "BOTTOM_TRAY".

Return ONLY a valid JSON array where each object has:
- id: (the exact node id from the input)
- lane: (number, the lane this node belongs in, lower numbers are closer to the entry point)
- role: (string, the role of this node)

Nodes:
${JSON.stringify(minNodes, null, 2)}

Edges:
${JSON.stringify(minEdges, null, 2)}
`;

    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
        }
    });
    
    const responseText = result.response.text();
    
    try {
        const layoutAssignments = JSON.parse(responseText);
        return NextResponse.json({ assignments: layoutAssignments });
    } catch (e) {
        return NextResponse.json({ error: "AI returned invalid JSON", raw: responseText }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Cartographer Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
