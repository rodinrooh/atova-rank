// Test script for public APIs
const { createClient } = require('@supabase/supabase-js')

// Replace with your actual values
const supabaseUrl = 'https://vmyrfpuzxtzglpayktmj.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteXJmcHV6eHR6Z2xwYXlrdG1qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYxNDYwNiwiZXhwIjoyMDc2MTkwNjA2fQ.be9YyEXxppTwdo0bOqYD8zHWOj62UWvok1M61EqHyfA'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testPublicAPIs() {
  try {
    console.log('Testing public APIs...')
    
    // Test current-matchup endpoint
    console.log('\n1. Testing GET /api/current-matchup')
    const matchupResponse = await fetch('http://localhost:3000/api/current-matchup')
    const matchupData = await matchupResponse.json()
    console.log('Current matchup response:', matchupData)
    
    // Test vote endpoint (will fail without active matchup, but tests the endpoint)
    console.log('\n2. Testing POST /api/vote')
    const voteResponse = await fetch('http://localhost:3000/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        matchupId: 'test-id',
        vcId: 'test-vc-id'
      })
    })
    const voteData = await voteResponse.json()
    console.log('Vote response:', voteData)
    
  } catch (err) {
    console.error('Test error:', err)
  }
}

// Wait a moment for dev server to start, then test
setTimeout(testPublicAPIs, 3000)
