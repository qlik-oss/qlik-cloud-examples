const fs = require('fs');
const yargs = require('yargs');
const dotenv = require('dotenv');
const { createSdkClient } = require('./qlik-sdk-helper');
const { runTenantConfigure } = require('./tenant_configure');

(async () => {
  // Read args from .env file if it exists, otherwise from args
  let argsSource = {};
  if (fs.existsSync('.env')) {
    argsSource = dotenv.config({ path: '.env' }).parsed;
  } else {
    argsSource = yargs(process.argv.slice(2))
      .usage('Configure a tenant\n\nUsage: $0 [options]')
      .help('help').alias('help', 'h')
      .describe({
        clientId: 'OAuth Client ID',
        clientSecret: 'OAuth Client Secret',
        targetTenantUrl: 'The hostname of the tenant, for example: tenant.region.qlikcloud.com',
        jwtIssuer: "The 'issuer' field to use in the JWT.",
        jwtKeyId: "The 'kid' field to use in the JWT.",
        jwtPrivateKeyFilePath: 'The path to the local private key file.',
        jwtPublicKeyFilePath: 'The path to the local public key file.',
      })
      .demandOption([
        'clientId',
        'clientSecret',
        'targetTenantUrl',
        'jwtIssuer',
        'jwtKeyId',
        'jwtPrivateKeyFilePath',
        'jwtPublicKeyFilePath',
      ]).argv;
  }

  const {
    targetTenantUrl,
    clientId,
    clientSecret,
    jwtIssuer,
    jwtKeyId,
    jwtPrivateKeyFilePath,
    jwtPublicKeyFilePath,
  } = argsSource;

  const sdkClient = await createSdkClient(clientId, clientSecret, targetTenantUrl);
  const jwtPrivateKey = fs.readFileSync(jwtPrivateKeyFilePath, 'utf8');
  const jwtPublicKey = fs.readFileSync(jwtPublicKeyFilePath, 'utf8');
  const jwtConfig = {
    jwtIssuer,
    jwtKeyId,
    jwtPrivateKey,
    jwtPublicKey,
  };

  const result = await runTenantConfigure(sdkClient, jwtConfig);
  //console.log(result);
})();
