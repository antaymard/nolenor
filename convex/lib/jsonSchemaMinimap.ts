import { z } from "zod";

type JsonSchemaNode = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode | JsonSchemaNode[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  allOf?: JsonSchemaNode[];
  default?: unknown;
  additionalProperties?: boolean | JsonSchemaNode;
  [key: string]: unknown;
};

function describeLeafType(node: JsonSchemaNode): string {
  if (node.const !== undefined) return JSON.stringify(node.const);
  if (Array.isArray(node.enum) && node.enum.length > 0) {
    return `enum(${node.enum.map((v) => String(v)).join("|")})`;
  }
  const variants = node.anyOf ?? node.oneOf;
  if (variants && variants.length > 0) {
    return variants.map(describeLeafType).join("|");
  }
  if (Array.isArray(node.type)) return node.type.join("|");
  if (typeof node.type === "string") return node.type;
  if (node.properties) return "object";
  return "any";
}

function getObjectChildren(
  node: JsonSchemaNode,
): Array<[string, JsonSchemaNode]> | null {
  if (!node.properties) return null;
  const entries = Object.entries(node.properties);
  if (entries.length === 0) return null;
  return entries;
}

function getArrayItem(node: JsonSchemaNode): JsonSchemaNode | null {
  if (!node.items) return null;
  if (Array.isArray(node.items)) return node.items[0] ?? null;
  return node.items;
}

function isRequired(parent: JsonSchemaNode, key: string): boolean {
  return Array.isArray(parent.required) && parent.required.includes(key);
}

function hasDefault(node: JsonSchemaNode): boolean {
  return Object.prototype.hasOwnProperty.call(node, "default");
}

function renderProperty(
  name: string,
  node: JsonSchemaNode,
  parent: JsonSchemaNode,
  prefix: string,
  isLast: boolean,
): string {
  const branch = isLast ? "└─ " : "├─ ";
  const childPrefix = prefix + (isLast ? "   " : "│  ");
  const optional = !isRequired(parent, name) && !hasDefault(node);
  const optMark = optional ? "?" : "";

  // Object with properties → nested
  const objChildren = getObjectChildren(node);
  if (objChildren) {
    const head = `${prefix}${branch}${name}${optMark}`;
    const childLines = objChildren.map(([childName, childNode], idx) =>
      renderProperty(
        childName,
        childNode,
        node,
        childPrefix,
        idx === objChildren.length - 1,
      ),
    );
    return [head, ...childLines].join("\n");
  }

  // Array → check item shape
  if (node.type === "array") {
    const item = getArrayItem(node);
    if (item) {
      const itemObjChildren = getObjectChildren(item);
      if (itemObjChildren) {
        const head = `${prefix}${branch}${name}${optMark}[]`;
        const childLines = itemObjChildren.map(([childName, childNode], idx) =>
          renderProperty(
            childName,
            childNode,
            item,
            childPrefix,
            idx === itemObjChildren.length - 1,
          ),
        );
        return [head, ...childLines].join("\n");
      }
      return `${prefix}${branch}${name}${optMark}: ${describeLeafType(item)}[]`;
    }
    return `${prefix}${branch}${name}${optMark}: any[]`;
  }

  // Union with at least one object variant → expand variants
  const variants = node.anyOf ?? node.oneOf;
  if (variants && variants.some((v) => getObjectChildren(v))) {
    const head = `${prefix}${branch}${name}${optMark}: union`;
    const variantLines = variants.map((variant, idx) => {
      const variantIsLast = idx === variants.length - 1;
      const variantBranch = variantIsLast ? "└─ " : "├─ ";
      const variantChildPrefix =
        childPrefix + (variantIsLast ? "   " : "│  ");
      const variantChildren = getObjectChildren(variant);
      if (variantChildren) {
        const variantHead = `${childPrefix}${variantBranch}{}`;
        const propLines = variantChildren.map(([cName, cNode], i) =>
          renderProperty(
            cName,
            cNode,
            variant,
            variantChildPrefix,
            i === variantChildren.length - 1,
          ),
        );
        return [variantHead, ...propLines].join("\n");
      }
      return `${childPrefix}${variantBranch}${describeLeafType(variant)}`;
    });
    return [head, ...variantLines].join("\n");
  }

  // Scalar / leaf
  return `${prefix}${branch}${name}${optMark}: ${describeLeafType(node)}`;
}

export function formatJsonSchemaAsMinimap(schema: JsonSchemaNode): string {
  const objChildren = getObjectChildren(schema);
  if (objChildren) {
    return objChildren
      .map(([name, child], idx) =>
        renderProperty(
          name,
          child,
          schema,
          "",
          idx === objChildren.length - 1,
        ),
      )
      .join("\n");
  }

  if (schema.type === "array") {
    const item = getArrayItem(schema);
    if (item) {
      const itemChildren = getObjectChildren(item);
      if (itemChildren) {
        const childLines = itemChildren.map(([name, child], idx) =>
          renderProperty(
            name,
            child,
            item,
            "   ",
            idx === itemChildren.length - 1,
          ),
        );
        return ["[]", ...childLines].join("\n");
      }
      return `${describeLeafType(item)}[]`;
    }
    return "any[]";
  }

  return describeLeafType(schema);
}

export function formatZodSchemaAsMinimap(
  schema: z.ZodTypeAny,
): string | null {
  try {
    const zodWithJson = z as unknown as {
      toJSONSchema?: (input: z.ZodTypeAny) => JsonSchemaNode;
    };
    if (typeof zodWithJson.toJSONSchema !== "function") return null;
    const jsonSchema = zodWithJson.toJSONSchema(schema);
    return formatJsonSchemaAsMinimap(jsonSchema);
  } catch {
    return null;
  }
}
