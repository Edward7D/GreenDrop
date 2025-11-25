type Route = "splash" | "auth" | "scan" | "device" | "irrigate" | "history";

export default function SplashView({ goTo }: { goTo: (r: Route) => void }) {
  return (
    <section
      id="view-splash"
      className="grid splash-view"
      style={{ minHeight: "100vh", placeContent: "center" }}
    >
      <div
        className="splash-card"
        style={{ textAlign: "center", background: "rgba(255,255,255,0.85)" }}
      >
        <div className="title">Riego automatizado, preciso y simple</div>

        <p className="subtitle">
          Encuentra tus electroválvulas vía Bluetooth, ajusta por planta y monitorea sensores en tiempo real.
        </p>

        <div className="grid grid-3" style={{ marginTop: 24 }}>
          <div className="mini-card">
            <strong>Escaneo fácil</strong>
            <p className="muted">Lista tus electroválvulas cercanas y conéctate en segundos.</p>
          </div>
          <div className="card mini-card">
            <strong>Riego inteligente</strong>
            <p className="muted">Elige la planta adecuada y deja que el sistema sugiera el tiempo óptimo.</p>
          </div>
          <div className="card mini-card">
            <strong>Sensores en vivo</strong>
            <p className="muted">Monitorea humedad del suelo, pureza del agua y estado general.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
