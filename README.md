 # GraphVisual — Interactive Graph Algorithm Visualizer

 GraphVisual is a small, self-contained web app for creating graphs
 and visualizing classic graph algorithms. It's built with plain
 HTML/CSS/JavaScript and uses SVG for rendering so visuals stay
 crisp on desktop and mobile devices. The project is intentionally
 dependency-free so you can open the files directly in a browser.

 Features
 - Interactive graph editor: add, drag, and delete nodes and edges.
 - Inline edge weight editing: click an edge label to change its weight.
 - Persistence: graph layout and edges are saved in `localStorage`.
 - Algorithms with step-by-step animations: BFS, DFS, Dijkstra,
	 Kruskal (MST), and SCC (Kosaraju).
 - Visual data-structure panel: shows the queue, stack, or priority
	 queue state during algorithm playback.
 - Touch-friendly: pointer events, clamped dragging, and responsive
	 auto-fit ensure the graph remains usable on phones and tablets.

Pages
 - [index.html](index.html) — landing / navigation
 - [bfs.html](bfs.html) — Breadth-first search visualization
 - [dfs.html](dfs.html) — Depth-first search visualization
 - [dijkstra.html](dijkstra.html) — Shortest-path (Dijkstra)
 - [mst.html](mst.html) — Minimum spanning tree (Kruskal)
 - [scc.html](scc.html) — Strongly connected components (Kosaraju)

Quick controls
 - Click empty canvas to add a node.
 - Click the `Add Edge` button, then click two nodes to add an edge.
 - Click `Delete Edge` then click an edge to remove it.
 - Drag nodes (touch or mouse) to reposition; changes are saved.
 - Double-click a node to designate it as the algorithm start/source.
 - Click an edge label to edit its weight (press Enter or click away to save).
 - Use `Run`, `Step`, `Pause`, and `Clear Steps` to control algorithm playback.

Developer notes
 - Main logic is in `js/main.js` and styles in `styles.css`.
 - To reset saved graphs, clear `localStorage` key `graphvisual_graph_v1`.
 - The code intentionally keeps everything in a single module for
	 simplicity — feel free to split into smaller files if you prefer.

How to use locally
 1. Clone or download this folder.
 2. Open `index.html` in your browser (no build step required).

Contributing
 - Bug reports and small improvements are welcome. If you add features,
	 try to keep the UI simple and avoid extra dependencies.

License
 - This project is provided as-is; add a license file if you intend to
	 redistribute or publish a derivative project.

Enjoy exploring algorithms visually — tell me if you'd like more
algorithm visualizations, export options, or improved mobile gestures.
