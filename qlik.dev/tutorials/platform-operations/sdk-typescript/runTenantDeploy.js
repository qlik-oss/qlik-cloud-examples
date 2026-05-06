import fs from 'fs';
import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runTenantDeployContent } from './tenant_deploy_content.js';

(async () => {
  let argsSource = {};
  if (fs.existsSync('.env')) {
    argsSource = dotenv.config({ path: '.env' }).parsed;
  } else {
    argsSource = await yargs(hideBin(process.argv))
      .usage('Deploy content to a tenant\n\nUsage: $0 [options]')
      .help('help').alias('help', 'h')
      .describe({
        clientId: 'OAuth Client ID',
        clientSecret: 'OAuth Client Secret',
        sourceTenantUrl: 'The hostname of the tenant, for example: tenant.region.qlikcloud.com',
        targetTenantUrl: 'The hostname of the tenant, for example: tenant.region.qlikcloud.com',
        sourceAppId: 'source app id',
        analyticsConsumerGroupId: 'Optional: group ID (from runTenantConfigure) used to verify consumer access to the published app',
      })
      .demandOption([
        'clientId',
        'clientSecret',
        'sourceTenantUrl',
        'targetTenantUrl',
        'sourceAppId',
      ])
      .argv;
  }

  const {
    clientId,
    clientSecret,
    sourceTenantUrl,
    targetTenantUrl,
    sourceAppId,
    analyticsConsumerGroupId,
  } = argsSource;

  const sourceHostConfig = { authType: 'oauth2', host: sourceTenantUrl, clientId, clientSecret };
  const targetHostConfig = { authType: 'oauth2', host: targetTenantUrl, clientId, clientSecret };

  await runTenantDeployContent({
    sourceHostConfig, sourceAppId, targetHostConfig, analyticsConsumerGroupId,
  });
})();
