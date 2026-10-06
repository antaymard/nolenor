/// <reference types="vite/client" />
// Modules de l'app pour convex-test. Le glob doit partir de convex/ : depuis
// un sous-dossier, convex-test ne retrouve pas les fonctions par leur chemin.
export const modules = import.meta.glob("./**/!(*.*.*)*.*s");
