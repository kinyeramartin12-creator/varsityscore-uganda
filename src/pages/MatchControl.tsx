import { useEffect, useRef, useState } from "react"

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

type Fixture = {
  id: string
  homeTeam: string
  awayTeam: string
  date: string
  kickoffTime: string
  group?: string
  venue?: string
  status?: string
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
date: string
kickoffTime: string
goals?: Goal[]
cards?: MatchCard[]
}


function MatchControl() {



  const [homeTeam, setHomeTeam] = useState(
    () => localStorage.getItem("varsityscore-home-team") || ""
  )

  const skipNextSave = useRef(false)

  const [awayTeam, setAwayTeam] = useState(
    () => localStorage.getItem("varsityscore-away-team") || ""
  )

  const [homeScore, setHomeScore] = useState(
    () => Number(localStorage.getItem("varsityscore-home-score") || 0)
  )

  const [awayScore, setAwayScore] = useState(
    () => Number(localStorage.getItem("varsityscore-away-score") || 0)
  )

  const [matchStatus, setMatchStatus] = useState(
    () => localStorage.getItem("varsityscore-match-status") || "NOT STARTED"
  )

  const [matchMinute, setMatchMinute] = useState(
    () => localStorage.getItem("varsityscore-match-minute") || "0"
  )


  const [goals, setGoals] = useState<Goal[]>([])
const [cards, setCards] = useState<MatchCard[]>([])
  const [matches, setMatches] = useState<Match[]>([])
const [goalScorer, setGoalScorer] = useState("")
const [goalAssist, setGoalAssist] = useState("")
const [goalType, setGoalType] = useState<Goal["type"]>("NORMAL")

const [cardPlayer, setCardPlayer] = useState("")
const [cardTeam, setCardTeam] = useState<"home" | "away">("home")
const [cardType, setCardType] = useState<MatchCard["type"]>("YELLOW")

  const [selectedMatchId, setSelectedMatchId] = useState("")

  const selectedMatch = matches.find(
    (match) => match.id === selectedMatchId
  )

  const [events, setEvents] = useState<string[]>(() => {
    const savedEvents = localStorage.getItem("varsityscore-events")
    return savedEvents ? JSON.parse(savedEvents) : []
  })

  const [matchDate, setMatchDate] = useState('')
const [kickoffTime, setKickoffTime] = useState('')
const [fixtureHomeTeam, setFixtureHomeTeam] = useState("")
const [fixtureAwayTeam, setFixtureAwayTeam] = useState("")
const [fixtureDate, setFixtureDate] = useState("")
const [fixtureKickoff, setFixtureKickoff] = useState("")
const [fixtureGroup, setFixtureGroup] = useState("")
const [fixtureVenue, setFixtureVenue] = useState("")
const [fixtureMessage, setFixtureMessage] = useState("")
const [savingFixture, setSavingFixture] = useState(false)
const [fixtures, setFixtures] = useState<Fixture[]>([])
const [removingFixtureId, setRemovingFixtureId] = useState("")
  // Automatically count match minutes while the match is live.
  useEffect(() => {
    if (matchStatus !== "LIVE") {
      return
    }

    const interval = setInterval(() => {
      setMatchMinute((minute) => String(Number(minute) + 1))
    }, 60000)

    return () => clearInterval(interval)
  }, [matchStatus])

// Load upcoming UFL fixtures and refresh every five seconds.
useEffect(() => {
  async function loadFixtures() {
    try {
      const response = await fetch("/api/ufl-fixtures")

      if (!response.ok) {
        throw new Error("Failed to load UFL fixtures")
      }

      const data: Fixture[] = await response.json()
      setFixtures(data)
    } catch (error) {
      console.error("Unable to load UFL fixtures:", error)
    }
  }

  loadFixtures()

  const interval = setInterval(loadFixtures, 5000)

  return () => clearInterval(interval)
}, [])

  // Save the current match information in the browser.
  useEffect(() => {
    localStorage.setItem("varsityscore-home-team", homeTeam)
    localStorage.setItem("varsityscore-away-team", awayTeam)
    localStorage.setItem("varsityscore-home-score", String(homeScore))
    localStorage.setItem("varsityscore-away-score", String(awayScore))
    localStorage.setItem("varsityscore-match-status", matchStatus)
    localStorage.setItem("varsityscore-match-minute", matchMinute)
  }, [
    selectedMatchId,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    matchStatus,
    matchMinute,
  ])

  // Load matches from the backend and refresh the list every five seconds.
  useEffect(() => {
    async function loadMatches() {
      try {
        const response = await fetch(
          "/api/matches"
        )

        if (!response.ok) {
          throw new Error("Failed to load matches")
        }

        const data: Match[] = await response.json()

        setMatches(data)

        setSelectedMatchId((currentId) => {
          if (currentId && data.some((match) => match.id === currentId)) {
            return currentId
          }

          return data[0]?.id ?? ""
        })
      } catch (error) {
        console.error("Unable to load matches:", error)
      }
    }

    loadMatches()

    const interval = setInterval(loadMatches, 5000)

    return () => clearInterval(interval)
  }, [])

  // Load the selected match into the controls.
  useEffect(() => {
    if (!selectedMatch) {
      return
    }

    skipNextSave.current = true

    setHomeTeam(selectedMatch.homeTeam)
setAwayTeam(selectedMatch.awayTeam)
setHomeScore(selectedMatch.homeScore)
setAwayScore(selectedMatch.awayScore)
setMatchStatus(selectedMatch.status)
setMatchMinute(String(selectedMatch.minute))
setMatchDate(selectedMatch.date || '')
setKickoffTime(selectedMatch.kickoffTime || '')
setGoals(selectedMatch.goals ?? [])
setCards(selectedMatch.cards ?? [])

    const savedEvents = localStorage.getItem(
      `varsityscore-events-${selectedMatch.id}`
    )

    setEvents(
      savedEvents ? JSON.parse(savedEvents) : selectedMatch.events
    )
  }, [selectedMatchId])

  // Send changes to the backend.
  useEffect(() => {
    if (!selectedMatchId) {
      return
    }

    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }

    fetch(`/api/matches/${selectedMatchId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        status: matchStatus,
        minute: Number(matchMinute),
        events,
        date: matchDate,
        kickoffTime: kickoffTime,
        goals,
        cards,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to update the match")
        }

        return response.json()
      })
      .then((data) => {
        console.log("Match sent to backend:", data)
      })
      .catch((error) => {
        console.error("Backend connection failed:", error)
      })
        }, [
    selectedMatchId,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    matchStatus,
    matchMinute,
    events,
    matchDate,
    kickoffTime,
    goals,
    cards,
  ])

  // Save match events in browser storage.
  function saveEvents(updatedEvents: string[]) {
    setEvents(updatedEvents)

    if (selectedMatchId) {
      localStorage.setItem(
        `varsityscore-events-${selectedMatchId}`,
        JSON.stringify(updatedEvents)
      )
    }
  }

  // Record an event with its match minute and timestamp.
  function recordEvent(event: string) {
    const minute = matchMinute.trim() || "0"
    const recordedAt = new Date().toLocaleTimeString()

    const updatedEvents = [
      `${minute}' - ${event} (${recordedAt})`,
      ...events,
    ]

    saveEvents(updatedEvents)
  }

  // Start the match.
  
function startMatch() {
  if (!homeTeam.trim() || !awayTeam.trim()) {
    alert("Please enter both team names before starting the match.")
    return
  }

  if (matchStatus !== "NOT STARTED") {
    alert("Only a match that has not started can be started.")
    return
  }

  setMatchStatus("LIVE")
  recordEvent("Kick-off")
}


  // Create a new match.
  async function createNewMatch() {
    if (!homeTeam.trim() || !awayTeam.trim()) {
      alert("Please enter both team names.")
      return
    }

    try {
      const response = await fetch(
        "/api/matches",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            homeTeam: homeTeam.trim(),
            awayTeam: awayTeam.trim(),
date: matchDate,
kickoffTime: kickoffTime,

          }),
        }
      )

      if (!response.ok) {
        throw new Error("Could not create the match.")
      }

      const data = await response.json()

      setMatches(data.matches)
setSelectedMatchId(data.match.id)

setHomeTeam(data.match.homeTeam)
setAwayTeam(data.match.awayTeam)
setHomeScore(0)
setAwayScore(0)
setMatchStatus("NOT STARTED")
setMatchMinute("0")
setEvents([])

localStorage.setItem(
  `varsityscore-events-${data.match.id}`,
  JSON.stringify([])
)

alert("New match created successfully!")
    } catch (error) {
      console.error(error)
      alert(
        "Unable to create the match. Check that the backend is running."
      )
    }
  }

  // Delete the selected match.
  async function deleteSelectedMatch() {
    if (!selectedMatchId) {
      alert("Please select a match.")
      return
    }

    if (
      !window.confirm(
        "Are you sure you want to delete this match?"
      )
    ) {
      return
    }

    try {
      const response = await fetch(
        `/api/matches/${selectedMatchId}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        throw new Error("Failed to delete match.")
      }

      const data = await response.json()

      setMatches(data.matches)

if (data.matches.length > 0) {
  setSelectedMatchId(data.matches[0].id)
} else {
  setSelectedMatchId("")
  setHomeTeam("")
  setAwayTeam("")
  setHomeScore(0)
  setAwayScore(0)
  setMatchStatus("NOT STARTED")
  setMatchMinute("0")
  setMatchDate('')
  setKickoffTime('')
  setEvents([])
}

      alert("Match deleted successfully.")
    } catch (error) {
      console.error(error)
      alert(
        "Could not delete the match. Check the backend."
      )
    }
  }

  // Reset the current match.
  

function resetMatch() {
  if (!selectedMatchId) {
    alert("Please select a match.")
    return
  }

  const confirmed = window.confirm(
    "Reset this match? The score, minute, status, and event history will be cleared."
  )

  if (!confirmed) {
    return
  }

  setHomeScore(0)
  setAwayScore(0)
  setMatchStatus("NOT STARTED")
  setMatchMinute("0")
  saveEvents([])
}

  // Record a goal for either team.
  
function recordGoal(team: "home" | "away") {
  if (matchStatus !== "LIVE") {
    alert("Goals can only be recorded while the match is live.")
    return
  }

  if (!goalScorer.trim()) {
    alert("Enter the name of the player who scored.")
    return
  }

  const scoringTeam = team === "home" ? homeTeam : awayTeam

  const newGoal: Goal = {
    id: `goal-${Date.now()}`,
    team: scoringTeam,
    scorer: goalScorer.trim(),
    assist: goalAssist.trim(),
    minute: Number(matchMinute),
    type: goalType,
  }

  setGoals((currentGoals) => [...currentGoals, newGoal])

  if (team === "home") {
    setHomeScore((score) => score + 1)
  } else {
    setAwayScore((score) => score + 1)
  }

  recordEvent(
    `Goal for ${scoringTeam}: ${goalScorer.trim()} (${matchMinute}')`
  )

  setGoalScorer("")
  setGoalAssist("")
  setGoalType("NORMAL")
}

function recordCard() {
  if (matchStatus !== "LIVE") {
    alert("Cards can only be recorded while the match is live.")
    return
  }

  if (!cardPlayer.trim()) {
    alert("Enter the name of the player receiving the card.")
    return
  }

  const receivingTeam = cardTeam === "home" ? homeTeam : awayTeam

  const newCard: MatchCard = {
    id: `card-${Date.now()}`,
    team: receivingTeam,
    player: cardPlayer.trim(),
    minute: Number(matchMinute),
    type: cardType,
  }

  setCards((currentCards) => [...currentCards, newCard])

  recordEvent(
    `${cardType === "YELLOW" ? "Yellow" : "Red"} card: ${cardPlayer.trim()} (${receivingTeam}, ${matchMinute}')`
  )

  setCardPlayer("")
  setCardType("YELLOW")
}


async function saveManualFixture() {
  if (
    !fixtureHomeTeam.trim() ||
    !fixtureAwayTeam.trim() ||
    !fixtureDate ||
    !fixtureKickoff
  ) {
    setFixtureMessage("Please fill in both teams, date and kickoff time.")
    return
  }

  setSavingFixture(true)
  setFixtureMessage("")

  try {
    const response = await fetch("/api/ufl-fixtures", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        homeTeam: fixtureHomeTeam.trim(),
        awayTeam: fixtureAwayTeam.trim(),
        date: fixtureDate,
        kickoffTime: fixtureKickoff,
        competition: "Pepsi University Football League",
        group: fixtureGroup,
        venue: fixtureVenue,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || "Unable to save fixture.")
    }

    setFixtureMessage("Fixture added successfully!")

    setFixtureHomeTeam("")
    setFixtureAwayTeam("")
    setFixtureDate("")
    setFixtureKickoff("")
    setFixtureGroup("")
    setFixtureVenue("")
  } catch (error) {
    setFixtureMessage(
      error instanceof Error ? error.message : "Unable to save fixture."
    )
  } finally {
    setSavingFixture(false)
  }
}
async function removeFixture(fixture: Fixture) {
  const confirmed = window.confirm(
    `Remove ${fixture.homeTeam} vs ${fixture.awayTeam} from upcoming fixtures?`
  )

  if (!confirmed) return

  setRemovingFixtureId(fixture.id)

  try {
    const response = await fetch(
      `/api/ufl-fixtures/${encodeURIComponent(fixture.id)}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    )

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || "Unable to remove fixture.")
    }

    setFixtures(data.fixtures)

    if (data.matches) {
      setMatches(data.matches)
    }

    alert("Upcoming fixture removed successfully.")
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "Unable to remove fixture."
    )
  } finally {
    setRemovingFixtureId("")
  }
}

  return (
    <main className="page-container">

      <div>
        <label htmlFor="match-selector">
          Select Match:
        </label>

        <select
          id="match-selector"
          value={selectedMatchId}
          onChange={(event) =>
            setSelectedMatchId(event.target.value)
          }
        >
          {matches.map((match) => (
            <option key={match.id} value={match.id}>
              {match.homeTeam} vs {match.awayTeam}
            </option>
          ))}
        </select>
      </div>

      <header className="page-header">
        <p className="page-label">VARSITYSCORE UGANDA</p>
        <h1>Match Control</h1>
        <p>
          Record verified match events and update the scoreboard.
        </p>
      </header>

      <section className="page-content">

<div className="fixture-card">
  <h2>Add Upcoming UFL Fixture</h2>

  <label>
    Home University
    <input
      className="news-search"
      value={fixtureHomeTeam}
      onChange={(event) => setFixtureHomeTeam(event.target.value)}
      placeholder="e.g. Kampala University"
    />
  </label>

  <label>
    Away University
    <input
      className="news-search"
      value={fixtureAwayTeam}
      onChange={(event) => setFixtureAwayTeam(event.target.value)}
      placeholder="e.g. MUBS"
    />
  </label>

  <label>
    Match Date
    <input
      type="date"
      value={fixtureDate}
      onChange={(event) => setFixtureDate(event.target.value)}
    />
  </label>

  <label>
    Kickoff Time
    <input
      type="time"
      value={fixtureKickoff}
      onChange={(event) => setFixtureKickoff(event.target.value)}
    />
  </label>

  <label>
    Group (optional)
    <input
      className="news-search"
      value={fixtureGroup}
      onChange={(event) => setFixtureGroup(event.target.value)}
      placeholder="e.g. Group A"
    />
  </label>

  <label>
    Venue (optional)
    <input
      className="news-search"
      value={fixtureVenue}
      onChange={(event) => setFixtureVenue(event.target.value)}
      placeholder="Enter match venue"
    />
  </label>

  <button
    onClick={saveManualFixture}
    disabled={savingFixture}
  >
    {savingFixture ? "Saving Fixture..." : "Add Upcoming Fixture"}
  </button>

  {fixtureMessage && <p>{fixtureMessage}</p>}
</div>

<div className="fixture-card">
  <h2>Manage Upcoming Fixtures</h2>

  {fixtures.length > 0 ? (
    fixtures.map((fixture) => (
      <div
        key={fixture.id}
        style={{
          borderBottom: "1px solid #444",
          padding: "12px 0",
          marginBottom: "10px",
        }}
      >
        <h3>
          {fixture.homeTeam} vs {fixture.awayTeam}
        </h3>

        <p>Date: {fixture.date || "Not stated"}</p>
        <p>Kickoff: {fixture.kickoffTime || "Not stated"}</p>

        {fixture.group && <p>Group: {fixture.group}</p>}
        {fixture.venue && <p>Venue: {fixture.venue}</p>}

        <button
          onClick={() => removeFixture(fixture)}
          disabled={removingFixtureId === fixture.id}
        >
          {removingFixtureId === fixture.id
            ? "Removing..."
            : "Remove Fixture"}
        </button>
      </div>
    ))
  ) : (
    <p>No upcoming fixtures currently saved.</p>
  )}
</div>

<p className="About">
          Match Control. Match information is saved in this
          browser and sent to the local backend.
        </p>

        <label>
          Home team
          <input
            className="news-search"
            value={homeTeam}
            onChange={(event) => setHomeTeam(event.target.value)}
            placeholder="Enter home university"
          />
        </label>

        <label>
          Away team
          <input
            className="news-search"
            value={awayTeam}
            onChange={(event) => setAwayTeam(event.target.value)}
            placeholder="Enter away university"
          />
        </label>

        <label>
  Match Date
  <input
    type="date"
    value={matchDate}
    onChange={(event) => setMatchDate(event.target.value)}
  />
</label>

<label>
  Kickoff Time
  <input
    type="time"
    value={kickoffTime}
    onChange={(event) => setKickoffTime(event.target.value)}
  />
</label>

        <div className="fixture-card">
          <h2>
            {homeTeam || "Home Team"} {homeScore} - {awayScore}{" "}
            {awayTeam || "Away Team"}
          </h2>

          <p>Match status: {matchStatus}</p>
          <p>Match minute: {matchMinute}'</p>
        </div>

        <label>
          Match minute
          <input
            className="news-search"
            type="number"
            min="0"
            max="130"
            value={matchMinute}
            onChange={(event) => {
  const value = event.target.value

  if (
    value === "" ||
    (/^\d+$/.test(value) && Number(value) <= 130)
  ) {
    setMatchMinute(value)
  }
}}
          />
        </label>

        <div className="news-filters">
          <button
            onClick={startMatch}
            disabled={
              !homeTeam.trim() ||
              !awayTeam.trim() ||
              matchStatus !== "NOT STARTED"
            }
          >
            Start Match
          </button>

          <button
          onClick={() => {
  setMatchStatus("HALF TIME")
  recordEvent("Half-Time")
}}
            disabled={matchStatus !== "LIVE"}
          >
            Half-Time
          </button>
<button
  onClick={() => {
    setMatchStatus("LIVE")
    recordEvent("Second-half kick-off")
  }}
  disabled={matchStatus !== "HALF TIME"}
>
  Second Half
</button>


          <button
          onClick={() => {
  setMatchStatus("FINISHED")
  recordEvent("Full-Time")
}}
            disabled={
              matchStatus === "NOT STARTED" ||
              matchStatus === "FINISHED"
            }
          >
            Full-Time
          </button>

          <button onClick={resetMatch}>
            Reset Match
          </button>

          <button onClick={createNewMatch}>
            Create New Match
          </button>

          <button
            onClick={deleteSelectedMatch}
            disabled={!selectedMatchId}
          >
            Delete Match
          </button>
        </div>

<h3>Record a Goal</h3>

<label>
  Scorer
  <input
    className="news-search"
    value={goalScorer}
    onChange={(event) => setGoalScorer(event.target.value)}
    placeholder="Enter scorer's name"
  />
</label>

<label>
  Assist Maker (optional)
  <input
    className="news-search"
    value={goalAssist}
    onChange={(event) => setGoalAssist(event.target.value)}
    placeholder="Enter assist maker's name"
  />
</label>

<label>
  Goal Type
  <select
    value={goalType}
    onChange={(event) =>
      setGoalType(event.target.value as Goal["type"])
    }
  >
    <option value="NORMAL">Normal Goal</option>
    <option value="PENALTY">Penalty</option>
    <option value="OWN_GOAL">Own Goal</option>
    <option value="DIRECT_FREE_KICK">Direct Free Kick</option>
  </select>
</label>

<div className="news-filters">
  <button
    onClick={() => recordGoal("home")}
    disabled={matchStatus !== "LIVE" || !homeTeam.trim()}
  >
    Goal: {homeTeam || "Home Team"}
  </button>

  <button
    onClick={() => recordGoal("away")}
    disabled={matchStatus !== "LIVE" || !awayTeam.trim()}
  >
    Goal: {awayTeam || "Away Team"}
  </button>
</div>

<hr />

<h3>Record a Card</h3>

<label>
  Player Receiving Card
  <input
    className="news-search"
    value={cardPlayer}
    onChange={(event) => setCardPlayer(event.target.value)}
    placeholder="Enter player's name"
  />
</label>

<label>
  Team
  <select
    value={cardTeam}
    onChange={(event) =>
      setCardTeam(event.target.value as "home" | "away")
    }
  >
    <option value="home">{homeTeam || "Home Team"}</option>
    <option value="away">{awayTeam || "Away Team"}</option>
  </select>
</label>

<label>
  Card Type
  <select
    value={cardType}
    onChange={(event) =>
      setCardType(event.target.value as MatchCard["type"])
    }
  >
    <option value="YELLOW">Yellow Card</option>
    <option value="RED">Red Card</option>
  </select>
</label>

<button
  onClick={recordCard}
  disabled={matchStatus !== "LIVE"}
>
  Record Card
</button>

        <h3>Match Events</h3>

        {events.length > 0 ? (
          <ul>
            {events.map((event, index) => (
              <li key={`${event}-${index}`}>
                {event}
              </li>
            ))}
          </ul>
        ) : (
          <p>No match events recorded yet.</p>
        )}

                <hr />

       
          <h3>Goals and Assists</h3>

<p>
  Add, edit or delete goal records, including for finished matches.
  These changes will not alter the match score.
</p>

<button
  onClick={() => {
    const scorer = window.prompt("Enter the goal scorer's full name:")

    if (scorer === null || !scorer.trim()) return

    const teamInput = window.prompt(
      `Which university scored?\nEnter exactly one:\n${homeTeam}\n${awayTeam}`,
      homeTeam
    )

    if (teamInput === null) return

    const selectedTeam = [homeTeam, awayTeam].find(
      team => team.toLowerCase() === teamInput.trim().toLowerCase()
    )

    if (!selectedTeam) {
      alert("Please enter one of the two university names exactly.")
      return
    }

    const minuteInput = window.prompt(
      "Enter the goal minute. Leave blank if it is not known:"
    )

    if (minuteInput === null) return

    const minute = minuteInput.trim() ? Number(minuteInput) : 0

    if (!Number.isFinite(minute) || minute < 0) {
      alert("Please enter a valid goal minute.")
      return
    }

    const assist = window.prompt(
      "Enter the assist maker's name. Leave blank if there was no assist or it is unknown:"
    )

    if (assist === null) return

    const newGoal: Goal = {
      id: `manual-goal-${Date.now()}`,
      team: selectedTeam,
      scorer: scorer.trim(),
      assist: assist.trim(),
      minute,
      type: "NORMAL",
    }

    setGoals(currentGoals => [...currentGoals, newGoal])
  }}
>
  + Add Goal Record
</button>

{goals.length > 0 ? (
  <ul>
    {goals.map(goal => (
      <li key={goal.id}>
        <strong>
          {goal.minute > 0 ? `${goal.minute}'` : "Minute not stated"}
          {" — "}
          {goal.scorer}
        </strong>

        {" "}({goal.team})

        {goal.assist?.trim()
          ? ` — Assist: ${goal.assist}`
          : " — No assist recorded"}

        {(goal.type || "NORMAL") !== "NORMAL" &&
          ` — ${(goal.type || "NORMAL").replaceAll("_", " ")}`}

        <div style={{ marginTop: "6px", marginBottom: "12px" }}>
          <button
            onClick={() => {
              const scorer = window.prompt(
                "Edit scorer's name:",
                goal.scorer
              )

              if (scorer === null || !scorer.trim()) return

              const teamInput = window.prompt(
                `Enter the scoring university:\n${homeTeam}\n${awayTeam}`,
                goal.team
              )

              if (teamInput === null) return

              const selectedTeam = [homeTeam, awayTeam].find(
                team => team.toLowerCase() === teamInput.trim().toLowerCase()
              )

              if (!selectedTeam) {
                alert("Please enter one of the two university names exactly.")
                return
              }

              const minuteInput = window.prompt(
                "Edit goal minute. Leave blank if unknown:",
                goal.minute > 0 ? String(goal.minute) : ""
              )

              if (minuteInput === null) return

              const minute = minuteInput.trim() ? Number(minuteInput) : 0

              if (!Number.isFinite(minute) || minute < 0) {
                alert("Please enter a valid goal minute.")
                return
              }

              const assist = window.prompt(
                "Edit assist maker. Leave blank if none or unknown:",
                goal.assist || ""
              )

              if (assist === null) return

              const updatedGoal: Goal = {
                ...goal,
                scorer: scorer.trim(),
                team: selectedTeam,
                minute,
                assist: assist.trim(),
              }

              setGoals(currentGoals =>
                currentGoals.map(item =>
                  item.id === goal.id ? updatedGoal : item
                )
              )
            }}
          >
            Edit
          </button>

          {" "}

          <button
            onClick={() => {
              if (window.confirm(`Delete the goal by ${goal.scorer}?`)) {
                setGoals(currentGoals =>
                  currentGoals.filter(item => item.id !== goal.id)
                )
              }
            }}
          >
            Delete
          </button>
        </div>
      </li>
    ))}
  </ul>
) : (
  <p>No goals recorded yet.</p>
)}

        <hr />

        <h3>Yellow and Red Cards</h3>

        {cards.length > 0 ? (
          <ul>
            {cards.map((card) => (
              <li key={card.id}>
                <strong>
                  {card.minute}' — {card.player}
                </strong>
                {" "}({card.team}) — {card.type} CARD
              </li>
            ))}
          </ul>
        ) : (
          <p>No cards recorded yet.</p>
        )}
      </section>
    </main>
  )
}

export default MatchControl