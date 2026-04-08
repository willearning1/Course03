// graphMath.js
// Handles all logical calculations: Topological sorting, prerequisite checking, and edge layout

import { appState } from "./state.js";

export const getRowSemester = (rIdx) => {
  return (rIdx % 3) + 1;
};

export const getTotalUnlockedCP = (completed, nodes) => {
  let total = 0;
  completed.forEach((id) => {
    const node = nodes.find((n) => n.id === id);
    if (node) {
      total += node.cp !== undefined ? node.cp : 12;
    }
  });
  return total;
};

export const checkPrereqsMet = (nodeId, completed, nodes, edges) => {
  const unlockedCP = getTotalUnlockedCP(completed, nodes);
  const node = nodes.find((n) => n.id === nodeId);
  if (node && node.cpReq !== undefined && unlockedCP < node.cpReq) return false;

  const prereqEdges = edges.filter((e) => e.to === nodeId);
  const requiredEdges = prereqEdges.filter((e) => !e.dashed);

  if (requiredEdges.length === 0) return true;
  return requiredEdges.every((e) => completed.has(e.from));
};

export const isNodeDimmed = (nodeId, activeNode, completed, nodes, edges) => {
  // Dim if not unlocked (prereqs not met) and not completed
  if (
    !completed.has(nodeId) &&
    !checkPrereqsMet(nodeId, completed, nodes, edges)
  ) {
    if (activeNode === nodeId) return false; // Keep fully visible if active
    return true;
  }

  // If active, highlight tree branches
  if (activeNode) {
    if (nodeId === activeNode) return false;
    const isConnected = edges.some(
      (e) =>
        (e.from === activeNode && e.to === nodeId) ||
        (e.to === activeNode && e.from === nodeId),
    );
    return !isConnected;
  }
  return false;
};

export const getNodeTerminalCounts = (nodes, edges) => {
  const counts = {};
  nodes.forEach((n) => {
    counts[n.id] = { inGroups: new Set(), outGroups: new Set() };
  });
  edges.forEach((e) => {
    if (counts[e.from]) counts[e.from].outGroups.add(e.outGroup);
    if (counts[e.to]) counts[e.to].inGroups.add(e.inGroup);
  });

  // Convert sets to sorted arrays
  Object.keys(counts).forEach((id) => {
    counts[id].inGroups = Array.from(counts[id].inGroups).sort((a, b) => a - b);
    counts[id].outGroups = Array.from(counts[id].outGroups).sort(
      (a, b) => a - b,
    );
  });
  return counts;
};

export const getTerminalColor = (hex, idx = 0) => {
  hex = hex.replace(/^#/, "");
  let r = parseInt(hex.substring(0, 2), 16) / 255;
  let g = parseInt(hex.substring(2, 4), 16) / 255;
  let b = parseInt(hex.substring(4, 6), 16) / 255;

  let cmin = Math.min(r, g, b),
    cmax = Math.max(r, g, b),
    delta = cmax - cmin,
    h = 0,
    s = 0,
    l = 0;

  if (delta === 0) h = 0;
  else if (cmax === r) h = ((g - b) / delta) % 6;
  else if (cmax === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  l = (cmax + cmin) / 2;
  s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  if (l < 0.5) l = Math.min(1, l + 0.35);
  else l = Math.max(0, l - 0.35);

  const hueShift = (idx % 3) * -5;
  const lightShift = (idx % 3) * 0.04;

  h = (h + hueShift + 360) % 360;
  l = Math.max(0, Math.min(1, l + (l > 0.5 ? -lightShift : lightShift)));

  s = +(s * 100).toFixed(1);
  l = +(l * 100).toFixed(1);

  return `hsl(${h}, ${s}%, ${l}%)`;
};

export const getInactiveColor = (idx = 0) => {
  let h = 214;
  let s = 32;
  let l = 0.85;

  const hueShift = (idx % 3) * -5;
  const lightShift = (idx % 3) * 0.04;

  h = (h + hueShift + 360) % 360;
  l = Math.max(0, Math.min(1, l - lightShift));
  l = +(l * 100).toFixed(1);

  return `hsl(${h}, ${s}%, ${l}%)`;
};

export const calculateEdges = (containerRect, nodes, edges, nodeTypes) => {
  const counts = getNodeTerminalCounts(nodes, edges);

  return edges
    .map((edge, i) => {
      const fromEl = document.getElementById(`node-${edge.from}`);
      const toEl = document.getElementById(`node-${edge.to}`);
      if (!fromEl || !toEl) return null;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      const outCount = counts[edge.from].outGroups.length;
      const outIndex = counts[edge.from].outGroups.indexOf(edge.outGroup);

      const inCount = counts[edge.to].inGroups.length;
      const inIndex = counts[edge.to].inGroups.indexOf(edge.inGroup);

      const startX =
        fromRect.left +
        (fromRect.width / (outCount + 1)) * (outIndex + 1) -
        containerRect.left;
      const startY = fromRect.bottom - containerRect.top;

      const endX =
        toRect.left +
        (toRect.width / (inCount + 1)) * (inIndex + 1) -
        containerRect.left;
      const endY = toRect.top - containerRect.top;

      const toNode = nodes.find((n) => n.id === edge.to);
      const style = toNode ? nodeTypes[toNode.type] : { bg: "#FFFFFF" };
      const destColor = getTerminalColor(style.bg, i);

      return {
        ...edge,
        startX,
        startY,
        endX,
        endY,
        color: destColor,
        edgeIdx: i,
      };
    })
    .filter(Boolean);
};

export const getPathData = (edge) => {
  const dy = edge.endY - edge.startY;
  const dx = edge.endX - edge.startX;
  const tensionY = Math.max(Math.abs(dy) * 0.4, 30);
  const curveOffsetX = dx > 0 ? 10 : dx < 0 ? -10 : 0;

  return `M ${edge.startX},${edge.startY}
    C ${edge.startX + curveOffsetX},${edge.startY + tensionY}
      ${edge.endX},${edge.endY - tensionY}
      ${edge.endX},${edge.endY}`;
};

export const isMoveValid = (nodeId, targetSemester, nodes, edges, rowPreferences, rowCapacity) => {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return false;

  const prereqs = edges.filter((e) => e.to === nodeId).map((e) => e.from);
  let maxPrereqRow = -1;
  prereqs.forEach((pId) => {
    const pNode = nodes.find((n) => n.id === pId);
    if (pNode && pNode.row > maxPrereqRow) {
      maxPrereqRow = pNode.row;
    }
  });

  const postreqs = edges.filter((e) => e.from === nodeId).map((e) => e.to);
  let minPostreqRow = 999;
  postreqs.forEach((pId) => {
    const pNode = nodes.find((n) => n.id === pId);
    if (pNode && pNode.row < minPostreqRow) {
      minPostreqRow = pNode.row;
    }
  });

  for (let r = maxPrereqRow + 1; r < minPostreqRow; r++) {
    if (node.cpReq !== undefined) {
      let maxPossibleCP = 0;
      for (let i = 0; i < r; i++) {
        const cap = rowPreferences[i] !== undefined ? rowPreferences[i] : rowCapacity;
        maxPossibleCP += cap * 12;
      }
      if (maxPossibleCP < node.cpReq) continue;
    }

    if (getRowSemester(r) === targetSemester) return true;
  }
  return false;
};

export const refreshLayout = (
  nodes,
  edges,
  rowPreferences,
  rowCapacity,
  refreshManualEdits = true,
  refreshInputOutput = true,
  refreshHorizontal = true,
) => {
  let newNodes = [...nodes];

  const inDegree = {};
  const adjList = {};
  newNodes.forEach((n) => {
    inDegree[n.id] = 0;
    adjList[n.id] = [];
  });

  edges.forEach((e) => {
    if (adjList[e.from]) adjList[e.from].push(e.to);
    if (inDegree[e.to] !== undefined) {
      if (!e.dashed) inDegree[e.to]++;
    }
  });

  // Calculate descendant counts to prioritize critical path nodes
  const getDescendantCount = (nodeId, memo = {}) => {
    if (memo[nodeId] !== undefined) return memo[nodeId];
    let count = 0;
    const children = adjList[nodeId] || [];
    count += children.length;
    children.forEach((child) => {
      count += getDescendantCount(child, memo);
    });
    memo[nodeId] = count;
    return count;
  };

  const descendantCounts = {};
  const ancestorCounts = {};
  newNodes.forEach((n) => {
    descendantCounts[n.id] = getDescendantCount(n.id);
    ancestorCounts[n.id] = edges.filter((e) => e.to === n.id).length;
  });

  const queue = [];
  Object.keys(inDegree).forEach((id) => {
    if (inDegree[id] === 0) queue.push(id);
  });

  // Sort initially by highest descendants, then highest ancestors
  const sortQueue = (q) => {
    q.sort((a, b) => {
      if (descendantCounts[b] !== descendantCounts[a]) {
        return descendantCounts[b] - descendantCounts[a];
      }
      return ancestorCounts[b] - ancestorCounts[a];
    });
  };

  sortQueue(queue);

  const sortedIds = [];
  while (queue.length > 0) {
    const currId = queue.shift();
    sortedIds.push(currId);

    adjList[currId].forEach((neighbor) => {
      if (inDegree[neighbor] !== undefined) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          queue.push(neighbor);
          // Re-sort the queue every time a new node becomes available
          // Prioritize placing the longest critical paths first, breaking ties with input dependencies (capstone units)
          sortQueue(queue);
        }
      }
    });
  }

  if (sortedIds.length < newNodes.length) {
    newNodes.forEach((n) => {
      if (!sortedIds.includes(n.id)) sortedIds.push(n.id);
    });
  }

  const rowCounts = {};
  const assignedRows = {};

  sortedIds.forEach((id) => {
    const node = newNodes.find((n) => n.id === id);

    const prereqs = edges
      .filter((e) => e.to === id && !e.dashed)
      .map((e) => e.from);
    let maxPrereqRow = -1;
    prereqs.forEach((pId) => {
      if (assignedRows[pId] !== undefined && assignedRows[pId] > maxPrereqRow) {
        maxPrereqRow = assignedRows[pId];
      }
    });

    let targetRow = maxPrereqRow + 1;
    let placed = false;

    // Check for manual row preference
    if (node.manualRow !== undefined && node.manualRow > maxPrereqRow) {
      const sem = getRowSemester(node.manualRow);
      const capacity =
        rowPreferences[node.manualRow] !== undefined
          ? rowPreferences[node.manualRow]
          : rowCapacity;
      const currentCount = rowCounts[node.manualRow] || 0;

      if (node.avail.includes(sem) && currentCount < capacity) {
        targetRow = node.manualRow; // Preference is valid and respects constraints
      }
    }

    while (!placed) {
      if (node.cpReq !== undefined) {
        let maxPossibleCP = 0;
        for (let r = 0; r < targetRow; r++) {
          const cap = rowPreferences[r] !== undefined ? rowPreferences[r] : rowCapacity;
          maxPossibleCP += cap * 12;
        }
        if (maxPossibleCP < node.cpReq) {
          targetRow++;
          continue;
        }
      }

      const sem = getRowSemester(targetRow);
      const capacity =
        rowPreferences[targetRow] !== undefined
          ? rowPreferences[targetRow]
          : rowCapacity;
      const currentCount = rowCounts[targetRow] || 0;

      // Only assign if sem is in node.avail AND (it is not a Summer row (sem 3) OR it is manually forced)
      // Allow Summer if it's the ONLY availability
      const isSummerAllowed =
        sem !== 3 || node.avail.length === 1 || targetRow === node.manualRow;

      if (
        node.avail.includes(sem) &&
        isSummerAllowed &&
        currentCount < capacity
      ) {
        assignedRows[id] = targetRow;
        rowCounts[targetRow] = currentCount + 1;
        placed = true;
      } else {
        targetRow++;
      }
    }
  });

  newNodes = newNodes.map((n) => ({
    ...n,
    row: assignedRows[n.id] !== undefined ? assignedRows[n.id] : n.row,
  }));

  const finalMaxRow = Math.max(...newNodes.map((n) => n.row));
  const wilNode = newNodes.find((n) => n.id === "WIL");
  if (wilNode && wilNode.row < finalMaxRow) {
    wilNode.row = finalMaxRow;
  }

  const maxAssignedRow = Math.max(...Object.values(assignedRows));

  // ----------------------------------------------------------------------
  // Weighted Multi-pass Barycenter Heuristic for Crossing Reduction
  // ----------------------------------------------------------------------

  // ----------------------------------------------------------------------
  // Weighted Multi-pass Barycenter Heuristic for Crossing Reduction
  // ----------------------------------------------------------------------

  if (!refreshManualEdits) {
    newNodes.forEach((n) => {
      delete n.manualColIndex;
    });
  }

  // 1. Initial ordering (by manualColIndex or degree to ensure highly connected nodes are placed first)
  const nodeDegrees = {};
  newNodes.forEach((n) => {
    const outEdges = edges.filter((e) => e.from === n.id);
    const inEdges = edges.filter((e) => e.to === n.id);
    nodeDegrees[n.id] = outEdges.length + inEdges.length;
  });

  const rowNodesMap = Array.from({ length: maxAssignedRow + 1 }, () => []);
  newNodes.forEach((n) => rowNodesMap[n.row].push(n));

  rowNodesMap.forEach((rowNodes, r) => {
    rowNodes.sort((a, b) => {
      if (a.manualColIndex !== undefined && b.manualColIndex !== undefined) {
        return a.manualColIndex - b.manualColIndex;
      }
      if (a.manualColIndex !== undefined) return -1;
      if (b.manualColIndex !== undefined) return 1;
      return nodeDegrees[b.id] - nodeDegrees[a.id]; // Higher degree first
    });
  });

  if (refreshHorizontal) {
    const getTerminalCounts = getNodeTerminalCounts(newNodes, edges);

    const calculateBarycenter = (row, direction) => {
      const rowNodes = rowNodesMap[row];
      if (rowNodes.length <= 1) return;

      rowNodes.forEach((n) => {
        let weightSum = 0;
        let count = 0;

        if (direction === "down" || direction === "both") {
          // Look at parents (edges where to === n.id)
          const inEdges = edges.filter((e) => e.to === n.id);
          const inGroupsCount = getTerminalCounts[n.id].inGroups.length;

          inEdges.forEach((e) => {
            const parent = newNodes.find((p) => p.id === e.from);
            if (parent && parent.row < row) {
              const parentRowNodes = rowNodesMap[parent.row];
              const pIdx = parentRowNodes.indexOf(parent);

              // Terminal offset for parent
              const outGroupsCount =
                getTerminalCounts[parent.id].outGroups.length;
              const outIndex = getTerminalCounts[parent.id].outGroups.indexOf(
                e.outGroup,
              );
              const pTerminalOffset =
                outGroupsCount > 0
                  ? (outIndex + 1) / (outGroupsCount + 1) - 0.5
                  : 0;

              // Terminal offset for child
              const inIndex = getTerminalCounts[n.id].inGroups.indexOf(
                e.inGroup,
              );
              const cTerminalOffset =
                inGroupsCount > 0
                  ? (inIndex + 1) / (inGroupsCount + 1) - 0.5
                  : 0;

              weightSum += pIdx + pTerminalOffset - cTerminalOffset;
              count++;
            }
          });
        }

        if (direction === "up" || direction === "both") {
          // Look at children (edges where from === n.id)
          const outEdges = edges.filter((e) => e.from === n.id);
          const outGroupsCount = getTerminalCounts[n.id].outGroups.length;

          outEdges.forEach((e) => {
            const child = newNodes.find((c) => c.id === e.to);
            if (child && child.row > row) {
              const childRowNodes = rowNodesMap[child.row];
              const cIdx = childRowNodes.indexOf(child);

              // Terminal offset for child
              const inGroupsCount = getTerminalCounts[child.id].inGroups.length;
              const inIndex = getTerminalCounts[child.id].inGroups.indexOf(
                e.inGroup,
              );
              const cTerminalOffset =
                inGroupsCount > 0
                  ? (inIndex + 1) / (inGroupsCount + 1) - 0.5
                  : 0;

              // Terminal offset for parent
              const outIndex = getTerminalCounts[n.id].outGroups.indexOf(
                e.outGroup,
              );
              const pTerminalOffset =
                outGroupsCount > 0
                  ? (outIndex + 1) / (outGroupsCount + 1) - 0.5
                  : 0;

              weightSum += cIdx + cTerminalOffset - pTerminalOffset;
              count++;
            }
          });
        }

        n.barycenter = count > 0 ? weightSum / count : 0;

        if (n.manualColIndex !== undefined) {
          // If respecting manual edits, incorporate the current manual position as a heavy weight
          // so it stays roughly in its designated spot, but can still adjust slightly.
          n.barycenter = (n.barycenter + n.manualColIndex * 2) / 3;
        }
      });

      rowNodes.sort((a, b) => {
        // Tie breakers
        if (Math.abs(a.barycenter - b.barycenter) < 0.01) {
          if (
            a.manualColIndex !== undefined &&
            b.manualColIndex !== undefined
          ) {
            return a.manualColIndex - b.manualColIndex;
          }
          if (a.manualColIndex !== undefined) return -1;
          if (b.manualColIndex !== undefined) return 1;
          return nodeDegrees[b.id] - nodeDegrees[a.id];
        }
        return a.barycenter - b.barycenter;
      });
    };

    // 2. Multi-pass sweeps
    const iterations = 4;
    for (let i = 0; i < iterations; i++) {
      // Top-down sweep
      for (let r = 1; r <= maxAssignedRow; r++) {
        calculateBarycenter(r, "down");
      }
      // Bottom-up sweep
      for (let r = maxAssignedRow - 1; r >= 0; r--) {
        calculateBarycenter(r, "up");
      }
    }

    // Final top-down to settle
    for (let r = 1; r <= maxAssignedRow; r++) {
      calculateBarycenter(r, "down");
    }
  } // end if refreshHorizontal
  // Rebuild newNodes based on the final sorted rowNodesMap
  let orderedNodes = [];
  rowNodesMap.forEach((rowNodes) => {
    orderedNodes = orderedNodes.concat(rowNodes);
  });

  // Map properties back, stripping any temporary fields used during calc
  newNodes = newNodes.map((originalNode) => {
    const finalNode = orderedNodes.find((n) => n.id === originalNode.id);
    return {
      ...originalNode,
      row: finalNode.row,
    };
  });

  // We need to actually order newNodes so uiRender draws them in correct flex order
  newNodes.sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    const aRowNodes = rowNodesMap[a.row];
    return (
      aRowNodes.indexOf(orderedNodes.find((n) => n.id === a.id)) -
      aRowNodes.indexOf(orderedNodes.find((n) => n.id === b.id))
    );
  });

  // ----------------------------------------------------------------------
  // Input/Output Terminal Auto-Ordering
  // ----------------------------------------------------------------------
  if (refreshInputOutput) {
    // For each node, auto-sort the inGroups and outGroups based on the horizontal positions of connections
    newNodes.forEach((node) => {
      // 1. Sort incoming edges (parents)
      const inEdges = edges.filter((e) => e.to === node.id);

      inEdges.sort((a, b) => {
        const parentA = newNodes.find((n) => n.id === a.from);
        const parentB = newNodes.find((n) => n.id === b.from);

        // Put connections coming from higher up (earlier rows) first
        if (parentA.row !== parentB.row) return parentA.row - parentB.row;

        // Then sort by horizontal index
        const rowNodes = rowNodesMap[parentA.row];
        return rowNodes.indexOf(parentA) - rowNodes.indexOf(parentB);
      });

      // Update inGroups sequentially
      inEdges.forEach((e, idx) => {
        e.inGroup = idx;
      });

      // 2. Sort outgoing edges (children)
      const outEdges = edges.filter((e) => e.from === node.id);

      outEdges.sort((a, b) => {
        const childA = newNodes.find((n) => n.id === a.to);
        const childB = newNodes.find((n) => n.id === b.to);

        if (childA.row !== childB.row) return childA.row - childB.row;

        const rowNodes = rowNodesMap[childA.row];
        return rowNodes.indexOf(childA) - rowNodes.indexOf(childB);
      });

      // Update outGroups sequentially
      outEdges.forEach((e, idx) => {
        e.outGroup = idx;
      });
    });
  }

  return newNodes;
};
