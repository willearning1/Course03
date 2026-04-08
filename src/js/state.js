// state.js
// A simple state manager using the Observer pattern

export class State {
  constructor() {
    this.state = {
      nodes: [],
      edges: [],
      nodeTypes: {},
      completed: new Set(),
      rowCapacity: 4,
      rowPreferences: Array(20).fill(4), // Assume max 20 rows
      hoveredNode: null,
      selectedNode: null,
      pinnedInfoNode: null,
      renderedInfoNode: null,
      infoBoxPos: { x: 0, y: 0 },
      isDragging: false,
      isFading: false,
      drawnEdges: [], // Calculated paths for rendering
      selectedPrereqs: [],
      selectedUnlocks: [],
      refreshManualEdits: true,
      refreshInputOutput: true,
      refreshHorizontal: true,
    };

    this.listeners = [];
  }

  // Set the entire state at once (useful for initial load)
  init(initialState) {
    this.state = { ...this.state, ...initialState };
    this.notify();
  }

  // Update specific properties
  set(updates) {
    let hasChanges = false;
    for (const key in updates) {
      if (this.state[key] !== updates[key]) {
        this.state[key] = updates[key];
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.notify();
    }
  }

  // Get a specific property or the entire state
  get(key) {
    return key ? this.state[key] : this.state;
  }

  // Subscribe to changes
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // Notify listeners
  notify() {
    this.listeners.forEach((listener) => listener(this.state));
  }
}

// Export a singleton instance
export const appState = new State();
