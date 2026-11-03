import type { Message } from "@/lib/atendimento/types";

/** Bloco da conversa: uma mensagem, ou um álbum de fotos seguidas (como o WhatsApp agrupa). */
export type MessageBlock = { kind: "mensagem"; message: Message; previous?: Message } | { kind: "album"; messages: Message[]; previous?: Message };

/** A partir de quantas fotos seguidas vira álbum. */
export const ALBUM_MIN = 4;
/** Fotos com até este intervalo entre uma e outra contam como o mesmo lote. */
const ALBUM_GAP_MS = 3 * 60 * 1000;

const isPhoto = (message: Message) => Boolean(message.media?.mime.startsWith("image/")) && message.author !== "sistema";

function fitsAlbum(previous: Message, next: Message) {
  return (
    isPhoto(next) &&
    !next.body && // legenda só na primeira foto do lote (no WhatsApp, foto com legenda inicia outro grupo)
    next.author === previous.author &&
    next.authorName === previous.authorName &&
    new Date(next.createdAt).toDateString() === new Date(previous.createdAt).toDateString() &&
    new Date(next.createdAt).getTime() - new Date(previous.createdAt).getTime() <= ALBUM_GAP_MS
  );
}

/** Junta fotos seguidas do mesmo autor (4 ou mais) em álbuns; o resto fica como está. */
export function groupMessages(messages: Message[]): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let index = 0;
  while (index < messages.length) {
    const first = messages[index];
    let end = index + 1;
    if (isPhoto(first)) while (end < messages.length && fitsAlbum(messages[end - 1], messages[end])) end += 1;
    if (end - index >= ALBUM_MIN) {
      blocks.push({ kind: "album", messages: messages.slice(index, end), previous: messages[index - 1] });
      index = end;
    } else {
      blocks.push({ kind: "mensagem", message: first, previous: messages[index - 1] });
      index += 1;
    }
  }
  return blocks;
}
