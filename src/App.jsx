import { useMemo, useRef, useState } from 'react'
import {
  WRAPPED_YEAR,
  createWrappedData,
  createWrappedDataFromGraphQL,
  fetchGitHubEvents,
  fetchGitHubRepos,
  fetchGitHubUser,
  fetchGitHubWrappedGraphQL,
  isValidGitHubUsername,
  normalizeGitHubUsername,
} from './lib/github'

const configuredGitHubToken = import.meta.env.VITE_GITHUB_TOKEN?.trim() || ''
const hasConfiguredGitHubToken = Boolean(configuredGitHubToken)
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

function App() {
  const [screen, setScreen] = useState('landing')
  const [username, setUsername] = useState('')
  const [tokenInput, setTokenInput] = useState('')
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
    const githubToken = configuredGitHubToken || tokenInput.trim()
    const nextLookupMode = githubToken ? 'authenticated' : 'public'

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
      if (nextLookupMode === 'authenticated') {
        updateFetchStage('auth', 'active')
        updateFetchStage('auth', 'complete')

        updateFetchStage('graphql', 'active')
        const graphqlData = await fetchGitHubWrappedGraphQL({
          username: nextUsername,
          token: githubToken,
        })
        updateFetchStage('graphql', 'complete')

        updateFetchStage('metrics', 'active')
        const nextWrappedData = createWrappedDataFromGraphQL({ graphqlData })
        setWrappedData(nextWrappedData)
        updateFetchStage('metrics', 'complete')
        setScreen('wrapped')
        return
      }

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
          setTokenInput={setTokenInput}
          setUsername={setUsername}
          tokenInput={tokenInput}
          username={username}
        />
      )}

      {screen === 'loading' && (
        <LoadingPanel fetchLog={fetchLog} lookupMode={lookupMode} lookupUser={lookupUser} />
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
          onRefresh={() => void runLookup(lookupUser)}
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
  setTokenInput,
  setUsername,
  tokenInput,
  username,
}) {
  return (
    <section className="landing-content" aria-labelledby="landing-title">
      <p className="eyebrow">GitHub Wrapped {WRAPPED_YEAR}</p>
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

        <div className="token-panel">
          {hasConfiguredGitHubToken ? (
            <p className="token-status">Authenticated mode enabled from .env.local</p>
          ) : (
            <label className="token-field" htmlFor="github-token">
              <span>GitHub token for full-year data</span>
              <input
                id="github-token"
                type="password"
                autoComplete="off"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder="optional local token"
                aria-label="GitHub personal access token"
              />
            </label>
          )}
          <p className="token-helper">
            Without a token, GitHub only returns public profile, repos, and recent activity.
          </p>
        </div>

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

function LoadingPanel({ fetchLog, lookupMode, lookupUser }) {
  return (
    <section className="lookup-panel" aria-live="polite" aria-busy="true">
      <p className="eyebrow">@{lookupUser}</p>
      <h2 className="screen-title">
        {lookupMode === 'authenticated' ? 'Building full Wrapped.' : 'Fetching public data.'}
      </h2>
      <TerminalLog lines={fetchLog} />
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

function WrappedSequence({ data, onRefresh, onReset }) {
  const [slideIndex, setSlideIndex] = useState(0)
  const slides = useMemo(
    () => [
      { id: 'cover', render: () => <CoverSlide data={data} /> },
      { id: 'contributions', render: () => <TotalContributionsSlide data={data} /> },
      { id: 'commits', render: () => <CommitSlide data={data} /> },
      { id: 'heatmap', render: () => <HeatmapSlide data={data} /> },
      { id: 'languages', render: () => <LanguagesSlide data={data} /> },
      { id: 'repos', render: () => <RepositoriesSlide data={data} /> },
      { id: 'summary', render: () => <SummarySlide data={data} onRefresh={onRefresh} onReset={onReset} /> },
    ],
    [data, onRefresh, onReset],
  )
  const currentSlide = slides[slideIndex]
  const progress = `${((slideIndex + 1) / slides.length) * 100}%`
  const canGoBack = slideIndex > 0
  const canGoNext = slideIndex < slides.length - 1

  return (
    <section className="wrapped-shell" aria-label={`GitHub Wrapped slide ${slideIndex + 1}`}>
      <div className="wrapped-progress" aria-hidden="true">
        <span style={{ width: progress }} />
      </div>

      <div className="slide-dots" aria-label="Slide navigation">
        {slides.map((slide, index) => (
          <button
            type="button"
            className={index === slideIndex ? 'is-active' : ''}
            key={slide.id}
            onClick={() => setSlideIndex(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      <button className="exit-button" type="button" onClick={onReset} aria-label="Exit Wrapped">
        x
      </button>

      <div className="wrapped-slide" key={currentSlide.id}>
        {currentSlide.render()}
      </div>

      <div className="slide-controls">
        <button className="secondary-button" type="button" onClick={() => setSlideIndex(slideIndex - 1)} disabled={!canGoBack}>
          Back
        </button>
        <button className="generate-button action-button" type="button" onClick={() => setSlideIndex(slideIndex + 1)} disabled={!canGoNext}>
          {canGoNext ? 'Next slide' : 'Complete'}
        </button>
      </div>
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

function TotalContributionsSlide({ data }) {
  const { metrics } = data

  return (
    <BigStatSlide
      kicker="You made"
      value={metrics.totalContributions}
      label={`contributions in ${data.year}`}
      detail={
        data.dataMode === 'authenticated'
          ? `${formatNumber(metrics.activeDays)} active days across the year.`
          : 'Public preview mode uses recent activity only.'
      }
    />
  )
}

function CommitSlide({ data }) {
  const { metrics } = data

  return (
    <BigStatSlide
      kicker="Commit energy"
      value={metrics.totalCommitContributions}
      label={data.dataMode === 'authenticated' ? 'commit contributions' : 'recent public commits'}
      detail={`${formatNumber(metrics.totalPullRequestContributions)} PRs / ${formatNumber(
        metrics.totalIssueContributions,
      )} issues / ${formatNumber(metrics.totalRepositoryContributions)} repos created.`}
    />
  )
}

function HeatmapSlide({ data }) {
  const { metrics } = data

  return (
    <article className="slide-layout">
      <p className="slide-kicker">Your year</p>
      <h2>Contribution heatmap</h2>
      <WrappedHeatmap days={metrics.contributionCalendar} />
      <p className="slide-detail">
        {metrics.contributionCalendar.length
          ? `${formatNumber(metrics.activeDays)} days with at least one contribution.`
          : 'Add a token to unlock the full-year contribution calendar.'}
      </p>
    </article>
  )
}

function LanguagesSlide({ data }) {
  const languages = data.metrics.topLanguages

  return (
    <article className="slide-layout">
      <p className="slide-kicker">Your languages</p>
      <h2>{languages[0]?.name ?? 'No language detected'}</h2>
      <div className="language-bars">
        {languages.length ? (
          languages.map((language) => (
            <div className="language-bar-row" key={language.name}>
              <div>
                <span>{language.name}</span>
                <strong>{language.percentage}%</strong>
              </div>
              <span className="language-track">
                <span style={{ width: `${language.percentage}%` }} />
              </span>
            </div>
          ))
        ) : (
          <p className="slide-detail">Repository language metadata was not available.</p>
        )}
      </div>
    </article>
  )
}

function RepositoriesSlide({ data }) {
  return (
    <article className="slide-layout">
      <p className="slide-kicker">Top repositories</p>
      <h2>{data.metrics.topRepositories[0]?.name ?? 'No repos found'}</h2>
      <div className="repo-card-stack">
        {data.metrics.topRepositories.map((repo, index) => (
          <a className="wrapped-repo-card" href={repo.url} key={repo.id} target="_blank" rel="noreferrer">
            <span>#{index + 1}</span>
            <strong>{repo.name}</strong>
            <small>
              {repo.contributions != null
                ? `${formatNumber(repo.contributions)} commits`
                : `${formatNumber(repo.stars)} stars / ${formatNumber(repo.forks)} forks`}
            </small>
          </a>
        ))}
      </div>
    </article>
  )
}

function SummarySlide({ data, onRefresh, onReset }) {
  const { metrics } = data

  return (
    <article className="slide-layout">
      <p className="slide-kicker">By the numbers</p>
      <h2>Wrapped ready.</h2>
      <div className="summary-grid">
        <MetricTile value={metrics.totalContributions} label="contributions" />
        <MetricTile value={metrics.totalCommitContributions} label="commits" />
        <MetricTile value={metrics.totalPullRequestContributions} label="pull requests" />
        <MetricTile value={metrics.totalIssueContributions} label="issues" />
        <MetricTile value={metrics.publicRepos} label="public repos" />
        <MetricTile value={metrics.languagesUsed} label="languages" />
      </div>
      <p className="coverage-note">{data.coverage}</p>
      <div className="action-row">
        <button className="secondary-button" type="button" onClick={onReset}>
          New username
        </button>
        <button className="generate-button action-button" type="button" onClick={onRefresh}>
          Refresh data
        </button>
      </div>
    </article>
  )
}

function BigStatSlide({ detail, kicker, label, value }) {
  return (
    <article className="big-stat-slide">
      <p className="slide-kicker">{kicker}</p>
      <strong>{formatNumber(value)}</strong>
      <h2>{label}</h2>
      <p>{detail}</p>
    </article>
  )
}

function WrappedHeatmap({ days }) {
  if (!days.length) {
    return (
      <div className="heatmap-empty">
        <span>GraphQL token required for full-year calendar</span>
      </div>
    )
  }

  const maxCount = Math.max(...days.map((day) => day.contributionCount), 1)

  return (
    <div className="wrapped-heatmap" aria-label="Contribution calendar">
      {days.map((day) => {
        const intensity = Math.ceil((day.contributionCount / maxCount) * 4)

        return (
          <span
            className={`heatmap-cell heatmap-${intensity}`}
            key={day.date}
            title={`${day.date}: ${day.contributionCount} contributions`}
          />
        )
      })}
    </div>
  )
}

function MetricTile({ value, label }) {
  return (
    <div className="metric-tile">
      <strong>{formatNumber(value)}</strong>
      <span>{label}</span>
    </div>
  )
}

function TerminalLog({ lines }) {
  return (
    <div className="terminal-log">
      {lines.map((line) => (
        <p className={`terminal-line is-${line.status}`} key={line.id}>
          <span className="terminal-prompt">&gt;</span>
          <span>{line.label}</span>
          <span className="status-mark">{line.status === 'complete' ? 'ok' : '_'}</span>
        </p>
      ))}
    </div>
  )
}

export default App
