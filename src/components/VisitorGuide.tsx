import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

const tourSteps = [
  {
    target: 'home',
    title: '🏠 Home',
    description:
      'This is your starting point. Find featured matches, upcoming fixtures, recent results and overall standings.',
  },
  {
    target: 'live-scores',
    title: '🔴 Live Scores',
    description:
      'Visit here to follow university football matches currently being played and check their live scores.',
  },
  {
    target: 'fixtures',
    title: '📅 Fixtures & Results',
    description:
      'Find upcoming matches, check match dates and times, and look back at completed games.',
  },
  {
    target: 'standings',
    title: '🏆 Standings',
    description:
      'See how universities are performing. Compare points, wins, losses and goal differences.',
  },
  {
    target: 'teams',
    title: '⚽ Teams',
    description:
      'Explore participating universities and discover information about individual teams.',
  },
  {
    target: 'news',
    title: '📰 News',
    description:
      'Stay informed with university football news, reports and important updates.',
  },
  {
    target: 'player-stats',
    title: '📊 Player Stats',
    description:
      'Explore player statistics and follow individual performances.',
  },
]

const directoryItems = [
  { icon: '🏠', title: 'Home', description: 'Your football overview', path: '/' },
  { icon: '⚽', title: 'Live Scores', description: 'Follow live matches', path: '/live-scores' },
  { icon: '📅', title: 'Fixtures & Results', description: 'Upcoming and completed games', path: '/fixtures' },
  { icon: '🏆', title: 'Standings', description: 'Compare university positions', path: '/standings' },
  { icon: '👥', title: 'Teams', description: 'Explore university teams', path: '/teams' },
  { icon: '📰', title: 'News', description: 'Latest football updates', path: '/news' },
  { icon: '🥇', title: 'Player Stats', description: 'Goalscorers and performances', path: '/player-stats' },
]

function VisitorGuide() {
  const [showWelcome, setShowWelcome] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [isTourActive, setIsTourActive] = useState(false)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [directoryOpen, setDirectoryOpen] = useState(false)

const [installPrompt, setInstallPrompt] =
  useState<BeforeInstallPromptEvent | null>(null)

const [isInstalled, setIsInstalled] = useState(false)

useEffect(() => {
  const checkInstalled = () => {
    setIsInstalled(
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    )
  }

  const handleInstallPrompt = (event: Event) => {
    event.preventDefault()
    setInstallPrompt(event as BeforeInstallPromptEvent)
  }

  const handleInstalled = () => {
    setIsInstalled(true)
    setInstallPrompt(null)
  }

  checkInstalled()

  window.addEventListener('beforeinstallprompt', handleInstallPrompt)
  window.addEventListener('appinstalled', handleInstalled)

  return () => {
    window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
    window.removeEventListener('appinstalled', handleInstalled)
  }
}, [])

  useEffect(() => {
    if (!localStorage.getItem('varsityscore-guide-completed')) {
      setShowWelcome(true)
    }

    const openGuide = () => {
      setDirectoryOpen(false)
      setIsTourActive(false)
      setTargetRect(null)
      setShowWelcome(true)
    }

    const openInstallGuide = () => {
  setShowWelcome(false)
  setIsTourActive(false)
  setTargetRect(null)
  setDirectoryOpen(true)
}

    window.addEventListener('open-visitor-guide', openGuide)
window.addEventListener('open-install-guide', openInstallGuide)

    return () => {
      window.removeEventListener('open-visitor-guide', openGuide)
      window.removeEventListener('open-install-guide', openInstallGuide)
    }
  }, [])

  useEffect(() => {
    if (!isTourActive) return

    const step = tourSteps[currentStep]

    const timer = setTimeout(() => {
      const target = document.querySelector(
        `[data-tour="${step.target}"]`
      )

      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        })

        setTimeout(() => {
          setTargetRect(target.getBoundingClientRect())
        }, 350)
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [currentStep, isTourActive])

  useEffect(() => {
    if (!isTourActive) return

    const updatePosition = () => {
      const target = document.querySelector(
        `[data-tour="${tourSteps[currentStep].target}"]`
      )

      if (target) {
        setTargetRect(target.getBoundingClientRect())
      }
    }

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition)
    }
  }, [currentStep, isTourActive])

  const startTour = () => {
    setShowWelcome(false)
    setCurrentStep(0)
    setIsTourActive(true)
  }

  const finishTour = () => {
    setIsTourActive(false)
    setShowWelcome(false)
    setTargetRect(null)

    localStorage.setItem('varsityscore-guide-completed', 'true')
  }

  const nextStep = () => {
    if (currentStep === tourSteps.length - 1) {
      finishTour()
    } else {
      setTargetRect(null)
      setCurrentStep((previous) => previous + 1)
    }
  }

  const previousStep = () => {
    if (currentStep > 0) {
      setTargetRect(null)
      setCurrentStep((previous) => previous - 1)
    }
  }

const installApp = async () => {
  if (!installPrompt) return

  await installPrompt.prompt()

  const result = await installPrompt.userChoice

  if (result.outcome === 'accepted') {
    setInstallPrompt(null)
  }
}

  return (
    <>
      {/* FIRST-TIME WELCOME */}
      {showWelcome && (
        <div className="guide-overlay">
          <div className="guide-welcome">
            <div className="guide-icon">V</div>

            <p className="guide-eyebrow">
              YOUR UNIVERSITY FOOTBALL CENTRE
            </p>

            <h2>
              Welcome to <span>VarsityScore Uganda!</span>
            </h2>

            <p>
              New here? Let us show you around. Learn how to find
              live scores, fixtures, results, university teams and
              football news.
            </p>

            <button
              className="guide-primary-button"
              onClick={startTour}
            >
              Show Me Around →
            </button>

            <button
              className="guide-skip-button"
              onClick={finishTour}
            >
              Explore Site
            </button>
          </div>
        </div>
      )}

      {/* FLOATING NAVIGATION TOUR */}
      {isTourActive && (
        <div className="guide-overlay">
          {targetRect && (
            <div
              className="guide-highlight"
              style={{
                top: targetRect.top - 6,
                left: targetRect.left - 6,
                width: targetRect.width + 12,
                height: targetRect.height + 12,
              }}
            />
          )}

          <div
            className="guide-floating-tip"
            style={
              targetRect
                ? {
                    position: 'fixed',
                    top: Math.max(
                      20,
                      Math.min(targetRect.top, window.innerHeight - 230)
                    ),
                    left:
                      targetRect.right + 370 < window.innerWidth
                        ? targetRect.right + 24
                        : Math.max(15, targetRect.left - 370),
                  }
                : {}
            }
          >
            <div className="guide-progress">
              STEP {currentStep + 1} OF {tourSteps.length}
            </div>

            <h2>{tourSteps[currentStep].title}</h2>

            <p>{tourSteps[currentStep].description}</p>

            <div className="guide-progress-bar">
              <span
                style={{
                  width: `${((currentStep + 1) / tourSteps.length) * 100}%`,
                }}
              />
            </div>

            <div className="guide-actions">
              <button
                className="guide-skip-button"
                onClick={finishTour}
              >
                Skip
              </button>

              <div>
                {currentStep > 0 && (
                  <button
                    className="guide-back-button"
                    onClick={previousStep}
                  >
                    Back
                  </button>
                )}

                <button
                  className="guide-primary-button"
                  onClick={nextStep}
                >
                  {currentStep === tourSteps.length - 1
                    ? 'Finish'
                    : 'Next →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK DIRECTORY */}
      {!showWelcome && !isTourActive && (
        <div className="quick-directory">
          {directoryOpen && (
            <div className="directory-panel">
              <div className="directory-heading">
                <div>
                  <span>VARSITYSCORE GUIDE</span>
                  <h3>Explore the Site</h3>
                </div>

                <button
                  className="directory-close"
                  onClick={() => setDirectoryOpen(false)}
                  aria-label="Close directory"
                >
                  ×
                </button>
              </div>

              <div className="directory-items">
                {directoryItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="directory-item"
                    onClick={() => setDirectoryOpen(false)}
                  >
                    <span className="directory-icon">
                      {item.icon}
                    </span>

                    <span className="directory-text">
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </span>

                    <span className="directory-arrow">›</span>
                  </Link>
                ))}
              </div>

<div className="directory-install">
  <div className="directory-install-icon">📲</div>

  <div className="directory-install-content">
    <strong>
      {isInstalled
        ? 'VarsityScore Installed!'
        : 'Get the VarsityScore App'}
    </strong>

    <p>
      {isInstalled
        ? 'You can now access VarsityScore directly from your device.'
        : 'Install VarsityScore on your phone or computer for quick access.'}
    </p>

    {!isInstalled && installPrompt && (
      <button
        className="directory-install-button"
        onClick={installApp}
      >
        Install App ↓
      </button>
    )}

    {!isInstalled && !installPrompt && (
      <div className="directory-install-instructions">
        <strong>How to install:</strong>

        <p>
          <b>Android:</b> Open your browser menu (⋮) and select
          Install App or Add to Home Screen.
        </p>

        <p>
          <b>iPhone/iPad:</b> Tap Share in Safari, then select
          Add to Home Screen.
        </p>

        <p>
          <b>Computer:</b> Look for the Install icon in the
          address bar of Chrome or Edge.
        </p>
      </div>
    )}
  </div>
</div>

              <button
                className="directory-tour-link"
                onClick={() => {
                  setDirectoryOpen(false)
                  setShowWelcome(true)
                }}
              >
                Take the guided tour →
              </button>
            </div>
          )}

          <button
            className="directory-toggle"
            onClick={() => setDirectoryOpen(!directoryOpen)}
          >
            <span>{directoryOpen ? '×' : '?'}</span>
            {directoryOpen ? 'Close Guide' : 'Explore VarsityScore'}
          </button>
        </div>
      )}
    </>
  )
}

export default VisitorGuide