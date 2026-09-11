export type ParsedSkillFrontmatter = {
  meta: Record<string, string>;
  body: string;
};

export function parseSkillFrontmatter(raw: string): ParsedSkillFrontmatter {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw.trim() };

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }

  return { meta, body: match[2].trim() };
}

export type SkillFrontmatterResult =
  | { ok: true; name: string; description: string; body: string }
  | { ok: false; error: string };

export function extractSkillFields(raw: string): SkillFrontmatterResult {
  const { meta, body } = parseSkillFrontmatter(raw);
  const name = meta.name;
  const description = meta.description;

  if (!name) {
    return { ok: false, error: "Missing 'name' in skill frontmatter." };
  }
  if (!description) {
    return {
      ok: false,
      error: "Missing 'description' in skill frontmatter.",
    };
  }

  return { ok: true, name, description, body };
}
