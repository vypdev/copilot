const fs = require('node:fs');
fs.appendFileSync(process.env.GITHUB_STATE, `workspace=${fs.realpathSync(process.cwd())}\n`);
