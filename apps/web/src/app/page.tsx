import { fetchLocalGraph } from "./actions";
import GraphVisualizer from "../components/GraphVisualizer";

export default async function Home() {
    const data = await fetchLocalGraph();

    if ('error' in data) {
        return (
            <div style={{ padding: '2rem', color: 'red', fontFamily: 'sans-serif' }}>
                <h2>Error Loading Graph</h2>
                <p>{data.error}</p>
            </div>
        );
    }

    return (
        <main style={{ width: '100vw', height: '100vh' }}>
            <GraphVisualizer initialNodes={data.nodes} initialEdges={data.edges} />
        </main>
    );
}