import('./dist/server.js').catch(() => {
  process.stderr.write('Compiled server not found. Run "npm run build" first.\n');
  process.exitCode = 1;
});
