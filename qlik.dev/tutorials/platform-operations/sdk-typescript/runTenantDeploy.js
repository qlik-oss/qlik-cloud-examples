const { default: Qlik, AuthType } = require('@qlik/sdk');
const fs = require('fs');
const yargs = require('yargs');
const dotenv = require('dotenv');
const { createSdkClient } = require('./qlik-sdk-helper');
const { runTenantDeployContent } = require('./tenant_deploy_content');

(async () => {
  // Read args from .env file if it exists, otherwise from args
  let argsSource = {};
  if (fs.existsSync('.env')) {
    argsSource = dotenv.config({ path: '.env' }).parsed;
  } else {
    const { argv } = yargs(process.argv.slice(2))
      .usage('Deploy content to a tenant\n\nUsage: $0 [options]')
      .help('help').alias('help', 'h')
      .describe({
        clientId: 'OAuth Client ID',
        clientSecret: 'OAuth Client Secret',
        sourceTenantUrl: 'The hostname of the tenant, for example: tenant.region.qlikcloud.com',
        targetTenantUrl: 'The hostname of the tenant, for example: tenant.region.qlikcloud.com',
        sourceAppId: 'source app id',
        jwtIssuer: "The 'issuer' field to use in the JWT.",
        jwtKeyId: "The 'kid' field to use in the JWT.",
        jwtPrivateKeyFilePath: 'The path to the local private key file.',
        jwtPublicKeyFilePath: 'The path to the local public key file.',
      })
      .demandOption([
        'clientId',
        'clientSecret',
        'sourceTenantUrl',
        'targetTenantUrl',
        'sourceAppId',
        'jwtIssuer',
        'jwtKeyId',
        'jwtPrivateKeyFilePath',
        'jwtPublicKeyFilePath',
      ]);
    argsSource = argv;
  }

  const {
    clientId,
    clientSecret,
    sourceTenantUrl,
    targetTenantUrl,
    sourceAppId,
    jwtIssuer,
    jwtKeyId,
    jwtPrivateKeyFilePath,
    jwtPublicKeyFilePath,
  } = argsSource;

  const sourceTenantClient = await createSdkClient(clientId, clientSecret, sourceTenantUrl);
  const targetTenantClient = await createSdkClient(clientId, clientSecret, targetTenantUrl);
  const jwtPrivateKey = fs.readFileSync(jwtPrivateKeyFilePath, 'utf8');
  const jwtPublicKey = fs.readFileSync(jwtPublicKeyFilePath, 'utf8');
  const jwtConfig = {
    jwtIssuer,
    jwtKeyId,
    jwtPrivateKey,
    jwtPublicKey,
  };

  await runTenantDeployContent({
    sourceTenantClient, sourceAppId, targetTenantClient, jwtConfig,
  });
})();
