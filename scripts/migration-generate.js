const { execSync } = require('child_process');

const name = process.argv[2] || process.env.npm_config_name;

if (!name) {
  console.error('Thiếu tên migration.');
  console.error('   Ví dụ: yarn migration:generate AddNotificationIndex');
  console.error('   Hoặc:  yarn migration:generate --name=AddNotificationIndex');
  process.exit(1);
}

const dataSourcePath = 'src/notification/database/database-source.ts';
const migrationPath = `src/notification/database/migrations/${name}`;
const cmd = [
  'ts-node',
  '-r',
  'tsconfig-paths/register',
  './node_modules/typeorm/cli.js',
  'migration:generate',
  migrationPath,
  '-d',
  dataSourcePath,
].join(' ');

console.log(`> ${cmd}\n`);
execSync(cmd, { stdio: 'inherit', shell: true });
