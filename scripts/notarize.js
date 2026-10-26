const path = require('path');
const { notarize } = require('@electron/notarize');

exports.default = async function notarizeApp(context) {
  if (process.platform !== 'darwin') return;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  const maxAttempts = Number.parseInt(process.env.LUMYR_NOTARIZE_RETRIES || '3', 10);
  const baseDelayMs = Number.parseInt(process.env.LUMYR_NOTARIZE_RETRY_DELAY_MS || '30000', 10);

  if (!appleId || !appleIdPassword) {
    const message =
      '[notarize] APPLE_ID or APPLE_APP_SPECIFIC_PASSWORD missing; skipping notarization.';
    if (process.env.CI) {
      throw new Error(message);
    }
    console.warn(message);
    return;
  }

  const appOutDir = context.appOutDir;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`[notarize] Notarizing ${appPath}...`);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await notarize({
        appBundleId: context.packager.appInfo.id,
        appPath,
        appleId,
        appleIdPassword,
        teamId,
      });
      console.log('[notarize] Notarization complete.');
      return;
    } catch (err) {
      const message = err?.message || String(err);
      if (attempt >= maxAttempts) {
        console.error(`[notarize] Failed after ${attempt} attempt(s): ${message}`);
        throw err;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(
        `[notarize] Attempt ${attempt} failed: ${message}. Retrying in ${Math.round(delayMs / 1000)}s...`
      );
      await sleep(delayMs);
    }
  }
};
