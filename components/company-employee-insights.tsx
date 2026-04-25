'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Brain, 
  Users, 
  Plus, 
  Linkedin, 
  Sparkles, 
  TrendingUp, 
  Target,
  Lightbulb,
  BarChart3,
  Loader2,
  Trash2,
  RefreshCw
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Employee {
  id: string
  name: string
  title: string | null
  linkedin_url: string | null
  linkedin_profile_raw: string | null
  ai_insights: string | null
  role_category: string | null
  seniority_level: string | null
  years_at_company: string | null
}

interface CompanyInsight {
  id: string
  insight_type: string
  content: string
  confidence_score: number | null
  generated_at: string
}

interface CompanyEmployeeInsightsProps {
  companyId: string
  companyName: string
}

export function CompanyEmployeeInsights({ companyId, companyName }: CompanyEmployeeInsightsProps) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [insights, setInsights] = useState<CompanyInsight[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddingEmployee, setIsAddingEmployee] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    title: '',
    linkedin_url: '',
    linkedin_profile_raw: ''
  })
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [companyId])

  const loadData = async () => {
    setIsLoading(true)
    
    // Load employees
    const { data: empData } = await supabase
      .from('company_employees')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    
    if (empData) setEmployees(empData)

    // Load insights
    const { data: insightData } = await supabase
      .from('company_ai_insights')
      .select('*')
      .eq('company_id', companyId)
      .order('generated_at', { ascending: false })
    
    if (insightData) setInsights(insightData)
    
    setIsLoading(false)
  }

  const addEmployee = async () => {
    if (!newEmployee.name) return

    setIsAddingEmployee(true)

    // Analyze LinkedIn profile if provided
    let aiInsights = null
    let roleCategory = null
    let seniorityLevel = null

    if (newEmployee.linkedin_profile_raw) {
      // Parse basic info from profile text
      const profileText = newEmployee.linkedin_profile_raw.toLowerCase()
      
      // Detect role category
      if (profileText.includes('engineer') || profileText.includes('developer') || profileText.includes('software')) {
        roleCategory = 'Engineering'
      } else if (profileText.includes('product') || profileText.includes('pm')) {
        roleCategory = 'Product'
      } else if (profileText.includes('design') || profileText.includes('ux') || profileText.includes('ui')) {
        roleCategory = 'Design'
      } else if (profileText.includes('sales') || profileText.includes('account executive') || profileText.includes('business development')) {
        roleCategory = 'Sales'
      } else if (profileText.includes('marketing') || profileText.includes('growth')) {
        roleCategory = 'Marketing'
      } else if (profileText.includes('hr') || profileText.includes('people') || profileText.includes('talent')) {
        roleCategory = 'People/HR'
      } else if (profileText.includes('finance') || profileText.includes('accounting')) {
        roleCategory = 'Finance'
      } else if (profileText.includes('operations') || profileText.includes('ops')) {
        roleCategory = 'Operations'
      }

      // Detect seniority
      if (profileText.includes('ceo') || profileText.includes('cto') || profileText.includes('cfo') || profileText.includes('founder') || profileText.includes('chief')) {
        seniorityLevel = 'C-Level'
      } else if (profileText.includes('vp') || profileText.includes('vice president') || profileText.includes('director')) {
        seniorityLevel = 'Executive'
      } else if (profileText.includes('senior') || profileText.includes('lead') || profileText.includes('principal') || profileText.includes('staff')) {
        seniorityLevel = 'Senior'
      } else if (profileText.includes('junior') || profileText.includes('associate') || profileText.includes('entry')) {
        seniorityLevel = 'Junior'
      } else {
        seniorityLevel = 'Mid-Level'
      }

      // Generate basic insights
      const insights = []
      if (profileText.includes('startup')) insights.push('Has startup experience')
      if (profileText.includes('scale') || profileText.includes('growth')) insights.push('Growth-focused background')
      if (profileText.includes('remote')) insights.push('Remote work experience')
      if (profileText.includes('international') || profileText.includes('global')) insights.push('International experience')
      if (profileText.includes('management') || profileText.includes('team')) insights.push('Team management experience')
      
      aiInsights = insights.length > 0 ? insights.join('. ') + '.' : null
    }

    const { error } = await supabase.from('company_employees').insert({
      company_id: companyId,
      name: newEmployee.name,
      title: newEmployee.title || null,
      linkedin_url: newEmployee.linkedin_url || null,
      linkedin_profile_raw: newEmployee.linkedin_profile_raw || null,
      ai_insights: aiInsights,
      role_category: roleCategory,
      seniority_level: seniorityLevel
    })

    if (!error) {
      setNewEmployee({ name: '', title: '', linkedin_url: '', linkedin_profile_raw: '' })
      loadData()
    }

    setIsAddingEmployee(false)
  }

  const deleteEmployee = async (id: string) => {
    await supabase.from('company_employees').delete().eq('id', id)
    loadData()
  }

  const generateCompanyInsights = async () => {
    if (employees.length === 0) return

    setIsAnalyzing(true)

    // Analyze team composition
    const roleCategories = employees.reduce((acc, emp) => {
      if (emp.role_category) {
        acc[emp.role_category] = (acc[emp.role_category] || 0) + 1
      }
      return acc
    }, {} as Record<string, number>)

    const seniorityLevels = employees.reduce((acc, emp) => {
      if (emp.seniority_level) {
        acc[emp.seniority_level] = (acc[emp.seniority_level] || 0) + 1
      }
      return acc
    }, {} as Record<string, number>)

    // Generate insights
    const insightsToUpsert = []

    // Team Composition Insight
    const topRoles = Object.entries(roleCategories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([role, count]) => `${role} (${count})`)
    
    if (topRoles.length > 0) {
      insightsToUpsert.push({
        company_id: companyId,
        insight_type: 'team_composition',
        content: `Primary team composition: ${topRoles.join(', ')}. This suggests the company is ${
          roleCategories['Engineering'] > (roleCategories['Sales'] || 0) 
            ? 'product-focused with strong technical capabilities' 
            : 'commercially-driven with emphasis on revenue growth'
        }.`,
        confidence_score: 0.75,
        generated_at: new Date().toISOString()
      })
    }

    // Hiring Style Insight
    const hasExecutives = seniorityLevels['C-Level'] || seniorityLevels['Executive']
    const hasSeniors = seniorityLevels['Senior']
    const hasJuniors = seniorityLevels['Junior']

    let hiringStyle = ''
    if (hasExecutives && hasSeniors && !hasJuniors) {
      hiringStyle = 'This company appears to hire experienced professionals, suggesting they value expertise and may have complex problems requiring seasoned talent. They likely offer competitive compensation for senior roles.'
    } else if (hasJuniors && hasSeniors) {
      hiringStyle = 'This company has a balanced hiring approach across experience levels, suggesting they invest in talent development and have structured mentorship. Good for candidates seeking growth opportunities.'
    } else if (hasSeniors && !hasExecutives) {
      hiringStyle = 'The team is primarily senior-level without heavy executive presence, suggesting a flat organizational structure with high individual autonomy. Ideal for self-directed professionals.'
    } else {
      hiringStyle = 'Based on the team profile, this company appears to be building out their organization. Early hires may have significant impact and growth potential.'
    }

    insightsToUpsert.push({
      company_id: companyId,
      insight_type: 'hiring_style',
      content: hiringStyle,
      confidence_score: 0.7,
      generated_at: new Date().toISOString()
    })

    // Culture Insight based on employee backgrounds
    const allInsights = employees
      .filter(e => e.ai_insights)
      .map(e => e.ai_insights)
      .join(' ')
    
    let cultureInsight = 'Based on team backgrounds: '
    if (allInsights.includes('startup')) {
      cultureInsight += 'Strong startup DNA with team members experienced in fast-paced environments. '
    }
    if (allInsights.includes('remote')) {
      cultureInsight += 'Remote-friendly culture with distributed team experience. '
    }
    if (allInsights.includes('international')) {
      cultureInsight += 'Global perspective with international business experience. '
    }
    if (allInsights.includes('management')) {
      cultureInsight += 'Leadership depth with experienced managers. '
    }

    if (cultureInsight !== 'Based on team backgrounds: ') {
      insightsToUpsert.push({
        company_id: companyId,
        insight_type: 'culture',
        content: cultureInsight.trim(),
        confidence_score: 0.65,
        generated_at: new Date().toISOString()
      })
    }

    // Skill Preferences
    const engineeringHeavy = (roleCategories['Engineering'] || 0) > employees.length * 0.4
    const salesHeavy = (roleCategories['Sales'] || 0) > employees.length * 0.3

    let skillPref = ''
    if (engineeringHeavy) {
      skillPref = 'Technical skills highly valued. Candidates should demonstrate strong coding abilities, system design knowledge, and problem-solving skills. Technical interviews likely to be rigorous.'
    } else if (salesHeavy) {
      skillPref = 'Commercial acumen valued. Candidates should demonstrate revenue impact, relationship building, and market knowledge. Expect metrics-driven interviews focused on past achievements.'
    } else {
      skillPref = 'Balanced skill set valued. Company appears to appreciate cross-functional capabilities and candidates who can work across departments.'
    }

    insightsToUpsert.push({
      company_id: companyId,
      insight_type: 'skill_preferences',
      content: skillPref,
      confidence_score: 0.7,
      generated_at: new Date().toISOString()
    })

    // Upsert insights
    for (const insight of insightsToUpsert) {
      await supabase
        .from('company_ai_insights')
        .upsert(insight, { onConflict: 'company_id,insight_type' })
    }

    loadData()
    setIsAnalyzing(false)
  }

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'hiring_style': return <Target className="h-4 w-4" />
      case 'culture': return <Users className="h-4 w-4" />
      case 'team_composition': return <BarChart3 className="h-4 w-4" />
      case 'skill_preferences': return <Lightbulb className="h-4 w-4" />
      case 'growth_pattern': return <TrendingUp className="h-4 w-4" />
      default: return <Brain className="h-4 w-4" />
    }
  }

  const getInsightLabel = (type: string) => {
    switch (type) {
      case 'hiring_style': return 'Hiring Style'
      case 'culture': return 'Culture'
      case 'team_composition': return 'Team Composition'
      case 'skill_preferences': return 'Skill Preferences'
      case 'growth_pattern': return 'Growth Pattern'
      default: return type
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              Employee Insights AI
            </CardTitle>
            <CardDescription>
              Analyze employee profiles to understand {companyName}&apos;s hiring style
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {employees.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={generateCompanyInsights}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {isAnalyzing ? 'Analyzing...' : 'Generate Insights'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="employees">
          <TabsList className="mb-4">
            <TabsTrigger value="employees">
              <Users className="h-4 w-4 mr-2" />
              Employees ({employees.length})
            </TabsTrigger>
            <TabsTrigger value="insights">
              <Sparkles className="h-4 w-4 mr-2" />
              AI Insights ({insights.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="employees" className="space-y-4">
            {/* Add Employee Form */}
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Add Employee Profile</CardTitle>
                <CardDescription className="text-xs">
                  Paste LinkedIn profile info to analyze hiring patterns
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Name *</Label>
                    <Input
                      placeholder="John Smith"
                      value={newEmployee.name}
                      onChange={(e) => setNewEmployee(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Title</Label>
                    <Input
                      placeholder="Senior Software Engineer"
                      value={newEmployee.title}
                      onChange={(e) => setNewEmployee(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">LinkedIn URL</Label>
                  <Input
                    placeholder="https://linkedin.com/in/johnsmith"
                    value={newEmployee.linkedin_url}
                    onChange={(e) => setNewEmployee(prev => ({ ...prev, linkedin_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">LinkedIn Profile Content (copy & paste)</Label>
                  <Textarea
                    placeholder="Paste the LinkedIn profile summary, experience, and skills here for AI analysis..."
                    value={newEmployee.linkedin_profile_raw}
                    onChange={(e) => setNewEmployee(prev => ({ ...prev, linkedin_profile_raw: e.target.value }))}
                    rows={4}
                  />
                </div>
                <Button 
                  onClick={addEmployee} 
                  disabled={!newEmployee.name || isAddingEmployee}
                  className="w-full"
                >
                  {isAddingEmployee ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Add Employee
                </Button>
              </CardContent>
            </Card>

            {/* Employee List */}
            {employees.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No employees added yet</p>
                <p className="text-xs">Add employee profiles to generate hiring insights</p>
              </div>
            ) : (
              <div className="space-y-3">
                {employees.map((emp) => (
                  <div 
                    key={emp.id} 
                    className="flex items-start justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{emp.name}</span>
                        {emp.linkedin_url && (
                          <a href={emp.linkedin_url} target="_blank" rel="noopener noreferrer">
                            <Linkedin className="h-4 w-4 text-blue-600" />
                          </a>
                        )}
                      </div>
                      {emp.title && (
                        <p className="text-sm text-muted-foreground">{emp.title}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {emp.role_category && (
                          <Badge variant="secondary" className="text-xs">
                            {emp.role_category}
                          </Badge>
                        )}
                        {emp.seniority_level && (
                          <Badge variant="outline" className="text-xs">
                            {emp.seniority_level}
                          </Badge>
                        )}
                      </div>
                      {emp.ai_insights && (
                        <p className="text-xs text-muted-foreground mt-2 italic">
                          {emp.ai_insights}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-600"
                      onClick={() => deleteEmployee(emp.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            {insights.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No insights generated yet</p>
                <p className="text-xs">Add employee profiles and click &quot;Generate Insights&quot;</p>
              </div>
            ) : (
              <div className="space-y-4">
                {insights.map((insight) => (
                  <Card key={insight.id} className="bg-gradient-to-br from-purple-50 to-blue-50 border-purple-100">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-white shadow-sm">
                          {getInsightIcon(insight.insight_type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">
                              {getInsightLabel(insight.insight_type)}
                            </span>
                            {insight.confidence_score && (
                              <Badge variant="secondary" className="text-xs">
                                {Math.round(insight.confidence_score * 100)}% confidence
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-foreground/80">
                            {insight.content}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            Generated {new Date(insight.generated_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={generateCompanyInsights}
                  disabled={isAnalyzing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isAnalyzing ? 'animate-spin' : ''}`} />
                  Regenerate All Insights
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
