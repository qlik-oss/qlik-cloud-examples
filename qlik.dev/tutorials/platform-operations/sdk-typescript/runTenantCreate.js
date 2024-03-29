const fs = require('fs');
const yargs = require('yargs');
const dotenv = require('dotenv');
const { createSdkClient } = require('./qlik-sdk-helper');
const { runTenantCreate } = require('./tenant_create');

(async () => {
  // Read args from .env file if it exists, otherwise from args
  let argsSource = {};
  if (fs.existsSync('.env')) {
    argsSource = dotenv.config({ path: '.env' }).parsed;
  } else {
    argsSource = yargs(process.argv.slice(2))
    .usage('Create a tenant\n\nUsage: $0 [options]')
    .help('help').alias('help', 'h')
    .describe({
      clientId: 'OAuth Client ID',
      clientSecret: 'OAuth Client Secret',
      sourceTenantUrl: 'The hostname of the source tenant, for example: tenant.region.qlikcloud.com',
      registrationTenantUrl: 'The Qlik tenant registration hostname, for example: register.<REGION>.qlikcloud.com',
      sourceTenantAdminEmail: 'The email address of a tenant admin in the source tenant. If this is provided the tenant admin from the source tenant will be given access to the new tenant.',
    })
    .demandOption([
      'clientId',
      'clientSecret',
      'sourceTenantUrl',
      'registrationTenantUrl',
      'sourceTenantAdminEmail',
    ]).argv;
  }

  const {
    clientId,
    clientSecret,
    sourceTenantUrl,
    registrationTenantUrl,
    sourceTenantAdminEmail,
  } = argsSource;
  
  const sourceTenantClient = await createSdkClient(clientId, clientSecret, sourceTenantUrl);
  const registrationClient = await createSdkClient(clientId, clientSecret, registrationTenantUrl);

  const result = await runTenantCreate(sourceTenantClient, registrationClient, clientId, clientSecret, sourceTenantAdminEmail);
  //console.log(result);
})();
