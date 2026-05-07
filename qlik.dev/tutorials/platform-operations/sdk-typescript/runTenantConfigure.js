import fs from 'fs';
import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runTenantConfigure } from './tenant_configure.js';

(async () => {
  let argsSource = {};
  if (fs.existsSync('.env')) {
    argsSource = dotenv.config({ path: '.env' }).parsed;
  } else {
    argsSource = await yargs(hideBin(process.argv))
      .usage('Configure a tenant\n\nUsage: $0 [options]')
      .help('help').alias('help', 'h')
      .describe({
        clientId: 'OAuth Client ID',
        clientSecret: 'OAuth Client Secret',
        targetTenantUrl: 'The hostname of the tenant, for example: tenant.region.qlikcloud.com',
      })
      .demandOption([
        'clientId',
        'clientSecret',
        'targetTenantUrl',
      ])
      .argv;
  }

  const {
    targetTenantUrl,
    clientId,
    clientSecret,
  } = argsSource;

  const hostConfig = { authType: 'oauth2', host: targetTenantUrl, clientId, clientSecret };
  await runTenantConfigure(hostConfig);
})();
