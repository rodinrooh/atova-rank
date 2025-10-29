'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'

export default function AdminPage() {
  const { user, isLoaded } = useUser()
  const [status, setStatus] = useState('Loading...')
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const [currentMatchup, setCurrentMatchup] = useState<any>(null)
  const [eventDelta, setEventDelta] = useState<number>(0)
  const [eventReason, setEventReason] = useState('')
  const [eventVcId, setEventVcId] = useState('')

  useEffect(() => {
    if (isLoaded && !user) {
      window.location.href = '/sign-in'
      return
    }
    
    if (isLoaded && user) {
      // Check if user is in allowlist
      const userEmail = user.primaryEmailAddress?.emailAddress
      const allowlist = ['rodin.avella@gmail.com'] // Hardcoded for now since env vars aren't available client-side
      
      if (!allowlist.includes(userEmail || '')) {
        setStatus('Access Denied: Your email is not authorized for admin access.')
        return
      }
      
      setStatus(`Welcome, ${userEmail}`)
      loadCurrentStatus()
    }
  }, [isLoaded, user])

  const loadCurrentStatus = async () => {
    try {
      console.log('🔍 LOADING CURRENT STATUS...')
      const startTime = performance.now()
      
      const response = await fetch('/api/current-matchup')
      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)
      
      console.log(`🔍 GET /api/current-matchup ${response.status} in ${duration}ms`)
      
      const data = await response.json()
      console.log('🔍 Current matchup API response:', data)
      
      if (data.ok && data.matchup) {
        setCurrentMatchup(data.matchup)
        setStatus(`Active Match: ${data.matchup.matchNumber} (Round ${data.matchup.round}) - ${data.matchup.vcA.name} vs ${data.matchup.vcB.name}`)
        setSeasonId(data.matchup.seasonId)
        console.log('🔍 Active match found:', data.matchup)
      } else {
        setCurrentMatchup(null)
        setStatus('No active match. Ready to seed quarterfinals.')
        console.log('🔍 No active match found')
      }
    } catch (error) {
      setStatus('Error loading status')
      console.error('🔍 Error loading current status:', error)
    }
  }

  const [vcs, setVcs] = useState([
    { name: '', color: '#3B82F6' },
    { name: '', color: '#EF4444' },
    { name: '', color: '#10B981' },
    { name: '', color: '#F59E0B' },
    { name: '', color: '#8B5CF6' },
    { name: '', color: '#EC4899' },
    { name: '', color: '#06B6D4' },
    { name: '', color: '#84CC16' }
  ])

  const updateVc = (index: number, field: 'name' | 'color', value: string) => {
    const newVcs = [...vcs]
    newVcs[index][field] = value
    setVcs(newVcs)
  }

  const seedQuarterfinals = async () => {
    try {
      // Validate all VCs have names
      const emptyVcs = vcs.filter(vc => !vc.name.trim())
      if (emptyVcs.length > 0) {
        setStatus('Error: Please fill in all VC names')
        return
      }

      setStatus('Seeding quarterfinals...')
      
      // First create a season
      const seasonResponse = await fetch('/api/admin/create-season', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Fall 2025' })
      })
      
      if (!seasonResponse.ok) {
        throw new Error('Failed to create season')
      }
      
      const seasonData = await seasonResponse.json()
      setSeasonId(seasonData.seasonId)
      
      // Now seed the quarterfinals with the VCs from the form
      const seedResponse = await fetch('/api/admin/seed-quarterfinals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: seasonData.seasonId,
          vcs: vcs.map((vc, index) => ({
            name: vc.name,
            color: vc.color,
            conference: index < 4 ? 'left' : 'right'
          }))
        })
      })
      
      if (seedResponse.ok) {
        setStatus('Quarterfinals seeded successfully! Ready to start season.')
      } else {
        throw new Error('Failed to seed quarterfinals')
      }
    } catch (error) {
      setStatus(`Error: ${error}`)
    }
  }

  const startSeason = async () => {
    if (!seasonId) {
      setStatus('Error: No season ID. Please seed quarterfinals first.')
      return
    }
    
    try {
      setStatus('Starting season...')
      
      const response = await fetch('/api/admin/start-season', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId })
      })
      
      if (response.ok) {
        setStatus('Season started! Match #1 is now live.')
        loadCurrentStatus()
      } else {
        throw new Error('Failed to start season')
      }
    } catch (error) {
      setStatus(`Error: ${error}`)
    }
  }

  const addEvent = async () => {
    if (!eventDelta || !eventReason || !eventVcId || !currentMatchup || !seasonId) {
      setStatus('Error: Please fill in delta, reason, select VC, and ensure match is active.')
      return
    }
    
    try {
      setStatus('Adding event...')
      
      const response = await fetch('/api/admin/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId,
          matchupId: currentMatchup.id,
          vcId: eventVcId,
          delta: eventDelta,
          reason: eventReason
        })
      })
      
      if (response.ok) {
        setStatus('Event added successfully!')
        loadCurrentStatus()
        // Reset form
        setEventDelta(0)
        setEventReason('')
        setEventVcId('')
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add event')
      }
    } catch (error) {
      setStatus(`Error: ${error}`)
    }
  }

  const forceEndMatch = async () => {
    if (!seasonId) {
      setStatus('Error: No active season.')
      return
    }
    
    try {
      setStatus('Force ending match...')
      
      const response = await fetch('/api/admin/force-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchupId: 'current' })
      })
      
      if (response.ok) {
        setStatus('Match force ended!')
        loadCurrentStatus()
      } else {
        throw new Error('Failed to force end match')
      }
    } catch (error) {
      setStatus(`Error: ${error}`)
    }
  }

  const testScheduler = async () => {
    try {
      console.log('🔧 TESTING SCHEDULER - Setting match to end in 1 minute')
      setStatus('Setting match to end in 1 minute...')
      
      const startTime = performance.now()
      const response = await fetch('/api/admin/test-scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)
      
      console.log(`🔧 POST /api/admin/test-scheduler ${response.status} in ${duration}ms`)
      
      const result = await response.json()
      console.log('🔧 Test scheduler result:', result)
      
      if (response.ok) {
        setStatus('Match will end in 1 minute! Check back to see if next matchup started.')
        console.log('🔧 Match set to end in 1 minute - waiting for automatic progression...')
      } else {
        throw new Error('Failed to set test scheduler: ' + result.error)
      }
    } catch (error) {
      console.error('🔧 Error testing scheduler:', error)
      setStatus(`Error: ${error}`)
    }
  }

  const debugScheduler = async () => {
    try {
      console.log('🐛 DEBUGGING SCHEDULER - Manually calling scheduler...')
      setStatus('Manually calling scheduler...')
      
      const startTime = performance.now()
      const response = await fetch('/api/admin/manual-resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)
      
      console.log(`🐛 POST /api/admin/manual-resolve ${response.status} in ${duration}ms`)
      
      const result = await response.json()
      console.log('🐛 Scheduler debug result:', result)
      
      if (result.ok) {
        setStatus('Match resolved! Reloading...')
        // Reload status after calling scheduler
        setTimeout(() => {
          console.log('🐛 Reloading status after scheduler call...')
          loadCurrentStatus()
        }, 1000)
      } else {
        setStatus(`Error: ${result.error}`)
      }
    } catch (error) {
      console.error('🐛 Error calling scheduler:', error)
      setStatus(`Error calling scheduler: ${error}`)
    }
  }

  const startNextMatch = async () => {
    try {
      console.log('🚀 STARTING NEXT MATCH...')
      setStatus('Starting next match...')
      
      const startTime = performance.now()
      const response = await fetch('/api/admin/start-next-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)
      
      console.log(`🚀 POST /api/admin/start-next-match ${response.status} in ${duration}ms`)
      
      if (response.ok) {
        const result = await response.json()
        console.log('🚀 Start next match result:', result)
        setStatus('Next match started! Refreshing status...')
        console.log('🚀 Next match started successfully')
        loadCurrentStatus()
      } else {
        const errorData = await response.json()
        console.error('🚀 Error starting next match:', errorData)
        throw new Error(errorData.error || 'Failed to start next match')
      }
    } catch (error) {
      console.error('🚀 Error starting next match:', error)
      setStatus(`Error: ${error}`)
    }
  }

  if (!isLoaded) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center">Redirecting to sign-in...</div>
  }
  
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-8">Atova Rank Admin</h1>
      <div className="space-y-6">
        <div className="flex justify-between items-center mb-6">
          <p className="text-gray-600">Welcome, {user?.primaryEmailAddress?.emailAddress}</p>
          <a 
            href="/bracket" 
            className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
          >
            View Live Bracket
          </a>
        </div>
        
        {/* Tournament Bracket Setup */}
        <div className="bg-white border border-gray-200 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Tournament Bracket Setup</h2>
          
          {/* Visual Bracket */}
          <div className="mb-6">
            <div className="grid grid-cols-4 gap-4">
              {/* Left Conference */}
              <div className="space-y-2">
                <h3 className="font-medium text-center">Left Conference</h3>
                {[0, 1, 2, 3].map(index => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={vcs[index].color}
                      onChange={(e) => updateVc(index, 'color', e.target.value)}
                      className="w-8 h-8 rounded border"
                    />
                    <input
                      type="text"
                      placeholder={`VC ${index + 1}`}
                      value={vcs[index].name}
                      onChange={(e) => updateVc(index, 'name', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded"
                    />
                  </div>
                ))}
              </div>
              
              {/* Right Conference */}
              <div className="space-y-2">
                <h3 className="font-medium text-center">Right Conference</h3>
                {[4, 5, 6, 7].map(index => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={vcs[index].color}
                      onChange={(e) => updateVc(index, 'color', e.target.value)}
                      className="w-8 h-8 rounded border"
                    />
                    <input
                      type="text"
                      placeholder={`VC ${index + 1}`}
                      value={vcs[index].name}
                      onChange={(e) => updateVc(index, 'name', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded"
                    />
                  </div>
                ))}
              </div>
              
              {/* Semi-Finals */}
              <div className="space-y-2">
                <h3 className="font-medium text-center">Semi-Finals</h3>
                <div className="h-32 flex items-center justify-center text-gray-400 text-sm">
                  Left Winner vs Left Winner
                </div>
                <div className="h-32 flex items-center justify-center text-gray-400 text-sm">
                  Right Winner vs Right Winner
                </div>
              </div>
              
              {/* Final */}
              <div className="space-y-2">
                <h3 className="font-medium text-center">Final</h3>
                <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                  Champion
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex gap-4">
            <button 
              onClick={() => seedQuarterfinals()}
              className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
            >
              Create Tournament
            </button>
            
            <button 
              onClick={() => startSeason()}
              className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600"
            >
              Start Season
            </button>
          </div>
        </div>

        {/* Current Match Status */}
        <div className="bg-white border border-gray-200 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Current Match Status</h2>
          {currentMatchup ? (
            (() => {
              const timeRemaining = new Date(currentMatchup.endsAt).getTime() - new Date().getTime()
              const isExpired = timeRemaining <= 0
              
              return isExpired ? (
                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                  <div className="text-center mb-4">
                    <h3 className="font-medium text-yellow-800 mb-2">Match #{currentMatchup.matchNumber} Ended</h3>
                    <p className="text-gray-600">Next match starting shortly...</p>
                    <p className="text-sm text-gray-500 mt-2">Scheduler will auto-progress, or you can manually trigger:</p>
                  </div>
                  <div className="flex justify-center gap-4">
                    <button 
                      onClick={() => debugScheduler()}
                      className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
                    >
                      Resolve & Start Next Match
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-green-800">Match #{currentMatchup.matchNumber} • Round {currentMatchup.round}</h3>
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-medium">LIVE</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="font-semibold text-lg">{currentMatchup.vcA.name}</div>
                      <div className="text-sm text-gray-600">{currentMatchup.vcA.conference} conference</div>
                      <div className="text-2xl font-bold text-blue-600">{currentMatchup.vcA.currentCp} CP</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-lg">{currentMatchup.vcB.name}</div>
                      <div className="text-sm text-gray-600">{currentMatchup.vcB.conference} conference</div>
                      <div className="text-2xl font-bold text-blue-600">{currentMatchup.vcB.currentCp} CP</div>
                    </div>
                  </div>
                  <div className="text-center mt-2 text-sm text-gray-600">
                    Started: {new Date(currentMatchup.startedAt).toLocaleString()}
                  </div>
                  <div className="text-center mt-1 text-sm text-red-600 font-medium">
                    Ends: {new Date(currentMatchup.endsAt).toLocaleString()}
                  </div>
                  <div className="text-center mt-1 text-lg font-bold text-blue-600">
                    Time Remaining: {Math.max(0, Math.floor(timeRemaining / (1000 * 60 * 60)))}h {Math.max(0, Math.floor(timeRemaining / (1000 * 60)) % 60)}m
                  </div>
                </div>
              )
            })()
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-yellow-800">No Active Match</h3>
                <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm font-medium">WAITING</span>
              </div>
              <p className="text-sm text-yellow-700 mb-3">
                The tournament is waiting for the next match to start. This usually happens automatically, but you can manually start the next match if needed.
              </p>
              <button 
                onClick={() => startNextMatch()}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Start Next Match
              </button>
            </div>
          )}
        </div>

        {/* Live Match Management */}
        <div className="bg-white border border-gray-200 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Live Match Management</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium mb-2">Add Event</h3>
              <p className="text-sm text-gray-600 mb-3">Modify CP during live match (± any integer)</p>
              <div className="grid grid-cols-4 gap-2">
                <input 
                  type="number" 
                  placeholder="Delta (e.g., 250)" 
                  className="border border-gray-300 px-3 py-2 rounded"
                  value={eventDelta}
                  onChange={(e) => setEventDelta(Number(e.target.value))}
                />
                <input 
                  type="text" 
                  placeholder="Reason" 
                  className="border border-gray-300 px-3 py-2 rounded"
                  value={eventReason}
                  onChange={(e) => setEventReason(e.target.value)}
                />
                <select
                  className="border border-gray-300 px-3 py-2 rounded"
                  value={eventVcId}
                  onChange={(e) => setEventVcId(e.target.value)}
                >
                  <option value="">Select VC...</option>
                  {currentMatchup && (
                    <>
                      <option value={currentMatchup.vcA.id}>
                        {currentMatchup.vcA.name} (Left)
                      </option>
                      <option value={currentMatchup.vcB.id}>
                        {currentMatchup.vcB.name} (Right)
                      </option>
                    </>
                  )}
                </select>
                <button 
                  onClick={() => addEvent()}
                  disabled={!eventVcId}
                  className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Add Event
                </button>
              </div>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">Force End Match</h3>
              <p className="text-sm text-gray-600 mb-3">Emergency override to end current match</p>
              <button 
                onClick={() => forceEndMatch()}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              >
                Force End Match
              </button>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">Test Scheduler</h3>
              <p className="text-sm text-gray-600 mb-3">Set current match to end in 1 minute (for testing)</p>
              <button 
                onClick={() => testScheduler()}
                className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
              >
                Test Scheduler (1 min)
              </button>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">Debug Scheduler</h3>
              <p className="text-sm text-gray-600 mb-3">Manually call scheduler to see what happens</p>
              <button 
                onClick={() => debugScheduler()}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              >
                Debug Scheduler
              </button>
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="bg-gray-50 p-4 rounded">
          <h3 className="font-medium mb-2">Current Status</h3>
          <div className="text-sm text-gray-600">
            {status}
          </div>
        </div>
      </div>
    </div>
  )
}
