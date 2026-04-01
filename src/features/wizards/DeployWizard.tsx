/**
 * Deploy Wizard
 *
 * Step-by-step workflow for deployments:
 * 1. Select target environment
 * 2. Choose deployment scope
 * 3. Configure rollback
 * 4. Confirm and deploy
 */

import { useState, useCallback } from 'react';
import { Rocket, Server, GitBranch, CheckCircle, ArrowRight, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useCreateTask } from '../orchestrator/useOrchestrator';

interface DeployWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (taskId: string) => void;
}

type WizardStep = 'environment' | 'scope' | 'rollback' | 'deploy';

const STEPS: WizardStep[] = ['environment', 'scope', 'rollback', 'deploy'];

const ENVIRONMENTS = [
  { id: 'dev', name: 'Development', description: 'Dev cluster for testing', color: '#3b82f6' },
  { id: 'staging', name: 'Staging', description: 'Pre-production validation', color: '#f59e0b' },
  { id: 'production', name: 'Production', description: 'Live production environment', color: '#ef4444' },
];

const SCOPE_OPTIONS = [
  { id: 'full', name: 'Full Deployment', description: 'Deploy all services' },
  { id: 'frontend', name: 'Frontend Only', description: 'Static assets and UI' },
  { id: 'backend', name: 'Backend Only', description: 'API services' },
  { id: 'database', name: 'Database Migrations', description: 'Schema updates only' },
];

export function DeployWizard({
  open,
  onOpenChange,
  onSuccess,
}: DeployWizardProps) {
  const [step, setStep] = useState<WizardStep>('environment');
  const [selectedEnv, setSelectedEnv] = useState<string>('dev');
  const [selectedScope, setSelectedScope] = useState<string>('full');
  const [branch, setBranch] = useState('main');
  const [rollbackEnabled, setRollbackEnabled] = useState(true);
  const [healthChecks, setHealthChecks] = useState({
    apiHealth: true,
    dbConnection: true,
    cacheConnection: true,
  });
  const [notifications, setNotifications] = useState({
    slack: false,
    email: false,
  });

  const { createTask, loading } = useCreateTask();

  const currentStepIndex = STEPS.indexOf(step);
  const isLastStep = step === 'deploy';
  const isFirstStep = step === 'environment';

  const handleNext = useCallback(() => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex < STEPS.length - 1) {
      setStep(STEPS[currentIndex + 1]);
    }
  }, [step]);

  const handleBack = useCallback(() => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex > 0) {
      setStep(STEPS[currentIndex - 1]);
    }
  }, [step]);

  const handleDeploy = useCallback(async () => {
    try {
      const env = ENVIRONMENTS.find((e) => e.id === selectedEnv);
      const scope = SCOPE_OPTIONS.find((s) => s.id === selectedScope);
      const healthOptions = Object.entries(healthChecks)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
        .join(', ');

      const taskTitle = `Deploy to ${env?.name} - ${scope?.name}`;
      const taskDescription = `Deployment Request

Environment: ${env?.name} (${selectedEnv})
Branch: ${branch}
Scope: ${scope?.name}

Health Checks: ${healthOptions || 'None'}
Rollback: ${rollbackEnabled ? 'Enabled' : 'Disabled'}

Notifications:
- Slack: ${notifications.slack ? 'Yes' : 'No'}
- Email: ${notifications.email ? 'Yes' : 'No'}

Deployment Steps:
1. Pull latest from ${branch}
2. Run ${selectedScope === 'database' ? 'migrations' : 'build'}
3. Deploy ${selectedScope} to ${selectedEnv}
4. Run health checks
5. ${rollbackEnabled ? 'Create rollback point' : 'Skip rollback point'}
6. Send notifications`;

      const result = await createTask({
        title: taskTitle,
        description: taskDescription,
        priority: selectedEnv === 'production' ? 'critical' : 'high',
      });

      onSuccess?.(result.kanban_id);
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to create deploy task:', err);
    }
  }, [selectedEnv, selectedScope, branch, rollbackEnabled, healthChecks, notifications, createTask, onSuccess, onOpenChange]);

  const handleClose = useCallback(() => {
    setStep('environment');
    setSelectedEnv('dev');
    setSelectedScope('full');
    setBranch('main');
    setRollbackEnabled(true);
    setHealthChecks({
      apiHealth: true,
      dbConnection: true,
      cacheConnection: true,
    });
    setNotifications({
      slack: false,
      email: false,
    });
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket size={20} className="text-primary" />
            Deploy Wizard
          </DialogTitle>
          <DialogDescription>
            Safe deployment workflow with rollback
          </DialogDescription>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center justify-between px-4">
          {STEPS.map((s, index) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  index <= currentStepIndex
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {index < currentStepIndex ? <CheckCircle size={14} /> : index + 1}
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`w-16 h-0.5 transition-colors ${
                    index < currentStepIndex ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="py-4">
          {step === 'environment' && (
            <div className="space-y-3">
              <Label>Select Target Environment</Label>
              <div className="grid gap-3">
                {ENVIRONMENTS.map((env) => (
                  <Card
                    key={env.id}
                    className={`cursor-pointer transition-colors border-l-4 ${
                      selectedEnv === env.id
                        ? 'border-l-primary bg-primary/5'
                        : 'border-l-transparent hover:bg-muted'
                    }`}
                    onClick={() => setSelectedEnv(env.id)}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <Server
                        size={20}
                        style={{ color: env.color }}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{env.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {env.description}
                        </div>
                      </div>
                      {selectedEnv === env.id && (
                        <CheckCircle size={18} className="text-primary" />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
              {selectedEnv === 'production' && (
                <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-sm flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-500 mt-0.5" />
                  <p className="text-amber-600">
                    Production deployments require extra caution. Ensure all tests pass and staging validation is complete.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 'scope' && (
            <div className="space-y-4">
              <div>
                <Label>Deployment Scope</Label>
                <div className="grid gap-3 mt-2">
                  {SCOPE_OPTIONS.map((scope) => (
                    <Card
                      key={scope.id}
                      className={`cursor-pointer transition-colors ${
                        selectedScope === scope.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => setSelectedScope(scope.id)}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <GitBranch
                          size={20}
                          className={
                            selectedScope === scope.id
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }
                        />
                        <div>
                          <div className="font-medium">{scope.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {scope.description}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="branch">Branch</Label>
                <Input
                  id="branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {step === 'rollback' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-medium">Automatic Rollback</div>
                    <div className="text-xs text-muted-foreground">
                      Create rollback point before deployment
                    </div>
                  </div>
                  <Switch
                    checked={rollbackEnabled}
                    onCheckedChange={setRollbackEnabled}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Health Checks</Label>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <div className="font-medium text-sm">API Health</div>
                      <div className="text-xs text-muted-foreground">
                        Check /health endpoint
                      </div>
                    </div>
                    <Switch
                      checked={healthChecks.apiHealth}
                      onCheckedChange={(checked) =>
                        setHealthChecks((prev) => ({ ...prev, apiHealth: checked }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <div className="font-medium text-sm">Database</div>
                      <div className="text-xs text-muted-foreground">
                        Verify connection pool
                      </div>
                    </div>
                    <Switch
                      checked={healthChecks.dbConnection}
                      onCheckedChange={(checked) =>
                        setHealthChecks((prev) => ({ ...prev, dbConnection: checked }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <div className="font-medium text-sm">Cache</div>
                      <div className="text-xs text-muted-foreground">
                        Redis/Memcached connection
                      </div>
                    </div>
                    <Switch
                      checked={healthChecks.cacheConnection}
                      onCheckedChange={(checked) =>
                        setHealthChecks((prev) => ({ ...prev, cacheConnection: checked }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Notifications</Label>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <div className="font-medium text-sm">Slack</div>
                      <div className="text-xs text-muted-foreground">
                        Post to #deployments
                      </div>
                    </div>
                    <Switch
                      checked={notifications.slack}
                      onCheckedChange={(checked) =>
                        setNotifications((prev) => ({ ...prev, slack: checked }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <div className="font-medium text-sm">Email</div>
                      <div className="text-xs text-muted-foreground">
                        Send to team
                      </div>
                    </div>
                    <Switch
                      checked={notifications.email}
                      onCheckedChange={(checked) =>
                        setNotifications((prev) => ({ ...prev, email: checked }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'deploy' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted">
                <h4 className="font-semibold mb-3">Deployment Summary</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Environment:</dt>
                    <dd className="font-medium">
                      {ENVIRONMENTS.find((e) => e.id === selectedEnv)?.name}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Branch:</dt>
                    <dd className="font-mono">{branch}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Scope:</dt>
                    <dd>{SCOPE_OPTIONS.find((s) => s.id === selectedScope)?.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Rollback:</dt>
                    <dd>{rollbackEnabled ? 'Enabled' : 'Disabled'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Health Checks:</dt>
                    <dd>
                      {Object.entries(healthChecks)
                        .filter(([, v]) => v)
                        .length}{' '}
                      enabled
                    </dd>
                  </div>
                </dl>
              </div>

              {selectedEnv === 'production' && (
                <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-sm">
                  <p className="text-red-600 font-medium">
                    Confirm: You are about to deploy to PRODUCTION
                  </p>
                  <p className="text-red-500 text-xs mt-1">
                    This will affect live users. Ensure all testing is complete.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <DialogFooter className="gap-2">
          {!isFirstStep && (
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>
          )}
          {isLastStep ? (
            <Button
              onClick={handleDeploy}
              disabled={loading}
              variant={selectedEnv === 'production' ? 'destructive' : 'default'}
            >
              {loading && <Loader2 size={16} className="mr-2 animate-spin" />}
              <Rocket size={16} className="mr-2" />
              {selectedEnv === 'production' ? 'Deploy to Production' : 'Deploy'}
            </Button>
          ) : (
            <Button onClick={handleNext}>
              Continue
              <ArrowRight size={16} className="ml-2" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Simple Input component if not available
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 rounded-md border border-input bg-background text-sm ${props.className || ''}`}
    />
  );
}
