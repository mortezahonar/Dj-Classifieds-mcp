import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const repositoryUrl = 'https://github.com/mortezahonar/Dj-Classifieds-mcp';
const upstreamUrl = 'https://github.com/joomengine/joomla-mcp';

describe('downstream repository metadata', () => {
  it('uses the new public repository identity and blocks upstream package publication', async () => {
    const [dockerfile, readme, service, deployment, packageSource] = await Promise.all([
      readFile('Dockerfile', 'utf8'),
      readFile('README.md', 'utf8'),
      readFile('deploy/systemd/joomla-mcp.service', 'utf8'),
      readFile('docs/DEPLOYMENT.md', 'utf8'),
      readFile('package.json', 'utf8'),
    ]);
    const packageDocument = JSON.parse(packageSource) as {
      readonly name: string;
      readonly private: boolean;
      readonly homepage: string;
      readonly bugs: { readonly url: string };
      readonly repository: { readonly type: string; readonly url: string };
    };

    expect(packageDocument).toMatchObject({
      name: '@joomengine/joomla-mcp',
      private: true,
      homepage: `${repositoryUrl}#readme`,
      bugs: { url: `${repositoryUrl}/issues` },
      repository: {
        type: 'git',
        url: `git+${repositoryUrl}.git`,
      },
    });
    expect(readme).toContain(`git clone ${repositoryUrl}.git`);
    expect(readme).toContain(upstreamUrl);
    expect(dockerfile).toContain(`org.opencontainers.image.source="${repositoryUrl}"`);
    expect(service).toContain(`Documentation=${repositoryUrl}`);
    expect(deployment).toContain('Downstream notice');
    expect(deployment).toContain('does not publish an OCI\n> image');
  });
});
