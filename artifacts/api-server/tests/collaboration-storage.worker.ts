import { EstadoConflictError, mergeEstado } from "../src/services/estadoStorage";

const workspace = process.env["TEST_WORKSPACE"];
const version = process.env["TEST_VERSION"];
const etapa = process.env["TEST_STAGE"] as "cards" | "stories" | undefined;

if (!workspace || !version || !etapa) {
  throw new Error("Parâmetros do worker de colaboração estão ausentes.");
}

try {
  const result = await mergeEstado(
    workspace as never,
    { etapa },
    version,
  );
  console.log(JSON.stringify({ status: 200, version: result.version }));
} catch (error) {
  if (error instanceof EstadoConflictError) {
    console.log(JSON.stringify({ status: 409, version: error.version }));
  } else {
    throw error;
  }
}