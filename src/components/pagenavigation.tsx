import { Link, NavLink } from 'react-router-dom'

function PageNavigation() {
  const links = [
    { to: '/', label: 'Home', end: true },
    { to: '/live-scores', label: 'Live Scores' },
    { to: '/fixtures', label: 'Fixtures & Results' },
    { to: '/standings', label: 'Standings' },
    { to: '/teams', label: 'Teams' },
    { to: '/news', label: 'News' },
    { to: '/player-stats', label: 'Player Stats' },
  ]

  return (
    <header className="site-header">
      <Link to="/" className="site-brand">
        <span className="site-brand-icon">V</span>
        <span>
          VARSITY<span className="site-brand-accent">SCORE</span>
        </span>
      </Link>

      <nav className="site-navigation">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            data-tour={link.to === '/' ? 'home' : link.to.replace('/', '')}
            className={({ isActive }) =>
              isActive ? 'site-nav-link active' : 'site-nav-link'
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="header-action-buttons">
        <button
          className="visitor-guide-button"
          onClick={() => window.dispatchEvent(new Event('open-visitor-guide'))}
        >
          ? How to Use
        </button>

        <button
          className="install-app-header-button"
          onClick={() => window.dispatchEvent(new Event('open-install-guide'))}
        >
          ↓ Install App
        </button>
      </div>

      <span className="site-competition-label">
        UGANDA UNIVERSITY FOOTBALL
      </span>
    </header>
  )
}

export default PageNavigation