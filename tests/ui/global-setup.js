import { startUiEnvironment } from './environment.js';

export default async function globalSetup() {
  await startUiEnvironment();
}
