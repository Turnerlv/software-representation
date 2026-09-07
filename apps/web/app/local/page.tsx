"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function LocalViewContent() {
  const searchParams = useSearchParams();
  const port = searchParams.get("port") || "5555";
  
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [layout, setLayout] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    async function fetchLocalData() {
      try {
        setLoading(true);
        const statusRes = await fetch(`http://localhost:${port}/api/status`);
        if (!statusRes.ok) throw new Error("Local server not reachable");
        const statusData = await statusRes.json();
        setStatus(statusData);

        const graphRes = await fetch(`http://localhost:${port}/api/graph`);
        if (!graphRes.ok) throw new Error("Failed to fetch graph data");
        const graphData = await graphRes.json();
        setData(graphData);
      } catch (err: any) {
        setError(err.message || "Failed to connect to local Chomp CLI");
      } finally {
        setLoading(false);
      }
    }

    fetchLocalData();
  }, [port]);

  if (loading) {
    return <div className="p-8 text-white">Connecting to local Chomp server on port {port}...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-red-500">
        <h1 className="text-2xl font-bold mb-4">Connection Error</h1>
        <p>{error}</p>
        <p className="mt-4 text-gray-400">Make sure you have run <code className="bg-gray-800 p-1 rounded">chomp ui</code> in your terminal.</p>
      </div>
    );
  }

  const generateLayout = async () => {
    if (!data?.nodes) return;
    try {
      setGenerating(true);
      const res = await fetch("/api/cartographer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: data.nodes, edges: data.edges })
      });
      const result = await res.json();
      if (res.ok) {
        setLayout(result.assignments);
      } else {
        alert(result.error || "Failed to generate layout");
      }
    } catch (err) {
      alert("Error generating layout.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-8 text-white">
      <header className="mb-8 border-b border-gray-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block animate-pulse"></span>
            Local Preview: {status?.repoName}
          </h1>
          <p className="text-gray-400 mt-2">
            Connected to localhost:{port} | ID: {status?.repoId}
          </p>
        </div>
        <button 
          onClick={generateLayout}
          disabled={generating}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          {generating ? "Generating..." : "Generate AI Layout"}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-8">
        <div className="bg-gray-900 p-4 rounded-lg border border-gray-800 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold mb-4">Graph Statistics</h2>
            <ul className="space-y-2 text-gray-300">
              <li>Nodes: {data?.nodes?.length || 0}</li>
              <li>Edges: {data?.edges?.length || 0}</li>
              <li>Analyzed At: {new Date(data?.analyzedAt).toLocaleString()}</li>
              <li>Commit: <code className="text-sm bg-gray-800 px-1 rounded">{data?.commitSha?.substring(0, 7) || 'None'}</code></li>
            </ul>
          </div>
          
          {layout && (
            <div className="mt-4 pt-4 border-t border-gray-800 overflow-auto max-h-[300px]">
              <h2 className="text-xl font-semibold text-green-400 mb-2">Cartographer Layout Output</h2>
              <pre className="text-xs text-gray-300">
                {JSON.stringify(layout, null, 2)}
              </pre>
            </div>
          )}
        </div>
        
        <div className="bg-gray-900 p-4 rounded-lg border border-gray-800 overflow-auto h-[600px]">
          <h2 className="text-xl font-semibold mb-4">Raw Graph Data (Placeholder)</h2>
          <pre className="text-xs text-gray-400">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function LocalViewPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LocalViewContent />
    </Suspense>
  );
}
