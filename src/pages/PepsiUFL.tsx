import { useEffect, useState } from "react"
import { uflGroups } from "../data/uflGroups"

type Goal = {
id: string
team: string
scorer: string
assist: string
minute: number
type: "NORMAL" | "PENALTY" | "OWN_GOAL" | "DIRECT_FREE_KICK"
}

type MatchCard = {
id: string
team: string
player: string
minute: number
type: "YELLOW" | "RED"
}

type OfficialUFLPost = {
  title: string
  link: string
  publishedAt: string
  originalText: string
  status: string
  score: {
    homeTeam: string
    homeScore: number
    awayScore: number
    awayTeam: string
  } | null
  goals: {
    scorer: string
    minute: number
    assist: string
  }[]
  cards: {
    type: string
    description: string
  }[]
}

type Match = {
id: string
homeTeam: string
awayTeam: string
homeScore: number
awayScore: number
status: string
minute: number
events: string[]
date?: string
kickoffTime?: string
competition?: string
goals?: Goal[]
cards?: MatchCard[]
}


function PepsiUFL() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)
  const [lastUpdated, setLastUpdated] = useState("")
const [officialPosts, setOfficialPosts] = useState<OfficialUFLPost[]>([])
  

useEffect(() => {
    let active = true

    async function loadMatches() {
      try {
        const response = await fetch("http://localhost:3001/api/matches")

        if (!response.ok) {
          throw new Error("Unable to load matches")
        }

        const data: Match[] = await response.json()

        if (active) {
          const validMatches = data.filter(
            (match) => match.homeTeam?.trim() && match.awayTeam?.trim()
          )

          setMatches(validMatches)
          setConnectionError(false)
          setLastUpdated(new Date().toLocaleTimeString())
        }
      } catch {
        if (active) {
          setConnectionError(true)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadMatches()

    const interval = window.setInterval(loadMatches, 5000)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

useEffect(() => {
  let active = true

  async function loadOfficialPosts() {
    try {
      const response = await fetch(
  "http://localhost:3001/api/ufl-parsed-updates",
  {
    credentials: "include",
  }
)

      if (!response.ok) {
        throw new Error("Unable to fetch official UFL posts")
      }

      const data = await response.json()

      if (active) {
        setOfficialPosts(data.updates || [])
      }
    } catch (error) {
      console.error("Official UFL posts could not be loaded:", error)
    }
  }

  loadOfficialPosts()

  const interval = window.setInterval(loadOfficialPosts, 60000)

  return () => {
    active = false
    window.clearInterval(interval)
  }
}, [])

    useEffect(() => {
    const scriptId = "pepsi-ufl-x-widget"
    const timeline = document.getElementById("pepsi-ufl-timeline")

    const twitterWindow = window as Window & {
      twttr?: {
        widgets?: {
          load: (element?: HTMLElement) => void
        }
      }
    }

    function loadTimeline() {
      if (timeline && twitterWindow.twttr?.widgets) {
        twitterWindow.twttr.widgets.load(timeline)
      }
    }

    let script = document.getElementById(
      scriptId
    ) as HTMLScriptElement | null

    if (script) {
      script.addEventListener("load", loadTimeline, { once: true })
      loadTimeline()

      return () => {
        script?.removeEventListener("load", loadTimeline)
      }
    }

    script = document.createElement("script")
    script.id = scriptId
    script.src = "https://platform.twitter.com/widgets.js"
    script.async = true

    script.addEventListener("load", loadTimeline, { once: true })

    document.body.appendChild(script)

    return () => {
      script?.removeEventListener("load", loadTimeline)
    }
  }, [])

  const liveMatches = matches.filter((match) => {
    const status = match.status.toUpperCase()
    return status === "LIVE" || status === "HALF TIME"
  })

  const upcomingMatches = matches.filter((match) => {
    const status = match.status.toUpperCase()

    return (
      status === "SCHEDULED" ||
      status === "NOT STARTED" ||
      status === "UPCOMING" ||
      status === "DEMO FIXTURE"
    )
  })

  const finishedMatches = matches.filter((match) => {
    const status = match.status.toUpperCase()

    return (
      status === "FINISHED" ||
      status === "FULL TIME" ||
      status === "DEMO RESULT"
    )
  })

  function getMatchStatus(match: Match) {
    const status = match.status.toUpperCase()

    if (status === "LIVE") {
      return match.minute > 0 ? `LIVE · ${match.minute}'` : "LIVE"
    }

    if (status === "HALF TIME") {
      return "HALF TIME"
    }

    if (status === "FINISHED" || status === "FULL TIME") {
      return "FULL TIME"
    }

    if (status === "DEMO FIXTURE") {
      return "DEMO FIXTURE"
    }

    if (status === "DEMO RESULT") {
      return "DEMO RESULT"
    }

    return "UPCOMING"
  }

  function renderMatchCard(match: Match) {
    const status = match.status.toUpperCase()
    const isUpcoming =
      status === "SCHEDULED" ||
      status === "NOT STARTED" ||
      status === "UPCOMING" ||
      status === "DEMO FIXTURE"

    return (
      <article className="pepsi-match-card" key={match.id}>
        <div className="pepsi-match-card-top">
          <span
            className={`pepsi-match-status ${
              status === "LIVE" || status === "HALF TIME"
                ? "pepsi-status-live"
                : status === "FINISHED" || status === "FULL TIME"
                  ? "pepsi-status-finished"
                  : "pepsi-status-upcoming"
            }`}
          >
            {getMatchStatus(match)}
          </span>

          {match.competition && (
            <span className="pepsi-match-competition">
              {match.competition}
            </span>
          )}
        </div>

        <div className="pepsi-match-teams">
          <div className="pepsi-match-team">
            <span>{match.homeTeam}</span>
          </div>

          <div className="pepsi-match-score">
            {isUpcoming ? (
              <span className="pepsi-vs">VS</span>
            ) : (
              <>
                <span>{match.homeScore}</span>
                <span className="pepsi-score-divider">:</span>
                <span>{match.awayScore}</span>
              </>
            )}
          </div>

          <div className="pepsi-match-team pepsi-away-team">
            <span>{match.awayTeam}</span>
          </div>
        </div>

        {(match.date || match.kickoffTime) && (
          <div className="pepsi-match-date">
            {match.date && <span>{match.date}</span>}
            {match.kickoffTime && <span>{match.kickoffTime}</span>}
          </div>
        )}

{match.goals && match.goals.length > 0 && (
  <div className="pepsi-match-events">
    <h4>Goals & Assists</h4>

    {match.goals.map((goal, index) => (
      <p key={goal.id ?? index}>
        {goal.minute}' — {goal.scorer || "Unknown scorer"}
        {goal.team ? ` (${goal.team})` : ""}
        {goal.assist?.trim()
          ? ` · Assist: ${goal.assist}`
          : ""}
        {goal.type && goal.type !== "NORMAL"
          ? ` · ${goal.type.replaceAll("_", " ")}`
          : ""}
      </p>
    ))}
  </div>
)}


    {match.cards && match.cards.length > 0 && (
      <div className="pepsi-match-events">
        <h4>Cards</h4>

        {match.cards.map((card) => (
          <p key={card.id}>
            {card.minute}' — {card.player} ({card.team}) · {card.type} CARD
          </p>
        ))}
      </div>
    )}

    {match.events && match.events.length > 0 && (
      <div className="pepsi-match-events">
        <h4>Match Events</h4>

        {match.events.map((event, index) => (
          <p key={`${match.id}-event-${index}`}>{event}</p>
        ))}
      </div>
    )}

      </article>
    )
  }

  function renderMatchSection(
    title: string,
    description: string,
    sectionMatches: Match[],
    emptyMessage: string
  ) {
    return (
      <section className="pepsi-section">
        <div className="pepsi-section-heading">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>

          <span className="pepsi-match-count">
            {sectionMatches.length} {sectionMatches.length === 1 ? "match" : "matches"}
          </span>
        </div>

        {sectionMatches.length > 0 ? (
          <div className="pepsi-match-grid">
            {sectionMatches.map(renderMatchCard)}
          </div>
        ) : (
          <div className="pepsi-empty-state">
            <h3>No matches to display</h3>
            <p>{emptyMessage}</p>
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="app pepsi-ufl-page">

      <section className="official-ufl-updates">
  <h2>Official Pepsi UFL Updates</h2>

  <p>Latest updates from the official Pepsi UFL account.</p>

  {officialPosts.length === 0 ? (
    <p>No official updates available right now.</p>
  ) : (
    officialPosts.map((post, index) => (
      <article
        key={post.link || index}
        className="official-ufl-post"
      >
        <h3>{post.title || "Pepsi UFL Update"}</h3>

        {post.publishedAt && (
          <p>
            {new Date(post.publishedAt).toLocaleString()}
          </p>
        )}

        <p>{post.originalText}</p>

{post.score && (
  <div>
    <h4>Detected Match Result</h4>
    <p>
      {post.score.homeTeam} {post.score.homeScore} -{" "}
      {post.score.awayScore} {post.score.awayTeam}
    </p>
  </div>
)}

{post.goals.length > 0 && (
  <div>
    <h4>Detected Goals</h4>

    {post.goals.map((goal, index) => (
      <p key={`${post.link}-goal-${index}`}>
        {goal.minute}' — {goal.scorer}
        {goal.assist ? ` · Assist: ${goal.assist}` : ""}
      </p>
    ))}
  </div>
)}

{post.cards.length > 0 && (
  <div>
    <h4>Detected Cards</h4>

    {post.cards.map((card, index) => (
      <p key={`${post.link}-card-${index}`}>
        {card.type} CARD — {card.description}
      </p>
    ))}
  </div>
)}

{post.status === "UNCONFIRMED" && (
  <p>Match result not confirmed by the current parser.</p>
)}

        {post.link && (
          <a
            href={post.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            View Original Post on X
          </a>
        )}
      </article>
    ))
  )}
</section>

      <main className="pepsi-ufl-container">
        <section className="pepsi-hero">
          <div className="pepsi-hero-content">
            <span className="pepsi-eyebrow">
              VARSITYSCORE UGANDA PRESENTS
            </span>

            <h1>
              PEPSI <span>UNIVERSITY</span>
              <br />
              FOOTBALL LEAGUE
            </h1>

            <p>
              Follow Uganda's university football action, match results,
              fixtures and official league updates.
            </p>

            <div className="pepsi-hero-actions">
              <a
                href="https://x.com/uflug"
                target="_blank"
                rel="noreferrer"
                className="pepsi-primary-button"
              >
                Follow Official Updates ↗
              </a>

              <a href="#pepsi-match-centre" className="pepsi-secondary-button">
                View Match Centre ↓
              </a>
            </div>
          </div>

          <div className="pepsi-hero-badge">
            <span className="pepsi-badge-top">UNIVERSITY</span>
            <strong>UFL</strong>
            <span className="pepsi-badge-bottom">UGANDA</span>
          </div>
        </section>

        <section className="pepsi-information-bar">
          <div>
            <span className="pepsi-info-label">COMPETITION</span>
            <strong>Pepsi University Football League</strong>
          </div>

          <div>
            <span className="pepsi-info-label">MATCHES TRACKED</span>
            <strong>{matches.length}</strong>
          </div>

          <div>
            <span className="pepsi-info-label">DATA CONNECTION</span>
            <strong className={connectionError ? "pepsi-offline" : "pepsi-online"}>
              {connectionError ? "Disconnected" : "Backend connected"}
            </strong>
          </div>
        </section>

<section className="pepsi-section">
  <div className="pepsi-main-heading">
    <span className="pepsi-eyebrow">2026/27 SEASON</span>
    <h2>League Groups</h2>
    <p>Explore the universities assigned to each regional group.</p>
  </div>

  <div className="pepsi-match-grid">
    {uflGroups.map((group) => (
      <article className="pepsi-match-card" key={group.name}>
        <div className="pepsi-match-card-top">
          <span className="pepsi-match-status pepsi-status-upcoming">
            {group.name}
          </span>
        </div>

        <h3>{group.region}</h3>

        <p>{group.teams.length} universities</p>

        <ol>
          {group.teams.map((team) => (
            <li key={team}>{team}</li>
          ))}
        </ol>
      </article>
    ))}
  </div>
</section>

        <div id="pepsi-match-centre">
          <div className="pepsi-main-heading">
            <span className="pepsi-eyebrow">THE ACTION</span>
            <h2>UFL Match Centre</h2>
            <p>
              Follow match information recorded in the VarsityScore database.
            </p>
          </div>

          {loading && matches.length === 0 && !connectionError && (
            <div className="pepsi-empty-state">
              <h3>Loading matches...</h3>
              <p>Connecting to the VarsityScore match database.</p>
            </div>
          )}

          {connectionError && matches.length === 0 && (
            <div className="pepsi-empty-state">
              <h3>Match data unavailable</h3>
              <p>
                Start the VarsityScore backend to display recorded matches.
              </p>
            </div>
          )}

          {renderMatchSection(
            "Live Now",
            "Matches currently marked as live or at half-time.",
            liveMatches,
            "No matches are currently marked as live."
          )}

          {renderMatchSection(
            "Upcoming Fixtures",
            "Matches scheduled to take place.",
            upcomingMatches,
            "No upcoming fixtures have been recorded yet."
          )}

          {renderMatchSection(
            "Recent Results",
            "Scores recorded for completed matches.",
            finishedMatches,
            "Completed results will appear here when recorded."
          )}

          {lastUpdated && (
            <p className="pepsi-last-updated">
              Match database last checked: {lastUpdated}
            </p>
          )}
        </div>

        <section className="pepsi-section pepsi-official-section">
          <div className="pepsi-section-heading">
            <div>
              <span className="pepsi-eyebrow">FROM THE LEAGUE</span>
              <h2>Official Pepsi UFL Updates</h2>
              <p>
                Read posts from the league's official X account.
              </p>
            </div>

            <a
              href="https://x.com/uflug"
              target="_blank"
              rel="noreferrer"
              className="pepsi-primary-button"
            >
              Open X ↗
            </a>
          </div>

          <div className="pepsi-timeline-panel" id="pepsi-ufl-timeline">
            <a
              className="twitter-timeline"
              data-theme="dark"
              data-chrome="noheader nofooter noborders"
              data-height="650"
              href="https://twitter.com/uflug"
            >
              Official Pepsi UFL updates on X
            </a>
          </div>

          <p className="pepsi-feed-note">
            Official posts are provided by X. If the timeline does not load,
            use the Open X button to visit the league's account.
          </p>
        </section>

                <section className="pepsi-manual-notice">
          <div>
            <span className="pepsi-eyebrow">YOUR MATCH CONTROL</span>
            <h2>Keep the scores up to date</h2>
            <p>
              Match scores and events displayed here come from the
              VarsityScore backend. Use Match Control to manage match
              information, update scores, and record match events.
            </p>

            <a
              href="/match-control"
              className="pepsi-primary-button"
            >
              Open Match Control →
            </a>
          </div>
        </section>

        <footer className="pepsi-footer">
          <strong>VARSITYSCORE UGANDA</strong>
          <p>
            Independent university football coverage. Official league
            announcements remain the property of their respective publishers.
          </p>
        </footer>
      </main>
    </div>
  )
}

export default PepsiUFL