import { useEffect } from "react";

function App() {
  useEffect(() => {
    window.location.replace("/api/");
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #d9d9d9 0%, #ffffff 60%)",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#0a3a39",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 16, margin: 0 }}>
          Carregando o Gerador de Encarte...
        </p>
        <p style={{ marginTop: 12, fontSize: 14 }}>
          Se não for redirecionado, <a href="/api/">clique aqui</a>.
        </p>
      </div>
    </div>
  );
}

export default App;
