/**
 * Project Registry
 * 
 * Maps project names/repo names to local paths and GitHub repos.
 * Used by orchestrator to tell agents where to work.
 */

export interface ProjectInfo {
  name: string;
  localPath: string;
  githubRepo?: string;  // e.g., "CoastalCameraNetwork/mgmt"
  description?: string;
  type: 'repo' | 'wordpress' | 'kubernetes' | 'docs' | 'other';
}

/**
 * Project registry - maps project slugs to paths and repos.
 */
export const PROJECT_REGISTRY: Record<string, ProjectInfo> = {
  // MGMT Platform
  'mgmt': {
    name: 'MGMT Platform',
    localPath: '/ccn-github/mgmt',
    githubRepo: 'CoastalCameraNetwork/mgmt',
    description: 'Management platform (Fastify, React, Drizzle)',
    type: 'repo',
  },
  
  // WordPress Sites
  'wp-ccn': {
    name: 'WP CCN',
    localPath: '/ccn-github/wp-ccn',
    githubRepo: 'CoastalCameraNetwork/wp-ccn',
    description: 'CCN WordPress site',
    type: 'wordpress',
  },
  'wp-hdbc': {
    name: 'WP HDBC',
    localPath: '/ccn-github/wp-hdbc',
    githubRepo: 'CoastalCameraNetwork/wp-hdbc',
    description: 'HDBC WordPress site',
    type: 'wordpress',
  },
  'wp-njbc': {
    name: 'WP NJBC',
    localPath: '/ccn-github/wp-njbc',
    githubRepo: 'CoastalCameraNetwork/wp-njbc',
    description: 'NJBC WordPress site',
    type: 'wordpress',
  },
  'wp-nybc': {
    name: 'WP NYBC',
    localPath: '/ccn-github/wp-nybc',
    githubRepo: 'CoastalCameraNetwork/wp-nybc',
    description: 'NYBC WordPress site',
    type: 'wordpress',
  },
  'wp-tsv': {
    name: 'WP TSV',
    localPath: '/ccn-github/wp-tsv',
    githubRepo: 'CoastalCameraNetwork/wp-tsv',
    description: 'TSV WordPress site',
    type: 'wordpress',
  },
  
  // Kubernetes
  'kubernetes': {
    name: 'Kubernetes',
    localPath: '/ccn-github/kubernetes',
    githubRepo: 'CoastalCameraNetwork/kubernetes',
    description: 'K8s manifests and configs',
    type: 'kubernetes',
  },
  
  // Streaming
  'hls-recorder': {
    name: 'HLS Recorder',
    localPath: '/ccn-github/hls-recorder',
    githubRepo: 'CoastalCameraNetwork/hls-recorder',
    description: 'HLS recording service',
    type: 'repo',
  },
  'splash-scripts': {
    name: 'Splash Scripts',
    localPath: '/ccn-github/splash-scripts',
    githubRepo: 'CoastalCameraNetwork/splash-scripts',
    description: 'YouTube/social automation',
    type: 'repo',
  },
  
  // Nerve
  'nerve': {
    name: 'Nerve',
    localPath: '/ccn-github/openclaw-nerve',
    githubRepo: 'CoastalCameraNetwork/openclaw-nerve',
    description: 'Nerve UI',
    type: 'repo',
  },
  
  // Orchestrator
  'orchestrator': {
    name: 'Orchestrator',
    localPath: '/ccn-github/openclaw-orchestrator',
    githubRepo: 'CoastalCameraNetwork/openclaw-orchestrator',
    description: 'OpenClaw Orchestrator',
    type: 'repo',
  },
  
  // Docs
  'docs': {
    name: 'Documentation',
    localPath: '/ccn-github/docs',
    githubRepo: 'CoastalCameraNetwork/docs',
    description: 'Documentation',
    type: 'docs',
  },
};

/**
 * Extract project from task description or labels.
 * Returns project info if found.
 */
export function detectProject(description: string, labels: string[] = []): ProjectInfo | null {
  const text = (description + ' ' + labels.join(' ')).toLowerCase();
  
  // Check for explicit project labels first (e.g., "project:mgmt", "repo:wp-ccn")
  for (const label of labels) {
    if (label.startsWith('project:') || label.startsWith('repo:')) {
      const projectName = label.split(':')[1];
      if (projectName && PROJECT_REGISTRY[projectName]) {
        return PROJECT_REGISTRY[projectName];
      }
    }
  }
  
  // Match project names in description
  for (const [key, project] of Object.entries(PROJECT_REGISTRY)) {
    // Match project name, local path pattern, or github repo
    const patterns = [
      new RegExp(`\\b${key}\\b`, 'i'),
      new RegExp(`\\b${project.name}\\b`, 'i'),
      new RegExp(project.localPath, 'i'),
    ];
    
    if (project.githubRepo) {
      patterns.push(new RegExp(project.githubRepo, 'i'));
    }
    
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return project;
      }
    }
  }
  
  return null;
}

/**
 * Get all projects as array.
 */
export function listProjects(): ProjectInfo[] {
  return Object.values(PROJECT_REGISTRY);
}
