"use client";

import { useEffect, useState } from "react";
import GraphVisualizer from "../components/GraphVisualizer";

export default function Home() {
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchGraph() {
            try {
                // In local mode, this hits the Express server that served this static file.
                // In cloud mode, this hits the Next.js API route.
                const res = await fetch("/api/graph");
                if (!res.ok) throw new Error("Failed to fetch graph data");
                const json = await res.json();
                
                if (json.error) throw new Error(json.error);
                
                setData(json);
            } catch (err: any) {
                setError(err.message || "Failed to load graph");
            } finally {
                setLoading(false);
            }
        }
        fetchGraph();
    }, []);

    if (loading) {
        return <div style={{ padding: '2rem', color: '#c9d1d9', background: '#0d1117', height: '100vh' }}>Loading graph...</div>;
    }

    if (error) {
        return (
            <div style={{ padding: '2rem', color: '#f85149', background: '#0d1117', height: '100vh', fontFamily: 'sans-serif' }}>
                <h2>Error Loading Graph</h2>
                <p>{error}</p>
            </div>
        );
    }

    return (
        <main style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Environment Banner / Cloud Upsell */}
            <div style={{
                background: '#1f6feb',
                color: 'white',
                padding: '8px 16px',
                fontSize: '14px',
                fontFamily: 'sans-serif',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                zIndex: 1000
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ 
                        width: '8px', height: '8px', borderRadius: '50%', background: '#56d364', display: 'inline-block' 
                    }}></span>
                    <strong>Local Preview</strong> — Viewing static local snapshot.
                </div>
                <div>
                    Unlock real-time chat, GitHub linking, and shareable URLs with a free <a href="https://chomp.dev" style={{textDecoration: 'underline', fontWeight: 'bold'}}>Chomp Cloud Account &rarr;</a>
                </div>
            </div>

            <div style={{ flex: 1, position: 'relative' }}>
                <GraphVisualizer initialNodes={data?.nodes || []} initialEdges={data?.edges || []} gridLayout={data?.gridLayout || null} />
            </div>
        </main>
    );
}
