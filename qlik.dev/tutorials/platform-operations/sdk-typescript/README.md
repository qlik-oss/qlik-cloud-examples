# Qlik Nodejs SDK Examples

Example js implementations of various tutorials from [Qlik Platform Operations tutorials](https://qlik.dev/tutorials#platform-operations) on [qlik.dev](http://qlik.dev).

## Prerequisites

* Nodejs 18.10.0 or higher
* Private and public key files have been created for JWT authorization as described [here](https://qlik.dev/tutorials/create-signed-tokens-for-jwt-authorization)
* OAuth clientId and clientSecret

## Setup

* `npm install`

## Running

### Dotenv

Read args from .env file if it exists, otherwise from args

### Run

* [Create a tenant](https://qlik.dev/tutorials/create-a-tenant), example usage:

```bash
node runTenantCreate.js \
  --sourceTenantUrl <HOSTNAME> \
  --registrationTenantUrl <HOSTNAME> \
  --sourceTenantAdminEmail <admin email> \
  --clientId <CLIENT_ID> \
  --clientSecret <CLIENT_SECRET>
```

* [Configure a tenant](https://qlik.dev/tutorials/configure-a-tenant), example usage:

```bash
node runTenantConfigure.js \
  --tenantUrl <HOSTNAME> \
  --clientId <CLIENT_ID> \
  --clientSecret <CLIENT_SECRET> \
  --jwtIssuer <ISSUER> \
  --jwtKeyId <KEY_ID> \
  --jwtPrivateKeyFilePath <path to privatekey.pem> \
  --jwtPublicKeyFilePath <path to publickey.cer>
```

* [Deploy a Qlik Sense application to a tenant](https://qlik.dev/tutorials/deploy-a-qlik-sense-application-to-a-tenant), example usage:

```bash
node runTenantDeploy.js \
  --sourceTenantUrl <HOSTNAME> \
  --sourceTenantApiKey <API Key> \
  --sourceAppId <APP ID> \
  --targetTenantUrl <HOSTNAME> \
  --targetManagedSpaceId <Space Id>
  --clientId <CLIENT_ID> \
  --clientSecret <CLIENT_SECRET> \
  --jwtIssuer <ISSUER> \
  --jwtKeyId <KEY_ID> \
  --jwtPrivateKeyFilePath <path to privatekey.pem> \
  --jwtPublicKeyFilePath <path to publickey.cer>
```
