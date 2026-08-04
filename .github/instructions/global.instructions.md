# Nolenor - Context for Copilot

## What is Nolenor?

Canvas-based workspace app for managing complex projects. Users create customizable nodes
on an infinite canvas, connect them, and can integrate external data sources.

## Tech Stack

- React + TypeScript
- Convex for backend (database, functions, real-time)
- React Flow for canvas/nodes
- Zustand for UI state
- TanStack Router (file-based routing)
- BlockNote for rich text editing
- Tailwind CSS
- Utilisation de convex-dev/agent (composant convex agent) pour tout ce qui concerne les agents IA. Le MCP Convex est installé si besoin.
- Gestion des packages avec yarn

## Key Concepts

- **Node**: Visual element on canvas
- **NodeTemplate**: User-defined schema with fields and visual layouts
- **Window**: Detailed view of a node, opens on double-click on a node
- **Fields**: Data blocks within nodes and windows (text, url, select, date, etc.)

## Code Conventions

- Prefer simple solutions over complex abstractions
- Use Convex's built-in real-time sync, not separate state layers
- Components in PascalCase, utilities in camelCase
- Keep React Flow's internal state management, don't duplicate in Zustand
