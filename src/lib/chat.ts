export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  /** epoch ms */
  ts: number;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `m_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function createMessage(author: string, text: string): ChatMessage {
  return {
    id: nextId(),
    author,
    text: text.slice(0, 1000), // hard cap to prevent abuse
    ts: Date.now(),
  };
}
