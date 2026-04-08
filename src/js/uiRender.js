import { appState } from "./state.js";

const nodeWidth = 200;
const nodeHeight = 80;

export const renderApp = () => {
  renderControls();
  renderLegend();
  renderInfoBox();
};

export const updateEdges = () => {
  const state = appState.get();
  const nodesData = state.nodes;
  if (!nodesData || nodesData.length === 0) return;

  const container = document.getElementById("graph-container");
  if (!container) return;

  // Clear existing content
  container.innerHTML = "";

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .style("overflow", "visible");

  const g = svg.append("g").attr("transform", `translate(50, 50)`);

  // Stratify data
  let dag;
  try {
    const stratify = d3dag
      .graphStratify()
      .id((d) => d.id)
      .parentIds((d) => d.prerequisites || []);

    dag = stratify(nodesData);
  } catch (error) {
    console.error("DAG Stratify error:", error);
    return;
  }

  // Custom Layering using Simplex
  // Nodes with a specific row requirement should be forced,
  // flexible nodes could be left undefined, or if we want to honor `d.row` but let simplex
  // minimize lengths, we check if they have flexible semester mapping.
  // The problem statement says: "For flexible units (semester [1, 2]), allow the simplex algorithm
  // to assign the layer that minimizes edge length, provided it strictly follows the rule that prerequisites
  // must precede the unit."
  const layering = d3dag.layeringSimplex().rank((node) => {
    // Extract original node data
    const data = node.data;

    // If semester has multiple values (e.g. [1, 2]), it's flexible.
    // We allow simplex to optimize by returning undefined.
    if (data.semester && data.semester.length > 1) {
      return undefined;
    }

    // If semester is strict (length 1), we enforce the chronological row.
    // We use `data.row - 1` to make it 0-indexed if `row` is 1-indexed.
    if (data.row !== undefined) {
      return data.row - 1;
    }

    return undefined;
  });

  const layout = d3dag
    .sugiyama()
    .layering(layering)
    .decross(d3dag.decrossTwoLayer())
    .coord(d3dag.coordQuad())
    .nodeSize([nodeWidth + 60, nodeHeight + 80]); // Adding padding

  // Compute Layout
  layout(dag);

  // Measure DAG size to update SVG
  let maxW = 0;
  let maxH = 0;
  for (const node of dag.nodes()) {
    maxW = Math.max(maxW, node.x);
    maxH = Math.max(maxH, node.y);
  }

  svg
    .attr("width", Math.max(container.clientWidth, maxW + nodeWidth + 100))
    .attr("height", Math.max(container.clientHeight, maxH + nodeHeight + 100));

  // Draw Edges
  const line = d3
    .line()
    .curve(d3.curveMonotoneY)
    .x((d) => d[0])
    .y((d) => d[1]);

  g.append("g")
    .selectAll("path")
    .data(dag.links())
    .enter()
    .append("path")
    .attr("d", (d) => {
      const points = d.points.map((p) => [p[0], p[1]]);

      // Adjust start/end points to attach to top/bottom of nodes
      // points[0] is source center, points[points.length-1] is target center

      points[0][1] += nodeHeight / 2; // Source bottom
      points[points.length - 1][1] -= nodeHeight / 2; // Target top

      return line(points);
    })
    .attr("fill", "none")
    .attr("stroke", "#0066B9")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "5,5")
    .attr("opacity", 0.6);

  // Draw Nodes
  const nodeGroups = g
    .append("g")
    .selectAll("g")
    .data(dag.nodes())
    .enter()
    .append("g")
    .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
    .attr("class", "d3-node cursor-pointer")
    .attr("data-node-id", (d) => d.data.id);

  // Node Rectangle
  nodeGroups
    .append("rect")
    .attr("x", -nodeWidth / 2)
    .attr("y", -nodeHeight / 2)
    .attr("width", nodeWidth)
    .attr("height", nodeHeight)
    .attr("rx", 8)
    .attr("fill", "white")
    .attr("stroke", "#DBDBDB")
    .attr("stroke-width", 2)
    .attr("class", "hover:shadow-lg transition-shadow");

  // Node ID Text
  nodeGroups
    .append("text")
    .text((d) => d.data.id)
    .attr("x", -nodeWidth / 2 + 15)
    .attr("y", -nodeHeight / 2 + 30)
    .attr("font-weight", "bold")
    .attr("fill", "#012A4C")
    .attr("font-family", "sans-serif");

  // Node Name Text
  nodeGroups
    .append("text")
    .text((d) => {
      const name = d.data.name || "";
      return name.length > 25 ? name.substring(0, 22) + "..." : name;
    })
    .attr("x", -nodeWidth / 2 + 15)
    .attr("y", -nodeHeight / 2 + 55)
    .attr("fill", "#616161")
    .attr("font-size", "12px")
    .attr("font-family", "sans-serif");
};

const renderControls = () => {};
const renderLegend = () => {};
const renderInfoBox = () => {};
