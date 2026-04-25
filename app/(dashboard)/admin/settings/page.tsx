'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Settings, Bell, Mail, Database } from 'lucide-react'

export default function AdminSettingsPage() {
  return (
    <div className="space-y-4 sm:space-y-6 px-4 sm:px-0">
      <Card>
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
            System Settings
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Configure system-wide settings and preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          <div className="space-y-4 sm:space-y-6">
            <div className="rounded-lg border p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm sm:text-base">Email Configuration</span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Email sending is configured through your environment variables. Contact support to modify email settings.
              </p>
            </div>

            <div className="rounded-lg border p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <Bell className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm sm:text-base">Notifications</span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Notification settings will be available in a future update.
              </p>
            </div>

            <div className="rounded-lg border p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm sm:text-base">Data Management</span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Database is managed through Supabase. Access your Supabase dashboard for advanced data management.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
