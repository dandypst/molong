import { createHash } from 'node:crypto';

const MAX_NAMESPACE_LENGTH = 40;

export function sanitizeNamespace(ns) {
  const normalized = String(ns || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = normalized || 'default';
  if (base.length <= MAX_NAMESPACE_LENGTH) return base;

  const digest = createHash('sha256')
    .update(base)
    .digest('hex')
    .slice(0, 24);
  return `${base.slice(0, MAX_NAMESPACE_LENGTH - digest.length - 1)}-${digest}`;
}

export function namespaceFor(rawNs, isSupport = false) {
  // Preserve existing user namespaces for cross-session continuity. Reserve the
  // `support-` prefix for support mode; a normal user choosing that prefix gets
  // an explicit `user-` prefix instead of colliding with a support tenant.
  if (isSupport) {
    return sanitizeNamespace(rawNs.startsWith('support-') ? rawNs : `support-${rawNs}`);
  }
  return sanitizeNamespace(rawNs.startsWith('support-') ? `user-${rawNs}` : rawNs);
}

export function cleanMemoryNote(output) {
  let clean = String(output ?? '').trim().replace(/^"|"$/g, '');

  const fence = clean.match(/^```(?:text)?\s*([\s\S]*?)```/i);
  if (fence) clean = fence[1].trim();

  const separator = clean.search(/\n\s*-{3,}\s*\n/);
  if (separator !== -1) clean = clean.slice(0, separator).trim();

  clean = clean
    .split(/\r?\n/)[0]
    .replace(/^(?:user|note|memory)\s*[:\-]\s*/i, '')
    .replace(/^[-*+]\s+/, '')
    .trim();

  if (!clean || clean.toUpperCase() === 'NONE') return null;
  return clean.slice(0, 300);
}

export async function extractMemoryNote(llm, userText) {
  const prompt = [
    {
      role: 'system',
      content: `You extract durable FACTS THAT THE USER STATED, for long-term memory of a chatbot.
Rules:
- Base the note ONLY on the User message. Do not use any assistant or system reply.
- Capture: who the user is, what they want/ordered, their preferences, decisions, complaints, contact/delivery details, goals.
- If the User said nothing worth remembering (greetings only, asking a question without new info), output exactly: NONE
- Output format: exactly ONE line of English, a compact factual note (max 30 words), starting with the subject. No quotes, no labels, no trailing punctuation like "---", no explanation.`,
    },
    { role: 'user', content: String(userText) },
  ];

  return cleanMemoryNote(await llm(prompt));
}
