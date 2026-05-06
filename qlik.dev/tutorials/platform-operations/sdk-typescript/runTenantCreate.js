import fs from 'fs';
import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runTenantCreate } from './tenant_create.js';

(async () => {
  let argsSource = {};
  if (fs.existsSync('.env')) {
    argsSource = dotenv.config({ path: '.env' }).parsed;
  } else {
    argsSource = await yargs(hideBin(process.argv))
      .usage('Create a tenant\n\nUsage: $0 [options]')
      .help('help').alias('help', 'h')
      .describe({
        clientId: 'OAuth Client ID',
        clientSecret: 'OAuth Client Secret',
        sourceTenantUrl: 'The hostname of the source tenant, for example: tenant.region.qlikcloud.com',
        registrationTenantUrl: 'The Qlik tenant registration hostname, for example: register.<REGION>.qlikcloud.com',
        sourceTenantAdminEmail: 'The email address of a tenant admin in the source tenant.',
      })
      .demandOption([
        'clientId',
        'clientSecret',
        'sourceTenantUrl',
        'registrationTenantUrl',
        'sourceTenantAdminEmail',
      ])
      .argv;
  }

  const {
    clientId,
    clientSecret,
    sourceTenantUrl,
    registrationTenantUrl,
    sourceTenantAdminEmail,
  } = argsSource;

  const sourceHostConfig = { authType: 'oauth2', host: sourceTenantUrl, clientId, clientSecret };
  const registrationHostConfig = { authType: 'oauth2', host: registrationTenantUrl, clientId, clientSecret };

  await runTenantCreate(sourceHostConfig, registrationHostConfig, clientId, clientSecret, sourceTenantAdminEmail);
})();
