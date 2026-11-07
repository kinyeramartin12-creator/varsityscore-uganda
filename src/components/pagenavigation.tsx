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
            className={({ isActive }) =>
              isActive ? 'site-nav-link active' : 'site-nav-link'
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <span className="site-competition-label">
        UGANDA UNIVERSITY FOOTBALL
      </span>
    </header>
  )
}

export default PageNavigation