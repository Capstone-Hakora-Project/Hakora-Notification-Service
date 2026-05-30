const { execSync } = require('child_process');

const name = process.argv[2] || process.env.npm_config_name;

if (!name) {
  console.error('Thiếu tên migration.');
  console.error('   Ví dụ: yarn migration:create AddNotificationIndex');
  process.exit(1);
}

const migrationPath = `src/notification/database/migrations/${name}`;
const cmd = [
  'ts-node',
  '-r',
  'tsconfig-paths/register',
  './node_modules/typeorm/cli.js',
  'migration:create',
  migrationPath,
].join(' ');

console.log(`> ${cmd}\n`);
execSync(cmd, { stdio: 'inherit', shell: true });
