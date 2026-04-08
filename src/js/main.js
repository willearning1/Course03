// main.js
// Entry point

import { appState } from './state.js';
import * as UI from './uiRender.js';
import * as Events from './events.js';

const initApp = async () => {
  try {
    // 1. Fetch JSON Data
    const res = await fetch('data/courses.json');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();

    // 2. Initialize State
    appState.init({
      nodes: data.NODES,
      edges: data.EDGES,
      nodeTypes: data.NODE_TYPES,
      completed: new Set(),
      rowCapacity: 4,
      rowPreferences: Array(9).fill(4) // initial rows
    });

    // 3. Setup Subscribers
    appState.subscribe(state => {
      // Re-render UI on state changes
      UI.renderApp();
      UI.updateEdges();
    });

    // 4. Initial Render and Event Binding
    UI.renderApp();
    Events.initEvents();

    // Delayed edge updates to ensure DOM layout is finished
    setTimeout(UI.updateEdges, 100);
    setTimeout(UI.updateEdges, 500);

  } catch (error) {
    console.error("Failed to load Tech Tree data:", error);
    document.getElementById('root').innerHTML = `
      <div class="p-8 text-red-500 font-bold">
        Error loading application data. Ensure you are running a local server (e.g., python3 -m http.server).
      </div>
    `;
  }
};

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
