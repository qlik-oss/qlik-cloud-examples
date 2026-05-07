import fs from 'fs';
import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runTenantAddUser } from './tenant_add_user.js';

(async () => {
  let argsSource = {};
  if (fs.existsSync('.env')) {
    argsSource = dotenv.config({ path: '.env' }).parsed;
  } else {
    argsSource = await yargs(hideBin(process.argv))
      .usage('Add an interactive user to a tenant\n\nUsage: $0 [options]')
      .help('help').alias('help', 'h')
      .describe({
        clientId: 'OAuth Client ID',
        clientSecret: 'OAuth Client Secret',
        sourceTenantUrl: 'The hostname of the source tenant, for example: tenant.region.qlikcloud.com',
        targetTenantUrl: 'The hostname of the target tenant, for example: tenant.region.qlikcloud.com',
        email: 'Email address of the Qlik Account user to add as TenantAdmin',
      })
      .demandOption([
        'clientId',
        'clientSecret',
        'sourceTenantUrl',
        'targetTenantUrl',
        'email',
      ])
      .argv;
  }

  const {
    clientId,
    clientSecret,
    sourceTenantUrl,
    targetTenantUrl,
    email,
  } = argsSource;

  const sourceHostConfig = { authType: 'oauth2', host: sourceTenantUrl, clientId, clientSecret };
  const targetHostConfig = { authType: 'oauth2', host: targetTenantUrl, clientId, clientSecret };

  await runTenantAddUser(sourceHostConfig, targetHostConfig, email);
})();
