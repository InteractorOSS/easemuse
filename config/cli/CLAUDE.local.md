# CLI Project Configuration

## Technology Stack

This is a command-line interface (CLI) project. Apply the following technology-specific guidance.

### Language
- **Node.js (TypeScript)**

### CLI Framework
- **Commander.js** / yargs / oclif

---

## Project Structure

### Node.js
```
src/
├── index.ts              # Entry point
├── cli.ts                # CLI setup
├── commands/
│   ├── init.ts           # Individual commands
│   ├── build.ts
│   └── deploy.ts
├── lib/                  # Core logic
├── utils/                # Utilities
├── config/               # Configuration handling
└── types/                # TypeScript types

bin/
└── cli                   # Executable entry
```

---

## Commands

### Development
```bash
npm run dev              # Run with ts-node
npm run build            # Build TypeScript
npm link                 # Link for local testing
```

### Testing
```bash
npm test                 # Run tests
npm run test:e2e         # E2E command tests
```

---

## CLI Design Patterns

### Command Structure
```typescript
// Commander.js example
import { Command } from 'commander';

const program = new Command();

program
  .name('mycli')
  .description('My awesome CLI tool')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize a new project')
  .argument('[name]', 'Project name', 'my-project')
  .option('-t, --template <template>', 'Template to use', 'default')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .action(async (name, options) => {
    await initCommand(name, options);
  });

program.parse();
```

### Subcommands
```typescript
// Organize complex CLIs with subcommands
program
  .command('config')
  .description('Manage configuration');

program
  .command('config get <key>')
  .description('Get a configuration value')
  .action((key) => console.log(config.get(key)));

program
  .command('config set <key> <value>')
  .description('Set a configuration value')
  .action((key, value) => config.set(key, value));
```

---

## User Interaction

### Prompts
```typescript
import inquirer from 'inquirer';

async function getProjectConfig() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Project name:',
      default: 'my-project',
      validate: (input) => input.length > 0 || 'Name is required',
    },
    {
      type: 'list',
      name: 'template',
      message: 'Select a template:',
      choices: ['default', 'typescript', 'react'],
    },
    {
      type: 'confirm',
      name: 'git',
      message: 'Initialize git repository?',
      default: true,
    },
  ]);

  return answers;
}
```

### Progress Indicators
```typescript
import ora from 'ora';

async function installDependencies() {
  const spinner = ora('Installing dependencies...').start();

  try {
    await runCommand('npm install');
    spinner.succeed('Dependencies installed');
  } catch (error) {
    spinner.fail('Failed to install dependencies');
    throw error;
  }
}

// Progress bar
import cliProgress from 'cli-progress';

const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
bar.start(100, 0);
// Update: bar.update(50);
bar.stop();
```

### Colored Output
```typescript
import chalk from 'chalk';

console.log(chalk.green('Success'));
console.log(chalk.red('Error'));
console.log(chalk.yellow('Warning'));
console.log(chalk.blue('Info'));
console.log(chalk.bold('Important'));
console.log(chalk.dim('Secondary info'));
```

---

## Configuration

### Config File Handling
```typescript
import Conf from 'conf';

const config = new Conf({
  projectName: 'mycli',
  schema: {
    apiKey: { type: 'string' },
    defaultTemplate: { type: 'string', default: 'default' },
  },
});

// Usage
config.set('apiKey', 'sk-xxx');
const apiKey = config.get('apiKey');
```

### Environment Variables
```typescript
import { config } from 'dotenv';
import { z } from 'zod';

config();

const EnvSchema = z.object({
  API_KEY: z.string().optional(),
  DEBUG: z.string().transform((v) => v === 'true').default('false'),
});

export const env = EnvSchema.parse(process.env);
```

---

## Error Handling

### User-Friendly Errors
```typescript
class CLIError extends Error {
  constructor(
    message: string,
    public suggestion?: string
  ) {
    super(message);
    this.name = 'CLIError';
  }
}

function handleError(error: unknown) {
  if (error instanceof CLIError) {
    console.error(chalk.red(`Error: ${error.message}`));
    if (error.suggestion) {
      console.error(chalk.yellow(`Suggestion: ${error.suggestion}`));
    }
    process.exit(1);
  }

  // Unexpected error
  console.error(chalk.red('An unexpected error occurred'));
  if (process.env.DEBUG) {
    console.error(error);
  }
  process.exit(1);
}
```

### Validation
```typescript
function validateProjectName(name: string): void {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new CLIError(
      'Invalid project name',
      'Use lowercase letters, numbers, and hyphens only'
    );
  }

  if (fs.existsSync(name)) {
    throw new CLIError(
      `Directory "${name}" already exists`,
      'Choose a different name or remove the existing directory'
    );
  }
}
```

---

## Testing

### Command Testing
```typescript
import { execSync } from 'child_process';

describe('init command', () => {
  it('should create project directory', () => {
    execSync('node bin/cli init test-project --yes', {
      cwd: testDir,
    });

    expect(fs.existsSync(path.join(testDir, 'test-project'))).toBe(true);
    expect(
      fs.existsSync(path.join(testDir, 'test-project', 'package.json'))
    ).toBe(true);
  });

  it('should show error for invalid name', () => {
    expect(() => {
      execSync('node bin/cli init "Invalid Name"', {
        cwd: testDir,
        stdio: 'pipe',
      });
    }).toThrow();
  });
});
```

### Mocking Prompts
```typescript
import inquirer from 'inquirer';

jest.mock('inquirer');

beforeEach(() => {
  (inquirer.prompt as jest.Mock).mockResolvedValue({
    name: 'test-project',
    template: 'default',
    git: true,
  });
});
```

---

## Distribution

### npm Publishing
```json
{
  "name": "my-cli",
  "version": "1.0.0",
  "bin": {
    "mycli": "./bin/cli"
  },
  "files": ["bin", "dist"],
  "engines": {
    "node": ">=18"
  }
}
```

### Binary Distribution
```bash
# Using pkg
npx pkg . --targets node18-linux-x64,node18-macos-x64,node18-win-x64
```

---

## Help & Documentation

### Built-in Help
```typescript
program
  .command('init [name]')
  .description('Initialize a new project')
  .addHelpText('after', `
Examples:
  $ mycli init my-project
  $ mycli init my-project --template typescript
  $ mycli init --yes
`);
```

---

## Best Practices

### Exit Codes
```typescript
// 0: Success
// 1: General error
// 2: Misuse of command

process.exit(0); // Success
process.exit(1); // Error
```

### Signal Handling
```typescript
process.on('SIGINT', () => {
  console.log('\nOperation cancelled');
  process.exit(130);
});

process.on('SIGTERM', () => {
  // Cleanup
  process.exit(0);
});
```

### Version Checking
```typescript
async function checkForUpdates() {
  const latestVersion = await getLatestVersion('my-cli');
  const currentVersion = require('../package.json').version;

  if (semver.gt(latestVersion, currentVersion)) {
    console.log(
      chalk.yellow(`Update available: ${currentVersion} -> ${latestVersion}`)
    );
    console.log(chalk.dim('Run `npm install -g my-cli` to update'));
  }
}
```
