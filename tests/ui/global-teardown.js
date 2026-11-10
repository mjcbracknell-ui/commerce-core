import { stopUiEnvironment } from './environment.js';

export default async function globalTeardown() {
  await stopUiEnvironment();
}
