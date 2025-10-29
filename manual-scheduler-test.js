// Manual test of the scheduler
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://vmyrfpuzxtzglpayktmj.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteXJmcHV6eHR6Z2xwYXlrdG1qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYxNDYwNiwiZXhwIjoyMDc2MTkwNjA2fQ.be9YyEXxppTwdo0bOqYD8zHWOj62UWvok1M61EqHyfA'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testScheduler() {
  try {
    console.log('🔄 MANUAL SCHEDULER TEST')
    console.log('Current time:', new Date().toISOString())
    
    // Check current active matchups
    const { data: activeMatchups, error: findError } = await supabase
      .from('matchups')
      .select('id, match_number, active, finished, started_at, ends_at')
      .eq('active', true)
      .eq('finished', false)
    
    console.log('Active matchups:', activeMatchups)
    
    if (activeMatchups && activeMatchups.length > 0) {
      const matchup = activeMatchups[0]
      console.log('Matchup details:', matchup)
      console.log('Ends at:', matchup.ends_at)
      console.log('Current time:', new Date().toISOString())
      console.log('Is overdue?', new Date(matchup.ends_at) < new Date())
    }
    
    // Call the scheduler
    console.log('Calling scheduler...')
    const response = await fetch('https://vmyrfpuzxtzglpayktmj.supabase.co/functions/v1/resolve_due_matchups', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
    
    const result = await response.json()
    console.log('Scheduler result:', result)
    
  } catch (error) {
    console.error('Error:', error)
  }
}

testScheduler()
