// uiRender.js
// Handles all DOM manipulation

import { appState } from './state.js';
import * as MathLogic from './graphMath.js';

export const renderApp = () => {
  renderControls();
  renderLegend();
  renderNodes();
  renderInfoBox();
};

export const updateEdges = () => {
  const container = document.getElementById('graph-container');
  if (!container) return;

  const state = appState.get();

  if (!state.nodes || state.nodes.length === 0) return;

  const newEdges = MathLogic.calculateEdges(
    container.getBoundingClientRect(),
    state.nodes,
    state.edges,
    state.nodeTypes
  );

  // Prevent infinite update loop by checking if edges actually changed
  // (a simple length check is sufficient here to break the initial render loop)
  if (JSON.stringify(state.drawnEdges) !== JSON.stringify(newEdges)) {
    appState.set({ drawnEdges: newEdges });
  } else {
    // Just re-render them if we aren't updating state
    renderEdges();
  }
};

const renderControls = () => {
  const container = document.getElementById('capacity-controls');
  if (!container) return;

  const { rowCapacity, nodes } = appState.get();
  if (nodes.length === 0) return; // Not initialized

  let html = '';
  [1, 2, 3, 4, 5].forEach(val => {
    const isSelected = rowCapacity === val;
    const btnClass = isSelected
      ? "bg-[#0066B9] text-white shadow-sm"
      : "bg-transparent text-[#1C1C1C] hover:bg-[#E2E8F0]";

    const tooltip = `${val} unit${val > 1 ? 's' : ''}/semester`;

    html += `
      <button
        data-action="set-capacity"
        data-value="${val}"
        title="${tooltip}"
        class="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center text-xs md:text-sm font-bold rounded-md transition-colors ${btnClass}"
      >
        ${val}
      </button>
    `;
  });

  container.innerHTML = html;
};

const renderLegend = () => {
  const container = document.getElementById('legend-container');
  if (!container) return;

  const { nodeTypes } = appState.get();
  if (Object.keys(nodeTypes).length === 0) return;

  // Match the spacing (p-1), gap, and height of the unit/sem toolbar
  container.className = 'hidden print:flex lg:flex flex-wrap items-center gap-2 bg-[#F5F5F5] rounded-lg p-1 border border-[#DBDBDB] print:ml-4 h-6 md:h-8';

  let html = '';

  for (const [key, val] of Object.entries(nodeTypes)) {
    html += `
      <div class="flex items-center gap-1.5 px-0.5">
        <div class="w-3.5 h-3.5 rounded" style="background-color: ${val.bg}"></div>
        <span class="text-xs md:text-sm text-[#616161] font-medium leading-none mt-0.5">${val.label}</span>
      </div>
    `;
  }

  container.innerHTML = html;
};

const renderEdges = () => {
  const svgLayer = document.getElementById('edges-layer');
  if (!svgLayer) return;

  const state = appState.get();
  const { drawnEdges, hoveredNode, selectedNode } = state;

  let html = '';

  const activeNode = selectedNode || hoveredNode;

  // Set z-index of svg based on active nodes
  svgLayer.style.zIndex = activeNode ? "5" : "0";

  drawnEdges.forEach((edge, idx) => {
    const isActive = activeNode && (edge.from === activeNode || edge.to === activeNode);
    const isDimmed = hoveredNode && !isActive;

    const activeFilter = "drop-shadow(0px 10px 15px rgba(0, 0, 0, 0.15))";
    const strokeColor = isActive ? edge.color : MathLogic.getInactiveColor(edge.edgeIdx);
    const strokeWidth = isActive ? "5" : "4";
    const dashArray = edge.dashed ? "6,6" : "none";
    const opacity = isDimmed ? 0.35 : isActive ? 1 : 0.85;
    const filter = isActive ? activeFilter : "none";

    html += `
      <path
        d="${MathLogic.getPathData(edge)}"
        fill="none"
        stroke="${strokeColor}"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${dashArray}"
        opacity="${opacity}"
        class="transition-all duration-300 ease-in-out"
        style="filter: ${filter};"
      ></path>
    `;
  });

  svgLayer.innerHTML = html;
};

const renderNodes = () => {
  const container = document.getElementById('nodes-layer');
  if (!container) return;

  const state = appState.get();
  const { nodes, edges, nodeTypes, completed, hoveredNode, selectedNode, pinnedInfoNode, rowCapacity, rowPreferences } = state;

  if (nodes.length === 0) return;

  const maxRow = Math.max(...nodes.map(n => n.row), 8);
  const allGridRows = Array.from({ length: maxRow + 1 }, (_, i) =>
    nodes.filter((n) => n.row === i)
  );

  const activeNode = selectedNode || hoveredNode;
  const terminalCounts = MathLogic.getNodeTerminalCounts(nodes, edges);

  let html = '';

  // Group allGridRows by year (each year has up to 3 rows)
  const rowsByYear = {};
  allGridRows.forEach((rowNodes, rowIdx) => {
    if (rowNodes.length === 0) return;
    const year = Math.floor(rowIdx / 3) + 1;
    if (!rowsByYear[year]) rowsByYear[year] = [];
    rowsByYear[year].push({ rowNodes, rowIdx });
  });

  Object.entries(rowsByYear).forEach(([year, rows]) => {
    html += `
      <div class="relative flex flex-col gap-12 sm:gap-16">
        <!-- Year Header perfectly centered alongside its visible rows -->
        <div class="absolute left-0 sm:left-[-15px] md:left-2 top-1/2 -translate-y-1/2 hidden print:flex lg:flex items-center justify-center">
          <span
            class="text-xs font-bold text-[#616161] tracking-widest uppercase rotate-180 absolute -left-6 whitespace-nowrap"
            style="writing-mode: vertical-rl;"
          >
            Year ${year}
          </span>
        </div>
    `;

    rows.forEach(({ rowNodes, rowIdx }) => {
      const rowSem = MathLogic.getRowSemester(rowIdx);
      const pref = rowPreferences[rowIdx] || rowCapacity;
      const loadLabel = pref <= 2 ? "Part" : pref <= 4 ? "Full" : "Over";

      let unlockedCP = 0;
      let totalCP = 0;
      rowNodes.forEach(n => {
        const cp = n.cp !== undefined ? n.cp : 12;
        totalCP += cp;
        if (completed.has(n.id)) unlockedCP += cp;
      });

      let accCP = 0;
      for (let r = 0; r <= rowIdx; r++) {
         const rNodes = allGridRows[r] || [];
         rNodes.forEach(n => {
            if (completed.has(n.id)) {
              accCP += (n.cp !== undefined ? n.cp : 12);
            }
         });
      }
      const accLabel = accCP < 192 ? "Non-Eng" : "Eng WIL";

      html += `
        <div class="flex flex-col relative">
          <div class="absolute left-0 sm:left-[-15px] md:left-2 top-1/2 -translate-y-1/2 text-right hidden print:flex lg:flex flex-row items-center gap-2">
            <div class="flex flex-col items-end gap-1 ml-4" style="writing-mode: horizontal-tb;">
              <div class="flex items-center gap-1">
                <select
                data-action="change-row-pref"
                data-row="${rowIdx}"
                class="text-[10px] p-0.5 rounded border border-[#DBDBDB] bg-white text-[#616161] outline-none hover:bg-gray-50 cursor-pointer shadow-sm w-[36px] text-center"
                title="Max units per row"
              >
                <option value="1" ${pref === 1 ? 'selected' : ''}>1</option>
                <option value="2" ${pref === 2 ? 'selected' : ''}>2</option>
                <option value="3" ${pref === 3 ? 'selected' : ''}>3</option>
                <option value="4" ${pref === 4 ? 'selected' : ''}>4</option>
                <option value="5" ${pref === 5 ? 'selected' : ''}>5</option>
              </select>
              <span class="text-[10px] text-[#616161] font-semibold">${loadLabel}</span>
            </div>
            <div class="text-[10px] font-mono leading-tight whitespace-nowrap mt-1">
              <span class="text-green-600 font-bold">${unlockedCP}</span>
              <span class="text-gray-400">/${totalCP}cp</span>
            </div>
            <div class="text-[9px] text-[#616161] leading-tight flex flex-col items-end whitespace-nowrap">
              <span class="font-bold">${accCP}cp</span>
              <span>${accLabel}</span>
            </div>
          </div>
        </div>
        <div class="flex justify-center gap-6 sm:gap-10 min-h-[120px] items-center">
    `;

    rowNodes.forEach(node => {
      if (node.isDummy) {
        html += `<div class="dummy-node" style="visibility: hidden; width: ${node.width || 150}px; height: ${node.height || 80}px; flex-shrink: 0; pointer-events: none;"></div>`;
        return;
      }

      const style = nodeTypes[node.type];
      const isDimmed = MathLogic.isNodeDimmed(node.id, activeNode, completed, nodes, edges);
      const isSelected = selectedNode === node.id;

      const inGroups = terminalCounts[node.id]?.inGroups || [];
      const outGroups = terminalCounts[node.id]?.outGroups || [];
      const isPrereqsMet = MathLogic.checkPrereqsMet(node.id, completed, nodes, edges);
      const isCompleted = completed.has(node.id);

      const cardClass = `node-card relative flex flex-col w-32 sm:w-[150px] bg-white rounded-lg border-2 cursor-pointer transition-all duration-300
        ${isSelected ? "ring-4 ring-[#009FE3] ring-opacity-50 border-[#009FE3]" : "border-[#DBDBDB]"}
        ${isDimmed ? "opacity-30 grayscale z-0" : "opacity-100 z-10"}
        ${hoveredNode === node.id ? "z-20 shadow-xl" : ""}
      `;

      html += `
        <div
          id="node-${node.id}"
          data-node-id="${node.id}"
          class="${cardClass}"
          draggable="true"
          data-action="drag-node"
        >
      `;

      // Input Terminals
      inGroups.forEach((group, idx) => {
        const connectedEdges = state.drawnEdges.filter(e => e.to === node.id && e.inGroup === group);
        let edgeIdx = connectedEdges.length > 0 ? connectedEdges[0].edgeIdx : 0;
        let termColor = MathLogic.getTerminalColor(style.bg, edgeIdx);
        let isAnyEdgeActive = false;

        if (connectedEdges.length > 0 && activeNode) {
            isAnyEdgeActive = connectedEdges.some(e => e.from === activeNode || e.to === activeNode);
        }

        const fillColor = (activeNode && isAnyEdgeActive) ? termColor : MathLogic.getInactiveColor(edgeIdx);

        html += `
          <svg
            class="absolute w-4 h-4 z-10"
            style="top: -2px; left: ${(100 / (inGroups.length + 1)) * (idx + 1)}%; transform: translate(-50%, 0);"
            viewBox="0 0 12 12"
          >
            <polygon points="1,0 11,0 6,5" fill="${fillColor}" />
          </svg>
        `;
      });

      // Header
      html += `
        <div class="w-full px-2 py-2 rounded-t-md flex items-center justify-between relative" style="background-color: ${style.bg}">
      `;

      if (node.type === "minor" || node.id === "D1") {
        html += `<span class="font-bold text-sm tracking-wide relative z-20 pointer-events-none" style="color: ${style.text}">${node.title}</span>`;
      } else {
        const link = node.id === "Q1Q2" || node.id === "Q3Q4" ? "https://www.qut.edu.au/study/qut-you" : `https://www.qut.edu.au/study/unit?unitCode=${node.title}`;
        html += `
          <a
            href="${link}"
            target="_blank"
            rel="noopener noreferrer"
            data-action="link-click"
            class="font-bold text-sm tracking-wide relative z-20 hover:underline"
            style="color: ${style.text}"
          >
            ${node.title}
          </a>
        `;
      }

      const isPinned = pinnedInfoNode === node.id;

      html += `
          <div class="flex items-center gap-1.5 relative z-20 pointer-events-none">
            <button
              data-action="info-click"
              data-node-id="${node.id}"
              title="Unit Info"
              class="w-5 h-5 flex items-center justify-center rounded-full border transition-colors shadow-sm pointer-events-auto ${isPinned ? "bg-white border-white text-current" : "bg-transparent border-white text-white hover:bg-white/20"}"
              style="color: ${isPinned ? style.bg : "white"}"
            >
              <span class="text-[12px] font-serif italic font-bold leading-none -mt-0.5 pointer-events-none">i</span>
            </button>
            <div
              class="w-5 h-5 flex items-center justify-center bg-black border border-white border-r-0 text-white text-[10px] font-bold shadow-sm rounded-l-sm"
              style="margin-right: -8px;"
              title="Current Plotted Semester"
            >
              ${rowSem === 3 ? "S" : rowSem}
            </div>
          </div>
        </div>
      `;

      // Move Tabs
      html += `
        <div class="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[90%] flex flex-col gap-1 z-0 no-print">
      `;

      node.avail.forEach(s => {
        if (s === rowSem) return;
        const canMove = MathLogic.isMoveValid(node.id, s, nodes, edges, rowPreferences, rowCapacity);
        const tabClass = canMove
          ? "bg-[#F8F9FA] text-[#616161] border-[#DBDBDB] hover:bg-[#E2E8F0] hover:text-[#012A4C] cursor-pointer"
          : "bg-[#E5E5E5] text-[#A0A0A0] border-[#E5E5E5] cursor-not-allowed opacity-60";

        html += `
          <button
            data-action="move-node"
            data-node-id="${node.id}"
            data-target-sem="${s}"
            ${canMove ? "" : "disabled"}
            title="${canMove ? `Move to Sem ${s === 3 ? "Summer" : s}` : "Cannot move (Prerequisite constraint)"}"
            class="px-1.5 py-2 text-[10px] font-bold rounded-r-md border border-l-0 shadow-sm transition-all ${tabClass}"
          >
            ${s === 3 ? "S" : s}
          </button>
        `;
      });

      html += `</div>`;

      // Body
      const lockClass = isCompleted
        ? "text-green-600 hover:bg-green-100"
        : isPrereqsMet
          ? "text-blue-500 hover:bg-blue-100"
          : "text-gray-400 hover:bg-gray-100 cursor-not-allowed";

      const iconRef = isCompleted ? "#icon-check" : isPrereqsMet ? "#icon-unlock" : "#icon-lock";

      html += `
        <div class="p-2 sm:p-3 flex-1 flex flex-col items-center justify-center text-center relative pb-6 bg-white z-10 rounded-b-md pointer-events-none">
          <span class="text-xs font-medium leading-tight text-[#1C1C1C]">
            ${node.name}
          </span>
          <button
            data-action="toggle-lock"
            data-node-id="${node.id}"
            class="absolute bottom-1 right-1 p-1 rounded-full transition-colors ${lockClass} pointer-events-auto"
            title="${isCompleted ? "Completed" : isPrereqsMet ? "Unlocked" : "Locked"}"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><use href="assets/icons/sprite.svg${iconRef}"></use></svg>
          </button>
        </div>
      `;

      // Output Terminals
      outGroups.forEach((group, idx) => {
        const connectedEdges = state.drawnEdges.filter(e => e.from === node.id && e.outGroup === group);
        let edgeIdx = connectedEdges.length > 0 ? connectedEdges[0].edgeIdx : 0;
        let termColor = MathLogic.getTerminalColor(style.bg, edgeIdx);
        let isAnyEdgeActive = false;

        if (connectedEdges.length > 0 && activeNode) {
            const lastEdge = connectedEdges[connectedEdges.length - 1];
            termColor = lastEdge.color;
            isAnyEdgeActive = connectedEdges.some(e => e.from === activeNode || e.to === activeNode);
        }

        const strokeColor = (activeNode && isAnyEdgeActive) ? termColor : MathLogic.getInactiveColor(edgeIdx);

        html += `
          <svg
            class="absolute bottom-0 w-4 h-4 z-20"
            style="left: ${(100 / (outGroups.length + 1)) * (idx + 1)}%; transform: translate(-50%, 50%);"
            viewBox="0 0 12 12"
          >
            <circle cx="6" cy="6" r="4" fill="white" stroke="${strokeColor}" stroke-width="2" />
          </svg>
        `;
      });

      html += `</div>`;
    });

    html += `</div></div>`;
    }); // close rows.forEach
    
    html += `</div>`; // close year container
  });

  container.innerHTML = html;
};

const renderInfoBox = () => {
  const container = document.getElementById('info-box-container');
  if (!container) return;

  const state = appState.get();
  const { nodes, edges, nodeTypes, completed, pinnedInfoNode, renderedInfoNode, infoBoxPos, isFading, selectedPrereqs, selectedUnlocks } = state;

  const displayInfoNodeId = pinnedInfoNode || renderedInfoNode;
  const infoUnitDetails = displayInfoNodeId ? nodes.find((n) => n.id === displayInfoNodeId) : null;

  if (!infoUnitDetails) {
    container.innerHTML = '';
    return;
  }

  const style = nodeTypes[infoUnitDetails.type];
  const isPinned = pinnedInfoNode === infoUnitDetails.id;
  const visibilityClass = (isFading && !isPinned) ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto';
  const totalUnlockedCP = MathLogic.getTotalUnlockedCP(completed, nodes);

  let html = `
    <div
      id="info-box-panel"
      class="no-print fixed w-80 bg-[#F5F5F5] rounded-xl border border-[#DBDBDB] shadow-2xl flex flex-col z-[100] transition-opacity duration-300 ${visibilityClass}"
      style="left: ${infoBoxPos.x}px; top: ${infoBoxPos.y}px; max-height: 80vh;"
    >
      <div
        id="info-box-header"
        class="p-6 text-white rounded-t-xl ${isPinned ? 'cursor-move' : ''}"
        style="background-color: ${style.bg};"
      >
        <div class="flex justify-between items-center mb-1">
          <h2 class="text-3xl font-bold pointer-events-auto">
            <a href="${infoUnitDetails.id === "Q1Q2" || infoUnitDetails.id === "Q3Q4" ? "https://www.qut.edu.au/study/qut-you" : `https://www.qut.edu.au/study/unit?unitCode=${infoUnitDetails.title}`}" target="_blank" rel="noopener noreferrer" class="hover:underline">
              ${infoUnitDetails.title}
            </a>
          </h2>
          <div class="flex items-center gap-2">
            <span class="px-2 py-1 bg-white/20 rounded text-xs font-bold uppercase tracking-wider backdrop-blur-sm pointer-events-none">
              ${style.label}
            </span>
            ${isPinned ? `
              <button
                data-action="unpin-info"
                class="hover:bg-white/20 p-1 rounded transition-colors pointer-events-auto"
                title="Close Pinned Info Box"
              >
                <svg class="w-5 h-5"><use href="assets/icons/sprite.svg#icon-close"></use></svg>
              </button>
            ` : ''}
          </div>
        </div>
        <p class="text-sm opacity-90 leading-tight pointer-events-none mt-1">
          ${infoUnitDetails.name}
        </p>
      </div>
      <div class="p-6 flex-1 overflow-y-auto rounded-b-xl">
        <div class="mb-6">
          <h3 class="text-xs font-bold text-[#616161] uppercase tracking-wider mb-2 flex items-center gap-2">
            <svg class="w-4 h-4"><use href="assets/icons/sprite.svg#icon-info"></use></svg> Description
          </h3>
          <p class="text-sm text-[#1C1C1C] leading-relaxed">
            ${infoUnitDetails.desc}
          </p>
        </div>

  `;

  if (isPinned) {
    const prereqs = edges.filter(e => e.to === infoUnitDetails.id).map(e => e.from);
    let maxPrereqRow = -1;
    prereqs.forEach(pId => {
      const pNode = nodes.find(n => n.id === pId);
      if (pNode && pNode.row > maxPrereqRow) maxPrereqRow = pNode.row;
    });

    const postreqs = edges.filter(e => e.from === infoUnitDetails.id).map(e => e.to);
    let minPostreqRow = 999;
    postreqs.forEach(pId => {
      const pNode = nodes.find(n => n.id === pId);
      if (pNode && pNode.row < minPostreqRow) minPostreqRow = pNode.row;
    });

    // We allow setting any valid row from maxPrereqRow + 1 up to minPostreqRow - 1
    // Wait, the requirement says "select a year and semester that is after its prerequisites"
    // Also "For example... EGB125 available options would include Year 1 Sem 2, Year 2 Sem 1..."
    // So we just iterate valid rows that have available semesters.
    // Let's cap at maxRow + 4 just to be safe if it's the end of the tree.
    let searchLimit = minPostreqRow === 999 ? Math.max(...nodes.map(n => n.row)) + 4 : minPostreqRow;

    html += `
        <div class="mb-6">
          <div class="flex items-center gap-2">
            <h3 class="text-xs font-bold text-[#616161] uppercase tracking-wider mr-2">TIME</h3>
            <select
              data-action="change-time-year"
              data-node-id="${infoUnitDetails.id}"
              class="w-auto text-sm py-1 px-2 rounded border border-[#DBDBDB] bg-white text-[#1C1C1C] outline-none hover:bg-gray-50 cursor-pointer shadow-sm"
            >
              <option value="" ${infoUnitDetails.manualRow === undefined ? 'selected' : ''}>AUTO</option>
    `;

    const validRows = [];
    for (let r = maxPrereqRow + 1; r < searchLimit; r++) {
      const rowSem = MathLogic.getRowSemester(r);
      if (infoUnitDetails.avail.includes(rowSem)) {
        validRows.push(r);
      }
    }

    const validYears = [...new Set(validRows.map(r => Math.floor(r / 3) + 1))];
    const currentYear = infoUnitDetails.manualRow !== undefined ? Math.floor(infoUnitDetails.manualRow / 3) + 1 : null;
    const currentSem = infoUnitDetails.manualRow !== undefined ? (infoUnitDetails.manualRow % 3) + 1 : null;

    validYears.forEach(y => {
      const isSelected = currentYear === y ? 'selected' : '';
      html += `<option value="${y}" ${isSelected}>Year ${y}</option>`;
    });

    html += `
            </select>
    `;

    if (infoUnitDetails.avail.length > 1 && infoUnitDetails.manualRow !== undefined) {
      html += `
            <select
              data-action="change-time-sem"
              data-node-id="${infoUnitDetails.id}"
              class="w-auto text-sm py-1 px-2 rounded border border-[#DBDBDB] bg-white text-[#1C1C1C] outline-none hover:bg-gray-50 cursor-pointer shadow-sm"
            >
      `;
      infoUnitDetails.avail.forEach(sem => {
        const label = sem === 3 ? 'Summer' : `Sem ${sem}`;
        const isSelected = currentSem === sem ? 'selected' : '';
        html += `<option value="${sem}" ${isSelected}>${label}</option>`;
      });
      html += `
            </select>
      `;
    }

    html += `
          </div>
        </div>
    `;
  }

  html += `
        <div class="mb-6">
          <h3 class="text-xs font-bold text-[#616161] uppercase tracking-wider mb-2">Availability</h3>
          <div class="flex flex-wrap gap-2">
  `;

  if (infoUnitDetails.avail.includes(1)) {
    html += `<span class="px-3 py-1 bg-[#EFCB43]/20 text-[#C05711] text-xs font-bold rounded-full border border-[#EFCB43]/50">Semester 1</span>`;
  }
  if (infoUnitDetails.avail.includes(2)) {
    html += `<span class="px-3 py-1 bg-[#009FE3]/20 text-[#0063B9] text-xs font-bold rounded-full border border-[#009FE3]/50">Semester 2</span>`;
  }
  if (infoUnitDetails.avail.includes(3)) {
    html += `<span class="px-3 py-1 bg-[#C7026F]/10 text-[#C7026F] text-xs font-bold rounded-full border border-[#C7026F]/30">Summer</span>`;
  }

  html += `
          </div>
        </div>

        <div class="mb-6">
          <h3 class="text-xs font-bold text-[#616161] uppercase tracking-wider mb-2">Prerequisites (Inputs)</h3>
          <ul class="list-disc pl-5 text-sm text-[#1C1C1C]">
  `;

  // Custom CP Requirements
  if (infoUnitDetails.cpReq !== undefined) {
    html += `
      <li class="mb-1 flex items-center gap-2 w-full text-left font-semibold text-[#0066B9]">
        <span>${infoUnitDetails.cpReq} Accumulated CP</span>
        ${totalUnlockedCP >= infoUnitDetails.cpReq
          ? '<svg class="w-3.5 h-3.5 text-green-600 ml-auto"><use href="assets/icons/sprite.svg#icon-check"></use></svg>'
          : '<svg class="w-3.5 h-3.5 text-red-500 ml-auto"><use href="assets/icons/sprite.svg#icon-cross"></use></svg>'}
      </li>
    `;
  }

  const prereqs = edges.filter(e => e.to === infoUnitDetails.id);

  if (prereqs.length === 0 && infoUnitDetails.cpReq === undefined) {
    html += `<li class="text-[#616161] italic">None or basic entry requirements.</li>`;
  } else if (!isPinned && prereqs.length > 0) {
    // Unpinned view: simple list
    prereqs.forEach(e => {
      const isComp = completed.has(e.from);
      html += `
        <li class="mb-1">
          <button
            data-action="select-node"
            data-node-id="${e.from}"
            class="font-semibold text-[#0066B9] hover:underline cursor-pointer flex items-center gap-2 w-full text-left pointer-events-auto"
          >
            <span>${e.from}</span>
            ${isComp
              ? '<svg class="w-3.5 h-3.5 text-green-600 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>'
              : '<svg class="w-3.5 h-3.5 text-red-500 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>'
            }
          </button>
          ${e.dashed ? '<span class="text-xs text-[#616161] italic block">(Co-req/Optional)</span>' : ''}
        </li>
      `;
    });
  }

  html += `</ul>`; // Close list from CP requirements / empty prereqs / unpinned prereqs

  if (isPinned && prereqs.length > 0) {
    // Sort prereqs by inGroup for visual order matching the terminals
    const sortedPrereqs = [...prereqs].sort((a, b) => a.inGroup - b.inGroup);

    html += `
      <div class="flex gap-2 items-start mt-2">
        <select
          id="prereq-select-${infoUnitDetails.id}"
          multiple
          class="w-full text-sm p-2 rounded border border-[#DBDBDB] bg-white text-[#1C1C1C] outline-none h-32 pointer-events-auto"
        >
    `;

    sortedPrereqs.forEach(e => {
      const isComp = completed.has(e.from);
      const mark = isComp ? '✓' : '✗';
      const dashed = e.dashed ? '(Co-req)' : '';
      const isSelected = selectedPrereqs && selectedPrereqs.includes(e.from) ? 'selected' : '';
      html += `<option value="${e.from}" ${isSelected}>${e.from} ${dashed} [${mark}]</option>`;
    });

    html += `
        </select>
        <div class="flex flex-col gap-1">
          <button data-action="move-prereq-up" data-node-id="${infoUnitDetails.id}" class="p-1 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 pointer-events-auto" title="Move Up">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
          </button>
          <button data-action="move-prereq-down" data-node-id="${infoUnitDetails.id}" class="p-1 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 pointer-events-auto" title="Move Down">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  html += `
        </div>

        <div>
          <h3 class="text-xs font-bold text-[#616161] uppercase tracking-wider mb-2">Unlocks (Outputs)</h3>
  `;

  const unlocks = edges.filter(e => e.from === infoUnitDetails.id);

  if (unlocks.length === 0) {
    html += `<ul class="list-disc pl-5 text-sm text-[#1C1C1C]"><li class="text-[#616161] italic">Terminal unit / Capstone.</li></ul>`;
  } else if (!isPinned) {
    html += `<ul class="list-disc pl-5 text-sm text-[#1C1C1C]">`;
    unlocks.forEach(e => {
      html += `
        <li class="mb-1">
          <button
            data-action="select-node"
            data-node-id="${e.to}"
            class="font-semibold text-[#0066B9] hover:underline cursor-pointer pointer-events-auto"
          >
            ${e.to}
          </button>
        </li>
      `;
    });
    html += `</ul>`;
  } else {
    // Pinned unlocks
    const sortedUnlocks = [...unlocks].sort((a, b) => a.outGroup - b.outGroup);

    html += `
      <div class="flex gap-2 items-start mt-2">
        <select
          id="unlock-select-${infoUnitDetails.id}"
          multiple
          class="w-full text-sm p-2 rounded border border-[#DBDBDB] bg-white text-[#1C1C1C] outline-none h-32 pointer-events-auto"
        >
    `;

    sortedUnlocks.forEach(e => {
      const isSelected = selectedUnlocks && selectedUnlocks.includes(e.to) ? 'selected' : '';
      html += `<option value="${e.to}" ${isSelected}>${e.to}</option>`;
    });

    html += `
        </select>
        <div class="flex flex-col gap-1">
          <button data-action="move-unlock-up" data-node-id="${infoUnitDetails.id}" class="p-1 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 pointer-events-auto" title="Move Up">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
          </button>
          <button data-action="move-unlock-down" data-node-id="${infoUnitDetails.id}" class="p-1 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 pointer-events-auto" title="Move Down">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  html += `
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
};
