/** Tests for project-registry: project detection and listing. */
import { describe, it, expect } from 'vitest';
import {
  PROJECT_REGISTRY,
  detectProject,
  listProjects,
  type ProjectInfo,
} from './project-registry.js';

// ── listProjects ─────────────────────────────────────────────────────

describe('listProjects', () => {
  it('returns all projects as array', () => {
    const projects = listProjects();
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBe(Object.keys(PROJECT_REGISTRY).length);
  });

  it('includes mgmt project', () => {
    const projects = listProjects();
    const mgmt = projects.find(p => p.name === 'MGMT Platform');
    expect(mgmt).toBeDefined();
    expect(mgmt?.type).toBe('repo');
  });

  it('includes wordpress projects', () => {
    const projects = listProjects();
    const wpProjects = projects.filter(p => p.type === 'wordpress');
    expect(wpProjects.length).toBeGreaterThan(0);
  });

  it('includes kubernetes project', () => {
    const projects = listProjects();
    const k8s = projects.find(p => p.name === 'Kubernetes');
    expect(k8s).toBeDefined();
    expect(k8s?.type).toBe('kubernetes');
  });
});

// ── PROJECT_REGISTRY ─────────────────────────────────────────────────

describe('PROJECT_REGISTRY', () => {
  it('has required fields for each project', () => {
    for (const [key, project] of Object.entries(PROJECT_REGISTRY)) {
      expect(project.name).toBeDefined();
      expect(project.localPath).toBeDefined();
      expect(project.type).toBeDefined();
      expect(['repo', 'wordpress', 'kubernetes', 'docs', 'other']).toContain(project.type);
    }
  });

  it('mgmt project has correct path', () => {
    const mgmt = PROJECT_REGISTRY['mgmt'];
    expect(mgmt.localPath).toBe('/ccn-github/mgmt');
    expect(mgmt.githubRepo).toBe('CoastalCameraNetwork/mgmt');
  });

  it('wordpress projects have consistent naming', () => {
    const wpKeys = Object.keys(PROJECT_REGISTRY).filter(k => k.startsWith('wp-'));
    expect(wpKeys.length).toBeGreaterThan(0);
    for (const key of wpKeys) {
      const project = PROJECT_REGISTRY[key];
      expect(project.type).toBe('wordpress');
      expect(project.localPath).toContain('/ccn-github/wp-');
    }
  });

  it('nerve project points to correct repo', () => {
    const nerve = PROJECT_REGISTRY['nerve'];
    expect(nerve.githubRepo).toBe('CoastalCameraNetwork/openclaw-nerve');
  });

  it('orchestrator project points to correct repo', () => {
    const orchestrator = PROJECT_REGISTRY['orchestrator'];
    expect(orchestrator.githubRepo).toBe('CoastalCameraNetwork/openclaw-orchestrator');
  });
});

// ── detectProject ────────────────────────────────────────────────────

describe('detectProject', () => {
  // ── Explicit labels ────────────────────────────────────────────────

  describe('explicit project labels', () => {
    it('detects project from project: label', () => {
      const result = detectProject('Some task', ['project:mgmt']);
      expect(result).toBeDefined();
      expect(result?.name).toBe('MGMT Platform');
    });

    it('detects project from repo: label', () => {
      const result = detectProject('Some task', ['repo:wp-ccn']);
      expect(result).toBeDefined();
      expect(result?.name).toBe('WP CCN');
    });

    it('prioritizes labels over description matching', () => {
      // Description mentions kubernetes but label says mgmt
      const result = detectProject('Deploy kubernetes pod', ['project:mgmt']);
      expect(result?.name).toBe('MGMT Platform');
    });

    it('returns null for invalid project label', () => {
      const result = detectProject('Some task', ['project:nonexistent']);
      expect(result).toBeNull();
    });
  });

  // ── Description matching ───────────────────────────────────────────

  describe('description matching', () => {
    it('detects mgmt from description', () => {
      const result = detectProject('Deploy to mgmt platform');
      expect(result).toBeDefined();
      expect(result?.name).toBe('MGMT Platform');
    });

    it('detects kubernetes from description', () => {
      const result = detectProject('Create kubernetes namespace');
      expect(result).toBeDefined();
      expect(result?.type).toBe('kubernetes');
    });

    it('detects wordpress sites from description', () => {
      const result = detectProject('Update wp-ccn homepage');
      expect(result).toBeDefined();
      expect(result?.type).toBe('wordpress');
    });

    it('detects local path references', () => {
      const result = detectProject('Fix files in /ccn-github/mgmt/src');
      expect(result).toBeDefined();
      expect(result?.name).toBe('MGMT Platform');
    });

    it('detects github repo references', () => {
      const result = detectProject('PR in CoastalCameraNetwork/mgmt');
      expect(result).toBeDefined();
      expect(result?.name).toBe('MGMT Platform');
    });

    it('matches case-insensitively', () => {
      const result = detectProject('DEPLOY TO MGMT PLATFORM');
      expect(result).toBeDefined();
      expect(result?.name).toBe('MGMT Platform');
    });
  });

  // ── WordPress projects ─────────────────────────────────────────────

  describe('wordpress project detection', () => {
    it('detects wp-ccn', () => {
      const result = detectProject('Fix wp-ccn header');
      expect(result?.name).toBe('WP CCN');
    });

    it('detects wp-hdbc', () => {
      const result = detectProject('Update wp-hdbc plugins');
      expect(result?.name).toBe('WP HDBC');
    });

    it('detects wp-njbc', () => {
      const result = detectProject('WP NJBC theme update');
      expect(result?.name).toBe('WP NJBC');
    });

    it('detects wp-nybc', () => {
      const result = detectProject('Fix wp-nybc navigation');
      expect(result?.name).toBe('WP NYBC');
    });

    it('detects wp-tsv', () => {
      const result = detectProject('WP TSV plugin install');
      expect(result?.name).toBe('WP TSV');
    });
  });

  // ── Other projects ─────────────────────────────────────────────────

  describe('other project detection', () => {
    it('detects hls-recorder', () => {
      const result = detectProject('Fix hls-recorder service');
      expect(result?.name).toBe('HLS Recorder');
    });

    it('detects splash-scripts', () => {
      const result = detectProject('Update splash-scripts cron job');
      expect(result?.name).toBe('Splash Scripts');
    });

    it('detects nerve', () => {
      const result = detectProject('Add feature to nerve UI');
      expect(result?.name).toBe('Nerve');
    });

    it('detects orchestrator', () => {
      const result = detectProject('Fix orchestrator agent routing');
      expect(result?.name).toBe('Orchestrator');
    });

    it('detects docs', () => {
      const result = detectProject('Update documentation README');
      expect(result?.name).toBe('Documentation');
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns null for unrecognized project', () => {
      const result = detectProject('Fix something in unknown-project');
      expect(result).toBeNull();
    });

    it('returns null for empty description', () => {
      const result = detectProject('');
      expect(result).toBeNull();
    });

    it('returns null for empty description and empty labels', () => {
      const result = detectProject('', []);
      expect(result).toBeNull();
    });

    it('handles labels without project prefix', () => {
      // Labels without project: or repo: prefix should not match
      const result = detectProject('Some task', ['bug', 'urgent']);
      expect(result).toBeNull();
    });

    it('matches partial project names in description', () => {
      const result = detectProject('The mgmt platform needs work');
      expect(result).toBeDefined();
      expect(result?.name).toBe('MGMT Platform');
    });
  });

  // ── Labels + description combination ───────────────────────────────

  describe('labels and description combination', () => {
    it('uses labels when provided', () => {
      const result = detectProject('General task', ['project:kubernetes']);
      expect(result?.type).toBe('kubernetes');
    });

    it('falls back to description when no project label', () => {
      const result = detectProject('Deploy to kubernetes', ['bug', 'high-priority']);
      expect(result?.type).toBe('kubernetes');
    });

    it('combines description and labels for matching', () => {
      const result = detectProject('Update wp-ccn', ['project:wp-ccn']);
      expect(result?.name).toBe('WP CCN');
    });
  });
});

// ── Project types ────────────────────────────────────────────────────

describe('project types', () => {
  it('mgmt is type repo', () => {
    expect(PROJECT_REGISTRY['mgmt'].type).toBe('repo');
  });

  it('all wp-* projects are type wordpress', () => {
    for (const [key, project] of Object.entries(PROJECT_REGISTRY)) {
      if (key.startsWith('wp-')) {
        expect(project.type).toBe('wordpress');
      }
    }
  });

  it('kubernetes is type kubernetes', () => {
    expect(PROJECT_REGISTRY['kubernetes'].type).toBe('kubernetes');
  });

  it('docs is type docs', () => {
    expect(PROJECT_REGISTRY['docs'].type).toBe('docs');
  });

  it('hls-recorder is type repo', () => {
    expect(PROJECT_REGISTRY['hls-recorder'].type).toBe('repo');
  });

  it('splash-scripts is type repo', () => {
    expect(PROJECT_REGISTRY['splash-scripts'].type).toBe('repo');
  });
});
