import { useEffect } from "react"

function OfficialUFLUpdates() {
  useEffect(() => {
    const scriptId = "twitter-widgets-script"

    function loadTwitterWidgets() {
      const twitterWindow = window as Window & {
        twttr?: {
          widgets?: {
            load: () => void
          }
        }
      }

      twitterWindow.twttr?.widgets?.load()
    }

    let script = document.getElementById(
      scriptId
    ) as HTMLScriptElement | null

    if (!script) {
      script = document.createElement("script")
      script.id = scriptId
      script.src = "https://platform.twitter.com/widgets.js"
      script.async = true

      script.onload = loadTwitterWidgets

      document.body.appendChild(script)
    } else {
      loadTwitterWidgets()
    }
  }, [])

  return (
    <section className="official-ufl-section">
      <div className="official-ufl-heading">
        <div>
          <h2>Official UFL Updates</h2>
          <p>
            Follow official announcements and match updates from the
            Pepsi University Football League.
          </p>
        </div>

        <a
          href="https://x.com/uflug"
          target="_blank"
          rel="noopener noreferrer"
        >
          Follow UFL on X
        </a>
      </div>

     <blockquote className="twitter-tweet" data-theme="dark">
  <p lang="en" dir="ltr">
    Follow the official Pepsi University Football League updates.
  </p>
  <a href="https://x.com/uflug">Visit @uflug on X</a>
</blockquote>
    </section>
  )
}

export default OfficialUFLUpdates