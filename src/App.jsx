import { useMemo, useRef, useState } from 'react'

const sampleUsers = ['torvalds', 'gaearon', 'sindresorhus']
const cellCount = 52 * 7

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

function App() {
  const [username, setUsername] = useState('')
  const [submittedUser, setSubmittedUser] = useState('')
  const inputRef = useRef(null)
  const gridCells = useMemo(() => buildGridCells(), [])

  const handleSubmit = (event) => {
    event.preventDefault()
    const nextUsername = username.trim().replace(/^@+/, '')

    if (!nextUsername) {
      inputRef.current?.focus()
      return
    }

    setUsername(nextUsername)
    setSubmittedUser(nextUsername)
  }

  const fillSampleUser = (sampleUser) => {
    setUsername(sampleUser)
    setSubmittedUser('')
    inputRef.current?.focus()
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

      <section className="landing-content" aria-labelledby="landing-title">
        <p className="eyebrow">GitHub Wrapped 2026</p>
        <h1 id="landing-title">Your year in code.</h1>
        <p className="subcopy">Enter any GitHub username to see their 2026 in review.</p>

        <form className="landing-form" onSubmit={handleSubmit}>
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
              onChange={(event) => {
                setUsername(event.target.value)
                setSubmittedUser('')
              }}
              placeholder="username"
              aria-label="GitHub username"
            />
          </label>

          <button className="generate-button" type="submit">
            Generate Wrapped -&gt;
          </button>

          <p className="sr-only" role="status" aria-live="polite">
            {submittedUser ? `Ready to generate GitHub Wrapped for @${submittedUser}.` : ''}
          </p>
        </form>

        <div className="sample-users" aria-label="Sample GitHub usernames">
          {sampleUsers.map((sampleUser) => (
            <button type="button" key={sampleUser} onClick={() => fillSampleUser(sampleUser)}>
              Try: {sampleUser}
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
