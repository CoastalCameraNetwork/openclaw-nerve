/**
 * Review PR Wizard
 *
 * Step-by-step workflow for reviewing pull requests:
 * 1. Enter PR URL
 * 2. Select review focus
 * 3. Configure security checks
 * 4. Execute review
 */

import { useState, useCallback } from 'react';
import { GitPullRequest, Shield, FileText, CheckCircle, ArrowRight, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
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

interface ReviewPRWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (taskId: string) => void;
}

type WizardStep = 'url' | 'focus' | 'security' | 'review';

const STEPS: WizardStep[] = ['url', 'focus', 'security', 'review'];

const REVIEW_FOCI = [
  { id: 'general', name: 'General Review', description: 'Code quality, readability, best practices', icon: FileText },
  { id: 'security', name: 'Security Focus', description: 'Vulnerabilities, injection, auth issues', icon: Shield },
  { id: 'performance', name: 'Performance', description: 'Bottlenecks, optimization opportunities', icon: AlertTriangle },
  { id: 'tests', name: 'Test Coverage', description: 'Missing tests, edge cases', icon: CheckCircle },
];

export function ReviewPRWizard({
  open,
  onOpenChange,
  onSuccess,
}: ReviewPRWizardProps) {
  const [step, setStep] = useState<WizardStep>('url');
  const [prUrl, setPrUrl] = useState('');
  const [selectedFocus, setSelectedFocus] = useState<string[]>(['general']);
  const [securityChecks, setSecurityChecks] = useState({
    sqlInjection: true,
    xss: true,
    authBypass: true,
    secrets: true,
  });
  const [priority, setPriority] = useState<'normal' | 'high' | 'critical'>('normal');

  const { createTask, loading } = useCreateTask();

  const currentStepIndex = STEPS.indexOf(step);
  const isLastStep = step === 'review';
  const isFirstStep = step === 'url';

  // Extract PR info from URL
  const extractPRInfo = useCallback((url: string): { owner?: string; repo?: string; number?: string } => {
    try {
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
      if (match) {
        return { owner: match[1], repo: match[2], number: match[3] };
      }
    } catch {
      // ignore
    }
    return {};
  }, []);

  const prInfo = extractPRInfo(prUrl);

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

  const toggleFocus = useCallback((focusId: string) => {
    setSelectedFocus((prev) =>
      prev.includes(focusId)
        ? prev.filter((id) => id !== focusId)
        : [...prev, focusId]
    );
  }, []);

  const handleReview = useCallback(async () => {
    try {
      const taskTitle = `Review PR #${prInfo.number || 'unknown'}`;
      const securityOptions = Object.entries(securityChecks)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
        .join(', ');

      const taskDescription = `Review pull request: ${prUrl}

Focus Areas:
${selectedFocus.map((f) => `- ${REVIEW_FOCI.find((rf) => rf.id === f)?.name}`).join('\n')}

Security Checks: ${securityOptions || 'None'}

Priority: ${priority}

Please provide:
1. Summary of changes
2. Critical issues (if any)
3. Suggestions for improvement
4. Approval recommendation`;

      const result = await createTask({
        title: taskTitle,
        description: taskDescription,
        priority,
      });

      onSuccess?.(result.kanban_id);
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to create review task:', err);
    }
  }, [prUrl, prInfo.number, selectedFocus, securityChecks, priority, createTask, onSuccess, onOpenChange]);

  const handleClose = useCallback(() => {
    setStep('url');
    setPrUrl('');
    setSelectedFocus(['general']);
    setSecurityChecks({
      sqlInjection: true,
      xss: true,
      authBypass: true,
      secrets: true,
    });
    setPriority('normal');
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitPullRequest size={20} className="text-primary" />
            Review PR Wizard
          </DialogTitle>
          <DialogDescription>
            Automated pull request review workflow
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
          {step === 'url' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="prUrl">GitHub PR URL</Label>
                <input
                  id="prUrl"
                  type="text"
                  value={prUrl}
                  onChange={(e) => setPrUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo/pull/123"
                  className="w-full px-3 py-2 mt-1 rounded-md border border-input bg-background text-sm"
                />
              </div>
              {prInfo.owner && (
                <div className="p-3 rounded-md bg-green-500/10 border border-green-500/30 text-sm">
                  <p className="text-green-600">
                    Detected: <strong>{prInfo.owner}/{prInfo.repo}</strong> PR #{prInfo.number}
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 'focus' && (
            <div className="space-y-3">
              <Label>Review Focus Areas (select multiple)</Label>
              <div className="grid gap-3">
                {REVIEW_FOCI.map((focus) => {
                  const Icon = focus.icon;
                  const isSelected = selectedFocus.includes(focus.id);
                  return (
                    <Card
                      key={focus.id}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => toggleFocus(focus.id)}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <Icon
                          size={20}
                          className={
                            isSelected ? 'text-primary' : 'text-muted-foreground'
                          }
                        />
                        <div className="flex-1">
                          <div className="font-medium">{focus.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {focus.description}
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle size={18} className="text-primary" />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {step === 'security' && (
            <div className="space-y-4">
              <Label>Security Checks</Label>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-md border">
                  <div>
                    <div className="font-medium text-sm">SQL Injection</div>
                    <div className="text-xs text-muted-foreground">
                      Detect raw SQL queries with user input
                    </div>
                  </div>
                  <Switch
                    checked={securityChecks.sqlInjection}
                    onCheckedChange={(checked) =>
                      setSecurityChecks((prev) => ({ ...prev, sqlInjection: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border">
                  <div>
                    <div className="font-medium text-sm">XSS Prevention</div>
                    <div className="text-xs text-muted-foreground">
                      Check for unescaped output
                    </div>
                  </div>
                  <Switch
                    checked={securityChecks.xss}
                    onCheckedChange={(checked) =>
                      setSecurityChecks((prev) => ({ ...prev, xss: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border">
                  <div>
                    <div className="font-medium text-sm">Auth Bypass</div>
                    <div className="text-xs text-muted-foreground">
                      Missing authentication checks
                    </div>
                  </div>
                  <Switch
                    checked={securityChecks.authBypass}
                    onCheckedChange={(checked) =>
                      setSecurityChecks((prev) => ({ ...prev, authBypass: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border">
                  <div>
                    <div className="font-medium text-sm">Secrets Detection</div>
                    <div className="text-xs text-muted-foreground">
                      Accidentally committed keys/tokens
                    </div>
                  </div>
                  <Switch
                    checked={securityChecks.secrets}
                    onCheckedChange={(checked) =>
                      setSecurityChecks((prev) => ({ ...prev, secrets: checked }))
                    }
                  />
                </div>
              </div>

              <div className="mt-4">
                <Label>Priority</Label>
                <div className="flex gap-2 mt-2">
                  {(['normal', 'high', 'critical'] as const).map((p) => (
                    <Button
                      key={p}
                      variant={priority === p ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPriority(p)}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted">
                <h4 className="font-semibold mb-3">Review Summary</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">PR:</dt>
                    <dd className="font-medium">{prInfo.owner}/{prInfo.repo}#{prInfo.number}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Focus:</dt>
                    <dd>{selectedFocus.map((f) => REVIEW_FOCI.find((rf) => rf.id === f)?.name).join(', ')}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Security:</dt>
                    <dd>
                      {Object.entries(securityChecks)
                        .filter(([, v]) => v)
                        .map(([k]) => k).length}{' '}
                      checks enabled
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Priority:</dt>
                    <dd className="capitalize">{priority}</dd>
                  </div>
                </dl>
              </div>
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
              onClick={handleReview}
              disabled={loading || !prUrl || selectedFocus.length === 0}
            >
              {loading && <Loader2 size={16} className="mr-2 animate-spin" />}
              <GitPullRequest size={16} className="mr-2" />
              Start Review
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!prUrl.includes('github.com') || selectedFocus.length === 0}
            >
              Continue
              <ArrowRight size={16} className="ml-2" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
