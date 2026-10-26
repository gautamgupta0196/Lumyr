const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (process.platform !== 'darwin') return;

  const appOutDir = context.appOutDir;
  console.log(`[afterPack] Cleaning resource forks in ${appOutDir}...`);

  try {
    // Remove all extended attributes (resource forks, fileprovider, quarantine, etc.)
    execSync(`xattr -rc "${appOutDir}"`, { stdio: 'inherit' });

    // Remove ._ resource fork files
    execSync(`find "${appOutDir}" -name '._*' -delete`, { stdio: 'inherit' });

    // Remove .DS_Store files
    execSync(`find "${appOutDir}" -name '.DS_Store' -delete`, { stdio: 'inherit' });

    // Use dot_clean to merge any remaining resource forks
    execSync(`dot_clean "${appOutDir}"`, { stdio: 'inherit' });

    console.log('[afterPack] Resource fork cleanup complete.');
  } catch (err) {
    console.warn('[afterPack] Cleanup warning:', err.message);
  }
};
