import type { EstadoEncarte } from "./estadoStorage";
import type { Workspace } from "./workspace";
import { storeLoadJson, storeSave } from "./objectStore";
import { renderTelaHtml } from "./telaTemplate";
import { renderCardHtml } from "./cardTemplate";
import { renderStoryHtml } from "./storyTemplate";
import {
  estadosMateriaisDoSnapshot,
  materiaisDisponiveisNoSnapshot,
  type HistoricoMaterialTipo,
} from "./historicoSnapshot";

export type { HistoricoMaterialTipo } from "./historicoSnapshot";

export function historicoArtifactPath(
  ws: Workspace,
  archiveId: string,
  tipo: HistoricoMaterialTipo,
): string {
  return `encartes/${ws}/historico/rotacoes/${archiveId}/materiais/${tipo}.pdf`;
}

export async function gerarHistoricoPdf(
  ws: Workspace,
  snapshotObject: string,
  archiveId: string,
  tipo: HistoricoMaterialTipo,
): Promise<void> {
  const estado = await storeLoadJson<EstadoEncarte>(snapshotObject);
  if (!estado) throw new Error("Snapshot imutável do histórico não encontrado.");
  const states = estadosMateriaisDoSnapshot(estado);
  if (!states || !materiaisDisponiveisNoSnapshot(estado).includes(tipo)) {
    throw new Error("Material indisponível no snapshot deste histórico.");
  }

  let htmls: string[];
  let width: number;
  let height: number;
  if (tipo === "telas") {
    htmls = states.telas
      .filter((state) => state.produtos.length > 0)
      .map(renderTelaHtml);
    width = 1280;
    height = 720;
  } else if (tipo === "cards") {
    htmls = states.cards
      .filter((state) => state.produtos.length > 0)
      .map(renderCardHtml);
    width = 1080;
    height = 1440;
  } else {
    htmls = states.stories.map(renderStoryHtml);
    width = 1080;
    height = 1920;
  }

  // Keep Puppeteer out of finalization/state-loading modules and their tests.
  const { htmlToPngBatch, pngsToPdf } = await import("./pdfGenerator");
  const pages = await htmlToPngBatch(htmls, {
    width,
    height,
    scale: tipo === "telas" ? 3 : 2,
    tipo: "jpeg",
    quality: 82,
  });
  const pdf = await pngsToPdf(pages, { width, height });
  await storeSave(
    historicoArtifactPath(ws, archiveId, tipo),
    pdf,
    "application/pdf",
  );
}