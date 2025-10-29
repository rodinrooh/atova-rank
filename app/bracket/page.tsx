'use client'

import { useEffect, useState } from 'react'

interface VC {
  id: string
  name: string
  colorHex: string
  conference: string
  currentCp: number
}

interface Matchup {
  id: string
  matchNumber: number
  round: number
  seasonId: string
  startedAt: string
  endsAt: string
  vcA: VC
  vcB: VC
  active: boolean
  finished: boolean
  winner?: VC
  finalCpA?: number
  finalCpB?: number
  winner_id?: string
}

interface TournamentData {
  currentMatchup: Matchup | null
  allMatchups: Matchup[]
}

export default function BracketPage() {
  const [tournamentData, setTournamentData] = useState<TournamentData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTournamentData()
    const interval = setInterval(loadTournamentData, 5000) // Update every 5 seconds
    return () => clearInterval(interval)
  }, [])

  const loadTournamentData = async () => {
    try {
      // Get current matchup
      const currentResponse = await fetch('/api/current-matchup')
      const currentData = await currentResponse.json()
      
      // Get all matchups for this season
      const allResponse = await fetch('/api/tournament-bracket')
      const allData = await allResponse.json()
      
      setTournamentData({
        currentMatchup: currentData.ok ? currentData.matchup : null,
        allMatchups: allData.ok ? allData.matchups : []
      })
    } catch (error) {
      console.error('Error loading tournament data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading tournament bracket...</p>
        </div>
      </div>
    )
  }

  if (!tournamentData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">No Tournament Active</h1>
          <p className="text-gray-600">No active tournament found.</p>
        </div>
      </div>
    )
  }

  const { currentMatchup, allMatchups } = tournamentData

  // Group matchups by round
  const quarterfinals = allMatchups.filter(m => m.round === 1)
  const semifinals = allMatchups.filter(m => m.round === 2)
  const final = allMatchups.filter(m => m.round === 3)

  const getMatchupStatus = (matchup: Matchup) => {
    if (matchup.finished) return 'finished'
    if (matchup.active) {
      // Check if match has expired
      const now = new Date().getTime()
      const endsAt = new Date(matchup.endsAt).getTime()
      if (endsAt <= now) {
        return 'ending' // Match ended, waiting for resolution
      }
      return 'active'
    }
    return 'upcoming'
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 border-green-500 text-green-800'
      case 'ending': return 'bg-yellow-100 border-yellow-500 text-yellow-800'
      case 'finished': return 'bg-gray-100 border-gray-300 text-gray-600'
      case 'upcoming': return 'bg-blue-50 border-blue-200 text-blue-600'
      default: return 'bg-gray-50 border-gray-200 text-gray-500'
    }
  }

  const formatTimeRemaining = (endsAt: string) => {
    const now = new Date()
    const end = new Date(endsAt)
    const diff = end.getTime() - now.getTime()
    
    if (diff <= 0) return 'Ended'
    
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    return `${hours}h ${minutes}m`
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Atova Rank Tournament</h1>
          <p className="text-gray-600">Live Tournament Bracket</p>
        </div>

        {/* Current Matchup Highlight */}
        {currentMatchup && (
          (() => {
            const matchStatus = getMatchupStatus(currentMatchup)
            const isEnding = matchStatus === 'ending'
            
            return (
              <div className="mb-8">
                <div className={`bg-white rounded-lg shadow-lg p-6 border-2 ${isEnding ? 'border-yellow-500' : 'border-green-500'}`}>
                  <div className="text-center mb-4">
                    <h2 className={`text-2xl font-bold ${isEnding ? 'text-yellow-800' : 'text-green-800'}`}>
                      {isEnding ? 'MATCH ENDED' : 'LIVE MATCH'}
                    </h2>
                    <p className={isEnding ? 'text-yellow-600' : 'text-green-600'}>
                      Match #{currentMatchup.matchNumber} • Round {currentMatchup.round}
                    </p>
                    {!isEnding && (
                      <p className="text-sm text-gray-600">
                        {formatTimeRemaining(currentMatchup.endsAt)} remaining
                      </p>
                    )}
                    {isEnding && (
                      <p className="text-sm text-gray-600">
                        Next match starting shortly...
                      </p>
                    )}
                  </div>
              
              <div className="flex justify-center items-center space-x-8">
                <div className="text-center">
                  <div 
                    className="w-16 h-16 rounded-full mx-auto mb-2"
                    style={{ backgroundColor: currentMatchup.vcA.colorHex }}
                  ></div>
                  <h3 className="font-bold text-lg">{currentMatchup.vcA.name}</h3>
                  <p className="text-2xl font-bold text-blue-600">{currentMatchup.vcA.currentCp} CP</p>
                </div>
                
                <div className="text-2xl font-bold text-gray-400">VS</div>
                
                <div className="text-center">
                  <div 
                    className="w-16 h-16 rounded-full mx-auto mb-2"
                    style={{ backgroundColor: currentMatchup.vcB.colorHex }}
                  ></div>
                  <h3 className="font-bold text-lg">{currentMatchup.vcB.name}</h3>
                  <p className="text-2xl font-bold text-blue-600">{currentMatchup.vcB.currentCp} CP</p>
                </div>
              </div>
            </div>
          </div>
            )
          })()
        )}

        {/* Tournament Bracket */}
        <div className="bg-white rounded-lg shadow p-4 max-w-6xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Tournament Bracket</h2>
          </div>

          <div className="bracket-container">
            {/* Left Conference Quarterfinals */}
            <div className="bracket-column">
              <div className="conference-title">Left Conference</div>
              <div className="round-title">Quarterfinals</div>
              <div className="matches">
                {quarterfinals.filter(m => m.vcA.conference === 'left').map((matchup) => {
                  const status = getMatchupStatus(matchup)
                  return (
                    <div key={matchup.id} className={`match ${status}`}>
                      <div className="match-header">
                        <span className="match-num">#{matchup.matchNumber}</span>
                        {status === 'active' && <span className="live">LIVE</span>}
                        {status === 'finished' && (
                          <span className="winner">
                            ✓ {matchup.winner_id === matchup.vcA.id ? matchup.vcA.name : matchup.vcB.name}
                          </span>
                        )}
                      </div>
                      
                      <div className="teams">
                        <div className="team">
                          <div 
                            className="team-color"
                            style={{ backgroundColor: matchup.vcA.colorHex }}
                          ></div>
                          <span className="team-name">{matchup.vcA.name}</span>
                          <span className="team-score">{matchup.vcA.currentCp}</span>
                        </div>
                        
                        <div className="vs">VS</div>
                        
                        <div className="team">
                          <div 
                            className="team-color"
                            style={{ backgroundColor: matchup.vcB.colorHex }}
                          ></div>
                          <span className="team-name">{matchup.vcB.name}</span>
                          <span className="team-score">{matchup.vcB.currentCp}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Left Conference Semifinal */}
            <div className="bracket-column">
              <div className="round-title">Left Semifinal</div>
              <div className="matches">
                {semifinals.filter(m => m.matchNumber === 5).map((matchup) => {
                  const status = getMatchupStatus(matchup)
                  return (
                    <div key={matchup.id} className={`match ${status}`}>
                      <div className="match-header">
                        <span className="match-num">#{matchup.matchNumber}</span>
                        {status === 'active' && <span className="live">LIVE</span>}
                        {status === 'finished' && (
                          <span className="winner">
                            ✓ {matchup.winner_id === matchup.vcA.id ? matchup.vcA.name : matchup.vcB.name}
                          </span>
                        )}
                      </div>
                      
                      {matchup.vcA && matchup.vcB ? (
                        <div className="teams">
                          <div className="team">
                            <div 
                              className="team-color"
                              style={{ backgroundColor: matchup.vcA.colorHex }}
                            ></div>
                            <span className="team-name">{matchup.vcA.name}</span>
                            <span className="team-score">{matchup.vcA.currentCp}</span>
                          </div>
                          
                          <div className="vs">VS</div>
                          
                          <div className="team">
                            <div 
                              className="team-color"
                              style={{ backgroundColor: matchup.vcB.colorHex }}
                            ></div>
                            <span className="team-name">{matchup.vcB.name}</span>
                            <span className="team-score">{matchup.vcB.currentCp}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="waiting">
                          <span>⏳ Waiting...</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Center - Final */}
            <div className="bracket-column final-column">
              <div className="round-title">🏆 Final</div>
              <div className="matches">
                {final.map((matchup) => {
                  const status = getMatchupStatus(matchup)
                  return (
                    <div key={matchup.id} className={`match final ${status}`}>
                      <div className="match-header">
                        <span className="match-num">#{matchup.matchNumber}</span>
                        {status === 'active' && <span className="live">LIVE</span>}
                        {status === 'finished' && (
                          <span className="champion">
                            🏆 {matchup.winner_id === matchup.vcA.id ? matchup.vcA.name : matchup.vcB.name}
                          </span>
                        )}
                      </div>
                      
                      {matchup.vcA && matchup.vcB ? (
                        <div className="teams">
                          <div className="team">
                            <div 
                              className="team-color"
                              style={{ backgroundColor: matchup.vcA.colorHex }}
                            ></div>
                            <span className="team-name">{matchup.vcA.name}</span>
                            <span className="team-score">{matchup.vcA.currentCp}</span>
                          </div>
                          
                          <div className="vs">VS</div>
                          
                          <div className="team">
                            <div 
                              className="team-color"
                              style={{ backgroundColor: matchup.vcB.colorHex }}
                            ></div>
                            <span className="team-name">{matchup.vcB.name}</span>
                            <span className="team-score">{matchup.vcB.currentCp}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="waiting">
                          <span>🏆 Waiting...</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right Conference Semifinal */}
            <div className="bracket-column">
              <div className="round-title">Right Semifinal</div>
              <div className="matches">
                {semifinals.filter(m => m.matchNumber === 6).map((matchup) => {
                  const status = getMatchupStatus(matchup)
                  return (
                    <div key={matchup.id} className={`match ${status}`}>
                      <div className="match-header">
                        <span className="match-num">#{matchup.matchNumber}</span>
                        {status === 'active' && <span className="live">LIVE</span>}
                        {status === 'finished' && (
                          <span className="winner">
                            ✓ {matchup.winner_id === matchup.vcA.id ? matchup.vcA.name : matchup.vcB.name}
                          </span>
                        )}
                      </div>
                      
                      {matchup.vcA && matchup.vcB ? (
                        <div className="teams">
                          <div className="team">
                            <div 
                              className="team-color"
                              style={{ backgroundColor: matchup.vcA.colorHex }}
                            ></div>
                            <span className="team-name">{matchup.vcA.name}</span>
                            <span className="team-score">{matchup.vcA.currentCp}</span>
                          </div>
                          
                          <div className="vs">VS</div>
                          
                          <div className="team">
                            <div 
                              className="team-color"
                              style={{ backgroundColor: matchup.vcB.colorHex }}
                            ></div>
                            <span className="team-name">{matchup.vcB.name}</span>
                            <span className="team-score">{matchup.vcB.currentCp}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="waiting">
                          <span>⏳ Waiting...</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right Conference Quarterfinals */}
            <div className="bracket-column">
              <div className="conference-title">Right Conference</div>
              <div className="round-title">Quarterfinals</div>
              <div className="matches">
                {quarterfinals.filter(m => m.vcA.conference === 'right').map((matchup) => {
                  const status = getMatchupStatus(matchup)
                  return (
                    <div key={matchup.id} className={`match ${status}`}>
                      <div className="match-header">
                        <span className="match-num">#{matchup.matchNumber}</span>
                        {status === 'active' && <span className="live">LIVE</span>}
                        {status === 'finished' && (
                          <span className="winner">
                            ✓ {matchup.winner_id === matchup.vcA.id ? matchup.vcA.name : matchup.vcB.name}
                          </span>
                        )}
                      </div>
                      
                      <div className="teams">
                        <div className="team">
                          <div 
                            className="team-color"
                            style={{ backgroundColor: matchup.vcA.colorHex }}
                          ></div>
                          <span className="team-name">{matchup.vcA.name}</span>
                          <span className="team-score">{matchup.vcA.currentCp}</span>
                        </div>
                        
                        <div className="vs">VS</div>
                        
                        <div className="team">
                          <div 
                            className="team-color"
                            style={{ backgroundColor: matchup.vcB.colorHex }}
                          ></div>
                          <span className="team-name">{matchup.vcB.name}</span>
                          <span className="team-score">{matchup.vcB.currentCp}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <style jsx>{`
          .bracket-container {
            display: flex;
            gap: 0.5rem;
            align-items: flex-start;
            position: relative;
            max-width: 100%;
            overflow-x: auto;
            justify-content: center;
          }

          .conference-title {
            font-weight: bold;
            text-align: center;
            padding: 0.3rem;
            background: #e5e7eb;
            border-radius: 0.3rem;
            font-size: 0.8rem;
            color: #374151;
            margin-bottom: 0.5rem;
          }

          .bracket-column {
            flex: 1;
            min-width: 160px;
            max-width: 180px;
          }

          .final-column {
            min-width: 180px;
            max-width: 200px;
            align-self: center;
          }

          .round-title {
            font-weight: bold;
            text-align: center;
            margin-bottom: 1rem;
            padding: 0.5rem;
            background: #f3f4f6;
            border-radius: 0.5rem;
            font-size: 0.9rem;
          }

          .matches {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }

          .match {
            border: 1px solid #e5e7eb;
            border-radius: 0.5rem;
            padding: 0.75rem;
            background: white;
          }

          .match.active {
            border-color: #10b981;
            background: #f0fdf4;
          }

          .match.finished {
            border-color: #6b7280;
            background: #f9fafb;
          }

          .match.upcoming {
            border-color: #3b82f6;
            background: #eff6ff;
          }

          .match.final {
            border-width: 2px;
            background: #fef3c7;
          }

          .match-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
            font-size: 0.8rem;
          }

          .match-num {
            font-weight: bold;
            color: #6b7280;
          }

          .live {
            background: #10b981;
            color: white;
            padding: 0.2rem 0.4rem;
            border-radius: 0.25rem;
            font-size: 0.7rem;
            font-weight: bold;
          }

          .winner {
            background: #059669;
            color: white;
            padding: 0.2rem 0.4rem;
            border-radius: 0.25rem;
            font-size: 0.7rem;
            font-weight: bold;
          }

          .champion {
            background: #f59e0b;
            color: white;
            padding: 0.3rem 0.6rem;
            border-radius: 0.25rem;
            font-size: 0.8rem;
            font-weight: bold;
          }

          .teams {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }

          .team {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.3rem;
            background: rgba(255, 255, 255, 0.8);
            border-radius: 0.25rem;
          }

          .team-color {
            width: 1rem;
            height: 1rem;
            border-radius: 50%;
            flex-shrink: 0;
          }

          .team-name {
            flex: 1;
            font-size: 0.8rem;
            font-weight: 500;
          }

          .team-score {
            font-size: 0.7rem;
            color: #6b7280;
            font-weight: bold;
          }

          .vs {
            text-align: center;
            font-size: 0.7rem;
            color: #9ca3af;
            font-weight: bold;
            margin: 0.2rem 0;
          }

          .waiting {
            text-align: center;
            color: #6b7280;
            font-size: 0.8rem;
            padding: 1rem;
            background: #f9fafb;
            border-radius: 0.25rem;
            border: 1px dashed #d1d5db;
          }

          .connections {
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1;
          }

          .line {
            position: absolute;
            background: #d1d5db;
            height: 1px;
          }

          .line-1 {
            top: 12.5%;
            left: 25%;
            width: 25%;
          }

          .line-2 {
            top: 37.5%;
            left: 25%;
            width: 25%;
          }

          .line-3 {
            top: 62.5%;
            left: 25%;
            width: 25%;
          }

          .line-4 {
            top: 87.5%;
            left: 25%;
            width: 25%;
          }

          .line-final {
            top: 25%;
            left: 50%;
            width: 25%;
          }

          .final-conn {
            left: 75%;
          }

          @media (max-width: 768px) {
            .bracket-container {
              flex-direction: column;
              gap: 1rem;
            }
            
            .connections {
              display: none;
            }
          }
        `}</style>
      </div>
    </div>
  )
}
