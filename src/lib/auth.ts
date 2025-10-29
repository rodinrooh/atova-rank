import { auth, currentUser } from '@clerk/nextjs/server'

export function getAdminAllowlistEmails(): string[] {
  const emails = process.env.ADMIN_ALLOWLIST_EMAILS || ''
  return emails.split(',').map(email => email.trim()).filter(Boolean)
}

export async function checkAdminAccess(): Promise<{ allowed: boolean; email?: string }> {
  console.log('checkAdminAccess: Starting')
  
  const { userId } = await auth()
  console.log('checkAdminAccess: userId =', userId)
  
  if (!userId) {
    console.log('checkAdminAccess: No userId')
    return { allowed: false }
  }
  
  // Get user info from Clerk
  const clerkUser = await currentUser()
  console.log('checkAdminAccess: clerkUser =', clerkUser?.primaryEmailAddress?.emailAddress)
  
  if (!clerkUser?.primaryEmailAddress?.emailAddress) {
    console.log('checkAdminAccess: No email address')
    return { allowed: false }
  }
  
  const userEmail = clerkUser.primaryEmailAddress.emailAddress
  const allowlist = getAdminAllowlistEmails()
  console.log('checkAdminAccess: userEmail =', userEmail, 'allowlist =', allowlist)
  
  const allowed = allowlist.includes(userEmail)
  console.log('checkAdminAccess: allowed =', allowed)
  
  return {
    allowed,
    email: userEmail
  }
}
