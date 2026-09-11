export function buildRawSkillContent({
  name,
  description,
  body,
}: {
  name: string;
  description: string;
  body: string;
}): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`;
}

export const NEW_SKILL_TEMPLATE = `---
name: my_skill
description: Short description used to match this skill against user requests.
---

Skill body goes here. Describe what to do, when, and how.
`;
