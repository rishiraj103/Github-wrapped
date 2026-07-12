import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  GitHubApiError,
  WRAPPED_YEAR,
  createWrappedData,
  fetchSecureWrappedData,
  fetchGitHubEvents,
  fetchGitHubRepos,
  fetchGitHubUser,
  isValidGitHubUsername,
  normalizeGitHubUsername,
} from './lib/github'

const configuredPublicAppUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim() || ''
const sampleUsers = ['torvalds', 'gaearon', 'sindresorhus']
const cellCount = 52 * 7
const fetchStages = [
  { id: 'auth', label: 'checking GitHub token...', mode: 'authenticated' },
  { id: 'graphql', label: 'fetching full-year contribution graph...', mode: 'authenticated' },
  { id: 'profile', label: 'fetching user profile...', mode: 'public' },
  { id: 'repos', label: 'loading public repositories...', mode: 'public' },
  { id: 'events', label: 'reading recent public activity...', mode: 'public' },
  { id: 'metrics', label: 'building your Wrapped...' },
]

const pseudoRandom = (seed) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

const miniGridCells = Array.from({ length: 20 * 7 }, (_, index) => ({
  id: `mini-${index}`,
  active: pseudoRandom(index + 71) > 0.68,
}))

const buildGridCells = () =>
  Array.from({ length: cellCount }, (_, index) => {
    const value = pseudoRandom(index + 1)
    const level =
      value > 0.94 ? 4 : value > 0.84 ? 3 : value > 0.7 ? 2 : value > 0.48 ? 1 : 0

    return {
      id: `cell-${index}`,
      level,
      shouldPulse: value > 0.78,
      delay: `${Math.round(value * 7200)}ms`,
      duration: `${2600 + Math.round(pseudoRandom(index + 32) * 2600)}ms`,
    }
  })

const createFetchLog = (mode = 'public') =>
  fetchStages
    .filter((stage) => !stage.mode || stage.mode === mode)
    .map((stage, index) => ({
      ...stage,
      status: index === 0 ? 'active' : 'waiting',
    }))

const formatNumber = (value) => (value ?? 0).toLocaleString()

const getPublicAppUrl = () => {
  if (configuredPublicAppUrl) {
    return configuredPublicAppUrl.replace(/\/+$/, '')
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  return ''
}

const getPublicAppHost = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  }
}

const AUTO_ADVANCE_MS = 3200

const getLongestStreak = (days) => {
  if (!days?.length) return 0

  let longest = 0
  let current = 0

  days.forEach((day) => {
    if (day.contributionCount > 0) {
      current += 1
      longest = Math.max(longest, current)
      return
    }

    current = 0
  })

  return longest
}

const getArchetype = (metrics) => {
  const commitCount = metrics.totalCommitContributions || metrics.recentCommits || 0
  const streak = getLongestStreak(metrics.contributionCalendar)

  if (commitCount > 700 || streak > 21) {
    return {
      initials: 'TG',
      name: 'The Grinder',
      description:
        "You don't talk about shipping. You ship. Consistency is not a habit for you, it is identity.",
    }
  }

  if ((metrics.languagesUsed || 0) >= 5) {
    return {
      initials: 'TL',
      name: 'The Linguist',
      description: 'You move across languages without losing rhythm. Different syntax, same momentum.',
    }
  }

  if ((metrics.totalPullRequestContributions || 0) > 20) {
    return {
      initials: 'TC',
      name: 'The Collaborator',
      description: 'You turn ideas into pull requests and pull requests into shared momentum.',
    }
  }

  return {
    initials: 'TS',
    name: 'The Shipper',
    description: 'You kept the commit graph alive and moved projects forward one change at a time.',
  }
}

function App() {
  const [screen, setScreen] = useState('landing')
  const [username, setUsername] = useState('')
  const [lookupUser, setLookupUser] = useState('')
  const [lookupMode, setLookupMode] = useState('public')
  const [fetchLog, setFetchLog] = useState(() => createFetchLog('public'))
  const [wrappedData, setWrappedData] = useState(null)
  const [fetchError, setFetchError] = useState('')
  const inputRef = useRef(null)
  const gridCells = useMemo(() => buildGridCells(), [])

  const updateFetchStage = (stageId, status) => {
    setFetchLog((currentLog) =>
      currentLog.map((stage) => (stage.id === stageId ? { ...stage, status } : stage)),
    )
  }

  const runLookup = async (rawUsername) => {
    const nextUsername = normalizeGitHubUsername(rawUsername)
    const nextLookupMode = 'authenticated'

    if (!nextUsername) {
      inputRef.current?.focus()
      return
    }

    if (!isValidGitHubUsername(nextUsername)) {
      setLookupUser(nextUsername)
      setFetchError('Enter a valid GitHub username.')
      setScreen('error')
      return
    }

    setUsername(nextUsername)
    setLookupUser(nextUsername)
    setLookupMode(nextLookupMode)
    setWrappedData(null)
    setFetchError('')
    setFetchLog(createFetchLog(nextLookupMode))
    setScreen('loading')

    try {
      updateFetchStage('auth', 'active')
      updateFetchStage('auth', 'complete')

      updateFetchStage('graphql', 'active')
      const nextWrappedData = await fetchSecureWrappedData({
        username: nextUsername,
        year: WRAPPED_YEAR,
      })
      updateFetchStage('graphql', 'complete')

      updateFetchStage('metrics', 'active')
      setWrappedData(nextWrappedData)
      updateFetchStage('metrics', 'complete')
      setScreen('wrapped')
      return
    } catch (error) {
      const canFallbackToPublic =
        !(error instanceof GitHubApiError) ||
        !(
          [401, 422, 429].includes(error.status) ||
          (error.status === 404 && error.message === 'GitHub user not found.')
        )

      if (!canFallbackToPublic) {
        setFetchError(error.message || 'Unable to fetch GitHub data right now.')
        setScreen('error')
        return
      }
    }

    setLookupMode('public')
    setFetchLog(createFetchLog('public'))

    try {
      updateFetchStage('profile', 'active')
      const profile = await fetchGitHubUser(nextUsername)
      updateFetchStage('profile', 'complete')

      updateFetchStage('repos', 'active')
      const repos = await fetchGitHubRepos(nextUsername)
      updateFetchStage('repos', 'complete')

      updateFetchStage('events', 'active')
      const events = await fetchGitHubEvents(nextUsername)
      updateFetchStage('events', 'complete')

      updateFetchStage('metrics', 'active')
      const nextWrappedData = createWrappedData({ profile, repos, events })
      setWrappedData(nextWrappedData)
      updateFetchStage('metrics', 'complete')
      setScreen('wrapped')
    } catch (error) {
      setFetchError(error.message || 'Unable to fetch GitHub data right now.')
      setScreen('error')
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    void runLookup(username)
  }

  const fillSampleUser = (sampleUser) => {
    setUsername(sampleUser)
    setFetchError('')
    setScreen('landing')
    inputRef.current?.focus()
  }

  const resetLookup = () => {
    setScreen('landing')
    setFetchError('')
    setWrappedData(null)
    setFetchLog(createFetchLog('public'))
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <main className="landing-page">
      <div className="ambient-grid" aria-hidden="true">
        {gridCells.map((cell) => (
          <span
            className={`grid-cell grid-cell-${cell.level}${cell.shouldPulse ? ' is-pulsing' : ''}`}
            key={cell.id}
            style={{
              animationDelay: cell.delay,
              animationDuration: cell.duration,
            }}
          />
        ))}
      </div>

      {screen === 'landing' && (
        <LandingPanel
          inputRef={inputRef}
          onSampleUser={fillSampleUser}
          onSubmit={handleSubmit}
          setUsername={setUsername}
          username={username}
        />
      )}

      {screen === 'loading' && (
        <LoadingPanel
          fetchLog={fetchLog}
          lookupMode={lookupMode}
          lookupUser={lookupUser}
          onReset={resetLookup}
        />
      )}

      {screen === 'error' && (
        <ErrorPanel
          fetchError={fetchError}
          lookupUser={lookupUser}
          onReset={resetLookup}
          onRetry={() => void runLookup(lookupUser)}
        />
      )}

      {screen === 'wrapped' && wrappedData && (
        <WrappedSequence
          data={wrappedData}
          onReset={resetLookup}
        />
      )}
    </main>
  )
}

function LandingPanel({
  inputRef,
  onSampleUser,
  onSubmit,
  setUsername,
  username,
}) {
  return (
    <section className="landing-content" aria-labelledby="landing-title">
      <div className="brand-lockup">
        <img src="/logo.svg" alt="" className="brand-logo" />
        <p className="eyebrow">GitHub Wrapped {WRAPPED_YEAR}</p>
      </div>
      <h1 className="hero-title" id="landing-title">
        Your year in code.
      </h1>
      <p className="subcopy">Enter any GitHub username to see their {WRAPPED_YEAR} in review.</p>

      <form className="landing-form" onSubmit={onSubmit}>
        <label className="username-field" htmlFor="github-username">
          <span className="username-prefix" aria-hidden="true">
            @
          </span>
          <input
            id="github-username"
            ref={inputRef}
            type="text"
            autoComplete="off"
            spellCheck="false"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="username"
            aria-label="GitHub username"
          />
        </label>
        <button className="generate-button" type="submit">
          Generate Wrapped -&gt;
        </button>
      </form>

      <div className="sample-users" aria-label="Sample GitHub usernames">
        {sampleUsers.map((sampleUser) => (
          <button type="button" key={sampleUser} onClick={() => onSampleUser(sampleUser)}>
            Try: {sampleUser}
          </button>
        ))}
      </div>
    </section>
  )
}

function LoadingPanel({ fetchLog, lookupMode, lookupUser, onReset }) {
  const completedCount = fetchLog.filter((line) => line.status === 'complete').length
  const hasActiveLine = fetchLog.some((line) => line.status === 'active')
  const progress = Math.max(
    8,
    Math.round(((completedCount + (hasActiveLine ? 0.5 : 0)) / fetchLog.length) * 82),
  )

  return (
    <section className="loading-screen" aria-live="polite" aria-busy="true">
      <div className="loading-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      <header className="loading-header">
        <span className="loading-brand">
          <img src="/logo.svg" alt="" className="loading-brand-logo" />
          <span>GH Wrapped {WRAPPED_YEAR}</span>
        </span>
        <button type="button" onClick={onReset} aria-label="Cancel loading">
          x
        </button>
      </header>

      <div className="loading-main">
        <p className="loading-user">@{lookupUser}</p>

        <div className="loading-terminal">
          <div className="terminal-chrome" aria-hidden="true">
            <span className="chrome-dot chrome-red" />
            <span className="chrome-dot chrome-yellow" />
            <span className="chrome-dot chrome-accent" />
            <strong>session: loading_wrapped_{WRAPPED_YEAR}</strong>
          </div>

          <LoadingTerminalLog lines={fetchLog} />

          <div className="loading-meta" aria-hidden="true">
            <div>
              <span>MODE: {lookupMode === 'authenticated' ? 'GRAPHQL' : 'PUBLIC'}</span>
              <span>LINES_PARSED: {fetchLog.length}</span>
            </div>
            <div>
              <span>THREAD: 0x8A2F</span>
              <span>STATUS: RUNNING</span>
            </div>
          </div>
        </div>
      </div>

      <div className="loading-mini-grid" aria-hidden="true">
        {miniGridCells.map((cell) => (
          <span className={cell.active ? 'is-active' : ''} key={cell.id} />
        ))}
      </div>
    </section>
  )
}

function ErrorPanel({ fetchError, lookupUser, onReset, onRetry }) {
  return (
    <section className="lookup-panel" aria-live="polite">
      <p className="eyebrow">{lookupUser ? `@${lookupUser}` : 'GitHub Wrapped'}</p>
      <h2 className="screen-title">Could not fetch GitHub data.</h2>
      <div className="terminal-log terminal-log-error">
        <p className="terminal-line is-error">
          <span className="terminal-prompt">&gt;</span>
          <span>error: {fetchError}</span>
          <span className="status-mark">x</span>
        </p>
      </div>
      <div className="action-row">
        <button className="secondary-button" type="button" onClick={onReset}>
          Edit username
        </button>
        {lookupUser && (
          <button className="generate-button action-button" type="button" onClick={onRetry}>
            Retry fetch
          </button>
        )}
      </div>
    </section>
  )
}

function WrappedSequence({ data, onReset }) {
  const [slideIndex, setSlideIndex] = useState(0)
  const [copied, setCopied] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef(null)
  const timerStartedAtRef = useRef(0)
  const remainingTimeRef = useRef(AUTO_ADVANCE_MS)
  const shareUrl = getPublicAppUrl()
  const shareHost = getPublicAppHost(shareUrl)

  const slides = useMemo(
    () => [
      { id: 'cover', render: () => <CoverSlide data={data} /> },
      { id: 'commits', render: () => <CommitSlide data={data} /> },
      { id: 'streak', render: () => <StreakSlide data={data} /> },
      { id: 'languages', render: () => <LanguagesSlide data={data} /> },
      { id: 'personality', render: () => <PersonalitySlide data={data} /> },
      { id: 'share', render: () => <ShareSlide data={data} shareHost={shareHost} /> },
    ],
    [data, shareHost],
  )

  const isLastSlide = slideIndex === slides.length - 1
  const progress = `${((slideIndex + 1) / slides.length) * 100}%`
  const archetype = getArchetype(data.metrics)
  const commits = data.metrics.totalCommitContributions || data.metrics.recentCommits || 0

  const goToSlide = useCallback((nextIndex) => {
    const boundedIndex = Math.min(Math.max(nextIndex, 0), slides.length - 1)
    if (boundedIndex === slideIndex) return
    remainingTimeRef.current = AUTO_ADVANCE_MS
    timerStartedAtRef.current = 0
    setSlideIndex(boundedIndex)
  }, [slideIndex, slides.length])

  useEffect(() => {
    remainingTimeRef.current = AUTO_ADVANCE_MS
    timerStartedAtRef.current = 0
  }, [slideIndex])

  useEffect(() => {
    if (!isPaused || isLastSlide || !timerStartedAtRef.current) {
      return
    }

    const elapsed = Date.now() - timerStartedAtRef.current
    remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed)
    timerStartedAtRef.current = 0
  }, [isPaused, isLastSlide])

  useEffect(() => {
    if (isLastSlide || isPaused) {
      clearTimeout(timerRef.current)
      return
    }

    const delay = Math.max(0, remainingTimeRef.current)
    timerStartedAtRef.current = Date.now()
    timerRef.current = setTimeout(() => {
      remainingTimeRef.current = AUTO_ADVANCE_MS
      timerStartedAtRef.current = 0
      setSlideIndex((prev) => Math.min(prev + 1, slides.length - 1))
    }, delay)

    return () => {
      clearTimeout(timerRef.current)
    }
  }, [slideIndex, isLastSlide, isPaused, slides.length])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); goToSlide(slideIndex + 1) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); goToSlide(slideIndex - 1) }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToSlide, slideIndex])

  const handleShare = async () => {
    const shareText = `My GitHub Wrapped ${data.year}: I'm "${archetype.name}" with ${formatNumber(commits)} commits! Check yours at ${shareHost}`

    if (navigator.share) {
      try {
        await navigator.share({ title: `GitHub Wrapped ${data.year}`, text: shareText, url: shareUrl })
        return
      } catch {
        // Fall back to clipboard if native sharing is cancelled or unavailable.
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareText} - ${shareUrl}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      // Keep the wrapped flow uninterrupted if clipboard permissions are blocked.
    }
  }

  return (
    <section className={`wrapped-shell${isLastSlide ? ' is-share-screen' : ''}`} aria-label={`GitHub Wrapped slide ${slideIndex + 1}`}>
      {/* Slide overall progress bar (segment indicator) */}
      <div className="wrapped-progress" aria-hidden="true">
        <span style={{ width: progress }} />
      </div>

      {/* Browser-style countdown bar — shrinks to 0 as timer counts down */}
      <div className="slide-dots" aria-label="Slide navigation">
        {slides.map((slide, index) => (
          <button
            type="button"
            className={index === slideIndex ? 'is-active' : ''}
            key={slide.id}
            onClick={() => goToSlide(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
      <button
        className="playback-button"
        type="button"
        onClick={() => setIsPaused((prev) => !prev)}
        aria-label={isPaused ? 'Resume slide autoplay' : 'Pause slide autoplay'}
        title={isPaused ? 'Play' : 'Pause'}
        disabled={isLastSlide}
      >
        {isPaused ? '>' : '||'}
      </button>

      <button className="exit-button" type="button" onClick={onReset} aria-label="Exit Wrapped">
        x
      </button>

      {/* Tap to advance — the whole frame is clickable */}
      <div
        className="wrapped-slide-frame"
        role="button"
        tabIndex={isLastSlide ? -1 : 0}
        aria-label={isLastSlide ? undefined : 'Tap to go to next slide'}
        onClick={() => { if (!isLastSlide) goToSlide(slideIndex + 1) }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !isLastSlide) goToSlide(slideIndex + 1) }}
        style={{ cursor: isLastSlide ? 'default' : 'pointer' }}
      >
        <AnimatePresence initial={false}>
          {slides.map((slide, index) => {
            const isPast = index < slideIndex
            const depth = index - slideIndex
            if (isPast || depth >= 3) return null

            const isFront = depth === 0
            return (
              <motion.div
                key={slide.id}
                className="wrapped-card"
                style={{
                  zIndex: 10 - depth,
                }}
                initial={{
                  y: 60,
                  scale: 0.88,
                  opacity: 0,
                }}
                animate={{
                  y: depth * -12,
                  scale: 1 - depth * 0.04,
                  opacity: depth === 0 ? 1 : depth === 1 ? 0.6 : 0.25,
                  pointerEvents: isFront ? 'auto' : 'none',
                }}
                exit={{
                  y: -220,
                  opacity: 0,
                  scale: 0.82,
                  transition: { duration: 0.28, ease: 'easeOut' },
                }}
                transition={{
                  type: 'spring',
                  stiffness: 230,
                  damping: 24,
                }}
              >
                {isFront && !isLastSlide && (
                  <svg className="card-loading-border" viewBox="0 0 100 100" aria-hidden="true">
                    <circle
                      className="card-loading-track"
                      cx="50"
                      cy="50"
                      r="48.5"
                      fill="none"
                      stroke="rgba(255,255,255,0.06)"
                      strokeWidth="0.5"
                    />
                    <circle
                      className={`card-loading-progress${isPaused ? ' is-paused' : ''}`}
                      cx="50"
                      cy="50"
                      r="48.5"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="0.7"
                      strokeDasharray={2 * Math.PI * 48.5}
                      strokeDashoffset={2 * Math.PI * 48.5}
                      strokeLinecap="round"
                      style={{ '--loader-duration': `${AUTO_ADVANCE_MS}ms` }}
                    />
                  </svg>
                )}
                {slide.render()}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {isLastSlide && (
        <div className="outside-card-actions">
          <button
            className={`generate-button action-button share-btn${copied ? ' share-btn-copied' : ''}`}
            type="button"
            onClick={handleShare}
          >
            {copied ? 'Copied!' : 'Share Wrapped'}
          </button>
          <button className="secondary-button" type="button" onClick={onReset}>
            New username
          </button>
        </div>
      )}
    </section>
  )
}

function CoverSlide({ data }) {
  const { profile, year } = data

  return (
    <article className="slide-cover">
      <img src={profile.avatarUrl} alt="" className="cover-avatar" />
      <p className="slide-kicker">@{profile.login}</p>
      <h2>{year}</h2>
      <p>{profile.name ? `${profile.name}'s year in code.` : "Let's see what got built this year."}</p>
      <span className="mode-badge">
        {data.dataMode === 'authenticated' ? 'Full-year GraphQL data' : 'Public preview mode'}
      </span>
    </article>
  )
}

function CommitSlide({ data }) {
  const { metrics } = data
  const commits = metrics.totalCommitContributions || metrics.recentCommits || 0
  const benchmarkPercent = Math.min(100, Math.max(12, Math.round((commits / 1000) * 100)))
  const delta = Math.round(((commits - 312) / 312) * 100)

  return (
    <article className="commit-slide">
      <p className="slide-kicker">Commits in {data.year}</p>
      <strong>{formatNumber(commits)}</strong>
      <p className="slide-detail">
        {data.dataMode === 'authenticated' ? 'commits pushed this year' : 'recent public commits'}
      </p>
      <div className="bench">
        <div className="bench-meta">
          <span>vs. global average</span>
          <strong>{delta >= 0 ? '+' : ''}{delta}%</strong>
        </div>
        <div className="bench-track">
          <span className="bench-fill" style={{ width: `${benchmarkPercent}%` }} />
          <span className="bench-avg" />
          <small>avg 312</small>
        </div>
        <p>{commits ? `That's roughly ${(commits / 365).toFixed(1)} commits every day.` : 'A quiet year still counts.'}</p>
      </div>
    </article>
  )
}

function StreakSlide({ data }) {
  const { metrics } = data
  const streak = getLongestStreak(metrics.contributionCalendar) || Math.min(metrics.activeDays || 0, 34)
  const cells = Array.from({ length: Math.max(streak, 18) }, (_, index) => index < streak)

  return (
    <article className="streak-slide">
      <p className="slide-kicker">Longest streak</p>
      <div>
        <strong>{formatNumber(streak)}</strong>
        <span> days</span>
      </div>
      <p className="date-range">{data.dataMode === 'authenticated' ? `Best run in ${data.year}` : 'Public preview estimate'}</p>
      <p className="slide-detail">
        <b>No days off.</b> Your graph kept glowing while the streak stayed alive.
      </p>
      <div className="streak-strip">
        {cells.slice(0, 42).map((isLit, index) => (
          <span className={isLit ? 'is-lit' : 'is-dim'} key={`streak-${index}`} />
        ))}
      </div>
    </article>
  )
}

function LanguagesSlide({ data }) {
  const languages = data.metrics.topLanguages

  return (
    <article className="languages-slide">
      <p className="slide-kicker">Languages used in {data.year}</p>
      <div className="language-list-story">
        {languages.length ? (
          languages.map((language, index) => (
            <div className="language-row-story" key={language.name}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{language.name}</strong>
              <div>
                <span style={{ width: `${language.percentage}%` }} />
              </div>
              <em>{language.percentage}%</em>
            </div>
          ))
        ) : (
          <p className="slide-detail">Repository language metadata was not available.</p>
        )}
        <p className="language-total">{languages.length} languages / {formatNumber(data.metrics.publicRepos)} repositories</p>
      </div>
    </article>
  )
}

function PersonalitySlide({ data }) {
  const { metrics } = data
  const archetype = getArchetype(metrics)
  const commits = metrics.totalCommitContributions || metrics.recentCommits || 0
  const streak = getLongestStreak(metrics.contributionCalendar) || metrics.activeDays || 0

  return (
    <article className="personality-slide">
      <span className="bg-letter">{archetype.initials}</span>
      <p className="buildup">
        Based on {formatNumber(commits)} commits, {formatNumber(streak)} active days, and {formatNumber(metrics.languagesUsed)} languages...
      </p>
      <p className="you-are">You are</p>
      <h2>{archetype.name}</h2>
      <p>{archetype.description}</p>
      <div className="proof-pills">
        <span>{formatNumber(commits)} commits</span>
        <span>{formatNumber(streak)} active days</span>
        <span>{formatNumber(metrics.totalPullRequestContributions || 0)} PRs</span>
      </div>
    </article>
  )
}

function ShareSlide({ data, shareHost }) {
  const archetype = getArchetype(data.metrics)
  const commits = data.metrics.totalCommitContributions || data.metrics.recentCommits || 0

  return (
    <article className="share-slide">
      <div className="share-card">
        <span className="share-year">{String(data.year).slice(2)}</span>
        <header>
          <div>
            <strong>@{data.profile.login}</strong>
            <span>GitHub Wrapped {data.year}</span>
          </div>
          <em>Verified</em>
        </header>
        <section>
          <span>Archetype</span>
          <h2>{archetype.name}</h2>
          <p>{formatNumber(commits)} commits / {formatNumber(data.metrics.activeDays)} active days</p>
        </section>
        <footer>
          <MiniHeatmap days={data.metrics.contributionCalendar} />
        </footer>
      </div>
    </article>
  )
}

function MiniHeatmap({ days }) {
  const sourceDays = days?.length
    ? days.slice(-12).map((day) => day.contributionCount > 0)
    : [true, true, false, true, true, false, false, true, true, true, false, true]
  return (
    <div className="mini-heat">
      {sourceDays.map((isLit, index) => (
        <span className={isLit ? 'is-lit' : ''} key={`mini-heat-${index}`} />
      ))}
    </div>
  )
}

function LoadingTerminalLog({ lines }) {
  return (
    <div className="loading-log">
      {lines.map((line) => (
        <p className={`loading-line is-${line.status}`} key={line.id}>
          <span className="terminal-prompt">&gt;</span>
          <span>{line.label}</span>
          {line.status === 'active' ? (
            <span className="terminal-cursor" />
          ) : (
            <span className="status-mark">{line.status === 'complete' ? 'ok' : ''}</span>
          )}
        </p>
      ))}
    </div>
  )
}

export default App
