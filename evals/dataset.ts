import { requiredEnv } from "./convexAuthClient";

// Populated once the fixture canvas has been seeded manually — see
// evals/README.md. Read lazily (inside case objects below via functions would
// be overkill here since Eval() calls data() once at run start, well after
// module load, so reading process.env at module scope is fine).
const FIXTURE_TABLE_NODE_ID = requiredEnv("EVAL_FIXTURE_TABLE_NODE_ID");
const FIXTURE_DOCUMENT_NODE_ID = requiredEnv("EVAL_FIXTURE_DOCUMENT_NODE_ID");

export type NoleEvalCase = {
  input: {
    prompt: string;
    expectedToolNames?: string[];
    forbiddenToolNames?: string[];
  };
  expected: string;
  metadata: { id: string; category: string };
};

export const noleDataset: NoleEvalCase[] = [
  {
    input: {
      prompt: "Qu'est-ce qu'un canvas Nolenor, en une phrase ?",
      expectedToolNames: [],
    },
    expected:
      "Répond directement en une ou deux phrases, sans appeler d'outil de modification du canvas (pas de create_node, set_node_data, etc.) puisque la question ne demande aucune action sur le canvas.",
    metadata: { id: "qa-simple", category: "no-tool" },
  },
  {
    input: {
      prompt:
        "Crée un node de type document intitulé 'Notes de brainstorm' avec un court paragraphe d'introduction.",
      expectedToolNames: ["create_node"],
    },
    expected:
      "Crée un nouveau node document via create_node avec un titre et un contenu cohérents avec la demande, puis confirme brièvement à l'utilisateur.",
    metadata: { id: "create-node", category: "tool-usage" },
  },
  {
    input: {
      prompt: `Ajoute une ligne au tableau (node ${FIXTURE_TABLE_NODE_ID}) pour un nouvel élément nommé "Widget X" au prix de 19.99.`,
      expectedToolNames: ["table_insert_rows"],
      forbiddenToolNames: ["create_node"],
    },
    expected:
      `Ajoute une ligne au tableau existant (node ${FIXTURE_TABLE_NODE_ID}) via table_insert_rows en respectant le schéma de colonnes existant, sans créer un nouveau node ni un nouveau tableau.`,
    metadata: { id: "edit-known-table", category: "tool-usage" },
  },
  {
    input: {
      prompt: `Résume le contenu du document (node ${FIXTURE_DOCUMENT_NODE_ID}) en 3 points.`,
      expectedToolNames: ["read_nodes"],
    },
    expected:
      "Lit le contenu réel du node document via read_nodes (ou équivalent) avant de répondre, et résume fidèlement ce contenu en 3 points — ne invente pas un contenu qu'il n'a pas lu.",
    metadata: { id: "read-and-summarize", category: "tool-usage" },
  },
  {
    input: {
      prompt:
        "Cherche sur le web qui a remporté le dernier Prix Nobel de physique et donne-moi la réponse.",
      expectedToolNames: ["websearch"],
    },
    expected:
      "Utilise l'outil de recherche web (websearch) pour trouver une information factuelle récente plutôt que de répondre depuis sa mémoire, puis restitue la réponse trouvée.",
    metadata: { id: "web-search", category: "tool-usage" },
  },
  {
    input: {
      prompt:
        "Cherche dans mes canvases s'il existe déjà une note mentionnant 'roadmap Q3'.",
      expectedToolNames: ["full_text_search"],
    },
    expected:
      "Utilise la recherche full-text interne (full_text_search) sur le contenu existant plutôt que d'inventer une réponse ou de chercher sur le web.",
    metadata: { id: "internal-search", category: "tool-usage" },
  },
  {
    input: {
      prompt:
        "Fais une recherche approfondie sur les tendances 2026 du marché des agents IA et crée-moi un document de synthèse structuré d'au moins 5 sections.",
      expectedToolNames: ["run_subAgent"],
    },
    expected:
      "Délègue cette tâche de recherche et synthèse longue au sous-agent Worker via run_subAgent plutôt que de tout faire lui-même en ligne, conformément à ses instructions de délégation pour les tâches multi-étapes coûteuses.",
    metadata: { id: "delegate-to-worker", category: "tool-usage" },
  },
  {
    input: {
      prompt:
        "Mets à jour le node 'node-qui-n-existe-pas-12345' pour changer son titre en 'Test'.",
      forbiddenToolNames: ["set_node_data", "table_update_rows", "table_update_schema"],
    },
    expected:
      "Ne doit PAS appeler un outil de modification directement sur l'id fourni puisqu'il n'existe pas sur le canvas — doit soit lister/chercher les nodes existants pour vérifier, soit demander une clarification à l'utilisateur, plutôt que d'agir sur un id fabriqué.",
    metadata: { id: "adversarial-fake-nodeid", category: "hallucination-guard" },
  },
];
