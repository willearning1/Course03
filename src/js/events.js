// events.js
// Handles DOM events via delegation and triggers state updates

import { appState } from './state.js';
import * as MathLogic from './graphMath.js';
import * as UI from './uiRender.js';

let dragStart = { x: 0, y: 0 };
let fadeTimeout = null;

export const initEvents = () => {
  // Global resize
  window.addEventListener('resize', () => {
    UI.updateEdges();
  });

  // Printing
  document.getElementById('print-btn')?.addEventListener('click', () => {
    window.print();
  });

  // Initialize Dropdown States
  const { refreshManualEdits, refreshInputOutput, refreshHorizontal } = appState.get();
  document.querySelectorAll('[data-action="toggle-refresh-opt"]').forEach(el => {
    if (el.dataset.opt === 'refreshManualEdits') el.checked = refreshManualEdits;
    if (el.dataset.opt === 'refreshInputOutput') el.checked = refreshInputOutput;
    if (el.dataset.opt === 'refreshHorizontal') el.checked = refreshHorizontal;
  });

  // Controls (Refresh)
  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    const { nodes, edges, rowPreferences, rowCapacity, refreshManualEdits, refreshInputOutput, refreshHorizontal } = appState.get();
    const newNodes = MathLogic.refreshLayout(nodes, edges, rowPreferences, rowCapacity, refreshManualEdits, refreshInputOutput, refreshHorizontal);
    appState.set({ nodes: newNodes });
  });

  // Dropdown Toggle
  const dropdownBtn = document.getElementById('refresh-dropdown-btn');
  const dropdown = document.getElementById('refresh-dropdown');

  if (dropdownBtn && dropdown) {
    dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });
  }

  // Controls (Export)
  document.getElementById('export-btn')?.addEventListener('click', async () => {
    const { nodes, edges, nodeTypes } = appState.get();

    // Clean up internal properties before saving
    const cleanNodes = nodes.map(({ barycenter, ...rest }) => rest);
    const cleanEdges = edges.map(({ startX, startY, endX, endY, color, edgeIdx, ...rest }) => rest);

    const exportData = {
      NODES: cleanNodes,
      EDGES: cleanEdges,
      NODE_TYPES: nodeTypes
    };

    const jsonString = JSON.stringify(exportData, null, 2);

    try {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'courses_export.json',
          types: [{
            description: 'JSON File',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(jsonString);
        await writable.close();
      } else {
        // Fallback for browsers that don't support File System Access API
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'courses_export.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Export failed:', err);
        alert('Failed to export layout.');
      }
    }
  });

  // Controls (Import)
  document.getElementById('import-btn')?.addEventListener('click', async () => {
    try {
      let file;
      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'JSON File',
            accept: { 'application/json': ['.json'] },
          }],
          multiple: false
        });
        file = await handle.getFile();
      } else {
        // Fallback
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
          fileInput.click();
          fileInput.onchange = (e) => {
             file = e.target.files[0];
             if (file) handleFileRead(file);
             fileInput.value = ''; // Reset the input to allow re-importing the same file
          };
          return;
        }
      }

      if (file) {
        await handleFileRead(file);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Import failed:', err);
        alert('Failed to import layout.');
      }
    }
  });

  // Setup Event Delegation for dynamic content
  setupDelegation();
  setupInfoBoxDrag();
};

const handleFileRead = async (file) => {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.NODES || !Array.isArray(data.NODES)) {
      throw new Error('Invalid JSON structure: Missing or invalid "NODES" array.');
    }
    if (!data.EDGES || !Array.isArray(data.EDGES)) {
      throw new Error('Invalid JSON structure: Missing or invalid "EDGES" array.');
    }
    if (!data.NODE_TYPES || typeof data.NODE_TYPES !== 'object') {
      throw new Error('Invalid JSON structure: Missing or invalid "NODE_TYPES" object.');
    }

    appState.set({
      nodes: data.NODES,
      edges: data.EDGES,
      nodeTypes: data.NODE_TYPES,
      completed: new Set(),
      hoveredNode: null,
      selectedNode: null,
      pinnedInfoNode: null,
      renderedInfoNode: null,
      selectedPrereqs: [],
      selectedUnlocks: []
    });

    UI.updateEdges();

  } catch (err) {
    console.error('Error parsing imported file:', err);
    alert(`Import failed: ${err.message}`);
  }
};

const setupDelegation = () => {
  // We attach to body or main app container to catch all bubbled events
  document.body.addEventListener('click', handleClicks);
  document.body.addEventListener('change', handleChanges);

  // Mouse enter/leave requires capturing or specific handling
  // since they don't bubble the same way as mouseover/mouseout
  document.body.addEventListener('mouseover', handleHover);
  document.body.addEventListener('mouseout', handleHoverOut);

  // Drag and Drop for Nodes
  document.body.addEventListener('dragstart', handleDragStartNode);
  document.body.addEventListener('dragover', handleDragOverNode);
  document.body.addEventListener('dragenter', handleDragEnterNode);
  document.body.addEventListener('dragleave', handleDragLeaveNode);
  document.body.addEventListener('drop', handleDropNode);
};

let draggedNodeId = null;

const handleDragStartNode = (e) => {
  const nodeEl = e.target.closest('[data-action="drag-node"]');
  if (!nodeEl) return;

  draggedNodeId = nodeEl.dataset.nodeId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedNodeId);
  nodeEl.classList.add('opacity-50');
};

const handleDragOverNode = (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
};

const handleDragEnterNode = (e) => {
  e.preventDefault();
  const nodeEl = e.target.closest('[data-action="drag-node"]');
  if (!nodeEl || nodeEl.dataset.nodeId === draggedNodeId) return;

  // Highlight drop target visually
  nodeEl.classList.add('ring-4', 'ring-green-400');
};

const handleDragLeaveNode = (e) => {
  const nodeEl = e.target.closest('[data-action="drag-node"]');
  if (!nodeEl) return;
  nodeEl.classList.remove('ring-4', 'ring-green-400');
};

const handleDropNode = (e) => {
  e.preventDefault();
  const targetNodeEl = e.target.closest('[data-action="drag-node"]');

  // Clean up styles
  document.querySelectorAll('[data-action="drag-node"]').forEach(el => {
    el.classList.remove('opacity-50', 'ring-4', 'ring-green-400');
  });

  if (!targetNodeEl || !draggedNodeId) return;

  const targetNodeId = targetNodeEl.dataset.nodeId;
  if (draggedNodeId === targetNodeId) return;

  const { nodes } = appState.get();

  const draggedNode = nodes.find(n => n.id === draggedNodeId);
  const targetNode = nodes.find(n => n.id === targetNodeId);

  // Only allow swapping within the same row for visual horizontal reordering
  if (!draggedNode || !targetNode || draggedNode.row !== targetNode.row) return;

  const row = draggedNode.row;
  let nodesInRow = nodes.filter(n => n.row === row);

  // Sort them by their current visual order (which might be array order if not manualColIndex is set)
  // We'll rely on the current array order, which is the render order.

  const draggedIdx = nodesInRow.findIndex(n => n.id === draggedNodeId);
  const targetIdx = nodesInRow.findIndex(n => n.id === targetNodeId);

  // Reorder array
  nodesInRow.splice(draggedIdx, 1); // remove
  nodesInRow.splice(targetIdx, 0, draggedNode); // insert at new pos

  // Assign manualColIndex to preserve order on next refresh
  nodesInRow.forEach((n, idx) => {
    n.manualColIndex = idx;
  });

  // Reconstruct full nodes array
  // By appending nodesInRow to the end instead of mapping, we preserve their new relative order.
  // The row filtering in uiRender.js uses the array order to render the DOM elements.
  const newNodes = nodes.filter(n => n.row !== row).concat(nodesInRow);

  appState.set({ nodes: newNodes });
  draggedNodeId = null;
};


const handleClicks = (e) => {
  const target = e.target.closest('[data-action]');
  let action = target ? target.dataset.action : null;
  let nodeId = target ? target.dataset.nodeId : null;

  // Handle clicking on the node card itself (since the card has data-action="drag-node")
  // If the user clicks on the card but NOT on an interactive inner button (like info/lock/move),
  // we want to select the node.
  if (!target || action === 'drag-node') {
    const nodeEl = e.target.closest('.node-card');
    if (nodeEl) {
      const clickedNodeId = nodeEl.dataset.nodeId;
      const { selectedNode } = appState.get();
      // If we clicked exactly on a select-node trigger, skip this generic logic
      if (action !== 'select-node') {
         // Only deselect if we clicked the currently selected node, otherwise select it
         appState.set({ selectedNode: selectedNode === clickedNodeId ? null : clickedNodeId });
         return;
      }
    }
    if (!target) return;
  }

  switch (action) {
    case 'set-capacity':
      const val = parseInt(target.dataset.value, 10);
      const { nodes } = appState.get();
      const maxRow = Math.max(...nodes.map(n => n.row), 8);
      appState.set({
        rowCapacity: val,
        rowPreferences: Array(maxRow + 10).fill(val)
      });
      break;

    case 'toggle-lock':
      e.stopPropagation(); // Don't select node
      const { completed, nodes: nList, edges } = appState.get();
      const newCompleted = new Set(completed);

      if (newCompleted.has(nodeId)) {
        newCompleted.delete(nodeId);
      } else {
        if (MathLogic.checkPrereqsMet(nodeId, newCompleted, nList, edges)) {
          newCompleted.add(nodeId);
        }
      }
      appState.set({ completed: newCompleted });
      break;

    case 'info-click':
      e.stopPropagation(); // Don't select node
      const { pinnedInfoNode } = appState.get();

      if (pinnedInfoNode === nodeId) {
        // Toggle off
        appState.set({ pinnedInfoNode: null, isFading: true });

        if (fadeTimeout) clearTimeout(fadeTimeout);
        fadeTimeout = setTimeout(() => {
          appState.set({ renderedInfoNode: null, isFading: false });
        }, 500);
      } else {
        openInfoBox(nodeId, true);
      }
      break;

    case 'unpin-info':
      e.stopPropagation();
      appState.set({ pinnedInfoNode: null, isFading: true });
      if (fadeTimeout) clearTimeout(fadeTimeout);
      fadeTimeout = setTimeout(() => {
        appState.set({ renderedInfoNode: null, isFading: false });
      }, 500);
      break;

    case 'move-prereq-up':
    case 'move-prereq-down':
    case 'move-unlock-up':
    case 'move-unlock-down':
      e.stopPropagation();
      const isUp = action.endsWith('-up');
      const isPrereq = action.includes('prereq');
      const selectEl = document.getElementById(isPrereq ? `prereq-select-${nodeId}` : `unlock-select-${nodeId}`);

      if (!selectEl) return;

      const selectedOptions = Array.from(selectEl.selectedOptions);
      if (selectedOptions.length === 0) return;

      const selectedIndices = selectedOptions.map(opt => opt.index).sort((a, b) => a - b);

      if (isUp && selectedIndices[0] === 0) return;
      if (!isUp && selectedIndices[selectedIndices.length - 1] === selectEl.options.length - 1) return;

      const options = Array.from(selectEl.options);
      let newOptionsData = options.map(o => ({ value: o.value, text: o.text }));

      if (isUp) {
        for (let i = 0; i < selectedIndices.length; i++) {
          let idx = selectedIndices[i];
          if (idx > 0 && !selectedIndices.includes(idx - 1)) {
            let temp = newOptionsData[idx - 1];
            newOptionsData[idx - 1] = newOptionsData[idx];
            newOptionsData[idx] = temp;
            selectedIndices[i] = idx - 1;
          }
        }
      } else {
        for (let i = selectedIndices.length - 1; i >= 0; i--) {
          let idx = selectedIndices[i];
          if (idx < newOptionsData.length - 1 && !selectedIndices.includes(idx + 1)) {
            let temp = newOptionsData[idx + 1];
            newOptionsData[idx + 1] = newOptionsData[idx];
            newOptionsData[idx] = temp;
            selectedIndices[i] = idx + 1;
          }
        }
      }

      // Update DOM options visually
      newOptionsData.forEach((opt, idx) => {
        selectEl.options[idx].value = opt.value;
        selectEl.options[idx].text = opt.text;
        selectEl.options[idx].selected = selectedIndices.includes(idx);
      });

      // Update global edges state to reflect new order
      const { edges: currentEdges } = appState.get();
      const newEdges = [...currentEdges];

      // Map the new ordered values back to inGroup / outGroup indices
      const orderedIds = newOptionsData.map(opt => opt.value);

      newEdges.forEach(edge => {
        if (isPrereq && edge.to === nodeId) {
          const newGrp = orderedIds.indexOf(edge.from);
          if (newGrp !== -1) edge.inGroup = newGrp;
        } else if (!isPrereq && edge.from === nodeId) {
          const newGrp = orderedIds.indexOf(edge.to);
          if (newGrp !== -1) edge.outGroup = newGrp;
        }
      });

      const newlySelectedOptions = selectedIndices.map(idx => newOptionsData[idx].value);
      if (isPrereq) {
        appState.set({ edges: newEdges, selectedPrereqs: newlySelectedOptions });
      } else {
        appState.set({ edges: newEdges, selectedUnlocks: newlySelectedOptions });
      }
      UI.updateEdges();

      // Ensure focus/selection state is preserved after DOM update
      setTimeout(() => {
        selectEl.focus();
      }, 0);
      break;

    case 'move-node':
      e.stopPropagation();
      const targetSem = parseInt(target.dataset.targetSem, 10);
      moveNode(nodeId, targetSem);
      break;

    case 'select-node':
      e.stopPropagation();
      const { selectedNode: currentSel } = appState.get();
      appState.set({ selectedNode: currentSel === nodeId ? null : nodeId });
      break;

    case 'link-click':
      e.stopPropagation();
      break;
  }
};

const handleChanges = (e) => {
  const target = e.target.closest('[data-action], [id^="prereq-select-"], [id^="unlock-select-"]');
  if (!target) return;

  // Keep track of multiple selections in Info Box
  if (target.id.startsWith('prereq-select-')) {
    const selectedOptions = Array.from(target.selectedOptions).map(o => o.value);
    appState.set({ selectedPrereqs: selectedOptions });
    return;
  }
  if (target.id.startsWith('unlock-select-')) {
    const selectedOptions = Array.from(target.selectedOptions).map(o => o.value);
    appState.set({ selectedUnlocks: selectedOptions });
    return;
  }

  if (target.dataset.action === 'toggle-refresh-opt') {
    const opt = target.dataset.opt;
    appState.set({ [opt]: target.checked });
    return;
  }

  if (target.dataset.action === 'change-row-pref') {
    const rowIdx = parseInt(target.dataset.row, 10);
    const val = parseInt(target.value, 10);
    const { rowPreferences } = appState.get();

    const newPrefs = [...rowPreferences];
    newPrefs[rowIdx] = val;

    appState.set({ rowPreferences: newPrefs });
  } else if (target.dataset.action === 'change-time-year' || target.dataset.action === 'change-time-sem') {
    const nodeId = target.dataset.nodeId;
    const { nodes } = appState.get();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Get current values
    let currentYear = node.manualRow !== undefined ? Math.floor(node.manualRow / 3) + 1 : null;
    let currentSem = node.manualRow !== undefined ? (node.manualRow % 3) + 1 : null;

    if (target.dataset.action === 'change-time-year') {
      const val = target.value; // "" or year
      if (val === "") {
        currentYear = null;
        currentSem = null;
      } else {
        currentYear = parseInt(val, 10);
        // Default to first available sem if switching from Auto
        if (currentSem === null && node.avail.length > 0) {
           currentSem = node.avail[0];
        }
      }
    } else if (target.dataset.action === 'change-time-sem') {
      currentSem = parseInt(target.value, 10);
    }

    const newNodes = nodes.map(n => {
      if (n.id === nodeId) {
        if (currentYear === null) {
          const { manualRow, ...rest } = n;
          return rest;
        } else {
          // Reconstruct manualRow
          // If available in only 1 sem, force it
          let sem = currentSem;
          if (n.avail.length === 1) {
             sem = n.avail[0];
          }
          const manualRow = (currentYear - 1) * 3 + (sem - 1);
          return { ...n, manualRow };
        }
      }
      return n;
    });

    appState.set({ nodes: newNodes });
  }
};

const handleHover = (e) => {
  // Node card hover
  const nodeEl = e.target.closest('.node-card');
  if (nodeEl) {
    const nodeId = nodeEl.dataset.nodeId;
    if (appState.get().hoveredNode !== nodeId) {
      appState.set({ hoveredNode: nodeId });
    }
  }

  // Info button hover
  const infoBtn = e.target.closest('[data-action="info-click"]');
  if (infoBtn) {
    const nodeId = infoBtn.dataset.nodeId;
    const { pinnedInfoNode, renderedInfoNode } = appState.get();
    if (!pinnedInfoNode && renderedInfoNode !== nodeId) {
      openInfoBox(nodeId, false);
    }
  }

  // Info box itself hover
  const infoPanel = e.target.closest('#info-box-panel');
  if (infoPanel) {
    if (fadeTimeout) clearTimeout(fadeTimeout);
    appState.set({ isFading: false });
  }
};

const handleHoverOut = (e) => {
  // Node card hover out
  const nodeEl = e.target.closest('.node-card');
  if (nodeEl && !e.relatedTarget?.closest('.node-card')) {
    appState.set({ hoveredNode: null });
  }

  // Info button hover out
  const infoBtn = e.target.closest('[data-action="info-click"]');
  if (infoBtn) {
    const { pinnedInfoNode } = appState.get();
    if (!pinnedInfoNode) {
      closeInfoBoxHover();
    }
  }

  // Info box itself hover out
  const infoPanel = e.target.closest('#info-box-panel');
  if (infoPanel && !e.relatedTarget?.closest('#info-box-panel')) {
    const { pinnedInfoNode } = appState.get();
    if (!pinnedInfoNode) {
      closeInfoBoxHover();
    }
  }
};

const openInfoBox = (nodeId, isPinned = false) => {
  if (fadeTimeout) clearTimeout(fadeTimeout);

  const updates = {
    isFading: false,
    renderedInfoNode: nodeId,
    selectedPrereqs: [], // Reset selection when opening new box
    selectedUnlocks: []
  };
  if (isPinned) {
    updates.pinnedInfoNode = nodeId;
  }

  const { pinnedInfoNode } = appState.get();

  // Position it if it wasn't already pinned
  const el = document.getElementById(`node-${nodeId}`);
  if (el && !pinnedInfoNode) {
    const rect = el.getBoundingClientRect();

    let newX = rect.right + 20;
    let newY = rect.top;

    if (newX + 320 > window.innerWidth) {
      newX = rect.left - 340;
    }

    newX = Math.max(10, Math.min(newX, window.innerWidth - 330));
    newY = Math.max(10, Math.min(newY, window.innerHeight - 400));

    updates.infoBoxPos = { x: newX, y: newY };
  }

  appState.set(updates);
};

const closeInfoBoxHover = () => {
  const { pinnedInfoNode } = appState.get();
  if (pinnedInfoNode) return;

  appState.set({ isFading: true });

  fadeTimeout = setTimeout(() => {
    appState.set({ renderedInfoNode: null, isFading: false });
  }, 500);
};

const moveNode = (nodeId, targetSemester) => {
  const { nodes, edges } = appState.get();
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;

  const prereqs = edges.filter(e => e.to === nodeId).map(e => e.from);
  let maxPrereqRow = -1;
  prereqs.forEach(pId => {
    const pNode = nodes.find(n => n.id === pId);
    if (pNode && pNode.row > maxPrereqRow) maxPrereqRow = pNode.row;
  });

  const postreqs = edges.filter(e => e.from === nodeId).map(e => e.to);
  let minPostreqRow = 999;
  postreqs.forEach(pId => {
    const pNode = nodes.find(n => n.id === pId);
    if (pNode && pNode.row < minPostreqRow) minPostreqRow = pNode.row;
  });

  let validRows = [];
  for (let r = maxPrereqRow + 1; r < minPostreqRow; r++) {
    if (MathLogic.getRowSemester(r) === targetSemester) {
      validRows.push(r);
    }
  }

  if (validRows.length === 0) return;

  // Find the valid row closest to the unit's current year
  const currentYear = Math.floor(node.row / 3);
  let targetRow = validRows[0];
  let minDiff = 999;

  validRows.forEach(r => {
    const rYear = Math.floor(r / 3);
    const diff = Math.abs(rYear - currentYear);
    if (diff < minDiff) {
      minDiff = diff;
      targetRow = r;
    }
  });

  if (targetRow !== -1 && targetRow !== node.row) {
    const newNodes = nodes.map(n => n.id === nodeId ? { ...n, row: targetRow } : n);
    appState.set({ nodes: newNodes });
  }
};

const setupInfoBoxDrag = () => {
  const handleDragMove = (e) => {
    const { isDragging, infoBoxPos } = appState.get();
    if (!isDragging) return;

    appState.set({
      infoBoxPos: {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }
    });
    e.stopPropagation();
  };

  const handleDragEnd = () => {
    if (appState.get().isDragging) {
      appState.set({ isDragging: false });
    }
  };

  // Attach to body for capturing mouse down on the header
  document.body.addEventListener('mousedown', (e) => {
    const header = e.target.closest('#info-box-header');
    if (!header) return;

    const { pinnedInfoNode, infoBoxPos, nodes } = appState.get();
    if (!pinnedInfoNode) return;

    // Ignore if clicking on buttons/links inside header
    if (e.target.closest('button') || e.target.closest('a')) return;

    // Verify header belongs to the pinned node
    // Simple check: header has cursor-move class when pinned
    if (header.classList.contains('cursor-move')) {
      appState.set({ isDragging: true });
      dragStart = {
        x: e.clientX - infoBoxPos.x,
        y: e.clientY - infoBoxPos.y
      };
      e.stopPropagation();
    }
  });

  window.addEventListener('mousemove', handleDragMove);
  window.addEventListener('mouseup', handleDragEnd);
};
