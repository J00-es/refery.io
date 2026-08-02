import { NextResponse } from 'next/server'
import { getAppUser } from '@/lib/current-user'

export async function GET() {
  try {
    const appUser = await getAppUser()

    if (!appUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    return NextResponse.json({
      status: appUser.status,
      role: appUser.role,
      email: appUser.email,
      fullName: appUser.fullName,
      isSuperAdmin: appUser.isSuperAdmin,
    })
  } catch (error) {
    console.error('Error checking user status:', error)
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 })
  }
}
