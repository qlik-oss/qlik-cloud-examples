const { AuthType, default: Qlik, Auth } = require('@qlik/sdk');
const { default: generateSignedToken } = require('@qlik/sdk/generateSignedToken');

const createSdkClient = async (oauthClientId, oauthClientSecret, tenantHostname) => {
  const oauthQlik = new Qlik({
    authType: AuthType.OAuth2,
    host: tenantHostname,
    clientId: oauthClientId,
    clientSecret: oauthClientSecret,
  });
  const authProps = await oauthQlik.auth.authorize();

  return new Qlik({
    host: tenantHostname,
    authType: AuthType.APIKey,
    apiKey: authProps.access_token,
  });
};

async function getTempUserJwtHeaders(host, {
  jwtIssuer,
  jwtKeyId,
  jwtPrivateKey,
}) {
  const parseCookie = (str) => str
    .split(';')
    .map((v) => v.split('='))
    .reduce((acc, v) => {
      if (v.length > 1) {
        const key = v[0].split(',').slice(-1)[0].trim();
        acc[decodeURIComponent(key)] = decodeURIComponent(v[1].trim());
      }
      return acc;
    }, {});

  const claims = {
    sub: 'temp_user',
    subType: 'user',
    name: 'temp_user',
    email: 'temp_user@jwt.io',
    email_verified: true,
    groups: ['AnalyticConsumers'],
    expiresIn: '30s',
    notBefore: '0s',
    keyid: jwtKeyId,
    issuer: jwtIssuer,
  };
  const signedToken = generateSignedToken(
    claims,
    jwtPrivateKey,
  );
  const jwtAuth = new Auth({
    authType: AuthType.JWTAuth,
    fetchToken: () => Promise.resolve(signedToken),
    host,
    webIntegrationId: 'tests',
  });
  const resp = await jwtAuth.getSessionCookie();
  const fetchedCookies = parseCookie(resp.headers.get('set-cookie'));

  return {
    cookie: `eas.sid=${fetchedCookies['eas.sid']}; eas.sid.sig=${fetchedCookies['eas.sid.sig']}`,
    csrfToken: fetchedCookies._csrfToken,
  };
}

async function getJwtFetch(host, jwtConfig) {
  const headers = await getTempUserJwtHeaders(host, jwtConfig);
  return (path, options) => fetch(
    `https://${host}/${path}`,
    { ...options, headers },
  );
}

module.exports = { createSdkClient, getTempUserJwtHeaders, getJwtFetch };
