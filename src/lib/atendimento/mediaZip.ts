import { formatNumberList } from "@/lib/atendimento/numberList";
import type { Conversation, Message } from "@/lib/atendimento/types";

/**
 * Quais mídias entram no ZIP e com que nome.
 * Nome no ZIP: "007 - 2026-11-02 14-31 - IMG-1234.jpg" (o número é o da lista de mídias do contato).
 */
export function mediaZipPlan(
  all: Array<Message & { mediaFile: string }>,
  conversation: Pick<Conversation, "contactName" | "phone">,
  /** numbers = números da lista escolhidos (null = todos). */
  options: { numbers: ReadonlySet<number> | null; onlyPhotos: boolean; onlyCustomer: boolean },
) {
  const width = Math.max(3, String(all.length).length);
  const used = new Set<string>();
  const entries = all
    .map((message, index) => ({ message, number: index + 1 }))
    .filter(({ message, number }) => (!options.numbers || options.numbers.has(number)) && message.media)
    .filter(({ message }) => !options.onlyPhotos || message.media!.mime.startsWith("image/"))
    .filter(({ message }) => !options.onlyCustomer || message.author === "cliente")
    .map(({ message, number }) => {
      const date = new Date(message.createdAt);
      const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}`;
      let name = `${String(number).padStart(width, "0")} - ${stamp} - ${message.media!.name || "arquivo"}`;
      while (used.has(name.toLowerCase())) name = name.replace(/(\.[^.]*)?$/, (ext) => `_${number}${ext}`);
      used.add(name.toLowerCase());
      return { name, file: message.mediaFile, date };
    });
  const who = (conversation.contactName || "contato").replace(/[\\/:*?"<>|]/g, "").trim().replace(/\s+/g, "-") || "contato";
  const range = options.numbers ? formatNumberList(options.numbers).replace(/, /g, "_") : "todas";
  return { entries, zipName: `midias-${who}-${conversation.phone.slice(-4)}-${range}.zip` };
}

const pad = (value: number) => String(value).padStart(2, "0");
