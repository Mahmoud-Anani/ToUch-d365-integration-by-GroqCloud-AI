import { createInterface } from 'node:readline';
import { hashPassword } from '../src/auth/password';

async function readPassword(): Promise<string> {
  const fromArg = process.argv[2] ?? process.env.HASH_PASSWORD;
  if (fromArg) return fromArg;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Password to hash: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  const password = await readPassword();
  if (!password) {
    console.error('A password is required. Pass it as an argument or set HASH_PASSWORD.');
    process.exitCode = 1;
    return;
  }
  const hash = await hashPassword(password);
  console.log(hash);
  console.error('');
  console.error('Add this value to config/users.json as the user\'s "passwordHash".');
}

void main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
