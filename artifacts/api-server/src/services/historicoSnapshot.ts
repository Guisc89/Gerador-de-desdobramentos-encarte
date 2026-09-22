import type { EstadoEncarte } from "./estadoStorage";
import type { TelaState, TelaProduto } from "./telaTemplate";
import type { CardState } from "./cardTemplate";
import type { StoryState } from "./storyTemplate";

export type HistoricoMaterialTipo = "telas" | "cards" | "stories";

export function snapshotPointerFromPrecario(
  ws: "rs" | "ms",
  precarioObject: string | undefined,
): { archiveId: string; snapshotObject: string } | null {
  if (!precarioObject) return null;
  const escapedWs = ws.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = precarioObject.match(
    new RegExp(
      `^encartes/${escapedWs}/historico/rotacoes/([^/]+)/precario\\.pdf$`,
    ),
  );
  if (!match) return null;
  return {
    archiveId: match[1]!,
    snapshotObject: precarioObject.replace(/\/precario\.pdf$/, "/estado.json"),
  };
}

type Obj = Record<string, unknown>;

function object(value: unknown): Obj {
  return value && typeof value === "object" ? value as Obj : {};
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function dataImage(value: unknown): string | null {
  return typeof value === "string" &&
    /^data:image\/(png|jpe?g|webp);base64,/i.test(value)
    ? value
    : null;
}

function product(value: unknown, fotos: Obj): TelaProduto | null {
  const raw = object(value);
  const nome = text(raw["nome"]);
  if (!nome) return null;
  const descricao = text(raw["descricao"]);
  const centavos = text(raw["precoCentavos"]).replace(/\D/g, "").slice(0, 2);
  return {
    nome,
    descricao,
    precoInteiro: text(raw["precoInteiro"]).replace(/\D/g, "") || "0",
    precoCentavos: centavos.padStart(2, "0"),
    foto: dataImage(raw["foto"]) ||
      dataImage(fotos[`${nome}||${descricao}`]),
  };
}

interface Snapshot {
  telas: Obj;
  cards: Obj;
  stories: Obj;
  pages: TelaProduto[][];
  pageDisclaimers: string[];
  perPageLegal: boolean;
}

function readSnapshot(estado: EstadoEncarte): Snapshot | null {
  const frontend = object(estado.frontend);
  const telas = object(frontend["telas"]);
  const rawPages = Array.isArray(telas["telas"]) ? telas["telas"] : null;
  if (!rawPages) return null;
  const fotos = object(frontend["fotos"]);
  const pages = rawPages.map((page) => {
    const rawProducts = object(page)["produtos"];
    return (Array.isArray(rawProducts) ? rawProducts : [])
      .map((item) => product(item, fotos))
      .filter((item): item is TelaProduto => item !== null);
  });
  const perPageLegal =
    Number(telas["schemaVersion"]) >= 2 ||
    rawPages.some((page) =>
      Object.prototype.hasOwnProperty.call(object(page), "disclaimer")
    );
  return {
    telas,
    cards: object(frontend["cardsExtras"]),
    stories: object(frontend["storiesExtras"]),
    pages,
    pageDisclaimers: rawPages.map((page) =>
      text(object(page)["disclaimer"])
    ),
    perPageLegal,
  };
}

function cardValid(pages: TelaProduto[][]): boolean {
  return pages.some((p) => p.length > 0) &&
    pages.every((p, index) =>
      p.length === 0 ||
      (index === 0 ? p.length === 2 : p.length >= 2 && p.length <= 4)
    );
}

function storyGroups(pages: TelaProduto[][]): TelaProduto[][] {
  const all = pages.flat();
  if (all.length === 0) return [];
  const result = [all.slice(0, 2)];
  const rest = all.slice(2);
  if (rest.length === 0) return result;
  const count = Math.max(1, Math.ceil(rest.length / 3));
  const base = Math.floor(rest.length / count);
  const extra = rest.length % count;
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const size = base + (index < extra ? 1 : 0);
    result.push(rest.slice(cursor, cursor + size));
    cursor += size;
  }
  return result;
}

function storyGroupSources(pages: TelaProduto[][]): number[][] {
  const entries = pages.flatMap((page, sourceIndex) =>
    page.map(() => sourceIndex)
  );
  if (entries.length === 0) return [];
  const result = [entries.slice(0, 2)];
  const rest = entries.slice(2);
  if (rest.length === 0) return result;
  const count = Math.max(1, Math.ceil(rest.length / 3));
  const base = Math.floor(rest.length / count);
  const extra = rest.length % count;
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const size = base + (index < extra ? 1 : 0);
    result.push(rest.slice(cursor, cursor + size));
    cursor += size;
  }
  return result;
}

function storiesValid(groups: TelaProduto[][]): boolean {
  return groups.length > 0 &&
    groups.every((p, index) =>
      index === 0 ? p.length === 2 : p.length >= 2 && p.length <= 3
    );
}

export function materiaisDisponiveisNoSnapshot(
  estado: EstadoEncarte,
): HistoricoMaterialTipo[] {
  const snapshot = readSnapshot(estado);
  if (!snapshot) return [];
  const result: HistoricoMaterialTipo[] = [];
  if (snapshot.pages.some((p) => p.length > 0)) result.push("telas");
  if (cardValid(snapshot.pages)) result.push("cards");
  if (storiesValid(storyGroups(snapshot.pages))) result.push("stories");
  return result;
}

function commonState(extra: Obj, telas: Obj, disclaimer?: string) {
  return {
    mes: text(telas["mes"]),
    validadeInicio: text(telas["validadeInicio"]),
    validadeFim: text(telas["validadeFim"]),
    ...(disclaimer !== undefined ? { disclaimer } : {}),
    infoCor: Object.prototype.hasOwnProperty.call(extra, "infoCor")
      ? text(extra["infoCor"])
      : text(telas["infoCor"]),
  };
}

function background(extra: Obj, index: number): string | null {
  return index === 0
    ? dataImage(extra["bgDataUri"])
    : dataImage(extra["bg2DataUri"]) || dataImage(extra["bgDataUri"]);
}

export function estadosMateriaisDoSnapshot(estado: EstadoEncarte): {
  telas: TelaState[];
  cards: CardState[];
  stories: StoryState[];
} | null {
  const snapshot = readSnapshot(estado);
  if (!snapshot) return null;
  const legacyLegal = Object.prototype.hasOwnProperty.call(
      snapshot.telas,
      "disclaimer",
    )
    ? text(snapshot.telas["disclaimer"])
    : undefined;
  const legalForPage = (index: number) =>
    snapshot.perPageLegal ? snapshot.pageDisclaimers[index] || "" : legacyLegal;
  const storySources = storyGroupSources(snapshot.pages);
  const storyLegalLists = storySources.map(() => [] as string[]);
  if (snapshot.perPageLegal) {
    snapshot.pageDisclaimers.forEach((legal, sourceIndex) => {
      if (!legal) return;
      let destination = -1;
      storySources.forEach((sources, storyIndex) => {
        if (storyIndex > 0 && sources.includes(sourceIndex)) {
          destination = storyIndex;
        }
      });
      if (destination < 0) return;
      const existing = storyLegalLists[destination]!;
      if (!existing.includes(legal)) existing.push(legal);
    });
  } else if (legacyLegal !== undefined) {
    storyLegalLists.forEach((list, index) => {
      if (index > 0 && legacyLegal) list.push(legacyLegal);
    });
  }
  return {
    telas: snapshot.pages.map((produtos, index) => ({
      ...commonState(snapshot.telas, snapshot.telas, legalForPage(index)),
      background: background(snapshot.telas, index),
      isCapa: index === 0,
      produtos: produtos.slice(0, index === 0 ? 2 : 4),
    })),
    cards: snapshot.pages.map((produtos, index) => ({
      ...commonState(
        snapshot.cards,
        snapshot.telas,
        index === 0 ? "" : legalForPage(index),
      ),
      background: background(snapshot.cards, index),
      isCapa: index === 0,
      produtos: produtos.slice(0, index === 0 ? 2 : 4),
    })),
    stories: storyGroups(snapshot.pages).map((produtos, index) => ({
      ...commonState(
        snapshot.stories,
        snapshot.telas,
        storyLegalLists[index]?.join("\n") || "",
      ),
      background: background(snapshot.stories, index),
      isCapa: index === 0,
      produtos,
    })),
  };
}