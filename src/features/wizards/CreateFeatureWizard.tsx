/**
 * Create Feature Wizard
 *
 * Step-by-step workflow for creating new features:
 * 1. Define feature scope
 * 2. Select target project
 * 3. Choose agent team
 * 4. Review and confirm
 */

import { useState, useCallback } from 'react';
import { Wand2, Folder, Users, CheckCircle, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useCreateTask } from '../orchestrator/useOrchestrator';

interface CreateFeatureWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (taskId: string) => void;
}

const PROJECTS = [
  { id: 'nerve', name: 'Nerve (UI)', description: 'Frontend and backend server' },
  { id: 'mgmt', name: 'Management', description: 'Platform management' },
  { id: 'wp-ccn', name: 'WP CCN', description: 'WordPress site' },
  { id: 'kubernetes', name: 'Kubernetes', description: 'K8s manifests and configs' },
];

const AGENT_TEAMS = [
  { id: 'frontend', name: 'Frontend Agent', description: 'React, TypeScript, UI' },
  { id: 'backend', name: 'Backend Agent', description: 'Hono, Node.js, APIs' },
  { id: 'fullstack', name: 'Full Stack', description: 'End-to-end development' },
  { id: 'k8s', name: 'Kubernetes', description: 'Deployment and infrastructure' },
];

type WizardStep = 'scope' | 'project' | 'team' | 'review';

const STEPS: WizardStep[] = ['scope', 'project', 'team', 'review'];

export function CreateFeatureWizard({
  open,
  onOpenChange,
  onSuccess,
}: CreateFeatureWizardProps) {
  const [step, setStep] = useState<WizardStep>('scope');
  const [featureName, setFeatureName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('nerve');
  const [selectedAgent, setSelectedAgent] = useState<string>('fullstack');
  const [budget, setBudget] = useState<string>('5.00');

  const { createTask, loading } = useCreateTask();

  const currentStepIndex = STEPS.indexOf(step);
  const isLastStep = step === 'review';
  const isFirstStep = step === 'scope';

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

  const handleCreate = useCallback(async () => {
    try {
      const taskTitle = `Create ${featureName} feature`;
      const taskDescription = `${description}\n\nTarget Project: ${selectedProject}\nTarget Agent: ${selectedAgent}\nBudget: $${budget}`;

      const result = await createTask({
        title: taskTitle,
        description: taskDescription,
        priority: 'normal',
        labels: [`project:${selectedProject}`],
      });

      onSuccess?.(result.kanban_id);
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to create feature task:', err);
    }
  }, [featureName, description, selectedProject, selectedAgent, budget, createTask, onSuccess, onOpenChange]);

  const handleClose = useCallback(() => {
    setStep('scope');
    setFeatureName('');
    setDescription('');
    setSelectedProject('nerve');
    setSelectedAgent('fullstack');
    setBudget('5.00');
    onOpenChange(false);
  }, [onOpenChange]);

  // Handle Enter key to advance (except on last step)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLastStep && e.ctrlKey) {
      handleNext();
    }
  }, [isLastStep, handleNext]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 size={20} className="text-primary" />
            Create Feature Wizard
          </DialogTitle>
          <DialogDescription>
            Step-by-step feature creation workflow
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
          {step === 'scope' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="featureName">Feature Name</Label>
                <Input
                  id="featureName"
                  value={featureName}
                  onChange={(e) => setFeatureName(e.target.value)}
                  placeholder="e.g., Dark Mode, Export to PDF"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                  placeholder="Describe what this feature should do..."
                  className="mt-1 min-h-[120px]"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Press Ctrl+Enter to continue
              </p>
            </div>
          )}

          {step === 'project' && (
            <div className="space-y-3">
              <Label>Select Target Project</Label>
              <div className="grid gap-3">
                {PROJECTS.map((project) => (
                  <Card
                    key={project.id}
                    className={`cursor-pointer transition-colors ${
                      selectedProject === project.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setSelectedProject(project.id)}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <Folder
                        size={20}
                        className={
                          selectedProject === project.id
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        }
                      />
                      <div>
                        <div className="font-medium">{project.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {project.description}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {step === 'team' && (
            <div className="space-y-3">
              <Label>Select Agent Team</Label>
              <div className="grid gap-3">
                {AGENT_TEAMS.map((agent) => (
                  <Card
                    key={agent.id}
                    className={`cursor-pointer transition-colors ${
                      selectedAgent === agent.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setSelectedAgent(agent.id)}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <Users
                        size={20}
                        className={
                          selectedAgent === agent.id
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        }
                      />
                      <div>
                        <div className="font-medium">{agent.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {agent.description}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="mt-4">
                <Label htmlFor="budget">Budget Limit (USD)</Label>
                <Input
                  id="budget"
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  step="0.01"
                  min="0"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted">
                <h4 className="font-semibold mb-3">Review Summary</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Feature:</dt>
                    <dd className="font-medium">{featureName || 'Unnamed'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Project:</dt>
                    <dd>{PROJECTS.find((p) => p.id === selectedProject)?.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Agent:</dt>
                    <dd>{AGENT_TEAMS.find((a) => a.id === selectedAgent)?.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Budget:</dt>
                    <dd>${budget}</dd>
                  </div>
                </dl>
              </div>
              <div className="text-xs text-muted-foreground">
                This will create a new task in the kanban board and assign it to the selected agent.
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
            <Button onClick={handleCreate} disabled={loading || !featureName.trim()}>
              {loading && <Loader2 size={16} className="mr-2 animate-spin" />}
              <CheckCircle size={16} className="mr-2" />
              Create Feature
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!featureName.trim() || !description.trim()}
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
