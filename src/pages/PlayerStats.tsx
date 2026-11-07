
import PlayerStatisticsPanel from "../components/PlayerStatisticsPanel"

export default function PlayerStats() {
  return (
    <div className="app unified-page">

      <main className="unified-page-content">

        <section className="unified-page-header">
          <p className="unified-page-label">
            PLAYER PERFORMANCE
          </p>

          <h1>Player Statistics</h1>

          <p>
            Discover the top performers in Uganda's university football.
            Track goals and assists
            Pepsi University Football League.
          </p>
        </section>

        <PlayerStatisticsPanel />

      </main>
    </div>
  )
}