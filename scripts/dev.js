const { spawn } = require('child_process');

const processes = [];

function run(name, command, args) {
  const child = spawn(command, args, {
    shell: true,
    stdio: 'pipe'
  });

  child.stdout.on('data', (data) => {
    process.stdout.write(`[${name}] ${data}`);
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(`[${name}] ${data}`);
  });

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[${name}] exited with code ${code}`);
    }
  });

  processes.push(child);
}

function stopAll() {
  for (const child of processes) {
    child.kill();
  }
}

process.on('SIGINT', () => {
  stopAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopAll();
  process.exit(0);
});

run('api', 'node', ['backend/server.js']);
run('web', 'npx', ['ng', 'serve', '--proxy-config', 'proxy.conf.json']);

console.log('Starting News Analyser...');
console.log('Frontend: http://localhost:4200');
console.log('Backend:  http://localhost:3000');
